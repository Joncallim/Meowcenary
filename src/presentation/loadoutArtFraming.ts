import { bounds } from './loadout-art-bounds.json';
import { deepFreeze } from '../engine/freeze';

deepFreeze(bounds);

export interface LoadoutArtBounds {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function loadoutArtBounds(id: string): Readonly<LoadoutArtBounds> | undefined {
  return (bounds as Readonly<Record<string, Readonly<LoadoutArtBounds>>>)[id];
}

function valid(row: LoadoutArtBounds): boolean {
  return Object.values(row).every(Number.isFinite)
    && row.frameWidth > 0 && row.frameHeight > 0 && row.width > 0 && row.height > 0
    && row.left >= 0 && row.top >= 0
    && row.left + row.width <= row.frameWidth && row.top + row.height <= row.frameHeight;
}

/** Fit visible export bounds; preserve the authored full canvas and alignment.
 * Every co-registered layer receives the same framing union, including both
 * sides of a preview. Source pixels are inspected only by the export checker.
 */
export function resolveLoadoutArtPlacement(source: LoadoutArtBounds,
  framing: readonly LoadoutArtBounds[], x: number, y: number, maxWidth: number, maxHeight: number):
  Readonly<{ x: number; y: number; width: number; height: number }> | undefined {
  if (!valid(source) || !framing.length || ![x, y, maxWidth, maxHeight].every(Number.isFinite)
    || maxWidth <= 0 || maxHeight <= 0 || framing.some(row => !valid(row)
      || row.frameWidth !== source.frameWidth || row.frameHeight !== source.frameHeight)) return undefined;
  const left = Math.min(...framing.map(row => row.left));
  const top = Math.min(...framing.map(row => row.top));
  const right = Math.max(...framing.map(row => row.left + row.width));
  const bottom = Math.max(...framing.map(row => row.top + row.height));
  const scale = Math.min(maxWidth / (right - left), maxHeight / (bottom - top));
  return Object.freeze({
    x: x + (source.frameWidth / 2 - (left + right) / 2) * scale,
    y: y + (source.frameHeight / 2 - (top + bottom) / 2) * scale,
    width: source.frameWidth * scale, height: source.frameHeight * scale,
  });
}
