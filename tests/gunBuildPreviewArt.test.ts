import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import visualArt from '../src/data/visual-art.json';
import visualResources from '../src/data/visual-resources.json';

const ids = [
  'gun-build-base:pistol', 'gun-build-base:smg', 'gun-build-base:shotgun',
  'gun-build-part:receiver-compact', 'gun-build-part:receiver-heavy',
  'gun-build-part:barrel-standard', 'gun-build-part:barrel-long',
  'gun-build-part:optic-red-dot', 'gun-build-part:stock-padded',
  'gun-build-part:trigger-hair', 'gun-build-part:magazine-extended',
  'gun-build-part:underbarrel-grenade', 'gun-build-part:barrel-piercing',
] as const;
const atlasPath = resolve('public/assets/gunsmith/previews/gun-build-preview-atlas.png');
const metadataPath = resolve('public/assets/gunsmith/previews/gun-build-preview-atlas.json');

function decode(): { width: number; height: number; pixels: Buffer } {
  const bytes = readFileSync(atlasPath); const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  let offset = 8; const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks)); const pixels = Buffer.alloc(width * height * 4); const stride = width * 4 + 1;
  for (let y = 0; y < height; y += 1) {
    expect(rows[y * stride]).toBe(0);
    rows.copy(pixels, y * width * 4, y * stride + 1, y * stride + 1 + width * 4);
  }
  return { width, height, pixels };
}

function frameStats(atlas: ReturnType<typeof decode>, frameIndex: number) {
  let opaque = 0; let dark = 0; let sumX = 0; let sumY = 0;
  for (let y = 0; y < 48; y += 1) for (let x = 0; x < 96; x += 1) {
    const p = (y * atlas.width + frameIndex * 96 + x) * 4; const alpha = atlas.pixels[p + 3]!;
    if (alpha === 0) continue;
    opaque += 1; sumX += x; sumY += y;
    const luminance = atlas.pixels[p]! * 0.299 + atlas.pixels[p + 1]! * 0.587 + atlas.pixels[p + 2]! * 0.114;
    if (luminance < 80) dark += 1;
  }
  return { opaque, dark, centerX: sumX / opaque, centerY: sumY / opaque };
}

function alphaAt(atlas: ReturnType<typeof decode>, frameIndex: number, x: number, y: number): number {
  return atlas.pixels[(y * atlas.width + frameIndex * 96 + x) * 4 + 3]!;
}

describe('assembled-weapon production art packet', () => {
  it('binds every exact base and Part identity to one nearest-sampled named-frame atlas', () => {
    const bindings = visualArt.bindings.filter((binding) => ids.includes(binding.id as typeof ids[number]));
    expect(bindings.map((binding) => binding.id)).toEqual([...ids]);
    expect(bindings.every((binding) => binding.required && binding.kind === 'icon' && binding.frameKey === binding.id)).toBe(true);
    expect(bindings.every((binding) => binding.display.width === 96 && binding.display.height === 48)).toBe(true);
    expect(new Set(bindings.map((binding) => binding.resourceId))).toEqual(new Set(['resource:gun-build-previews']));
    expect(visualResources.find((resource) => resource.id === 'resource:gun-build-previews')).toMatchObject({
      sampling: 'nearest', load: { type: 'atlas' },
    });
  });

  it('keeps editable source, deterministic export, and 96x48 named-frame parity', () => {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
    const atlas = decode(); expect([atlas.width, atlas.height]).toEqual([ids.length * 96, 48]);
    expect(Object.keys(metadata.frames)).toEqual([...ids]);
    ids.forEach((id, index) => expect(metadata.frames[id]?.frame).toEqual({ x: index * 96, y: 0, w: 96, h: 48 }));
    expect(() => execFileSync('node', ['docs/art/scripts/export-gun-build-preview-atlas.mjs', '--check'])).not.toThrow();
  });

  it('keeps overlays sparse and transparent while sharing the base receiver/grip datum', () => {
    const atlas = decode();
    for (let index = 3; index < ids.length; index += 1) {
      const stats = frameStats(atlas, index);
      expect(stats.opaque).toBeGreaterThan(35);
      expect(stats.opaque).toBeLessThan(900);
      expect(alphaAt(atlas, index, 0, 0)).toBe(0);
      expect(alphaAt(atlas, index, 95, 47)).toBe(0);
    }
    // Both receivers and all three bases occupy the canonical receiver datum.
    for (const index of [0, 1, 2, 3, 4]) expect(alphaAt(atlas, index, 38, 22)).toBe(255);
    // Barrel overlays share the bore junction; grip-mounted overlays share the
    // same lower receiver junction across families.
    for (const index of [5, 6, 12]) expect(alphaAt(atlas, index, 58, 19)).toBe(255);
    expect(alphaAt(atlas, 9, 42, 28)).toBe(255);
    expect(alphaAt(atlas, 10, 48, 28)).toBe(255);
  });

  it('retains distinct actual-scale and grayscale base silhouettes', () => {
    const atlas = decode(); const base = [0, 1, 2].map((index) => frameStats(atlas, index));
    expect(new Set(base.map((stats) => stats.opaque)).size).toBe(3);
    expect(new Set(base.map((stats) => stats.dark)).size).toBe(3);
    expect(new Set(base.map((stats) => stats.centerX.toFixed(2))).size).toBe(3);
    expect(base[1]!.centerY).not.toBe(base[2]!.centerY);
  });

  it('retains selected and rejected concept provenance outside runtime exports', () => {
    expect(existsSync(resolve('assets-src/gunsmith/previews/concepts/assembled-weapons-direction-a-selected.png'))).toBe(true);
    expect(existsSync(resolve('assets-src/gunsmith/previews/concepts/assembled-weapons-direction-b-rejected.png'))).toBe(true);
    const provenance = readFileSync(resolve('assets-src/gunsmith/previews/concepts/README.md'), 'utf8');
    expect(provenance).toMatch(/Prompt contract/);
    expect(provenance).toMatch(/608cfe343a78c8ad924d6d5a8ce2009b6c84ccc2bdbd893598d427f835c09bd0/);
    expect(provenance).toMatch(/d94029a5b404e0999d4e1892d2bb448ce27f8c9810129ff9e0f2e38d286ef9f6/);
    expect(provenance).toMatch(/not shipped in the runtime atlas/);
  });
});
