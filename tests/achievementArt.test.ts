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

function decodeRgbaPng(path: string): { width: number; height: number; pixels: Buffer } {
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
  const bytesPerPixel = 4;
  for (let y = 0; y < height; y += 1) {
    const filter = rows[y * stride]!;
    if (filter > 4) throw new Error(`unsupported PNG filter ${filter}`);
    for (let x = 0; x < width * bytesPerPixel; x += 1) {
      const encoded = rows[y * stride + 1 + x]!;
      const left = x >= bytesPerPixel ? pixels[y * width * bytesPerPixel + x - bytesPerPixel]! : 0;
      const above = y > 0 ? pixels[(y - 1) * width * bytesPerPixel + x]! : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * width * bytesPerPixel + x - bytesPerPixel]! : 0;
      const estimate = left + above - upperLeft;
      const leftDistance = Math.abs(estimate - left);
      const aboveDistance = Math.abs(estimate - above);
      const diagonalDistance = Math.abs(estimate - upperLeft);
      const paeth = leftDistance <= aboveDistance && leftDistance <= diagonalDistance ? left : aboveDistance <= diagonalDistance ? above : upperLeft;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth;
      pixels[y * width * bytesPerPixel + x] = (encoded + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

function framePixels(pixels: Buffer, atlasWidth: number, x: number, y: number, size: number): Buffer {
  const output = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    pixels.copy(output, row * size * 4, ((y + row) * atlasWidth + x) * 4, ((y + row) * atlasWidth + x + size) * 4);
  }
  return output;
}

describe('dedicated Achievement production art', () => {
  it('routes standalone Achievement export and check aliases through the approved 192px builder', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['art:achievements:export'])
      .toBe('python3 docs/art/scripts/build-achievement-concept-atlas.py');
    expect(packageJson.scripts['art:achievements:check'])
      .toBe('python3 docs/art/scripts/build-achievement-concept-atlas.py --check');
  });

  it('covers the exact active catalog plus hidden fallback with one dedicated presentation atlas', () => {
    const data = loadGameData();
    expect([...new Set(data.achievements?.map((achievement) => achievement.presentation.iconArtId))].sort())
      .toEqual([...ACTIVE_ACHIEVEMENT_ICON_IDS].sort());

    const art = new DataVisualArtRegistry(data);
    const bindings = art.all().filter((binding) => binding.kind === 'achievement-icon');
    expect(bindings.map((binding) => binding.id).sort()).toEqual([...ALL_ACHIEVEMENT_ICON_IDS].sort());
    expect(new Set(bindings.map((binding) => binding.resourceId))).toEqual(new Set(['resource:achievement-icons']));
    expect(new Set(bindings.map((binding) => binding.frameKey))).toEqual(new Set(ALL_ACHIEVEMENT_ICON_IDS));
    expect(bindings.every((binding) => binding.load.type === 'atlas' && binding.sampling === 'linear')).toBe(true);
    expect(bindings.every((binding) => !binding.resourceId?.includes('upgrade-icon'))).toBe(true);
  });

  it('keeps the approved source board, editable Pixelorama source and named-frame export in parity', () => {
    expect(readFileSync('docs/art/scripts/build-achievement-concept-atlas.py', 'utf8'))
      .toContain('cfad6ea94cc2e0085255c7fd8831355b085bc111691120e6f9be6b505d7b700f');
    expect(() => execFileSync('python3', ['docs/art/scripts/build-achievement-concept-atlas.py', '--check']))
      .not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/achievements/achievement-icons-atlas.json', 'utf8')) as {
      size_x: number;
      size_y: number;
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([2112, 192]);
    expect(Object.keys(atlas.frames).sort()).toEqual([...ALL_ACHIEVEMENT_ICON_IDS].sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 192 && frame.h === 192)).toBe(true);
  });

  it('keeps every badge nonidentical with distinct boss/chapter/victory silhouettes and grayscale reads', () => {
    const atlas = JSON.parse(readFileSync('public/assets/achievements/achievement-icons-atlas.json', 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number } }>;
    };
    const { width, height, pixels } = decodeRgbaPng('public/assets/achievements/achievement-icons-atlas.png');
    expect([width, height]).toEqual([2112, 192]);
    const pixelHashes = new Set<string>();
    const silhouetteHashes = new Map<string, string>();
    const grayscaleHashes = new Map<string, string>();
    for (const id of ALL_ACHIEVEMENT_ICON_IDS) {
      const { x, y } = atlas.frames[id]!.frame;
      const frame = framePixels(pixels, width, x, y, 192);
      const alphaBits = Buffer.alloc(192 * 192);
      const grayBytes = Buffer.alloc(192 * 192);
      let opaquePixels = 0;
      for (let index = 0; index < frame.length; index += 4) {
        const alpha = frame[index + 3]!;
        alphaBits[index / 4] = alpha > 0 ? 1 : 0;
        if (alpha > 0) opaquePixels += 1;
        grayBytes[index / 4] = Math.round(frame[index]! * 0.299 + frame[index + 1]! * 0.587 + frame[index + 2]! * 0.114);
      }
      expect(opaquePixels, `${id} should read at actual icon scale`).toBeGreaterThanOrEqual(8_000);
      expect(opaquePixels, `${id} should retain negative space`).toBeLessThanOrEqual(36_000);
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
