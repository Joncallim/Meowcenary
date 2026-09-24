import { describe, expect, it } from 'vitest';
import type { ProgressionGrant } from '../src/gameplay/grantProcessor';
import type { ProgressionCondition } from '../src/gameplay/conditionEvaluator';
import { describeProgressionCondition, describeProgressionGrant } from '../src/ui/progressionPresentation';
import { loadGameData } from '../src/systems/validation';

describe('progression presentation', () => {
  it('formats every supported persistent grant kind without silently dropping future catalog rows', () => {
    const data = loadGameData();
    const grants: readonly ProgressionGrant[] = [
      { type: 'grant-scrap', amount: 12 },
      { type: 'unlock-stage', stageId: 'stage:junkyard-01' },
      { type: 'unlock-character', characterId: 'character:scrap-tabby' },
      { type: 'unlock-equipment', equipmentId: data.equipment![0]!.id },
      { type: 'unlock-part', partId: data.gunParts![0]!.id },
      { type: 'unlock-trait', traitId: 'trait:future-surge' },
      { type: 'grant-part-instance', instanceId: 'owned:test-part', partId: data.gunParts![0]!.id, tier: 2 },
      { type: 'grant-equipment-instance', instanceId: 'owned:test-equipment', equipmentId: data.equipment![0]!.id, tier: 2 },
      { type: 'grant-item', itemId: 'item:future-signal', amount: 2 },
      { type: 'achievement-completed', achievementId: data.achievements![0]!.id },
      { type: 'permanent-upgrade-level', upgradeId: data.metaUpgrades[0]!.id, levels: 2 },
    ];

    const copy = grants.map((grant) => describeProgressionGrant(grant, data));
    expect(copy).toHaveLength(grants.length);
    expect(copy.every((label) => label.length > 0)).toBe(true);
    expect(copy).toEqual(expect.arrayContaining(['Future Signal ×2', 'Unlock Future Surge', 'Unlock Scrap Tabby']));
  });

  it('recursively formats every supported progression condition kind', () => {
    const data = loadGameData();
    const conditions: readonly ProgressionCondition[] = [
      { type: 'always' },
      { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      { type: 'boss-defeated', bossId: 'boss-crusher' },
      { type: 'achievement-completed', achievementId: 'achievement:first-victory' },
      { type: 'mastery-reached', subjectId: 'character:scrap-tabby', tier: 2 },
      { type: 'owns-content', contentId: 'trait:future-surge' },
      { type: 'scrap-total', threshold: 100 },
      { type: 'permanent-level', upgradeId: data.metaUpgrades[0]!.id, minLevel: 2 },
      { type: 'unlock-count', minCount: 3 },
      { type: 'all', conditions: [{ type: 'always' }, { type: 'scrap-total', threshold: 1 }] },
      { type: 'any', conditions: [{ type: 'boss-defeated', bossId: 'boss-crusher' }, { type: 'achievement-completed', achievementId: 'achievement:first-victory' }] },
      { type: 'not', condition: { type: 'owns-content', contentId: 'trait:future-surge' } },
    ];

    const copy = conditions.map((condition) => describeProgressionCondition(condition, data));
    expect(copy.every((label) => label.length > 0)).toBe(true);
    expect(copy).toEqual(expect.arrayContaining([
      'Defeat Scrap Crusher',
      'Complete First Victory',
      'Meet all requirements: Available; Hold 1 Scrap',
      'Meet any requirement: Defeat Scrap Crusher; Complete First Victory',
    ]));
  });

  it('resolves both canonical persistent and bare runtime character IDs through authored catalog names', () => {
    const data = loadGameData();
    const characters = data.characters.map((character, index) => index === 0 ? { ...character, name: 'Captain Tabby' } : character);
    const amended = { ...data, characters };

    expect(describeProgressionGrant({ type: 'unlock-character', characterId: 'character:scrap-tabby' }, amended)).toBe('Unlock Captain Tabby');
    expect(describeProgressionCondition({ type: 'mastery-reached', subjectId: 'scrap-tabby', tier: 2 }, amended)).toBe('Reach Captain Tabby mastery tier 2');
  });
});
