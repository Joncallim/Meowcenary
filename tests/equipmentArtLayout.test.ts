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

interface LayoutObject {
  x: number; y: number; text: string; width: number; height: number; list: LayoutObject[];
  add(child: LayoutObject): LayoutObject; moveTo(): LayoutObject; setScrollFactor(): LayoutObject;
  setStrokeStyle(): LayoutObject; setStyle(): LayoutObject; setPadding(): LayoutObject;
  setFixedSize(width: number, height: number): LayoutObject;
  getBounds(): { centerX: number; centerY: number; width: number; height: number };
  destroy(): void;
}

function object(x = 0, y = 0, text = '', width = 0, height = 20): LayoutObject {
  const result = {
    x, y, text, width, height, list: [] as ReturnType<typeof object>[],
    add(child: ReturnType<typeof object>) { this.list.push(child); return this; },
    moveTo() { return this; }, setScrollFactor() { return this; }, setStrokeStyle() { return this; },
    setStyle() { return this; }, setPadding() { return this; },
    setFixedSize(w: number, h: number) { this.width = w; this.height = h; return this; },
    getBounds() { return { centerX: this.x + this.width / 2, centerY: this.y + this.height / 2, width: this.width, height: this.height }; },
    destroy() { /* Renderer ownership is exercised by the scene lifecycle tests. */ },
  };
  return result;
}

function harness(width: number, height: number, panel: 'equipment' | 'loadout' = 'equipment') {
  const data = loadGameData();
  const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'equipment-art-layout') });
  context.updateEquipment(() => ({ equipment: { helmet: { equipmentId: 'equipment:scavenger-helmet', tier: 1 } }, loadout: { helmet: 'helmet' } }));
  const commands = new MainMenuController(context);
  commands.open(panel);
  const snapshot = commands.selectEquipmentCandidate('helmet');
  const buttons: ReturnType<typeof object>[] = [];
  const art = vi.fn();
  const icons = vi.fn();
  const columns = vi.fn();
  const disable = vi.fn();
  const begin = vi.fn();
  const end = vi.fn();
  const environment = {
    scene: { scale: { width, height }, add: { container: () => object(),
      rectangle: (x: number, y: number, w: number, h: number) => object(x, y, '', w, h),
      text: (x: number, y: number, value: string) => object(x, y, value, Math.min(width - 32, value.length * 7), value.split('\n').length * 20),
    } },
    controls: { addButton: (root: ReturnType<typeof object>, x: number, y: number, label: string, minHeight: number, _callback: unknown, _event: unknown, maxWidth = 300) => {
      const button = object(x, y, label, maxWidth, minHeight); buttons.push(button); root.add(button); return button;
    }, addLoadoutArt: art, addCatalogIcon: icons, addPanelArt: vi.fn(), equipmentSlotColumns: columns,
      registerScrollObject: vi.fn(), rememberFocus: (button: unknown) => button, buttonIndex: (button: unknown) => buttons.indexOf(button as ReturnType<typeof object>),
      disableButton: disable, focusNext: vi.fn(), beginScrollableRegion: begin, endScrollableRegion: end },
    resources: { panel: vi.fn(), equipment: vi.fn(), gunsmith: vi.fn() }, onSnapshot: vi.fn(),
  } as unknown as MenuSurfaceEnvironment;
  const viewport = responsiveUiViewport(width, height, { top: 0, right: 0, bottom: 0, left: 0 });
  const layout: MenuSurfaceLayout = { width, height, top: 72, margin: 16, rightMargin: 16, centerX: width / 2, hitTarget: 48, viewport, scrollBottom: height - 120 };
  const surface = panel === 'equipment' ? new EquipmentSurface(environment, commands) : new LoadoutSurface(environment, commands);
  surface.present(object() as unknown as Phaser.GameObjects.Container, snapshot, layout, 320);
  return { art, icons, columns, buttons, disable, begin, end, context, snapshot, surface };
}

describe('art-led Equipment layout', () => {
  it.each([[360, 640], [390, 844], [844, 390], [1114, 720], [1280, 720], [1920, 1080]])('keeps four distinct responsive slots with visible media inside each card at %i×%i', (width, height) => {
    const view = harness(width, height);
    const slots = view.buttons.slice(0, 4);
    expect(view.columns).toHaveBeenCalledWith(width >= 1000 ? 4 : 2);
    expect(slots.map(slot => slot.text.split('\n')[0])).toEqual(['HELMET', 'ARMOUR', 'GLOVES', 'BOOTS']);
    const firstArt = view.art.mock.calls.find(call => call[3] === 'equipment-icon:scavenger-helmet');
    expect(firstArt).toBeDefined();
    const expectedExtent = width === 360 ? 128 : width === 390 ? 144 : width === 1114 ? 240.5 : 264;
    expect(firstArt![4]).toBe(expectedExtent);
    expect(firstArt![5]).toBe(expectedExtent);
    for (const slot of slots) {
      expect(slot.width).toBeGreaterThanOrEqual(44);
      expect(slot.height).toBeGreaterThanOrEqual(expectedExtent + 48);
      expect(slot.x).toBeGreaterThanOrEqual(16);
      expect(slot.x + slot.width).toBeLessThanOrEqual(width - 16);
    }
    expect(view.begin).toHaveBeenCalledTimes(1);
    expect(view.end).toHaveBeenCalledTimes(1);
  });

  it.each([[390, 844, 264], [1280, 720, 400]])('gives inspection its own large frame and compares both tiers in one optical frame at %i×%i', (width, height, detailExtent) => {
    const view = harness(width, height);
    const calls = view.art.mock.calls;
    expect(calls.some(call => call[3] === 'equipment-icon:scavenger-helmet' && call[4] === detailExtent && call[5] === detailExtent)).toBe(true);
    const pairs = calls.filter(call => Array.isArray(call[7]));
    expect(pairs).toHaveLength(2);
    expect(pairs[0]![7]).toEqual(pairs[1]![7]);
    expect(pairs[0]![3]).not.toBe(pairs[1]![3]);
    expect(view.buttons.some(button => button.text.startsWith('Unequip Scavenger Helmet'))).toBe(true);
    expect(view.context.saveData.equipment.helmet!.tier).toBe(1);
  });

  it('shows the authoritative locked upgrade condition while retaining the tier comparison and disabling its commit', () => {
    const view = harness(390, 844);
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
});
