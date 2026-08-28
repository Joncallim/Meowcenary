import { describe, expect, it } from 'vitest';
import {
  createStageState,
  activateStage,
  updateObjectiveProgress,
  winStage,
  failStage,
  tickStage,
} from '../src/gameplay/stage/stageContracts';
import { createObjectiveProgress, recordKill } from '../src/gameplay/objectiveProgress';
import type { ObjectiveType } from '../src/gameplay/stage/stageContracts';

const killObjective: ObjectiveType = { type: 'kill', count: 20 };

describe('stage state lifecycle (Epic 20 §3.4)', () => {
  it('starts in intro with zero time and progress', () => {
    const state = createStageState('stage:junkyard-01', killObjective);
    expect(state).toMatchObject({ status: 'intro', stageId: 'stage:junkyard-01', timeMs: 0 });
    expect(state.objectiveProgress).toEqual({ type: 'kill', current: 0, target: 20 });
  });

  it('intro → active via activateStage (idempotent)', () => {
    const intro = createStageState('stage:junkyard-01', killObjective);
    const active = activateStage(intro);
    expect(active.status).toBe('active');
    expect(activateStage(active)).toBe(active);
    // Cannot activate from a terminal state
    expect(activateStage({ ...active, status: 'failed' })).toMatchObject({ status: 'failed' });
  });

  it('objective completion transitions active → objective-complete exactly once', () => {
    let state = activateStage(createStageState('stage:junkyard-01', killObjective));
    state = updateObjectiveProgress(state, 20);
    expect(state.status).toBe('objective-complete');
    expect(state.objectiveProgress.current).toBe(20);
    // Repeated updates cannot double-bank or re-fire
    const again = updateObjectiveProgress(state, 20);
    expect(again.status).toBe('objective-complete');
    expect(again.objectiveProgress.current).toBe(20);
  });

  it('updates are ignored outside the active status', () => {
    const won = { ...createStageState('s', killObjective), status: 'won' as const };
    expect(updateObjectiveProgress(won, 5)).toBe(won);
  });

  it('objective-complete → won directly (immediate win path)', () => {
    let state = activateStage(createStageState('stage:junkyard-01', killObjective));
    state = updateObjectiveProgress(state, 20);
    expect(winStage(state).status).toBe('won');
  });

  it('win is rejected from illegal states', () => {
    const intro = createStageState('stage:junkyard-01', killObjective);
    expect(winStage(intro)).toBe(intro);
    const active = activateStage(intro);
    expect(winStage(active)).toBe(active);
  });

  it('fail is allowed from any non-terminal status and is terminal', () => {
    for (const status of ['intro', 'active', 'objective-complete'] as const) {
      const state = { ...createStageState('s', killObjective), status };
      const failed = failStage(state);
      expect(failed.status).toBe('failed');
      expect(failStage(failed)).toBe(failed);
    }
  });

  it('tickStage advances time only while non-terminal and with positive finite deltas', () => {
    let state = activateStage(createStageState('stage:junkyard-03', { type: 'survive', seconds: 120 }));
    state = tickStage(state, 16);
    expect(state.timeMs).toBe(16);
    state = tickStage(state, 0);
    expect(state.timeMs).toBe(16);
    state = tickStage(state, Number.NaN);
    expect(state.timeMs).toBe(16);
    const won = { ...state, status: 'won' as const };
    expect(tickStage(won, 16)).toBe(won);
  });

  it('survive objective completes via progress updates (pause-safe: no time advance while paused)', () => {
    // pause-safe means time only advances via explicit tick with a delta;
    // a paused loop simply stops calling tickStage.
    let state = activateStage(createStageState('stage:junkyard-03', { type: 'survive', seconds: 120 }));
    state = updateObjectiveProgress(state, 120);
    expect(state.status).toBe('objective-complete');
  });

  it('objective progress helpers compose with the state machine', () => {
    let state = activateStage(createStageState('stage:junkyard-01', killObjective));
    let progress = state.objectiveProgress;
    progress = recordKill(progress);
    progress = recordKill(progress);
    state = { ...state, objectiveProgress: progress };
    // 2/20 — still active
    expect(state.status).toBe('active');
    // Fast-forward the remaining 18
    state = updateObjectiveProgress(state, 18);
    expect(state.status).toBe('objective-complete');
    expect(createObjectiveProgress(killObjective).current).toBe(0);
  });
});
