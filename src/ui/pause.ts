import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import { InventoryController, type InventorySnapshot } from './inventory';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { createModalTextHelpers, type ModalTextHelpers } from './modal';
import { ThemeColor, ThemeDepth } from './theme';
import { PhaserWeaponRackPanel } from './weaponRackView';
import type { VisualArtLookup } from '../systems/visualArt';
import { FocusNavigator, type FocusDirection } from './focusList';
import type { InputMode } from '../systems/input';
import type { ModalButtonHandle } from './modal';

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
  readonly visualArt?: VisualArtLookup;
  readonly readInputMode?: () => InputMode;
}

/**
 * Manual-pause shell. The responsive weapon-rack child panel is isolated in
 * `weaponRackView.ts`; this class owns only modal lifecycle and routing.
 */
export class PhaserPauseView {
  private readonly scene: Phaser.Scene;
  private viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly controller: PauseController;
  private modal: ModalTextHelpers;
  private readonly weaponRack: PhaserWeaponRackPanel;
  private root?: Phaser.GameObjects.Container;
  private disposed = false;
  private readonly navigator = new FocusNavigator('linear');
  private buttons: ModalButtonHandle[] = [];
  private hint?: Phaser.GameObjects.Text;
  private hoveredIndex = -1;
  private committedPanel: PausePanel = 'closed';
  /** Explicit committed-display gate retained separately from the root
   *  reference: false before teardown, true only after a successful render
   *  publication. Exposed to the rack child so its number shortcuts cannot
   *  act on a destroyed tree (round-2 finding F1). */
  private committedDisplay = false;
  private readonly readInputMode: () => InputMode;
  private inputMode: InputMode = 'pointer';
  private lastInputMode: InputMode = 'pointer';

  constructor(options: PhaserPauseViewOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.controller = options.controller;
    this.readInputMode = options.readInputMode ?? (() => 'pointer');
    this.modal = createModalTextHelpers(options.scene, options.viewport);
    this.weaponRack = new PhaserWeaponRackPanel({
      scene: options.scene,
      viewport: options.viewport,
      bus: options.bus,
      inventory: options.inventory,
      modal: this.modal,
      isOpen: () => this.controller.snapshot().panel === 'inventory',
      hasCommittedRoot: () => this.committedDisplay,
      onBack: () => this.controller.back(),
      requestRender: () => this.render(this.controller.snapshot()),
      visualArt: options.visualArt,
      readInputMode: this.readInputMode,
    });
    options.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    this.render(this.controller.snapshot());
  }

  render(snapshot: PauseSnapshot): void {
    if (this.disposed) {
      return;
    }
    this.syncLayoutContext();
    const panelChanged = snapshot.panel !== this.committedPanel;
    // The display is uncommitted from the moment teardown begins until a
    // successful publication below (F1 committed-display gate).
    this.committedDisplay = false;
    // The rack's display refs (hint, targets) point into the shared root
    // being destroyed; clear them BEFORE the destroy so a failure between
    // here and weaponRack.render() leaves no stale Text reference (round-6).
    // Navigator state is preserved — D6 survives the rebuild.
    this.weaponRack.clearDisplay();
    this.root?.destroy(true);
    this.root = undefined;
    // Unpublished references are cleared up front: a failed rebuild must
    // never leave moveFocus/confirmFocused able to reach destroyed-tree
    // handles (F6 committed-render transaction).
    this.buttons = [];
    this.hint = undefined;
    this.hoveredIndex = -1;
    if (snapshot.panel !== 'inventory' || (panelChanged && snapshot.panel === 'inventory')) {
      this.weaponRack.reset();
    }
    if (snapshot.panel === 'closed') {
      this.navigator.setCount(0);
      this.committedPanel = snapshot.panel;
      return;
    }

    const { scene, viewport } = this;
    const width = viewport.canvasWidth;
    const height = viewport.canvasHeight;
    const margin = physicalToLogical(12, viewport);
    const hitTarget = minimumHitTarget(viewport);
    const buttonWidth = Math.max(180, width - margin * 4);
    const root = scene.add.container(this.viewport.originX ?? 0, this.viewport.originY ?? 0);

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

      let buttons: ModalButtonHandle[] = [];
      let hint: Phaser.GameObjects.Text | undefined;
      if (snapshot.panel === 'pause') {
        const built = this.renderPausePanel(root, width, height, margin, hitTarget, buttonWidth);
        buttons = built.buttons;
        hint = built.hint;
      } else {
        this.weaponRack.render(
          root,
          snapshot.inventory,
          width,
        );
      }
      if (panelChanged) this.navigator.reset();
      if (snapshot.panel === 'pause') this.navigator.setCount(buttons.length);
      // Stage then publish: the target list, hint, and identity are committed
      // together with the root only after the whole tree built successfully.
      this.buttons = buttons;
      this.hint = hint;
      this.applyFocus();
      this.root = root;
      this.committedPanel = snapshot.panel;
      this.committedDisplay = true;
    } catch (error) {
      // A failure inside weaponRack.render() may have published hint/targets
      // into the partial root; clear them BEFORE the destroy or the next
      // mode transition calls setText() on destroyed Text (round-7).
      this.weaponRack.clearDisplay();
      root.destroy(true);
      this.buttons = [];
      this.hint = undefined;
      this.hoveredIndex = -1;
      throw error;
    }
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    this.weaponRack.destroy();
    this.root?.destroy(true);
    this.root = undefined;
    this.buttons = [];
    this.hint = undefined;
    this.hoveredIndex = -1;
    this.navigator.setCount(0);
    this.committedPanel = 'closed';
    this.committedDisplay = false;
  }

  private readonly handleScaleChange = (): void => {
    if (this.disposed) {
      return;
    }
    this.syncLayoutContext();
    this.render(this.controller.snapshot());
  };

  private syncLayoutContext(): void {
    const scale = this.scene.scale;
    const next: UiViewport = {
      canvasWidth: positiveFinite(scale.width, this.viewport.canvasWidth),
      canvasHeight: positiveFinite(scale.height, this.viewport.canvasHeight),
      displayWidth: positiveFinite(
        scale.displaySize.width,
        this.viewport.displayWidth,
      ),
      displayHeight: positiveFinite(
        scale.displaySize.height,
        this.viewport.displayHeight,
      ),
      containerWidth: positiveFinite(
        scale.parentSize.width,
        this.viewport.containerWidth ?? this.viewport.displayWidth,
      ),
      containerHeight: positiveFinite(
        scale.parentSize.height,
        this.viewport.containerHeight ?? this.viewport.displayHeight,
      ),
    };
    if (sameViewport(this.viewport, next)) {
      return;
    }
    this.viewport = next;
    this.modal = createModalTextHelpers(this.scene, next);
    this.weaponRack.updateLayoutContext(next, this.modal);
  }

  private renderPausePanel(
    root: Phaser.GameObjects.Container,
    width: number,
    height: number,
    margin: number,
    hitTarget: number,
    buttonWidth: number,
  ): { buttons: ModalButtonHandle[]; hint: Phaser.GameObjects.Text } {
    const centerX = width / 2;
    const heading = this.modal.addText(centerX, height * 0.22, 'Paused', 'heading');
    root.add(heading);
    heading.setOrigin(0.5);

    let y = height * 0.34;
    const resume = this.modal.addButton(root, centerX, y, buttonWidth, 'Resume', () => {
      if (this.controller.resume()) {
        this.bus.emit('ui:back', {});
      }
      this.render(this.controller.snapshot());
    });
    y += hitTarget + 16;
    const rack = this.modal.addButton(root, centerX, y, buttonWidth, 'Weapon Rack', () => {
      if (this.controller.openInventory()) {
        this.bus.emit('ui:confirm', {});
      }
      this.render(this.controller.snapshot());
    });

    const buttons = [resume, rack];
    // F5: modal buttons participate in pointer-hover focus — silent index
    // sync, exactly one FocusStroke ring on hover, cleared on out, and the
    // logical index is set before the pointer-up activation runs.
    buttons.forEach((handle, index) => this.wireModalHover(handle, index));
    const hint = this.modal.addHint(root, margin, height - margin - 14, this.hintCopy());
    return { buttons, hint };
  }

  private wireModalHover(handle: ModalButtonHandle, index: number): void {
    handle.target.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
    });
    handle.target.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.applyFocus();
    });
    // Single surface funnel for pointer activation: FIRST sync the logical
    // index, THEN activate. The handle's enabled guard retains command
    // suppression for disabled buttons (round-2 finding F2).
    handle.target.on(Phaser.Input.Events.POINTER_UP, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
      handle.activate();
    });
  }

  moveFocus(direction: FocusDirection): boolean {
    // No committed root (never rendered, or a failed rebuild): refuse.
    if (!this.root) return false;
    if (this.controller.snapshot().panel === 'inventory') return this.weaponRack.moveFocus(direction);
    const moved = this.navigator.move(direction);
    if (moved) { this.applyFocus(); this.bus.emit('ui:navigate', {}); }
    return moved;
  }

  confirmFocused(): boolean {
    if (!this.root) return false;
    if (this.controller.snapshot().panel === 'inventory') return this.weaponRack.confirmFocused();
    return this.buttons[this.navigator.index]?.activate() ?? false;
  }

  refreshInputPresentation(): void {
    const mode = this.readInputMode();
    if (mode === this.lastInputMode) return;
    this.lastInputMode = mode;
    this.inputMode = mode;
    if (this.hint) this.hint.setText(this.hintCopy());
    this.weaponRack.refreshInputPresentation();
    this.applyFocus();
  }

  private applyFocus(): void {
    this.buttons.forEach((button, index) => button.setFocusVisible(
      this.inputMode === 'pointer' ? index === this.hoveredIndex : index === this.navigator.index,
    ));
  }

  private hintCopy(): string {
    switch (this.readInputMode()) {
      case 'keyboard': return 'Arrows • Enter/Space select • P/Esc resume';
      case 'gamepad': return 'D-pad/stick • Bottom face select • Menu/right face';
      default: return 'Tap a choice';
    }
  }
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sameViewport(a: UiViewport, b: UiViewport): boolean {
  return a.canvasWidth === b.canvasWidth
    && a.canvasHeight === b.canvasHeight
    && a.displayWidth === b.displayWidth
    && a.displayHeight === b.displayHeight
    && a.containerWidth === b.containerWidth
    && a.containerHeight === b.containerHeight;
}
