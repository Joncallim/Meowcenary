import { describe, expect, it } from 'vitest';
import catalog from '../src/data/upgrades.json';
import type { UpgradeCardReadModel, UpgradeDefinition } from '../src/systems/types';
import { resolveUpgradeCardPresentation } from '../src/ui/upgradeCardPresentation';

function card(id: string, currentStacks = 0): UpgradeCardReadModel {
  const definition = (catalog as UpgradeDefinition[]).find(row => row.id === id)!;
  return { ...definition, category: definition.presentation.category, iconArtId: definition.presentation.iconArtId,
    owned: currentStacks > 0, currentStacks, nextStack: currentStacks + 1 };
}
describe('Upgrade presentation consumes effect facts without changing them', () => {
  it('shows both the piercing benefit and damage downside with explicit Pistol scope', () => {
    expect(resolveUpgradeCardPresentation(card('pistol-needle-rounds', 1))).toEqual({
      effect: '+1 enemy pierced · −8% damage', scope: 'Pistol',
      stacks: 'OWNED 1 → 2/2 MAX', status: 'Pistol · OWNED 1 → 2/2 MAX',
    });
  });
  it('includes every SMG Spray consequence rather than clipping its rate penalty', () => {
    expect(resolveUpgradeCardPresentation(card('smg-spray')).effect).toBe('+1 projectile · +5° spread · −5% fire rate');
  });
  it('distinguishes max health from healing, damage from crits and global from family effects', () => {
    expect(resolveUpgradeCardPresentation(card('reinforced-coat')).effect).toBe('+12% max health');
    expect(resolveUpgradeCardPresentation(card('pistol-deadeye')).effect).toBe('+22% damage · +5% range');
    expect(resolveUpgradeCardPresentation(card('hot-barrel')).scope).toBe('All weapons');
    expect(resolveUpgradeCardPresentation(card('shotgun-breacher')).scope).toBe('Shotgun');
    expect(resolveUpgradeCardPresentation(card('glass-cannon')).effect).toBe('+30% damage · −10% max health');
  });
  it('describes new, owned, last-stack and stale max-stack facts explicitly', () => {
    expect(resolveUpgradeCardPresentation(card('quick-paws')).stacks).toBe('NEW 0 → 1/5');
    expect(resolveUpgradeCardPresentation(card('quick-paws', 2)).stacks).toBe('OWNED 2 → 3/5');
    expect(resolveUpgradeCardPresentation(card('quick-paws', 4)).stacks).toBe('OWNED 4 → 5/5 MAX');
    expect(resolveUpgradeCardPresentation(card('quick-paws', 5)).stacks).toBe('MAX 5/5');
  });
  it('covers every active catalog effect and leaves definitions byte-for-byte unchanged', () => {
    const before = JSON.stringify(catalog);
    expect(catalog).toHaveLength(18);
    for (const definition of catalog) {
      const result = resolveUpgradeCardPresentation(card(definition.id));
      expect(Object.isFrozen(result)).toBe(true);
      expect(result.effect.split(' · ')).toHaveLength(definition.effects.length);
      expect(result.effect).not.toMatch(/undefined|NaN|for this run|…/);
    }
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
