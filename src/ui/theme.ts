const THEME_PRIMARY = 0x2dd4bf;
const THEME_MUTED = 0xa5f3fc;
const THEME_GOLD = 0xfbbf24;

export const ThemeColor = {
  background: 0x101820,
  surface: 0x081118,
  surfaceTranslucent: 0x081118,
  card: 0x17303b,
  cardHover: 0x214756,
  primary: THEME_PRIMARY,
  primaryDim: 0x67e8f9,
  cream: 0xf7f1d5,
  text: 0xd6f7ff,
  muted: THEME_MUTED,
  gold: THEME_GOLD,
  white: 0xffffff,
  danger: 0xf87171,
  rarity: {
    common: THEME_MUTED,
    uncommon: THEME_PRIMARY,
    rare: 0x60a5fa,
    epic: 0xc084fc,
    legendary: THEME_GOLD,
  },
} as const;

export function themeColorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export const ThemeDepth = {
  world: 0,
  hud: 100,
  transientHint: 200,
  pauseSummary: 800,
  upgradeChooser: 1000,
  debugOverlay: 2000,
} as const;

export const ThemeFont = {
  family: 'Inter, sans-serif',
  bodyMin: 12,
  labelMin: 14,
  headingMin: 18,
} as const;

export const FocusStroke = {
  color: ThemeColor.cream,
  alpha: 1,
  width: 2,
} as const;

import { motionDuration } from '../engine/motion';

export function reducedMotionDuration(
  baseMs: number,
  reducedMotion: boolean,
): number {
  return motionDuration(baseMs, reducedMotion);
}
