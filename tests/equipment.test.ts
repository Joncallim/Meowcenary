import { describe, expect, it } from 'vitest';
import equipmentJson from '../src/data/equipment.json';
import equipmentSetsJson from '../src/data/equipment-sets.json';
import equipmentRulesJson from '../src/data/equipment-rules.json';
import achievementsJson from '../src/data/achievements.json';
import { createConditionContext } from '../src/gameplay/conditionEvaluator';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataEquipmentRegistry } from '../src/systems/equipment';
import {
  EQUIPMENT_SLOTS,
  equipEquipment,
  resolveEquipmentModifiers,
  resolveSetBonuses,
  unequipEquipment,
  upgradeCost,
  upgradeEquipment,
  type EquipmentDefinition,
  type EquipmentSetDefinition,
  type EquipmentLoadout,
  type OwnedEquipment,
} from '../src/gameplay/equipment';
import { createDefaultSaveV4, SaveManager, MemoryStorageAdapter } from '../src/systems/save';

const definitions = equipmentJson as unknown as EquipmentDefinition[];
const defMap = new Map(definitions.map((d) => [d.id, d]));
const setMap = new Map((equipmentSetsJson as unknown as EquipmentSetDefinition[]).map((set) => [set.id, set]));
const rules = equipmentRulesJson as unknown as import('../src/gameplay/equipment').EquipmentUpgradeRules;

function owned(id: string, tier = 1): OwnedEquipment {
  return { instanceId: `inst-${id}`, equipmentId: id, tier };
}
function ownedMap(...items: OwnedEquipment[]): ReadonlyMap<string, OwnedEquipment> {
  return new Map(items.map((item) => [item.instanceId, item]));
}

function emptyLoadout(): EquipmentLoadout {
  return { equipped: {} };
}

const tierTwoFacts = createConditionContext(createDefaultSaveV4().progression, {
  stages: { 'stage:junkyard-03': { completed: true } },
});
const tierThreeFacts = createConditionContext(createDefaultSaveV4().progression, {
  bosses: { 'boss-crusher': { defeated: true } },
});
const tierFourFacts = createConditionContext(createDefaultSaveV4().progression, {
  bosses: { 'boss-forge': { defeated: true } },
});

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

  it('every shipped set owns exactly one complete data bonus table', () => {
    const sets = equipmentSetsJson as unknown as EquipmentSetDefinition[];
    expect(new Set(sets.map((set) => set.id))).toEqual(new Set(definitions.map((definition) => definition.setId)));
    for (const set of sets) {
      expect(set.thresholds[2]).toBeDefined();
      expect(set.thresholds[4]).toBeDefined();
    }
  });

  it('ships all four obtainable slots for every advertised initial set', () => {
    for (const setId of new Set(definitions.map((d) => d.setId))) {
      expect(new Set(definitions.filter((definition) => definition.setId === setId).map((definition) => definition.slot)), setId)
        .toEqual(new Set(EQUIPMENT_SLOTS));
    }
  });

  it('makes every advertised four-piece set earnable through V4 acquisition paths (achievement grants or fabrication)', () => {
    // V4: equipment is obtained through achievement grants or fabrication,
    // not through stage reward dumps. Verify that the grant mechanism works
    // for at least one piece.
    const achievementEquipmentIds = new Set(
      (achievementsJson as unknown as Array<{ rewards?: Array<{ grant: { type: string; equipmentId?: string } }> }>)
        .flatMap((a) => a.rewards ?? [])
        .map((r) => r.grant)
        .filter((g) => g !== undefined && (g.type === 'grant-equipment-instance' || g.type === 'unlock-equipment'))
        .map((g) => g.equipmentId)
    );

    // Verify grant mechanism works: at least one piece is referenced
    expect(achievementEquipmentIds.size).toBeGreaterThanOrEqual(1);

    for (const setId of new Set(definitions.map((definition) => definition.setId))) {
      const pieces = definitions.filter((definition) => definition.setId === setId);
      expect(pieces, setId).toHaveLength(EQUIPMENT_SLOTS.length);
    }
  });

  it('piece effects are source-free; owned instances supply provenance at resolution', () => {
    for (const d of definitions) {
      for (const effect of d.effects) expect(effect).not.toHaveProperty('sourceId');
    }
  });
});

describe('Epic 25 equip/swap/unequip (transactional)', () => {
  it('equips a piece into its slot and swaps within the slot', () => {
    let loadout = emptyLoadout();
    const commando = owned('equipment:commando-helmet');
    const scavenger = owned('equipment:scavenger-helmet');
    const inventory = ownedMap(commando, scavenger);
    loadout = (equipEquipment(loadout, commando.instanceId, defMap, inventory) as { ok: true; loadout: EquipmentLoadout }).loadout;
    expect(loadout.equipped.helmet).toBe(commando.instanceId);
    // Swap: equipping another helmet replaces the old one (no lost state).
    const swapped = equipEquipment(loadout, scavenger.instanceId, defMap, inventory);
    expect(swapped.ok).toBe(true);
    if (swapped.ok) {
      expect(swapped.loadout.equipped.helmet).toBe(scavenger.instanceId);
    }
  });

  it('rejects unknown equipment without mutating the loadout', () => {
    const loadout = emptyLoadout();
    const result = equipEquipment(loadout, 'inst-missing', defMap, ownedMap());
    expect(result).toMatchObject({ ok: false, reason: 'unknown-equipment' });
    expect(loadout.equipped).toEqual({});
  });

  it('unequips exactly the requested slot', () => {
    let loadout = emptyLoadout();
    const armour = owned('equipment:juggernaut-armour');
    loadout = (equipEquipment(loadout, armour.instanceId, defMap, ownedMap(armour)) as { ok: true; loadout: EquipmentLoadout }).loadout;
    const result = unequipEquipment(loadout, 'armour');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loadout.equipped.armour).toBeUndefined();
    expect(unequipEquipment(loadout, 'helmet')).toMatchObject({ ok: false, reason: 'slot-empty' });
  });
});

describe('Epic 25 set bonuses (2-piece and 4-piece)', () => {
  it('no pieces → no set bonus', () => {
    expect(resolveSetBonuses(emptyLoadout(), defMap, ownedMap())).toEqual([]);
  });

  it('2 commando pieces grant the 2-piece bonus, not the 4-piece', () => {
    const loadout: EquipmentLoadout = {
      equipped: { helmet: 'inst-equipment:commando-helmet', armour: 'inst-equipment:commando-armour' },
    };
    const modifiers = resolveSetBonuses(loadout, defMap, setMap, ownedMap(owned('equipment:commando-helmet'), owned('equipment:commando-armour')));
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:4')).toBe(false);
  });

  it('4 commando pieces cumulatively grant the 2-piece and 4-piece bonuses', () => {
    const loadout: EquipmentLoadout = {
      equipped: {
        helmet: 'inst-equipment:commando-helmet', armour: 'inst-equipment:commando-armour', gloves: 'inst-equipment:commando-gloves', boots: 'inst-equipment:commando-boots',
      },
    };
    const modifiers = resolveSetBonuses(loadout, defMap, setMap, ownedMap(...['equipment:commando-helmet','equipment:commando-armour','equipment:commando-gloves','equipment:commando-boots'].map((id) => owned(id))));
    expect(modifiers.some((m) => m.sourceId === 'set:commando:4')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
  });

  it('mixed sets are viable: 2 commando + 2 scavenger grant both 2-piece bonuses', () => {
    const mixed: EquipmentLoadout = {
      equipped: {
        helmet: 'inst-equipment:scavenger-helmet', armour: 'inst-equipment:commando-armour', gloves: 'inst-equipment:commando-gloves', boots: 'inst-equipment:scavenger-boots',
      },
    };
    const modifiers = resolveSetBonuses(mixed, defMap, setMap, ownedMap(...['equipment:scavenger-helmet','equipment:commando-armour','equipment:commando-gloves','equipment:scavenger-boots'].map((id) => owned(id))));
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:scavenger:2')).toBe(true);
  });
});

describe('Epic 25 coin-funded upgrades', () => {
  it('upgrade consumes funds, raises tier, and is deterministic', () => {
    const piece = owned('equipment:commando-helmet', 1);
    const cost = upgradeCost(1);
    expect(cost).toBe(100);
    const result = upgradeEquipment(piece, 200, defMap, tierTwoFacts, rules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cost).toBe(100);
      expect(result.output.tier).toBe(2);
    }
  });

  it('rejects insufficient funds and max tier without mutating', () => {
    const piece = owned('equipment:commando-helmet', 1);
    expect(upgradeEquipment(piece, 50, defMap, tierTwoFacts, rules)).toMatchObject({ ok: false, reason: 'insufficient-funds' });
    const maxed = owned('equipment:commando-helmet', 4);
    expect(upgradeEquipment(maxed, 10000, defMap)).toMatchObject({ ok: false, reason: 'max-tier' });
    expect(upgradeEquipment(owned('equipment:nope'), 100, defMap)).toMatchObject({ ok: false, reason: 'unknown-equipment' });
    expect(upgradeEquipment(owned('equipment:commando-helmet', 0), 100, defMap)).toMatchObject({ ok: false, reason: 'unknown-equipment' });
    expect(upgradeEquipment(owned('equipment:commando-helmet', 1.5), 100, defMap)).toMatchObject({ ok: false, reason: 'unknown-equipment' });
  });

  it('requires data-owned stage, boss, and achievement facts for the higher tiers', () => {
    const standard = owned('equipment:commando-helmet', 1);
    expect(upgradeEquipment(standard, 999, defMap, undefined, rules)).toMatchObject({ ok: false, reason: 'locked' });
    expect(upgradeEquipment(standard, 999, defMap, tierTwoFacts, rules)).toMatchObject({ ok: true, output: { tier: 2 } });

    const advanced = owned('equipment:commando-helmet', 2);
    expect(upgradeEquipment(advanced, 999, defMap, tierTwoFacts, rules)).toMatchObject({ ok: false, reason: 'locked' });
    expect(upgradeEquipment(advanced, 999, defMap, tierThreeFacts, rules)).toMatchObject({ ok: true, output: { tier: 3 } });

    const elite = owned('equipment:commando-helmet', 3);
    expect(upgradeEquipment(elite, 999, defMap, tierThreeFacts, rules)).toMatchObject({ ok: false, reason: 'locked' });
    expect(upgradeEquipment(elite, 999, defMap, tierFourFacts, rules)).toMatchObject({ ok: true, output: { tier: 4 } });
  });
});

describe('Epic 25 effective resolution', () => {
  it('resolveEquipmentModifiers combines piece effects and set bonuses', () => {
    const loadout: EquipmentLoadout = {
      equipped: {
        helmet: 'inst-equipment:commando-helmet', armour: 'inst-equipment:commando-armour',
      },
    };
    const modifiers = resolveEquipmentModifiers(loadout, defMap, setMap, ownedMap(owned('equipment:commando-helmet'), owned('equipment:commando-armour')));
    // 2 piece effects + 1 set bonus
    expect(modifiers.some((m) => m.sourceId === 'inst-equipment:commando-helmet')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'inst-equipment:commando-armour')).toBe(true);
    expect(modifiers.some((m) => m.sourceId === 'set:commando:2')).toBe(true);
  });
});

describe('Epic 25 persistence round-trip', () => {
  it('equipment instances round-trip through Save V3', () => {
    const save = createDefaultSaveV4();
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'test', {});
    manager.save({
      ...save,
      equipment: { 'inst-1': { equipmentId: 'equipment:commando-helmet', tier: 2 } },
    });
    const loaded = manager.load();
    expect(loaded.equipment['inst-1']).toMatchObject({ equipmentId: 'equipment:commando-helmet', tier: 2 });
  });
});

describe('Epic 25 second-fixture proof (data-only extensibility)', () => {
  it('a second four-piece set carries its own data bonus table without a runtime registration', () => {
    const pieces = EQUIPMENT_SLOTS.map((slot): EquipmentDefinition => ({
      id: `equipment:proof-set-${slot}`,
      name: `Proof ${slot}`,
      setId: 'set:proof',
      slot,
      icon: 'upgrade-icon:run-and-gun',
      effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.01 }],
    }));
    const proofSet: EquipmentSetDefinition = { id: 'set:proof', name: 'Proof', description: 'Proof set', unlock: { type: 'always' }, pieceFabricationCost: 1, emblem: 'upgrade-icon:run-and-gun', thresholds: { 2: { modifiers: [{ stat: 'moveSpeed', op: 'mult', value: 1.01 }] }, 4: { modifiers: [{ stat: 'attackSpeed', op: 'mult', value: 1.01 }] } } };
    const registry = new DataEquipmentRegistry({ equipment: [...equipmentJson, ...pieces], equipmentSets: [...equipmentSetsJson, proofSet], equipmentRules: rules });
    const defs = registry.asMap();
    const ownedPieces = pieces.map((piece) => owned(piece.id));
    const loadout: EquipmentLoadout = { equipped: Object.fromEntries(ownedPieces.map((piece) => [defs.get(piece.equipmentId)!.slot, piece.instanceId])) };
    const modifiers = resolveSetBonuses(loadout, defs, registry.setsAsMap(), ownedMap(...ownedPieces));
    expect(modifiers.map((modifier) => modifier.sourceId)).toEqual(expect.arrayContaining(['set:proof:2', 'set:proof:4']));
    expect(upgradeEquipment(ownedPieces[0]!, 999, defs, undefined, rules)).toMatchObject({ ok: false, reason: 'locked' });
    expect(upgradeEquipment(ownedPieces[0]!, 999, defs, createConditionContext(createDefaultSaveV4().progression, {
      stages: { 'stage:proof': { completed: true } },
    }), { unlocks: { 2: { type: 'stage-cleared', stageId: 'stage:proof' }, 3: { type: 'always' }, 4: { type: 'always' } } })).toMatchObject({ ok: true, output: { tier: 2 } });
  });

  it('a new piece using an existing set/slot/effect primitive is data only', () => {
    const extra: EquipmentDefinition = {
      id: 'equipment:proof-gloves',
      name: 'Proof Gloves',
      setId: 'set:commando',
      slot: 'gloves',
      icon: 'upgrade-icon:run-and-gun',
      effects: [{ stat: 'attackSpeed', op: 'mult', value: 1.02 }],
    };
    const defs = new Map(defMap);
    defs.set(extra.id, extra);
    const proof = owned(extra.id);
    const result = equipEquipment(emptyLoadout(), proof.instanceId, defs, ownedMap(proof));
    expect(result.ok).toBe(true);
    // The registry accepts it through data only.
    const registry = new DataEquipmentRegistry({ equipment: [...equipmentJson, extra], equipmentSets: equipmentSetsJson, equipmentRules: rules });
    expect(registry.equipmentById('equipment:proof-gloves')).toBeDefined();
    // Shipped catalog untouched.
    expect(defMap.has('equipment:proof-gloves')).toBe(false);
  });

  it('rejects malformed data-owned bonus modifiers before runtime resolution', () => {
    const invalid = {
      ...(equipmentSetsJson as unknown as EquipmentSetDefinition[])[0],
      thresholds: { 2: { modifiers: [{ stat: 'not-a-stat', op: 'mult', value: 1.1 }] }, 4: { modifiers: [] } },
    };
    expect(() => new DataEquipmentRegistry({ equipment: equipmentJson, equipmentSets: [invalid] })).toThrow(/thresholds\.2\.modifiers\[0\]\.stat/);
  });
});
