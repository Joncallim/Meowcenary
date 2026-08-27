import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  createConditionContext,
  type ProgressionCondition,
} from '../src/gameplay/conditionEvaluator';
import { createDefaultProgression } from '../src/systems/save';
import type { ProgressionState } from '../src/systems/save';

function makeProgression(overrides?: Partial<ProgressionState>): ProgressionState {
  const base = createDefaultProgression();
  if (!overrides) return base;
  return Object.freeze({ ...base, ...overrides });
}

describe('conditionEvaluator — basic conditions', () => {
  it('stage-cleared returns true when completed', () => {
    const ctx = createConditionContext(makeProgression(), {
      stages: { 'stage:junkyard-01': { completed: true } },
    });
    const cond: ProgressionCondition = { type: 'stage-cleared', stageId: 'stage:junkyard-01' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('stage-cleared returns false when not completed', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'stage-cleared', stageId: 'stage:junkyard-01' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('stage-cleared returns false for missing stage', () => {
    const ctx = createConditionContext(makeProgression(), {
      stages: { 'stage:junkyard-01': { completed: false } },
    });
    const cond: ProgressionCondition = { type: 'stage-cleared', stageId: 'stage:junkyard-02' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('achievement-completed returns true when completed', () => {
    const ctx = createConditionContext(makeProgression(), {
      achievements: { 'achievement:first-victory': { completed: true } },
    });
    const cond: ProgressionCondition = { type: 'achievement-completed', achievementId: 'achievement:first-victory' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('achievement-completed returns false when not completed', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'achievement-completed', achievementId: 'achievement:first-victory' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('boss-defeated checks achievement for boss', () => {
    const ctx = createConditionContext(makeProgression(), {
      achievements: { 'achievement:boss-crusher': { completed: true } },
    });
    const cond: ProgressionCondition = { type: 'boss-defeated', bossId: 'crusher' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('boss-defeated returns false when boss not defeated', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'boss-defeated', bossId: 'crusher' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('mastery-reached checks tier', () => {
    const ctx = createConditionContext(makeProgression(), {
      characters: { 'scrap-tabby': { tier: 3, xp: 500 } },
    });
    const cond: ProgressionCondition = { type: 'mastery-reached', subjectId: 'scrap-tabby', tier: 3 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('mastery-reached returns false for insufficient tier', () => {
    const ctx = createConditionContext(makeProgression(), {
      characters: { 'scrap-tabby': { tier: 2, xp: 500 } },
    });
    const cond: ProgressionCondition = { type: 'mastery-reached', subjectId: 'scrap-tabby', tier: 3 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('mastery-reached returns false for missing character', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'mastery-reached', subjectId: 'scrap-tabby', tier: 1 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('owns-content checks unlocks', () => {
    const ctx = createConditionContext(makeProgression({ unlocks: ['character:bolt-hound'] }));
    const cond: ProgressionCondition = { type: 'owns-content', contentId: 'character:bolt-hound' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('owns-content returns false when not unlocked', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'owns-content', contentId: 'character:bolt-hound' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('scrap-total checks threshold', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 1000 }));
    expect(evaluateCondition({ type: 'scrap-total', threshold: 500 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'scrap-total', threshold: 1000 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'scrap-total', threshold: 1001 }, ctx)).toBe(false);
  });

  it('permanent-level checks upgrade level', () => {
    const ctx = createConditionContext(makeProgression({
      permanentUpgrades: { 'reinforced-vest': 3 },
    }));
    expect(evaluateCondition({ type: 'permanent-level', upgradeId: 'reinforced-vest', minLevel: 3 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'permanent-level', upgradeId: 'reinforced-vest', minLevel: 4 }, ctx)).toBe(false);
    expect(evaluateCondition({ type: 'permanent-level', upgradeId: 'unknown', minLevel: 1 }, ctx)).toBe(false);
  });

  it('unlock-count checks minimum unlocks', () => {
    const ctx = createConditionContext(makeProgression({
      unlocks: ['character:cat', 'stage:junkyard-01', 'achievement:first-victory'],
    }));
    expect(evaluateCondition({ type: 'unlock-count', minCount: 3 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'unlock-count', minCount: 4 }, ctx)).toBe(false);
  });
});

describe('conditionEvaluator — composable conditions', () => {
  it('all: true when all conditions are true', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 500 }), {
      stages: { 'stage:junkyard-01': { completed: true } },
    });
    const cond: ProgressionCondition = {
      type: 'all',
      conditions: [
        { type: 'scrap-total', threshold: 100 },
        { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('all: false when any condition is false', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 50 }));
    const cond: ProgressionCondition = {
      type: 'all',
      conditions: [
        { type: 'scrap-total', threshold: 100 },
        { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('all: true for empty conditions array', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'all', conditions: [] };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('any: true when at least one condition is true', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 50 }), {
      stages: { 'stage:junkyard-01': { completed: true } },
    });
    const cond: ProgressionCondition = {
      type: 'any',
      conditions: [
        { type: 'scrap-total', threshold: 100 },
        { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('any: false when no conditions are true', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = {
      type: 'any',
      conditions: [
        { type: 'scrap-total', threshold: 100 },
        { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('any: false for empty conditions array', () => {
    const ctx = createConditionContext(makeProgression());
    const cond: ProgressionCondition = { type: 'any', conditions: [] };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('not: inverts condition', () => {
    const ctx = createConditionContext(makeProgression());
    expect(evaluateCondition({ type: 'not', condition: { type: 'scrap-total', threshold: 0 } }, ctx)).toBe(false);
    expect(evaluateCondition({ type: 'not', condition: { type: 'scrap-total', threshold: 100 } }, ctx)).toBe(true);
  });

  it('deeply nested AND/OR/NOT', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 1000 }), {
      stages: { 'stage:junkyard-01': { completed: true } },
      achievements: { 'achievement:first-victory': { completed: true } },
    });
    const cond: ProgressionCondition = {
      type: 'all',
      conditions: [
        { type: 'scrap-total', threshold: 500 },
        {
          type: 'any',
          conditions: [
            { type: 'stage-cleared', stageId: 'stage:junkyard-02' },
            { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
          ],
        },
        {
          type: 'not',
          condition: { type: 'achievement-completed', achievementId: 'achievement:nonexistent' },
        },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });
});

describe('conditionEvaluator — edge cases', () => {
  it('is deterministic — same inputs, same output', () => {
    const ctx = createConditionContext(makeProgression({ scrap: 100 }), {
      stages: { 'stage:junkyard-01': { completed: true } },
    });
    const cond: ProgressionCondition = {
      type: 'all',
      conditions: [
        { type: 'scrap-total', threshold: 50 },
        { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      ],
    };
    // Run 100 times — must always return the same result
    for (let i = 0; i < 100; i++) {
      expect(evaluateCondition(cond, ctx)).toBe(true);
    }
  });

  it('has no side effects on context', () => {
    const progression = makeProgression({ scrap: 100 });
    const stages = { 'stage:junkyard-01': { completed: true } };
    const ctx = createConditionContext(progression, { stages });
    const ctxBefore = JSON.stringify(ctx);

    evaluateCondition({ type: 'scrap-total', threshold: 50 }, ctx);
    evaluateCondition({ type: 'all', conditions: [
      { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
      { type: 'not', condition: { type: 'scrap-total', threshold: 999 } },
    ] }, ctx);

    // Context must be unchanged
    expect(JSON.stringify(ctx)).toBe(ctxBefore);
  });
});
