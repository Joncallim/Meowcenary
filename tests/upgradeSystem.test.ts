import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import { createRng, deriveRunSeed, type Rng } from '../src/engine/rng';
import {
  createRunState,
  pauseRun,
  resumeRun,
  startRun,
  type RunState,
} from '../src/gameplay/runState';
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
  presentation: { category: 'offense', iconArtId: 'upgrade-icon:damage-up' },
};

const speedUpgrade: UpgradeDefinition = {
  id: 'speed-up',
  name: 'Speed Up',
  rarity: 'uncommon',
  target: 'player',
  description: 'Increase movement speed for this run.',
  maxStacks: 1,
  effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.1 }],
  presentation: { category: 'mobility', iconArtId: 'upgrade-icon:speed-up' },
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
      { stacks: {}, equipped: [] },
      createRng(deriveRunSeed(seed, 'upgrades')),
      2,
    ).map((definition) => definition.id);
    const second = offerCards(
      [damageUpgrade, speedUpgrade],
      { stacks: {}, equipped: [] },
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
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);

    expect(weightedCalls).toBe(2);
  });
});

describe('UpgradeSystem queue and offers', () => {
  it('pauses before exposing one offer for one level', () => {
    const { system, runState, bus } = createSystem();
    let stateWhenOffered: string | undefined;
    let reasonWhenOffered: string | null | undefined;
    let offeredId: number | undefined;
    let offeredChoices: readonly string[] = [];
    bus.on('card:offered', ({ offerId, choices }) => {
      stateWhenOffered = runState.status;
      reasonWhenOffered = runState.pauseReason;
      offeredId = offerId;
      offeredChoices = choices;
    });

    bus.emit('level:up', { level: 2 });

    expect(system.pendingLevel).toBe(2);
    expect(system.pendingCount).toBe(1);
    expect(system.currentOfferSnapshot?.offerId).toBe(offeredId);
    expect(system.currentOffer.map((definition) => definition.id)).toEqual(offeredChoices);
    expect(stateWhenOffered).toBe('paused');
    expect(reasonWhenOffered).toBe('levelUp');
  });

  it('preserves FIFO levels and waits for each prior choice', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    const offered: string[][] = [];
    bus.on('card:offered', ({ choices }) => offered.push([...choices]));

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    bus.emit('level:up', { level: 4 });

    expect(system.pendingLevel).toBe(2);
    expect(system.pendingCount).toBe(3);
    expect(offered).toHaveLength(1);

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(system.pendingLevel).toBe(3);
    expect(system.pendingCount).toBe(2);
    expect(offered).toHaveLength(2);
    expect(runState.status).toBe('paused');

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(system.pendingLevel).toBe(4);
    expect(offered).toHaveLength(3);
    expect(runState.status).toBe('paused');

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
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
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
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

    expect(system.chooseCard(system.currentOfferId ?? -1, 'unknown')).toBe(false);
    expect(system.currentOffer.map((definition) => definition.id)).toEqual(['damage-up']);
    expect(runState.upgradeStacks).toEqual({});

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(resolvedDamageWhenChosen).toBe(12);
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
  });

  it('rejects stale IDs from a prior offer', () => {
    const firstOnly = { ...damageUpgrade, maxStacks: 1 };
    const { system, bus } = createSystem({ definitions: [firstOnly, speedUpgrade] });
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });

    expect(system.currentOffer[0]?.id).toBe('damage-up');
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(system.currentOffer[0]?.id).toBe('speed-up');
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
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

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
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

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);

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
      offeredChoiceResults.push(system.chooseCard(system.currentOfferId ?? -1, choices[0] ?? ''));
    });
    bus.on('card:chosen', () => {
      events.push('chosen');
      duplicateChoiceResults.push(system.chooseCard(system.currentOfferId ?? -1, 'damage-up'));
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

    expect(system.chooseCard(system.currentOfferId ?? -1, 'not-offered')).toBe(false);
    expect(chosenCount).toBe(0);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('returns definition and effect snapshots without exposing the active offer', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.emit('level:up', { level: 2 });

    const exposed = system.currentOffer as UpgradeDefinition[];
    exposed[0]!.id = 'tampered';
    (exposed[0]!.effects[0] as { value: number }).value = 999;

    expect(system.currentOffer[0]?.id).toBe('damage-up');
    expect(system.currentOffer[0]?.effects[0]?.value).toBe(2);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
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
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);

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
    expect(second.pendingCount).toBe(1);
    expect(second.currentOfferId).toBe(first.currentOfferId);
    expect(second.currentOffer[0]?.id).toBe('damage-up');
    expect(first.chooseCard(first.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('active');
    expect(second.pendingCount).toBe(0);
    expect(second.currentOffer).toEqual([]);

    first.destroy();
    bus.emit('level:up', { level: 3 });

    expect(second.pendingCount).toBe(1);
    expect(second.currentOffer[0]?.id).toBe('damage-up');
    expect(second.chooseCard(second.currentOfferId ?? -1, 'damage-up')).toBe(true);
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
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
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
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
    expect(runState.status).toBe('active');
  });

  it('applies once and clears safely when destroyed during card:chosen', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.on('card:chosen', () => system.destroy());
    bus.emit('level:up', { level: 2 });

    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);

    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.stats.resolve('damage', 10)).toBe(12);
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(false);
    expect(runState.status).toBe('active');
  });
});

describe('UpgradeSystem shared per-run coordination', () => {
  it('shares one queue, offer, subscription, and RNG across two and three active facades', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    let weightedCalls = 0;
    const first = createSystem({
      runState,
      bus,
      definitions: [damageUpgrade],
      rng: createFirstRng(() => {
        weightedCalls += 1;
      }),
    }).system;
    const unusedRng = createFirstRng(() => {
      throw new Error('duplicate facade RNG must not be used');
    });
    const second = createSystem({ runState, bus, definitions: [speedUpgrade], rng: unusedRng }).system;
    const third = createSystem({ runState, bus, definitions: [], rng: unusedRng }).system;

    bus.emit('level:up', { level: 2 });

    expect(weightedCalls).toBe(1);
    expect(first.pendingCount).toBe(1);
    expect(second.pendingCount).toBe(1);
    expect(third.pendingCount).toBe(1);
    expect(second.currentOfferId).toBe(first.currentOfferId);
    expect(third.currentOfferId).toBe(first.currentOfferId);
    expect(third.currentOffer[0]?.id).toBe('damage-up');
    expect(third.chooseCard(third.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.status).toBe('active');
  });

  it('preserves a manually paused shared offer when one of two facades is destroyed', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    pauseRun(runState, bus, 'manual');
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const second = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;

    bus.emit('level:up', { level: 2 });
    const offerId = second.currentOfferId;
    first.destroy();

    expect(second.pendingCount).toBe(1);
    expect(second.currentOfferId).toBe(offerId);
    expect(second.chooseCard(offerId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('manual');
  });

  it('lets a facade constructed after an offer observe and resolve the existing snapshot', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });
    const firstSnapshot = first.currentOfferSnapshot;
    const second = createSystem({
      runState,
      bus,
      definitions: [],
      rng: createFirstRng(() => {
        throw new Error('late facade RNG must not be used');
      }),
    }).system;

    expect(second.currentOfferSnapshot).toEqual(firstSnapshot);
    first.destroy();
    expect(second.chooseCard(firstSnapshot?.offerId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.status).toBe('active');
  });

  it('preserves an unresolved FIFO when the first facade is removed', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    const firstOfferId = observer.currentOfferId;

    first.destroy();

    expect(observer.pendingCount).toBe(2);
    expect(observer.chooseCard(firstOfferId ?? -1, 'damage-up')).toBe(true);
    const secondOfferId = observer.currentOfferId;
    expect(secondOfferId).toBeGreaterThan(firstOfferId ?? 0);
    expect(observer.pendingCount).toBe(1);
    expect(observer.chooseCard(secondOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(2);
    expect(runState.status).toBe('active');
  });

  it('releases shared unresolved state only when the last facade is destroyed', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const second = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const third = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });

    third.destroy();
    first.destroy();
    first.destroy();
    expect(runState.status).toBe('paused');
    expect(second.pendingCount).toBe(1);
    expect(second.currentOffer).toHaveLength(1);

    second.destroy();
    second.destroy();
    expect(runState.status).toBe('active');
    expect(second.pendingCount).toBe(0);
    expect(second.currentOffer).toEqual([]);
  });
});

describe('UpgradeSystem explicit pause lease', () => {
  it('does not suppress or release an ownerless level-up pause present before construction', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    runState.status = 'paused';
    runState.pauseReason = 'levelUp';
    const { system } = createSystem({ runState, bus, definitions: [damageUpgrade] });

    bus.emit('level:up', { level: 2 });

    expect(system.pendingCount).toBe(1);
    expect(system.currentOffer).toHaveLength(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('does not suppress or release a foreign level-up pause acquired before dispatch', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const { system } = createSystem({ runState, bus, definitions: [damageUpgrade] });
    pauseRun(runState, bus, 'levelUp');

    bus.emit('level:up', { level: 2 });

    expect(system.currentOffer).toHaveLength(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('accepts a level after an earlier third-party level listener pauses the run', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    bus.on('level:up', () => pauseRun(runState, bus, 'manual'));
    const { system } = createSystem({ runState, bus, definitions: [damageUpgrade] });

    bus.emit('level:up', { level: 2 });

    expect(system.pendingCount).toBe(1);
    expect(system.currentOffer).toHaveLength(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('manual');
  });

  it('synchronously replaces a resumed manual pause while an offer remains unresolved', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    pauseRun(runState, bus, 'manual');
    const { system } = createSystem({ runState, bus, definitions: [damageUpgrade] });
    bus.emit('level:up', { level: 2 });

    resumeRun(runState, bus, 'manual');

    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
    expect(system.currentOffer).toHaveLength(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('active');
  });

  it('reacquires a level-up pause when an offered listener resumes before a later listener', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    const laterStates: Array<{ status: string; reason: string | null; offerId?: number }> = [];
    bus.on('card:offered', () => {
      resumeRun(runState, bus, 'levelUp');
    });
    bus.on('card:offered', () => {
      laterStates.push({
        status: runState.status,
        reason: runState.pauseReason,
        offerId: system.currentOfferSnapshot?.offerId,
      });
    });

    bus.emit('level:up', { level: 2 });

    expect(laterStates).toEqual([
      { status: 'paused', reason: 'levelUp', offerId: system.currentOfferId },
    ]);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('active');
  });
});

describe('UpgradeSystem offer identity and composable delivery', () => {
  it('isolates later offered listeners from hostile choice mutation', () => {
    const { system, runState, bus } = createSystem({ offerCount: 2 });
    const immediateResults: boolean[] = [];
    const laterChoices: Array<readonly string[]> = [];
    let mutationRejected = false;
    let payloadFrozen = false;

    bus.on('card:offered', (payload) => {
      payloadFrozen = Object.isFrozen(payload) && Object.isFrozen(payload.choices);
      try {
        (payload.choices as string[]).splice(0, payload.choices.length);
      } catch {
        mutationRejected = true;
      }
      immediateResults.push(system.chooseCard(payload.offerId, payload.choices[0] ?? ''));
    });
    bus.on('card:offered', ({ choices }) => {
      laterChoices.push([...choices]);
    });

    bus.emit('level:up', { level: 2 });

    expect(mutationRejected).toBe(true);
    expect(payloadFrozen).toBe(true);
    expect(laterChoices).toEqual([['damage-up', 'speed-up']]);
    expect(immediateResults).toEqual([true]);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.status).toBe('active');
  });

  it('applies the frozen canonical definition after caller-owned data is mutated', () => {
    const callerDefinition: UpgradeDefinition = {
      ...damageUpgrade,
      effects: damageUpgrade.effects.map((effect) => ({ ...effect })),
    };
    const { system, runState, bus } = createSystem({ definitions: [callerDefinition] });
    let offeredValue: number | undefined;

    bus.on('card:offered', () => {
      offeredValue = system.currentOffer[0]?.effects[0]?.value;
      callerDefinition.id = 'tampered';
      callerDefinition.target = 'economy';
      (callerDefinition.effects[0] as { value: number }).value = 999;
    });

    bus.emit('level:up', { level: 2 });

    expect(offeredValue).toBe(2);
    expect(system.currentOffer[0]).toMatchObject({ id: 'damage-up', target: 'weapon' });
    expect(system.currentOffer[0]?.effects[0]?.value).toBe(2);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(runState.stats.resolve('damage', 10)).toBe(12);
  });

  it('rejects an old token when the same upgrade ID appears in the next offer', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    const firstOfferId = system.currentOfferId ?? -1;

    expect(system.chooseCard(firstOfferId, 'damage-up')).toBe(true);
    const secondOfferId = system.currentOfferId ?? -1;
    expect(secondOfferId).toBeGreaterThan(firstOfferId);
    expect(system.chooseCard(firstOfferId, 'damage-up')).toBe(false);
    expect(system.pendingCount).toBe(1);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(system.chooseCard(secondOfferId, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(2);
  });

  it('keeps the matching snapshot readable until every offered listener returns', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    const observations: string[] = [];
    const firstResults: boolean[] = [];
    const duplicateResults: boolean[] = [];
    bus.on('card:offered', ({ offerId, choices }) => {
      observations.push(`first:${system.currentOfferSnapshot?.offerId}:${runState.upgradeStacks['damage-up'] ?? 0}`);
      firstResults.push(system.chooseCard(offerId, choices[0] ?? ''));
      observations.push(`first-return:${runState.upgradeStacks['damage-up'] ?? 0}`);
    });
    bus.on('card:offered', ({ offerId, choices }) => {
      observations.push(`second:${system.currentOfferSnapshot?.offerId}:${runState.upgradeStacks['damage-up'] ?? 0}`);
      duplicateResults.push(system.chooseCard(offerId, choices[0] ?? ''));
    });
    bus.on('card:chosen', () => observations.push('chosen'));

    bus.emit('level:up', { level: 2 });

    expect(firstResults).toEqual([true]);
    expect(duplicateResults).toEqual([false]);
    expect(observations).toEqual(['first:1:0', 'first-return:0', 'second:1:0', 'chosen']);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
  });

  it('keeps a queued immediate command when its facade is destroyed during delivery', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const accepted: boolean[] = [];
    const observerOfferIds: Array<number | undefined> = [];
    bus.on('card:offered', ({ offerId, choices }) => {
      accepted.push(first.chooseCard(offerId, choices[0] ?? ''));
    });
    bus.on('card:offered', () => {
      first.destroy();
      observerOfferIds.push(observer.currentOfferSnapshot?.offerId);
    });

    bus.emit('level:up', { level: 2 });

    expect(accepted).toEqual([true]);
    expect(observerOfferIds).toEqual([1]);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(observer.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
  });

  it('retires the chosen level before nested chosen listeners enqueue another level', () => {
    const { system, runState, bus } = createSystem({ definitions: [damageUpgrade] });
    const offeredIds: number[] = [];
    const nestedOldCommands: boolean[] = [];
    let firstOfferId = -1;
    let nested = false;
    bus.on('card:offered', ({ offerId }) => offeredIds.push(offerId));
    bus.on('card:chosen', () => {
      if (!nested) {
        nested = true;
        bus.emit('level:up', { level: 3 });
        nestedOldCommands.push(system.chooseCard(firstOfferId, 'damage-up'));
      }
    });
    bus.emit('level:up', { level: 2 });
    firstOfferId = system.currentOfferId ?? -1;

    expect(system.chooseCard(firstOfferId, 'damage-up')).toBe(true);
    expect(offeredIds).toEqual([1, 2]);
    expect(nestedOldCommands).toEqual([false]);
    expect(system.pendingCount).toBe(1);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(offeredIds).toEqual([1, 2]);
    expect(runState.upgradeStacks['damage-up']).toBe(2);
    expect(runState.status).toBe('active');
  });
});

describe('UpgradeSystem shared lifecycle reentrancy', () => {
  it('continues through first-facade destruction during run:paused', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.on('run:paused', () => first.destroy());

    bus.emit('level:up', { level: 2 });

    expect(observer.currentOffer).toHaveLength(1);
    expect(observer.pendingCount).toBe(1);
    expect(observer.chooseCard(observer.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('active');
  });

  it('continues through first-facade destruction during card:offered', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.on('card:offered', () => first.destroy());

    bus.emit('level:up', { level: 2 });

    expect(observer.currentOffer).toHaveLength(1);
    expect(observer.chooseCard(observer.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
  });

  it('continues queued work after first-facade destruction during card:chosen', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const first = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;
    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    bus.on('card:chosen', () => first.destroy());

    expect(first.chooseCard(first.currentOfferId ?? -1, 'damage-up')).toBe(true);

    expect(observer.pendingCount).toBe(1);
    expect(observer.currentOffer).toHaveLength(1);
    expect(observer.chooseCard(observer.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(2);
    expect(runState.status).toBe('active');
  });

  it('drains empty and maxed pools once for all duplicate facades', () => {
    const emptyRun = createActiveRun();
    const emptyBus = createEventBus();
    let emptyWeightedCalls = 0;
    const empty = createSystem({
      runState: emptyRun,
      bus: emptyBus,
      definitions: [],
      rng: createFirstRng(() => {
        emptyWeightedCalls += 1;
      }),
    }).system;
    const emptyDuplicate = createSystem({ runState: emptyRun, bus: emptyBus, definitions: [] }).system;
    emptyBus.emit('level:up', { level: 2 });
    emptyBus.emit('level:up', { level: 3 });
    expect(emptyWeightedCalls).toBe(0);
    expect(empty.pendingCount).toBe(0);
    expect(emptyDuplicate.currentOffer).toEqual([]);
    expect(emptyRun.status).toBe('active');

    const maxedRun = createActiveRun();
    const maxedBus = createEventBus();
    maxedRun.upgradeStacks['damage-up'] = damageUpgrade.maxStacks;
    let maxedWeightedCalls = 0;
    const maxed = createSystem({
      runState: maxedRun,
      bus: maxedBus,
      definitions: [damageUpgrade],
      rng: createFirstRng(() => {
        maxedWeightedCalls += 1;
      }),
    }).system;
    createSystem({ runState: maxedRun, bus: maxedBus, definitions: [damageUpgrade] });
    maxedBus.emit('level:up', { level: 2 });
    expect(maxedWeightedCalls).toBe(0);
    expect(maxed.pendingCount).toBe(0);
    expect(maxed.currentOffer).toEqual([]);
    expect(maxedRun.status).toBe('active');
  });
});

describe('UpgradeSystem RNG and failure boundaries', () => {
  it('emits no late offer when the last facade is destroyed inside Rng.weighted', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    let system: UpgradeSystem | undefined;
    let offeredCount = 0;
    system = createSystem({
      runState,
      bus,
      definitions: [damageUpgrade],
      rng: createFirstRng(() => system?.destroy()),
    }).system;
    bus.on('card:offered', () => {
      offeredCount += 1;
    });

    bus.emit('level:up', { level: 2 });

    expect(offeredCount).toBe(0);
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(runState.status).toBe('active');
  });

  it('lets an observer retain an offer when the first facade is destroyed inside Rng.weighted', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    let first: UpgradeSystem | undefined;
    first = createSystem({
      runState,
      bus,
      definitions: [damageUpgrade],
      rng: createFirstRng(() => first?.destroy()),
    }).system;
    const observer = createSystem({ runState, bus, definitions: [damageUpgrade] }).system;

    bus.emit('level:up', { level: 2 });

    expect(first.currentOffer).toEqual([]);
    expect(observer.currentOffer).toHaveLength(1);
    expect(observer.chooseCard(observer.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.upgradeStacks['damage-up']).toBe(1);
  });

  it('unwinds and logs a throwing offer generation without retaining a dead pause', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    let shouldThrow = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { system } = createSystem({
      runState,
      bus,
      definitions: [damageUpgrade],
      rng: createFirstRng(() => {
        if (shouldThrow) {
          throw new Error('weighted failed');
        }
      }),
    });

    bus.emit('level:up', { level: 2 });

    expect(consoleError).toHaveBeenCalledWith(
      'EventBus listener failed for "level:up"',
      expect.objectContaining({ message: 'weighted failed' }),
    );
    expect(system.pendingCount).toBe(0);
    expect(system.currentOffer).toEqual([]);
    expect(runState.status).toBe('active');

    shouldThrow = false;
    bus.emit('level:up', { level: 3 });
    expect(system.currentOffer).toHaveLength(1);
    expect(system.chooseCard(system.currentOfferId ?? -1, 'damage-up')).toBe(true);
    expect(runState.status).toBe('active');
    consoleError.mockRestore();
  });
});
