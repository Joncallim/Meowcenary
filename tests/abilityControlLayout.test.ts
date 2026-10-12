import { describe, expect, it } from 'vitest';
import { physicalToLogical, responsiveGameUiViewport, safeDisplayScale } from '../src/ui/layout';
import { ZERO_SAFE_AREA, type SafeAreaInsetsPx } from '../src/platform/safeArea';
import {
  DEFAULT_ABILITY_CONTROL_PREFERENCE,
  parseAbilityButtonSide,
  resolveAbilityControlLayout,
} from '../src/presentation/abilityControlLayout';

describe('ability control preference contract', () => {
  it('defaults to a frozen Left preference and accepts only primitive enum strings', () => {
    expect(DEFAULT_ABILITY_CONTROL_PREFERENCE).toEqual({ abilityButtonSide: 'left' });
    expect(Object.isFrozen(DEFAULT_ABILITY_CONTROL_PREFERENCE)).toBe(true);
    expect(parseAbilityButtonSide(undefined)).toBe('left');
    expect(parseAbilityButtonSide('left')).toBe('left');
    expect(parseAbilityButtonSide('right')).toBe('right');
    expect(parseAbilityButtonSide('invalid', 'right')).toBe('right');
    expect(parseAbilityButtonSide(new String('right'))).toBe('left');
    expect(parseAbilityButtonSide(new String('left'), 'right')).toBe('right');
    expect(parseAbilityButtonSide({ abilityButtonSide: 'left' }, 'right')).toBe('left');
    expect(parseAbilityButtonSide(Object.create({ abilityButtonSide: 'left' }), 'right')).toBe('right');
    const getter = Object.defineProperty({}, 'abilityButtonSide', { get: () => 'left' });
    expect(parseAbilityButtonSide(getter, 'right')).toBe('right');
  });
});

describe('resolveAbilityControlLayout', () => {
  const profiles = [
    ['small phone', 360, 640, ZERO_SAFE_AREA],
    ['portrait phone', 390, 844, ZERO_SAFE_AREA],
    ['tablet', 1024, 768, ZERO_SAFE_AREA],
    ['foldable', 1114, 720, ZERO_SAFE_AREA],
    ['desktop', 1280, 720, ZERO_SAFE_AREA],
    ['large desktop', 1920, 1080, ZERO_SAFE_AREA],
    ['asymmetric portrait safe area', 390, 844, { top: 32, right: 0, bottom: 18, left: 47 }],
    ['asymmetric landscape safe area', 844, 390, { top: 0, right: 51, bottom: 22, left: 12 }],
  ] as const;

  it.each(profiles)('keeps the authored physical card size and exact edge formulas at %s', (_name, width, height, insets) => {
    const viewport = responsiveGameUiViewport(width, height, insets as SafeAreaInsetsPx);
    const layout = resolveAbilityControlLayout(viewport, 'left');
    const right = resolveAbilityControlLayout(viewport, 'right');
    const w = physicalToLogical(120, viewport);
    const h = physicalToLogical(60, viewport);
    const inset = physicalToLogical(12, viewport);
    const leftMargin = physicalToLogical(12, viewport) + viewport.layoutInsets.left;
    const rightMargin = physicalToLogical(12, viewport) + viewport.layoutInsets.right;
    const bottomMargin = physicalToLogical(12, viewport) + viewport.layoutInsets.bottom;

    expect(layout).toEqual({ x: leftMargin + inset + w / 2, y: viewport.canvasHeight - bottomMargin - inset - h / 2, width: w, height: h });
    expect(right).toEqual({ x: viewport.canvasWidth - rightMargin - inset - w / 2, y: layout.y, width: w, height: h });
    expect(layout.width * safeDisplayScale(viewport)).toBeCloseTo(120);
    expect(layout.height * safeDisplayScale(viewport)).toBeCloseTo(60);
    expect(layout.x).toBeLessThan(right.x);
  });

  it('does not encode an input remap or mutable layout state', () => {
    const viewport = responsiveGameUiViewport(390, 844);
    const left = resolveAbilityControlLayout(viewport, 'left');
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.keys(left).sort()).toEqual(['height', 'width', 'x', 'y']);
  });
});
