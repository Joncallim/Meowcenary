import type Phaser from 'phaser';
import type { MainMenuController, MainMenuSnapshot } from '../menus';
import type { UiViewport } from '../layout';
import type { UiVisualChrome } from '../visualChrome';
import { MenuSurfaceMount } from './mount';

export type LoadoutMenuPanel = 'loadout' | 'equipment' | 'gunsmith';
export interface MenuSurfaceLayout {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly margin: number;
  readonly hitTarget: number;
  readonly centerX: number;
  readonly rightMargin: number;
  readonly viewport: UiViewport;
  readonly scrollBottom: number;
}

/** Existing shared Menu focus/scroll/chrome primitives. A surface cannot
 * mutate the navigator, resource queue, run-launch state or durable context. */
export interface MenuSurfaceControls {
  addButton(root: Phaser.GameObjects.Container, x: number, y: number, label: string,
    minHeight: number, callback?: () => void, audioEvent?: 'ui:confirm' | 'ui:back',
    maxLabelWidth?: number, artId?: string, trailingReserve?: number,
    leadingReserve?: number, topAligned?: boolean, horizontalAlign?: 'left' | 'center',
    appearance?: 'card' | 'section'): Phaser.GameObjects.Text;
  disableButton(button: Phaser.GameObjects.Text): void;
  addHeading(root: Phaser.GameObjects.Container, x: number, y: number, text: string): Phaser.GameObjects.Text;
  addCatalogIcon(root: Phaser.GameObjects.Container, x: number, y: number, id: string, size?: number, ownerIndex?: number): void;
  addPanelArt(root: Phaser.GameObjects.Container, x: number, y: number, id: string, size: number,
    subdued?: boolean, animate?: boolean, ownerIndex?: number): void;
  beginScrollableRegion(top: number, bottom: number): void;
  endScrollableRegion(): void;
  registerScrollObject(object: Phaser.GameObjects.GameObject, ownerIndex?: number): void;
  buttonIndex(button: Phaser.GameObjects.Text): number;
  rememberFocus(button: Phaser.GameObjects.Text, key: string): Phaser.GameObjects.Text;
  focusNext(key: string, alignTop?: boolean): void;
  focusAfterRender(button: Phaser.GameObjects.Text): void;
  equipmentSlotColumns(columns: number): void;
}

export interface MenuSurfaceResources {
  panel(panel: LoadoutMenuPanel, ids: readonly string[]): void;
  equipment(ids: readonly string[]): void;
  gunsmith(ids: readonly string[]): void;
}

export type LoadoutSurfaceCommands = Pick<MainMenuController, 'open' | 'selectEquipmentSlot'>;
export type EquipmentSurfaceCommands = LoadoutSurfaceCommands & Pick<MainMenuController,
  'snapshot' | 'selectEquipmentCandidate' | 'selectEquipmentBlueprint' | 'equipmentPreview' |
  'unequipEquipment' | 'equipEquipment' | 'upgradeEquipment' | 'fabricateEquipment'>;
export type GunsmithSurfaceCommands = Pick<MainMenuController,
  'back' | 'selectGunBuild' | 'createGunBuild' | 'removeUnavailableGunPart' | 'unequipGunPart' |
  'fitGunPart' | 'beginGunMerge' | 'requestGunWorkshop' | 'selectGunMergeInput' |
  'confirmGunWorkshop' | 'cancelGunWorkshop' | 'fabricateGunPart'>;

export interface MenuSurfaceEnvironment {
  readonly scene: Phaser.Scene;
  readonly visuals?: UiVisualChrome;
  readonly controls: MenuSurfaceControls;
  readonly resources: MenuSurfaceResources;
  readonly onSnapshot: (snapshot: MainMenuSnapshot, change?: 'equipment-selection') => void;
}

/** No per-panel listeners or async ownership: Scene routes input and resource
 * completion. All required lifecycle operations apply to every surface. */
export abstract class MenuPanelSurface {
  protected readonly mount: MenuSurfaceMount;
  protected layout!: MenuSurfaceLayout;
  abstract readonly panel: LoadoutMenuPanel;

  constructor(protected readonly environment: MenuSurfaceEnvironment) {
    this.mount = new MenuSurfaceMount(environment.scene);
  }

  get root(): Phaser.GameObjects.Container | undefined { return this.mount.root; }

  present(parent: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot,
    layout: MenuSurfaceLayout, scrap: number): void {
    if (snapshot.panel !== this.panel) throw new Error(`Wrong snapshot for ${this.panel} surface`);
    this.layout = layout;
    this.mount.present(parent, root => this.draw(root, snapshot, layout, scrap));
  }

  unmount(): void { this.mount.unmount(); }
  dispose(): void { this.mount.dispose(); }

  protected abstract draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot,
    layout: MenuSurfaceLayout, scrap: number): void;

  protected button(...args: Parameters<MenuSurfaceControls['addButton']>): Phaser.GameObjects.Text {
    if (args[5]) args[5] = this.mount.guardedCommand(args[5]);
    return this.environment.controls.addButton(...args);
  }

  protected own<T extends Phaser.GameObjects.GameObject>(root: Phaser.GameObjects.Container, object: T): T {
    root.add(object);
    return object;
  }
}
