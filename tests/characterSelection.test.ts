import { describe, expect, it } from 'vitest';
import {
  canSelectCharacter,
  selectableCharacters,
  defaultCharacterId,
} from '../src/gameplay/characterSelection';
import { DataCharacterRegistry } from '../src/systems/characters';
import type { CharacterDefinition } from '../src/systems/types';
import { createDefaultMeta } from '../src/systems/save';
import { addUnlocks } from '../src/gameplay/meta';
import { loadGameData } from '../src/systems/validation';

const scrapTabby: CharacterDefinition = {
  id: 'scrap-tabby',
  name: 'Scrap Tabby',
  description: 'A balanced junkyard scavenger.',
  baseStats: { maxHealth: 100, moveSpeed: 175 },
  startingWeaponIds: ['scrap-pistol-t1', 'can-smg-t1', 'bolt-shotgun-t1'],
  passives: [],
  unlock: { type: 'default' },
  cosmeticSkinIds: [],
};

const boltHound: CharacterDefinition = {
  id: 'bolt-hound',
  name: 'Bolt Hound',
  description: 'A wiry, high-speed striker.',
  baseStats: { maxHealth: 80, moveSpeed: 205 },
  startingWeaponIds: ['can-smg-t1'],
  passives: [],
  unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
  cosmeticSkinIds: [],
};

const thirdCat: CharacterDefinition = {
  id: 'third-cat',
  name: 'Third Cat',
  description: 'Another meta-gated character.',
  baseStats: { maxHealth: 100, moveSpeed: 175 },
  startingWeaponIds: ['scrap-pistol-t1'],
  passives: [],
  unlock: { type: 'meta', requiresUnlockId: 'achievement:third' },
  cosmeticSkinIds: [],
};

function registry(characters: CharacterDefinition[] = [scrapTabby, boltHound]) {
  return new DataCharacterRegistry({ characters });
}

describe('characterSelection', () => {
  describe('canSelectCharacter', () => {
    it('always allows default characters', () => {
      const meta = createDefaultMeta();
      expect(canSelectCharacter(scrapTabby, meta)).toBe(true);
    });

    it('denies meta-gated characters without the required unlock', () => {
      const meta = createDefaultMeta();
      expect(canSelectCharacter(boltHound, meta)).toBe(false);
    });

    it('allows meta-gated characters when unlocked', () => {
      let meta = createDefaultMeta();
      meta = addUnlocks(meta, ['achievement:first-victory']);
      expect(canSelectCharacter(boltHound, meta)).toBe(true);
    });

    it('returns false for meta-gated characters with a different unlock', () => {
      let meta = createDefaultMeta();
      meta = addUnlocks(meta, ['achievement:other']);
      expect(canSelectCharacter(boltHound, meta)).toBe(false);
    });
  });

  describe('selectableCharacters', () => {
    it('includes default and unlocked characters, excludes locked', () => {
      const meta = createDefaultMeta();
      const result = selectableCharacters(registry(), meta);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('scrap-tabby');
    });

    it('includes both when all are unlocked', () => {
      let meta = createDefaultMeta();
      meta = addUnlocks(meta, ['achievement:first-victory']);
      const result = selectableCharacters(registry(), meta);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(['scrap-tabby', 'bolt-hound']);
    });

    it('preserves registry order', () => {
      let meta = createDefaultMeta();
      meta = addUnlocks(meta, ['achievement:first-victory', 'achievement:third']);
      const reg = registry([boltHound, scrapTabby, thirdCat]);
      const result = selectableCharacters(reg, meta);
      expect(result.map((c) => c.id)).toEqual(['bolt-hound', 'scrap-tabby', 'third-cat']);
    });

    it('is unaffected by stale/unknown unlock ids in MetaState', () => {
      let meta = createDefaultMeta();
      meta = addUnlocks(meta, ['achievement:stale-character']);
      const result = selectableCharacters(registry(), meta);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('scrap-tabby');
    });
  });

  describe('defaultCharacterId', () => {
    it('returns the JSON-order-first default character id', () => {
      const reg = registry();
      expect(defaultCharacterId(reg)).toBe('scrap-tabby');
      expect(defaultCharacterId(reg)).toBe(reg.defaultCharacterId());
    });

    it('returns the default when default is not first', () => {
      const reg = registry([boltHound, scrapTabby]);
      expect(defaultCharacterId(reg)).toBe('scrap-tabby');
    });

    it('throws when no default exists', () => {
      const mock = { all: () => [boltHound, thirdCat] as readonly Readonly<CharacterDefinition>[] };
      expect(() => defaultCharacterId(mock)).toThrow(
        'Character catalog has no default character',
      );
    });

    it('matches DataCharacterRegistry.defaultCharacterId', () => {
      const reg = new DataCharacterRegistry(loadGameData());
      expect(defaultCharacterId(reg)).toBe(reg.defaultCharacterId());
    });
  });
});
