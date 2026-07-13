import { describe, expect, it } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import { createRng, deriveRunSeed, type Rng } from '../src/engine/rng';
import { createRunState, pauseRun, startRun, type RunState } from '../src/gameplay/runState';
import { offerCards } from '../src/gameplay/upgrades';
import { UpgradeSystem } from '../src/systems/UpgradeSystem';
import type { UpgradeDefinition } from '../src/systems/types';

const damageUpgrade: UpgradeDefinition = {
  id: 'damage-up',
  name: 'Damage Up',
  rarity: 'common',
  target: 'weapon',
  description: 'Increase damage for this run.',
  maxStacks: 20_000,
  effects: [{ stat: 'damage', op: 'add', value: 2 }],
};

const speedUpgrade: UpgradeDefinition = {
  id: 'speed-up',
  name: 'Speed Up',
  rarity: 'uncommon',
  target: 'player',
  description: 'Increase movement speed for this run.',
  maxStacks: 1,
  effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.1 }],
};

function createFirstRng(onWeighted?: () => void): Rng {
  return {
    next: () => 0,
    int: (minInclusive) => minInclusive,
    pick: (items) => {
      const first = items[0];
      if (first === undefined) {
        throw new Error('test RNG requires an item');
      }
      return first;
    },
    weighted: (entries) => {
      onWeighted?.();
      const first = entries[0];
      if (first === undefined) {
        throw new Error('test RNG requires a weighted entry');
      }
      return first.item;
    },
  };
}

function createActiveRun(seed = 1): RunState {
  const runState = createRunState({ seed, characterId: 'starter', arenaId: 'arena' });
  startRun(runState);
  return runState;
}

function createSystem(options?: {
  runState?: RunState;
  bus?: EventBus;
  definitions?: readonly UpgradeDefinition[];
  rng?: Rng;
  offerCount?: number;
}): { system: UpgradeSystem; runState: RunState; bus: EventBus } {
  const runState = options?.runState ?? createActiveRun();
  const bus = options?.bus ?? createEventBus();
  const system = new UpgradeSystem({
    runState,
    bus,
    definitions: options?.definitions ?? [damageUpgrade, speedUpgrade],
    rng: options?.rng ?? createFirstRng(),
    offerCount: options?.offerCount ?? 1,
  });
  return { system, runState, bus };
}

describe('UpgradeSystem RNG ownership', () => {
  it('keeps upgrade offers independent from spawn-stream consumption', () => {
    const seed = 1234;
    const spawnRng = createRng(seed);
    Array.from({ length: 100 }, () => spawnRng.next());

    const first = offerCards(
      [damageUpgrade, speedUpgrade],
      {},
      createRng(deriveRunSeed(seed, 'upgrades')),
      2,
    ).map((definition) => definition.id);
    const second = offerCards(
      [damageUpgrade, speedUpgrade],
      {},
      createRng(deriveRunSeed(seed, 'upgrades')),
      2,
    ).map((definition) => definition.id);

    expect(first).toEqual(second);
  });

  it('reuses one injected RNG instance across sequential offers', () => {
    let weightedCalls = 0;
    const { system, bus } = createSystem({
      definitions: [damageUpgrade],
      rng: createFirstRng(() => {
        weightedCalls += 1;
      }),
    });

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.chooseCard('damage-up')).toBe(true);

    expect(weightedCalls).toBe(2);
  });
});

describe('UpgradeSystem queue and offers', () => {
  it('pauses before exposing one offer for one level', () => {
    const { system, runState, bus } = createSystem();
    let stateWhenOffered: string | undefined;
    let reasonWhenOffered: string | null | undefined;
    let offeredChoices: string[] = [];
    bus.on('card:offered', ({ choices }) => {
      stateWhenOffered = runState.status;
      reasonWhenOffered = runState.pauseReason;
      offeredChoices = choices;
    });

    bus.emit('level:up', { level: 2 });

    expect(system.pendingLevel).toBe(2);
    expect(system.pendingCount).toBe(1);
    expect(system.currentOffer.map((definition) => definition.id)).toEqual(offeredChoices);
    expect(stateWhenOffered).toBe('paused');
    expect(reasonWhenOffered).toBe('levelUp');
  });

  it('preserves FIFO levels and waits for each prior choice', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    const offered: string[][] = [];
    bus.on('card:offered', ({ choices }) => offered.push(choices));

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    bus.emit('level:up', { level: 4 });

    expect(system.pendingLevel).toBe(2);
    expect(system.pendingCount).toBe(3);
    expect(offered).toHaveLength(1);

    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.pendingLevel).toBe(3);
    expect(system.pendingCount).toBe(2);
    expect(offered).toHaveLength(2);
    expect(runState.status).toBe('paused');

    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.pendingLevel).toBe(4);
    expect(offered).toHaveLength(3);
    expect(runState.status).toBe('paused');

    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.pendingLevel).toBeUndefined();
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
    expect(runState.upgradeStacks['damage-up']).toBe(3);
  });

  it('drains empty eligible levels without offers or deadlock', () => {
    const { system, runState, bus } = createSystem({ definitions: [] });
    let offeredCount = 0;
    bus.on('card:offered', () => {
      offeredCount += 1;
    });

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    bus.emit('level:up', { level: 4 });

    expect(offeredCount).toBe(0);
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(runState.status).toBe('active');
    expect(runState.pauseReason).toBeNull();
  });

  it('iteratively drains a large queue after the pool becomes exhausted', () => {
    const oneStack = { ...damageUpgrade, maxStacks: 1 };
    const { system, runState, bus } = createSystem({ definitions: [oneStack] });

    bus.emit('level:up', { level: 2 });
    for (let level = 3; level <= 10_002; level += 1) {
      bus.emit('level:up', { level });
    }

    expect(system.pendingCount).toBe(10_001);
    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
  });
});

describe('UpgradeSystem choice handling and ordering', () => {
  it('accepts only an ID in the active offer and applies before card:chosen', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    let resolvedDamageWhenChosen = 0;
    bus.on('card:chosen', () => {
      resolvedDamageWhenChosen = runState.stats.resolve('damage', 10);
    });
    bus.emit('level:up', { level: 2 });

    expect(system.chooseCard('unknown')).toBe(false);
    expect(system.currentOffer.map((definition) => definition.id)).toEqual(['damage-up']);
    expect(runState.upgradeStacks).toEqual({});

    expect(system.chooseCard('damage-up')).toBe(true);
    expect(resolvedDamageWhenChosen).toBe(12);
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard('damage-up')).toBe(false);
  });

  it('rejects stale IDs from a prior offer', () => {
    const firstOnly = { ...damageUpgrade, maxStacks: 1 };
    const { system, bus } = createSystem({ definitions: [firstOnly, speedUpgrade] });
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });

    expect(system.currentOffer[0]?.id).toBe('damage-up');
    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.currentOffer[0]?.id).toBe('speed-up');
    expect(system.chooseCard('damage-up')).toBe(false);
    expect(system.currentOffer[0]?.id).toBe('speed-up');
  });

  it('keeps the active offer when applyCard fails', () => {
    const oneStack = { ...damageUpgrade, maxStacks: 1 };
    const { system, runState, bus } = createSystem({ definitions: [oneStack] });
    let chosenCount = 0;
    bus.on('card:chosen', () => {
      chosenCount += 1;
    });
    bus.emit('level:up', { level: 2 });
    runState.upgradeStacks['damage-up'] = 1;

    expect(system.chooseCard('damage-up')).toBe(false);
    expect(system.currentOffer[0]?.id).toBe('damage-up');
    expect(system.pendingCount).toBe(1);
    expect(chosenCount).toBe(0);
  });

  it('orders chosen before the next offer and final resume', () => {
    const { system, bus } = createSystem({ definitions: [damageUpgrade] });
    const events: string[] = [];
    bus.on('card:offered', () => events.push('offered'));
    bus.on('card:chosen', () => events.push('chosen'));
    bus.on('run:resumed', () => events.push('resumed'));
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });

    expect(system.chooseCard('damage-up')).toBe(true);
    expect(system.chooseCard('damage-up')).toBe(true);

    expect(events).toEqual(['offered', 'chosen', 'offered', 'chosen', 'resumed']);
  });

  it('handles synchronous enqueue and choice during card:offered without extra draws', () => {
    let weightedCalls = 0;
    const { system, runState, bus } = createSystem({
      definitions: [damageUpgrade],
      rng: createFirstRng(() => {
        weightedCalls += 1;
      }),
    });
    const events: string[] = [];
    const offeredChoiceResults: boolean[] = [];
    const duplicateChoiceResults: boolean[] = [];
    let enqueuedDuringOffer = false;
    bus.on('card:offered', ({ choices }) => {
      events.push('offered');
      if (!enqueuedDuringOffer) {
        enqueuedDuringOffer = true;
        bus.emit('level:up', { level: 3 });
      }
      offeredChoiceResults.push(system.chooseCard(choices[0] ?? ''));
    });
    bus.on('card:chosen', () => {
      events.push('chosen');
      duplicateChoiceResults.push(system.chooseCard('damage-up'));
    });

    bus.emit('level:up', { level: 2 });

    expect(events).toEqual(['offered', 'chosen', 'offered', 'chosen']);
    expect(offeredChoiceResults).toEqual([true, true]);
    expect(duplicateChoiceResults).toEqual([false, false]);
    expect(weightedCalls).toBe(2);
    expect(runState.upgradeStacks['damage-up']).toBe(2);
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
  });

  it('emits nothing and preserves pause state for invalid choices', () => {
    const { system, runState, bus } = createSystem();
    let chosenCount = 0;
    bus.on('card:chosen', () => {
      chosenCount += 1;
    });
    bus.emit('level:up', { level: 2 });

    expect(system.chooseCard('not-offered')).toBe(false);
    expect(chosenCount).toBe(0);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('returns definition and effect snapshots without exposing the active offer', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.emit('level:up', { level: 2 });

    const exposed = system.currentOffer as UpgradeDefinition[];
    exposed[0]!.id = 'tampered';
    exposed[0]!.effects[0]!.value = 999;

    expect(system.currentOffer[0]?.id).toBe('damage-up');
    expect(system.currentOffer[0]?.effects[0]?.value).toBe(2);
    expect(system.chooseCard('damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.stats.resolve('damage', 10)).toBe(12);
  });
});

describe('UpgradeSystem pause and lifecycle isolation', () => {
  it('does not clear an unrelated manual pause', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    pauseRun(runState, bus, 'manual');
    const { system } = createSystem({ runState, bus, definitions: [damageUpgrade] });

    bus.emit('level:up', { level: 2 });
    expect(system.chooseCard('damage-up')).toBe(true);

    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('manual');
  });

  it('does not release a level-up pause acquired by another system', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const owner = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;

    observer.destroy();

    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
    expect(owner.currentOffer[0]?.id).toBe('damage-up');
    expect(owner.pendingCount).toBe(1);
  });

  it('lets only one simultaneously subscribed system coordinate each level-up', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const second = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;

    bus.emit('level:up', { level: 2 });

    expect(first.pendingCount).toBe(1);
    expect(first.currentOffer[0]?.id).toBe('damage-up');
    expect(second.pendingCount).toBe(0);
    expect(second.currentOffer).toEqual([]);
    expect(first.chooseCard('damage-up')).toBe(true);
    expect(runState.status).toBe('active');
    expect(second.pendingCount).toBe(0);
    expect(second.currentOffer).toEqual([]);

    first.destroy();
    bus.emit('level:up', { level: 3 });

    expect(second.pendingCount).toBe(1);
    expect(second.currentOffer[0]?.id).toBe('damage-up');
    expect(second.chooseCard('damage-up')).toBe(true);
    expect(runState.status).toBe('active');
    expect(runState.upgradeStacks['damage-up']).toBe(2);
  });

  it('destroys idempotently, clears state, and rejects later commands and events', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.emit('level:up', { level: 2 });

    system.destroy();
    system.destroy();
    bus.emit('level:up', { level: 3 });

    expect(system.pendingCount).toBe(0);
    expect(system.pendingLevel).toBeUndefined();
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard('damage-up')).toBe(false);
    expect(runState.status).toBe('active');
  });

  it('supports a fresh system after restart without duplicate subscriptions', () => {
    const bus = createEventBus();
    const firstRun = createActiveRun(1);
    const first = createSystem({ runState: firstRun, bus, definitions: [damageUpgrade] }).system;
    first.destroy();

    const secondRun = createActiveRun(2);
    const second = createSystem({ runState: secondRun, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });

    expect(first.pendingCount).toBe(0);
    expect(first.currentOffer).toEqual([]);
    expect(second.pendingCount).toBe(1);
    expect(second.currentOffer[0]?.id).toBe('damage-up');
  });

  it('does not offer if destruction occurs during pause notification', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    let system: UpgradeSystem | undefined;
    let offeredCount = 0;
    bus.on('run:paused', () => system?.destroy());
    bus.on('card:offered', () => {
      offeredCount += 1;
    });
    system = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;

    bus.emit('level:up', { level: 2 });

    expect(offeredCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
  });

  it('clears safely when destroyed during card:offered', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    let chosenCount = 0;
    bus.on('card:offered', () => system.destroy());
    bus.on('card:chosen', () => {
      chosenCount += 1;
    });

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });

    expect(chosenCount).toBe(0);
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard('damage-up')).toBe(false);
    expect(runState.status).toBe('active');
  });

  it('applies once and clears safely when destroyed during card:chosen', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.on('card:chosen', () => system.destroy());
    bus.emit('level:up', { level: 2 });

    expect(system.chooseCard('damage-up')).toBe(true);

    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.stats.resolve('damage', 10)).toBe(12);
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard('damage-up')).toBe(false);
    expect(runState.status).toBe('active');
  });
});
