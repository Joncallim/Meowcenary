import { describe, expect, it, vi } from 'vitest';
import { createDefaultSaveV4, MemoryStorageAdapter, SaveManager, type SaveDataV4 } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { resolvePersistentRunLoadout } from '../src/gameplay/persistentLoadout';
import { resolveEquipmentComparison, resolveEquipmentLoadoutPresentation } from '../src/ui/equipmentPresentation';
import { EquipmentController } from '../src/ui/equipmentController';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';

function fixture(): SaveDataV4 {
  return { ...createDefaultSaveV4(), equipment: {
    old: { equipmentId: 'equipment:commando-helmet', tier: 2 },
    armour: { equipmentId: 'equipment:commando-armour', tier: 1 },
    candidate: { equipmentId: 'equipment:pyro-helmet', tier: 3 },
    gloves: { equipmentId: 'equipment:pyro-gloves', tier: 1 },
  }, equipmentLoadout: { helmet: 'old', armour: 'armour', gloves: 'gloves' }, gunsmith: {
    ...createDefaultSaveV4().gunsmith,
    selectedBuildId: 'build:pistol',
    builds: [{ id: 'build:pistol', name: 'Fire Pistol', baseWeaponFamily: 'pistol', fitted: {}, traitParts: ['fire'] }],
    parts: { fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] } },
  } };
}

describe('Equipment immutable consequence preview', () => {
  it('provides registered native slot-placeholder identities without creating owned or equipped items', () => {
    const data = loadGameData();
    const save = createDefaultSaveV4();
    const before = structuredClone(save);
    const view = resolveEquipmentLoadoutPresentation(save, data);
    expect(view.slots.map((slot) => [slot.slot, slot.placeholderArtId])).toEqual([
      ['helmet', 'equipment-icon:scavenger-helmet'], ['armour', 'equipment-icon:scavenger-armour'],
      ['gloves', 'equipment-icon:scavenger-gloves'], ['boots', 'equipment-icon:scavenger-boots'],
    ]);
    for (const slot of view.slots) {
      expect(data.visualArt.bindings.some((binding) => binding.id === slot.placeholderArtId)).toBe(true);
      expect(slot.equipped).toBeUndefined();
      expect(slot.candidates).toHaveLength(0);
      expect(Object.isFrozen(slot)).toBe(true);
    }
    expect(view.sets.every((set) => set.equippedCount === 0)).toBe(true);
    expect(save).toEqual(before);
  });

  it('exposes active Equipment behavior traits in the production controller summary', () => {
    const data = loadGameData();
    const save = new SaveManager(new MemoryStorageAdapter(), 'equipment-trait-summary');
    save.save({ ...fixture(), equipmentLoadout: { helmet: 'candidate', gloves: 'gloves' } });
    const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data, save,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data) });
    expect(new EquipmentController(context).snapshot().activeSets.find((set) => set.name === 'Pyro')!.bonusSummary.join(' ')).toContain('FIRE');
  });
  it('includes the displaced tiered piece, lost and gained Set thresholds and effective deduplicated family truth', () => {
    const data = loadGameData();
    const save = fixture();
    const original = structuredClone(save);
    const comparison = resolveEquipmentComparison(save, data, { kind: 'equip', instanceId: 'candidate' })!;
    expect(save).toEqual(original);
    expect(comparison.displaced).toMatchObject({ instanceId: 'old', tier: 2, state: 'EQUIPPED' });
    expect(comparison.after.slots.find((row) => row.slot === 'helmet')?.equipped).toMatchObject({ instanceId: 'candidate', tier: 3 });
    expect(comparison.setChanges).toEqual([
      { setId: 'set:commando', before: 2, after: 1, gained: [], lost: [2] },
      { setId: 'set:pyro', before: 1, after: 2, gained: [2], lost: [] },
    ]);
    const fire = comparison.after.sets.find((set) => set.setId === 'set:pyro')!.thresholds[0]!.effects;
    expect(fire).toContainEqual(expect.objectContaining({ kind: 'trait', trait: 'FIRE', target: { kind: 'all-weapons', label: 'All Weapons' } }));
    expect(comparison.after.runTruth.families.find((row) => row.familyId === 'pistol')!.traits).toContainEqual({
      trait: 'FIRE', sourceIds: ['set:pyro:2', 'build:pistol'], sourceLabels: ['Pyro 2-piece', 'Fire Pistol'], deduplicated: true,
    });
    expect(comparison.after.runTruth.modifiers.filter((modifier) => modifier.stat === 'damage' && modifier.value === 1.15 && modifier.scope?.family === 'pistol')).toHaveLength(1);
    const authoritative = resolvePersistentRunLoadout(comparison.candidate,
      new Map(data.equipmentSets!.map((set) => [set.id, { id: set.id, setBonuses: set.thresholds }])),
      new Map(data.equipment!.map((piece) => [piece.id, piece])), new Map(data.gunParts!.map((part) => [part.id, part])));
    expect(comparison.after.runTruth.modifiers).toEqual(authoritative.modifiers);
    for (const family of comparison.after.runTruth.families) expect(family.projectileEffects).toEqual(authoritative.projectileEffectsByFamily.get(family.familyId));
    expect(Object.isFrozen(comparison.candidate.equipmentLoadout)).toBe(true);
    expect(Object.isFrozen(comparison.after.runTruth.families[0]!.traits)).toBe(true);
  });

  it('groups only compatible stable instances into each slot and marks stored items separately', () => {
    const view = resolveEquipmentLoadoutPresentation(fixture(), loadGameData());
    expect(view.slots.map((row) => row.slot)).toEqual(['helmet', 'armour', 'gloves', 'boots']);
    expect(view.slots[0]!.candidates.map((row) => [row.instanceId, row.state])).toEqual([['old', 'EQUIPPED'], ['candidate', 'STORED']]);
    expect(view.slots[3]!.equipped).toBeUndefined();
  });

  it('rejects stale candidate IDs and predicts unequip losses without saving', () => {
    const save = fixture();
    const data = loadGameData();
    expect(resolveEquipmentComparison(save, data, { kind: 'equip', instanceId: 'removed' })).toBeUndefined();
    expect(resolveEquipmentComparison(save, data, { kind: 'equip', instanceId: 'old' })).toBeUndefined();
    expect(resolveEquipmentComparison(save, data, { kind: 'unequip', slot: 'boots' })).toBeUndefined();
    const preview = resolveEquipmentComparison(save, data, { kind: 'unequip', slot: 'helmet' })!;
    expect(preview.candidate.equipmentLoadout!.helmet).toBeUndefined();
    expect(preview.setChanges).toEqual([{ setId: 'set:commando', before: 2, after: 1, gained: [], lost: [2] }]);
    expect(save.equipmentLoadout!.helmet).toBe('old');
  });

  it('previews upgrades of stored and equipped pieces with the same pure tier operation as commit', () => {
    const save = fixture();
    const data = loadGameData();
    const stored = resolveEquipmentComparison(save, data, { kind: 'upgrade', instanceId: 'candidate' })!;
    expect(stored.cost).toBe(200);
    expect(stored.candidate.equipment.candidate.tier).toBe(4);
    expect(stored.after.runTruth).toEqual(stored.before.runTruth);
    expect(stored.setChanges).toEqual([]);
    expect(stored.candidate.progression).toEqual(save.progression);
    expect(stored.displaced).toBeUndefined();
    const equipped = resolveEquipmentComparison(save, data, { kind: 'upgrade', instanceId: 'old' })!;
    expect(equipped.cost).toBe(150);
    expect(equipped.after.slots[0]!.equipped!.effects[0]).toMatchObject({ value: '+15%', target: { label: 'All Weapons' } });
    expect(equipped.after.runTruth).not.toEqual(equipped.before.runTruth);
    expect(resolveEquipmentComparison(stored.candidate, data, { kind: 'upgrade', instanceId: 'candidate' })).toBeUndefined();
  });

  it('preview and one-write commit resolve identical persistent-run mechanics and stable appearance identity', () => {
    const data = loadGameData();
    const save = new SaveManager(new MemoryStorageAdapter(), 'equipment-preview-commit');
    save.save(fixture());
    const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data, save,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data) });
    const writes = vi.spyOn(save, 'save');
    const controller = new EquipmentController(context);
    const comparison = resolveEquipmentComparison(context.saveData, data, { kind: 'equip', instanceId: 'candidate' })!;
    expect(writes).not.toHaveBeenCalled();
    expect(controller.equip('candidate')).toBe(true);
    expect(writes).toHaveBeenCalledOnce();
    expect(resolveEquipmentLoadoutPresentation(context.saveData, data)).toEqual(comparison.after);
  });
});
