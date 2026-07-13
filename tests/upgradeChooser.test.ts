import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { Rng } from '../src/engine/rng';
import { pauseRun, createRunState, startRun, type RunState } from '../src/gameplay/runState';
import { UpgradeSystem, type UpgradeOfferSnapshot } from '../src/systems/UpgradeSystem';
import type { UpgradeDefinition } from '../src/systems/types';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserSource,
  type UpgradeChooserView,
} from '../src/ui/upgradeChooserController';

const definitions: UpgradeDefinition[] = [
  {
    id: 'quick-paws',
    name: 'Quick Paws',
    rarity: 'common',
    target: 'player',
    description: 'Increase movement speed for this run.',
    maxStacks: 5,
    effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.08 }],
  },
  {
    id: 'hot-barrel',
    name: 'Hot Barrel',
    rarity: 'uncommon',
    target: 'weapon',
    description: 'Increase weapon fire rate for this run.',
    maxStacks: 4,
    effects: [{ stat: 'attackSpeed', op: 'mult', value: 1.12 }],
  },
  {
    id: 'extra-scrap',
    name: 'Extra Scrap',
    rarity: 'common',
    target: 'economy',
    description: 'Increase scrap gained for this run.',
    maxStacks: 3,
    effects: [{ stat: 'currencyGain', op: 'mult', value: 1.25 }],
  },
];

class FakeView implements UpgradeChooserView {
  readonly renders: Array<{ offerId: number; ids: string[] }> = [];
  readonly handlers: Array<{
    offerId: number;
    select: (offerId: number, choiceIndex: number) => boolean;
  }> = [];
  readonly enabled: boolean[] = [];
  clearCount = 0;
  destroyCount = 0;
  onRender?: (offer: UpgradeChooserOffer) => void;

  render(
    offer: UpgradeChooserOffer,
    select: (offerId: number, choiceIndex: number) => boolean,
  ): void {
    this.renders.push({
      offerId: offer.offerId,
      ids: offer.definitions.map((definition) => definition.id),
    });
    this.handlers.push({ offerId: offer.offerId, select });
    this.onRender?.(offer);
  }

  setEnabled(enabled: boolean): void {
    this.enabled.push(enabled);
  }

  clear(): void {
    this.clearCount += 1;
  }

  destroy(): void {
    this.destroyCount += 1;
  }
}

function createHarness() {
  const bus = createEventBus();
  const view = new FakeView();
  let snapshot: UpgradeOfferSnapshot | undefined;
  const chooseCard = vi.fn<(offerId: number, upgradeId: string) => boolean>(() => true);
  const source: UpgradeChooserSource = {
    get currentOfferSnapshot() {
      return snapshot;
    },
    chooseCard,
  };
  const controller = new UpgradeChooserController(bus, source, view);

  return {
    bus,
    view,
    source,
    controller,
    chooseCard,
    setSnapshot(next: UpgradeOfferSnapshot | undefined) {
      snapshot = next;
    },
  };
}

function emitOffer(
  bus: EventBus,
  offerId: number,
  offeredDefinitions: readonly UpgradeDefinition[],
): void {
  bus.emit('card:offered', {
    offerId,
    choices: offeredDefinitions.map((definition) => definition.id),
  });
}

function createActiveRun(): RunState {
  const runState = createRunState({ seed: 7, characterId: 'cat', arenaId: 'arena' });
  startRun(runState);
  return runState;
}

function createFirstRng(): Rng {
  return {
    next: () => 0,
    int: (minInclusive) => minInclusive,
    pick: (items) => {
      const item = items[0];
      if (item === undefined) {
        throw new Error('Expected an item');
      }
      return item;
    },
    weighted: (entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        throw new Error('Expected a weighted entry');
      }
      return entry.item;
    },
  };
}

describe('UpgradeChooserController rendering', () => {
  it.each([1, 2, 3])('renders an ordered offer containing %i choice(s)', (count) => {
    const harness = createHarness();
    const offered = definitions.slice(0, count);
    harness.setSnapshot({ offerId: 11, definitions: offered });

    emitOffer(harness.bus, 11, offered);

    expect(harness.view.renders).toEqual([
      { offerId: 11, ids: offered.map((definition) => definition.id) },
    ]);
    expect(harness.controller.choiceCount).toBe(count);
  });

  it('uses event order rather than snapshot storage order', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 4, definitions });
    const ordered = [definitions[2]!, definitions[0]!, definitions[1]!];

    emitOffer(harness.bus, 4, ordered);

    expect(harness.view.renders[0]?.ids).toEqual(['extra-scrap', 'quick-paws', 'hot-barrel']);
  });

  it('does not render a mismatched or already-resolved snapshot', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 2, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    harness.setSnapshot(undefined);
    emitOffer(harness.bus, 2, [definitions[0]!]);

    expect(harness.view.renders).toEqual([]);
    expect(harness.controller.currentOfferId).toBeUndefined();
  });

  it('replaces prior UI and makes its captured handler stale', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const stale = harness.view.handlers[0]!;
    harness.setSnapshot({ offerId: 2, definitions: [definitions[1]!] });
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
    expect(stale.select(stale.offerId, 0)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });
});

describe('UpgradeChooserController selection', () => {
  it('submits the captured offer token and pointer-selected upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 8, definitions: definitions.slice(0, 2) });
    emitOffer(harness.bus, 8, definitions.slice(0, 2));

    expect(harness.view.handlers[0]?.select(8, 1)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(8, 'hot-barrel');
  });

  it('maps keyboard 1, 2, and 3 and ignores other or repeated keys', () => {
    expect(['1', '2', '3'].map((key) => choiceIndexForNumberKey(key))).toEqual([0, 1, 2]);
    expect(choiceIndexForNumberKey('0')).toBeUndefined();
    expect(choiceIndexForNumberKey('4')).toBeUndefined();
    expect(choiceIndexForNumberKey('1', true)).toBeUndefined();
  });

  it.each(['1', '2', '3'])('submits keyboard %s against its visible choice', (key) => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 9, definitions });
    emitOffer(harness.bus, 9, definitions);
    const choiceIndex = choiceIndexForNumberKey(key);

    expect(choiceIndex).toBeDefined();
    expect(harness.view.handlers[0]?.select(9, choiceIndex!)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(9, definitions[choiceIndex!]!.id);
  });

  it('ignores out-of-range visible indices', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 3, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 3, [definitions[0]!]);

    expect(harness.controller.select(3, 1)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });

  it('disables immediately after acceptance and rejects duplicate submission', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 5, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 5, [definitions[0]!]);

    expect(harness.controller.select(5, 0)).toBe(true);
    expect(harness.controller.select(5, 0)).toBe(false);
    expect(harness.view.enabled).toEqual([false]);
    expect(harness.chooseCard).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected command active and usable', () => {
    const harness = createHarness();
    harness.chooseCard.mockReturnValueOnce(false).mockReturnValueOnce(true);
    harness.setSnapshot({ offerId: 6, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 6, [definitions[0]!]);

    expect(harness.controller.select(6, 0)).toBe(false);
    expect(harness.controller.currentOfferId).toBe(6);
    expect(harness.view.enabled).toEqual([false, true]);
    expect(harness.controller.select(6, 0)).toBe(true);
  });

  it('requires a new token for consecutive offers with the same upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 20, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 20, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
    harness.setSnapshot({ offerId: 21, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 21, [definitions[0]!]);

    expect(oldHandler.select(20, 0)).toBe(false);
    expect(harness.view.handlers[1]?.select(21, 0)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(21, 'quick-paws');
  });
});

describe('UpgradeChooserController reentrancy and lifecycle', () => {
  it('clears UI when another offered listener resolves synchronously', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    harness.bus.on('card:offered', () => {
      harness.setSnapshot(undefined);
      harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
    });

    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(harness.controller.currentOfferId).toBeUndefined();
  });

  it('keeps the next offer rendered when chosen delivery advances synchronously', () => {
    const harness = createHarness();
    harness.chooseCard.mockImplementation(() => {
      harness.setSnapshot(undefined);
      harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
      harness.setSnapshot({ offerId: 2, definitions: [definitions[0]!] });
      emitOffer(harness.bus, 2, [definitions[0]!]);
      return true;
    });
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.controller.select(1, 0)).toBe(true);
    expect(harness.controller.currentOfferId).toBe(2);
    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
  });

  it('is safe when destroyed during offered delivery and ignores late events', () => {
    const harness = createHarness();
    harness.view.onRender = () => harness.controller.destroy();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });

    emitOffer(harness.bus, 1, [definitions[0]!]);
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(harness.view.destroyCount).toBe(1);
    expect(harness.controller.select(1, 0)).toBe(false);
  });

  it('destroys idempotently and leaves no presentation listeners', () => {
    const harness = createHarness();
    harness.controller.destroy();
    harness.controller.destroy();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.view.destroyCount).toBe(1);
    expect(harness.view.renders).toEqual([]);
  });

  it('restarts with one fresh listener set and rejects the old visual handler', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.controller.destroy();

    const freshView = new FakeView();
    const freshController = new UpgradeChooserController(harness.bus, harness.source, freshView);
    harness.setSnapshot({ offerId: 2, definitions: [definitions[1]!] });
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(freshView.renders).toEqual([{ offerId: 2, ids: ['hot-barrel'] }]);
    expect(oldHandler.select(1, 0)).toBe(false);
    expect(freshView.handlers[0]?.select(2, 0)).toBe(true);
    freshController.destroy();
  });
});

describe('Upgrade chooser integration with UpgradeSystem', () => {
  it('applies one visible choice per pending level and resumes only after the final choice', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [definitions[0]!],
      rng: createFirstRng(),
      offerCount: 1,
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    expect(runState.status).toBe('paused');
    expect(view.handlers[0]?.select(view.handlers[0]!.offerId, 0)).toBe(true);
    expect(runState.status).toBe('paused');
    expect(view.renders.map((render) => render.offerId)).toEqual([1, 2]);
    expect(view.handlers[1]?.select(view.handlers[1]!.offerId, 0)).toBe(true);

    expect(runState.upgradeStacks['quick-paws']).toBe(2);
    expect(runState.stats.resolve('moveSpeed', 100)).toBeCloseTo(116.64);
    expect(runState.status).toBe('active');
    expect(system.pendingCount).toBe(0);
    chooser.destroy();
    system.destroy();
  });

  it('leaves a manual pause in place after a visible choice', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    pauseRun(runState, bus, 'manual');
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [definitions[0]!],
      rng: createFirstRng(),
      offerCount: 1,
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);
    bus.emit('level:up', { level: 2 });

    expect(view.handlers[0]?.select(view.handlers[0]!.offerId, 0)).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('manual');
    chooser.destroy();
    system.destroy();
  });

  it('does not render or deadlock when the eligible pool is empty', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [],
      rng: createFirstRng(),
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);

    bus.emit('level:up', { level: 2 });

    expect(view.renders).toEqual([]);
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
    chooser.destroy();
    system.destroy();
  });
});
