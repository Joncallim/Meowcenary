#!/usr/bin/env node
/** Deterministic, source-backed UI atlas exporter. */
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const sourcePath = join(root, 'assets-src/ui/source/ui-atlas.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const size = 24;
const columns = 16;
const rows = Math.ceil(source.frames.length / columns);
const width = columns * size;
const height = rows * size;
const palette = Object.fromEntries(Object.entries(source.palette).map(([k, v]) => [k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]]));
const pixels = Buffer.alloc(width * height * 4);
const put = (x, y, color) => { if (x < 0 || y < 0 || x >= width || y >= height) return; const i = (y * width + x) * 4; pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255; };
const rect = (ox, oy, x, y, w, h, color) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(ox + xx, oy + yy, palette[color]); };
const line = (ox, oy, x0, y0, x1, y1, color) => { const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (;;) { put(ox + x0, oy + y0, palette[color]); if (x0 === x1 && y0 === y1) break; const e = 2 * err; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } } };
function draw(id, ox, oy) {
  const n = id.split(':')[1] ?? id; const family = id.split(':')[0];
  rect(ox, oy, 0, 0, size, size, 'outline');
  if (family === 'brand') { if (n === 'title-lockup') { rect(ox, oy, 3, 7, 18, 10, 'cream'); rect(ox, oy, 6, 10, 3, 4, 'cyan'); rect(ox, oy, 15, 10, 3, 4, 'cyan'); } else { rect(ox, oy, 2, 2, 20, 20, 'slate'); rect(ox, oy, 5, 5, 2, 14, 'steel'); rect(ox, oy, 11, 4, 2, 16, 'steel'); rect(ox, oy, 17, 6, 2, 14, 'steel'); line(ox, oy, 4, 18, 20, 18, 'cyan'); } return; }
  if (family === 'ui-chrome') { const c = n === 'focus' ? 'cyan' : n === 'disabled' ? 'steel' : 'slate'; rect(ox, oy, 2, 2, 20, 20, c); rect(ox, oy, 4, 4, 16, 16, 'outline'); if (n === 'chevron') { line(ox, oy, 7, 5, 16, 12, 'cream'); line(ox, oy, 16, 12, 7, 19, 'cream'); } else if (n === 'locked') { rect(ox, oy, 7, 10, 10, 9, 'cream'); rect(ox, oy, 9, 5, 6, 8, 'cream'); } else if (n === 'complete' || n === 'cleared') { line(ox, oy, 5, 12, 10, 17, 'cream'); line(ox, oy, 10, 17, 19, 6, 'cream'); } else if (n === 'failed') { line(ox, oy, 6, 6, 18, 18, 'danger'); line(ox, oy, 18, 6, 6, 18, 'danger'); } else if (n === 'merge') { line(ox, oy, 5, 8, 12, 12, 'cream'); line(ox, oy, 5, 16, 12, 12, 'cream'); line(ox, oy, 12, 12, 19, 12, 'cyan'); } else { rect(ox, oy, 6, 6, 12, 2, 'cream'); rect(ox, oy, 6, 16, 12, 2, 'cream'); rect(ox, oy, 6, 8, 2, 8, 'cream'); rect(ox, oy, 16, 8, 2, 8, 'cream'); } return; }
  if (family === 'nav-icon') { rect(ox, oy, 3, 3, 18, 18, 'slate'); if (n === 'stages') { rect(ox, oy, 6, 6, 12, 12, 'cream'); line(ox, oy, 8, 9, 16, 9, 'cyan'); line(ox, oy, 8, 13, 14, 13, 'cyan'); } else if (n === 'characters' || n === 'career') { rect(ox, oy, 8, 5, 8, 7, 'cream'); rect(ox, oy, 5, 12, 14, 7, 'cream'); } else if (n === 'gunsmith') { rect(ox, oy, 5, 10, 14, 5, 'cream'); line(ox, oy, 7, 8, 17, 18, 'cyan'); } else if (n === 'equipment') { rect(ox, oy, 7, 5, 10, 14, 'cream'); line(ox, oy, 7, 10, 17, 10, 'cyan'); } else if (n === 'settings') { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); } else if (n === 'compendium') { rect(ox, oy, 5, 5, 14, 14, 'cream'); line(ox, oy, 12, 5, 12, 19, 'cyan'); } else if (n === 'golden-run') { line(ox, oy, 6, 12, 12, 6, 'gold'); line(ox, oy, 12, 6, 18, 12, 'gold'); line(ox, oy, 18, 12, 12, 18, 'gold'); line(ox, oy, 12, 18, 6, 12, 'gold'); } else { line(ox, oy, 6, 17, 12, 6, 'cream'); line(ox, oy, 12, 6, 18, 17, 'cyan'); } return; }
  if (family === 'action-icon' || family === 'settings-icon' || family === 'hud-icon') { rect(ox, oy, 3, 3, 18, 18, 'slate'); if (n === 'move') { line(ox, oy, 12, 4, 12, 20, 'cream'); line(ox, oy, 4, 12, 20, 12, 'cream'); } else if (n === 'confirm') { line(ox, oy, 5, 12, 10, 17, 'cyan'); line(ox, oy, 10, 17, 19, 6, 'cyan'); } else if (n === 'back') { line(ox, oy, 6, 12, 18, 12, 'cream'); line(ox, oy, 6, 12, 12, 6, 'cream'); line(ox, oy, 6, 12, 12, 18, 'cream'); } else if (n === 'pause') { rect(ox, oy, 7, 6, 3, 12, 'cream'); rect(ox, oy, 14, 6, 3, 12, 'cream'); } else if (n === 'timer') { rect(ox, oy, 6, 6, 12, 12, 'gold'); rect(ox, oy, 11, 3, 2, 4, 'gold'); line(ox, oy, 12, 12, 17, 9, 'outline'); } else if (n === 'kills') { line(ox, oy, 5, 17, 12, 6, 'danger'); line(ox, oy, 12, 6, 19, 17, 'danger'); rect(ox, oy, 10, 10, 4, 4, 'cream'); } else if (n.includes('audio') || n === 'music' || n === 'sfx') { rect(ox, oy, 6, 10, 5, 7, 'cream'); line(ox, oy, 11, 10, 17, 6, 'cream'); line(ox, oy, 17, 6, 17, 18, 'cream'); } else if (n === 'fullscreen') { line(ox, oy, 5, 9, 5, 5, 'cream'); line(ox, oy, 5, 5, 9, 5, 'cream'); line(ox, oy, 19, 9, 19, 5, 'cream'); line(ox, oy, 19, 5, 15, 5, 'cream'); line(ox, oy, 12, 8, 12, 16, 'cyan'); } else { rect(ox, oy, 5, 5, 14, 14, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); } return; }
  if (family === 'chapter-icon' || family === 'objective-icon' || family === 'arena-card') { rect(ox, oy, 3, 4, 18, 16, 'slate'); if (n === 'kill' || n === 'defeat') { line(ox, oy, 5, 18, 12, 5, 'danger'); line(ox, oy, 12, 5, 19, 18, 'danger'); } else if (n === 'collect') { rect(ox, oy, 7, 7, 10, 10, 'gold'); line(ox, oy, 12, 4, 12, 20, 'cyan'); } else if (n === 'survive') { rect(ox, oy, 7, 5, 10, 14, 'cream'); line(ox, oy, 12, 8, 12, 16, 'cyan'); } else if (n === 'forge') { rect(ox, oy, 6, 8, 12, 9, 'gold'); rect(ox, oy, 9, 5, 6, 4, 'cream'); } else { line(ox, oy, 6, 17, 12, 6, 'gold'); line(ox, oy, 12, 6, 18, 17, 'gold'); line(ox, oy, 7, 14, 17, 14, 'cyan'); } return; }
  // Stat glyphs remain one family but each semantic has a distinct, compact read.
  rect(ox, oy, 5, 5, 14, 14, 'slate'); if (n === 'max-health' || n === 'healing') { line(ox, oy, 12, 6, 12, 18, 'danger'); line(ox, oy, 6, 12, 18, 12, 'danger'); } else if (n === 'move-speed' || n === 'projectile-speed') { line(ox, oy, 5, 12, 19, 12, 'cyan'); line(ox, oy, 14, 7, 19, 12, 'cyan'); line(ox, oy, 14, 17, 19, 12, 'cyan'); } else if (n === 'damage' || n === 'knockback') { line(ox, oy, 5, 12, 19, 12, 'gold'); line(ox, oy, 14, 7, 19, 12, 'gold'); } else if (n === 'attack-speed' || n === 'cooldown') { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 11, 4, 2, 8, 'cyan'); } else if (n === 'range' || n === 'pickup-radius') { rect(ox, oy, 10, 10, 4, 4, 'cream'); line(ox, oy, 4, 12, 8, 12, 'cyan'); line(ox, oy, 16, 12, 20, 12, 'cyan'); } else if (n === 'projectile-count' || n === 'spread') { line(ox, oy, 6, 16, 12, 8, 'cream'); line(ox, oy, 12, 8, 18, 16, 'cyan'); line(ox, oy, 12, 8, 12, 19, 'gold'); } else if (n === 'pierce') { line(ox, oy, 4, 12, 20, 12, 'cream'); rect(ox, oy, 10, 7, 4, 10, 'cyan'); } else if (n === 'currency-gain' || n === 'xp-gain') { rect(ox, oy, 7, 7, 10, 10, 'gold'); line(ox, oy, 12, 4, 12, 20, 'cream'); } else { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); }
}
source.frames.forEach((id, index) => draw(id, (index % columns) * size, Math.floor(index / columns) * size));
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length); h.write(type, 4); const t = Buffer.alloc(4); t.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([h, data, t]); };
const rowsData = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) pixels.copy(rowsData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 0 + 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rowsData)), chunk('IEND', Buffer.alloc(0))]);
const frames = Object.fromEntries(source.frames.map((id, index) => [id, { frame: { x: (index % columns) * size, y: Math.floor(index / columns) * size, w: size, h: size } }]));
const atlas = `${JSON.stringify({ frames, meta: { app: 'meowcenary-ui-builder', version: 1, image: 'ui-atlas.png', scale: 1 } }, null, 2)}\n`;
const out = join(root, 'public/assets/ui');
if (process.argv.includes('--check')) {
  const committedPng = readFileSync(join(out, 'ui-atlas.png'));
  const committedJson = readFileSync(join(out, 'ui-atlas.json'), 'utf8');
  if (!committedPng.equals(png)) throw new Error('UI atlas PNG is out of date with its deterministic source');
  if (committedJson !== atlas) throw new Error('UI atlas JSON is out of date with its deterministic source');
} else {
  mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'ui-atlas.png'), png); writeFileSync(join(out, 'ui-atlas.json'), atlas);
}
