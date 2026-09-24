#!/usr/bin/env node
/** Export the committed Gunsmith PXO to PNG + named-frame atlas metadata. */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const source = join(root, 'assets-src/gunsmith/icons/source/gunsmith-icons-atlas.pxo');
const runtime = join(root, 'public/assets/gunsmith/icons');
const names = [
  'gun-part-icon:receiver-compact', 'gun-part-icon:receiver-heavy',
  'gun-part-icon:barrel-standard', 'gun-part-icon:barrel-long',
  'gun-part-icon:optic-red-dot', 'gun-part-icon:stock-padded',
  'gun-part-icon:trigger-hair', 'gun-part-icon:magazine-extended',
  'gun-part-icon:underbarrel-grenade', 'gun-part-icon:barrel-piercing',
  'gun-part-icon:trait-fire', 'gun-part-icon:trait-fire-mastered',
  'gun-slot-icon:receiver', 'gun-slot-icon:barrel', 'gun-slot-icon:optic',
  'gun-slot-icon:stock', 'gun-slot-icon:trigger', 'gun-slot-icon:magazine',
  'gun-slot-icon:underbarrel', 'gun-slot-icon:trait',
  'trait-icon:fire', 'trait-icon:explosive', 'trait-icon:piercing',
];
const atlasFrames = Object.fromEntries(names.map((name, index) => [name, { frame: { x: index * 32, y: 0, w: 32, h: 32 } }]));
const readPxo = (member, encoding) => execFileSync('unzip', ['-p', source, member], { encoding });
const project = JSON.parse(readPxo('data.json', 'utf8'));
const { size_x: width, size_y: height } = project;
if (width !== names.length * 32 || height !== 32 || !Array.isArray(project.layers) || !Array.isArray(project.frames) || project.frames.length !== 1) {
  throw new Error(`Gunsmith source must be one ${names.length * 32}x32 Pixelorama frame`);
}
const output = Buffer.alloc(width * height * 4);
const alphaComposite = (destination, sourcePixels) => {
  for (let index = 0; index < sourcePixels.length; index += 4) {
    const alpha = sourcePixels[index + 3] / 255;
    if (alpha === 0) continue;
    const under = destination[index + 3] / 255;
    const outAlpha = alpha + under * (1 - alpha);
    for (let channel = 0; channel < 3; channel += 1) destination[index + channel] = Math.round((sourcePixels[index + channel] * alpha + destination[index + channel] * under * (1 - alpha)) / outAlpha);
    destination[index + 3] = Math.round(outAlpha * 255);
  }
};
for (const [index, layer] of project.layers.entries()) {
  if (layer.visible !== true) continue;
  const raw = readPxo(`image_data/frames/1/layer_${index + 1}`);
  if (raw.length !== output.length) throw new Error(`Invalid RGBA cel for Gunsmith layer ${index + 1}`);
  alphaComposite(output, raw);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([header, data, tail]); };
const rows = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) output.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
mkdirSync(runtime, { recursive: true });
writeFileSync(join(runtime, 'gunsmith-icons-atlas.png'), png);
writeFileSync(join(runtime, 'gunsmith-icons-atlas.json'), `${JSON.stringify({ ...project, export_directory_path: '', export_file_name: 'gunsmith-icons-atlas', frames: atlasFrames }, null, 2)}\n`);
