import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

const SETS = ['commando', 'scavenger', 'juggernaut', 'pyro', 'recon', 'medic', 'technician', 'demolition'] as const;
const SLOTS = ['helmet', 'armour', 'gloves', 'boots'] as const;
const ALL_EQUIPMENT_ART_IDS = SETS.flatMap((set) => [
  `equipment-set-icon:${set}`,
  ...SLOTS.map((slot) => `equipment-icon:${set}-${slot}`),
]);
const PRODUCTION_ART_IDS = ALL_EQUIPMENT_ART_IDS.filter((id) => !id.includes(':commando'));

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

describe('dedicated Equipment production art', () => {
  it('covers the exact 8 Set / 32 piece catalog with semantic IDs and no borrowed upgrade art', () => {
    const data = loadGameData();
    expect((data.equipmentSets ?? []).map((set) => set.emblem).sort()).toEqual(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-set-icon:')).sort(),
    );
    expect((data.equipment ?? []).map((piece) => piece.icon).sort()).toEqual(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-icon:')).sort(),
    );
    expect([...(data.equipmentSets ?? []).map((set) => set.emblem), ...(data.equipment ?? []).map((piece) => piece.icon)])
      .not.toContainEqual(expect.stringMatching(/^upgrade-icon:/));

    const art = new DataVisualArtRegistry(data);
    const bindings = ALL_EQUIPMENT_ART_IDS.map((id) => art.bindingById(id));
    expect(bindings).not.toContain(undefined);
    expect(bindings.every((binding) => binding?.kind === 'icon')).toBe(true);
    expect(new Set(bindings.map((binding) => binding?.frameKey))).toEqual(new Set(ALL_EQUIPMENT_ART_IDS));
    expect(new Set(bindings.map((binding) => binding?.resourceId))).toEqual(new Set([
      'resource:equipment-commando', 'resource:equipment-sets',
    ]));
  });

  it('keeps all 35 new named frames in source/export parity', () => {
    expect(() => execFileSync('node', [
      'docs/art/scripts/export-equipment-sets-atlas.mjs', '--check',
    ])).not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/equipment/sets/equipment-sets-atlas.json', 'utf8')) as {
      size_x: number; size_y: number; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([160, 224]);
    expect(Object.keys(atlas.frames).sort()).toEqual([...PRODUCTION_ART_IDS].sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 32 && frame.h === 32)).toBe(true);
  });

  it('preserves unique black silhouettes and grayscale construction at actual 32px source scale', () => {
    const atlas = JSON.parse(readFileSync('public/assets/equipment/sets/equipment-sets-atlas.json', 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number } }>;
    };
    const { width, height, pixels } = decodeUnfilteredRgbaPng('public/assets/equipment/sets/equipment-sets-atlas.png');
    expect([width, height]).toEqual([160, 224]);
    const silhouettes = new Set<string>();
    const grayscale = new Set<string>();
    for (const id of PRODUCTION_ART_IDS) {
      const { x, y } = atlas.frames[id]!.frame;
      const frame = framePixels(pixels, width, x, y);
      const alphaBits: number[] = [];
      const grayBytes = Buffer.alloc(32 * 32);
      let opaquePixels = 0;
      for (let index = 0; index < frame.length; index += 4) {
        const alpha = frame[index + 3]!;
        alphaBits.push(alpha > 0 ? 1 : 0);
        if (alpha > 0) opaquePixels += 1;
        grayBytes[index / 4] = Math.round(frame[index]! * 0.299 + frame[index + 1]! * 0.587 + frame[index + 2]! * 0.114);
      }
      expect(opaquePixels, `${id} should be readable rather than empty/noisy`).toBeGreaterThanOrEqual(55);
      expect(opaquePixels, `${id} should retain negative space at icon scale`).toBeLessThanOrEqual(575);
      silhouettes.add(createHash('sha256').update(alphaBits.join('')).digest('hex'));
      grayscale.add(createHash('sha256').update(grayBytes).digest('hex'));
    }
    expect(silhouettes.size).toBe(PRODUCTION_ART_IDS.length);
    expect(grayscale.size).toBe(PRODUCTION_ART_IDS.length);
  });
});
