import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import { InventoryController, type InventorySnapshot } from './inventory';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { createModalTextHelpers, type ModalTextHelpers } from './modal';
import { ThemeColor, ThemeDepth } from './theme';
import { PhaserWeaponRackPanel } from './weaponRackView';

export type PausePanel = 'closed' | 'pause' | 'inventory';

export interface PauseControllerOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly inventory: InventoryController;
}

export class PauseController {
  private readonly runState: RunState;
  private readonly bus: EventBus;
  private readonly inventory: InventoryController;
  private panel: PausePanel = 'closed';
  private disposed = false;

  constructor(options: PauseControllerOptions) {
    this.runState = options.runState;
    this.bus = options.bus;
    this.inventory = options.inventory;
  }

  pause(): boolean {
    if (this.disposed || this.runState.status !== 'active') {
      return false;
    }
    pauseRun(this.runState, this.bus, 'manual');
    this.panel = 'pause';
    return true;
  }

  resume(): boolean {
    if (
      this.disposed ||
      this.runState.status !== 'paused' ||
      this.runState.pauseReason !== 'manual'
    ) {
      return false;
    }
    this.inventory.clearSelection();
    resumeRun(this.runState, this.bus, 'manual');
    this.panel = 'closed';
    return true;
  }

  openInventory(): boolean {
    if (
      this.disposed ||
      this.panel !== 'pause' ||
      this.runState.status !== 'paused' ||
      this.runState.pauseReason !== 'manual'
    ) {
      return false;
    }
    this.inventory.clearSelection();
    this.panel = 'inventory';
    return true;
  }

  /** HUD/I-key entry point: pauses and opens the rack in one accepted command. */
  openInventoryFromRun(): boolean {
    if (this.disposed || this.panel !== 'closed' || this.runState.status !== 'active') {
      return false;
    }
    this.inventory.clearSelection();
    pauseRun(this.runState, this.bus, 'manual');
    this.panel = 'inventory';
    return true;
  }

  back(): boolean {
    if (this.disposed) {
      return false;
    }
    if (this.panel === 'inventory') {
      this.inventory.clearSelection();
      this.panel = 'pause';
      return true;
    }
    if (this.panel === 'pause') {
      return this.resume();
    }
    return false;
  }

  snapshot(): Readonly<{ panel: PausePanel; inventory: InventorySnapshot }> {
    return Object.freeze({
      panel: this.panel,
      inventory: this.inventory.snapshot(),
    });
  }

  destroy(): void {
    this.disposed = true;
    this.inventory.clearSelection();
  }
}

type PauseSnapshot = ReturnType<PauseController['snapshot']>;

export interface PhaserPauseViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly controller: PauseController;
  readonly inventory: InventoryController;
}

/**
 * Manual-pause shell. The responsive weapon-rack child panel is isolated in
 * `weaponRackView.ts`; this class owns only modal lifecycle and routing.
 */
export class PhaserPauseView {
  private readonly scene: Phaser.Scene;
  private readonly viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly controller: PauseController;
  private readonly modal: ModalTextHelpers;
  private readonly weaponRack: PhaserWeaponRackPanel;
  private root?: Phaser.GameObjects.Container;
  private disposed = false;

  constructor(options: PhaserPauseViewOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.controller = options.controller;
    this.modal = createModalTextHelpers(options.scene, options.viewport);
    this.weaponRack = new PhaserWeaponRackPanel({
      scene: options.scene,
      viewport: options.viewport,
      bus: options.bus,
      inventory: options.inventory,
      modal: this.modal,
      isOpen: () => this.controller.snapshot().panel === 'inventory',
      onBack: () => this.controller.back(),
      requestRender: () => this.render(this.controller.snapshot()),
    });
    this.render(this.controller.snapshot());
  }

  render(snapshot: PauseSnapshot): void {
    if (this.disposed) {
      return;
    }
    this.root?.destroy(true);
    this.root = undefined;
    if (snapshot.panel !== 'inventory') {
      this.weaponRack.reset();
    }
    if (snapshot.panel === 'closed') {
      return;
    }

    const { scene, viewport } = this;
    const width = viewport.canvasWidth;
    const height = viewport.canvasHeight;
    const margin = physicalToLogical(12, viewport);
    const hitTarget = minimumHitTarget(viewport);
    const buttonWidth = Math.max(180, width - margin * 4);
    const root = scene.add.container(0, 0);

    try {
      root.setDepth(ThemeDepth.pauseSummary);
      root.setScrollFactor(0);
      const backdrop = scene.add.rectangle(
        width / 2,
        height / 2,
        width,
        height,
        ThemeColor.background,
        0.94,
      );
      root.add(backdrop);
      backdrop.setInteractive();
      backdrop.setScrollFactor(0);

      if (snapshot.panel === 'pause') {
        this.renderPausePanel(root, width, height, margin, hitTarget, buttonWidth);
      } else {
        this.weaponRack.render(
          root,
          snapshot.inventory,
          width,
          height,
          margin,
          hitTarget,
        );
      }
      this.root = root;
    } catch (error) {
      root.destroy(true);
      throw error;
    }
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.weaponRack.destroy();
    this.root?.destroy(true);
    this.root = undefined;
  }

  private renderPausePanel(
    root: Phaser.GameObjects.Container,
    width: number,
    height: number,
    margin: number,
    hitTarget: number,
    buttonWidth: number,
  ): void {
    const centerX = width / 2;
    const heading = this.modal.addText(centerX, height * 0.22, 'Paused', 'heading');
    root.add(heading);
    heading.setOrigin(0.5);

    let y = height * 0.34;
    this.modal.addButton(root, centerX, y, buttonWidth, 'Resume', () => {
      if (this.controller.resume()) {
        this.bus.emit('ui:back', {});
      }
      this.render(this.controller.snapshot());
    });
    y += hitTarget + 16;
    this.modal.addButton(root, centerX, y, buttonWidth, 'Weapon Rack', () => {
      if (this.controller.openInventory()) {
        this.bus.emit('ui:confirm', {});
      }
      this.render(this.controller.snapshot());
    });

    this.modal.addHint(root, margin, height - margin - 14, 'P / Esc to resume');
  }
}
