import { describe, expect, it } from 'vitest';
import { resolveCharacterRunContribution } from '../src/gameplay/characterContribution';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import type { CharacterDefinition } from '../src/systems/types';

const data = loadGameData();

const scrapTabby: CharacterDefinition = {
  id: 'scrap-tabby',
  name: 'Scrap Tabby',
  description: 'A balanced junkyard scavenger.',
  baseStats: { maxHealth: 100, moveSpeed: 175 },
  startingWeaponIds: ['scrap-pistol-t1', 'can-smg-t1', 'bolt-shotgun-t1'],
  passives: [
    {
      id: 'scrap-hoarder',
      kind: 'static',
      name: 'Scrap Hoarder',
      description: 'Picks up scrap and XP from a little further away.',
      effects: [{ stat: 'pickupRadius', op: 'add', value: 15 }],
    },
  ],
  unlock: { type: 'always' },
  cosmeticSkinIds: [],
};

const boltHound: CharacterDefinition = {
  id: 'bolt-hound',
  name: 'Bolt Hound',
  description: 'A wiry, high-speed striker.',
  baseStats: { maxHealth: 80, moveSpeed: 205 },
  startingWeaponIds: ['can-smg-t1'],
  passives: [
    {
      id: 'quick-tail',
      kind: 'static',
      name: 'Quick Tail',
      description: 'Moves 5% faster.',
      effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.05 }],
    },
  ],
  unlock: { type: 'achievement-completed', achievementId: 'achievement:first-victory' },
  cosmeticSkinIds: [],
};

function freshRegistry() {
  return new DataWeaponRegistry(data);
}

describe('resolveCharacterRunContribution', () => {
  it('passes baseStats through unchanged', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(scrapTabby, registry);
    expect(contribution.baseStats).toEqual({ maxHealth: 100, moveSpeed: 175 });
  });

  it('expands static passives to modifiers with correct sourceId', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(scrapTabby, registry);
    expect(contribution.passiveModifiers).toHaveLength(1);
    const modifier = contribution.passiveModifiers[0];
    expect(modifier).toEqual({
      stat: 'pickupRadius',
      op: 'add',
      value: 15,
      sourceId: 'character:scrap-tabby:scrap-hoarder',
    });
  });

  it('expands multiple static passives to separate modifiers', () => {
    const character: CharacterDefinition = {
      ...scrapTabby,
      id: 'multi',
      passives: [
        {
          id: 'passive-a',
          kind: 'static',
          name: 'A',
          description: 'A.',
          effects: [{ stat: 'damage', op: 'add', value: 5 }],
        },
        {
          id: 'passive-b',
          kind: 'static',
          name: 'B',
          description: 'B.',
          effects: [
            { stat: 'moveSpeed', op: 'mult', value: 1.1 },
            { stat: 'maxHealth', op: 'add', value: 10 },
          ],
        },
      ],
    };
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(character, registry);
    expect(contribution.passiveModifiers).toHaveLength(3);
    expect(contribution.passiveModifiers[0].sourceId).toBe('character:multi:passive-a');
    expect(contribution.passiveModifiers[1].sourceId).toBe('character:multi:passive-b');
    expect(contribution.passiveModifiers[2].sourceId).toBe('character:multi:passive-b');
  });

  it('filters out reactive passives completely', () => {
    const character: CharacterDefinition = {
      ...scrapTabby,
      id: 'mixed',
      passives: [
        {
          id: 'static-one',
          kind: 'static',
          name: 'Static',
          description: 'Static.',
          effects: [{ stat: 'damage', op: 'add', value: 3 }],
        },
        {
          id: 'reactive-one',
          kind: 'reactive',
          name: 'Reactive',
          description: 'Reactive.',
          event: 'enemy:killed',
          handlerId: 'test-handler',
        },
      ],
    };
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(character, registry);
    expect(contribution.passiveModifiers).toHaveLength(1);
    expect(contribution.passiveModifiers[0].sourceId).toBe('character:mixed:static-one');
  });

  it('resolves startingWeaponIds to WeaponInstance[] in JSON order with deterministic ids', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(scrapTabby, registry);
    expect(contribution.startingWeapons).toHaveLength(3);
    expect(contribution.startingWeapons[0]).toMatchObject({
      instanceId: 'weapon-1',
      defId: 'scrap-pistol-t1',
      family: 'pistol',
      tier: 1,
    });
    expect(contribution.startingWeapons[1]).toMatchObject({
      instanceId: 'weapon-2',
      defId: 'can-smg-t1',
      family: 'smg',
      tier: 1,
    });
    expect(contribution.startingWeapons[2]).toMatchObject({
      instanceId: 'weapon-3',
      defId: 'bolt-shotgun-t1',
      family: 'shotgun',
      tier: 1,
    });
  });

  it('produces weapon-1 as first instance when called before any other createWeaponInstance', () => {
    const registry = freshRegistry();
    const weapon = registry.weaponById('scrap-pistol-t1');
    if (!weapon) throw new Error('missing pistol');
    expect(registry.createWeaponInstance(weapon).instanceId).toBe('weapon-1');
  });

  it('produces sequential ids for bolt-hound (single weapon)', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(boltHound, registry);
    expect(contribution.startingWeapons).toHaveLength(1);
    expect(contribution.startingWeapons[0].instanceId).toBe('weapon-1');
  });

  it('throws when a starting weapon id references a missing weapon', () => {
    const character: CharacterDefinition = {
      ...scrapTabby,
      id: 'bad-ref',
      startingWeaponIds: ['nonexistent-weapon'],
    };
    const registry = freshRegistry();
    expect(() => resolveCharacterRunContribution(character, registry)).toThrow(
      /references unknown weapon "nonexistent-weapon"/,
    );
  });

  it('freezes the outer contribution shell and passive modifiers', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(scrapTabby, registry);
    expect(Object.isFrozen(contribution)).toBe(true);
    expect(Object.isFrozen(contribution.passiveModifiers)).toBe(true);
  });

  it('does not freeze startingWeapons array (matching WeaponInstance convention)', () => {
    const registry = freshRegistry();
    const contribution = resolveCharacterRunContribution(scrapTabby, registry);
    expect(Object.isFrozen(contribution.startingWeapons)).toBe(false);
  });

  it('does not mutate the CharacterDefinition', () => {
    const cloned = structuredClone(scrapTabby) as CharacterDefinition;
    const registry = freshRegistry();
    resolveCharacterRunContribution(cloned, registry);
    expect(cloned).toEqual(scrapTabby);
  });
});
