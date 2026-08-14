import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { Rarity } from '../systems/types';
import {
  InventoryController,
  type InventorySnapshot,
  type InventoryWeaponView,
  type MergeFailureReason,
} from './inventory';
import { physicalToLogical, type UiViewport } from './layout';
import type { ModalTextHelpers } from './modal';
import { ThemeColor, ThemeFont } from './theme';

export interface PhaserWeaponRackPanelOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly inventory: InventoryController;
  readonly modal: ModalTextHelpers;
  readonly isOpen: () => boolean;
  readonly onBack: () => boolean;
  readonly requestRender: () => void;
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
  private readonly viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly inventory: InventoryController;
  private readonly modal: ModalTextHelpers;
  private readonly isOpen: () => boolean;
  private readonly onBack: () => boolean;
  private readonly requestRender: () => void;
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
    options.scene.input?.keyboard?.on('keydown', this.handleKeyDown, this);
  }

  render(
    root: Phaser.GameObjects.Container,
    snapshot: InventorySnapshot,
    width: number,
    height: number,
    margin: number,
    hitTarget: number,
  ): void {
    const headingSize = physicalToLogical(ThemeFont.headingMin, this.viewport);
    const labelSize = physicalToLogical(ThemeFont.labelMin, this.viewport);
    const heading = this.modal.addText(margin, margin, 'Weapon Rack', 'heading');
    root.add(heading);
    const count = this.modal.addText(
      width - margin,
      margin + 2,
      `${snapshot.weapons.length}/${snapshot.capacity}`,
      'body',
    );
    root.add(count);
    count.setOrigin(1, 0);

    const guideY = margin + headingSize + 8;
    const guide = this.modal.addText(margin, guideY, this.guideCopy(snapshot), 'body');
    root.add(guide);
    const keyHint = this.modal.addText(
      margin,
      guideY + labelSize + 4,
      'Keys 1–6 • Enter merges',
      'body',
    );
    root.add(keyHint);
    keyHint.setOrigin(0, 0);

    const gridTop = margin + headingSize + labelSize * 2 + 26;
    const gap = physicalToLogical(8, this.viewport);
    const columns = 2;
    const gridWidth = width - margin * 2;
    const cardWidth = (gridWidth - gap * (columns - 1)) / columns;
    const cardHeight = physicalToLogical(106, this.viewport);

    snapshot.slots.forEach((weapon, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + cardWidth / 2 + column * (cardWidth + gap);
      const y = gridTop + cardHeight / 2 + row * (cardHeight + gap);
      this.renderRackSlot(root, weapon, index, x, y, cardWidth, cardHeight);
    });

    const rows = Math.ceil(snapshot.capacity / columns);
    const gridBottom = gridTop + rows * cardHeight + (rows - 1) * gap;
    const actionWidth = width - margin * 2;
    const actionX = width / 2;
    const mergeY = height - margin - hitTarget * 2 - 20;
    const backY = mergeY + hitTarget + 12;
    const previewTop = gridBottom + gap;
    const previewBottom = mergeY - hitTarget / 2 - gap;
    const previewX = margin;
    const previewWidth = width - margin * 2;
    this.renderPreview(
      root,
      snapshot,
      previewX,
      previewTop,
      previewWidth,
      Math.max(1, previewBottom - previewTop),
    );

    const canCommit = snapshot.preview !== undefined;
    const mergeLabel = snapshot.preview
      ? `MERGE → ${snapshot.preview.result.name}`
      : 'SELECT A MATCHING PAIR';
    this.modal.addButton(
      root,
      actionX,
      mergeY,
      actionWidth,
      mergeLabel,
      () => this.commitMerge(),
      canCommit,
      canCommit,
    );
    this.modal.addButton(root, actionX, backY, actionWidth, '< Back', () => {
      if (this.onBack()) {
        this.bus.emit('ui:back', {});
      }
      this.requestRender();
    });
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
  ): void {
    const strokeWidth = physicalToLogical(2, this.viewport);
    if (!weapon) {
      const slot = this.scene.add.rectangle(x, y, width, height, ThemeColor.surface, 0.72);
      root.add(slot);
      slot.setStrokeStyle(strokeWidth, ThemeColor.card, 0.75);
      const empty = this.addCardText(x, y, `${index + 1}  EMPTY SLOT`, 'muted', width - 16);
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
      `${index + 1} · T${weapon.tier}`,
      'muted',
      width / 2,
    );
    root.add(tier);
    const stateLabel = this.addCardText(
      x + width / 2 - 8,
      top + 7,
      selectionLabel(weapon),
      state === 'selected' || state === 'merge-ready' ? 'gold' : 'muted',
      width / 2,
    );
    root.add(stateLabel);
    stateLabel.setOrigin(1, 0);

    this.renderWeaponGlyph(root, weapon.iconId, left + 28, y + 2, stroke);
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
  ): void {
    const unit = physicalToLogical(2, this.viewport);
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

    if (iconId.endsWith(':smg')) {
      addPart(0, 0, 12, 5);
      addPart(8, -1, 7, 2);
      addPart(-8, -1, 5, 3);
      addPart(1, 5, 3, 5);
    } else if (iconId.endsWith(':shotgun')) {
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
      y + inset + physicalToLogical(25, this.viewport),
      preview.result.name,
      'primary',
      width - inset * 2,
    );
    root.add(result);
    preview.deltas.slice(0, 3).forEach((delta, index) => {
      const line = this.addCardText(
        x + inset,
        y + inset + physicalToLogical(53 + index * 21, this.viewport),
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
      fontSize: `${physicalToLogical(ThemeFont.bodyMin, this.viewport)}px`,
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

  private guideCopy(snapshot: InventorySnapshot): string {
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
