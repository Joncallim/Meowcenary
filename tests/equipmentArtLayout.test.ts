import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import type Phaser from 'phaser';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { MainMenuController } from '../src/ui/menus';
import { EquipmentSurface } from '../src/ui/menuSurfaces/equipmentSurface';
import { LoadoutSurface } from '../src/ui/menuSurfaces/loadoutSurface';
import type { MenuSurfaceEnvironment, MenuSurfaceLayout } from '../src/ui/menuSurfaces/surface';
import { responsiveUiViewport } from '../src/ui/layout';
import type { EquipmentLoadoutState, EquipmentState } from '../src/systems/save';

interface LayoutObject {
  x: number; y: number; text: string; width: number; height: number; textLeft: number; list: LayoutObject[];
  add(child: LayoutObject): LayoutObject; moveTo(): LayoutObject; setScrollFactor(): LayoutObject;
  setPosition(x: number, y: number): LayoutObject;
  setStrokeStyle(): LayoutObject; setStyle(): LayoutObject; setPadding(): LayoutObject;
  setFixedSize(width: number, height: number): LayoutObject;
  getBounds(): { centerX: number; centerY: number; width: number; height: number };
  destroy(): void;
}

function object(x = 0, y = 0, text = '', width = 0, height = 20): LayoutObject {
  const result = {
    x, y, text, width, height, textLeft: x, list: [] as ReturnType<typeof object>[],
    add(child: ReturnType<typeof object>) { this.list.push(child); return this; },
    moveTo() { return this; }, setScrollFactor() { return this; }, setStrokeStyle() { return this; },
    setPosition(nextX: number, nextY: number) { this.x = nextX; this.y = nextY; return this; },
    setStyle() { return this; }, setPadding() { return this; },
    setFixedSize(w: number, h: number) { this.width = w; this.height = h; return this; },
    getBounds() { return { centerX: this.x + this.width / 2, centerY: this.y + this.height / 2, width: this.width, height: this.height }; },
    destroy() { /* Renderer ownership is exercised by the scene lifecycle tests. */ },
  };
  return result;
}

function harness(width: number, height: number, panel: 'equipment' | 'loadout' = 'equipment', empty = false) {
  const data = loadGameData();
  const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'equipment-art-layout') });
  context.updateEquipment((): { equipment: EquipmentState; loadout: EquipmentLoadoutState } => empty
    ? ({ equipment: {}, loadout: {} })
    : ({ equipment: { helmet: { equipmentId: 'equipment:scavenger-helmet', tier: 1 } }, loadout: { helmet: 'helmet' } }));
  const commands = new MainMenuController(context);
  commands.open(panel);
  const snapshot = empty ? commands.snapshot() : commands.selectEquipmentCandidate('helmet');
  const buttons: ReturnType<typeof object>[] = [];
  const handlers = new Map<ReturnType<typeof object>, () => void>();
  const focusKeys = new Map<ReturnType<typeof object>, string>();
  let latestSnapshot = snapshot;
  const art = vi.fn();
  const icons = vi.fn();
  const texts: ReturnType<typeof object>[] = [];
  const columns = vi.fn();
  const disable = vi.fn();
  const begin = vi.fn();
  const end = vi.fn();
  const currentFocusKey = vi.fn(() => 'equipment-candidate:helmet');
  const currentScrollOffset = vi.fn(() => 24);
  const currentScrollBookmark = vi.fn(() => ({ anchorKey: 'equipment-candidate:helmet', intraRowOffset: 12 }));
  const restoreScrollOffset = vi.fn();
  const restoreScrollBookmark = vi.fn();
  const environment = {
    scene: { scale: { width, height }, add: { container: () => object(),
      rectangle: (x: number, y: number, w: number, h: number) => object(x, y, '', w, h),
      text: (x: number, y: number, value: string) => {
        const text = object(x, y, value, Math.min(width - 32, value.length * 7), value.split('\n').length * 20);
        texts.push(text);
        return text;
      },
    } },
    controls: { addButton: (root: ReturnType<typeof object>, x: number, y: number, label: string, minHeight: number, callback: unknown, _event: unknown, maxWidth = 300, _artId?: unknown, _trailingReserve = 0, leadingReserve = 0) => {
      const button = object(x, y, label, maxWidth, minHeight); button.textLeft = x + Math.max(12, leadingReserve); buttons.push(button);
      if (typeof callback === 'function') handlers.set(button, callback as () => void);
      root.add(button); return button;
    }, addLoadoutArt: art, addCatalogIcon: icons, addPanelArt: vi.fn(), equipmentSlotColumns: columns,
      registerScrollObject: vi.fn(), resizeScrollableRegion: vi.fn(), buttonIndex: (button: unknown) => buttons.indexOf(button as ReturnType<typeof object>),
      disableButton: disable, focusNext: vi.fn(), beginScrollableRegion: begin, endScrollableRegion: end,
      currentFocusKey, currentScrollOffset, currentScrollBookmark, restoreScrollOffset, restoreScrollBookmark,
      rememberFocus: (button: unknown, key: string) => { focusKeys.set(button as ReturnType<typeof object>, key); return button; } },
    resources: { panel: vi.fn(), equipment: vi.fn(), gunsmith: vi.fn() }, onSnapshot: (next: typeof snapshot) => { latestSnapshot = next; },
  } as unknown as MenuSurfaceEnvironment;
  const viewport = responsiveUiViewport(width, height, { top: 0, right: 0, bottom: 0, left: 0 });
  const layout: MenuSurfaceLayout = { width, height, top: 72, margin: 16, rightMargin: 16, centerX: width / 2, hitTarget: 48, viewport, scrollBottom: height - 120 };
  const surface = panel === 'equipment' ? new EquipmentSurface(environment, commands) : new LoadoutSurface(environment, commands);
  surface.present(object() as unknown as Phaser.GameObjects.Container, snapshot, layout, 320);
  return { art, icons, texts, columns, buttons, handlers, focusKeys, disable, begin, end, context, snapshot, surface, commands,
    currentFocusKey, currentScrollOffset, currentScrollBookmark, restoreScrollOffset, restoreScrollBookmark,
    latest: () => latestSnapshot };
}

describe('art-led Equipment layout', () => {
  it.each([[360, 640], [375, 640], [390, 844], [844, 390], [1114, 720], [1280, 720], [1920, 1080]])('keeps four distinct responsive slots with visible media inside each card at %i×%i', (width, height) => {
    const view = harness(width, height);
    const slots = view.buttons.slice(0, 4);
    expect(view.columns).toHaveBeenCalledWith(width >= 1040 || (height <= 480 && width >= 600) ? 4 : 2);
    expect(slots.map(slot => slot.text.split('\n')[0])).toEqual(['HELMET', 'ARMOUR', 'GLOVES', 'BOOTS']);
    for (const slot of slots) {
      expect(slot.width).toBeGreaterThanOrEqual(44);
      expect(slot.height).toBeGreaterThanOrEqual(48);
      expect(slot.x).toBeGreaterThanOrEqual(16);
      expect(slot.x + slot.width).toBeLessThanOrEqual(width - 16);
    }
    const card = view.buttons.find(button => button.text.startsWith('Scavenger Helmet'))!;
    const owner = view.buttons.indexOf(card);
    const firstArt = view.art.mock.calls.find(call => call[3] === 'equipment-icon:scavenger-helmet' && call[6] === owner);
    expect(firstArt).toBeDefined();
    const expectedExtent = width < 600 ? 72 : width >= 1040 ? 96 : 88;
    expect(firstArt![4]).toBe(expectedExtent);
    expect(firstArt![5]).toBe(expectedExtent);
    if (width >= 1040) {
      const slotOwner = view.buttons.indexOf(slots[0]!);
      const slotArt = view.art.mock.calls.find(call => call[3] === 'equipment-icon:scavenger-helmet' && call[6] === slotOwner);
      expect(slotArt).toBeDefined();
      expect(slotArt![4]).toBeGreaterThanOrEqual(128);
      expect(slotArt![4]).toBeLessThanOrEqual(176);
      expect(slotArt![5]).toBe(slotArt![4]);
    }
    if (width <= 375 || height <= 480) {
      const slotOwner = view.buttons.indexOf(slots[0]!);
      const slotArt = view.art.mock.calls.find(call => call[3] === 'equipment-icon:scavenger-helmet' && call[6] === slotOwner);
      expect(slotArt).toBeDefined();
      expect(slotArt![4]).toBeGreaterThanOrEqual(24);
      expect(slotArt![4]).toBeLessThanOrEqual(32);
      expect(slotArt![5]).toBeGreaterThanOrEqual(24);
      expect(slotArt![5]).toBeLessThanOrEqual(32);
      const artRight = slotArt![1] + slotArt![4] / 2;
      expect(artRight).toBeLessThan(slots[0]!.textLeft);
      expect(slots[0]!.textLeft - artRight).toBeGreaterThanOrEqual(8);
    }
    if (width <= 375) expect(slots.every(slot => slot.height >= 64)).toBe(true);
    // Desktop keeps the section label, Browse Sets, and candidates in one
    // scroll-owned lane. Narrow layouts retain their fixed header and body
    // split, so only those paths open two regions.
    const expectedRegions = width >= 1040 ? 1 : 2;
    expect(view.begin).toHaveBeenCalledTimes(expectedRegions);
    expect(view.end).toHaveBeenCalledTimes(expectedRegions);
    if (width >= 1040) {
      const region = view.begin.mock.calls[0]![0] as { width: number; height: number };
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
    }
  });

  it.each([[375, 640], [844, 390]])('keeps the first candidate below fixed Browse Sets at the compact boundaries %i×%i', (width, height) => {
    const view = harness(width, height);
    const browse = view.buttons.find(button => button.text === 'BROWSE SETS')!;
    const candidate = view.buttons.find(button => button.text.startsWith('Scavenger Helmet'))!;
    expect(browse).toBeDefined();
    expect(candidate).toBeDefined();
    expect(candidate.y).toBeGreaterThanOrEqual(browse.y + browse.height);
  });

  it.each([[390, 641], [390, 677]])('budgets the 390px slot header above Browse Sets and the footer at %i×%i', (width, height) => {
    const view = harness(width, height);
    const slots = view.buttons.slice(0, 4);
    const browse = view.buttons.find(button => button.text === 'BROWSE SETS')!;
    const footer = view.buttons.find(button => button.text === 'Fabricate unavailable')!;
    expect(slots.every(slot => slot.height === 48)).toBe(true);
    expect(browse.y + browse.height).toBeLessThanOrEqual(footer.y);
    expect(browse.y).toBeGreaterThanOrEqual(slots[3]!.y + slots[3]!.height);
  });

  it('keeps named Set summaries inside the narrowed wide inspector collection lane', () => {
    const view = harness(1280, 720);
    const names = ['Commando', 'Scavenger', 'Juggernaut', 'Pyro', 'Recon', 'Medic', 'Technician', 'Demolition'];
    const labels = view.texts.filter(text => {
      const [name, count] = text.text.split('\n');
      return names.includes(name!) && count?.endsWith('/4 EQUIPPED');
    });
    expect(labels).toHaveLength(0);
    expect(view.buttons.some(button => button.text === 'BROWSE SETS')).toBe(true);
  });

  it.each([[376, 640], [390, 640]])('keeps empty Equipment Browse Sets above fixed actions at %i×%i', (width, height) => {
    const view = harness(width, height, 'equipment', true);
    const browse = view.buttons.find(button => button.text === 'BROWSE SETS')!;
    const footer = view.buttons.find(button => button.text === 'Fabricate unavailable')!;
    expect(browse).toBeDefined();
    expect(footer).toBeDefined();
    expect(browse.y + browse.height).toBeLessThanOrEqual(footer.y);
  });

  it.each([[390, 844, 136], [1280, 720, 80]])('gives inspection its own bounded frame and compares both tiers in one optical frame at %i×%i', (width, height, detailExtent) => {
    const view = harness(width, height);
    const details = view.buttons.find(button => button.text === 'View details');
    if (details && width < 600) {
      view.handlers.get(details)!();
      view.buttons.length = 0;
      view.handlers.clear();
      view.surface.unmount();
      view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
        width, height, top: 72, margin: 16, rightMargin: 16, centerX: width / 2, hitTarget: 48,
        viewport: responsiveUiViewport(width, height, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: height - 120,
      }, 320);
    }
    const calls = view.art.mock.calls;
    expect(calls.some(call => call[3] === 'equipment-icon:scavenger-helmet' && call[4] === detailExtent && call[5] === detailExtent)).toBe(true);
    const pairs = calls.filter(call => Array.isArray(call[7]));
    if (width >= 1040) {
      // The wide inspector uses the selected card's artwork once; duplicate
      // tier-pair thumbnails previously covered its Effect-after-equip copy.
      expect(pairs).toHaveLength(0);
    } else {
      expect(pairs).toHaveLength(2);
      expect(pairs[0]![7]).toEqual(pairs[1]![7]);
      expect(pairs[0]![3]).not.toBe(pairs[1]![3]);
    }
    expect(view.buttons.some(button => button.text === (width >= 1040 ? 'Unequip current item' : 'Unequip Scavenger Helmet'))).toBe(true);
    if (width >= 1040) expect(view.buttons.some(button => button.text.startsWith('Upgrade'))).toBe(true);
    expect(view.context.saveData.equipment.helmet!.tier).toBe(1);
  });

  it('shows the authoritative locked upgrade condition while retaining the tier comparison and disabling its commit', () => {
    const view = harness(390, 844);
    const details = view.buttons.find(button => button.text === 'View details')!;
    view.handlers.get(details)!();
    view.buttons.length = 0;
    view.handlers.clear();
    view.surface.unmount();
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    const upgrade = view.buttons.find(button => button.text.startsWith('LOCKED •'));
    expect(upgrade).toBeDefined();
    expect(view.disable).toHaveBeenCalledWith(upgrade);
    expect(upgrade!.text).toContain(view.snapshot.equipment.owned.find(item => item.instanceId === 'helmet')!.upgradeLockReason);
    expect(view.art.mock.calls.filter(call => Array.isArray(call[7]))).toHaveLength(2);
    expect(view.context.saveData.equipment.helmet!.tier).toBe(1);
  });

  it('preserves the compact four-slot Loadout overview without empty-slot art implying equipped gear', () => {
    const view = harness(390, 844, 'loadout');
    expect(view.columns).toHaveBeenCalledWith(4);
    expect(view.art.mock.calls.filter(call => String(call[3]).startsWith('equipment-icon:'))).toHaveLength(1);
  });

  it('uses the compact viewport band with art above copy and keeps the card inside the safe width', () => {
    const view = harness(390, 844);
    const card = view.buttons.find(button => button.text.startsWith('Scavenger Helmet'))!;
    const owner = view.buttons.indexOf(card);
    const art = view.art.mock.calls.find(call => call[3] === 'equipment-icon:scavenger-helmet' && call[6] === owner)!;
    expect(card.width).toBeLessThan(390 - 32);
    expect(art[4]).toBe(72);
    expect(art[5]).toBe(72);
    expect(art[2]).toBe(card.y + 12 + 36);
  });

  it('opens local detail and restores the selected card on local Back without mutating save state', () => {
    const view = harness(390, 844);
    const before = view.context.saveData;
    const details = view.buttons.find(button => button.text === 'View details')!;
    view.handlers.get(details)!();
    view.buttons.length = 0;
    view.handlers.clear();
    view.surface.unmount();
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    expect(view.buttons.some(button => button.text.startsWith('Back to candidates'))).toBe(true);
    expect(view.buttons.some(button => button.text.startsWith('Scavenger Helmet\nT1'))).toBe(false);
    const localBack = view.buttons.find(button => button.text === 'Back to candidates')!;
    (view.surface as unknown as { browseReturnBookmark: { anchorKey: string; intraRowOffset: number } }).browseReturnBookmark = {
      anchorKey: 'equipment-candidate:helmet', intraRowOffset: 12,
    };
    view.handlers.get(localBack)!();
    expect(view.context.saveData).toBe(before);
    expect(view.restoreScrollBookmark).toHaveBeenCalledWith({ anchorKey: 'equipment-candidate:helmet', intraRowOffset: 12 });
    view.buttons.length = 0;
    view.handlers.clear();
    view.surface.unmount();
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    expect(view.buttons.some(button => button.text === 'View details')).toBe(true);
    expect(view.buttons.some(button => button.text.startsWith('Back to candidates'))).toBe(false);
    const summary = view.buttons.find(button => button.text === 'View details')!;
    expect(view.focusKeys.get(summary)).toBe('equipment-summary:equipment-candidate:helmet');
  });

  it('repairs a disappeared selected item to the slot scope instead of retaining a dead detail action', () => {
    const view = harness(390, 844);
    view.context.updateEquipment(() => ({ equipment: {}, loadout: {} }));
    view.buttons.length = 0;
    view.handlers.clear();
    const repaired = structuredClone(view.commands.snapshot()) as any;
    repaired.equipment.selectedInstanceId = undefined;
    repaired.equipment.selectedBlueprintId = undefined;
    repaired.equipment.blueprints = [];
    repaired.equipment.presentation.slots = repaired.equipment.presentation.slots.map((slot: any) => ({ ...slot, candidates: [] }));
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, repaired, {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    expect(view.buttons.some(button => button.text.startsWith('Back to candidates'))).toBe(false);
    expect(view.buttons.some(button => button.text.includes('equipment-detail'))).toBe(false);
    expect(view.context.saveData.equipment).toEqual({});
  });

  it('keeps the local review open when the authoritative save command returns failure', () => {
    const view = harness(390, 844);
    const details = view.buttons.find(button => button.text === 'View details')!;
    view.handlers.get(details)!();
    view.buttons.length = 0;
    view.handlers.clear();
    view.surface.unmount();
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    const before = view.context.saveData;
    const failed = { ...view.commands.snapshot(), notice: 'Equipment: save failed' };
    vi.spyOn(view.commands, 'equipEquipment').mockReturnValue(failed);
    vi.spyOn(view.commands, 'unequipEquipment').mockReturnValue(failed);
    const equip = view.buttons.find(button => button.text.startsWith('Equip ') || button.text.startsWith('Unequip '));
    expect(equip).toBeDefined();
    view.handlers.get(equip!)!();
    expect(view.context.saveData).toBe(before);
    view.buttons.length = 0;
    view.handlers.clear();
    view.surface.unmount();
    view.surface.present(object() as unknown as Phaser.GameObjects.Container, view.latest(), {
      width: 390, height: 844, top: 72, margin: 16, rightMargin: 16, centerX: 195, hitTarget: 48,
      viewport: responsiveUiViewport(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), scrollBottom: 724,
    }, 320);
    expect(view.buttons.some(button => button.text.startsWith('Back to candidates'))).toBe(true);
  });

  it('keeps clicked-card focus semantic and positions a blueprint emblem from the final row height', () => {
    const view = harness(1280, 720);
    const candidate = view.buttons.find(button => button.text.startsWith('Scavenger Helmet'))!;
    view.handlers.get(candidate)!();
    expect((view.surface as unknown as { browseReturnFocusKey?: string }).browseReturnFocusKey).toBe('equipment-candidate:helmet');
    const blueprint = view.buttons.find(button => button.text.startsWith('Commando Helmet\nStandard'))!;
    const owner = view.buttons.indexOf(blueprint);
    const emblem = view.icons.mock.calls.find(call => call[5] === owner && call[3] === 'equipment-set-icon:commando');
    expect(emblem).toBeDefined();
    expect(emblem![2]).toBe(blueprint.y + blueprint.height / 2);
  });
});
