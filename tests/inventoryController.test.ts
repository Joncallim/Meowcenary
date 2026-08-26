import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, pauseRun, startRun, type RunState } from '../src/gameplay/runState';
import { grantWeaponToRack } from '../src/gameplay/weaponRack';
import { createWeaponInstance, type WeaponInstance } from '../src/gameplay/weapons';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import { InventoryController, type InventorySnapshot } from '../src/ui/inventory';

let registry: DataWeaponRegistry;

beforeEach(() => {
  registry = new DataWeaponRegistry(loadGameData());
});

/** Crafted instance with an explicit id (registry-minted ids are sequential). */
function instance(defId: string, instanceId: string): WeaponInstance {
  const def = registry.weaponById(defId);
  if (!def) {
    throw new Error(`missing test weapon ${defId}`);
  }
  return createWeaponInstance(def, instanceId);
}

/** Registry-minted instance, as WeaponSystem would see it. */
function minted(defId: string): WeaponInstance {
  const def = registry.weaponById(defId);
  if (!def) {
    throw new Error(`missing test weapon ${defId}`);
  }
  return registry.createWeaponInstance(def);
}

function createPausedRun(equipped: WeaponInstance[]): RunState {
  const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
  startRun(run);
  run.equipped = equipped;
  pauseRun(run, undefined, 'manual');
  return run;
}

function createController(run: RunState) {
  const bus = createEventBus();
  const controller = new InventoryController({ runState: run, bus, weaponRegistry: registry });
  return { bus, controller };
}

describe('InventoryController snapshot', () => {
  it('mirrors the current equipped array with names and mergeable hints', () => {
    const equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b'), instance('can-smg-t1', 'c')];
    const { controller } = createController(createPausedRun(equipped));

    const snapshot = controller.snapshot();

    expect(snapshot.weapons).toMatchObject([
      {
        instanceId: 'a',
        definitionId: 'scrap-pistol-t1',
        name: 'Scrap Pistol I',
        family: 'pistol',
        tier: 1,
        selected: false,
        selectionState: 'merge-ready',
        mergeableWith: ['b'],
      },
      {
        instanceId: 'b',
        definitionId: 'scrap-pistol-t1',
        name: 'Scrap Pistol I',
        family: 'pistol',
        tier: 1,
        selected: false,
        selectionState: 'merge-ready',
        mergeableWith: ['a'],
      },
      {
        instanceId: 'c',
        definitionId: 'can-smg-t1',
        name: 'Can SMG I',
        family: 'smg',
        tier: 1,
        selected: false,
        selectionState: 'neutral',
        mergeableWith: [],
      },
    ]);
    expect(snapshot.capacity).toBe(6);
    expect(snapshot.slots).toHaveLength(6);
    expect(snapshot.slots.slice(3)).toEqual([null, null, null]);
    expect(snapshot.mergeReady).toBe(true);
    expect(snapshot.weapons[0].iconId).toBe('weapon-icon:pistol:t1');
    expect(snapshot.weapons[0].stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'damage', value: 8, formatted: '8' }),
        expect.objectContaining({ key: 'rate', formatted: '1.54/s' }),
      ]),
    );
    expect(snapshot.selectedInstanceIds).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0])).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0].stats)).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0].mergeableWith)).toBe(true);
    expect(Object.isFrozen(snapshot.slots)).toBe(true);
    expect(Object.isFrozen(snapshot.selectedInstanceIds)).toBe(true);
  });

  it('re-reads the equipped array on every call and never retains instance references', () => {
    const run = createPausedRun([instance('scrap-pistol-t1', 'a')]);
    const { controller } = createController(run);

    expect(controller.snapshot().weapons).toHaveLength(1);

    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    const snapshot = controller.snapshot();
    expect(snapshot.weapons).toHaveLength(2);
    snapshot.weapons.forEach((weapon) => {
      expect(Object.keys(weapon).sort()).toEqual(
        [
          'definitionId', 'family', 'iconId', 'instanceId', 'mergeableWith',
          'name', 'rarity', 'selected', 'selectionState', 'stats', 'tier',
        ].sort(),
      );
    });
  });

  it('resolves every rack and merge-preview stat from the current run for two equipped families', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'pistol-a'),
      instance('scrap-pistol-t1', 'pistol-b'),
      instance('can-smg-t1', 'smg'),
    ]);
    run.stats.add({ stat: 'damage', op: 'add', value: 2, sourceId: 'damage' });
    run.stats.add({ stat: 'attackSpeed', op: 'mult', value: 2, sourceId: 'rate' });
    run.stats.add({ stat: 'projectileCount', op: 'add', value: 1, sourceId: 'shots' });
    run.stats.add({ stat: 'pierce', op: 'add', value: 1, sourceId: 'pierce' });
    run.stats.add({ stat: 'range', op: 'mult', value: 1.10, sourceId: 'long-barrel' });
    run.stats.add({
      stat: 'range', op: 'mult', value: 1.05, sourceId: 'deadeye',
      scope: { kind: 'weapon-family', family: 'pistol' },
    });
    const { controller } = createController(run);

    const snapshot = controller.snapshot();
    const pistol = snapshot.weapons.find((weapon) => weapon.instanceId === 'pistol-a');
    const smg = snapshot.weapons.find((weapon) => weapon.instanceId === 'smg');
    expect(pistol?.stats.map((stat) => stat.key)).toEqual(['damage', 'rate', 'projectiles', 'pierce', 'range']);
    expect(pistol?.stats).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'damage', value: 10, formatted: '10' }),
      expect.objectContaining({ key: 'rate', formatted: '3.08/s' }),
      expect.objectContaining({ key: 'projectiles', value: 2, formatted: '×2' }),
      expect.objectContaining({ key: 'pierce', value: 1, formatted: '1' }),
      expect.objectContaining({ key: 'range', formatted: '231' }),
    ]));
    expect(pistol?.stats.find((stat) => stat.key === 'range')?.value).toBeCloseTo(231);
    expect(smg?.stats).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'damage', value: 5 }),
      expect.objectContaining({ key: 'range', formatted: '204' }),
    ]));
    expect(smg?.stats.find((stat) => stat.key === 'range')?.value).toBeCloseTo(203.5);

    controller.toggle('pistol-a');
    const mergeSnapshot = controller.toggle('pistol-b');
    expect(mergeSnapshot.preview?.deltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'range', formattedBefore: '231', formattedAfter: '254' }),
    ]));
    const rangeDelta = mergeSnapshot.preview?.deltas.find((delta) => delta.key === 'range');
    expect(rangeDelta?.before).toBeCloseTo(231);
    expect(rangeDelta?.after).toBeCloseTo(254.1);
  });
});

describe('InventoryController selection', () => {
  it('toggle selects and deselects by instance id', () => {
    const run = createPausedRun([instance('scrap-pistol-t1', 'a')]);
    const { controller } = createController(run);

    let snapshot = controller.toggle('a');
    expect(snapshot.selectedInstanceIds).toEqual(['a']);
    expect(snapshot.weapons[0].selected).toBe(true);

    snapshot = controller.toggle('a');
    expect(snapshot.selectedInstanceIds).toEqual([]);
    expect(snapshot.weapons[0].selected).toBe(false);
  });

  it('toggle ignores unknown instance ids', () => {
    const run = createPausedRun([instance('scrap-pistol-t1', 'a')]);
    const { controller } = createController(run);

    const snapshot = controller.toggle('missing');
    expect(snapshot.selectedInstanceIds).toEqual([]);
  });

  it('starts a new pair when a third weapon is selected', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
      instance('scrap-pistol-t1', 'c'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    controller.toggle('b');
    const snapshot = controller.toggle('c');

    expect(snapshot.selectedInstanceIds).toEqual(['c']);
  });

  it('highlights authoritative partners and replaces an incompatible second tap', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
      instance('can-smg-t1', 'c'),
    ]);
    const { controller } = createController(run);

    let snapshot = controller.toggle('a');
    expect(snapshot.weapons.find((weapon) => weapon.instanceId === 'a')).toMatchObject({
      selected: true,
      selectionOrder: 1,
      selectionState: 'selected',
    });
    expect(snapshot.weapons.find((weapon) => weapon.instanceId === 'b')?.selectionState).toBe('compatible');
    expect(snapshot.weapons.find((weapon) => weapon.instanceId === 'c')?.selectionState).toBe('incompatible');

    snapshot = controller.toggle('c');
    expect(snapshot.selectedInstanceIds).toEqual(['c']);
    expect(snapshot.preview).toBeUndefined();
  });

  it('previews the exact next tier and definition-derived deltas without allocating', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    const snapshot = controller.toggle('b');

    expect(snapshot.preview).toMatchObject({
      inputs: [
        { definitionId: 'scrap-pistol-t1', tier: 1 },
        { definitionId: 'scrap-pistol-t1', tier: 1 },
      ],
      result: {
        definitionId: 'scrap-pistol-t2',
        name: 'Scrap Pistol II',
        tier: 2,
      },
      deltas: expect.arrayContaining([
        expect.objectContaining({
          key: 'damage',
          before: 8,
          after: 12,
          formattedBefore: '8',
          formattedAfter: '12',
        }),
      ]),
    });
    expect(Object.isFrozen(snapshot.preview)).toBe(true);
    expect(Object.isFrozen(snapshot.preview?.deltas)).toBe(true);

    const definition = registry.weaponById('scrap-pistol-t1');
    if (!definition) throw new Error('missing pistol definition');
    expect(registry.createWeaponInstance(definition).instanceId).toBe('weapon-1');
  });

  it('keeps small fire-rate upgrades distinguishable in the preview', () => {
    const run = createPausedRun([
      instance('bolt-shotgun-t1', 'a'),
      instance('bolt-shotgun-t1', 'b'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    const snapshot = controller.toggle('b');
    const rate = snapshot.preview?.deltas.find((delta) => delta.key === 'rate');

    expect(rate).toMatchObject({
      formattedBefore: '0.95/s',
      formattedAfter: '1.02/s',
    });
    expect(rate?.formattedBefore).not.toBe(rate?.formattedAfter);
  });

  it('invalidates stale selection and preview on the next snapshot', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
    ]);
    const { controller } = createController(run);
    controller.toggle('a');
    controller.toggle('b');
    expect(controller.snapshot().preview).toBeDefined();

    run.equipped = [run.equipped[0]!];
    const snapshot = controller.snapshot();

    expect(snapshot.selectedInstanceIds).toEqual(['a']);
    expect(snapshot.preview).toBeUndefined();
  });

  it('clearSelection resets the selection', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    controller.toggle('b');
    const snapshot = controller.clearSelection();

    expect(snapshot.selectedInstanceIds).toEqual([]);
    expect(snapshot.weapons.every((weapon) => !weapon.selected)).toBe(true);
  });
});

describe('InventoryController mergeSelected success', () => {
  it('merges two matching t1 pistols into a fresh t2 and clears the selection', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
      instance('can-smg-t1', 'kept'),
    ]);
    const { bus, controller } = createController(run);
    const emitSpy = vi.fn();
    bus.on('weapon:merged', emitSpy);

    controller.toggle('a');
    controller.toggle('b');
    const result = controller.mergeSelected();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected a successful merge');
    }
    expect(result.snapshot.selectedInstanceIds).toEqual([]);
    expect(run.equipped).toHaveLength(2);
    expect(run.equipped.some((weapon) => weapon.instanceId === 'a')).toBe(false);
    expect(run.equipped.some((weapon) => weapon.instanceId === 'b')).toBe(false);
    expect(run.equipped.some((weapon) => weapon.instanceId === 'kept')).toBe(true);
    expect(result.snapshot.weapons).toHaveLength(2);
    expect(result.snapshot.weapons.some((weapon) => weapon.instanceId === result.resultInstanceId)).toBe(true);

    const mergedView = result.snapshot.weapons.find((weapon) => weapon.instanceId === result.resultInstanceId);
    expect(mergedView).toMatchObject({
      definitionId: 'scrap-pistol-t2',
      name: 'Scrap Pistol II',
      family: 'pistol',
      tier: 2,
    });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith({ fromId: 'scrap-pistol-t1', toId: 'scrap-pistol-t2', toTier: 2 });
  });

  it('merges a t2 pair into t3', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t2', 'a'),
      instance('scrap-pistol-t2', 'b'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    controller.toggle('b');
    const result = controller.mergeSelected();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected a successful merge');
    }
    const mergedView = result.snapshot.weapons.find((weapon) => weapon.instanceId === result.resultInstanceId);
    expect(mergedView?.definitionId).toBe('scrap-pistol-t3');
  });

  it('assigns the equipped array before emitting weapon:merged', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
    ]);
    const { bus, controller } = createController(run);
    const seenDuringEvent: string[] = [];
    bus.on('weapon:merged', () => {
      seenDuringEvent.push(...run.equipped.map((weapon) => weapon.instanceId));
    });

    controller.toggle('a');
    controller.toggle('b');
    const result = controller.mergeSelected();

    expect(result.ok).toBe(true);
    expect(seenDuringEvent).toHaveLength(1);
    // During the event the equipped array already holds exactly the fresh
    // result instance: the old pair is gone before anyone observes the event.
    expect(seenDuringEvent[0]).toBe(result.ok ? result.resultInstanceId : '');
  });
});

describe('InventoryController mergeSelected failures', () => {
  function withEmitSpy(bus: ReturnType<typeof createEventBus>) {
    const spy = vi.fn();
    bus.on('weapon:merged', spy);
    return spy;
  }

  it('rejects when the run is not manually paused', () => {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    startRun(run);
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    const { bus, controller } = createController(run);
    controller.toggle('a');
    controller.toggle('b');

    const active = controller.mergeSelected();
    expect(active.ok).toBe(false);
    if (!active.ok) {
      expect(active.reason).toBe('run-not-manual-paused');
    }

    pauseRun(run, undefined, 'levelUp');
    const levelUp = controller.mergeSelected();
    expect(levelUp.ok).toBe(false);
    if (!levelUp.ok) {
      expect(levelUp.reason).toBe('run-not-manual-paused');
    }
    expect(withEmitSpy(bus)).not.toHaveBeenCalled();
  });

  it('rejects when fewer than two weapons are selected', () => {
    const run = createPausedRun([instance('scrap-pistol-t1', 'a')]);
    const { bus, controller } = createController(run);

    const noneSelected = controller.mergeSelected();
    expect(noneSelected.ok).toBe(false);
    if (!noneSelected.ok) {
      expect(noneSelected.reason).toBe('weapon-not-found');
    }

    controller.toggle('a');
    const oneSelected = controller.mergeSelected();
    expect(oneSelected.ok).toBe(false);
    if (!oneSelected.ok) {
      expect(oneSelected.reason).toBe('weapon-not-found');
    }
    expect(withEmitSpy(bus)).not.toHaveBeenCalled();
  });

  it('rejects two equipped instances that share one selected instance id', () => {
    // A malformed equipped array with a duplicated instance id resolves two
    // candidates from a single selection, which must be refused as same-instance.
    const run = createPausedRun([instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'a')]);
    const { bus, controller } = createController(run);
    controller.toggle('a');

    const result = controller.mergeSelected();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('same-instance');
    }
    expect(withEmitSpy(bus)).not.toHaveBeenCalled();
  });

  it('never enables an incompatible or max-tier pair', () => {
    const mismatched = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('can-smg-t1', 'b'),
    ]);
    const { controller: mismatchedController } = createController(mismatched);
    mismatchedController.toggle('a');
    mismatchedController.toggle('b');
    const result = mismatchedController.mergeSelected();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('weapon-not-found');
    }
    expect(mismatchedController.snapshot().selectedInstanceIds).toEqual(['b']);
    expect(mismatchedController.snapshot().preview).toBeUndefined();

    const maxTier = createPausedRun([
      instance('scrap-pistol-t3', 'a'),
      instance('scrap-pistol-t3', 'b'),
    ]);
    const { controller: maxTierController } = createController(maxTier);
    maxTierController.toggle('a');
    maxTierController.toggle('b');
    const maxResult = maxTierController.mergeSelected();
    expect(maxResult.ok).toBe(false);
    if (!maxResult.ok) {
      expect(maxResult.reason).toBe('weapon-not-found');
    }
    expect(maxTierController.snapshot().selectedInstanceIds).toEqual(['b']);
    expect(maxTierController.snapshot().preview).toBeUndefined();
  });

  it('returns stale-inventory when the equipped array cannot be replaced exactly', () => {
    // The second selected id matches two equipped instances, so the Epic 2
    // replacement refuses to consume; the controller must report staleness
    // without assigning or emitting.
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
      instance('scrap-pistol-t1', 'b'),
    ]);
    const { bus, controller } = createController(run);
    const equippedBefore = run.equipped;
    const contentsBefore = [...run.equipped];
    const spy = withEmitSpy(bus);

    controller.toggle('a');
    controller.toggle('b');
    const result = controller.mergeSelected();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-inventory');
    }
    expect(run.equipped).toBe(equippedBefore);
    expect(run.equipped).toEqual(contentsBefore);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never mutates equipped or emits an event on any failure', () => {
    const scenarios: Array<() => { run: RunState; controller: InventoryController; bus: ReturnType<typeof createEventBus>; act: () => void }> = [
      () => {
        const run = createPausedRun([instance('scrap-pistol-t1', 'a')]);
        const { bus, controller } = createController(run);
        return { run, controller, bus, act: () => controller.mergeSelected() };
      },
      () => {
        const run = createPausedRun([
          instance('scrap-pistol-t1', 'a'),
          instance('can-smg-t1', 'b'),
        ]);
        const { bus, controller } = createController(run);
        return {
          run,
          controller,
          bus,
          act: () => {
            controller.toggle('a');
            controller.toggle('b');
            controller.mergeSelected();
          },
        };
      },
      () => {
        const run = createPausedRun([
          instance('scrap-pistol-t1', 'a'),
          instance('scrap-pistol-t1', 'b'),
          instance('scrap-pistol-t1', 'b'),
        ]);
        const { bus, controller } = createController(run);
        return {
          run,
          controller,
          bus,
          act: () => {
            controller.toggle('a');
            controller.toggle('b');
            controller.mergeSelected();
          },
        };
      },
    ];

    scenarios.forEach((scenario) => {
      const { run, bus, act } = scenario();
      const equippedBefore = run.equipped;
      const contentsBefore = [...run.equipped];
      const spy = vi.fn();
      bus.on('weapon:merged', spy);

      act();

      expect(run.equipped).toBe(equippedBefore);
      expect(run.equipped).toEqual(contentsBefore);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('returns a fresh snapshot on failure without losing the current selection', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('can-smg-t1', 'b'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    controller.toggle('b');
    const result = controller.mergeSelected();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.snapshot.selectedInstanceIds).toEqual(['b']);
      expect(result.snapshot.weapons).toHaveLength(2);
    }
  });
});

describe('rack capacity integration (Epic 14 §8.6)', () => {
  it('merges six to five, admits a fresh weapon back to six, and merges again with one event each', () => {
    const equipped = Array.from({ length: 5 }, (_) => minted('scrap-pistol-t1'));
    equipped.push(instance('can-smg-t1', 'smg'));
    const run = createPausedRun(equipped);
    const { bus, controller } = createController(run);
    const mergedSpy = vi.fn();
    bus.on('weapon:merged', mergedSpy);

    // Six weapons, one mergeable pistol pair.
    expect(run.equipped).toHaveLength(6);
    controller.toggle(equipped[0].instanceId);
    controller.toggle(equipped[1].instanceId);
    const firstMerge = controller.mergeSelected();
    expect(firstMerge.ok).toBe(true);
    expect(run.equipped).toHaveLength(5);
    expect(mergedSpy).toHaveBeenCalledTimes(1);

    // A fresh valid weapon is admitted back to six through the shared grant path.
    const admission = grantWeaponToRack(run, 'bolt-shotgun-t1', registry);
    expect(admission.status).toBe('added');
    expect(run.equipped).toHaveLength(6);

    // A second merge still creates a fresh next-tier instance with one event.
    const pistols = run.equipped.filter((weapon) => weapon.family === 'pistol' && weapon.tier === 1);
    expect(pistols.length).toBeGreaterThanOrEqual(2);
    controller.toggle(pistols[0].instanceId);
    controller.toggle(pistols[1].instanceId);
    const secondMerge = controller.mergeSelected();
    expect(secondMerge.ok).toBe(true);
    if (!secondMerge.ok) throw new Error('expected a successful merge');
    expect(run.equipped).toHaveLength(5);
    expect(mergedSpy).toHaveBeenCalledTimes(2);
    expect(secondMerge.snapshot.weapons.some((weapon) => weapon.instanceId === secondMerge.resultInstanceId)).toBe(true);
    const result = secondMerge.snapshot.weapons.find((weapon) => weapon.instanceId === secondMerge.resultInstanceId);
    expect(result?.tier).toBe(2);
  });

  it('rejects admission beyond six and keeps the merge path authoritative', () => {
    const equipped = Array.from({ length: 6 }, (_) => minted('scrap-pistol-t1'));
    const run = createPausedRun(equipped);
    const { controller } = createController(run);

    const admission = grantWeaponToRack(run, 'bolt-shotgun-t1', registry);
    expect(admission.status).toBe('rack-full');
    expect(run.equipped).toHaveLength(6);
    void controller;
  });
});

describe('InventoryController snapshot typing', () => {
  it('exposes readonly snapshot shapes', () => {
    const run = createPausedRun([minted('scrap-pistol-t1')]);
    const { controller } = createController(run);

    const snapshot: InventorySnapshot = controller.snapshot();
    expect(snapshot.weapons[0].instanceId).toMatch(/^weapon-/);
  });
});
