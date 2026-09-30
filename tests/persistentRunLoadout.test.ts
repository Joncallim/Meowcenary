import { describe, expect, it } from 'vitest';
import { resolvePersistentRunLoadout } from '../src/gameplay/persistentLoadout';
import { getAllFamilyIds } from '../src/gameplay/weaponFamilies';
import { createDefaultSaveV4, type SaveDataV4 } from '../src/systems/save';

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
        ['part:test-piercing', { id: 'part:test-piercing', effects: [{ stat: 'pierce', op: 'add', value: 1 } as const], traits: ['PIERCING'] as const }],
        ['part:test-fire', { id: 'part:test-fire', effects: [{ stat: 'damage', op: 'mult', value: 1.02 } as const], traits: ['FIRE'] as const }],
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
});
