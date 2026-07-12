import type { EventBus } from '../engine/eventBus';
import type { RunState } from './runState';

const XP_BASE = 5;
const XP_GROWTH = 1.35;

export function xpToNext(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.ceil(XP_BASE * XP_GROWTH ** (safeLevel - 1));
}

export function applyXp(runState: RunState, amount: number, bus?: EventBus): number {
  if (runState.status !== 'active' || !Number.isFinite(amount) || amount <= 0) {
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
