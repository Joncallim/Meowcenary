import { describe, expect, it } from 'vitest';
import { resolveAvailabilitySnapshot, diffAvailability } from '../src/gameplay/persistentAvailability';
import { createConditionContext } from '../src/gameplay/conditionEvaluator';

const defaultFacts = createConditionContext(
  { scrap: 0, unlocks: [], permanentUpgrades: {} },
);

describe('Persistent Availability', () => {
  it('resolves empty snapshot', () => {
    const snapshot = resolveAvailabilitySnapshot(defaultFacts, [], [], [], 1);
    expect(snapshot.selectableCharacterIds).toEqual([]);
    expect(snapshot.fabricableEquipmentSetIds).toEqual([]);
    expect(snapshot.fabricablePartIds).toEqual([]);
    expect(snapshot.maxEquipmentTier).toBe(1);
  });

  it('resolves available characters', () => {
    const snapshot = resolveAvailabilitySnapshot(
      defaultFacts,
      [{ id: 'scrap-tabby', unlock: { type: 'always' } }],
      [], [], 1,
    );
    expect(snapshot.selectableCharacterIds).toContain('scrap-tabby');
  });

  it('diffs availability snapshots', () => {
    const before = resolveAvailabilitySnapshot(defaultFacts, [], [], [], 1);
    const after = resolveAvailabilitySnapshot(
      createConditionContext({ scrap: 0, unlocks: ['character:bolt-hound'], permanentUpgrades: {} }),
      [{ id: 'bolt-hound', unlock: { type: 'owns-content', contentId: 'character:bolt-hound' } }],
      [], [], 2,
    );
    const diff = diffAvailability(before, after);
    expect(diff.newCharacters).toContain('bolt-hound');
    expect(diff.tierUpgrade).toBe(true);
  });
});
