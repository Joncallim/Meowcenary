import { describe, expect, it } from 'vitest';
import { resolvePersistentGunsmithEngineering } from '../src/gameplay/persistentLoadout';
import { DataPartRegistry } from '../src/systems/parts';
import { loadGameData } from '../src/systems/validation';

describe('persistent Gunsmith engineering', () => {
  it('compiles selected SMG engineering before an SMG exists, so ordinary family stat resolution can apply it when acquired later', () => {
    const data = loadGameData();
    const contribution = resolvePersistentGunsmithEngineering({
      builds: [{ id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: { barrel: 'barrel' }, traitParts: [] }],
      selectedBuildId: 'build:smg',
      parts: { barrel: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] } },
      fabricationSerials: {},
    }, new DataPartRegistry({ gunParts: data.gunParts ?? [] }).asMap());
    expect(contribution.selectedFamily).toBe('smg');
    expect(contribution.modifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ stat: 'range', scope: { kind: 'weapon-family', family: 'smg' } }),
    ]));
    expect(contribution.modifiers.some((modifier) => modifier.scope?.kind === 'weapon-family' && modifier.scope.family === 'pistol')).toBe(false);
  });
});
