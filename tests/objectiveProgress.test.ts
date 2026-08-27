import { describe, expect, it } from 'vitest';
import {
  createObjectiveProgress,
  recordKill,
  recordCollect,
  tickSurvive,
  recordDefeat,
  isObjectiveComplete,
  describeObjective,
} from '../src/gameplay/objectiveProgress';
import type { ObjectiveType } from '../src/gameplay/stage/stageContracts';

const killObjective: ObjectiveType = { type: 'kill', count: 20 };
const taggedKill: ObjectiveType = { type: 'kill', count: 5, enemyTag: 'tank' };
const collectObjective: ObjectiveType = { type: 'collect', itemId: 'item:scrap-cache', count: 8 };
const surviveObjective: ObjectiveType = { type: 'survive', seconds: 120 };
const defeatObjective: ObjectiveType = { type: 'defeat', enemyId: 'enemy:trash-brute' };

describe('objective progress helpers (pure)', () => {
  it('creates initial progress with the correct target per objective type', () => {
    expect(createObjectiveProgress(killObjective)).toEqual({ type: 'kill', current: 0, target: 20 });
    expect(createObjectiveProgress(collectObjective)).toEqual({ type: 'collect', current: 0, target: 8 });
    expect(createObjectiveProgress(surviveObjective)).toEqual({ type: 'survive', current: 0, target: 120 });
    expect(createObjectiveProgress(defeatObjective)).toEqual({ type: 'defeat', current: 0, target: 1 });
  });

  it('records kills up to the target and stops (exactly-once, no double-bank)', () => {
    let p = createObjectiveProgress(killObjective);
    for (let i = 0; i < 25; i++) p = recordKill(p);
    expect(p.current).toBe(20);
    expect(isObjectiveComplete(p)).toBe(true);
    // Idempotent at the cap: repeated kills return the same frozen reference
    const after = recordKill(p);
    expect(after).toBe(p);
  });

  it('applies enemy-tag filters to kill objectives', () => {
    let p = createObjectiveProgress(taggedKill);
    // recordKill(progress, enemyArchetype, enemyTag): wrong tag — ignored
    p = recordKill(p, 'rusher', 'tank');
    expect(p.current).toBe(0);
    p = recordKill(p, 'tank', 'tank');
    expect(p.current).toBe(1);
  });

  it('ignores events of the wrong objective type', () => {
    const p = createObjectiveProgress(collectObjective);
    expect(recordKill(p)).toBe(p);
    expect(tickSurvive(p, 1000)).toBe(p);
    expect(recordDefeat(p, 'enemy:trash-brute', 'enemy:trash-brute')).toBe(p);
  });

  it('collects only the required item', () => {
    let p = createObjectiveProgress(collectObjective);
    p = recordCollect(p, 'item:other', 'item:scrap-cache');
    expect(p.current).toBe(0);
    for (let i = 0; i < 10; i++) p = recordCollect(p, 'item:scrap-cache', 'item:scrap-cache');
    expect(p.current).toBe(8);
    expect(isObjectiveComplete(p)).toBe(true);
  });

  it('advances survive time in seconds, clamped to target', () => {
    let p = createObjectiveProgress(surviveObjective);
    p = tickSurvive(p, 30_000);
    expect(p.current).toBe(30);
    p = tickSurvive(p, 5_000);
    expect(p.current).toBe(35);
    p = tickSurvive(p, 1_000_000);
    expect(p.current).toBe(120);
    expect(isObjectiveComplete(p)).toBe(true);
  });

  it('completes a defeat objective only for the named enemy, once', () => {
    let p = createObjectiveProgress(defeatObjective);
    p = recordDefeat(p, 'enemy:other', 'enemy:trash-brute');
    expect(p.current).toBe(0);
    p = recordDefeat(p, 'enemy:trash-brute', 'enemy:trash-brute');
    expect(p.current).toBe(1);
    expect(isObjectiveComplete(p)).toBe(true);
    const again = recordDefeat(p, 'enemy:trash-brute', 'enemy:trash-brute');
    expect(again).toBe(p);
  });

  it('describes objectives in player-readable text', () => {
    expect(describeObjective(killObjective)).toContain('20');
    expect(describeObjective(taggedKill)).toContain('tank');
    expect(describeObjective(collectObjective)).toContain('scrap-cache');
    expect(describeObjective(surviveObjective)).toContain('120');
    expect(describeObjective(defeatObjective)).toContain('trash-brute');
  });

  it('never mutates input progress (frozen immutability)', () => {
    const p = createObjectiveProgress(killObjective);
    const next = recordKill(p);
    expect(p.current).toBe(0);
    expect(next.current).toBe(1);
    expect(Object.isFrozen(next)).toBe(true);
  });
});
