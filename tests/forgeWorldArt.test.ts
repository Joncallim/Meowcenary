import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import visualArt from '../src/data/visual-art.json';
import visualResources from '../src/data/visual-resources.json';

const forgeIds = [
  'world:forge-floor:base',
  'world:forge-floor:grate-patch',
  'world:forge-floor:heat-scar',
  'world:forge-boundary:straight',
  'world:forge-boundary:corner',
  'world:forge-boundary:patch',
  'world:forge-boundary:gate',
  'world:forge-prop:coil-rack',
  'world:forge-prop:ingot-pallet',
  'world:forge-prop:quench-drum',
  'world:forge-prop:tool-cart',
  'world:forge-prop:slag-pile',
  'world:forge-prop:heat-beacon',
  'world:forge-landmark:furnace-throat',
  'world:forge-landmark:cooling-manifold',
  'world:forge-hazard:heat-grate',
] as const;

const atlasPath = resolve('public/assets/world/forge/forge-world-atlas.png');
const metadataPath = resolve('public/assets/world/forge/forge-world-atlas.json');

function decodeAtlas(): { width: number; height: number; pixels: Buffer } {
  const bytes = readFileSync(atlasPath);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  let offset = 8; const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const scanlines = inflateSync(Buffer.concat(idat)); const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y += 1) scanlines.copy(pixels, y * width * 4, y * stride + 1, y * stride + 1 + width * 4);
  return { width, height, pixels };
}

function darkPixelCount(atlas: ReturnType<typeof decodeAtlas>, frame: { x: number; y: number; w: number; h: number }): number {
  let count = 0;
  for (let y = frame.y; y < frame.y + frame.h; y += 1) for (let x = frame.x; x < frame.x + frame.w; x += 1) {
    const index = (y * atlas.width + x) * 4;
    const luminance = (atlas.pixels[index]! + atlas.pixels[index + 1]! + atlas.pixels[index + 2]!) / 3;
    if (atlas.pixels[index + 3] !== 0 && luminance < 45) count += 1;
  }
  return count;
}

describe('Forge/Foundry production art packet', () => {
  it('ships exactly the V4 3/4/6/2/1 world packet as one nearest-sampled atlas', () => {
    const bindings = visualArt.bindings.filter((binding) => forgeIds.includes(binding.id as typeof forgeIds[number]));
    expect(bindings.map((binding) => binding.id)).toEqual([...forgeIds]);
    expect(new Set(bindings.map((binding) => binding.resourceId))).toEqual(new Set(['resource:world-forge-atlas']));
    expect(bindings.every((binding) => binding.kind === 'world' && binding.required === true && binding.frameKey === binding.id)).toBe(true);
    expect(bindings.filter((binding) => binding.display.width === 32 && binding.display.height === 32)).toHaveLength(14);
    expect(bindings.filter((binding) => binding.display.width === 64 && binding.display.height === 64)).toHaveLength(2);
    const resource = visualResources.find((candidate) => candidate.id === 'resource:world-forge-atlas');
    expect(resource).toMatchObject({ id: 'resource:world-forge-atlas', sampling: 'nearest', load: { type: 'atlas' } });
  });

  it('keeps named frame rectangles native-size, non-overlapping, and parity-checked', () => {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
    const atlas = decodeAtlas();
    expect([atlas.width, atlas.height]).toEqual([256, 256]);
    const frames = forgeIds.map((id) => metadata.frames[id]!.frame);
    expect(frames.filter((frame) => frame.w === 64 && frame.h === 64)).toHaveLength(2);
    expect(frames.filter((frame) => frame.w === 32 && frame.h === 32)).toHaveLength(14);
    for (let a = 0; a < frames.length; a += 1) for (let b = a + 1; b < frames.length; b += 1) {
      const left = frames[a]!; const right = frames[b]!;
      expect(left.x + left.w <= right.x || right.x + right.w <= left.x || left.y + left.h <= right.y || right.y + right.h <= left.y).toBe(true);
    }
    expect(() => execFileSync('node', ['docs/art/scripts/export-forge-world-atlas.mjs', '--check'])).not.toThrow();
  });

  it('keeps the live heat grate visibly distinct from safe floor in grayscale', () => {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
    const atlas = decodeAtlas();
    const safe = darkPixelCount(atlas, metadata.frames['world:forge-floor:base']!.frame);
    const hazard = darkPixelCount(atlas, metadata.frames['world:forge-hazard:heat-grate']!.frame);
    // Safe floor is intentionally quiet charcoal; the live grate is a dense
    // cream/copper field interrupted by a deliberate dark grid and border.
    // Distinction therefore comes from a materially different dark-pixel
    // footprint, not hue alone.
    expect(hazard).toBeLessThan(safe * 0.6);
  });

  it('retains selected and rejected concept provenance outside runtime exports', () => {
    const selected = resolve('assets-src/world/forge/concepts/forge-foundry-direction-a-selected.png');
    const rejected = resolve('assets-src/world/forge/concepts/forge-foundry-direction-b-rejected.png');
    const provenance = readFileSync(resolve('assets-src/world/forge/concepts/README.md'), 'utf8');
    expect(existsSync(selected)).toBe(true); expect(existsSync(rejected)).toBe(true);
    expect(provenance).toMatch(/Prompt contract/);
    expect(provenance).toMatch(/runtime atlas/);
    expect(provenance).toMatch(/b21829884ab66dbc8026f7337655a8c6c65b04f7392a9054d0d5371cbf1b1729/);
    expect(provenance).toMatch(/9c66c68c02821450a144d0f7658770a189daa7f0954a31ed46f0558bf3699d23/);
  });
});
