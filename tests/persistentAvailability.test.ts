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

  it('treats a migration-preserved character entitlement as selectable when the current condition is unmet', () => {
    const facts = createConditionContext({ scrap: 0, unlocks: ['character:piston-ram'], permanentUpgrades: {} });
    const snapshot = resolveAvailabilitySnapshot(facts, [{
      id: 'piston-ram', unlock: { type: 'mastery-reached', subjectId: 'scrap-tabby', tier: 2 },
    }], [], [], 1);
    expect(snapshot.selectableCharacterIds).toEqual(['piston-ram']);
  });

  it('reports an entitlement gained during settlement in the result availability diff exactly once', () => {
    const definitions = [{ id: 'ember-cougar', unlock: { type: 'stage-cleared' as const, stageId: 'stage:forge-01' } }];
    const before = resolveAvailabilitySnapshot(defaultFacts, definitions, [], [], 1);
    const afterFacts = createConditionContext({ scrap: 0, unlocks: ['character:ember-cougar'], permanentUpgrades: {} });
    const after = resolveAvailabilitySnapshot(afterFacts, definitions, [], [], 1);
    expect(diffAvailability(before, after).newCharacters).toEqual(['ember-cougar']);
    expect(diffAvailability(after, after).newCharacters).toEqual([]);
  });

  it('treats an absent part unlock as ordinary availability when its blueprint has a cost', () => {
    const snapshot = resolveAvailabilitySnapshot(
      defaultFacts,
      [], [], [{ id: 'part:starter', fabricationCost: 60 }], 1,
    );
    expect(snapshot.fabricablePartIds).toEqual(['part:starter']);
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
