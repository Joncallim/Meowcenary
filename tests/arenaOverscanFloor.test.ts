import { describe, expect, it } from 'vitest';
import './__mocks__/phaser';
import { ArenaWorldView } from '../src/systems/arenaScenery';
import { resolveArenaCameraFraming } from '../src/gameplay/responsiveArenaPresentation';

describe('arena overscan bitmap ownership', () => {
  it('covers fractional camera bounds using stable integer backing dimensions', () => {
    const floor = {
      x: 0, y: 0, width: 0, height: 0, originX: 0, originY: 0,
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
      setSize(width: number, height: number) { this.width = width; this.height = height; return this; },
      setOrigin(origin: number) { this.originX = origin; this.originY = origin; return this; },
    };
    const view = Object.create(ArenaWorldView.prototype) as ArenaWorldView;
    Object.assign(view, { overscanFloor: floor });
    for (const canvas of [{ width: 390, height: 844 }, { width: 1114, height: 720 }, { width: 1920, height: 1080 }]) {
      const { bounds } = resolveArenaCameraFraming({ width: 768, height: 1344 }, canvas, 1.25, { x: 7.7, y: 29.4 });
      view.applyPresentationBounds(bounds);
      // DOM canvas dimensions are integers. A fractional TileSprite size
      // fails its bitmap equality check on every render and reallocates.
      expect(Number.isInteger(floor.width)).toBe(true);
      expect(Number.isInteger(floor.height)).toBe(true);
      expect(floor.width).toBeGreaterThanOrEqual(bounds.width);
      expect(floor.width).toBeLessThan(bounds.width + 1);
      expect(floor.height).toBeGreaterThanOrEqual(bounds.height);
      expect(floor.height).toBeLessThan(bounds.height + 1);
      expect(floor.x - floor.width * floor.originX).toBeLessThanOrEqual(bounds.x);
      expect(floor.y - floor.height * floor.originY).toBeLessThanOrEqual(bounds.y);
      expect(floor.x + floor.width * (1 - floor.originX)).toBeGreaterThanOrEqual(bounds.x + bounds.width);
      expect(floor.y + floor.height * (1 - floor.originY)).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    }
  });
});
