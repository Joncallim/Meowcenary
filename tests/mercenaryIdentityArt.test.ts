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
  for (let y = 0; y < height; y += 1) {
    expect(rows[y * stride]).toBe(0);
    rows.copy(pixels, y * width * 4, y * stride + 1, (y + 1) * stride);
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
    expect([...portraits, ...icons].every((binding) => binding.load.type === 'atlas' && binding.sampling === 'nearest')).toBe(true);
    expect([...portraits, ...icons].every((binding) => !binding.resourceId?.match(/actor|upgrade|achievement/))).toBe(true);
  });

  it('keeps builders, editable Pixelorama sources, named frames and runtime RGBA in deterministic parity', () => {
    expect(() => execFileSync('node', ['docs/art/scripts/verify-mercenary-identity-builder-parity.mjs'])).not.toThrow();
    expect(() => execFileSync('node', ['docs/art/scripts/export-mercenary-identity-atlases.mjs', '--check'])).not.toThrow();
    const portraits = JSON.parse(readFileSync('public/assets/characters/identity/mercenary-portraits-atlas.json', 'utf8')) as { size_x: number; size_y: number; frames: Record<string, { frame: { w: number; h: number } }> };
    const icons = JSON.parse(readFileSync('public/assets/characters/identity/mercenary-identity-icons-atlas.json', 'utf8')) as { size_x: number; size_y: number; frames: Record<string, { frame: { w: number; h: number } }> };
    expect([portraits.size_x, portraits.size_y]).toEqual([768, 96]);
    expect(Object.keys(portraits.frames).sort()).toEqual([...PORTRAIT_IDS].sort());
    expect(Object.values(portraits.frames).every(({ frame }) => frame.w === 96 && frame.h === 96)).toBe(true);
    expect([icons.size_x, icons.size_y]).toEqual([512, 32]);
    expect(Object.keys(icons.frames).sort()).toEqual([...ABILITY_ICON_IDS, ...PASSIVE_ICON_IDS].sort());
    expect(Object.values(icons.frames).every(({ frame }) => frame.w === 32 && frame.h === 32)).toBe(true);
  });

  it('keeps all final frames nonidentical and collision groups distinct in silhouette and grayscale', () => {
    for (const [jsonPath, pngPath, ids, frameSize] of [
      ['public/assets/characters/identity/mercenary-portraits-atlas.json', 'public/assets/characters/identity/mercenary-portraits-atlas.png', PORTRAIT_IDS, 96],
      ['public/assets/characters/identity/mercenary-identity-icons-atlas.json', 'public/assets/characters/identity/mercenary-identity-icons-atlas.png', [...ABILITY_ICON_IDS, ...PASSIVE_ICON_IDS], 32],
    ] as const) {
      const atlas = JSON.parse(readFileSync(jsonPath, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number } }> };
      const decoded = decodeUnfilteredRgbaPng(pngPath);
      const rgba = new Set<string>(); const silhouettes = new Map<string, string>(); const grays = new Map<string, string>();
      for (const id of ids) {
        const frame = atlas.frames[id]!.frame;
        const pixels = crop(decoded.pixels, decoded.width, frame.x, frame.y, frameSize, frameSize);
        const alpha = Buffer.alloc(frameSize * frameSize); const gray = Buffer.alloc(frameSize * frameSize);
        for (let i = 0; i < pixels.length; i += 4) {
          alpha[i / 4] = pixels[i + 3]! > 0 ? 1 : 0;
          gray[i / 4] = Math.round(pixels[i]! * 0.299 + pixels[i + 1]! * 0.587 + pixels[i + 2]! * 0.114);
        }
        rgba.add(createHash('sha256').update(pixels).digest('hex'));
        silhouettes.set(id, createHash('sha256').update(alpha).digest('hex'));
        grays.set(id, createHash('sha256').update(gray).digest('hex'));
      }
      expect(rgba.size).toBe(ids.length);
      expect(new Set(silhouettes.values()).size).toBe(ids.length);
      expect(new Set(grays.values()).size).toBe(ids.length);
    }
  });

  it('keeps both presentation atlases out of the boot bundle', () => {
    const boot = loadGameData().assetBundles.find((bundle) => bundle.id === 'bundle:boot-core');
    expect(boot?.resourceIds).not.toContain('resource:mercenary-portraits');
    expect(boot?.resourceIds).not.toContain('resource:mercenary-identity-icons');
  });
});
