import { describe, expect, it } from 'vitest';
import {
  resolveActorPresentationPadding,
  resolveArenaCameraFraming,
  responsiveArenaPresentationBounds,
} from '../src/gameplay/responsiveArenaPresentation';

const PLAYER_BODY_RADIUS = 14;
const ACTOR_DISPLAY_SIZE = 28 * 1.55;
const ACTOR_PADDING = ACTOR_DISPLAY_SIZE / 2 - PLAYER_BODY_RADIUS;
const SYMMETRIC_PADDING = { left: ACTOR_PADDING, right: ACTOR_PADDING, top: ACTOR_PADDING, bottom: ACTOR_PADDING };
const COMPLETE_PLAYER_PADDING = { left: ACTOR_PADDING, right: ACTOR_PADDING, top: ACTOR_PADDING, bottom: 29.4 };

describe('arena camera presentation bounds', () => {
  it('derives the current character overhang from display bounds and body radius', () => {
    const halfDisplay = ACTOR_DISPLAY_SIZE / 2;
    const padding = resolveActorPresentationPadding(
      { x: 384 - halfDisplay, y: 672 - halfDisplay, width: ACTOR_DISPLAY_SIZE, height: ACTOR_DISPLAY_SIZE },
      { x: 384, y: 672 },
      PLAYER_BODY_RADIUS,
    );
    expect(padding.left).toBeCloseTo(7.7, 9);
    expect(padding.right).toBeCloseTo(7.7, 9);
    expect(padding.top).toBeCloseTo(7.7, 9);
    expect(padding.bottom).toBeCloseTo(7.7, 9);
    expect(Object.isFrozen(padding)).toBe(true);
  });

  it('preserves separate extents for asymmetric and mirrored art', () => {
    const position = { x: 100, y: 100 };
    const rightHeavy = resolveActorPresentationPadding(
      { x: 80, y: 70, width: 50, height: 70 }, position, PLAYER_BODY_RADIUS,
    );
    const leftHeavy = resolveActorPresentationPadding(
      { x: 70, y: 60, width: 50, height: 70 }, position, PLAYER_BODY_RADIUS,
    );
    expect(rightHeavy).toEqual({ left: 6, right: 16, top: 16, bottom: 26 });
    expect(leftHeavy).toEqual({ left: 16, right: 6, top: 26, bottom: 16 });
    expect(resolveActorPresentationPadding(
      { x: 90, y: 90, width: 20, height: 20 }, position, PLAYER_BODY_RADIUS,
    )).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('accounts for the actual offset player shadow as part of camera composition', () => {
    const padding = resolveActorPresentationPadding(
      { x: 78.3, y: 58.3, width: 43.4, height: 65.1 }, { x: 100, y: 80 }, PLAYER_BODY_RADIUS,
    );
    expect(padding.left).toBeCloseTo(7.7);
    expect(padding.right).toBeCloseTo(7.7);
    expect(padding.top).toBeCloseTo(7.7);
    expect(padding.bottom).toBeCloseTo(29.4);
    const framing = resolveArenaCameraFraming({ width: 768, height: 1344 }, { width: 390, height: 844 }, 1.25, padding);
    expect(framing.bounds.y).toBeCloseTo(-7.7);
    expect(framing.bounds.y + framing.bounds.height).toBeCloseTo(1373.4);
    expect(framing.bounds.centerY).toBeCloseTo(682.85);
  });

  it('includes actor art beyond all four physical arena edges', () => {
    const bounds = responsiveArenaPresentationBounds(
      768, 1344, 390, 844, 1.25, COMPLETE_PLAYER_PADDING,
    );
    expect(bounds.x).toBeCloseTo(-7.7, 9);
    expect(bounds.y).toBeCloseTo(-7.7, 9);
    expect(bounds.width).toBeCloseTo(783.4, 9);
    expect(bounds.height).toBeCloseTo(1381.1, 9);
    expect(bounds).toEqual(expect.objectContaining({
      centerX: 384,
      centerY: 682.85,
    }));
    expect(bounds.x + bounds.width).toBeCloseTo(775.7, 9);
    expect(bounds.y + bounds.height).toBeCloseTo(1373.4, 9);
  });

  it('centers a truly small arena without camera follow', () => {
    const framing = resolveArenaCameraFraming(
      { width: 200, height: 300 }, { width: 390, height: 844 }, 1.25,
      SYMMETRIC_PADDING,
    );
    expect(framing.follow).toBe(false);
    expect(framing.bounds.x).toBeCloseTo(-56, 9);
    expect(framing.bounds.y).toBeCloseTo(-187.6, 9);
    expect(framing.bounds.width).toBeCloseTo(312, 9);
    expect(framing.bounds.height).toBeCloseTo(675.2, 9);
  });

  it('centers extra viewport space on an asymmetric four-edge envelope', () => {
    const framing = resolveArenaCameraFraming(
      { width: 200, height: 300 }, { width: 390, height: 844 }, 1.25,
      { left: 6, right: 16, top: 16, bottom: 26 },
    );
    expect(framing.follow).toBe(false);
    expect(framing.bounds.centerX).toBe(105);
    expect(framing.bounds.centerY).toBe(155);
    expect(framing.bounds.x).toBeCloseTo(-51, 9);
    expect(framing.bounds.y).toBeCloseTo(-182.6, 9);
  });

  it('centers a static near-threshold arena on its asymmetric envelope', () => {
    const arena = Object.freeze({ width: 200, height: 630 });
    const canvas = Object.freeze({ width: 390, height: 844 });
    const framing = resolveArenaCameraFraming(arena, canvas, 1.25, COMPLETE_PLAYER_PADDING);
    expect(framing.follow).toBe(false);
    expect(framing.bounds.centerY).toBeCloseTo(325.85, 9);
    expect(framing.bounds.y).toBeCloseTo(-11.75, 9);
    expect(framing.bounds.y + framing.bounds.height).toBeCloseTo(663.45, 9);
    expect(framing.bounds.y).toBeLessThanOrEqual(-COMPLETE_PLAYER_PADDING.top);
    expect(framing.bounds.y + framing.bounds.height).toBeGreaterThanOrEqual(arena.height + COMPLETE_PLAYER_PADDING.bottom);
    // Centering on the authored arena instead would stop at 652.6 and clip
    // the shadow's bottom 6.8 world units even though the envelope fits.
    expect(arena.height / 2 + canvas.height / 1.25 / 2).toBeLessThan(arena.height + COMPLETE_PLAYER_PADDING.bottom);
  });

  it('follows when an exactly visible arena gains actor overhang', () => {
    const arena = { width: 312, height: 675.2 };
    const canvas = { width: 390, height: 844 };
    expect(resolveArenaCameraFraming(arena, canvas, 1.25).follow).toBe(false);
    const framing = resolveArenaCameraFraming(
      arena, canvas, 1.25, SYMMETRIC_PADDING,
    );
    expect(framing.follow).toBe(true);
    expect(framing.bounds.x).toBeCloseTo(-7.7, 9);
    expect(framing.bounds.y).toBeCloseTo(-7.7, 9);

    // Only one padded axis needs scrolling; the other remains centered.
    const oneAxis = resolveArenaCameraFraming(
      { width: 300, height: 300 }, canvas, 1.25,
      { left: ACTOR_PADDING, right: ACTOR_PADDING, top: 0, bottom: 0 },
    );
    expect(oneAxis.follow).toBe(true);
    expect(oneAxis.bounds.width).toBeCloseTo(315.4, 9);
    expect(oneAxis.bounds.height).toBeCloseTo(675.2, 9);
  });

  it.each([
    { name: 'small-phone', canvas: { width: 360, height: 640 }, expectedWidth: 783.4, expectedX: -7.7 },
    { name: 'high-dpr-phone', canvas: { width: 412, height: 915 }, expectedWidth: 783.4, expectedX: -7.7 },
    { name: 'landscape', canvas: { width: 844, height: 390 }, expectedWidth: 783.4, expectedX: -7.7 },
    { name: 'phone', canvas: { width: 390, height: 844 }, expectedWidth: 783.4, expectedX: -7.7 },
    { name: 'tablet portrait', canvas: { width: 768, height: 1024 }, expectedWidth: 783.4, expectedX: -7.7 },
    { name: 'foldable wide', canvas: { width: 1114, height: 720 }, expectedWidth: 891.2, expectedX: -61.6 },
    { name: 'desktop', canvas: { width: 1280, height: 720 }, expectedWidth: 1024, expectedX: -128 },
    { name: 'large desktop', canvas: { width: 1920, height: 1080 }, expectedWidth: 1536, expectedX: -384 },
  ])('shares the same padded arena and viewport envelope on $name', ({ canvas, expectedWidth, expectedX }) => {
    const framing = resolveArenaCameraFraming(
      { width: 768, height: 1344 }, canvas, 1.25,
      COMPLETE_PLAYER_PADDING,
    );
    expect(framing.follow).toBe(true);
    expect(framing.bounds.width).toBeCloseTo(expectedWidth, 9);
    expect(framing.bounds.x).toBeCloseTo(expectedX, 9);
    expect(framing.bounds.height).toBeCloseTo(1381.1, 9);
    expect(framing.bounds.y).toBeCloseTo(-7.7, 9);
    expect(framing.bounds.y + framing.bounds.height).toBeCloseTo(1373.4, 9);
  });

  it('preserves the zero-padding contract and immutable input/output boundaries', () => {
    const arena = Object.freeze({ width: 768, height: 1344 });
    const canvas = Object.freeze({ width: 1920, height: 1080 });
    const padding = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });
    const framing = resolveArenaCameraFraming(arena, canvas, 1.25, padding);
    expect(framing.bounds).toEqual(responsiveArenaPresentationBounds(768, 1344, 1920, 1080, 1.25));
    expect(framing.bounds).toEqual({
      x: -384, y: 0, width: 1536, height: 1344, centerX: 384, centerY: 672,
    });
    expect(Object.isFrozen(framing)).toBe(true);
    expect(Object.isFrozen(framing.bounds)).toBe(true);
    expect(arena).toEqual({ width: 768, height: 1344 });
    expect(canvas).toEqual({ width: 1920, height: 1080 });
    expect(padding).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
});
