import type { EventBus } from '../engine/eventBus';
import { ModifierStack } from './stats';
import type { WeaponInstance } from './weapons';
import { xpToNext } from './xp';

export type RunStatus = 'intro' | 'active' | 'paused' | 'won' | 'lost';
export type RunOutcome = 'won' | 'lost';
export type PauseReason = 'manual' | 'levelUp';

export interface RunState {
  status: RunStatus;
  seed: number;
  characterId: string;
  arenaId: string;
  timeMs: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  currency: number;
  stats: ModifierStack;
  equipped: WeaponInstance[];
  upgradeStacks: Record<string, number>;
  pauseReason: PauseReason | null;
  outcome?: RunOutcome;
}

export interface CreateRunStateOptions {
  seed: number;
  characterId: string;
  arenaId: string;
}

export function createRunState(opts: CreateRunStateOptions): RunState {
  return {
    status: 'intro',
    seed: opts.seed,
    characterId: opts.characterId,
    arenaId: opts.arenaId,
    timeMs: 0,
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    kills: 0,
    currency: 0,
    stats: new ModifierStack(),
    equipped: [],
    upgradeStacks: {},
    pauseReason: null,
  };
}

export function startRun(state: RunState, bus?: EventBus): void {
  if (state.status === 'intro') {
    state.status = 'active';
    state.pauseReason = null;
    bus?.emit('run:start', {
      characterId: state.characterId,
      arenaId: state.arenaId,
      seed: state.seed,
    });
  }
}

export function pauseRun(state: RunState, bus?: EventBus, reason: PauseReason = 'manual'): void {
  if (state.status !== 'active') {
    return;
  }

  state.status = 'paused';
  state.pauseReason = reason;
  bus?.emit('run:paused', {});
}

export function resumeRun(state: RunState, bus?: EventBus, reason?: PauseReason): void {
  if (state.status !== 'paused') {
    return;
  }

  if (reason !== undefined && state.pauseReason !== reason) {
    return;
  }

  state.status = 'active';
  state.pauseReason = null;
  bus?.emit('run:resumed', {});
}

export function tickRun(state: RunState, dtMs: number): void {
  if (state.status !== 'active' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }

  state.timeMs += dtMs;
}

export function canRestartRun(state: RunState | undefined): boolean {
  return state?.status === 'won' || state?.status === 'lost';
}

export function endRun(state: RunState, outcome: RunOutcome, bus?: EventBus): void {
  if (state.status !== 'active') {
    return;
  }

  state.status = outcome;
  state.outcome = outcome;
  const payload = { timeMs: state.timeMs, level: state.level, kills: state.kills };
  if (outcome === 'won') {
    bus?.emit('run:won', payload);
  } else {
    bus?.emit('run:lost', payload);
  }
}
