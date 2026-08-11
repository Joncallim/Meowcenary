import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import {
  InventoryController,
  type InventorySnapshot,
  type MergeFailureReason,
} from './inventory';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { createModalTextHelpers, type ModalTextHelpers } from './modal';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';

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
    if (this.disposed) {
      return false;
    }
    // Never resume or replace a level-up pause.
    if (this.runState.status !== 'paused' || this.runState.pauseReason !== 'manual') {
      return false;
    }
    resumeRun(this.runState, this.bus, 'manual');
    this.panel = 'closed';
    return true;
  }

  openInventory(): boolean {
    if (this.disposed || this.panel !== 'pause') {
      return false;
    }
    if (this.runState.status !== 'paused' || this.runState.pauseReason !== 'manual') {
      return false;
    }
    this.panel = 'inventory';
    return true;
  }

  back(): boolean {
    if (this.disposed) {
      return false;
    }
    if (this.panel === 'inventory') {
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

/** Manual-pause surface: pause panel, inventory/merge child panel, and the
 *  full-screen interactive backdrop that keeps HUD/world controls below the
 *  modal non-interactive (priority order in the Epic 9 architecture doc).
 *  Emits exactly one `ui:*` command event per accepted user command; the
 *  controller itself stays headless. */
export class PhaserPauseView {
  private readonly scene: Phaser.Scene;
  private readonly viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly controller: PauseController;
  private readonly inventory: InventoryController;
  private readonly modal: ModalTextHelpers;
  private root?: Phaser.GameObjects.Container;
  private notice?: string;
  private disposed = false;

  constructor(options: PhaserPauseViewOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.controller = options.controller;
    this.inventory = options.inventory;
    this.modal = createModalTextHelpers(options.scene, options.viewport);
    this.render(this.controller.snapshot());
  }

  render(snapshot: PauseSnapshot): void {
    if (this.disposed) {
      return;
    }
    this.root?.destroy(true);
    this.root = undefined;
    // The merge failure notice lives inside the inventory panel; it survives
    // re-renders (e.g. row toggles) and clears once the panel is left.
    if (snapshot.panel !== 'inventory') {
      this.notice = undefined;
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

      // Interactive full-screen backdrop: the top-most interactive object eats
      // pointer events so nothing below the modal stays interactive. Parented
      // immediately so a failed chain call cannot orphan it.
      const backdrop = scene.add.rectangle(width / 2, height / 2, width, height, ThemeColor.background, 0.9);
      root.add(backdrop);
      backdrop.setInteractive();
      backdrop.setScrollFactor(0);

      if (snapshot.panel === 'pause') {
        this.renderPausePanel(root, width, height, margin, hitTarget, buttonWidth);
      } else {
        this.renderInventoryPanel(root, snapshot.inventory, width, height, margin, hitTarget, buttonWidth);
      }

      // The root is only published once the display tree is fully built, so a
      // failed render leaves the view invisible and a later render can retry
      // from a clean slate.
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
    this.root?.destroy(true);
    this.root = undefined;
    this.notice = undefined;
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
    this.modal.addButton(root, centerX, y, buttonWidth, 'Inventory', () => {
      if (this.controller.openInventory()) {
        this.bus.emit('ui:confirm', {});
      }
      this.render(this.controller.snapshot());
    });

    this.modal.addHint(root, margin, height - margin - 14, 'P / Esc to resume');
  }

  private renderInventoryPanel(
    root: Phaser.GameObjects.Container,
    snapshot: InventorySnapshot,
    width: number,
    height: number,
    margin: number,
    hitTarget: number,
    buttonWidth: number,
  ): void {
    const centerX = width / 2;
    const heading = this.modal.addText(centerX, margin + 16, 'Inventory', 'heading');
    root.add(heading);
    heading.setOrigin(0.5);

    const headingSize = physicalToLogical(ThemeFont.headingMin, this.viewport);
    const labelSize = physicalToLogical(ThemeFont.labelMin, this.viewport);
    const guide = this.modal.addText(centerX, margin + 16 + headingSize + 12, 'Select two matching weapons to merge', 'body');
    root.add(guide);
    guide.setOrigin(0.5);

    const rowWidth = width - margin * 2;
    let y = margin + 16 + headingSize + labelSize + 40;
    snapshot.weapons.forEach((weapon) => {
      const label = `${weapon.selected ? '✓' : ' '} T${weapon.tier} ${weapon.name}`;
      this.modal.addButton(root, centerX, y, rowWidth, label, () => {
        const next = this.inventory.toggle(weapon.instanceId);
        const selectedAfter = next.selectedInstanceIds.includes(weapon.instanceId);
        if (selectedAfter !== weapon.selected) {
          this.bus.emit('ui:navigate', {});
        }
        this.render(this.controller.snapshot());
      }, weapon.selected);
      y += hitTarget + 8;
    });

    if (this.notice) {
      const notice = this.modal.addText(centerX, y + 10, this.notice, 'notice');
      root.add(notice);
      notice.setOrigin(0.5);
      y += physicalToLogical(ThemeFont.bodyMin, this.viewport) + 10;
    }

    const mergeY = height - margin - hitTarget * 2 - 20;
    this.modal.addButton(root, centerX, mergeY, buttonWidth, 'Merge Selected', () => {
      const result = this.inventory.mergeSelected();
      // Exactly one confirm cue regardless of result: a failed merge still
      // confirms the command.
      this.bus.emit('ui:confirm', {});
      this.notice = result.ok ? undefined : mergeFailureCopy(result.reason);
      this.render(this.controller.snapshot());
    });
    this.modal.addButton(root, centerX, mergeY + hitTarget + 12, buttonWidth, '< Back', () => {
      if (this.controller.back()) {
        this.bus.emit('ui:back', {});
      }
      this.render(this.controller.snapshot());
    });

    this.modal.addHint(root, margin, height - margin - 14, 'Esc returns to pause');
  }
}

function mergeFailureCopy(reason: MergeFailureReason): string {
  switch (reason) {
    case 'run-not-manual-paused':
      return 'Run must be paused';
    case 'weapon-not-found':
      return 'Select two weapons';
    case 'same-instance':
      return 'Select two different weapons';
    case 'not-mergeable':
      return 'Weapons cannot be merged';
    case 'stale-inventory':
      return 'Inventory changed; retry';
  }
}
