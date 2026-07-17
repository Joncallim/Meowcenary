import { describe, expect, it } from 'vitest';
import { DataCharacterRegistry } from '../src/systems/characters';
import type { CharacterDefinition } from '../src/systems/types';
import { isContentId } from '../src/systems/ids';

const scrapTabby: CharacterDefinition = {
  id: 'scrap-tabby',
  name: 'Scrap Tabby',
  description: 'A balanced junkyard scavenger.',
  baseStats: { maxHealth: 100, moveSpeed: 175 },
  startingWeaponIds: ['scrap-pistol-t1', 'can-smg-t1', 'bolt-shotgun-t1'],
  passives: [{
    id: 'scrap-hoarder',
    kind: 'static',
    name: 'Scrap Hoarder',
    description: 'Picks up scrap and XP from a little further away.',
    effects: [{ stat: 'pickupRadius', op: 'add', value: 15 }],
  }],
  unlock: { type: 'default' },
  cosmeticSkinIds: [],
};

const boltHound: CharacterDefinition = {
  id: 'bolt-hound',
  name: 'Bolt Hound',
  description: 'A wiry, high-speed striker.',
  baseStats: { maxHealth: 80, moveSpeed: 205 },
  startingWeaponIds: ['can-smg-t1'],
  passives: [{
    id: 'quick-tail',
    kind: 'static',
    name: 'Quick Tail',
    description: 'Moves 5% faster.',
    effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.05 }],
  }],
  unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
  cosmeticSkinIds: [],
};

describe('DataCharacterRegistry', () => {
  it('resolves characters by id', () => {
    const registry = new DataCharacterRegistry({ characters: [scrapTabby, boltHound] });
    expect(registry.characterById('scrap-tabby')?.name).toBe('Scrap Tabby');
    expect(registry.characterById('bolt-hound')?.name).toBe('Bolt Hound');
    expect(registry.characterById('missing')).toBeUndefined();
  });

  it('returns all characters', () => {
    const registry = new DataCharacterRegistry({ characters: [scrapTabby, boltHound] });
    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('scrap-tabby');
  });

  it('returns the default character id (JSON-order-first default)', () => {
    const registry = new DataCharacterRegistry({ characters: [scrapTabby, boltHound] });
    expect(registry.defaultCharacterId()).toBe('scrap-tabby');
  });

  it('throws when there is no default character', () => {
    const noDefault: CharacterDefinition = { ...boltHound, id: 'fighter' };
    expect(() => new DataCharacterRegistry({
      characters: [boltHound, noDefault],
    })).toThrow(/at least one character must have unlock\.type "default"/);
  });

  it('clones and recursively freezes canonical definitions and the snapshot', () => {
    const mutableCharacters = structuredClone([scrapTabby, boltHound]) as unknown as Array<{ name: string } & Record<string, unknown>>;
    const registry = new DataCharacterRegistry({ characters: mutableCharacters as unknown as CharacterDefinition[] });
    mutableCharacters[0].name = 'Mutated source';

    const lookup = registry.characterById('scrap-tabby');
    expect(lookup?.name).toBe('Scrap Tabby');
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(registry.all())).toBe(true);
    expect(Reflect.set(lookup as object, 'name', 'Mutated lookup')).toBe(false);
    expect(() => (registry.all() as CharacterDefinition[]).push(scrapTabby)).toThrow();

    expect(Object.isFrozen(lookup?.baseStats)).toBe(true);
  });

  it('deeply freezes passives and effects', () => {
    const registry = new DataCharacterRegistry({ characters: [scrapTabby] });
    const character = registry.characterById('scrap-tabby');
    expect(character).toBeDefined();
    const passive = character?.passives[0];
    expect(passive).toBeDefined();
    expect(Object.isFrozen(passive)).toBe(true);
    if (passive?.kind === 'static') {
      expect(Object.isFrozen(passive.effects)).toBe(true);
      expect(Object.isFrozen(passive.effects[0])).toBe(true);
    }
  });

  it('rejects validatable data before constructing canonical state', () => {
    const cases: CharacterDefinition[][] = [
      [{ ...scrapTabby, id: '' }],
      [{ ...scrapTabby, unlock: { type: 'meta' } as any }],
      [{ ...scrapTabby, baseStats: { maxHealth: -1, moveSpeed: 100 } }],
      [{ ...scrapTabby, startingWeaponIds: [] }],
    ];
    for (const characters of cases) {
      let registry: DataCharacterRegistry | undefined;
      expect(() => { registry = new DataCharacterRegistry({ characters }); }).toThrow();
      expect(registry).toBeUndefined();
    }
  });

  it('defensively rejects duplicate ids in the constructor', () => {
    expect(() => new DataCharacterRegistry({
      characters: [scrapTabby, scrapTabby],
    })).toThrow(/duplicate id/);
  });

  it('freezes the all() snapshot and prevents mutation', () => {
    const registry = new DataCharacterRegistry({ characters: [scrapTabby] });
    const all = registry.all();
    expect(Object.isFrozen(all)).toBe(true);
  });

  it('validates characters.json loaded through loadGameData', async () => {
    const { loadGameData } = await import('../src/systems/validation');
    const data = loadGameData();
    const registry = new DataCharacterRegistry(data);
    expect(registry.characterById('scrap-tabby')).toBeDefined();
    expect(registry.characterById('bolt-hound')).toBeDefined();
    expect(registry.defaultCharacterId()).toBe('scrap-tabby');
  });

  it('shipped character ids pass content id validation', async () => {
    const { loadGameData } = await import('../src/systems/validation');
    const data = loadGameData();
    for (const character of data.characters) {
      expect(isContentId(character.id)).toBe(true);
    }
  });
});
