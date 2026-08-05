import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, pauseRun, startRun, type RunState } from '../src/gameplay/runState';
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

    expect(snapshot.weapons).toEqual([
      {
        instanceId: 'a',
        definitionId: 'scrap-pistol-t1',
        name: 'Scrap Pistol I',
        family: 'pistol',
        tier: 1,
        selected: false,
        mergeableWith: ['b'],
      },
      {
        instanceId: 'b',
        definitionId: 'scrap-pistol-t1',
        name: 'Scrap Pistol I',
        family: 'pistol',
        tier: 1,
        selected: false,
        mergeableWith: ['a'],
      },
      {
        instanceId: 'c',
        definitionId: 'can-smg-t1',
        name: 'Can SMG I',
        family: 'smg',
        tier: 1,
        selected: false,
        mergeableWith: [],
      },
    ]);
    expect(snapshot.selectedInstanceIds).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0])).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0].mergeableWith)).toBe(true);
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
        ['definitionId', 'family', 'instanceId', 'mergeableWith', 'name', 'selected', 'tier'].sort(),
      );
    });
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

  it('keeps only the two most recently selected instances', () => {
    const run = createPausedRun([
      instance('scrap-pistol-t1', 'a'),
      instance('scrap-pistol-t1', 'b'),
      instance('scrap-pistol-t1', 'c'),
    ]);
    const { controller } = createController(run);

    controller.toggle('a');
    controller.toggle('b');
    const snapshot = controller.toggle('c');

    expect(snapshot.selectedInstanceIds).toEqual(['b', 'c']);
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
    expect(emitSpy).toHaveBeenCalledWith({ fromId: 'scrap-pistol-t1', toId: 'scrap-pistol-t2' });
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

  it('rejects pairs that are not mergeable', () => {
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
      expect(result.reason).toBe('not-mergeable');
    }

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
      expect(maxResult.reason).toBe('not-mergeable');
    }
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
      expect(result.snapshot.selectedInstanceIds).toEqual(['a', 'b']);
      expect(result.snapshot.weapons).toHaveLength(2);
    }
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
