import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { Rarity } from '../systems/types';
import type { VisualArtLookup } from '../systems/visualArt';
import {
  InventoryController,
  type InventorySnapshot,
  type InventoryWeaponView,
  type MergeFailureReason,
} from './inventory';
import { physicalToLogical, safeDisplayScale, type UiViewport } from './layout';
import type { ModalTextHelpers } from './modal';
import { ThemeColor, ThemeFont } from './theme';
import { computeWeaponRackLayout } from './weaponRackLayout';

export interface PhaserWeaponRackPanelOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly inventory: InventoryController;
  readonly modal: ModalTextHelpers;
  readonly isOpen: () => boolean;
  readonly onBack: () => boolean;
  readonly requestRender: () => void;
  readonly visualArt?: VisualArtLookup;
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
  private readonly onBack: () => boolean;
  private readonly requestRender: () => void;
  private readonly visualArt?: VisualArtLookup;
  private notice?: string;
  private confirmation?: MergeConfirmation;
  private disposed = false;

  constructor(options: PhaserWeaponRackPanelOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.inventory = options.inventory;
    this.modal = options.modal;
    this.isOpen = options.isOpen;
    this.onBack = options.onBack;
    this.requestRender = options.requestRender;
    this.visualArt = options.visualArt;
    options.scene.input?.keyboard?.on('keydown', this.handleKeyDown, this);
  }

  render(
    root: Phaser.GameObjects.Container,
    snapshot: InventorySnapshot,
    width: number,
  ): void {
    const layout = computeWeaponRackLayout(this.viewport, snapshot.capacity);
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
        'Keys 1–6 • Enter merges',
        'body',
      );
      root.add(keyHint);
      keyHint.setOrigin(0, 0);
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
      this.renderRackSlot(
        root,
        weapon,
        index,
        x,
        y,
        layout.cardWidth,
        layout.cardHeight,
        layout.compact,
      );
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
    this.modal.addButton(
      root,
      layout.mergeAction.x,
      layout.mergeAction.y,
      layout.mergeAction.width,
      mergeLabel,
      () => this.commitMerge(),
      canCommit,
      canCommit,
    );
    this.modal.addButton(
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
  }

  updateLayoutContext(viewport: UiViewport, modal: ModalTextHelpers): void {
    this.viewport = viewport;
    this.modal = modal;
  }

  reset(): void {
    this.notice = undefined;
    this.confirmation = undefined;
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
  ): void {
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
      return;
    }

    const state = weapon.selectionState;
    const fill = state === 'selected'
      ? ThemeColor.cardHover
      : state === 'incompatible'
        ? ThemeColor.surface
        : ThemeColor.card;
    const stroke = state === 'selected'
      ? ThemeColor.gold
      : state === 'compatible'
        ? ThemeColor.primary
        : state === 'merge-ready'
          ? ThemeColor.gold
          : rarityColor(weapon.rarity);
    const alpha = state === 'incompatible' ? 0.48 : 0.94;
    const card = this.scene.add.rectangle(x, y, width, height, fill, alpha);
    root.add(card);
    card.setStrokeStyle(strokeWidth, stroke, state === 'incompatible' ? 0.42 : 0.95);
    card.setInteractive();
    card.on(Phaser.Input.Events.POINTER_UP, () => this.selectWeapon(weapon.instanceId));

    const left = x - width / 2;
    const top = y - height / 2;
    const tier = this.addCardText(
      left + 8,
      top + 7,
      compact ? `${index + 1}·T${weapon.tier}` : `${index + 1} · T${weapon.tier}`,
      'muted',
      width / 2,
    );
    root.add(tier);
    const stateLabel = this.addCardText(
      compact ? x : x + width / 2 - 8,
      compact ? top + physicalToLogical(18, this.viewport) : top + 7,
      selectionLabel(weapon),
      state === 'selected' || state === 'merge-ready' ? 'gold' : 'muted',
      compact ? width - physicalToLogical(4, this.viewport) : width / 2,
      compact ? ThemeFont.labelMin : ThemeFont.bodyMin,
    );
    root.add(stateLabel);
    stateLabel.setOrigin(compact ? 0.5 : 1, 0);
    if (compact) {
      const availableStateWidth = width - physicalToLogical(6, this.viewport);
      if (Number.isFinite(stateLabel.width) && stateLabel.width > availableStateWidth) {
        stateLabel.setScale(availableStateWidth / stateLabel.width, 1);
      }
    }

    if (compact) {
      const dense = height * safeDisplayScale(this.viewport) < 70;
      if (!dense) {
        this.renderWeaponGlyph(
          root,
          weapon.iconId,
          x,
          y + physicalToLogical(5, this.viewport),
          stroke,
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
      return;
    }

    this.renderWeaponGlyph(root, weapon.iconId, left + 28, y + 2, stroke, false);
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
      gold: '#fbbf24',
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
    this.confirmation = undefined;
    this.notice = undefined;
    const before = this.inventory.snapshot().selectedInstanceIds.join('|');
    const next = this.inventory.toggle(instanceId);
    if (next.selectedInstanceIds.join('|') !== before) {
      this.bus.emit('ui:navigate', {});
    }
    this.requestRender();
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
    if (this.disposed || !this.isOpen()) {
      return;
    }
    if (event.repeat) {
      return;
    }
    if (/^[1-6]$/.test(event.key)) {
      const weapon = this.inventory.snapshot().slots[Number(event.key) - 1];
      if (weapon) {
        event.preventDefault();
        this.selectWeapon(weapon.instanceId);
      }
      return;
    }
    if (event.key === 'Enter' && this.inventory.snapshot().preview) {
      event.preventDefault();
      this.commitMerge();
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

function rarityColor(rarity: Rarity): number {
  switch (rarity) {
    case 'uncommon':
      return ThemeColor.primary;
    case 'rare':
      return 0x60a5fa;
    case 'epic':
      return 0xc084fc;
    case 'legendary':
      return ThemeColor.gold;
    case 'common':
      return ThemeColor.muted;
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
