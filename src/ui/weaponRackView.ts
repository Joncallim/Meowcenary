import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { VisualArtLookup } from '../systems/visualArt';
import {
  InventoryController,
  type InventorySnapshot,
  type InventoryWeaponView,
  type MergeFailureReason,
} from './inventory';
import { physicalToLogical, safeDisplayScale, type UiViewport } from './layout';
import type { ModalTextHelpers } from './modal';
import { FocusStroke, ThemeColor, ThemeFont, themeColorCss } from './theme';
import { computeWeaponRackLayout } from './weaponRackLayout';
import { FocusNavigator, type FocusDirection } from './focusList';
import type { InputMode } from '../systems/input';
import type { ModalButtonHandle } from './modal';

export interface PhaserWeaponRackPanelOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly inventory: InventoryController;
  readonly modal: ModalTextHelpers;
  readonly isOpen: () => boolean;
  /** Parent (Pause view) committed-root state: false during/after a failed
   *  rebuild, true only after a successful publication. Gates this panel's
   *  number shortcuts so they cannot act on a destroyed tree (F1). */
  readonly hasCommittedRoot: () => boolean;
  readonly onBack: () => boolean;
  readonly requestRender: () => void;
  readonly visualArt?: VisualArtLookup;
  readonly readInputMode?: () => InputMode;
}

interface MergeConfirmation {
  readonly resultName: string;
  readonly occupied: number;
  readonly capacity: number;
}

/**
 * Presentation-only child panel for the pause surface. It owns responsive rack
 * layout and input mapping but receives commands and immutable state through
 * callbacks, avoiding a dependency on PauseController.
 */
export class PhaserWeaponRackPanel {
  private readonly scene: Phaser.Scene;
  private viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly inventory: InventoryController;
  private modal: ModalTextHelpers;
  private readonly isOpen: () => boolean;
  private readonly hasCommittedRoot: () => boolean;
  private readonly onBack: () => boolean;
  private readonly requestRender: () => void;
  private readonly visualArt?: VisualArtLookup;
  private notice?: string;
  private confirmation?: MergeConfirmation;
  private disposed = false;
  private readonly navigator = new FocusNavigator('grid', 2);
  private inputMode: InputMode = 'pointer';
  private lastInputMode: InputMode = 'pointer';
  private readonly readInputMode: () => InputMode;
  private focusTargets: Array<{ target: Phaser.GameObjects.Rectangle; activate: () => boolean; setFocusVisible: (visible: boolean) => void }> = [];
  private cardEdges: Array<Phaser.GameObjects.Rectangle | undefined> = [];
  private hoveredIndex = -1;
  private hint?: Phaser.GameObjects.Text;

  constructor(options: PhaserWeaponRackPanelOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.inventory = options.inventory;
    this.modal = options.modal;
    this.isOpen = options.isOpen;
    this.hasCommittedRoot = options.hasCommittedRoot;
    this.onBack = options.onBack;
    this.requestRender = options.requestRender;
    this.visualArt = options.visualArt;
    this.readInputMode = options.readInputMode ?? (() => 'pointer');
    options.scene.input?.keyboard?.on('keydown', this.handleKeyDown, this);
  }

  render(
    root: Phaser.GameObjects.Container,
    snapshot: InventorySnapshot,
    width: number,
  ): void {
    const layout = computeWeaponRackLayout(this.viewport, snapshot.capacity);
    this.focusTargets = [];
    this.cardEdges = [];
    this.hoveredIndex = -1;
    // A portrait→compact rebuild destroys the portrait root while the
    // compact render (keyHintY undefined) creates no key hint; the stale
    // reference must go or the next mode transition calls setText() on a
    // destroyed Phaser.Text (round-5 adversarial finding). Cleared at
    // teardown, re-committed only by a successful render below.
    this.hint = undefined;
    // A freshly reset navigator (index === -1) marks a genuine panel entry:
    // only then does an entirely empty rack fall back to Back so a reset
    // still lands on an actionable target. Same-panel re-renders (selection,
    // preview, merge result, resize) preserve the live index — the F4
    // empty-rack resize regression (Merge i=6 must survive a rebuild).
    const freshEntry = this.navigator.index === -1;
    this.navigator.setColumns(layout.columns);
    this.navigator.setCount(snapshot.capacity + 2);
    const heading = this.modal.addText(layout.margin, layout.margin, 'Weapon Rack', 'heading');
    root.add(heading);
    const count = this.modal.addText(
      width - layout.margin,
      layout.margin + 2,
      `${snapshot.weapons.length}/${snapshot.capacity}`,
      'body',
    );
    root.add(count);
    count.setOrigin(1, 0);

    const guide = this.modal.addText(
      layout.margin,
      layout.guideY,
      this.guideCopy(snapshot, layout.compact),
      'body',
    );
    root.add(guide);
    if (layout.keyHintY !== undefined) {
      const keyHint = this.modal.addText(
        layout.margin,
        layout.keyHintY,
        this.hintCopy(),
        'body',
      );
      root.add(keyHint);
      keyHint.setOrigin(0, 0);
      this.hint = keyHint;
    }

    snapshot.slots.forEach((weapon, index) => {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const x = layout.margin
        + layout.cardWidth / 2
        + column * (layout.cardWidth + layout.gap);
      const y = layout.gridTop
        + layout.cardHeight / 2
        + row * (layout.cardHeight + layout.gap);
      const slot = this.renderRackSlot(
        root,
        weapon,
        index,
        x,
        y,
        layout.cardWidth,
        layout.cardHeight,
        layout.compact,
      );
      this.registerTarget(slot, index, weapon ? () => {
        this.selectWeapon(weapon.instanceId);
        return true;
      } : () => false, slot.strokeColor, slot.strokeAlpha, this.cardEdges[index]);
    });

    this.renderPreview(
      root,
      snapshot,
      layout.preview.x,
      layout.preview.y,
      layout.preview.width,
      layout.preview.height,
      layout.compact,
    );

    const canCommit = snapshot.preview !== undefined;
    const mergeLabel = snapshot.preview
      ? layout.compact
        ? `MERGE T${snapshot.preview.result.tier}`
        : `MERGE → ${snapshot.preview.result.name}`
      : layout.compact
        ? 'PICK PAIR'
        : 'SELECT A MATCHING PAIR';
    const merge = this.modal.addButton(
      root,
      layout.mergeAction.x,
      layout.mergeAction.y,
      layout.mergeAction.width,
      mergeLabel,
      () => this.commitMerge(),
      canCommit,
      canCommit,
    );
    this.registerModalTarget(merge, snapshot.capacity);
    const back = this.modal.addButton(
      root,
      layout.backAction.x,
      layout.backAction.y,
      layout.backAction.width,
      '< Back',
      () => {
        if (this.onBack()) {
          this.bus.emit('ui:back', {});
        }
        this.requestRender();
      },
    );
    this.registerModalTarget(back, snapshot.capacity + 1);
    if (snapshot.weapons.length === 0 && freshEntry) {
      this.navigator.setIndex(snapshot.capacity + 1);
    }
    this.applyFocus();
  }

  updateLayoutContext(viewport: UiViewport, modal: ModalTextHelpers): void {
    this.viewport = viewport;
    this.modal = modal;
  }

  /** Clear ONLY display references (round-6: a failed parent rebuild destroys
   *  the shared root before this.render() would clear them; a stale hint/
   *  target would crash the next mode transition on destroyed Text). Does
   *  NOT touch navigator state — D6 preservation survives the rebuild. */
  clearDisplay(): void {
    this.focusTargets = [];
    this.cardEdges = [];
    this.hoveredIndex = -1;
    this.hint = undefined;
  }

  reset(): void {
    this.notice = undefined;
    this.confirmation = undefined;
    this.focusTargets = [];
    this.cardEdges = [];
    this.hoveredIndex = -1;
    this.hint = undefined;
    this.navigator.setCount(0);
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.scene.input?.keyboard?.off('keydown', this.handleKeyDown, this);
    this.reset();
  }

  private renderRackSlot(
    root: Phaser.GameObjects.Container,
    weapon: InventoryWeaponView | null,
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
    compact: boolean,
  ): Phaser.GameObjects.Rectangle {
    const strokeWidth = physicalToLogical(2, this.viewport);
    if (!weapon) {
      const slot = this.scene.add.rectangle(x, y, width, height, ThemeColor.surface, 0.72);
      root.add(slot);
      slot.setStrokeStyle(strokeWidth, ThemeColor.card, 0.75);
      const empty = this.addCardText(
        x,
        y,
        compact ? `${index + 1} —` : `${index + 1}  EMPTY SLOT`,
        'muted',
        width - 16,
      );
      root.add(empty);
      empty.setOrigin(0.5);
      slot.setScrollFactor(0).setInteractive();
      return slot;
    }

    const state = weapon.selectionState;
    const fill = state === 'selected'
      ? ThemeColor.cardHover
      : state === 'incompatible'
        ? ThemeColor.surface
        : ThemeColor.card;
    const rarityStroke = ThemeColor.rarity[weapon.rarity];
    const alpha = state === 'incompatible' ? 0.48 : 0.94;
    const card = this.scene.add.rectangle(x, y, width, height, fill, alpha);
    root.add(card);
    const edge = this.scene.add.rectangle(x, y, width, height, ThemeColor.surface, 0);
    root.add(edge);
    edge.setStrokeStyle(strokeWidth, rarityStroke, 0.95);
    edge.setScrollFactor(0);
    this.cardEdges[index] = edge;
    // Phaser input reads a child's scroll factor; Containers do not propagate it.
    card.setScrollFactor(0).setInteractive({ useHandCursor: true });

    const left = x - width / 2;
    const top = y - height / 2;
    if (compact) {
      const dense = height * safeDisplayScale(this.viewport) < 70;
      if (!dense) {
        this.renderWeaponGlyph(
          root,
          weapon.iconId,
          x,
          y + physicalToLogical(5, this.viewport),
          rarityStroke,
          true,
        );
      }
      const family = this.addCardText(
        x,
        y + height / 2 - physicalToLogical(dense ? 17 : 20, this.viewport),
        compactWeaponLabel(weapon.family),
        'primary',
        width - 8,
        dense ? ThemeFont.labelMin : ThemeFont.bodyMin,
      );
      root.add(family);
      family.setOrigin(0.5, 0);
      const tier = this.addCardText(left + 8, top + 7,
        `${index + 1}·T${weapon.tier}`, 'muted', width / 2);
      root.add(tier);
      const stateLabel = this.addCardText(
        x,
        top + physicalToLogical(18, this.viewport),
        selectionLabel(weapon),
        state === 'selected' || state === 'merge-ready' ? 'gold' : 'muted',
        width - physicalToLogical(4, this.viewport),
        ThemeFont.labelMin,
      );
      root.add(stateLabel);
      stateLabel.setOrigin(0.5, 0);
      const availableStateWidth = width - physicalToLogical(6, this.viewport);
      if (Number.isFinite(stateLabel.width) && stateLabel.width > availableStateWidth) {
        stateLabel.setScale(availableStateWidth / stateLabel.width, 1);
      }
      return card;
    }

    this.renderWeaponGlyph(root, weapon.iconId, left + 28, y + 2, rarityStroke, false);
    const tier = this.addCardText(left + 8, top + 7,
      `${index + 1} · T${weapon.tier}`, 'muted', width / 2);
    root.add(tier);
    const name = this.addCardText(
      left + 54,
      top + 31,
      weapon.name,
      'primary',
      width - 64,
    );
    root.add(name);
    const damage = weapon.stats.find((stat) => stat.key === 'damage');
    const rate = weapon.stats.find((stat) => stat.key === 'rate');
    const shots = weapon.stats.find((stat) => stat.key === 'projectiles');
    const stats = this.addCardText(
      left + 54,
      y + 17,
      [
        damage && `${damage.label} ${damage.formatted}`,
        rate?.formatted,
        shots && shots.value > 1 ? shots.formatted : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' • '),
      'muted',
      width - 64,
    );
    root.add(stats);
    const stateLabel = this.addCardText(
      x + width / 2 - 8,
      top + 7,
      selectionLabel(weapon),
      state === 'selected' || state === 'merge-ready' ? 'gold' : 'muted',
      width / 2,
    );
    root.add(stateLabel);
    stateLabel.setOrigin(1, 0);
    return card;
  }

  private renderWeaponGlyph(
    root: Phaser.GameObjects.Container,
    iconId: string,
    x: number,
    y: number,
    color: number,
    compact: boolean,
  ): void {
    const binding = this.visualArt?.bindingById(iconId);
    if (binding?.kind === 'weapon-icon' && this.scene.textures.exists(binding.textureKey)) {
      const image = this.scene.add.image(x, y, binding.textureKey)
        .setDisplaySize(binding.display.width, binding.display.height);
      root.add(image);
      return;
    }
    const unit = physicalToLogical(compact ? 1 : 2, this.viewport);
    const addPart = (offsetX: number, offsetY: number, width: number, height: number) => {
      const part = this.scene.add.rectangle(
        x + offsetX * unit,
        y + offsetY * unit,
        width * unit,
        height * unit,
        color,
        0.96,
      );
      root.add(part);
    };

    if (iconId.includes(':smg')) {
      addPart(0, 0, 12, 5);
      addPart(8, -1, 7, 2);
      addPart(-8, -1, 5, 3);
      addPart(1, 5, 3, 5);
    } else if (iconId.includes(':shotgun')) {
      addPart(1, -1, 17, 3);
      addPart(11, -2, 7, 1.5);
      addPart(-9, 1, 6, 5);
    } else {
      addPart(0, 0, 11, 4);
      addPart(8, -1, 5, 2);
      addPart(-1, 5, 3.5, 5);
    }
  }

  private renderPreview(
    root: Phaser.GameObjects.Container,
    snapshot: InventorySnapshot,
    x: number,
    y: number,
    width: number,
    height: number,
    compact: boolean,
  ): void {
    const panel = this.scene.add.rectangle(
      x + width / 2,
      y + height / 2,
      width,
      height,
      ThemeColor.surface,
      0.94,
    );
    root.add(panel);
    panel.setStrokeStyle(physicalToLogical(2, this.viewport), ThemeColor.card, 0.9);

    const inset = physicalToLogical(10, this.viewport);
    if (this.confirmation) {
      const title = this.addCardText(
        x + inset,
        y + inset,
        'MERGE COMPLETE',
        'gold',
        width - inset * 2,
      );
      root.add(title);
      const result = this.addCardText(
        x + inset,
        y + inset + physicalToLogical(24, this.viewport),
        this.confirmation.resultName,
        'primary',
        width - inset * 2,
      );
      root.add(result);
      const freed = this.addCardText(
        x + inset,
        y + inset + physicalToLogical(52, this.viewport),
        `1 SLOT FREED • ${this.confirmation.occupied}/${this.confirmation.capacity} occupied`,
        'gold',
        width - inset * 2,
      );
      root.add(freed);
      return;
    }

    if (!snapshot.preview) {
      const title = this.addCardText(
        x + inset,
        y + inset,
        'Merge preview',
        'primary',
        width - inset * 2,
      );
      root.add(title);
      const message = this.addCardText(
        x + inset,
        y + inset + physicalToLogical(28, this.viewport),
        this.notice ?? (
          snapshot.selectedInstanceIds.length === 1
            ? 'Choose a card marked MATCH.'
            : snapshot.mergeReady
              ? 'Choose either card marked MERGE.'
              : 'No compatible pair in the rack yet.'
        ),
        this.notice ? 'danger' : 'muted',
        width - inset * 2,
      );
      root.add(message);
      return;
    }

    const preview = snapshot.preview;
    const resultOffset = compact ? 22 : 25;
    const deltaOffset = compact ? 43 : 53;
    const deltaStep = compact ? 16 : 21;
    const equation = this.addCardText(
      x + inset,
      y + inset,
      `T${preview.inputs[0].tier} + T${preview.inputs[1].tier} → T${preview.result.tier}`,
      'gold',
      width - inset * 2,
    );
    root.add(equation);
    const result = this.addCardText(
      x + inset,
      y + inset + physicalToLogical(resultOffset, this.viewport),
      preview.result.name,
      'primary',
      width - inset * 2,
    );
    root.add(result);
    preview.deltas.forEach((delta, index) => {
      const line = this.addCardText(
        x + inset,
        y + inset + physicalToLogical(deltaOffset + index * deltaStep, this.viewport),
        `${delta.label}  ${delta.formattedBefore} → ${delta.formattedAfter}`,
        'muted',
        width - inset * 2,
      );
      root.add(line);
    });
  }

  private addCardText(
    x: number,
    y: number,
    text: string,
    tone: 'primary' | 'muted' | 'gold' | 'danger',
    wrapWidth: number,
    physicalFontSize: number = ThemeFont.bodyMin,
  ): Phaser.GameObjects.Text {
    const colors = {
      primary: '#f7f1d5',
      muted: '#a5f3fc',
      gold: themeColorCss(ThemeColor.gold),
      danger: '#f87171',
    } as const;
    const object = this.scene.add.text(x, y, text, {
      color: colors[tone],
      fontFamily: ThemeFont.family,
      fontSize: `${physicalToLogical(physicalFontSize, this.viewport)}px`,
      fontStyle: tone === 'primary' || tone === 'gold' ? '700' : '400',
      wordWrap: { width: Math.max(1, wrapWidth) },
    });
    object.setScrollFactor(0);
    return object;
  }

  private selectWeapon(instanceId: string): void {
    const slotIndex = this.inventory.snapshot().slots.findIndex(
      (weapon) => weapon?.instanceId === instanceId,
    );
    if (slotIndex >= 0) this.navigator.setIndex(slotIndex);
    this.confirmation = undefined;
    this.notice = undefined;
    const before = this.inventory.snapshot().selectedInstanceIds.join('|');
    const next = this.inventory.toggle(instanceId);
    if (next.selectedInstanceIds.join('|') !== before) {
      this.bus.emit('ui:navigate', {});
    }
    this.requestRender();
  }

  moveFocus(direction: FocusDirection): boolean {
    if (this.disposed || !this.isOpen()) return false;
    const moved = this.navigator.move(direction);
    if (moved) {
      this.applyFocus();
      this.bus.emit('ui:navigate', {});
    }
    return moved;
  }

  confirmFocused(): boolean {
    if (this.disposed || !this.isOpen()) return false;
    return this.focusTargets[this.navigator.index]?.activate() ?? false;
  }

  refreshInputPresentation(): void {
    const mode = this.readInputMode();
    if (mode === this.lastInputMode) return;
    this.lastInputMode = mode;
    this.inputMode = mode;
    if (this.hint) this.hint.setText(this.hintCopy());
    this.applyFocus();
  }

  private registerModalTarget(handle: ModalButtonHandle, index: number): void {
    let armedPointerId: number | undefined;
    handle.target.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
    });
    handle.target.on(Phaser.Input.Events.POINTER_OUT, () => {
      armedPointerId = undefined;
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.applyFocus();
    });
    handle.target.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.disposed && this.isOpen() && this.hasCommittedRoot()) armedPointerId = pointer?.id;
    });
    // A release only commits an arm made by the same pointer inside this target.
    handle.target.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (armedPointerId !== pointer?.id) return;
      armedPointerId = undefined;
      if (this.disposed || !this.isOpen() || !this.hasCommittedRoot()) return;
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
      handle.activate();
    });
    this.focusTargets[index] = {
      target: handle.target,
      activate: handle.activate,
      setFocusVisible: handle.setFocusVisible,
    };
  }

  private registerTarget(
    target: Phaser.GameObjects.Rectangle,
    index: number,
    activate: () => boolean,
    baseColor: number,
    baseAlpha: number,
    edge?: Phaser.GameObjects.Rectangle,
  ): void {
    let armedPointerId: number | undefined;
    const baseWidth = physicalToLogical(2, this.viewport);
    target.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
    });
    target.on(Phaser.Input.Events.POINTER_OUT, () => {
      armedPointerId = undefined;
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.applyFocus();
    });
    target.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.disposed && this.isOpen() && this.hasCommittedRoot()) armedPointerId = pointer?.id;
    });
    target.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (armedPointerId !== pointer?.id) return;
      armedPointerId = undefined;
      if (this.disposed || !this.isOpen() || !this.hasCommittedRoot()) return;
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
      activate();
    });
    this.focusTargets[index] = {
      target,
      activate,
      setFocusVisible: (visible) => (edge ?? target).setStrokeStyle(
        visible ? FocusStroke.width : baseWidth,
        visible ? FocusStroke.color : edge
          ? this.inventory.snapshot().slots[index]?.rarity
            ? ThemeColor.rarity[this.inventory.snapshot().slots[index]!.rarity]
            : baseColor
          : baseColor,
        visible ? FocusStroke.alpha : edge ? 0.95 : baseAlpha,
      ),
    };
  }

  private applyFocus(): void {
    this.focusTargets.forEach((entry, index) => {
      entry?.setFocusVisible(this.inputMode === 'pointer' ? index === this.hoveredIndex : index === this.navigator.index);
    });
  }

  private hintCopy(): string {
    switch (this.readInputMode()) {
      case 'keyboard': return 'Arrows • Enter/Space select • Esc back';
      case 'gamepad': return 'D-pad/stick • Bottom face select • Right face back';
      default: return 'Tap weapons/actions';
    }
  }

  private commitMerge(): void {
    const current = this.inventory.snapshot();
    if (!current.preview) {
      return;
    }
    const result = this.inventory.mergeSelected();
    this.bus.emit('ui:confirm', {});
    if (result.ok) {
      const merged = result.snapshot.weapons.find(
        (weapon) => weapon.instanceId === result.resultInstanceId,
      );
      this.notice = undefined;
      this.confirmation = {
        resultName: merged?.name ?? 'Upgraded weapon',
        occupied: result.snapshot.weapons.length,
        capacity: result.snapshot.capacity,
      };
    } else {
      this.confirmation = undefined;
      this.notice = mergeFailureCopy(result.reason);
    }
    this.requestRender();
  }

  private guideCopy(snapshot: InventorySnapshot, compact: boolean): string {
    if (compact) {
      if (this.confirmation) {
        return 'Weapon active.';
      }
      if (snapshot.preview) {
        return 'Review, then merge.';
      }
      if (snapshot.selectedInstanceIds.length === 1) {
        return 'Choose MATCH.';
      }
      if (snapshot.weapons.length >= snapshot.capacity) {
        return snapshot.mergeReady ? 'FULL — MERGE.' : 'FULL — REWARD WAITS.';
      }
      return snapshot.mergeReady ? 'Merge ready.' : 'Choose weapon.';
    }
    if (this.confirmation) {
      return 'Your upgraded weapon is already active.';
    }
    if (snapshot.preview) {
      return 'Review the upgrade, then merge.';
    }
    if (snapshot.selectedInstanceIds.length === 1) {
      return 'Choose a highlighted match.';
    }
    if (snapshot.weapons.length >= snapshot.capacity) {
      return snapshot.mergeReady
        ? 'Rack full — merge to free a slot.'
        : 'Rack full — a reward waits in the world.';
    }
    return snapshot.mergeReady ? 'A merge is ready.' : 'Choose a weapon to inspect.';
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // The parent's committed-root state gates the shortcuts too: after a
    // failed rebuild the retained isOpen()/panel state is true but there is
    // no usable display to act on (round-2 finding F1).
    if (this.disposed || !this.isOpen() || !this.hasCommittedRoot()) {
      return;
    }
    if (event.repeat) {
      return;
    }
    if (/^[1-6]$/.test(event.key)) {
      const weapon = this.inventory.snapshot().slots[Number(event.key) - 1];
      if (weapon) {
        event.preventDefault();
        this.navigator.setIndex(Number(event.key) - 1);
        this.selectWeapon(weapon.instanceId);
      }
      return;
    }
  }
}

function compactWeaponLabel(family: string): string {
  switch (family) {
    case 'shotgun':
      return 'S-GUN';
    case 'pistol':
      return 'PISTOL';
    case 'smg':
      return 'SMG';
    default:
      return family.slice(0, 6).toUpperCase();
  }
}

function selectionLabel(weapon: InventoryWeaponView): string {
  switch (weapon.selectionState) {
    case 'selected':
      return `PICK ${weapon.selectionOrder ?? ''}`.trim();
    case 'compatible':
      return 'MATCH';
    case 'incompatible':
      return 'NO MATCH';
    case 'merge-ready':
      return 'MERGE';
    case 'neutral':
      return '';
  }
}

function mergeFailureCopy(reason: MergeFailureReason): string {
  switch (reason) {
    case 'run-not-manual-paused':
      return 'Pause the run, then try again.';
    case 'weapon-not-found':
      return 'Choose two matching weapons.';
    case 'same-instance':
      return 'Choose two different weapons.';
    case 'not-mergeable':
      return 'That pair cannot merge. Choose a highlighted match.';
    case 'stale-inventory':
      return 'The rack changed. Choose the pair again.';
  }
}
