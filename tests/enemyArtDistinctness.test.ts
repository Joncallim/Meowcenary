import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

const ENEMY_IDS = ['dust-mite', 'scrap-sniper', 'boss-crusher'] as const;
const FRAME_SIZE = 48;
const FRAME_COUNT = 16;

interface RgbaPng {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

function decodeRgbaPng(path: string): RgbaPng {
  const file = readFileSync(path);
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8, 13)]).toEqual([8, 6, 0, 0, 0]);
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const source = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = source[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const raw = source[y * (stride + 1) + x + 1];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : raw + paeth(left, up, upperLeft);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function framePixels(png: RgbaPng, frame: number): Uint8Array {
  const pixels = new Uint8Array(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const start = (y * png.width + frame * FRAME_SIZE) * 4;
    pixels.set(png.pixels.subarray(start, start + FRAME_SIZE * 4), y * FRAME_SIZE * 4);
  }
  return pixels;
}

function alphaMask(png: RgbaPng, frame: number): Set<number> {
  const pixels = framePixels(png, frame);
  const mask = new Set<number>();
  for (let pixel = 0; pixel < FRAME_SIZE * FRAME_SIZE; pixel += 1) {
    if (pixels[pixel * 4 + 3] !== 0) mask.add(pixel);
  }
  return mask;
}

function maskBounds(mask: ReadonlySet<number>) {
  expect(mask.size).toBeGreaterThan(0);
  const xs = [...mask].map((pixel) => pixel % FRAME_SIZE);
  const ys = [...mask].map((pixel) => Math.floor(pixel / FRAME_SIZE));
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    centerX: xs.reduce((sum, x) => sum + x, 0) / xs.length,
  };
}

function intersectionOverUnion(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let intersection = 0;
  for (const pixel of a) if (b.has(pixel)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function grayscaleHash(png: RgbaPng, frame: number): string {
  const source = framePixels(png, frame);
  const gray = Buffer.alloc(FRAME_SIZE * FRAME_SIZE);
  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * 4;
    gray[pixel] = source[offset + 3] === 0 ? 0 : Math.round(
      source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114,
    );
  }
  return createHash('sha256').update(gray).digest('hex');
}

function visiblePxoPixels(path: string): Uint8Array {
  const extracted = mkdtempSync(join(tmpdir(), 'meowcenary-enemy-pxo-'));
  try {
    execFileSync('unzip', ['-q', path, '-d', extracted]);
    const project = JSON.parse(readFileSync(join(extracted, 'data.json'), 'utf8')) as {
      layers: Array<{ visible: boolean }>;
      frames: unknown[];
      size_x: number;
      size_y: number;
    };
    expect(project).toMatchObject({ size_x: FRAME_SIZE, size_y: FRAME_SIZE });
    expect(project.frames).toHaveLength(FRAME_COUNT);
    const visibleLayers = project.layers
      .map((layer, index) => ({ index: index + 1, visible: layer.visible }))
      .filter((layer) => layer.visible);
    const sheet = new Uint8Array(FRAME_COUNT * FRAME_SIZE * FRAME_SIZE * 4);
    for (let frame = 1; frame <= FRAME_COUNT; frame += 1) {
      for (const layer of visibleLayers) {
        const pixels = readFileSync(join(extracted, `image_data/frames/${frame}/layer_${layer.index}`));
        expect(pixels).toHaveLength(FRAME_SIZE * FRAME_SIZE * 4);
        for (let source = 0; source < pixels.length; source += 4) {
          if (pixels[source + 3] === 0) continue;
          const x = source / 4 % FRAME_SIZE;
          const y = Math.floor(source / 4 / FRAME_SIZE);
          const destination = (y * FRAME_COUNT * FRAME_SIZE + (frame - 1) * FRAME_SIZE + x) * 4;
          sheet.set(pixels.subarray(source, source + 4), destination);
        }
      }
    }
    return sheet;
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

describe('Alpha 3 enemy production-art distinction', () => {
  const actors = ENEMY_IDS.map((id) => ({
    id,
    png: decodeRgbaPng(`public/assets/enemies/${id}/${id}.png`),
  }));

  it('rejects duplicate final art and keeps all three native silhouettes and grayscale reads distinct', () => {
    expect(new Set(actors.map(({ png }) => createHash('sha256').update(png.pixels).digest('hex'))).size)
      .toBe(ENEMY_IDS.length);
    expect(new Set(actors.map(({ png }) => grayscaleHash(png, 0))).size).toBe(ENEMY_IDS.length);
    for (let left = 0; left < actors.length; left += 1) {
      for (let right = left + 1; right < actors.length; right += 1) {
        expect(
          intersectionOverUnion(alphaMask(actors[left]!.png, 0), alphaMask(actors[right]!.png, 0)),
          `${actors[left]!.id}/${actors[right]!.id}`,
        ).toBeLessThan(0.7);
      }
    }
  });

  it('keeps every frame inside the canvas, grounded, centred, and visibly animated in each clip', () => {
    const clips = [[0, 3], [4, 9], [10, 11], [12, 15]] as const;
    for (const { id, png } of actors) {
      expect(png).toMatchObject({ width: FRAME_SIZE * FRAME_COUNT, height: FRAME_SIZE });
      const activeBounds = Array.from({ length: 12 }, (_, frame) => maskBounds(alphaMask(png, frame)));
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const bounds = maskBounds(alphaMask(png, frame));
        expect(bounds.minX, `${id} frame ${frame + 1} left crop`).toBeGreaterThan(0);
        expect(bounds.maxX, `${id} frame ${frame + 1} right crop`).toBeLessThan(FRAME_SIZE - 1);
        expect(bounds.minY, `${id} frame ${frame + 1} top crop`).toBeGreaterThan(0);
        expect(bounds.maxY, `${id} frame ${frame + 1} bottom crop`).toBeLessThan(FRAME_SIZE - 1);
      }
      expect(Math.max(...activeBounds.map((bounds) => bounds.maxY)) - Math.min(...activeBounds.map((bounds) => bounds.maxY)), `${id} ground drift`)
        .toBeLessThanOrEqual(2);
      expect(Math.max(...activeBounds.map((bounds) => bounds.centerX)) - Math.min(...activeBounds.map((bounds) => bounds.centerX)), `${id} horizontal anchor drift`)
        .toBeLessThanOrEqual(3);
      for (const [start, end] of clips) {
        const hashes = new Set<string>();
        for (let frame = start; frame <= end; frame += 1) {
          hashes.add(createHash('sha256').update(framePixels(png, frame)).digest('hex'));
        }
        expect(hashes.size, `${id} frames ${start + 1}-${end + 1} are static`).toBeGreaterThan(1);
      }
    }
  });

  it('keeps runtime pixels exactly reproducible from visible editable PXO layers', () => {
    for (const { id, png } of actors) {
      expect(png.pixels, id).toEqual(visiblePxoPixels(`assets-src/enemies/${id}/source/${id}.pxo`));
    }
  }, 15_000);

  it('preserves the gameplay definitions and stable logical/physical presentation contract', () => {
    const data = loadGameData();
    const registry = new DataVisualArtRegistry(data);
    expect(data.enemies.filter((enemy) => ENEMY_IDS.includes(enemy.id as typeof ENEMY_IDS[number])))
      .toEqual([
        { id: 'dust-mite', name: 'Dust Mite', archetype: 'chaser', health: 10, damage: 5, speed: 68, xpValue: 1, scrapValue: 1, contactDamage: true },
        { id: 'scrap-sniper', name: 'Scrap Sniper', archetype: 'ranged', health: 16, damage: 6, speed: 58, xpValue: 3, scrapValue: 3, contactDamage: false, lootTableId: 'chest-standard', attack: { range: 190, telegraphMs: 700, cooldownMs: 1100 } },
        { id: 'boss-crusher', name: 'Scrap Crusher', archetype: 'boss', health: 420, damage: 22, speed: 46, xpValue: 40, scrapValue: 60, contactDamage: false, lootTableId: 'brute-cache', attack: { triggerRange: 210, telegraphMs: 900, dashSpeed: 340, dashDurationMs: 420, cooldownMs: 1500 }, actions: [{ id: 'boss-action:aimed-shot' }], phases: [{ id: 'boss-phase-crusher-enraged', atHealthFraction: 0.5, attack: { triggerRange: 240, telegraphMs: 650, dashSpeed: 390, dashDurationMs: 460, cooldownMs: 1100 }, actions: [] }] },
      ]);
    for (const id of ENEMY_IDS) {
      expect(registry.bindingById(`enemy:${id}`)).toMatchObject({
        id: `enemy:${id}`,
        kind: 'enemy',
        display: { width: 26, height: 26 },
        resourceId: `resource:enemy-${id}`,
        load: { type: 'spritesheet', frame: { width: 48, height: 48 } },
        clips: {
          idle: { start: 0, end: 3, frameRate: 6, repeat: -1 },
          run: { start: 4, end: 9, frameRate: 10, repeat: -1 },
          hurt: { start: 10, end: 11, frameRate: 12, repeat: 0 },
          defeat: { start: 12, end: 15, frameRate: 8, repeat: 0 },
        },
      });
    }
  });
});
