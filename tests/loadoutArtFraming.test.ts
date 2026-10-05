import { describe, expect, it } from 'vitest';
import { resolveLoadoutArtCrop, resolveLoadoutArtPlacement, type LoadoutArtBounds } from '../src/presentation/loadoutArtFraming';

const padded: LoadoutArtBounds = { frameWidth: 96, frameHeight: 96, left: 16, top: 12, width: 64, height: 72 };

describe('visible Loadout art framing', () => {
  it('limits submitted Pistol quads to native pixels without changing full-canvas registration', () => {
    // Literal exported native geometry, independent of the framing table's
    // visible-size algorithm. These coordinates remain source-frame local.
    expect(resolveLoadoutArtCrop('gun-build-base:pistol'))
      .toEqual({ x: 87, y: 67, width: 114, height: 104 });
    expect(resolveLoadoutArtCrop('gun-build-part:receiver-heavy:t2'))
      .toEqual({ x: 103, y: 63, width: 74, height: 59 });
    expect(resolveLoadoutArtCrop('unregistered-art')).toBeUndefined();
    const chassis = { frameWidth: 358, frameHeight: 196, left: 89, top: 69, width: 110, height: 100 };
    const layer = { ...chassis, left: 105, top: 65, width: 70, height: 55 };
    const before = resolveLoadoutArtPlacement(chassis, [chassis, layer], 960, 650, 700, 700)!;
    expect(resolveLoadoutArtPlacement(layer, [chassis, layer], 960, 650, 700, 700)).toEqual(before);
    expect(before.width / before.height).toBeCloseTo(358 / 196);
    expect(resolveLoadoutArtCrop('gun-build-base:pistol')!.width * resolveLoadoutArtCrop('gun-build-base:pistol')!.height)
      .toBeLessThan(chassis.frameWidth * chassis.frameHeight / 5);
  });
  it('fits the visible object rather than transparent source padding', () => {
    const result = resolveLoadoutArtPlacement(padded, [padded], 200, 150, 144, 144)!;
    expect(result.width).toBe(192);
    expect(result.height).toBe(192);
    expect(result.x).toBe(200);
    expect(result.y).toBe(150);
    expect(result.height / padded.frameHeight * padded.height).toBe(144);
  });
  it('preserves non-square source aspect and fits both bounds', () => {
    const object = { frameWidth: 358, frameHeight: 196, left: 100, top: 70, width: 140, height: 75 };
    const result = resolveLoadoutArtPlacement(object, [object], 50, 100, 280, 160)!;
    expect(result.width / result.height).toBeCloseTo(358 / 196);
    expect(result.width / 358 * 140).toBe(280);
    expect(result.height / 196 * 75).toBe(150);
    expect(result.x + (object.left - 179) * 2).toBe(-90);
  });
  it('uses one transform for chassis and all before/after layers without independent centering', () => {
    const base = { frameWidth: 358, frameHeight: 196, left: 95, top: 70, width: 130, height: 80 };
    const layer = { ...base, left: 180, top: 80, width: 85, height: 30 };
    const longer = { ...layer, width: 125 };
    const framing = [base, layer, longer];
    const a = resolveLoadoutArtPlacement(base, framing, 200, 150, 326, 220)!;
    expect(resolveLoadoutArtPlacement(layer, framing, 200, 150, 326, 220)).toEqual(a);
    expect(resolveLoadoutArtPlacement(longer, framing, 200, 150, 326, 220)).toEqual(a);
    expect(a.width / 358 * (305 - 95)).toBeCloseTo(326);
  });
  it('rejects incompatible canvases, empty framing and invalid geometry', () => {
    expect(resolveLoadoutArtPlacement(padded, [], 0, 0, 144, 144)).toBeUndefined();
    expect(resolveLoadoutArtPlacement(padded, [{ ...padded, frameWidth: 358 }], 0, 0, 144, 144)).toBeUndefined();
    expect(resolveLoadoutArtPlacement(padded, [padded], 0, 0, -1, 144)).toBeUndefined();
    expect(resolveLoadoutArtPlacement({ ...padded, width: 0 }, [padded], 0, 0, 144, 144)).toBeUndefined();
    expect(resolveLoadoutArtPlacement(padded, [{ ...padded, left: 96 }], 0, 0, 144, 144)).toBeUndefined();
  });
});
