import { describe, expect, it } from 'vitest';
import { ThemeColor, themeColorCss } from '../src/ui/theme';

describe('semantic theme palette', () => {
  it('keeps every rarity alias in the source palette', () => {
    expect(ThemeColor.rarity).toEqual({
      common: ThemeColor.muted,
      uncommon: ThemeColor.primary,
      rare: ThemeColor.rarity.rare,
      epic: ThemeColor.rarity.epic,
      legendary: ThemeColor.gold,
    });
    expect(ThemeColor.rarity.common).toBe(ThemeColor.muted);
    expect(ThemeColor.rarity.uncommon).toBe(ThemeColor.primary);
    expect(ThemeColor.rarity.legendary).toBe(ThemeColor.gold);
  });

  it('serializes source rarity colors without view-local literals', () => {
    expect(themeColorCss(ThemeColor.rarity.rare)).toMatch(/^#[0-9a-f]{6}$/);
    expect(themeColorCss(ThemeColor.rarity.epic)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
