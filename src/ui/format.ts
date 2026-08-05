import type { StatKey } from '../gameplay/stats';

const EM_DASH = '\u2014';

export function formatTime(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return EM_DASH;
  }

  if (Object.is(value, -0)) {
    return '0';
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatStat(key: StatKey, value: number): string {
  if (!Number.isFinite(value)) {
    return EM_DASH;
  }

  switch (key) {
    case 'critChance':
      return `${formatNumber(value * 100)}%`;
    case 'attackSpeed':
    case 'xpGain':
    case 'currencyGain':
      return `\u00d7${formatNumber(value)}`;
    case 'projectileCount':
      return formatNumber(Math.trunc(value));
    default:
      return formatNumber(value);
  }
}
