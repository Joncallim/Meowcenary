import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

const partIds = [
  'receiver-compact', 'receiver-heavy', 'barrel-standard', 'barrel-long',
  'optic-red-dot', 'stock-padded', 'trigger-hair', 'magazine-extended',
  'underbarrel-grenade', 'barrel-piercing', 'trait-fire', 'trait-fire-mastered',
].map((id) => `gun-part-icon:${id}`);
const slotIds = ['receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait']
  .map((id) => `gun-slot-icon:${id}`);
const traitIds = ['fire', 'explosive', 'piercing'].map((id) => `trait-icon:${id}`);
const expectedIds = [...partIds, ...slotIds, ...traitIds];

function decodePng(path: string): { width: number; height: number; pixels: Uint8Array } {
  const file = readFileSync(path); const idat: Buffer[] = [];
  let width = 0; let height = 0; let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset); const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)); const rowBytes = width * 4; const pixels = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowBytes + 1)];
    expect(filter).toBe(0);
    pixels.set(raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)), y * rowBytes);
  }
  return { width, height, pixels };
}

function alphaSignature(pixels: Uint8Array, atlasWidth: number, frame: number): string {
  let signature = '';
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    signature += pixels[(y * atlasWidth + frame * 32 + x) * 4 + 3] === 0 ? '0' : '1';
  }
  return signature;
}

function rgbaSignature(pixels: Uint8Array, atlasWidth: number, frame: number): string {
  const bytes: number[] = [];
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    bytes.push(...pixels.subarray((y * atlasWidth + frame * 32 + x) * 4, (y * atlasWidth + frame * 32 + x + 1) * 4));
  }
  return Buffer.from(bytes).toString('base64');
}

describe('Gunsmith production art', () => {
  it('binds the exact 12 Part, eight slot and three trait identities to one lazy atlas', () => {
    const data = loadGameData(); const art = new DataVisualArtRegistry(data);
    const bindings = expectedIds.map((id) => art.bindingById(id));
    expect(bindings).not.toContain(undefined);
    expect(new Set(bindings.map((binding) => binding?.kind))).toEqual(new Set(['icon']));
    expect(new Set(bindings.map((binding) => binding?.resourceId))).toEqual(new Set(['resource:gunsmith-icons']));
    expect(bindings.map((binding) => binding?.frameKey)).toEqual(expectedIds);
    expect(data.gunParts?.map((part) => part.presentation.iconArtId)).toEqual(partIds);
    expect(new Set(data.gunParts?.map((part) => part.presentation.slotIconArtId))).toEqual(new Set(slotIds));
    expect(new Set(data.gunParts?.flatMap((part) => Object.values(part.presentation.traitIconArtIds)))).toEqual(new Set(traitIds));
  });

  it('exports the committed editable PXO pixels exactly and keeps every frame silhouette distinct', () => {
    const png = decodePng('public/assets/gunsmith/icons/gunsmith-icons-atlas.png');
    expect(png).toMatchObject({ width: 23 * 32, height: 32 });
    const raw = execFileSync('unzip', ['-p', 'assets-src/gunsmith/icons/source/gunsmith-icons-atlas.pxo', 'image_data/frames/1/layer_1']);
    expect(Buffer.from(png.pixels)).toEqual(raw);
    const signatures = expectedIds.map((_, frame) => alphaSignature(png.pixels, png.width, frame));
    expect(signatures.every((signature) => signature.includes('1'))).toBe(true);
    expect(new Set(signatures.slice(0, 20)).size).toBe(20);
    expect(new Set(expectedIds.map((_, frame) => rgbaSignature(png.pixels, png.width, frame))).size).toBe(expectedIds.length);
    expect(signatures[10]).not.toBe(signatures[20]); // physical Fire Core vs reusable FIRE emblem
  });

  it('uses exact, non-overlapping named frames in the same stable order', () => {
    const atlas = JSON.parse(readFileSync('public/assets/gunsmith/icons/gunsmith-icons-atlas.json', 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    expect(Object.keys(atlas.frames)).toEqual(expectedIds);
    expect(Object.values(atlas.frames).map(({ frame }) => frame)).toEqual(
      expectedIds.map((_, index) => ({ x: index * 32, y: 0, w: 32, h: 32 })),
    );
  });
});
