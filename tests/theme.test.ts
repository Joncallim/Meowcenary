import { describe, expect, it } from 'vitest';
import { VisualDepth } from '../src/systems/visualDepths';
import { ThemeColor, ThemeDepth, themeColorCss } from '../src/ui/theme';

describe('semantic theme palette', () => {
  it('pins every rarity color independently from the legacy primary and muted tokens', () => {
    expect(ThemeColor.rarity).toEqual({
      common: 0x94a3b8,
      uncommon: 0x4ade80,
      rare: 0x60a5fa,
      epic: 0xc084fc,
      legendary: 0xfbbf24,
    });
    expect(ThemeColor.muted).toBe(0xa5f3fc);
    expect(ThemeColor.primary).toBe(0x2dd4bf);
    expect(ThemeColor.rarity.common).not.toBe(ThemeColor.muted);
    expect(ThemeColor.rarity.uncommon).not.toBe(ThemeColor.primary);
    expect(ThemeColor.rarity.rare).toBe(0x60a5fa);
    expect(ThemeColor.rarity.epic).toBe(0xc084fc);
    expect(ThemeColor.rarity.legendary).toBe(ThemeColor.gold);
  });

  it('serializes source rarity colors without view-local literals', () => {
    expect(themeColorCss(ThemeColor.rarity.common)).toBe('#94a3b8');
    expect(themeColorCss(ThemeColor.rarity.uncommon)).toBe('#4ade80');
    expect(themeColorCss(ThemeColor.rarity.rare)).toBe('#60a5fa');
    expect(themeColorCss(ThemeColor.rarity.epic)).toBe('#c084fc');
  });

  it('keeps rarity foregrounds independently contrast-safe and CVD-distinct over the HUD surface', () => {
    expect(contrastRatio(ThemeColor.rarity.common, ThemeColor.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(ThemeColor.rarity.uncommon, ThemeColor.surface)).toBeGreaterThanOrEqual(7);
    // A deuteranopia projection is deliberately separate from contrast: two
    // individually legible colors can still collapse into one hue cue.
    expect(deuteranopiaDistance(ThemeColor.rarity.common, ThemeColor.rarity.uncommon)).toBeGreaterThan(40);
  });
});

describe('semantic theme depth bands', () => {
  it('keeps world, HUD backing, HUD, transient, pause, chooser, and debug in strict order', () => {
    expect(Math.max(...Object.values(VisualDepth))).toBeLessThan(ThemeDepth.hudBacking);
    expect(ThemeDepth.hudBacking).toBe(90);
    expect(ThemeDepth.hudBacking).toBeLessThan(ThemeDepth.hud);
    expect(ThemeDepth.hud).toBe(100);
    expect(ThemeDepth.hud).toBeLessThan(ThemeDepth.transientHint);
    expect(ThemeDepth.transientHint).toBe(200);
    expect(ThemeDepth.transientHint).toBeLessThan(ThemeDepth.pauseSummary);
    expect(ThemeDepth.pauseSummary).toBe(800);
    expect(ThemeDepth.pauseSummary).toBeLessThan(ThemeDepth.upgradeChooser);
    expect(ThemeDepth.upgradeChooser).toBe(1000);
    expect(ThemeDepth.upgradeChooser).toBeLessThan(ThemeDepth.debugOverlay);
    expect(ThemeDepth.debugOverlay).toBe(2000);
  });
});

function contrastRatio(first: number, second: number): number {
  const luminance = (color: number): number => {
    const channels = [color >> 16 & 0xff, color >> 8 & 0xff, color & 0xff];
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function deuteranopiaDistance(first: number, second: number): number {
  const project = (color: number): readonly [number, number, number] => {
    const r = color >> 16 & 0xff;
    const g = color >> 8 & 0xff;
    const b = color & 0xff;
    return [0.625 * r + 0.375 * g, 0.70 * r + 0.30 * g, 0.30 * g + 0.70 * b];
  };
  const a = project(first);
  const b = project(second);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
