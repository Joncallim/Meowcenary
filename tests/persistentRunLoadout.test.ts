import { describe, expect, it } from 'vitest';
import { resolvePersistentRunLoadout } from '../src/gameplay/persistentLoadout';
import { getAllFamilyIds } from '../src/gameplay/weaponFamilies';
import { createDefaultSaveV4, type SaveDataV4 } from '../src/systems/save';

function partDefinition(
  id: string,
  slot: 'receiver' | 'barrel' | 'trait',
  effects: readonly { readonly stat: 'damage' | 'pierce'; readonly op: 'add' | 'mult'; readonly value: number }[],
  traits: readonly ('FIRE' | 'PIERCING')[],
) {
  return {
    id,
    name: id,
    slot,
    rarity: 'common',
    effects,
    traits,
    fabricationCost: 1,
    presentation: {
      iconArtId: 'part-icon:test',
      slotIconArtId: `part-slot:${slot}`,
      traitIconArtIds: {},
    },
  } as const;
}

describe('persistent run loadout', () => {
  it('installs each registered trait stat package once per affected family alongside projectile effects', () => {
    const save: SaveDataV4 = {
      ...createDefaultSaveV4(),
      equipment: {
        helmet: { equipmentId: 'equipment:test-pyro-helmet', tier: 1 },
        armour: { equipmentId: 'equipment:test-pyro-armour', tier: 1 },
      },
      equipmentLoadout: { helmet: 'helmet', armour: 'armour' },
      gunsmith: {
        builds: [{
          id: 'build:pistol',
          name: 'Pistol Build',
          baseWeaponFamily: 'pistol',
          fitted: { barrel: 'piercing' },
          traitParts: ['fire'],
        }],
        selectedBuildId: 'build:pistol',
        parts: {
          piercing: { partId: 'part:test-piercing', tier: 1, infusedTraits: [] },
          fire: { partId: 'part:test-fire', tier: 1, infusedTraits: [] },
        },
        fabricationSerials: {},
      },
    };
    const contribution = resolvePersistentRunLoadout(
      save,
      new Map([['set:test-pyro', {
        id: 'set:test-pyro',
        setBonuses: {
          2: { modifiers: [], weaponTraits: ['FIRE'] as const },
        },
      }]]),
      new Map([
        ['equipment:test-pyro-helmet', { id: 'equipment:test-pyro-helmet', setId: 'set:test-pyro', slot: 'helmet' as const, effects: [] }],
        ['equipment:test-pyro-armour', { id: 'equipment:test-pyro-armour', setId: 'set:test-pyro', slot: 'armour' as const, effects: [] }],
      ]),
      new Map([
        ['part:test-piercing', partDefinition('part:test-piercing', 'barrel', [{ stat: 'pierce', op: 'add', value: 1 }], ['PIERCING'])],
        ['part:test-fire', partDefinition('part:test-fire', 'trait', [{ stat: 'damage', op: 'mult', value: 1.02 }], ['FIRE'])],
      ]),
    );

    const sharedFireModifiers = contribution.modifiers.filter((modifier) =>
      modifier.stat === 'damage'
      && modifier.op === 'mult'
      && modifier.value === 1.15
      && modifier.scope?.kind === 'weapon-family');
    expect(sharedFireModifiers).toHaveLength(getAllFamilyIds().length);
    expect(new Set(sharedFireModifiers.map((modifier) => modifier.scope?.family))).toEqual(new Set(getAllFamilyIds()));

    const pistolPierceModifiers = contribution.modifiers.filter((modifier) =>
      modifier.stat === 'pierce'
      && modifier.op === 'add'
      && modifier.value === 1
      && modifier.scope?.kind === 'weapon-family'
      && modifier.scope.family === 'pistol');
    expect(pistolPierceModifiers).toHaveLength(2);

    expect(contribution.projectileEffectsByFamily.get('pistol')).toEqual([
      { kind: 'burn', durationMs: 2_000, tickIntervalMs: 500, damageMultiplier: 0.2 },
    ]);
  });

  it('uses canonical slot validation and owned-instance dedupe for persisted builds', () => {
    const save: SaveDataV4 = {
      ...createDefaultSaveV4(),
      gunsmith: {
        builds: [{
          id: 'build:pistol',
          name: 'Pistol Build',
          baseWeaponFamily: 'pistol',
          fitted: { receiver: 'shared', trait: 'stale-trait-slot' },
          traitParts: ['shared'],
        }],
        selectedBuildId: 'build:pistol',
        parts: {
          shared: { partId: 'part:test-receiver', tier: 1, infusedTraits: [] },
          'stale-trait-slot': { partId: 'part:test-trait', tier: 1, infusedTraits: [] },
        },
        fabricationSerials: {},
      },
    };

    const contribution = resolvePersistentRunLoadout(
      save,
      new Map(),
      new Map(),
      new Map([
        ['part:test-receiver', partDefinition('part:test-receiver', 'receiver', [{ stat: 'damage', op: 'add', value: 2 }], ['FIRE'])],
        ['part:test-trait', partDefinition('part:test-trait', 'trait', [{ stat: 'damage', op: 'add', value: 99 }], ['PIERCING'])],
      ]),
    );

    expect(contribution.modifiers.filter((modifier) => modifier.sourceId === 'shared')).toHaveLength(1);
    expect(contribution.modifiers.some((modifier) => modifier.sourceId === 'stale-trait-slot')).toBe(false);
    expect(contribution.projectileEffectsByFamily.get('pistol')).toEqual([
      { kind: 'burn', durationMs: 2_000, tickIntervalMs: 500, damageMultiplier: 0.2 },
    ]);
  });
});
