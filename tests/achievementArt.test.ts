import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry, resolveAchievementIconBinding } from '../src/systems/visualArt';

const ACTIVE_ACHIEVEMENT_ICON_IDS = [
  'achievement-icon:first-kill',
  'achievement-icon:kill-milestone-25',
  'achievement-icon:kill-milestone-100',
  'achievement-icon:first-merge',
  'achievement-icon:boss-crusher',
  'achievement-icon:chapter-junkyard',
  'achievement-icon:first-victory',
  'achievement-icon:mastery-scrap-tabby',
  'achievement-icon:scrap-tycoon',
  'achievement-icon:boss-forge',
] as const;
const ALL_ACHIEVEMENT_ICON_IDS = ['achievement-icon:hidden', ...ACTIVE_ACHIEVEMENT_ICON_IDS] as const;

function decodeUnfilteredRgbaPng(path: string): { width: number; height: number; pixels: Buffer } {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y += 1) {
    expect(rows[y * stride]).toBe(0);
    rows.copy(pixels, y * width * 4, y * stride + 1, (y + 1) * stride);
  }
  return { width, height, pixels };
}

function framePixels(pixels: Buffer, atlasWidth: number, x: number, y: number): Buffer {
  const output = Buffer.alloc(32 * 32 * 4);
  for (let row = 0; row < 32; row += 1) {
    pixels.copy(output, row * 32 * 4, ((y + row) * atlasWidth + x) * 4, ((y + row) * atlasWidth + x + 32) * 4);
  }
  return output;
}

describe('dedicated Achievement production art', () => {
  it('covers the exact active catalog plus hidden fallback with one dedicated nearest atlas', () => {
    const data = loadGameData();
    expect(data.achievements?.map((achievement) => achievement.presentation.iconArtId).sort())
      .toEqual([...ACTIVE_ACHIEVEMENT_ICON_IDS].sort());

    const art = new DataVisualArtRegistry(data);
    const bindings = art.all().filter((binding) => binding.kind === 'achievement-icon');
    expect(bindings.map((binding) => binding.id).sort()).toEqual([...ALL_ACHIEVEMENT_ICON_IDS].sort());
    expect(new Set(bindings.map((binding) => binding.resourceId))).toEqual(new Set(['resource:achievement-icons']));
    expect(new Set(bindings.map((binding) => binding.frameKey))).toEqual(new Set(ALL_ACHIEVEMENT_ICON_IDS));
    expect(bindings.every((binding) => binding.load.type === 'atlas' && binding.sampling === 'nearest')).toBe(true);
    expect(bindings.every((binding) => !binding.resourceId?.includes('upgrade-icon'))).toBe(true);
  });

  it('keeps source, builder, Pixelorama and 32px named-frame export in parity', () => {
    expect(() => execFileSync('node', ['docs/art/scripts/export-achievement-icons-atlas.mjs', '--check']))
      .not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/achievements/achievement-icons-atlas.json', 'utf8')) as {
      size_x: number;
      size_y: number;
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([352, 32]);
    expect(Object.keys(atlas.frames).sort()).toEqual([...ALL_ACHIEVEMENT_ICON_IDS].sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 32 && frame.h === 32)).toBe(true);
  });

  it('keeps every badge nonidentical with distinct boss/chapter/victory silhouettes and grayscale reads', () => {
    const atlas = JSON.parse(readFileSync('public/assets/achievements/achievement-icons-atlas.json', 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number } }>;
    };
    const { width, height, pixels } = decodeUnfilteredRgbaPng('public/assets/achievements/achievement-icons-atlas.png');
    expect([width, height]).toEqual([352, 32]);
    const pixelHashes = new Set<string>();
    const silhouetteHashes = new Map<string, string>();
    const grayscaleHashes = new Map<string, string>();
    for (const id of ALL_ACHIEVEMENT_ICON_IDS) {
      const { x, y } = atlas.frames[id]!.frame;
      const frame = framePixels(pixels, width, x, y);
      const alphaBits = Buffer.alloc(32 * 32);
      const grayBytes = Buffer.alloc(32 * 32);
      let opaquePixels = 0;
      for (let index = 0; index < frame.length; index += 4) {
        const alpha = frame[index + 3]!;
        alphaBits[index / 4] = alpha > 0 ? 1 : 0;
        if (alpha > 0) opaquePixels += 1;
        grayBytes[index / 4] = Math.round(frame[index]! * 0.299 + frame[index + 1]! * 0.587 + frame[index + 2]! * 0.114);
      }
      expect(opaquePixels, `${id} should read at actual icon scale`).toBeGreaterThanOrEqual(90);
      expect(opaquePixels, `${id} should retain negative space`).toBeLessThanOrEqual(760);
      pixelHashes.add(createHash('sha256').update(frame).digest('hex'));
      silhouetteHashes.set(id, createHash('sha256').update(alphaBits).digest('hex'));
      grayscaleHashes.set(id, createHash('sha256').update(grayBytes).digest('hex'));
    }
    expect(pixelHashes.size).toBe(ALL_ACHIEVEMENT_ICON_IDS.length);
    const semanticContrastIds = [
      'achievement-icon:boss-crusher',
      'achievement-icon:chapter-junkyard',
      'achievement-icon:first-victory',
      'achievement-icon:boss-forge',
    ];
    expect(new Set(semanticContrastIds.map((id) => silhouetteHashes.get(id))).size).toBe(semanticContrastIds.length);
    expect(new Set(semanticContrastIds.map((id) => grayscaleHashes.get(id))).size).toBe(semanticContrastIds.length);
  });

  it('shares the same logical badge binding between Career and terminal consumers and keeps the atlas out of boot preload', () => {
    const data = loadGameData();
    const art = new DataVisualArtRegistry(data);
    for (const id of ALL_ACHIEVEMENT_ICON_IDS) {
      const career = resolveAchievementIconBinding(art, id);
      const terminal = resolveAchievementIconBinding(art, id);
      expect(career).toEqual(terminal);
      expect(career).toMatchObject({ textureKey: 'art-achievement-icons', frameKey: id });
    }
    const boot = data.assetBundles.find((bundle) => bundle.id === 'bundle:boot-core');
    expect(boot?.resourceIds).not.toContain('resource:achievement-icons');
  });
});
