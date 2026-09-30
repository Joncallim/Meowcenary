#!/usr/bin/env node
/** Deterministic authored brand/backdrop exporter for the reachable Alpha 3 menu. */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../../..');
const sourcePath = join(root, 'assets-src/ui/source/brand-art.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const { width, height } = source.canvas;
const palette = Object.fromEntries(Object.entries(source.palette).map(([key, value]) => [key, [
  parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 255,
]]));
const pixels = Buffer.alloc(width * height * 4);
const put = (x, y, color) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4; const rgba = palette[color];
  pixels[i] = rgba[0]; pixels[i + 1] = rgba[1]; pixels[i + 2] = rgba[2]; pixels[i + 3] = rgba[3];
};
const rect = (x, y, w, h, color) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, color); };
const line = (x0, y0, x1, y1, color, thickness = 1) => {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (;;) { rect(x0 - Math.floor(thickness / 2), y0 - Math.floor(thickness / 2), thickness, thickness, color); if (x0 === x1 && y0 === y1) break; const e = 2 * err; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } }
};

// Bespoke 5x7 salvage lettering. It is separate from the accessible scene text.
const glyphs = {
  A:['01110','10001','10001','11111','10001','10001','10001'], C:['01111','10000','10000','10000','10000','10000','01111'],
  E:['11111','10000','10000','11110','10000','10000','11111'], M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'], O:['01110','10001','10001','10001','10001','10001','01110'],
  R:['11110','10001','10001','11110','10100','10010','10001'], W:['10001','10001','10001','10101','10101','11011','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
};
const word = 'MEOWCENARY'; const scale = 4; const advance = 22; const startX = 130; const startY = 7;
for (let index = 0; index < word.length; index++) {
  const glyph = glyphs[word[index]]; const gx = startX + index * advance;
  rect(gx - 2, startY - 2, 24, 34, 'outline');
  glyph.forEach((row, y) => [...row].forEach((bit, x) => { if (bit === '1') rect(gx + x * scale, startY + y * scale, scale, scale, 'cream'); }));
  rect(gx + 2, startY + 30, 16, 2, index % 3 === 0 ? 'cyan' : 'rust');
}
// Paw-bolt maker's mark.
rect(121, 15, 5, 7, 'gold'); rect(123, 10, 4, 4, 'gold'); rect(118, 11, 3, 3, 'gold');
line(349, 9, 341, 22, 'cyan', 3); line(341, 22, 350, 22, 'cyan', 3); line(350, 22, 342, 36, 'cyan', 3);

const oy = 64;
// Asymmetric workshop wall, authored at a native presentation grid rather than tiled.
rect(0, oy, 480, 480, 'void'); rect(8, oy + 8, 464, 464, 'wallDark');
rect(18, oy + 18, 444, 330, 'wall');
for (const y of [82, 164, 246, 328]) line(18, oy + y, 461, oy + y, 'outline', 4);
for (const x of [72, 188, 316, 424]) line(x, oy + 18, x, oy + 348, 'steel', 2);
// Open yard/window on the left; intentionally survives portrait centre-cropping as a slim light cue.
rect(28, oy + 42, 104, 164, 'outline'); rect(34, oy + 48, 92, 152, 'yard');
rect(34, oy + 144, 92, 56, 'wallDark');
line(34, oy + 144, 72, oy + 105, 'rust', 5); line(72, oy + 105, 126, oy + 156, 'rust', 5);
rect(46, oy + 162, 18, 38, 'outline'); rect(92, oy + 174, 24, 26, 'outline');
// Central dispatch board is the calm text-safe area used behind menu content.
rect(143, oy + 34, 278, 286, 'outline'); rect(150, oy + 41, 264, 272, 'wallDark');
rect(158, oy + 49, 248, 256, 'wall');
for (const [x,y] of [[154,45],[410,45],[154,309],[410,309]]) { rect(x - 3, oy + y - 3, 7, 7, 'gold'); rect(x - 1, oy + y - 1, 3, 3, 'outline'); }
// Sparse route-string and clipped notes at the margins, leaving the central UI quiet.
line(172, oy + 78, 205, oy + 105, 'cyan', 2); line(205, oy + 105, 180, oy + 142, 'cyan', 2);
rect(168, oy + 70, 10, 10, 'cream'); rect(176, oy + 136, 10, 10, 'gold');
rect(366, oy + 68, 24, 36, 'cream'); rect(371, oy + 74, 14, 3, 'rust'); rect(371, oy + 82, 11, 3, 'steel');
// Hanging cable/tools and lower workbench establish the shelter without baked controls.
line(445, oy + 28, 445, oy + 166, 'outline', 5); line(445, oy + 166, 430, oy + 190, 'rust', 4);
line(52, oy + 238, 88, oy + 282, 'gold', 6); line(88, oy + 282, 62, oy + 310, 'gold', 6);
rect(0, oy + 350, 480, 130, 'outline'); rect(0, oy + 362, 480, 118, 'wallDark');
rect(22, oy + 378, 436, 18, 'rust'); rect(22, oy + 396, 436, 5, 'gold');
rect(44, oy + 412, 70, 48, 'steel'); rect(52, oy + 420, 54, 32, 'wall');
rect(350, oy + 408, 82, 52, 'steel'); rect(360, oy + 418, 62, 32, 'wall');
for (let x = 28; x < 460; x += 54) { rect(x, oy + 24 + ((x * 7) % 300), 4, 4, 'gold'); }

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([header, data, tail]); };
const rows = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
const frames = Object.fromEntries(Object.entries(source.frames).map(([id, f]) => [id, { frame: { x: f.x, y: f.y, w: f.width, h: f.height } }]));
const atlas = `${JSON.stringify({ export_directory_path: '', export_file_name: 'brand-art', frames, meta: { app: 'meowcenary-brand-builder', version: 1, image: 'brand-art.png', scale: 1 } }, null, 2)}\n`;
const out = join(root, 'public/assets/ui'); const pxoPath = join(root, 'assets-src/ui/source/brand-art.pxo');
const pxoProject = { color_mode: 5, current_frame: 0, current_layer: 0, export_directory_path: 'assets-src/ui/source', export_file_format: 0, export_file_name: 'brand-art', fps: 8, frames: [{ cels: [{ opacity: 1, ui_color: '(0.0, 0.0, 0.0, 0.0)', z_index: 0 }], duration: 1 }], layers: [{ animated_params: '{}', blend_mode: 0, clipping_mask: false, effects: {}, locked: false, name: 'authored brand and workshop backdrop', new_cels_linked: false, opacity: 1, parent: -1, type: 0, visible: true }], pixelorama_version: 'v1.2-stable', pxo_version: 7, size_x: width, size_y: height, tags: {} };
function writePxo() { const temporary = mkdtempSync(join(tmpdir(), 'meowcenary-brand-pxo-')); try { const frameDir = join(temporary, 'image_data/frames/1'); mkdirSync(frameDir, { recursive: true }); writeFileSync(join(temporary, 'data.json'), JSON.stringify(pxoProject)); writeFileSync(join(temporary, 'mimetype'), 'application/x-pixelorama'); writeFileSync(join(frameDir, 'layer_1'), pixels); const epoch = new Date('2020-01-01T00:00:00Z'); for (const path of [join(temporary, 'data.json'), join(temporary, 'mimetype'), join(frameDir, 'layer_1')]) utimesSync(path, epoch, epoch); execFileSync('zip', ['-X', '-q', '-r', pxoPath, 'data.json', 'mimetype', 'image_data'], { cwd: temporary }); } finally { rmSync(temporary, { recursive: true, force: true }); } }
if (process.argv.includes('--check')) {
  if (!readFileSync(join(out, 'brand-art.png')).equals(png)) throw new Error('Brand PNG is out of date');
  if (readFileSync(join(out, 'brand-art.json'), 'utf8') !== atlas) throw new Error('Brand atlas is out of date');
  const pxoMimetype = execFileSync('unzip', ['-p', pxoPath, 'mimetype']);
  const pxoMetadata = execFileSync('unzip', ['-p', pxoPath, 'data.json']);
  const pxoPixels = execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']);
  if (!pxoMimetype.equals(Buffer.from('application/x-pixelorama'))) throw new Error('Brand Pixelorama source has an invalid mimetype');
  if (!pxoMetadata.equals(Buffer.from(JSON.stringify(pxoProject)))) throw new Error('Brand Pixelorama project metadata is out of date');
  if (!pxoPixels.equals(pixels)) throw new Error('Brand Pixelorama source pixels are out of date');
} else {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'brand-art.png'), png);
  writeFileSync(join(out, 'brand-art.json'), atlas);
  writePxo();
}
