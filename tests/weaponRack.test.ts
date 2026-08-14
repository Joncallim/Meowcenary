import { describe, expect, it, vi } from 'vitest';
import { createRunState } from '../src/gameplay/runState';
import {
  evaluateWeaponAdmission,
  grantWeaponToRack,
  WEAPON_RACK_CAPACITY,
} from '../src/gameplay/weaponRack';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import type { WeaponInstance, WeaponRegistry } from '../src/gameplay/weapons';

const data = loadGameData();
const registry = new DataWeaponRegistry(data);
const pistolDef = registry.weaponById('scrap-pistol-t1');
const smgDef = registry.weaponById('can-smg-t1');
if (!pistolDef || !smgDef) throw new Error('shipped T1 weapons missing');

function makeRun(): ReturnType<typeof createRunState> {
  const run = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  run.status = 'active';
  return run;
}

function rackOf(defIds: readonly string[]): WeaponInstance[] {
  return defIds.map((id) => {
    const def = registry.weaponById(id);
    if (!def) throw new Error(`missing definition ${id}`);
    return registry.createWeaponInstance(def);
  });
}

describe('WEAPON_RACK_CAPACITY', () => {
  it('is exactly six', () => {
    expect(WEAPON_RACK_CAPACITY).toBe(6);
  });
});

describe('evaluateWeaponAdmission', () => {
  it('accepts a valid definition for an empty or partial rack', () => {
    expect(evaluateWeaponAdmission([], pistolDef.id, registry)).toEqual({
      status: 'can-add',
      definition: pistolDef,
    });
    expect(evaluateWeaponAdmission(rackOf(['scrap-pistol-t1', 'can-smg-t1']), pistolDef.id, registry))
      .toEqual({ status: 'can-add', definition: pistolDef });
  });

  it('accepts the fifth and sixth weapons', () => {
    const five = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    expect(evaluateWeaponAdmission(five, smgDef.id, registry)).toEqual({
      status: 'can-add',
      definition: smgDef,
    });
  });

  it('returns rack-full when the rack is already at capacity', () => {
    const six = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    expect(evaluateWeaponAdmission(six, smgDef.id, registry)).toEqual({ status: 'rack-full' });
  });

  it('returns invalid-definition for an unknown id without consulting capacity', () => {
    expect(evaluateWeaponAdmission(rackOf(['scrap-pistol-t1']), 'missing-weapon', registry))
      .toEqual({ status: 'invalid-definition', definitionId: 'missing-weapon' });
  });
});

describe('grantWeaponToRack', () => {
  it('grants a fresh instance derived from the definition and reports the new count', () => {
    const run = makeRun();
    const result = grantWeaponToRack(run, pistolDef.id, registry);

    expect(result.status).toBe('added');
    if (result.status !== 'added') throw new Error('unreachable');
    expect(result.rackCount).toBe(1);
    expect(result.weapon.defId).toBe(pistolDef.id);
    expect(result.weapon.family).toBe(pistolDef.family);
    expect(result.weapon.tier).toBe(pistolDef.mergeTier);
    expect(result.weapon.instanceId).toMatch(/^weapon-\d+$/);
    expect(run.equipped).toEqual([result.weapon]);
  });

  it('succeeds from five to six and preserves the input rack order', () => {
    const run = makeRun();
    run.equipped = rackOf(['can-smg-t1', 'bolt-shotgun-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    const before = [...run.equipped];

    const result = grantWeaponToRack(run, pistolDef.id, registry);

    expect(result.status).toBe('added');
    if (result.status !== 'added') throw new Error('unreachable');
    expect(result.rackCount).toBe(6);
    expect(run.equipped).toHaveLength(6);
    expect(run.equipped.slice(0, 5)).toEqual(before);
    expect(run.equipped[5]).toBe(result.weapon);
  });

  it('rejects a seventh weapon without mutating the rack or allocating an instance', () => {
    const run = makeRun();
    run.equipped = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    const createSpy = vi.spyOn(registry, 'createWeaponInstance');
    const before = [...run.equipped];

    const result = grantWeaponToRack(run, smgDef.id, registry);

    expect(result).toEqual({ status: 'rack-full', rackCount: 6 });
    expect(run.equipped).toEqual(before);
    expect(run.equipped).toHaveLength(6);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('rejects an unknown definition without mutating the rack or allocating an instance', () => {
    const run = makeRun();
    run.equipped = rackOf(['scrap-pistol-t1']);
    const createSpy = vi.spyOn(registry, 'createWeaponInstance');

    const result = grantWeaponToRack(run, 'missing-weapon', registry);

    expect(result).toEqual({ status: 'invalid-definition', definitionId: 'missing-weapon', rackCount: 1 });
    expect(run.equipped).toHaveLength(1);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('creates distinct instance ids for two grants of the same definition', () => {
    const run = makeRun();
    const first = grantWeaponToRack(run, pistolDef.id, registry);
    const second = grantWeaponToRack(run, pistolDef.id, registry);

    expect(first.status).toBe('added');
    expect(second.status).toBe('added');
    if (first.status !== 'added' || second.status !== 'added') throw new Error('unreachable');
    expect(first.weapon.instanceId).not.toBe(second.weapon.instanceId);
    expect(run.equipped.map((weapon) => weapon.instanceId)).toEqual([
      first.weapon.instanceId,
      second.weapon.instanceId,
    ]);
  });

  it('uses the exact injected registry contract: weaponById then createWeaponInstance', () => {
    const run = makeRun();
    const calls: string[] = [];
    const fakeRegistry = {
      weaponById: (id: string) => {
        calls.push(`lookup:${id}`);
        return pistolDef;
      },
      createWeaponInstance: (def: typeof pistolDef) => {
        calls.push('create');
        return registry.createWeaponInstance(def);
      },
    };
    const result = grantWeaponToRack(run, pistolDef.id, fakeRegistry as unknown as Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>);
    expect(result.status).toBe('added');
    expect(calls).toEqual([`lookup:${pistolDef.id}`, 'create']);
  });
});
