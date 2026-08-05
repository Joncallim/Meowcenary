import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import {
  InventoryController,
  type InventorySnapshot,
  type MergeFailureReason,
} from './inventory';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
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
  readonly controller: PauseController;
  readonly inventory: InventoryController;
}

/** Manual-pause surface: pause panel, inventory/merge child panel, and the
 *  full-screen interactive backdrop that keeps HUD/world controls below the
 *  modal non-interactive (priority order in the Epic 9 architecture doc). */
export class PhaserPauseView {
  private readonly scene: Phaser.Scene;
  private readonly viewport: UiViewport;
  private readonly controller: PauseController;
  private readonly inventory: InventoryController;
  private root?: Phaser.GameObjects.Container;
  private notice?: string;
  private disposed = false;

  constructor(options: PhaserPauseViewOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.controller = options.controller;
    this.inventory = options.inventory;
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
    root.setDepth(ThemeDepth.pauseSummary);
    root.setScrollFactor(0);
    this.root = root;

    // Interactive full-screen backdrop: the top-most interactive object eats
    // pointer events so nothing below the modal stays interactive.
    const backdrop = scene.add.rectangle(width / 2, height / 2, width, height, ThemeColor.background, 0.9);
    backdrop.setInteractive();
    backdrop.setScrollFactor(0);
    root.add(backdrop);

    if (snapshot.panel === 'pause') {
      this.renderPausePanel(root, width, height, margin, hitTarget, buttonWidth);
    } else {
      this.renderInventoryPanel(root, snapshot.inventory, width, height, margin, hitTarget, buttonWidth);
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
    const heading = this.addText(centerX, height * 0.22, 'Paused', 'heading');
    heading.setOrigin(0.5);
    root.add(heading);

    let y = height * 0.34;
    this.addButton(root, centerX, y, buttonWidth, 'Resume', () => {
      this.controller.resume();
      this.render(this.controller.snapshot());
    });
    y += hitTarget + 16;
    this.addButton(root, centerX, y, buttonWidth, 'Inventory', () => {
      this.controller.openInventory();
      this.render(this.controller.snapshot());
    });

    this.addHint(root, margin, height - margin - 14, 'P / Esc to resume');
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
    const heading = this.addText(centerX, margin + 16, 'Inventory', 'heading');
    heading.setOrigin(0.5);
    root.add(heading);

    const headingSize = physicalToLogical(ThemeFont.headingMin, this.viewport);
    const labelSize = physicalToLogical(ThemeFont.labelMin, this.viewport);
    const guide = this.addText(centerX, margin + 16 + headingSize + 12, 'Select two matching weapons to merge', 'body');
    guide.setOrigin(0.5);
    root.add(guide);

    const rowWidth = width - margin * 2;
    let y = margin + 16 + headingSize + labelSize + 40;
    snapshot.weapons.forEach((weapon) => {
      const label = `${weapon.selected ? '✓' : ' '} T${weapon.tier} ${weapon.name}`;
      this.addButton(root, centerX, y, rowWidth, label, () => {
        this.inventory.toggle(weapon.instanceId);
        this.render(this.controller.snapshot());
      }, weapon.selected);
      y += hitTarget + 8;
    });

    if (this.notice) {
      const notice = this.addText(centerX, y + 10, this.notice, 'notice');
      notice.setOrigin(0.5);
      root.add(notice);
      y += physicalToLogical(ThemeFont.bodyMin, this.viewport) + 10;
    }

    const mergeY = height - margin - hitTarget * 2 - 20;
    this.addButton(root, centerX, mergeY, buttonWidth, 'Merge Selected', () => {
      const result = this.inventory.mergeSelected();
      this.notice = result.ok ? undefined : mergeFailureCopy(result.reason);
      this.render(this.controller.snapshot());
    });
    this.addButton(root, centerX, mergeY + hitTarget + 12, buttonWidth, '< Back', () => {
      this.controller.back();
      this.render(this.controller.snapshot());
    });

    this.addHint(root, margin, height - margin - 14, 'Esc returns to pause');
  }

  private addText(
    x: number,
    y: number,
    text: string,
    kind: 'heading' | 'body' | 'notice',
  ): Phaser.GameObjects.Text {
    const viewport = this.viewport;
    const style =
      kind === 'heading'
        ? {
            color: '#f7f1d5',
            fontFamily: ThemeFont.family,
            fontSize: `${physicalToLogical(ThemeFont.headingMin, viewport)}px`,
            fontStyle: '700',
          }
        : kind === 'notice'
          ? {
              color: '#f87171',
              fontFamily: ThemeFont.family,
              fontSize: `${physicalToLogical(ThemeFont.bodyMin, viewport)}px`,
            }
          : {
              color: '#d6f7ff',
              fontFamily: ThemeFont.family,
              fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
            };
    const textObject = this.scene.add.text(x, y, text, style);
    textObject.setScrollFactor(0);
    return textObject;
  }

  private addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onActivate: () => void,
    emphasized = false,
  ): void {
    const viewport = this.viewport;
    const hitTarget = minimumHitTarget(viewport);
    const rect = this.scene.add.rectangle(
      x,
      y,
      width,
      hitTarget,
      emphasized ? ThemeColor.cardHover : ThemeColor.card,
    );
    rect.setStrokeStyle(physicalToLogical(2, viewport), emphasized ? ThemeColor.primary : ThemeColor.muted, 0.9);
    rect.setScrollFactor(0);
    rect.setInteractive();
    rect.on(Phaser.Input.Events.POINTER_UP, onActivate);

    const text = this.scene.add.text(x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
    });
    text.setOrigin(0.5);
    text.setScrollFactor(0);

    root.add([rect, text]);
  }

  private addHint(root: Phaser.GameObjects.Container, x: number, y: number, text: string): void {
    const hint = this.addText(x, y, text, 'body');
    hint.setOrigin(0, 1);
    root.add(hint);
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
