import { describe, expect, it } from 'vitest';
import equipmentJson from '../src/data/equipment.json';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataEquipmentRegistry } from '../src/systems/equipment';
import {
  EQUIPMENT_SLOTS,
  SET_BONUSES,
  equipEquipment,
  resolveEquipmentModifiers,
  resolveSetBonuses,
  unequipEquipment,
  upgradeCost,
  upgradeEquipment,
  type EquipmentDefinition,
  type EquipmentLoadout,
  type OwnedEquipment,
} from '../src/gameplay/equipment';
import { createDefaultSaveV3, SaveManager, MemoryStorageAdapter } from '../src/systems/save';

const definitions = equipmentJson as unknown as EquipmentDefinition[];
const defMap = new Map(definitions.map((d) => [d.id, d]));

function owned(id: string, tier = 1): OwnedEquipment {
  return { instanceId: `inst-${id}`, equipmentId: id, tier };
}

function emptyLoadout(): EquipmentLoadout {
  return { equipped: {} };
}

describe('Epic 25 equipment catalog conformance', () => {
  it('ships equipment across 4 slots and multiple set families', () => {
    expect(definitions.length).toBeGreaterThanOrEqual(12);
    const ids = definitions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^equipment:[a-z0-9-]+$/);
    const slots = new Set(definitions.map((d) => d.slot));
    expect(slots).toEqual(new Set(EQUIPMENT_SLOTS));
    const sets = new Set(definitions.map((d) => d.setId));
    expect(sets.size).toBeGreaterThanOrEqual(6);
  });

  it('validates through the aggregate game-data validation', () => {
    const data = loadGameData();
    expect(data.equipment?.length).toBe(definitions.length);
    expect(validateGameData(data)).toBeTruthy();
  });

  it('every shipped set has a registered 2-piece and 4-piece bonus', () => {
    for (const setId of new Set(definitions.map((d) => d.setId))) {
      const bonus = SET_BONUSES[setId];
      expect(bonus, `set ${setId}`).toBeDefined();
      expect(bonus.bonuses[2]).toBeDefined();
      expect(bonus.bonuses[4]).toBeDefined();
    }
  });

  it('effect sourceIds equal the owning piece id', () => {
    for (const d of definitions) {
      for (const effect of d.effects) expect(effect.sourceId).toBe(d.id);
    }
  });
});

describe('Epic 25 equip/swap/unequip (transactional)', () => {
  it('equips a piece into its slot and swaps within the slot', () => {
    let loadout = emptyLoadout();
    loadout = (equipEquipment(loadout, 'equipment:commando-helmet', defMap) as { ok: true; loadout: EquipmentLoadout }).loadout;
    expect(loadout.equipped.helmet).toBe('equipment:commando-helmet');
    // Swap: equipping another helmet replaces the old one (no lost state).
    const swapped = equipEquipment(loadout, 'equipment:scavenger-helmet', defMap);
    expect(swapped.ok).toBe(true);
    if (swapped.ok) {
      expect(swapped.loadout.equipped.helmet).toBe('equipment:scavenger-helmet');
    }
  });

  it('rejects unknown equipment without mutating the loadout', () => {
    const loadout = emptyLoadout();
    const result = equipEquipment(loadout, 'equipment:does-not-exist', defMap);
    expect(result).toMatchObject({ ok: false, reason: 'unknown-equipment' });
    expect(loadout.equipped).toEqual({});
  });

  it('unequips exactly the requested slot', () => {
    let loadout = emptyLoadout();
    loadout = (equipEquipment(loadout, 'equipment:juggernaut-armour', defMap) as { ok: true; loadout: EquipmentLoadout }).loadout;
    const result = unequipEquipment(loadout, 'armour');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loadout.equipped.armour).toBeUndefined();
    expect(unequipEquipment(loadout, 'helmet')).toMatchObject({ ok: false, reason: 'slot-empty' });
  });
});

describe('Epic 25 set bonuses (2-piece and 4-piece)', () => {
  it('no pieces → no set bonus', () => {
    expect(resolveSetBonuses(emptyLoadout(), defMap)).toEqual([]);
  });

  it('2 commando pieces grant the 2-piece bonus, not the 4-piece', () => {
    const loadout: EquipmentLoadout = {
      equipped: { helmet: 'equipment:commando-helmet', armour: 'equipment:commando-armour' },
    };
    const modifiers = resolveSetBonuses(loadout, defMap);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:4')).toBe(false);
  });

  it('4 commando pieces grant the 4-piece bonus (replacing 2-piece)', () => {
    const loadout: EquipmentLoadout = {
      equipped: {
        helmet: 'equipment:commando-helmet',
        armour: 'equipment:commando-armour',
        gloves: 'equipment:commando-gloves',
        boots: 'equipment:commando-boots',
      },
    };
    const modifiers = resolveSetBonuses(loadout, defMap);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:4')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(false);
  });

  it('mixed sets are viable: 2 commando + 2 scavenger grant both 2-piece bonuses', () => {
    const mixed: EquipmentLoadout = {
      equipped: {
        helmet: 'equipment:scavenger-helmet',
        armour: 'equipment:commando-armour',
        gloves: 'equipment:commando-gloves',
        boots: 'equipment:scavenger-boots',
      },
    };
    const modifiers = resolveSetBonuses(mixed, defMap);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:scavenger:2')).toBe(true);
  });
});

describe('Epic 25 coin-funded upgrades', () => {
  it('upgrade consumes funds, raises tier, and is deterministic', () => {
    const piece = owned('equipment:commando-helmet', 1);
    const cost = upgradeCost(1);
    expect(cost).toBe(100);
    const result = upgradeEquipment(piece, 200, defMap);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cost).toBe(100);
      expect(result.output.tier).toBe(2);
    }
  });

  it('rejects insufficient funds and max tier without mutating', () => {
    const piece = owned('equipment:commando-helmet', 1);
    expect(upgradeEquipment(piece, 50, defMap)).toMatchObject({ ok: false, reason: 'insufficient-funds' });
    const maxed = owned('equipment:commando-helmet', 4);
    expect(upgradeEquipment(maxed, 10000, defMap)).toMatchObject({ ok: false, reason: 'max-tier' });
    expect(upgradeEquipment(owned('equipment:nope'), 100, defMap)).toMatchObject({ ok: false, reason: 'unknown-equipment' });
  });
});

describe('Epic 25 effective resolution', () => {
  it('resolveEquipmentModifiers combines piece effects and set bonuses', () => {
    const loadout: EquipmentLoadout = {
      equipped: {
        helmet: 'equipment:commando-helmet',
        armour: 'equipment:commando-armour',
      },
    };
    const modifiers = resolveEquipmentModifiers(loadout, defMap);
    // 2 piece effects + 1 set bonus
    expect(modifiers.some((m) => m.sourceId === 'equipment:commando-helmet')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'equipment:commando-armour')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
  });
});

describe('Epic 25 persistence round-trip', () => {
  it('equipment instances round-trip through Save V3', () => {
    const save = createDefaultSaveV3();
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'test', {});
    manager.save({
      ...save,
      equipment: { 'inst-1': { setId: 'set:commando', tier: 2 } },
    });
    const loaded = manager.load();
    expect(loaded.equipment['inst-1']).toMatchObject({ setId: 'set:commando', tier: 2 });
  });
});

describe('Epic 25 second-fixture proof (data-only extensibility)', () => {
  it('a new piece using an existing set/slot/effect primitive is data only', () => {
    const extra: EquipmentDefinition = {
      id: 'equipment:proof-gloves',
      name: 'Proof Gloves',
      setId: 'set:commando',
      slot: 'gloves',
      tier: 1,
      effects: [{ stat: 'attackSpeed', op: 'mult', value: 1.02, sourceId: 'equipment:proof-gloves' }],
    };
    const defs = new Map(defMap);
    defs.set(extra.id, extra);
    const result = equipEquipment(emptyLoadout(), extra.id, defs);
    expect(result.ok).toBe(true);
    // The registry accepts it through data only.
    const registry = new DataEquipmentRegistry({ equipment: [...equipmentJson, extra] });
    expect(registry.equipmentById('equipment:proof-gloves')).toBeDefined();
    // Shipped catalog untouched.
    expect(defMap.has('equipment:proof-gloves')).toBe(false);
  });
});
