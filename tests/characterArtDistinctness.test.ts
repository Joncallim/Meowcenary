import { inflateSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

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
  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8, 13)]).toEqual([8, 6, 0, 0, 0]);
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const source = inflateSync(Buffer.concat(idat));
  const rowBytes = width * 4;
  const pixels = new Uint8Array(rowBytes * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = source[y * (rowBytes + 1)];
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = source[y * (rowBytes + 1) + x + 1];
      const left = x >= 4 ? pixels[y * rowBytes + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * rowBytes + x - 4] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : raw + paeth(left, up, upperLeft);
      pixels[y * rowBytes + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function firstFrameAlphaMask(png: RgbaPng): Set<number> {
  return frameAlphaMask(png, 0);
}

function frameAlphaMask(png: RgbaPng, frame: number): Set<number> {
  const mask = new Set<number>();
  for (let y = 0; y < 48; y += 1) for (let x = 0; x < 48; x += 1) {
    if (png.pixels[(y * png.width + frame * 48 + x) * 4 + 3] !== 0) mask.add(y * 48 + x);
  }
  return mask;
}

function maskBounds(mask: ReadonlySet<number>) {
  const xs = [...mask].map((pixel) => pixel % 48);
  const ys = [...mask].map((pixel) => Math.floor(pixel / 48));
  return {
    height: Math.max(...ys) - Math.min(...ys) + 1,
    centerX: xs.reduce((sum, x) => sum + x, 0) / xs.length,
    centerY: ys.reduce((sum, y) => sum + y, 0) / ys.length,
  };
}

function intersectionOverUnion(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let intersection = 0;
  for (const pixel of a) if (b.has(pixel)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function visiblePxoPixels(path: string): Uint8Array {
  const extracted = mkdtempSync(join(tmpdir(), 'meowcenary-pxo-'));
  try {
    execFileSync('unzip', ['-q', path, '-d', extracted]);
    const readMember = (member: string) => readFileSync(join(extracted, member));
    const project = JSON.parse(readMember('data.json').toString('utf8')) as {
      layers: Array<{ visible: boolean }>;
      frames: unknown[];
      size_x: number;
      size_y: number;
    };
    expect(project).toMatchObject({ size_x: 48, size_y: 48 });
    const visibleLayers = project.layers
      .map((layer, index) => ({ index: index + 1, visible: layer.visible }))
      .filter((layer) => layer.visible);
    const sheet = new Uint8Array(project.frames.length * 48 * 48 * 4);
    for (let frame = 1; frame <= project.frames.length; frame += 1) {
      for (const layer of visibleLayers) {
        const pixels = readMember(`image_data/frames/${frame}/layer_${layer.index}`);
        expect(pixels).toHaveLength(48 * 48 * 4);
        for (let source = 0; source < pixels.length; source += 4) {
          const alpha = pixels[source + 3];
          if (alpha !== 0 && alpha !== 255) {
            throw new Error(`PXO layer uses unsupported partial alpha at frame ${frame}, layer ${layer.index}`);
          }
          if (alpha === 0) continue;
          const x = (source / 4) % 48;
          const y = Math.floor(source / 4 / 48);
          const destination = ((y * project.frames.length * 48) + (frame - 1) * 48 + x) * 4;
          sheet.set(pixels.subarray(source, source + 4), destination);
        }
      }
    }
    return sheet;
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

describe('Volt Lynx production-art distinction', () => {
  it('keeps every shipped character sheet in parity with visible editable-source layers', () => {
    const characterIds = [
      'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar',
      'ember-cougar', 'scrap-weasel', 'rattle-raptor', 'piston-ram',
    ] as const;

    for (const characterId of characterIds) {
      const runtime = decodeRgbaPng(`public/assets/characters/${characterId}/${characterId}.png`);
      const visibleSource = visiblePxoPixels(`assets-src/characters/${characterId}/source/${characterId}.pxo`);
      expect(runtime.pixels, characterId).toEqual(visibleSource);
    }
  }, 15_000);

  it('keeps the shipped Lynx silhouette materially different from Scrap Tabby at native actor scale', () => {
    const tabby = decodeRgbaPng('public/assets/characters/scrap-tabby/scrap-tabby.png');
    const lynx = decodeRgbaPng('public/assets/characters/volt-lynx/volt-lynx.png');

    expect(tabby).toMatchObject({ width: 48 * 16, height: 48 });
    expect(lynx).toMatchObject({ width: 48 * 16, height: 48 });
    expect(intersectionOverUnion(firstFrameAlphaMask(tabby), firstFrameAlphaMask(lynx)))
      .toBeLessThan(0.7);
  });

  it('keeps distinct logical and physical resources under the character-specific run closure', () => {
    const data = loadGameData();
    const registry = new DataVisualArtRegistry(data);
    const tabby = registry.bindingById('character:scrap-tabby')!;
    const lynx = registry.bindingById('character:volt-lynx')!;

    expect(tabby.id).toBe('character:scrap-tabby');
    expect(lynx.id).toBe('character:volt-lynx');
    expect(lynx.resourceId).not.toBe(tabby.resourceId);
    expect(lynx.textureKey).not.toBe(tabby.textureKey);
    expect(lynx.url).toBe('assets/characters/volt-lynx/volt-lynx.png');
    expect(lynx.sampling).toBe('nearest');
    expect(lynx.load).toEqual({ type: 'spritesheet', frame: { width: 48, height: 48 } });
  });

  it('finishes defeat in a visibly lower forward-settled silhouette', () => {
    const lynx = decodeRgbaPng('public/assets/characters/volt-lynx/volt-lynx.png');
    const idle = maskBounds(frameAlphaMask(lynx, 0));
    const penultimate = frameAlphaMask(lynx, 14);
    const settled = frameAlphaMask(lynx, 15);
    const settledBounds = maskBounds(settled);

    expect(settledBounds.height).toBeLessThan(idle.height - 3);
    expect(settledBounds.centerY).toBeGreaterThan(idle.centerY + 2);
    expect(settledBounds.centerX).toBeLessThan(idle.centerX - 2);
    expect(settled).not.toEqual(penultimate);
  });

  it('exports only visible PXO layers, keeping editor guides out of runtime art', () => {
    const runtime = decodeRgbaPng('public/assets/characters/volt-lynx/volt-lynx.png');
    const visibleSource = visiblePxoPixels('assets-src/characters/volt-lynx/source/volt-lynx.pxo');

    expect(runtime.pixels).toEqual(visibleSource);
  });
});
