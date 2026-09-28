#!/usr/bin/env node
/** Deterministic, source-backed UI atlas exporter. */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../../..');
const sourcePath = join(root, 'assets-src/ui/source/ui-atlas.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const logicalSize = 24;
const pixelScale = 2;
const size = logicalSize * pixelScale;
const columns = 16;
const rows = Math.ceil(source.frames.length / columns);
const width = columns * size;
const height = rows * size;
const palette = Object.fromEntries(Object.entries(source.palette).map(([k, v]) => [k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]]));
const pixels = Buffer.alloc(width * height * 4);
const put = (x, y, color) => {
  for (let sy = 0; sy < pixelScale; sy++) for (let sx = 0; sx < pixelScale; sx++) {
    const px = x * pixelScale + sx; const py = y * pixelScale + sy;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const i = (py * width + px) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
};
const rect = (ox, oy, x, y, w, h, color) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(ox + xx, oy + yy, palette[color]); };
const clearRect = (ox, oy, x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) for (let sy = 0; sy < pixelScale; sy++) for (let sx = 0; sx < pixelScale; sx++) { const px = (ox + xx) * pixelScale + sx; const py = (oy + yy) * pixelScale + sy; pixels.fill(0, (py * width + px) * 4, (py * width + px) * 4 + 4); } };
const line = (ox, oy, x0, y0, x1, y1, color) => { const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (;;) { put(ox + x0, oy + y0, palette[color]); if (x0 === x1 && y0 === y1) break; const e = 2 * err; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } } };
function draw(id, ox, oy) {
  const n = id.split(':')[1] ?? id; const family = id.split(':')[0];
  if (family !== 'ui-chrome') rect(ox, oy, 0, 0, size, size, 'outline');
  if (family === 'brand') {
    if (n === 'title-lockup') {
      line(ox, oy, 4, 8, 7, 3, 'cream'); line(ox, oy, 7, 3, 10, 7, 'cream');
      line(ox, oy, 14, 7, 17, 3, 'cream'); line(ox, oy, 17, 3, 20, 8, 'cream');
      rect(ox, oy, 4, 8, 16, 11, 'cream'); rect(ox, oy, 6, 10, 12, 7, 'slate');
      rect(ox, oy, 8, 11, 2, 2, 'cyan'); rect(ox, oy, 14, 11, 2, 2, 'cyan');
      line(ox, oy, 10, 15, 12, 17, 'gold'); line(ox, oy, 14, 15, 12, 17, 'gold');
      line(ox, oy, 3, 21, 21, 21, 'cyan');
    } else {
      rect(ox, oy, 0, 0, 24, 24, 'outline'); rect(ox, oy, 1, 1, 22, 22, 'slate');
      line(ox, oy, 1, 7, 23, 7, 'steel'); line(ox, oy, 7, 1, 7, 23, 'steel');
      rect(ox, oy, 3, 12, 7, 7, 'outline'); rect(ox, oy, 4, 13, 5, 5, 'steel');
      line(ox, oy, 4, 13, 9, 18, 'gold'); line(ox, oy, 9, 13, 4, 18, 'gold');
      rect(ox, oy, 15, 3, 5, 3, 'outline'); rect(ox, oy, 16, 4, 3, 1, 'cream');
      line(ox, oy, 11, 21, 22, 21, 'cyan'); rect(ox, oy, 18, 19, 2, 2, 'cyan');
    }
    return;
  }
  if (family === 'ui-chrome') {
    const border = n === 'focus' || n === 'scroll-thumb' ? 'cyan' : n === 'disabled' || n === 'scroll-track' ? 'steel' : n === 'modal' ? 'gold' : 'cream';
    rect(ox, oy, 0, 0, 24, 24, 'outline');
    rect(ox, oy, 1, 1, 22, 22, border);
    if (n === 'focus') { clearRect(ox, oy, 3, 3, 18, 18); rect(ox, oy, 2, 2, 5, 2, 'cyan'); rect(ox, oy, 2, 2, 2, 5, 'cyan'); rect(ox, oy, 17, 20, 5, 2, 'cyan'); rect(ox, oy, 20, 17, 2, 5, 'cyan'); }
    else rect(ox, oy, 3, 3, 18, 18, 'slate');
    if (n === 'panel') { rect(ox, oy, 3, 3, 2, 2, 'gold'); rect(ox, oy, 19, 3, 2, 2, 'gold'); rect(ox, oy, 3, 19, 2, 2, 'gold'); rect(ox, oy, 19, 19, 2, 2, 'gold'); }
    else if (n === 'card') { clearRect(ox, oy, 3, 3, 3, 3); clearRect(ox, oy, 18, 18, 3, 3); line(ox, oy, 5, 4, 19, 4, 'cream'); line(ox, oy, 4, 5, 4, 19, 'cream'); }
    else if (n === 'tab') { rect(ox, oy, 3, 3, 18, 4, 'cyan'); rect(ox, oy, 7, 9, 10, 2, 'steel'); }
    else if (n === 'tooltip') { rect(ox, oy, 5, 5, 14, 12, 'cream'); rect(ox, oy, 7, 7, 10, 8, 'slate'); line(ox, oy, 9, 17, 12, 21, 'cream'); line(ox, oy, 12, 21, 15, 17, 'cream'); }
    else if (n === 'modal') { rect(ox, oy, 3, 3, 18, 4, 'gold'); rect(ox, oy, 3, 18, 18, 3, 'gold'); rect(ox, oy, 6, 9, 12, 2, 'steel'); }
    else if (n === 'disabled') { line(ox, oy, 5, 18, 18, 5, 'steel', 2); line(ox, oy, 5, 15, 15, 5, 'outline'); }
    else if (n === 'scroll-track') { rect(ox, oy, 10, 3, 4, 18, 'outline'); rect(ox, oy, 11, 4, 2, 16, 'steel'); }
    else if (n === 'scroll-thumb') { rect(ox, oy, 8, 5, 8, 14, 'cyan'); rect(ox, oy, 10, 8, 4, 2, 'cream'); rect(ox, oy, 10, 14, 4, 2, 'cream'); }
    if (n === 'chevron') { line(ox, oy, 8, 6, 16, 12, 'cream'); line(ox, oy, 16, 12, 8, 18, 'cream'); }
    else if (n === 'locked') { rect(ox, oy, 8, 11, 8, 8, 'cream'); rect(ox, oy, 10, 6, 4, 7, 'cream'); }
    else if (n === 'complete' || n === 'cleared') { line(ox, oy, 6, 12, 10, 16, 'cream'); line(ox, oy, 10, 16, 18, 7, 'cream'); }
    else if (n === 'failed') { line(ox, oy, 7, 7, 17, 17, 'danger'); line(ox, oy, 17, 7, 7, 17, 'danger'); }
    else if (n === 'merge') { line(ox, oy, 6, 8, 12, 12, 'cream'); line(ox, oy, 6, 16, 12, 12, 'cream'); line(ox, oy, 12, 12, 18, 12, 'cyan'); }
    else if (n === 'new') { line(ox, oy, 12, 4, 12, 20, 'gold'); line(ox, oy, 4, 12, 20, 12, 'gold'); line(ox, oy, 7, 7, 17, 17, 'cream'); line(ox, oy, 17, 7, 7, 17, 'cream'); }
    else if (n === 'unlocked') { rect(ox, oy, 8, 11, 9, 8, 'cream'); line(ox, oy, 10, 11, 10, 7, 'cyan'); line(ox, oy, 10, 7, 15, 7, 'cyan'); line(ox, oy, 15, 7, 17, 9, 'cyan'); }
    else if (n === 'boss') { line(ox, oy, 12, 4, 20, 12, 'danger'); line(ox, oy, 20, 12, 12, 20, 'danger'); line(ox, oy, 12, 20, 4, 12, 'danger'); line(ox, oy, 4, 12, 12, 4, 'danger'); rect(ox, oy, 11, 8, 2, 7, 'cream'); rect(ox, oy, 11, 17, 2, 2, 'cream'); }
    return;
  }
  if (family === 'nav-icon') {
    rect(ox, oy, 3, 3, 18, 18, 'slate');
    if (n === 'play-contract') { line(ox, oy, 8, 6, 17, 12, 'gold'); line(ox, oy, 17, 12, 8, 18, 'gold'); line(ox, oy, 8, 18, 8, 6, 'gold'); }
    else if (n === 'change-contract') { rect(ox, oy, 6, 6, 12, 12, 'cream'); line(ox, oy, 8, 9, 16, 9, 'cyan'); line(ox, oy, 8, 13, 14, 13, 'cyan'); line(ox, oy, 8, 16, 12, 16, 'cyan'); }
    else if (n === 'mercenary') { line(ox, oy, 7, 8, 9, 5, 'cream'); line(ox, oy, 15, 5, 17, 8, 'cream'); rect(ox, oy, 7, 8, 10, 8, 'cream'); rect(ox, oy, 5, 16, 14, 3, 'cream'); rect(ox, oy, 9, 11, 2, 2, 'cyan'); rect(ox, oy, 14, 11, 2, 2, 'cyan'); }
    else if (n === 'loadout' || n === 'equipment') { rect(ox, oy, 7, 5, 10, 14, 'cream'); line(ox, oy, 7, 10, 17, 10, 'cyan'); rect(ox, oy, 10, 3, 4, 3, 'gold'); }
    else if (n === 'career' || n === 'achievements') { rect(ox, oy, 9, 5, 6, 9, 'gold'); line(ox, oy, 9, 14, 7, 20, 'cyan'); line(ox, oy, 15, 14, 17, 20, 'cyan'); }
    else if (n === 'training') { rect(ox, oy, 6, 6, 12, 12, 'cream'); rect(ox, oy, 9, 9, 6, 6, 'slate'); rect(ox, oy, 11, 11, 2, 2, 'danger'); }
    else if (n === 'settings') { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); line(ox, oy, 12, 4, 12, 7, 'cyan'); line(ox, oy, 12, 17, 12, 20, 'cyan'); }
    else if (n === 'gunsmith') { rect(ox, oy, 5, 10, 14, 5, 'cream'); line(ox, oy, 7, 8, 17, 18, 'cyan'); }
    else if (n === 'compendium') { rect(ox, oy, 5, 5, 14, 14, 'cream'); line(ox, oy, 12, 5, 12, 19, 'cyan'); }
    else { line(ox, oy, 6, 17, 12, 6, 'cream'); line(ox, oy, 12, 6, 18, 17, 'cyan'); }
    return;
  }
  if (family === 'action-icon' || family === 'settings-icon' || family === 'hud-icon') { rect(ox, oy, 3, 3, 18, 18, 'slate'); if (n === 'move') { line(ox, oy, 12, 4, 12, 20, 'cream'); line(ox, oy, 4, 12, 20, 12, 'cream'); } else if (n === 'confirm') { line(ox, oy, 5, 12, 10, 17, 'cyan'); line(ox, oy, 10, 17, 19, 6, 'cyan'); } else if (n === 'back') { line(ox, oy, 6, 12, 18, 12, 'cream'); line(ox, oy, 6, 12, 12, 6, 'cream'); line(ox, oy, 6, 12, 12, 18, 'cream'); } else if (n === 'pause') { rect(ox, oy, 7, 6, 3, 12, 'cream'); rect(ox, oy, 14, 6, 3, 12, 'cream'); } else if (n === 'dash') { line(ox, oy, 4, 8, 15, 8, 'cyan'); line(ox, oy, 4, 12, 20, 12, 'cream'); line(ox, oy, 4, 16, 15, 16, 'cyan'); line(ox, oy, 15, 7, 20, 12, 'cream'); line(ox, oy, 20, 12, 15, 17, 'cream'); } else if (n === 'ability') { line(ox, oy, 12, 4, 14, 10, 'gold'); line(ox, oy, 14, 10, 20, 12, 'gold'); line(ox, oy, 20, 12, 14, 14, 'cyan'); line(ox, oy, 14, 14, 12, 20, 'cyan'); line(ox, oy, 12, 20, 10, 14, 'gold'); line(ox, oy, 10, 14, 4, 12, 'gold'); line(ox, oy, 4, 12, 10, 10, 'cyan'); line(ox, oy, 10, 10, 12, 4, 'cyan'); } else if (n === 'inventory') { rect(ox, oy, 6, 6, 5, 5, 'cream'); rect(ox, oy, 13, 6, 5, 5, 'cyan'); rect(ox, oy, 6, 13, 5, 5, 'gold'); rect(ox, oy, 13, 13, 5, 5, 'cream'); } else if (n === 'timer') { rect(ox, oy, 6, 6, 12, 12, 'gold'); rect(ox, oy, 11, 3, 2, 4, 'gold'); line(ox, oy, 12, 12, 17, 9, 'outline'); } else if (n === 'kills') { line(ox, oy, 5, 17, 12, 6, 'danger'); line(ox, oy, 12, 6, 19, 17, 'danger'); rect(ox, oy, 10, 10, 4, 4, 'cream'); } else if (n === 'health') { rect(ox, oy, 6, 8, 12, 10, 'cream'); line(ox, oy, 12, 5, 12, 20, 'danger'); line(ox, oy, 7, 12, 17, 12, 'danger'); } else if (n.includes('audio') || n === 'music' || n === 'sfx') { rect(ox, oy, 6, 10, 5, 7, 'cream'); line(ox, oy, 11, 10, 17, 6, 'cream'); line(ox, oy, 17, 6, 17, 18, 'cream'); } else if (n === 'reduced-motion') { line(ox, oy, 5, 9, 19, 9, 'cyan'); line(ox, oy, 5, 15, 14, 15, 'cream'); rect(ox, oy, 16, 13, 3, 5, 'gold'); } else if (n === 'fullscreen') { line(ox, oy, 5, 9, 5, 5, 'cream'); line(ox, oy, 5, 5, 9, 5, 'cream'); line(ox, oy, 19, 9, 19, 5, 'cream'); line(ox, oy, 19, 5, 15, 5, 'cream'); line(ox, oy, 12, 8, 12, 16, 'cyan'); } else { rect(ox, oy, 5, 5, 14, 14, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); } return; }
  if (family === 'chapter-icon' || family === 'objective-icon' || family === 'arena-card') { rect(ox, oy, 3, 4, 18, 16, 'slate'); if (n === 'kill' || n === 'defeat') { line(ox, oy, 5, 18, 12, 5, 'danger'); line(ox, oy, 12, 5, 19, 18, 'danger'); } else if (n === 'collect') { rect(ox, oy, 7, 7, 10, 10, 'gold'); line(ox, oy, 12, 4, 12, 20, 'cyan'); } else if (n === 'survive') { rect(ox, oy, 7, 5, 10, 14, 'cream'); line(ox, oy, 12, 8, 12, 16, 'cyan'); } else if (n === 'forge') { rect(ox, oy, 6, 8, 12, 9, 'gold'); rect(ox, oy, 9, 5, 6, 4, 'cream'); } else { line(ox, oy, 6, 17, 12, 6, 'gold'); line(ox, oy, 12, 6, 18, 17, 'gold'); line(ox, oy, 7, 14, 17, 14, 'cyan'); } return; }
  // Stat glyphs remain one family but each semantic has a distinct, compact read.
  rect(ox, oy, 5, 5, 14, 14, 'slate'); if (n === 'max-health' || n === 'healing') { line(ox, oy, 12, 6, 12, 18, 'danger'); line(ox, oy, 6, 12, 18, 12, 'danger'); } else if (n === 'move-speed' || n === 'projectile-speed') { line(ox, oy, 5, 12, 19, 12, 'cyan'); line(ox, oy, 14, 7, 19, 12, 'cyan'); line(ox, oy, 14, 17, 19, 12, 'cyan'); } else if (n === 'damage' || n === 'knockback') { line(ox, oy, 5, 12, 19, 12, 'gold'); line(ox, oy, 14, 7, 19, 12, 'gold'); } else if (n === 'attack-speed' || n === 'cooldown') { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 11, 4, 2, 8, 'cyan'); } else if (n === 'range' || n === 'pickup-radius') { rect(ox, oy, 10, 10, 4, 4, 'cream'); line(ox, oy, 4, 12, 8, 12, 'cyan'); line(ox, oy, 16, 12, 20, 12, 'cyan'); } else if (n === 'projectile-count' || n === 'spread') { line(ox, oy, 6, 16, 12, 8, 'cream'); line(ox, oy, 12, 8, 18, 16, 'cyan'); line(ox, oy, 12, 8, 12, 19, 'gold'); } else if (n === 'pierce') { line(ox, oy, 4, 12, 20, 12, 'cream'); rect(ox, oy, 10, 7, 4, 10, 'cyan'); } else if (n === 'currency-gain' || n === 'xp-gain') { rect(ox, oy, 7, 7, 10, 10, 'gold'); line(ox, oy, 12, 4, 12, 20, 'cream'); } else { rect(ox, oy, 7, 7, 10, 10, 'cream'); rect(ox, oy, 10, 10, 4, 4, 'outline'); }
}
source.frames.forEach((id, index) => draw(id, (index % columns) * logicalSize, Math.floor(index / columns) * logicalSize));
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length); h.write(type, 4); const t = Buffer.alloc(4); t.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([h, data, t]); };
const rowsData = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) pixels.copy(rowsData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 0 + 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rowsData)), chunk('IEND', Buffer.alloc(0))]);
const frames = Object.fromEntries(source.frames.map((id, index) => [id, { frame: { x: (index % columns) * size, y: Math.floor(index / columns) * size, w: size, h: size } }]));
const atlas = `${JSON.stringify({ export_directory_path: '', export_file_name: 'ui-atlas', frames, meta: { app: 'meowcenary-ui-builder', version: 1, image: 'ui-atlas.png', scale: 1 } }, null, 2)}\n`;
const out = join(root, 'public/assets/ui');
const pxoPath = join(root, 'assets-src/ui/source/ui-atlas.pxo');
const pxoProject = {
  color_mode: 5, current_frame: 0, current_layer: 0,
  export_directory_path: 'assets-src/ui/source', export_file_format: 0,
  export_file_name: 'ui-atlas', fps: 8,
  frames: [{ cels: [{ opacity: 1, ui_color: '(0.0, 0.0, 0.0, 0.0)', z_index: 0 }], duration: 1 }],
  layers: [{ animated_params: '{}', blend_mode: 0, clipping_mask: false, effects: {}, locked: false, name: 'body', new_cels_linked: false, opacity: 1, parent: -1, type: 0, visible: true }],
  pixelorama_version: 'v1.2-stable', pxo_version: 7, size_x: width, size_y: height, tags: {},
};
function writePxo() {
  const temporary = mkdtempSync(join(tmpdir(), 'meowcenary-ui-pxo-'));
  try {
    const frameDir = join(temporary, 'image_data/frames/1');
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(temporary, 'data.json'), JSON.stringify(pxoProject));
    writeFileSync(join(temporary, 'mimetype'), 'application/x-pixelorama');
    writeFileSync(join(frameDir, 'layer_1'), pixels);
    const epoch = new Date('2020-01-01T00:00:00Z');
    for (const path of [join(temporary, 'data.json'), join(temporary, 'mimetype'), join(frameDir, 'layer_1')]) utimesSync(path, epoch, epoch);
    execFileSync('zip', ['-X', '-q', '-r', pxoPath, 'data.json', 'mimetype', 'image_data'], { cwd: temporary });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv.includes('--check')) {
  const committedPng = readFileSync(join(out, 'ui-atlas.png'));
  const committedJson = readFileSync(join(out, 'ui-atlas.json'), 'utf8');
  if (!committedPng.equals(png)) throw new Error('UI atlas PNG is out of date with its deterministic source');
  if (committedJson !== atlas) throw new Error('UI atlas JSON is out of date with its deterministic source');
  const pxoData = JSON.parse(execFileSync('unzip', ['-p', pxoPath, 'data.json'], { encoding: 'utf8' }));
  const pxoPixels = execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']);
  if (pxoData.size_x !== width || pxoData.size_y !== height || pxoData.export_file_name !== 'ui-atlas' || !pxoPixels.equals(pixels)) {
    throw new Error('UI Pixelorama source is out of date with its authored atlas source');
  }
} else {
  mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'ui-atlas.png'), png); writeFileSync(join(out, 'ui-atlas.json'), atlas); writePxo();
}
