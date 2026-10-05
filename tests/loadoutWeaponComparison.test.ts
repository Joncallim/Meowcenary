import { describe, expect, it } from 'vitest';
import { createRunState } from '../src/gameplay/runState';
import { resolveWeaponStats } from '../src/gameplay/weaponStats';
import { loadGameData } from '../src/systems/validation';
import { presentLoadoutWeaponStats } from '../src/ui/loadoutPresentation';

describe('shared resolved Loadout comparison', () => {
  it('shows production clamps as neutral, lower spread as better Accuracy and faster firing as better Fire Rate', () => {
    const weapon = loadGameData().weapons.find(row => row.family === 'pistol' && row.mergeTier === 1)!;
    const beforeRun = createRunState({ seed: 1, characterId: 'test', arenaId: 'test' });
    beforeRun.stats.add({ sourceId: 'comparison-fixture', stat: 'spreadDeg', op: 'add', value: 5 });
    const afterRun = createRunState({ seed: 1, characterId: 'test', arenaId: 'test' });
    afterRun.stats.add({ sourceId: 'comparison-fixture', stat: 'attackSpeed', op: 'mult', value: 2 });
    afterRun.stats.add({ sourceId: 'comparison-fixture', stat: 'pierce', op: 'add', value: -100 });
    afterRun.stats.add({ sourceId: 'comparison-fixture', stat: 'projectileCount', op: 'add', value: -100 });
    const before = resolveWeaponStats(beforeRun, weapon);
    const after = resolveWeaponStats(afterRun, weapon);
    const rows = presentLoadoutWeaponStats(before, after);
    expect(rows.find(row => row.key === 'intervalMs')).toMatchObject({ label: 'Fire Rate', before: weapon.fireRateMs, after: weapon.fireRateMs / 2, direction: 'better' });
    expect(rows.find(row => row.key === 'intervalMs')?.displayAfter).toMatch(/\/s$/);
    expect(rows.find(row => row.key === 'spreadDeg')).toMatchObject({ label: 'Accuracy', direction: 'better' });
    expect(rows.find(row => row.key === 'pierce')).toMatchObject({ after: 0, direction: 'neutral' });
    expect(rows.find(row => row.key === 'projectileCount')).toMatchObject({ after: 1, direction: 'neutral' });
    expect(rows.find(row => row.key === 'damage')).toMatchObject({ direction: 'neutral' });
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every(Object.isFrozen)).toBe(true);
    expect(before).toEqual(resolveWeaponStats(beforeRun, weapon));
  });
});
