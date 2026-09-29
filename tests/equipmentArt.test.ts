import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { EquipmentController } from '../src/ui/equipmentController';

const SETS = ['commando', 'scavenger', 'juggernaut', 'pyro', 'recon', 'medic', 'technician', 'demolition'] as const;
const SLOTS = ['helmet', 'armour', 'gloves', 'boots'] as const;
const ALL_EQUIPMENT_ART_IDS = SETS.flatMap((set) => [
  `equipment-set-icon:${set}`,
  ...SLOTS.map((slot) => `equipment-icon:${set}-${slot}`),
]);
const PRODUCTION_ART_IDS = ALL_EQUIPMENT_ART_IDS;

function decodeUnfilteredRgbaPng(path: string): { width: number; height: number; pixels: Buffer } {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4 + 1;
  for (let y = 0; y < height; y += 1) {
    const filter = rows[y * stride]!;
    for (let x = 0; x < width * 4; x += 1) {
      const encoded = rows[y * stride + 1 + x]!;
      const left = x >= 4 ? pixels[y * width * 4 + x - 4]! : 0;
      const above = y > 0 ? pixels[(y - 1) * width * 4 + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * width * 4 + x - 4]! : 0;
      const estimate = left + above - upperLeft;
      const paeth = Math.abs(estimate - left) <= Math.abs(estimate - above) && Math.abs(estimate - left) <= Math.abs(estimate - upperLeft)
        ? left : Math.abs(estimate - above) <= Math.abs(estimate - upperLeft) ? above : upperLeft;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth;
      pixels[y * width * 4 + x] = (encoded + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

function framePixels(pixels: Buffer, atlasWidth: number, x: number, y: number, size: number): Buffer {
  const output = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    pixels.copy(output, row * size * 4, ((y + row) * atlasWidth + x) * 4, ((y + row) * atlasWidth + x + size) * 4);
  }
  return output;
}

describe('dedicated Equipment production art', () => {
  it('covers the exact 8 Set / 32 piece catalog with semantic IDs and no borrowed upgrade art', () => {
    const data = loadGameData();
    expect((data.equipmentSets ?? []).map((set) => set.emblem).sort()).toEqual(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-set-icon:')).sort(),
    );
    expect((data.equipment ?? []).map((piece) => piece.icon).sort()).toEqual(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-icon:')).sort(),
    );
    expect([...(data.equipmentSets ?? []).map((set) => set.emblem), ...(data.equipment ?? []).map((piece) => piece.icon)])
      .not.toContainEqual(expect.stringMatching(/^upgrade-icon:/));

    const art = new DataVisualArtRegistry(data);
    const bindings = ALL_EQUIPMENT_ART_IDS.map((id) => art.bindingById(id));
    expect(bindings).not.toContain(undefined);
    expect(bindings.every((binding) => binding?.kind === 'icon')).toBe(true);
    expect(new Set(bindings.map((binding) => binding?.frameKey))).toEqual(new Set(ALL_EQUIPMENT_ART_IDS));
    expect(new Set(bindings.map((binding) => binding?.resourceId))).toEqual(new Set([
      'resource:equipment-commando', 'resource:equipment-sets',
    ]));
  });

  it('keeps all 40 approved named frames in deterministic concept/source/export parity', () => {
    const builder = readFileSync('docs/art/scripts/build-equipment-concept-atlases.py', 'utf8');
    expect(builder).toContain('eccaad70498657a84456d8fef8564fdbeff598b22356649e23cb52b8e3a89d1b');
    expect(builder).toContain('c43d0727ce022b76c398248c4b8531ccd24bf93bf37176dd5ebdac212276bbe6');
    expect(() => execFileSync('python3', ['docs/art/scripts/build-equipment-concept-atlases.py', '--check'])).not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/equipment/sets/equipment-sets-atlas.json', 'utf8')) as {
      size_x: number; size_y: number; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([480, 672]);
    expect(Object.keys(atlas.frames).sort()).toEqual(PRODUCTION_ART_IDS.filter((id) => !id.includes(':commando')).sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 96 && frame.h === 96)).toBe(true);
    const commando = JSON.parse(readFileSync('public/assets/equipment/commando/commando-equipment-atlas.json', 'utf8')) as {
      size_x: number; size_y: number; frames: Record<string, { frame: { w: number; h: number } }>;
    };
    expect([commando.size_x, commando.size_y]).toEqual([480, 96]);
    expect(Object.keys(commando.frames).sort()).toEqual(PRODUCTION_ART_IDS.filter((id) => id.includes(':commando')).sort());
  });

  it('propagates every dedicated piece and Set identity into the Equipment read model', () => {
    const data = loadGameData();
    const context = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(42),
      data,
      arenas: new DataArenaRegistry(data),
      characters: new DataCharacterRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'equipment-art-propagation'),
    });
    const snapshot = new EquipmentController(context).snapshot();
    expect(new Set(snapshot.blueprints.map(({ iconArtId }) => iconArtId))).toEqual(new Set(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-icon:')),
    ));
    expect(new Set(snapshot.blueprints.map(({ setEmblemArtId }) => setEmblemArtId))).toEqual(new Set(
      ALL_EQUIPMENT_ART_IDS.filter((id) => id.startsWith('equipment-set-icon:')),
    ));
  });

  it('preserves unique silhouettes and full-colour construction at actual 96px source scale', () => {
    const atlas = JSON.parse(readFileSync('public/assets/equipment/sets/equipment-sets-atlas.json', 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number } }>;
    };
    const { width, height, pixels } = decodeUnfilteredRgbaPng('public/assets/equipment/sets/equipment-sets-atlas.png');
    expect([width, height]).toEqual([480, 672]);
    const silhouettes = new Set<string>();
    const grayscale = new Set<string>();
    for (const id of PRODUCTION_ART_IDS) {
      if (id.includes(':commando')) continue;
      const { x, y } = atlas.frames[id]!.frame;
      const frame = framePixels(pixels, width, x, y, 96);
      const alphaBits: number[] = [];
      const grayBytes = Buffer.alloc(96 * 96);
      let opaquePixels = 0;
      for (let index = 0; index < frame.length; index += 4) {
        const alpha = frame[index + 3]!;
        alphaBits.push(alpha > 0 ? 1 : 0);
        if (alpha > 0) opaquePixels += 1;
        grayBytes[index / 4] = Math.round(frame[index]! * 0.299 + frame[index + 1]! * 0.587 + frame[index + 2]! * 0.114);
      }
      expect(opaquePixels, `${id} should be readable rather than empty/noisy`).toBeGreaterThanOrEqual(450);
      expect(opaquePixels, `${id} should retain negative space at icon scale`).toBeLessThanOrEqual(7_800);
      silhouettes.add(createHash('sha256').update(alphaBits.join('')).digest('hex'));
      grayscale.add(createHash('sha256').update(grayBytes).digest('hex'));
    }
    expect(silhouettes.size).toBe(PRODUCTION_ART_IDS.length - 5);
    expect(grayscale.size).toBe(PRODUCTION_ART_IDS.length - 5);
  });
});
