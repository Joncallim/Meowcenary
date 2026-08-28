#!/usr/bin/env node
// Converts a transparent 4x4 ImageGen sheet into the horizontal Pixelorama
// spritesheet contract used by actor art.  The untouched ImageGen export stays
// alongside the editable .pxo source so the imported artwork is auditable.
import { deflateSync, inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [id, input] = process.argv.slice(2);
if (!id || !input) throw new Error('usage: import-imagegen-enemy-sheet.mjs <enemy-id> <input.png>');
const root = resolve(import.meta.dirname, '../../..');
const outDir = join(root, 'public/assets/enemies', id);
const sourceDir = join(root, 'assets-src/enemies', id, 'source');
const output = join(outDir, `${id}.png`);
const project = join(sourceDir, `${id}.pxo`);

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
function decodeRgba(path) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png[25] !== 6 || png[24] !== 8)
    throw new Error(`${path} must be an 8-bit RGBA PNG`);
  const idat = []; let p = 8;
  while (p < png.length) { const size = png.readUInt32BE(p); const type = png.subarray(p + 4, p + 8).toString(); if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + size)); p += 12 + size; }
  const packed = inflateSync(Buffer.concat(idat)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[src++], row = pixels.subarray(y * stride, (y + 1) * stride), prior = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) { const a = x >= 4 ? row[x - 4] : 0, b = prior ? prior[x] : 0, c = prior && x >= 4 ? prior[x - 4] : 0, v = packed[src++]; if (filter === 0) row[x] = v; else if (filter === 1) row[x] = (v + a) & 255; else if (filter === 2) row[x] = (v + b) & 255; else if (filter === 3) row[x] = (v + Math.floor((a + b) / 2)) & 255; else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); row[x] = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; } }
  }
  return { width, height, pixels };
}
function encodePng(width, height, pixels) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const source = decodeRgba(input);
const cell = Math.floor(Math.min(source.width, source.height) / 4);
if (cell < 1) throw new Error('ImageGen sheet must have four square cells per side');
const frames = Array.from({ length: 16 }, (_, frame) => {
  const x = (frame % 4) * cell, y = Math.floor(frame / 4) * cell, pixels = Buffer.alloc(cell * cell * 4);
  for (let row = 0; row < cell; row += 1) source.pixels.copy(pixels, row * cell * 4, ((y + row) * source.width + x) * 4, ((y + row) * source.width + x + cell) * 4);
  return pixels;
});
const sheet = Buffer.concat(frames);
mkdirSync(outDir, { recursive: true }); mkdirSync(sourceDir, { recursive: true });
writeFileSync(output, encodePng(cell * 16, cell, sheet));
copyFileSync(input, join(sourceDir, `${id}-imagegen.png`));
const tags = [['idle', 1, 4], ['run', 5, 10], ['hurt', 11, 12], ['defeat', 13, 16]].map(([name, from, to]) => ({ name, color: '62a0eaff', from, to }));
const metadata = { pixelorama_version: 'v1.2-stable', pxo_version: 7, size_x: cell, size_y: cell, color_mode: 5, layers: [{ name: 'imagegen-import', visible: true, locked: false, blend_mode: 0, clipping_mask: false, opacity: 1, parent: -1, effects: [], animated_params: '{}', type: 0, new_cels_linked: false }], frames: Array.from({ length: 16 }, () => ({ cels: [{ opacity: 1, z_index: 0, ui_color: '(0.0, 0.0, 0.0, 0.0)' }], duration: 1, metadata: {} })), tags, current_frame: 0, current_layer: 0, fps: 8, export_directory_path: '', export_file_name: id, export_file_format: 0 };
writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
const temp = mkdtempSync(join(tmpdir(), 'meowcenary-pxo-'));
try {
  writeFileSync(join(temp, 'data.json'), JSON.stringify({ ...metadata, export_directory_path: sourceDir }));
  writeFileSync(join(temp, 'mimetype'), 'application/x-pixelorama');
  for (let frame = 0; frame < 16; frame += 1) { const dir = join(temp, 'image_data/frames', String(frame + 1)); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'layer_1'), frames[frame]); }
  rmSync(project, { force: true }); execFileSync('zip', ['-q', '-X', '-r', project, 'data.json', 'mimetype', 'image_data'], { cwd: temp });
} finally { rmSync(temp, { recursive: true, force: true }); }
