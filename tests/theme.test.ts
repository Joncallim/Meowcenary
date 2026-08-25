import { describe, expect, it } from 'vitest';
import { ThemeColor, themeColorCss } from '../src/ui/theme';

describe('semantic theme palette', () => {
  it('keeps every rarity alias in the source palette', () => {
    // M-09 contract-test exception: rare/epic are the frozen source palette
    // values (no shared alias), so the literals belong HERE — a self-referential
    // `ThemeColor.rarity.rare` assertion would stay green under a hue mutation.
    expect(ThemeColor.rarity).toEqual({
      common: ThemeColor.muted,
      uncommon: ThemeColor.primary,
      rare: 0x60a5fa,
      epic: 0xc084fc,
      legendary: ThemeColor.gold,
    });
    expect(ThemeColor.rarity.common).toBe(ThemeColor.muted);
    expect(ThemeColor.rarity.uncommon).toBe(ThemeColor.primary);
    expect(ThemeColor.rarity.rare).toBe(0x60a5fa);
    expect(ThemeColor.rarity.epic).toBe(0xc084fc);
    expect(ThemeColor.rarity.legendary).toBe(ThemeColor.gold);
  });

  it('serializes source rarity colors without view-local literals', () => {
    expect(themeColorCss(ThemeColor.rarity.rare)).toBe('#60a5fa');
    expect(themeColorCss(ThemeColor.rarity.epic)).toBe('#c084fc');
  });
});
