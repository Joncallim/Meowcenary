export const ThemeColor = {
  background: 0x101820,
  surface: 0x081118,
  surfaceTranslucent: 0x081118,
  card: 0x17303b,
  cardHover: 0x214756,
  primary: 0x2dd4bf,
  primaryDim: 0x67e8f9,
  cream: 0xf7f1d5,
  text: 0xd6f7ff,
  muted: 0xa5f3fc,
  gold: 0xfbbf24,
  white: 0xffffff,
  danger: 0xf87171,
} as const;

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

export function reducedMotionDuration(
  baseMs: number,
  reducedMotion: boolean,
): number {
  return reducedMotion ? 0 : baseMs;
}
