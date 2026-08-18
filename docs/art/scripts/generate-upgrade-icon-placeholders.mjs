#!/usr/bin/env node
// Epic 18 (D8) — deterministic placeholder PNG + Pixelorama-metadata
// generator for run-upgrade card icons.
//
// This environment has no real Pixelorama binary (export-pixelorama.sh
// requires one), so the shipped export/metadata pair is synthesized here in
// pure Node, mirroring the exact same category-motif pixel design the
// paired Lua builder (docs/art/scripts/build-upgrade-icon-<id>.lua, via
// lib/epic18-upgrade-icon-art.lua) draws for its `.pxo` source. Run:
//   node docs/art/scripts/generate-upgrade-icon-placeholders.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 48;

// ── Category motifs (mirrors lib/epic18-upgrade-icon-art.lua) ─────────────

const BG_COLORS = {
  offense: '#7f1d1d', defense: '#1e3a5f', mobility: '#14532d',
  utility: '#164e63', economy: '#78350f', synergy: '#581c87',
};
const GLYPH_COLORS = {
  offense: '#ef4444', defense: '#60a5fa', mobility: '#4ade80',
  utility: '#22d3ee', economy: '#fbbf24', synergy: '#c084fc',
};
// Must stay identical to lib/epic18-upgrade-icon-art.lua: at least as many
// accents as the largest category holds (synergy ships 8), or variants wrap
// and two cards render pixel-identical.
const ACCENT_VARIANTS = [
  '#fff3c4', '#f472b6', '#67e8f9', '#a3e635',
  '#fb923c', '#c4b5fd', '#f87171', '#34d399',
];

const CARDS = [
  ['quick-paws', 'mobility'],
  ['extra-scrap', 'economy'],
  ['hot-barrel', 'offense'],
  ['scrap-magnet', 'utility'],
  ['reinforced-coat', 'defense'],
  ['fast-learner', 'utility'],
  ['heavy-rounds', 'offense'],
  ['long-barrel', 'offense'],
  ['split-shot', 'offense'],
  ['punch-through', 'offense'],
  ['glass-cannon', 'synergy'],
  ['run-and-gun', 'synergy'],
  ['pistol-deadeye', 'synergy'],
  ['pistol-needle-rounds', 'synergy'],
  ['smg-overclock', 'synergy'],
  ['smg-spray', 'synergy'],
  ['shotgun-buckshot', 'synergy'],
  ['shotgun-breacher', 'synergy'],
];

function hex(h) {
  return [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
    255,
  ];
}

// ── Tiny RGBA canvas ────────────────────────────────────────────────────

function makeCanvas(size) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  return {
    size,
    pixels,
    setPixel(x, y, rgba) {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || x >= size || y < 0 || y >= size) return;
      const offset = (y * size + x) * 4;
      pixels[offset] = rgba[0];
      pixels[offset + 1] = rgba[1];
      pixels[offset + 2] = rgba[2];
      pixels[offset + 3] = rgba[3];
    },
    fillRect(x, y, w, h, rgba) {
      for (let yy = y; yy < y + h; yy += 1) {
        for (let xx = x; xx < x + w; xx += 1) this.setPixel(xx, yy, rgba);
      }
    },
    fillCircle(cx, cy, r, rgba) {
      const r2 = r * r;
      for (let yy = cy - r; yy <= cy + r; yy += 1) {
        for (let xx = cx - r; xx <= cx + r; xx += 1) {
          const dx = xx - cx;
          const dy = yy - cy;
          if (dx * dx + dy * dy <= r2 + 0.5) this.setPixel(xx, yy, rgba);
        }
      }
    },
  };
}

function outlinedCircle(canvas, cx, cy, r, fill, outline) {
  canvas.fillCircle(cx, cy, r + 1, outline);
  canvas.fillCircle(cx, cy, r, fill);
}

function outlinedRect(canvas, x, y, w, h, fill, outline) {
  canvas.fillRect(x - 1, y - 1, w + 2, h + 2, outline);
  canvas.fillRect(x, y, w, h, fill);
}

const OUTLINE = hex('#0a0f14');

const DRAWERS = {
  offense(canvas, glyph, accent) {
    for (let row = 0; row <= 9; row += 1) {
      const half = 10 - row;
      canvas.fillRect(24 - half, 14 + row * 2, half * 2, 3, glyph);
    }
    canvas.fillRect(22, 32, 4, 4, accent);
  },
  defense(canvas, glyph, accent) {
    outlinedRect(canvas, 16, 12, 16, 16, glyph, OUTLINE);
    for (let row = 0; row <= 7; row += 1) {
      canvas.fillRect(16 + row, 28 + row, 16 - row * 2, 1, glyph);
    }
    canvas.fillRect(22, 18, 4, 8, accent);
  },
  mobility(canvas, glyph, accent) {
    canvas.fillCircle(18, 20, 4, glyph);
    canvas.fillCircle(30, 20, 4, glyph);
    canvas.fillCircle(24, 28, 5, glyph);
    canvas.fillCircle(24, 16, 3, accent);
  },
  utility(canvas, glyph, accent) {
    canvas.fillRect(20, 12, 8, 24, glyph);
    canvas.fillRect(12, 20, 24, 8, glyph);
    canvas.fillCircle(24, 24, 4, accent);
  },
  economy(canvas, glyph, accent) {
    outlinedCircle(canvas, 24, 24, 12, glyph, OUTLINE);
    canvas.fillCircle(24, 24, 4, accent);
  },
  synergy(canvas, glyph, accent) {
    const diamond = (cx, cy, r, c) => {
      for (let dy = -r; dy <= r; dy += 1) {
        const half = r - Math.abs(dy);
        canvas.fillRect(cx - half, cy + dy, half * 2 + 1, 1, c);
      }
    };
    diamond(24, 24, 11, glyph);
    diamond(24, 24, 5, accent);
  },
};

// ── PNG encoding (RGBA8, no interlace) ──────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(canvas) {
  const { size, pixels } = canvas;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    raw.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), rowStart + 1);
  }
  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixelorama-format metadata sidecar ──────────────────────────────────

function encodeMetadata(exportName) {
  const layer = (name, visible) => ({
    animated_params: 'Dictionary[String, Dictionary]({\n"opacity": {}\n})',
    blend_mode: 0, clipping_mask: false, effects: [], locked: false, metadata: {},
    name, new_cels_linked: false, opacity: 1, parent: -1, type: 0,
    ui_color: '(0.0, 0.0, 0.0, 0.0)', visible,
  });
  const cel = () => ({ metadata: {}, opacity: 1, ui_color: '(0.0, 0.0, 0.0, 0.0)', z_index: 0 });

  return {
    author_company: '', author_contact: '', author_display_name: '', author_real_name: '',
    brushes: [], color_mode: 5, current_frame: 0, current_layer: 0,
    export_directory_path: '', export_file_format: 0, export_file_name: exportName, fps: 8,
    frames: [{ cels: [cel(), cel()], duration: 1, metadata: {} }],
    guides: [],
    layers: [layer('body', true), layer('notes', false)],
    license: '', metadata: {}, palettes: [],
    pixelorama_version: 'v1.2-stable', project_current_palette_name: '', pxo_version: 7,
    reference_images: [], size_x: SIZE, size_y: SIZE,
    symmetry_points: [SIZE * 2 - 1, SIZE * 2 - 1],
    tags: [], tile_mode_x_basis_x: SIZE, tile_mode_x_basis_y: 0,
    tile_mode_y_basis_x: 0, tile_mode_y_basis_y: SIZE, tilesets: [], user_data: '',
    vanishing_points: [],
  };
}

// ── Write output ─────────────────────────────────────────────────────────

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

for (const [cardId, category] of CARDS) {
  const exportName = `upgrade-icon-${cardId}`;
  const outDir = join(repoRoot, 'public', 'assets', 'upgrade-icons', exportName);
  mkdirSync(outDir, { recursive: true });

  const canvas = makeCanvas(SIZE);
  canvas.fillRect(4, 4, 40, 40, hex(BG_COLORS[category]));
  const cardIndex = CARDS.filter(([, cat]) => cat === category).findIndex(([id]) => id === cardId);
  const accent = hex(ACCENT_VARIANTS[cardIndex % ACCENT_VARIANTS.length]);
  DRAWERS[category](canvas, hex(GLYPH_COLORS[category]), accent);
  // Variant tally, mirroring drawVariantPips() in the paired Lua library.
  const pips = Math.min(cardIndex + 1, 9);
  for (let index = 0; index < pips; index += 1) {
    canvas.fillRect(6 + index * 4, 39, 3, 2, accent);
  }

  writeFileSync(join(outDir, `${exportName}.png`), encodePng(canvas));
  writeFileSync(join(outDir, `${exportName}.json`), `${JSON.stringify(encodeMetadata(exportName))}\n`);
}

console.log(`Generated ${CARDS.length} deterministic upgrade-icon placeholders in public/assets/upgrade-icons/`);
