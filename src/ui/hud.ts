import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { Player } from '../entities/Player';

import type { RunState, RunStatus } from '../gameplay/runState';

import { formatNumber, formatTime } from './format';
import { physicalToLogical, type UiViewport } from './layout';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';

/** @deprecated HUD no longer renders the rack strip; retained for old fixtures. */
export interface HudWeaponView { readonly instanceId: string; readonly name: string; readonly tier: number; }


export interface HudSnapshot {
  readonly status: RunStatus;
  readonly timeMs: number;
  readonly durationMs: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly kills: number;
  readonly currency: number;
  /** @deprecated ignored by HUD after rack strip removal. */
  readonly weapons: readonly HudWeaponView[];
  /** @deprecated ignored by HUD after rack strip removal. */
  readonly mergeReady: boolean;

}

export interface HudSource {
  snapshot(): HudSnapshot;
}

export interface HudView {
  render(snapshot: HudSnapshot): void;
  destroy(): void;
}

export class HudController implements System {
  private dirty = true;
  private lastRenderKey = '';
  private lastWholeSecond = -1;
  private disposed = false;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    bus: EventBus,
    private readonly source: HudSource,
    private readonly view: HudView,
  ) {
    this.unsubscribers.push(
      bus.on('player:damaged', () => this.markDirty()),
      bus.on('xp:gained', () => this.markDirty()),
      bus.on('level:up', () => this.markDirty()),
      bus.on('currency:changed', () => this.markDirty()),

      bus.on('run:paused', () => this.markDirty()),
      bus.on('run:resumed', () => this.markDirty()),
      bus.on('run:won', () => this.markDirty()),
      bus.on('run:lost', () => this.markDirty()),
    );
  }

  update(_dtMs: number): void {
    if (this.disposed) {
      return;
    }

    const snapshot = this.source.snapshot();
    const wholeSecond = Math.floor(snapshot.timeMs / 1000);
    if (wholeSecond !== this.lastWholeSecond) {
      this.markDirty();
      this.lastWholeSecond = wholeSecond;
    }

    if (!this.dirty) {
      return;
    }

    const renderKey = buildRenderKey(snapshot);
    if (renderKey === this.lastRenderKey) {
      this.dirty = false;
      return;
    }

    this.view.render(snapshot);
    this.lastRenderKey = renderKey;
    this.dirty = false;
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.length = 0;
    this.view.destroy();
  }

  private markDirty(): void {
    this.dirty = true;
  }
}

function buildRenderKey(snapshot: HudSnapshot): string {
  return [
    snapshot.status,
    Math.floor(snapshot.timeMs / 1000),
    snapshot.health.toFixed(2),
    snapshot.maxHealth.toFixed(2),
    snapshot.level,
    snapshot.xp.toFixed(2),
    snapshot.xpToNext,
    snapshot.kills,
    snapshot.currency.toFixed(2),

  ].join('|');
}

export interface CreateHudSourceOptions {
  readonly runState: RunState;
  readonly player: Player;
  readonly durationMs: number;
  /** @deprecated no longer consumed by HUD. */
  readonly weaponRegistry?: unknown;

}

export function createHudSource(options: CreateHudSourceOptions): HudSource {
  const { runState, player, durationMs } = options;
  return {
    snapshot(): HudSnapshot {

      const snapshot: HudSnapshot = {
        status: runState.status,
        timeMs: runState.timeMs,
        durationMs,
        health: player.health,
        maxHealth: player.maxHealth,
        level: runState.level,
        xp: runState.xp,
        xpToNext: runState.xpToNext,
        kills: runState.kills,
        currency: runState.currency,
        // Kept empty/false for compatibility with old test fixtures; rendering
        // no longer reads these fields and the HUD has no rack strip.
        weapons: [],
        mergeReady: false,
      };
      return Object.freeze(snapshot);
    },
  };
}

export interface HudViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  /** @deprecated callback intentionally unused after rack strip removal. */
  readonly onInventoryRequested?: () => void;

}

export class PhaserHudView implements HudView {
  private readonly scene: Phaser.Scene;
  private viewport: UiViewport;
  private container!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;

  private lastSnapshot?: HudSnapshot;
  private disposed = false;

  constructor(options: HudViewOptions) {
    this.scene = options.scene;
    this.viewport = options.viewport;

    this.buildDisplay();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
  }

  render(snapshot: HudSnapshot): void {
    if (this.disposed) {
      return;
    }
    this.lastSnapshot = snapshot;
    const safeHealth = Math.max(0, Number.isFinite(snapshot.health) ? snapshot.health : 0);
    const safeMaxHealth = Math.max(1, Number.isFinite(snapshot.maxHealth) ? snapshot.maxHealth : 1);
    const healthRatio = Math.min(1, safeHealth / safeMaxHealth);
    this.healthBarFill.setScale(healthRatio, 1);

    const safeXp = Math.max(0, Number.isFinite(snapshot.xp) ? snapshot.xp : 0);
    const safeXpToNext = Math.max(1, Number.isFinite(snapshot.xpToNext) ? snapshot.xpToNext : 1);
    const xpRatio = Math.min(1, safeXp / safeXpToNext);
    this.xpBarFill.setScale(xpRatio, 1);

    this.statusText.setText(capitalize(snapshot.status));
    this.timeText.setText(`${formatTime(snapshot.timeMs)} / ${formatTime(snapshot.durationMs)}`);
    this.healthText.setText(
      `Health ${formatNumber(Math.ceil(safeHealth))} / ${formatNumber(Math.ceil(safeMaxHealth))}`,
    );
    this.levelText.setText(`Level ${snapshot.level}`);
    this.killsText.setText(`Kills ${formatNumber(snapshot.kills)}`);
    this.scrapText.setText(`Scrap ${formatNumber(Math.floor(snapshot.currency))}`);

  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    this.destroyDisplay();
  }

  private buildDisplay(): void {
    const { scene, viewport } = this;
    const margin = physicalToLogical(12, viewport);
    const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
    const labelSize = physicalToLogical(ThemeFont.labelMin, viewport);
    const canvasWidth = viewport.canvasWidth;

    const textStyle = {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${fontSize}px`,
    };

    const labelStyle = {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${labelSize}px`,
    };

    this.container = scene.add.container(viewport.originX ?? 0, viewport.originY ?? 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(ThemeDepth.hud);

    this.statusText = scene.add.text(margin, margin, '', textStyle);
    this.statusText.setScrollFactor(0);
    this.statusText.setDepth(ThemeDepth.hud);

    const rightHudX = canvasWidth - margin - physicalToLogical(44, viewport) - physicalToLogical(8, viewport);
    this.timeText = scene.add.text(rightHudX, margin, '', {
      ...textStyle,
      align: 'right',
    });
    this.timeText.setOrigin(1, 0);
    this.timeText.setScrollFactor(0);
    this.timeText.setDepth(ThemeDepth.hud);

    const barTop = margin + fontSize * 1.4;
    const barHeight = physicalToLogical(8, viewport);
    const healthBarWidth = Math.max(1, rightHudX - margin);
    const healthBarBg = scene.add.rectangle(
      margin + healthBarWidth / 2,
      barTop + barHeight / 2,
      healthBarWidth,
      barHeight,
      0x334155,
    );
    healthBarBg.setScrollFactor(0);
    healthBarBg.setDepth(ThemeDepth.hud);
    this.healthBarFill = scene.add.rectangle(
      margin,
      barTop + barHeight / 2,
      healthBarWidth,
      barHeight,
      ThemeColor.danger,
    );
    this.healthBarFill.setOrigin(0, 0.5);
    this.healthBarFill.setScrollFactor(0);
    this.healthBarFill.setDepth(ThemeDepth.hud);

    this.healthText = scene.add.text(margin, barTop + barHeight + physicalToLogical(2, viewport), '', labelStyle);
    this.healthText.setScrollFactor(0);
    this.healthText.setDepth(ThemeDepth.hud);

    const xpTop = barTop + barHeight + labelSize + physicalToLogical(8, viewport);
    const xpBarWidth = Math.max(1, canvasWidth - margin * 2);
    const xpBarBg = scene.add.rectangle(
      margin + xpBarWidth / 2,
      xpTop + barHeight / 2,
      xpBarWidth,
      barHeight,
      0x334155,
    );
    xpBarBg.setScrollFactor(0);
    xpBarBg.setDepth(ThemeDepth.hud);
    this.xpBarFill = scene.add.rectangle(
      margin,
      xpTop + barHeight / 2,
      xpBarWidth,
      barHeight,
      ThemeColor.primary,
    );
    this.xpBarFill.setOrigin(0, 0.5);
    this.xpBarFill.setScrollFactor(0);
    this.xpBarFill.setDepth(ThemeDepth.hud);

    this.levelText = scene.add.text(margin, xpTop + barHeight + physicalToLogical(2, viewport), '', labelStyle);
    this.levelText.setScrollFactor(0);
    this.levelText.setDepth(ThemeDepth.hud);

    this.killsText = scene.add.text(rightHudX, barTop, '', {
      ...labelStyle,
      align: 'right',
    });
    this.killsText.setOrigin(1, 0);
    this.killsText.setScrollFactor(0);
    this.killsText.setDepth(ThemeDepth.hud);

    this.scrapText = scene.add.text(rightHudX, barTop + labelSize + physicalToLogical(4, viewport), '', {
      ...labelStyle,
      align: 'right',
    });
    this.scrapText.setOrigin(1, 0);
    this.scrapText.setScrollFactor(0);
    this.scrapText.setDepth(ThemeDepth.hud);



    this.container.add([
      this.statusText,
      this.timeText,
      healthBarBg,
      this.healthBarFill,
      this.healthText,
      xpBarBg,
      this.xpBarFill,
      this.levelText,
      this.killsText,
      this.scrapText,

    ]);
  }

  private destroyDisplay(): void {

    this.container.destroy(true);
  }

  private readonly handleScaleChange = (): void => {
    if (this.disposed) {
      return;
    }
    const scale = this.scene.scale;
    const next: UiViewport = {
      canvasWidth: positiveFinite(scale.width, this.viewport.canvasWidth),
      canvasHeight: positiveFinite(scale.height, this.viewport.canvasHeight),
      displayWidth: positiveFinite(scale.displaySize.width, this.viewport.displayWidth),
      displayHeight: positiveFinite(scale.displaySize.height, this.viewport.displayHeight),
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

    this.destroyDisplay();
    this.viewport = next;
    this.buildDisplay();
    if (this.lastSnapshot) {
      this.render(this.lastSnapshot);
    }
  };


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

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1);
}
