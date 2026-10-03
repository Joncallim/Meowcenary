import { describe, expect, it } from 'vitest';
import {
  resolveActorPresentationPadding,
  resolveArenaCameraFraming,
  responsiveArenaPresentationBounds,
} from '../src/gameplay/responsiveArenaPresentation';

const PLAYER_BODY_RADIUS = 14;
const ACTOR_DISPLAY_SIZE = 28 * 1.55;
const ACTOR_PADDING = ACTOR_DISPLAY_SIZE / 2 - PLAYER_BODY_RADIUS;

describe('arena camera presentation bounds', () => {
  it('derives the current character overhang from display bounds and body radius', () => {
    const halfDisplay = ACTOR_DISPLAY_SIZE / 2;
    const padding = resolveActorPresentationPadding(
      { x: 384 - halfDisplay, y: 672 - halfDisplay, width: ACTOR_DISPLAY_SIZE, height: ACTOR_DISPLAY_SIZE },
      { x: 384, y: 672 },
      PLAYER_BODY_RADIUS,
    );
    expect(padding.x).toBeCloseTo(7.7, 9);
    expect(padding.y).toBeCloseTo(7.7, 9);
    expect(Object.isFrozen(padding)).toBe(true);
  });

  it('uses the larger extent on each axis for asymmetric and mirrored art', () => {
    const position = { x: 100, y: 100 };
    const rightHeavy = resolveActorPresentationPadding(
      { x: 80, y: 70, width: 50, height: 70 }, position, PLAYER_BODY_RADIUS,
    );
    const leftHeavy = resolveActorPresentationPadding(
      { x: 70, y: 60, width: 50, height: 70 }, position, PLAYER_BODY_RADIUS,
    );
    expect(rightHeavy).toEqual({ x: 16, y: 26 });
    expect(leftHeavy).toEqual({ x: 16, y: 26 });
    expect(resolveActorPresentationPadding(
      { x: 90, y: 90, width: 20, height: 20 }, position, PLAYER_BODY_RADIUS,
    )).toEqual({ x: 0, y: 0 });
  });

  it('accounts for the actual offset player shadow as part of camera composition', () => {
    const padding = resolveActorPresentationPadding(
      { x: 78.3, y: 58.3, width: 43.4, height: 65.1 }, { x: 100, y: 80 }, PLAYER_BODY_RADIUS,
    );
    expect(padding.x).toBeCloseTo(7.7);
    expect(padding.y).toBeCloseTo(29.4);
    const framing = resolveArenaCameraFraming({ width: 768, height: 1344 }, { width: 390, height: 844 }, 1.25, padding);
    expect(framing.bounds.y).toBeCloseTo(-29.4);
    expect(framing.bounds.y + framing.bounds.height).toBeCloseTo(1373.4);
  });

  it('includes actor art beyond all four physical arena edges', () => {
    const bounds = responsiveArenaPresentationBounds(
      768, 1344, 390, 844, 1.25, { x: ACTOR_PADDING, y: ACTOR_PADDING },
    );
    expect(bounds.x).toBeCloseTo(-7.7, 9);
    expect(bounds.y).toBeCloseTo(-7.7, 9);
    expect(bounds.width).toBeCloseTo(783.4, 9);
    expect(bounds.height).toBeCloseTo(1359.4, 9);
    expect(bounds).toEqual(expect.objectContaining({
      centerX: 384,
      centerY: 672,
    }));
    expect(bounds.x + bounds.width).toBeCloseTo(775.7, 9);
    expect(bounds.y + bounds.height).toBeCloseTo(1351.7, 9);
  });

  it('centers a truly small arena without camera follow', () => {
    const framing = resolveArenaCameraFraming(
      { width: 200, height: 300 }, { width: 390, height: 844 }, 1.25,
      { x: ACTOR_PADDING, y: ACTOR_PADDING },
    );
    expect(framing.follow).toBe(false);
    expect(framing.bounds.x).toBeCloseTo(-56, 9);
    expect(framing.bounds.y).toBeCloseTo(-187.6, 9);
    expect(framing.bounds.width).toBeCloseTo(312, 9);
    expect(framing.bounds.height).toBeCloseTo(675.2, 9);
  });

  it('follows when an exactly visible arena gains actor overhang', () => {
    const arena = { width: 312, height: 675.2 };
    const canvas = { width: 390, height: 844 };
    expect(resolveArenaCameraFraming(arena, canvas, 1.25).follow).toBe(false);
    const framing = resolveArenaCameraFraming(
      arena, canvas, 1.25, { x: ACTOR_PADDING, y: ACTOR_PADDING },
    );
    expect(framing.follow).toBe(true);
    expect(framing.bounds.x).toBeCloseTo(-7.7, 9);
    expect(framing.bounds.y).toBeCloseTo(-7.7, 9);

    // Only one padded axis needs scrolling; the other remains centered.
    const oneAxis = resolveArenaCameraFraming(
      { width: 300, height: 300 }, canvas, 1.25, { x: ACTOR_PADDING, y: 0 },
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
    { name: 'desktop', canvas: { width: 1920, height: 1080 }, expectedWidth: 1536, expectedX: -384 },
  ])('shares the same padded arena and viewport envelope on $name', ({ canvas, expectedWidth, expectedX }) => {
    const framing = resolveArenaCameraFraming(
      { width: 768, height: 1344 }, canvas, 1.25,
      { x: ACTOR_PADDING, y: ACTOR_PADDING },
    );
    expect(framing.follow).toBe(true);
    expect(framing.bounds.width).toBeCloseTo(expectedWidth, 9);
    expect(framing.bounds.x).toBeCloseTo(expectedX, 9);
    expect(framing.bounds.height).toBeCloseTo(1359.4, 9);
    expect(framing.bounds.y).toBeCloseTo(-7.7, 9);
  });

  it('preserves the zero-padding contract and immutable input/output boundaries', () => {
    const arena = Object.freeze({ width: 768, height: 1344 });
    const canvas = Object.freeze({ width: 1920, height: 1080 });
    const padding = Object.freeze({ x: 0, y: 0 });
    const framing = resolveArenaCameraFraming(arena, canvas, 1.25, padding);
    expect(framing.bounds).toEqual(responsiveArenaPresentationBounds(768, 1344, 1920, 1080, 1.25));
    expect(framing.bounds).toEqual({
      x: -384, y: 0, width: 1536, height: 1344, centerX: 384, centerY: 672,
    });
    expect(Object.isFrozen(framing)).toBe(true);
    expect(Object.isFrozen(framing.bounds)).toBe(true);
    expect(arena).toEqual({ width: 768, height: 1344 });
    expect(canvas).toEqual({ width: 1920, height: 1080 });
    expect(padding).toEqual({ x: 0, y: 0 });
  });
});
