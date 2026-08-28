import { describe, expect, it, vi } from 'vitest';
// Phaser runtime mock must precede any import whose transitive dependencies
// resolve Phaser at module evaluation time; vi.mock hoists the registration
// above all imports regardless of textual position.
vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_OVER: 'pointerover',
        POINTER_OUT: 'pointerout',
        POINTER_UP: 'pointerup',
      },
    },
    Scale: {
      Events: {
        RESIZE: 'resize',
        ORIENTATION_CHANGE: 'orientationchange',
      },
    },
  },
}));
import { createRunState, pauseRun, startRun } from '../src/gameplay/runState';
import {
  evaluateWeaponAdmission,
  grantWeaponToRack,
  WEAPON_RACK_CAPACITY,
} from '../src/gameplay/weaponRack';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import { createWeaponInstance, type WeaponInstance, type WeaponRegistry } from '../src/gameplay/weapons';
import { createEventBus } from '../src/engine/eventBus';
import { logicalCanvasViewport } from '../src/ui/layout';
import { createModalTextHelpers } from '../src/ui/modal';
import { ThemeColor } from '../src/ui/theme';
import { computeWeaponRackLayout } from '../src/ui/weaponRackLayout';
import { PhaserWeaponRackPanel } from '../src/ui/weaponRackView';
import { InventoryController, type InventorySnapshot, type InventoryWeaponView } from '../src/ui/inventory';

const data = loadGameData();
const registry = new DataWeaponRegistry(data);
const pistolDef = registry.weaponById('scrap-pistol-t1');
const smgDef = registry.weaponById('can-smg-t1');
if (!pistolDef || !smgDef) throw new Error('shipped T1 weapons missing');

function makeRun(): ReturnType<typeof createRunState> {
  const run = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  run.status = 'active';
  return run;
}

function rackOf(defIds: readonly string[]): WeaponInstance[] {
  return defIds.map((id) => {
    const def = registry.weaponById(id);
    if (!def) throw new Error(`missing definition ${id}`);
    return registry.createWeaponInstance(def);
  });
}

describe('WEAPON_RACK_CAPACITY', () => {
  it('is exactly six', () => {
    expect(WEAPON_RACK_CAPACITY).toBe(6);
  });
});

describe('evaluateWeaponAdmission', () => {
  it('accepts a valid definition for an empty or partial rack', () => {
    expect(evaluateWeaponAdmission([], pistolDef.id, registry)).toEqual({
      status: 'can-add',
      definition: pistolDef,
    });
    expect(evaluateWeaponAdmission(rackOf(['scrap-pistol-t1', 'can-smg-t1']), pistolDef.id, registry))
      .toEqual({ status: 'can-add', definition: pistolDef });
  });

  it('accepts the fifth and sixth weapons', () => {
    const five = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    expect(evaluateWeaponAdmission(five, smgDef.id, registry)).toEqual({
      status: 'can-add',
      definition: smgDef,
    });
  });

  it('returns rack-full when the rack is already at capacity', () => {
    const six = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    expect(evaluateWeaponAdmission(six, smgDef.id, registry)).toEqual({ status: 'rack-full' });
  });

  it('returns invalid-definition for an unknown id without consulting capacity', () => {
    expect(evaluateWeaponAdmission(rackOf(['scrap-pistol-t1']), 'missing-weapon', registry))
      .toEqual({ status: 'invalid-definition', definitionId: 'missing-weapon' });
  });
});

describe('grantWeaponToRack', () => {
  it('grants a fresh instance derived from the definition and reports the new count', () => {
    const run = makeRun();
    const result = grantWeaponToRack(run, pistolDef.id, registry);

    expect(result.status).toBe('added');
    if (result.status !== 'added') throw new Error('unreachable');
    expect(result.rackCount).toBe(1);
    expect(result.weapon.defId).toBe(pistolDef.id);
    expect(result.weapon.family).toBe(pistolDef.family);
    expect(result.weapon.tier).toBe(pistolDef.mergeTier);
    expect(result.weapon.instanceId).toMatch(/^weapon-\d+$/);
    expect(run.equipped).toEqual([result.weapon]);
  });

  it('succeeds from five to six and preserves the input rack order', () => {
    const run = makeRun();
    run.equipped = rackOf(['can-smg-t1', 'bolt-shotgun-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    const before = [...run.equipped];

    const result = grantWeaponToRack(run, pistolDef.id, registry);

    expect(result.status).toBe('added');
    if (result.status !== 'added') throw new Error('unreachable');
    expect(result.rackCount).toBe(6);
    expect(run.equipped).toHaveLength(6);
    expect(run.equipped.slice(0, 5)).toEqual(before);
    expect(run.equipped[5]).toBe(result.weapon);
  });

  it('rejects a seventh weapon without mutating the rack or allocating an instance', () => {
    const run = makeRun();
    run.equipped = rackOf(['scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1', 'scrap-pistol-t1']);
    const createSpy = vi.spyOn(registry, 'createWeaponInstance');
    const before = [...run.equipped];

    const result = grantWeaponToRack(run, smgDef.id, registry);

    expect(result).toEqual({ status: 'rack-full', rackCount: 6 });
    expect(run.equipped).toEqual(before);
    expect(run.equipped).toHaveLength(6);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('rejects an unknown definition without mutating the rack or allocating an instance', () => {
    const run = makeRun();
    run.equipped = rackOf(['scrap-pistol-t1']);
    const createSpy = vi.spyOn(registry, 'createWeaponInstance');

    const result = grantWeaponToRack(run, 'missing-weapon', registry);

    expect(result).toEqual({ status: 'invalid-definition', definitionId: 'missing-weapon', rackCount: 1 });
    expect(run.equipped).toHaveLength(1);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('creates distinct instance ids for two grants of the same definition', () => {
    const run = makeRun();
    const first = grantWeaponToRack(run, pistolDef.id, registry);
    const second = grantWeaponToRack(run, pistolDef.id, registry);

    expect(first.status).toBe('added');
    expect(second.status).toBe('added');
    if (first.status !== 'added' || second.status !== 'added') throw new Error('unreachable');
    expect(first.weapon.instanceId).not.toBe(second.weapon.instanceId);
    expect(run.equipped.map((weapon) => weapon.instanceId)).toEqual([
      first.weapon.instanceId,
      second.weapon.instanceId,
    ]);
  });

  it('uses the exact injected registry contract: weaponById then createWeaponInstance', () => {
    const run = makeRun();
    const calls: string[] = [];
    const fakeRegistry = {
      weaponById: (id: string) => {
        calls.push(`lookup:${id}`);
        return pistolDef;
      },
      createWeaponInstance: (def: typeof pistolDef) => {
        calls.push('create');
        return registry.createWeaponInstance(def);
      },
    };
    const result = grantWeaponToRack(run, pistolDef.id, fakeRegistry as unknown as Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>);
    expect(result.status).toBe('added');
    expect(calls).toEqual([`lookup:${pistolDef.id}`, 'create']);
  });
});

/** Minimal Phaser stand-ins for driving the REAL PhaserWeaponRackPanel
 *  display tree: the root container records real child insertion order, and
 *  every produced object exposes the stroke/fill/input state the order test
 *  keys on. Mirrors the upgradeChooser fake scene shape. */
class FakeEmitter {
  private readonly listeners = new Map<string, Array<{ callback: (...args: unknown[]) => void; context: unknown }>>();
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ callback, context });
    this.listeners.set(event, list);
    return this;
  }
  off(event: string, callback: (...args: unknown[]) => void): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((entry) => entry.callback !== callback),
    );
    return this;
  }
  emit(event: string, ...args: unknown[]): this {
    [...(this.listeners.get(event) ?? [])].forEach((entry) => {
      entry.callback.apply(entry.context, args);
    });
    return this;
  }
}

class FakeDisplayObject extends FakeEmitter {
  visible = true;
  input?: { enabled: boolean };
  fillColor?: number;
  fillAlpha = 1;
  strokeWidth = 0;
  strokeColor?: number;
  strokeAlpha = 0;
  destroyed = false;

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {
    super();
  }

  originX = 0;
  originY = 0;
  setScrollFactor(): this { return this; }
  setStrokeStyle(width: number, color: number, alpha: number): this {
    this.strokeWidth = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    return this;
  }
  setOrigin(x = 0.5, y = x): this {
    this.originX = x;
    this.originY = y;
    return this;
  }
  setInteractive(): this {
    this.input = { enabled: true };
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeText extends FakeDisplayObject {
  readonly resolution: number;
  constructor(
    x: number,
    y: number,
    public text: string,
    style: { fontSize?: string; resolution?: number; wordWrap?: { width: number } },
  ) {
    if (style.resolution !== 2) throw new Error('UI text must use resolution 2');
    const fontSize = Number.parseFloat(style.fontSize ?? '16');
    const naturalWidth = text.length * fontSize * 0.55;
    const wrapWidth = style.wordWrap?.width;
    const width = wrapWidth === undefined ? naturalWidth : Math.min(naturalWidth, wrapWidth);
    const lines = wrapWidth === undefined ? 1 : Math.max(1, Math.ceil(naturalWidth / wrapWidth));
    super(x, y, width, fontSize * 1.2 * lines);
    this.resolution = style.resolution;
  }
  setFixedSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }
  setCrop(_x: number, _y: number, _width: number, _height: number): this {
    return this;
  }
}

class FakeContainer extends FakeDisplayObject {
  readonly children: FakeDisplayObject[] = [];
  constructor() {
    super(0, 0, 0, 0);
  }
  add(children: FakeDisplayObject | FakeDisplayObject[]): this {
    this.children.push(...(Array.isArray(children) ? children : [children]));
    return this;
  }
}

function createFakeScene() {
  const keyboard = new FakeEmitter();
  const own = <T extends FakeDisplayObject>(object: T): T => object;
  return {
    input: { keyboard },
    add: {
      container: (_x: number, _y: number) => own(new FakeContainer()),
      rectangle: (x: number, y: number, width: number, height: number, fillColor?: number) => {
        const object = own(new FakeDisplayObject(x, y, width, height));
        object.fillColor = fillColor;
        return object;
      },
      text: (
        x: number,
        y: number,
        text: string,
        style: { fontSize?: string; resolution?: number; wordWrap?: { width: number } },
      ) => own(new FakeText(x, y, text, style)),
    },
  };
}

describe('PhaserWeaponRackPanel card composition order', () => {
  it('inserts each rack card as fill, rarity edge, artwork, then labels', () => {
    const scene = createFakeScene();
    const viewport = logicalCanvasViewport(390, 844);
    const weapon: InventoryWeaponView = {
      definitionId: 'scrap-pistol-t1',
      name: 'Scrap Pistol',
      family: 'pistol',
      iconId: 'weapon-icon:scrap-pistol-t1',
      rarity: 'rare',
      tier: 1,
      stats: [{ key: 'damage', label: 'Damage', value: 8, formatted: '8' }],
      instanceId: 'weapon-1',
      selected: false,
      selectionState: 'neutral',
      mergeableWith: [],
    };
    const snapshot: InventorySnapshot = {
      capacity: 6,
      weapons: [weapon],
      slots: [weapon, null, null, null, null, null],
      selectedInstanceIds: [],
      mergeReady: false,
    };
    const panel = new PhaserWeaponRackPanel({
      scene: scene as never,
      viewport,
      bus: createEventBus(),
      inventory: { snapshot: () => snapshot } as never,
      modal: createModalTextHelpers(scene as never, viewport),
      isOpen: () => true,
      hasCommittedRoot: () => true,
      onBack: () => true,
      requestRender: () => {},
    });
    const root = scene.add.container(0, 0);
    const layout = computeWeaponRackLayout(viewport, snapshot.capacity);
    panel.render(root as never, snapshot, 390);

    // Real production geometry: slot 0's fill/edge rectangles sit at the
    // layout's first card center; the unbound-icon glyph (artwork) is drawn
    // as rarity-colored rectangles between the edge and the card labels.
    const slotX = layout.leftMargin + layout.cardWidth / 2;
    const slotY = layout.gridTop + layout.cardHeight / 2;
    const sameSlot = (object: FakeDisplayObject) =>
      object.x === slotX
      && object.y === slotY
      && object.width === layout.cardWidth
      && object.height === layout.cardHeight;
    const fillIndex = root.children.findIndex((object) => sameSlot(object) && object.input?.enabled);
    const edgeIndex = root.children.findIndex((object) => sameSlot(object) && object.strokeColor !== undefined);
    const artIndex = root.children.findIndex((object) =>
      object.fillColor === ThemeColor.rarity.rare
      && object.strokeColor === undefined
      && !object.input?.enabled);
    const labelIndex = root.children.findIndex((object) => object instanceof FakeText && object.text === weapon.name);
    expect(fillIndex).toBeGreaterThanOrEqual(0);
    expect(edgeIndex).toBeGreaterThan(fillIndex);
    expect(artIndex).toBeGreaterThan(edgeIndex);
    expect(labelIndex).toBeGreaterThan(artIndex);
    panel.destroy();
  });

  it('renders rounded RNG from the stat view in both normal and compact occupied slots', () => {
    const weapon: InventoryWeaponView = {
      definitionId: 'can-smg-t1',
      name: 'Can SMG I',
      family: 'smg',
      iconId: 'weapon-icon:can-smg-t1',
      rarity: 'common',
      tier: 1,
      stats: [
        { key: 'damage', label: 'DMG', value: 5, formatted: '5' },
        { key: 'rate', label: 'RATE', value: 13.79, formatted: '13.79/s' },
        { key: 'projectiles', label: 'SHOTS', value: 2, formatted: '×2' },
        { key: 'pierce', label: 'PIERCE', value: 1, formatted: '1' },
        { key: 'range', label: 'RNG', value: 203.5, formatted: '204' },
      ],
      instanceId: 'weapon-1',
      selected: false,
      selectionState: 'neutral',
      mergeableWith: [],
    };
    const snapshot: InventorySnapshot = {
      capacity: 6,
      weapons: [weapon],
      slots: [weapon, null, null, null, null, null],
      selectedInstanceIds: [],
      mergeReady: false,
    };
    for (const viewport of [logicalCanvasViewport(390, 844), logicalCanvasViewport(844, 390)]) {
      for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
        const scene = createFakeScene();
        const labelledWeapon: InventoryWeaponView = { ...weapon, rarity };
        const labelledSnapshot: InventorySnapshot = {
          ...snapshot,
          weapons: [labelledWeapon],
          slots: [labelledWeapon, null, null, null, null, null],
        };
        const panel = new PhaserWeaponRackPanel({
          scene: scene as never,
          viewport,
          bus: createEventBus(),
          inventory: { snapshot: () => labelledSnapshot } as never,
          modal: createModalTextHelpers(scene as never, viewport),
          isOpen: () => true,
          hasCommittedRoot: () => true,
          onBack: () => true,
          requestRender: () => {},
        });
        const root = scene.add.container(0, 0);
        panel.render(root as never, labelledSnapshot, viewport.canvasWidth);
        expect(root.children.some((object) => object instanceof FakeText && object.text.includes('RNG 204'))).toBe(true);
        expect(root.children.some((object) => object instanceof FakeText && object.text === rarity.toUpperCase())).toBe(true);
        panel.destroy();
      }
    }
  });

  it('keeps every compact full rarity/state/family/RNG text bounds separate inside a card at 844x390', () => {
    const viewport = logicalCanvasViewport(180, 390, 844, 390);
    const layout = computeWeaponRackLayout(viewport, 6);
    const baseWeapon: InventoryWeaponView = {
      definitionId: 'bolt-shotgun-t2', name: 'Bolt Shotgun II', family: 'shotgun',
      iconId: 'weapon-icon:bolt-shotgun-t2', rarity: 'common', tier: 2,
      stats: [{ key: 'range', label: 'RNG', value: 154.2, formatted: '154' }],
      instanceId: 'weapon-1', selected: false, selectionState: 'neutral', mergeableWith: [],
    };
    const stateLabels = {
      neutral: undefined,
      selected: 'PICK 1',
      compatible: 'MATCH',
      incompatible: 'NO MATCH',
      'merge-ready': 'MERGE',
    } as const;

    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
      for (const [selectionState, stateLabel] of Object.entries(stateLabels) as Array<[
        InventoryWeaponView['selectionState'], string | undefined
      ]>) {
        const scene = createFakeScene();
        const weapon: InventoryWeaponView = {
          ...baseWeapon, rarity, selectionState,
          ...(selectionState === 'selected' ? { selected: true, selectionOrder: 1 as const } : {}),
        };
        const snapshot: InventorySnapshot = {
          capacity: 6, weapons: [weapon], slots: [weapon, null, null, null, null, null],
          selectedInstanceIds: [], mergeReady: false,
        };
        const panel = createPanel(scene, viewport, snapshot);
        const root = scene.add.container(0, 0);
        panel.render(root as never, snapshot, viewport.canvasWidth);
        const expected = ['1·T2', rarity.toUpperCase(), 'S-GUN', 'RNG 154', ...(stateLabel ? [stateLabel] : [])];
        const fields = expected.map((text) => requiredText(root, text));
        assertDistinctBounds(fields, {
          left: layout.leftMargin,
          top: layout.gridTop,
          right: layout.leftMargin + layout.cardWidth,
          bottom: layout.gridTop + layout.cardHeight,
        });
        panel.destroy();
      }
    }
  });

  it.each([
    ['canonical portrait', logicalCanvasViewport(390, 844)],
    ['smallest normal portrait', logicalCanvasViewport(263, 568, 320, 568)],
    ['compact reference', logicalCanvasViewport(180, 390, 844, 390)],
  ])('keeps every rendered five-delta shotgun merge row separate and inside the preview at %s', (_name, viewport) => {
    const layout = computeWeaponRackLayout(viewport, 6);
    const scene = createFakeScene();
    const { controller, snapshot } = realFiveDeltaShotgunMerge();
    const preview = snapshot.preview;
    if (!preview) throw new Error('real shotgun merge preview missing');
    expect(preview.deltas.map((delta) => delta.key)).toEqual([
      'damage', 'rate', 'projectiles', 'pierce', 'range',
    ]);
    const panel = createPanel(scene, viewport, snapshot, controller);
    const root = scene.add.container(0, 0);
    panel.render(root as never, snapshot, viewport.canvasWidth);
    const texts = [
      `T${preview.inputs[0].tier} + T${preview.inputs[1].tier} → T${preview.result.tier}`,
      preview.result.name,
      preview.result.rarity.toUpperCase(),
      ...preview.deltas.map((delta) => `${delta.label}  ${delta.formattedBefore} → ${delta.formattedAfter}`),
    ].map((text) => requiredText(root, text));
    assertDistinctBounds(texts, {
      left: layout.preview.x,
      top: layout.preview.y,
      right: layout.preview.x + layout.preview.width,
      bottom: layout.preview.y + layout.preview.height,
    });
    panel.destroy();
  });
});

function createPanel(
  scene: ReturnType<typeof createFakeScene>,
  viewport: ReturnType<typeof logicalCanvasViewport>,
  snapshot: InventorySnapshot,
  inventory: InventoryController | { snapshot(): InventorySnapshot } = { snapshot: () => snapshot },
): PhaserWeaponRackPanel {
  return new PhaserWeaponRackPanel({
    scene: scene as never, viewport, bus: createEventBus(),
    inventory: inventory as InventoryController,
    modal: createModalTextHelpers(scene as never, viewport),
    isOpen: () => true, hasCommittedRoot: () => true, onBack: () => true, requestRender: () => {},
  });
}

function realFiveDeltaShotgunMerge(): {
  readonly controller: InventoryController;
  readonly snapshot: InventorySnapshot;
} {
  const definition = registry.weaponById('bolt-shotgun-t2');
  if (!definition) throw new Error('shipped T2 shotgun missing');
  const run = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  startRun(run);
  run.equipped = [
    createWeaponInstance(definition, 'shotgun-a'),
    createWeaponInstance(definition, 'shotgun-b'),
  ];
  pauseRun(run, undefined, 'manual');
  const controller = new InventoryController({
    runState: run,
    bus: createEventBus(),
    weaponRegistry: registry,
  });
  controller.toggle('shotgun-a');
  return { controller, snapshot: controller.toggle('shotgun-b') };
}

function requiredText(root: FakeContainer, text: string): FakeText {
  const field = root.children.find((object): object is FakeText => object instanceof FakeText && object.text === text);
  if (!field) throw new Error(`missing text ${text}`);
  return field;
}

function assertDistinctBounds(
  fields: readonly FakeText[],
  container: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): void {
  const bounds = fields.map((field) => ({
    left: field.x - field.originX * field.width,
    top: field.y - field.originY * field.height,
    right: field.x + (1 - field.originX) * field.width,
    bottom: field.y + (1 - field.originY) * field.height,
  }));
  for (const bound of bounds) {
    expect(bound.left).toBeGreaterThanOrEqual(container.left);
    expect(bound.top).toBeGreaterThanOrEqual(container.top);
    expect(bound.right).toBeLessThanOrEqual(container.right);
    expect(bound.bottom).toBeLessThanOrEqual(container.bottom);
  }
  for (let first = 0; first < bounds.length; first += 1) {
    for (let second = first + 1; second < bounds.length; second += 1) {
      expect(
        bounds[first]!.right <= bounds[second]!.left
        || bounds[second]!.right <= bounds[first]!.left
        || bounds[first]!.bottom <= bounds[second]!.top
        || bounds[second]!.bottom <= bounds[first]!.top,
      ).toBe(true);
    }
  }
}
