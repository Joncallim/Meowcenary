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
const RELEASE_ENEMY_IDS = [
  'dust-mite', 'junk-rusher', 'trash-brute', 'scrap-sniper', 'scrap-skitter',
  'bastion-beetle', 'junk-nester', 'shard-bot', 'boss-crusher', 'boss-forge',
] as const;
const FRAME_SIZES = { 'dust-mite': 48, 'scrap-sniper': 48, 'boss-crusher': 64 } as const;
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

function framePixels(png: RgbaPng, frame: number, frameSize: number): Uint8Array {
  const pixels = new Uint8Array(frameSize * frameSize * 4);
  for (let y = 0; y < frameSize; y += 1) {
    const start = (y * png.width + frame * frameSize) * 4;
    pixels.set(png.pixels.subarray(start, start + frameSize * 4), y * frameSize * 4);
  }
  return pixels;
}

function alphaMask(png: RgbaPng, frame: number, frameSize: number): Set<number> {
  const pixels = framePixels(png, frame, frameSize);
  const mask = new Set<number>();
  for (let pixel = 0; pixel < frameSize * frameSize; pixel += 1) {
    if (pixels[pixel * 4 + 3] !== 0) mask.add(pixel);
  }
  return mask;
}

function maskBounds(mask: ReadonlySet<number>, frameSize: number) {
  expect(mask.size).toBeGreaterThan(0);
  const xs = [...mask].map((pixel) => pixel % frameSize);
  const ys = [...mask].map((pixel) => Math.floor(pixel / frameSize));
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
    centerX: xs.reduce((sum, x) => sum + x, 0) / xs.length,
  };
}

function silhouetteHash(mask: ReadonlySet<number>): string {
  return createHash('sha256').update([...mask].sort((a, b) => a - b).join(',')).digest('hex');
}

function intersectionOverUnion(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let intersection = 0;
  for (const pixel of a) if (b.has(pixel)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function grayscaleHash(png: RgbaPng, frame: number, frameSize: number): string {
  const source = framePixels(png, frame, frameSize);
  const gray = Buffer.alloc(frameSize * frameSize);
  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * 4;
    gray[pixel] = source[offset + 3] === 0 ? 0 : Math.round(
      source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114,
    );
  }
  return createHash('sha256').update(gray).digest('hex');
}

function visiblePxoPixels(path: string, frameSize: number): Uint8Array {
  const extracted = mkdtempSync(join(tmpdir(), 'meowcenary-enemy-pxo-'));
  try {
    execFileSync('unzip', ['-q', path, '-d', extracted]);
    const project = JSON.parse(readFileSync(join(extracted, 'data.json'), 'utf8')) as {
      layers: Array<{ visible: boolean }>;
      frames: unknown[];
      size_x: number;
      size_y: number;
    };
    expect(project).toMatchObject({ size_x: frameSize, size_y: frameSize });
    expect(project.frames).toHaveLength(FRAME_COUNT);
    const visibleLayers = project.layers
      .map((layer, index) => ({ index: index + 1, visible: layer.visible }))
      .filter((layer) => layer.visible);
    const sheet = new Uint8Array(FRAME_COUNT * frameSize * frameSize * 4);
    for (let frame = 1; frame <= FRAME_COUNT; frame += 1) {
      for (const layer of visibleLayers) {
        const pixels = readFileSync(join(extracted, `image_data/frames/${frame}/layer_${layer.index}`));
        expect(pixels).toHaveLength(frameSize * frameSize * 4);
        for (let source = 0; source < pixels.length; source += 4) {
          if (pixels[source + 3] === 0) continue;
          const x = source / 4 % frameSize;
          const y = Math.floor(source / 4 / frameSize);
          const destination = (y * FRAME_COUNT * frameSize + (frame - 1) * frameSize + x) * 4;
          sheet.set(pixels.subarray(source, source + 4), destination);
        }
      }
    }
    return sheet;
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

function displayedIdleFrame(
  png: RgbaPng,
  sourceSize: number,
  displayWidth: number,
  displayHeight: number,
): { readonly mask: ReadonlySet<number>; readonly grayscale: Uint8Array } {
  const canvasSize = 40;
  const offsetX = Math.floor((canvasSize - displayWidth) / 2);
  const offsetY = Math.floor((canvasSize - displayHeight) / 2);
  const mask = new Set<number>();
  const grayscale = new Uint8Array(canvasSize * canvasSize);
  const source = framePixels(png, 0, sourceSize);
  for (let y = 0; y < displayHeight; y += 1) {
    for (let x = 0; x < displayWidth; x += 1) {
      const sourceX = Math.floor(x * sourceSize / displayWidth);
      const sourceY = Math.floor(y * sourceSize / displayHeight);
      const sourceOffset = (sourceY * sourceSize + sourceX) * 4;
      if (source[sourceOffset + 3] === 0) continue;
      const destination = (offsetY + y) * canvasSize + offsetX + x;
      mask.add(destination);
      grayscale[destination] = Math.round(
        source[sourceOffset] * 0.299
        + source[sourceOffset + 1] * 0.587
        + source[sourceOffset + 2] * 0.114,
      );
    }
  }
  return { mask, grayscale };
}

describe('Alpha 3 enemy production-art distinction', () => {
  const actors = ENEMY_IDS.map((id) => ({
    id,
    frameSize: FRAME_SIZES[id],
    png: decodeRgbaPng(`public/assets/enemies/${id}/${id}.png`),
  }));

  it('rejects duplicate final art and keeps all three native silhouettes and grayscale reads distinct', () => {
    expect(new Set(actors.map(({ png }) => createHash('sha256').update(png.pixels).digest('hex'))).size)
      .toBe(ENEMY_IDS.length);
    expect(new Set(actors.map(({ png, frameSize }) => grayscaleHash(png, 0, frameSize))).size).toBe(ENEMY_IDS.length);
    const mite = maskBounds(alphaMask(actors[0]!.png, 0, actors[0]!.frameSize), actors[0]!.frameSize);
    const sniper = maskBounds(alphaMask(actors[1]!.png, 0, actors[1]!.frameSize), actors[1]!.frameSize);
    const crusher = maskBounds(alphaMask(actors[2]!.png, 0, actors[2]!.frameSize), actors[2]!.frameSize);
    expect(Math.abs(mite.width - mite.height), 'Dust Mite must remain compact and round').toBeLessThanOrEqual(8);
    expect(sniper.height, 'Scrap Sniper must read taller than the round Mite').toBeGreaterThan(mite.height);
    expect(crusher.width, 'Crusher must read as the widest horizontal actor').toBeGreaterThan(sniper.width + 5);
    expect(crusher.width - crusher.height, 'Crusher must read as a low horizontal jaw').toBeGreaterThan(8);
  });

  it('keeps the new actors distinct from all ten release enemies at actual manifest display size', () => {
    const registry = new DataVisualArtRegistry(loadGameData());
    const displayed = RELEASE_ENEMY_IDS.map((id) => {
      const binding = registry.bindingById(`enemy:${id}`);
      if (!binding || binding.load.type !== 'spritesheet') throw new Error(`missing enemy actor binding ${id}`);
      const png = decodeRgbaPng(`public/${binding.url}`);
      return {
        id,
        ...displayedIdleFrame(
          png,
          binding.load.frame.width,
          binding.display.width,
          binding.display.height,
        ),
      };
    });
    expect(new Set(displayed.map(({ grayscale }) => createHash('sha256').update(grayscale).digest('hex'))).size)
      .toBe(RELEASE_ENEMY_IDS.length);
    for (const selectedId of ENEMY_IDS) {
      const selected = displayed.find(({ id }) => id === selectedId)!;
      for (const other of displayed) {
        if (other.id === selectedId) continue;
        expect(intersectionOverUnion(selected.mask, other.mask), `${selectedId}/${other.id} at display size`)
          .toBeLessThan(0.88);
      }
    }
    const mite = maskBounds(displayed.find(({ id }) => id === 'dust-mite')!.mask, 40);
    const sniper = maskBounds(displayed.find(({ id }) => id === 'scrap-sniper')!.mask, 40);
    const crusher = maskBounds(displayed.find(({ id }) => id === 'boss-crusher')!.mask, 40);
    expect(Math.abs(mite.width - mite.height)).toBeLessThanOrEqual(5);
    expect(sniper.height).toBeGreaterThan(mite.height);
    expect(crusher.width - crusher.height).toBeGreaterThan(5);
  });

  it('keeps every frame inside the canvas, grounded, centred, and visibly animated in each clip', () => {
    const clips = [[0, 3], [4, 9], [10, 11], [12, 15]] as const;
    for (const { id, png, frameSize } of actors) {
      expect(png).toMatchObject({ width: frameSize * FRAME_COUNT, height: frameSize });
      const activeBounds = Array.from({ length: 12 }, (_, frame) => maskBounds(alphaMask(png, frame, frameSize), frameSize));
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const bounds = maskBounds(alphaMask(png, frame, frameSize), frameSize);
        expect(bounds.minX, `${id} frame ${frame + 1} left crop`).toBeGreaterThan(0);
        expect(bounds.maxX, `${id} frame ${frame + 1} right crop`).toBeLessThan(frameSize - 1);
        expect(bounds.minY, `${id} frame ${frame + 1} top crop`).toBeGreaterThan(0);
        expect(bounds.maxY, `${id} frame ${frame + 1} bottom crop`).toBeLessThan(frameSize - 1);
      }
      expect(Math.max(...activeBounds.map((bounds) => bounds.maxY)) - Math.min(...activeBounds.map((bounds) => bounds.maxY)), `${id} ground drift`)
        .toBeLessThanOrEqual(2);
      expect(Math.max(...activeBounds.map((bounds) => bounds.centerX)) - Math.min(...activeBounds.map((bounds) => bounds.centerX)), `${id} horizontal anchor drift`)
        .toBeLessThanOrEqual(3);
      for (const [start, end] of clips) {
        const hashes = new Set<string>();
        for (let frame = start; frame <= end; frame += 1) {
          hashes.add(silhouetteHash(alphaMask(png, frame, frameSize)));
        }
        expect(hashes.size, `${id} frames ${start + 1}-${end + 1} have no silhouette motion`).toBeGreaterThan(1);
      }
    }
  });

  it('keeps runtime pixels exactly reproducible from visible editable PXO layers', () => {
    for (const { id, png, frameSize } of actors) {
      expect(png.pixels, id).toEqual(visiblePxoPixels(`assets-src/enemies/${id}/source/${id}.pxo`, frameSize));
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
      const frameSize = FRAME_SIZES[id];
      expect(registry.bindingById(`enemy:${id}`)).toMatchObject({
        id: `enemy:${id}`,
        kind: 'enemy',
        display: { width: 26, height: 26 },
        resourceId: `resource:enemy-${id}`,
        load: { type: 'spritesheet', frame: { width: frameSize, height: frameSize } },
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
