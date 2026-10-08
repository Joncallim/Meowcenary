import type { EventBus } from '../engine/eventBus';
import type { RunState } from './runState';
import { growth } from './curves';

const XP_BASE = 5;
const XP_GROWTH = 1.35;

export function xpToNext(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.ceil(growth(XP_BASE, XP_GROWTH, safeLevel - 1));
}

export function applyXp(runState: RunState, amount: number, bus?: EventBus): number {
  if (runState.status !== 'active') return 0;
  return awardXp(runState, amount, bus);
}

/** A pulse admitted while active may finish its synchronous grants through
 * its level-up pause. The grant capability expires when the callback exits;
 * ordinary XP grants remain active-only. */
export function withActivatedXpPulse<T>(
  runState: RunState,
  bus: EventBus,
  collect: (grantXp: (amount: number) => number) => T,
): T | undefined {
  if (runState.status !== 'active') return undefined;
  let open = true;
  try {
    return collect((amount) => {
      if (!open || (runState.status !== 'active'
        && !(runState.status === 'paused' && runState.pauseReason === 'levelUp'))) return 0;
      return awardXp(runState, amount, bus);
    });
  } finally {
    open = false;
  }
}

function awardXp(runState: RunState, amount: number, bus?: EventBus): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const gained = amount * runState.stats.resolve('xpGain', 1);
  if (!Number.isFinite(gained) || gained <= 0) {
    return 0;
  }

  runState.xp += gained;
  bus?.emit('xp:gained', { amount: gained, total: runState.xp });

  let levelsGained = 0;
  while (runState.xp >= runState.xpToNext) {
    runState.xp -= runState.xpToNext;
    runState.level += 1;
    runState.xpToNext = xpToNext(runState.level);
    levelsGained += 1;
    bus?.emit('level:up', { level: runState.level });
  }

  return levelsGained;
}
