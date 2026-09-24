#!/usr/bin/env node
/**
 * Export the editable Forge/Foundry Pixelorama source as a deterministic
 * named-frame atlas. The atlas is a physical resource; semantic world IDs
 * remain stable in visual-art.json and are never inferred from filenames.
 */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const source = join(root, 'assets-src/world/forge/source/forge-world-atlas.pxo');
const runtime = join(root, 'public/assets/world/forge');
const atlasFrames = {
  'world:forge-floor:base': { frame: { x: 16, y: 16, w: 32, h: 32 } },
  'world:forge-floor:grate-patch': { frame: { x: 80, y: 16, w: 32, h: 32 } },
  'world:forge-floor:heat-scar': { frame: { x: 144, y: 16, w: 32, h: 32 } },
  'world:forge-boundary:straight': { frame: { x: 208, y: 16, w: 32, h: 32 } },
  'world:forge-boundary:corner': { frame: { x: 16, y: 80, w: 32, h: 32 } },
  'world:forge-boundary:patch': { frame: { x: 80, y: 80, w: 32, h: 32 } },
  'world:forge-boundary:gate': { frame: { x: 144, y: 80, w: 32, h: 32 } },
  'world:forge-prop:coil-rack': { frame: { x: 208, y: 80, w: 32, h: 32 } },
  'world:forge-prop:ingot-pallet': { frame: { x: 16, y: 144, w: 32, h: 32 } },
  'world:forge-prop:quench-drum': { frame: { x: 80, y: 144, w: 32, h: 32 } },
  'world:forge-prop:tool-cart': { frame: { x: 144, y: 144, w: 32, h: 32 } },
  'world:forge-prop:slag-pile': { frame: { x: 208, y: 144, w: 32, h: 32 } },
  'world:forge-prop:heat-beacon': { frame: { x: 16, y: 208, w: 32, h: 32 } },
  'world:forge-landmark:furnace-throat': { frame: { x: 64, y: 192, w: 64, h: 64 } },
  'world:forge-landmark:cooling-manifold': { frame: { x: 192, y: 192, w: 64, h: 64 } },
  'world:forge-hazard:heat-grate': { frame: { x: 144, y: 208, w: 32, h: 32 } },
};

const readPxo = (member, encoding) => execFileSync('unzip', ['-p', source, member], encoding ? { encoding } : undefined);
const project = JSON.parse(readPxo('data.json', 'utf8'));
const { size_x: width, size_y: height } = project;
if (width !== 256 || height !== 256 || !Array.isArray(project.layers) || !Array.isArray(project.frames) || project.frames.length !== 1) {
  throw new Error('Forge source must be one 256x256 Pixelorama frame');
}

const output = Buffer.alloc(width * height * 4);
const alphaComposite = (destination, sourcePixels) => {
  for (let index = 0; index < sourcePixels.length; index += 4) {
    const alpha = sourcePixels[index + 3] / 255;
    if (alpha === 0) continue;
    const under = destination[index + 3] / 255;
    const outAlpha = alpha + under * (1 - alpha);
    for (let channel = 0; channel < 3; channel += 1) {
      destination[index + channel] = Math.round((sourcePixels[index + channel] * alpha + destination[index + channel] * under * (1 - alpha)) / outAlpha);
    }
    destination[index + 3] = Math.round(outAlpha * 255);
  }
};

for (const [index, layer] of project.layers.entries()) {
  if (layer.visible !== true) continue;
  const raw = readPxo(`image_data/frames/1/layer_${index + 1}`);
  if (raw.length !== output.length) throw new Error(`Invalid RGBA cel for Forge layer ${index + 1}`);
  alphaComposite(output, raw);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([header, data, tail]);
};
const rows = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) output.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
const atlasJson = Buffer.from(`${JSON.stringify({
  ...project,
  export_directory_path: '',
  export_file_name: 'forge-world-atlas',
  frames: atlasFrames,
}, null, 2)}\n`);

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: export-forge-world-atlas.mjs [--check]');
const pngPath = join(runtime, 'forge-world-atlas.png');
const jsonPath = join(runtime, 'forge-world-atlas.json');
if (args[0] === '--check') {
  if (!readFileSync(pngPath).equals(png)) throw new Error('Forge atlas PNG is out of date with its editable source');
  if (!readFileSync(jsonPath).equals(atlasJson)) throw new Error('Forge atlas JSON is out of date with its editable source');
} else {
  mkdirSync(runtime, { recursive: true });
  writeFileSync(pngPath, png);
  writeFileSync(jsonPath, atlasJson);
}
