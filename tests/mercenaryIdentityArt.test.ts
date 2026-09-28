import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { loadGameData } from '../src/systems/validation';

const CHARACTER_IDS = [
  'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar',
  'ember-cougar', 'scrap-weasel', 'rattle-raptor', 'piston-ram',
] as const;
const ABILITY_IDS = [
  'scrap-burst', 'giga-chomp', 'adrenaline', 'shield-flicker',
  'heat-vent', 'scavenge-pulse', 'precision-mark', 'overclock',
] as const;
const PASSIVE_IDS = [
  'scrap-hoarder', 'quick-tail', 'light-paws', 'thick-hide',
  'ember-aura', 'magnet-belly', 'hunter-eye', 'hydraulic-core',
] as const;

const PORTRAIT_IDS = CHARACTER_IDS.map((id) => `character-portrait:${id}`);
const ABILITY_ICON_IDS = ABILITY_IDS.map((id) => `ability-icon:${id}`);
const PASSIVE_ICON_IDS = PASSIVE_IDS.map((id) => `passive-icon:${id}`);

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
  const bytesPerPixel = 4;
  for (let y = 0; y < height; y += 1) {
    const filter = rows[y * stride]!;
    if (filter > 4) throw new Error(`unsupported PNG filter ${filter}`);
    for (let x = 0; x < width * bytesPerPixel; x += 1) {
      const encoded = rows[y * stride + 1 + x]!;
      const left = x >= bytesPerPixel ? pixels[y * width * bytesPerPixel + x - bytesPerPixel]! : 0;
      const above = y > 0 ? pixels[(y - 1) * width * bytesPerPixel + x]! : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * width * bytesPerPixel + x - bytesPerPixel]! : 0;
      const paeth = (() => {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const diagonalDistance = Math.abs(estimate - upperLeft);
        return leftDistance <= aboveDistance && leftDistance <= diagonalDistance ? left : aboveDistance <= diagonalDistance ? above : upperLeft;
      })();
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth : Number.NaN;
      pixels[y * width * bytesPerPixel + x] = (encoded + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

function crop(pixels: Buffer, atlasWidth: number, x: number, y: number, width: number, height: number): Buffer {
  const output = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    pixels.copy(output, row * width * 4, ((y + row) * atlasWidth + x) * 4, ((y + row) * atlasWidth + x + width) * 4);
  }
  return output;
}

describe('Mercenary portrait and identity-icon production art', () => {
  it('covers the exact catalogs through explicit data references and two bounded nearest atlases', () => {
    const data = loadGameData();
    expect(data.characters.map((character) => character.presentation.portraitArtId).sort()).toEqual([...PORTRAIT_IDS].sort());
    expect(data.abilities?.map((ability) => ability.presentation.iconArtId).sort()).toEqual([...ABILITY_ICON_IDS].sort());
    expect(data.characters.flatMap((character) => character.passives.map((passive) => passive.presentation.iconArtId)).sort())
      .toEqual([...PASSIVE_ICON_IDS].sort());

    const art = new DataVisualArtRegistry(data);
    const portraits = art.all().filter((binding) => binding.kind === 'portrait');
    const icons = art.all().filter((binding) => binding.id.startsWith('ability-icon:') || binding.id.startsWith('passive-icon:'));
    expect(portraits.map((binding) => binding.id).sort()).toEqual([...PORTRAIT_IDS].sort());
    expect(icons.map((binding) => binding.id).sort()).toEqual([...ABILITY_ICON_IDS, ...PASSIVE_ICON_IDS].sort());
    expect(new Set(portraits.map((binding) => binding.resourceId))).toEqual(new Set(['resource:mercenary-portraits']));
    expect(new Set(icons.map((binding) => binding.resourceId))).toEqual(new Set(['resource:mercenary-identity-icons']));
    expect(portraits.every((binding) => binding.load.type === 'atlas' && binding.sampling === 'linear')).toBe(true);
    expect(icons.every((binding) => binding.load.type === 'atlas' && binding.sampling === 'linear')).toBe(true);
    expect([...portraits, ...icons].every((binding) => !binding.resourceId?.match(/actor|upgrade|achievement/))).toBe(true);
  });

  it('keeps builders, editable Pixelorama sources, named frames and runtime RGBA in deterministic parity', () => {
    expect(() => execFileSync('node', ['docs/art/scripts/verify-mercenary-identity-builder-parity.mjs'])).not.toThrow();
    expect(() => execFileSync('python3', ['docs/art/scripts/build-mercenary-identity-concept-atlas.py', '--check'])).not.toThrow();
    expect(() => execFileSync('python3', ['docs/art/scripts/build-mercenary-portrait-atlas.py', '--check'])).not.toThrow();
    const portraits = JSON.parse(readFileSync('public/assets/characters/identity/mercenary-portraits-atlas.json', 'utf8')) as { size_x: number; size_y: number; frames: Record<string, { frame: { w: number; h: number } }> };
    const icons = JSON.parse(readFileSync('public/assets/characters/identity/mercenary-identity-icons-atlas.json', 'utf8')) as { size_x: number; size_y: number; frames: Record<string, { frame: { w: number; h: number } }> };
    expect([portraits.size_x, portraits.size_y]).toEqual([1200, 240]);
    expect(Object.keys(portraits.frames).sort()).toEqual([...PORTRAIT_IDS].sort());
    expect(Object.values(portraits.frames).every(({ frame }) => frame.w === 150 && frame.h === 240)).toBe(true);
    expect([icons.size_x, icons.size_y]).toEqual([1536, 96]);
    expect(Object.keys(icons.frames).sort()).toEqual([...ABILITY_ICON_IDS, ...PASSIVE_ICON_IDS].sort());
    expect(Object.values(icons.frames).every(({ frame }) => frame.w === 96 && frame.h === 96)).toBe(true);
  });

  it('keeps all final frames nonidentical and grayscale-distinct at production resolution', () => {
    for (const [jsonPath, pngPath, ids, frameWidth, frameHeight] of [
      ['public/assets/characters/identity/mercenary-portraits-atlas.json', 'public/assets/characters/identity/mercenary-portraits-atlas.png', PORTRAIT_IDS, 150, 240],
      ['public/assets/characters/identity/mercenary-identity-icons-atlas.json', 'public/assets/characters/identity/mercenary-identity-icons-atlas.png', [...ABILITY_ICON_IDS, ...PASSIVE_ICON_IDS], 96, 96],
    ] as const) {
      const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number } }> };
      const decoded = decodeUnfilteredRgbaPng(pngPath);
      const rgba = new Set<string>(); const silhouettes = new Map<string, string>(); const grays = new Map<string, string>();
      for (const id of ids) {
        const frame = atlas.frames[id]!.frame;
        const pixels = crop(decoded.pixels, decoded.width, frame.x, frame.y, frameWidth, frameHeight);
        const alpha = Buffer.alloc(frameWidth * frameHeight); const gray = Buffer.alloc(frameWidth * frameHeight);
        for (let i = 0; i < pixels.length; i += 4) {
          alpha[i / 4] = pixels[i + 3]! > 0 ? 1 : 0;
          gray[i / 4] = Math.round(pixels[i]! * 0.299 + pixels[i + 1]! * 0.587 + pixels[i + 2]! * 0.114);
        }
        rgba.add(createHash('sha256').update(pixels).digest('hex'));
        silhouettes.set(id, createHash('sha256').update(alpha).digest('hex'));
        grays.set(id, createHash('sha256').update(gray).digest('hex'));
      }
      expect(rgba.size).toBe(ids.length);
      // Portraits retain transparent actor silhouettes. The illustrated icon
      // family deliberately uses full-bleed active/passive plates, so alpha is
      // not an identity signal there; the rendered grayscale frame is.
      if (frameWidth !== 96) expect(new Set(silhouettes.values()).size).toBe(ids.length);
      expect(new Set(grays.values()).size).toBe(ids.length);
    }
  });

  it('keeps both presentation atlases out of the boot bundle', () => {
    const boot = loadGameData().assetBundles.find((bundle) => bundle.id === 'bundle:boot-core');
    expect(boot?.resourceIds).not.toContain('resource:mercenary-portraits');
    expect(boot?.resourceIds).not.toContain('resource:mercenary-identity-icons');
  });
});
