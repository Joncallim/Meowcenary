#!/usr/bin/env node
/** Export/check the co-registered assembled-weapon preview Pixelorama atlas. */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const source = join(root, 'assets-src/gunsmith/previews/source/gun-build-preview-atlas.pxo');
const runtime = join(root, 'public/assets/gunsmith/previews');
const names = [
  'gun-build-base:pistol', 'gun-build-base:smg', 'gun-build-base:shotgun',
  'gun-build-part:receiver-compact', 'gun-build-part:receiver-heavy',
  'gun-build-part:barrel-standard', 'gun-build-part:barrel-long',
  'gun-build-part:optic-red-dot', 'gun-build-part:stock-padded',
  'gun-build-part:trigger-hair', 'gun-build-part:magazine-extended',
  'gun-build-part:underbarrel-grenade', 'gun-build-part:barrel-piercing',
];
const atlasFrames = Object.fromEntries(names.map((name, index) => [name, { frame: { x: index * 96, y: 0, w: 96, h: 48 } }]));
const readPxo = (member, encoding) => execFileSync('unzip', ['-p', source, member], encoding ? { encoding } : undefined);
const project = JSON.parse(readPxo('data.json', 'utf8'));
const { size_x: width, size_y: height } = project;
if (width !== names.length * 96 || height !== 48 || project.frames?.length !== 1 || !Array.isArray(project.layers)) {
  throw new Error(`Gun-build preview source must be one ${names.length * 96}x48 Pixelorama frame`);
}

const output = Buffer.alloc(width * height * 4);
for (const [index, layer] of project.layers.entries()) {
  if (layer.visible !== true) continue;
  const pixels = readPxo(`image_data/frames/1/layer_${index + 1}`);
  if (pixels.length !== output.length) throw new Error(`Invalid RGBA cel for preview layer ${index + 1}`);
  for (let p = 0; p < pixels.length; p += 4) {
    const alpha = pixels[p + 3] / 255;
    if (alpha === 0) continue;
    const under = output[p + 3] / 255; const outAlpha = alpha + under * (1 - alpha);
    for (let channel = 0; channel < 3; channel += 1) output[p + channel] = Math.round((pixels[p + channel] * alpha + output[p + channel] * under * (1 - alpha)) / outAlpha);
    output[p + 3] = Math.round(outAlpha * 255);
  }
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([header, data, tail]); };
const rows = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) output.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
const json = Buffer.from(`${JSON.stringify({ ...project, export_directory_path: '', export_file_name: 'gun-build-preview-atlas', frames: atlasFrames }, null, 2)}\n`);

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: export-gun-build-preview-atlas.mjs [--check]');
const pngPath = join(runtime, 'gun-build-preview-atlas.png'); const jsonPath = join(runtime, 'gun-build-preview-atlas.json');
if (args[0] === '--check') {
  if (!readFileSync(pngPath).equals(png)) throw new Error('Gun-build preview PNG is out of date with editable source');
  if (!readFileSync(jsonPath).equals(json)) throw new Error('Gun-build preview JSON is out of date with editable source');
} else {
  mkdirSync(runtime, { recursive: true }); writeFileSync(pngPath, png); writeFileSync(jsonPath, json);
}
