import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { Player } from '../entities/Player';

import type { RunState, RunStatus } from '../gameplay/runState';

import { formatNumber, formatTime } from './format';
import { edgeMargin, logicalCanvasViewport, physicalToLogical, zoomedGameUiViewport, type UiViewport } from './layout';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';
import { createUiText } from './text';

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
  readonly objective?: string;
  /** Shared ability action feedback; game input, controller and touch all
   * read the same authoritative ability state. */
  readonly ability?: string;
  readonly achievement?: string;
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
      bus.on('achievement:completed', () => this.markDirty()),

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
    snapshot.objective ?? '',
    snapshot.ability ?? '',
    snapshot.achievement ?? '',

  ].join('|');
}

export interface CreateHudSourceOptions {
  readonly runState: RunState;
  readonly player: Player;
  readonly durationMs: number;
  readonly objective?: () => string | undefined;
  readonly ability?: () => string | undefined;
  readonly achievement?: () => string | undefined;
}

export function createHudSource(options: CreateHudSourceOptions): HudSource {
  const { runState, player, durationMs, objective, ability, achievement } = options;
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
        ...(objective?.() ? { objective: objective() } : {}),
        ...(ability?.() ? { ability: ability() } : {}),
        ...(achievement?.() ? { achievement: achievement() } : {}),
      };
      return Object.freeze(snapshot);
    },
  };
}

export interface HudViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
}

interface TopHudLayout {
  readonly margin: number;
  readonly topMargin: number;
  readonly rightMargin: number;
  readonly fontSize: number;
  readonly labelSize: number;
  readonly canvasWidth: number;
  readonly rightHudX: number;
  readonly barTop: number;
  readonly barHeight: number;
  readonly healthBarWidth: number;
  readonly xpTop: number;
  readonly statsTop: number;
  readonly statsStride: number;
}

function topHudLayout(viewport: UiViewport): TopHudLayout {
  const margin = edgeMargin(viewport, 'left');
  const topMargin = edgeMargin(viewport, 'top');
  const rightMargin = edgeMargin(viewport, 'right');
  const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
  const labelSize = physicalToLogical(ThemeFont.labelMin, viewport);
  const canvasWidth = viewport.canvasWidth;
  const rightHudX = canvasWidth - rightMargin - physicalToLogical(44, viewport) - physicalToLogical(8, viewport);
  const barTop = topMargin + fontSize * 1.4;
  const barHeight = physicalToLogical(8, viewport);
  const healthBarWidth = Math.max(1, rightHudX - margin);
  const xpTop = barTop + barHeight + labelSize + physicalToLogical(8, viewport);
  const statsTop = xpTop + barHeight + physicalToLogical(2, viewport) + labelSize + physicalToLogical(8, viewport);
  const statsStride = labelSize + physicalToLogical(4, viewport);
  return {
    margin, topMargin, rightMargin, fontSize, labelSize, canvasWidth, rightHudX,
    barTop, barHeight, healthBarWidth, xpTop, statsTop, statsStride,
  };
}

/** Bottom of the rendered stats stack plus the three independent feedback
 * rows (objective, active ability state, achievement). */
export function topHudContentBottom(viewport: UiViewport): number {
  const layout = topHudLayout(viewport);
  const renderedLabelRow = layout.labelSize * 1.25;
  // Portrait needs independent, readable feedback rows. Landscape has less
  // than half as much vertical playfield, so it deliberately retains the
  // compact one-line summary instead of allowing the HUD plate into play.
  const feedbackRows = (viewport.containerHeight ?? viewport.displayHeight)
    > (viewport.containerWidth ?? viewport.displayWidth) ? 3 : 1;
  return layout.statsTop + layout.statsStride * (2 + feedbackRows) + renderedLabelRow;
}

export class PhaserHudView implements HudView {
  private readonly scene: Phaser.Scene;
  private viewport: UiViewport;
  private backing!: Phaser.GameObjects.Rectangle;
  private container!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;

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
    const feedback = [snapshot.objective, snapshot.ability, snapshot.achievement].filter(Boolean);
    const portraitFeedback = (this.viewport?.containerHeight ?? this.viewport?.displayHeight ?? this.scene.scale.displaySize.height)
      > (this.viewport?.containerWidth ?? this.viewport?.displayWidth ?? this.scene.scale.displaySize.width);
    this.objectiveText.setText(feedback.join(portraitFeedback ? '\n' : '  •  '));

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
    const layout = topHudLayout(viewport);
    const backingHeight = topHudContentBottom(viewport) + edgeMargin(viewport, 'bottom');
    this.backing = scene.add.rectangle(
      (viewport.originX ?? 0) + layout.canvasWidth / 2,
      (viewport.originY ?? 0) + backingHeight / 2,
      layout.canvasWidth,
      backingHeight,
      ThemeColor.surface,
      0.80,
    );
    this.backing.setScrollFactor(0).setDepth(ThemeDepth.hudBacking);

    const textStyle = {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${layout.fontSize}px`,
    };

    const labelStyle = {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${layout.labelSize}px`,
    };

    this.container = scene.add.container(viewport.originX ?? 0, viewport.originY ?? 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(ThemeDepth.hud);

    this.statusText = createUiText(scene,layout.margin, layout.topMargin, '', textStyle);
    this.statusText.setScrollFactor(0);
    this.statusText.setDepth(ThemeDepth.hud);

    this.timeText = createUiText(scene,layout.rightHudX, 0, '', {
      ...textStyle,
      align: 'right',
    });
    this.timeText.setOrigin(1, 0);
    this.timeText.setScrollFactor(0);
    this.timeText.setDepth(ThemeDepth.hud);

    const healthBarBg = scene.add.rectangle(
      layout.margin + layout.healthBarWidth / 2,
      layout.barTop + layout.barHeight / 2,
      layout.healthBarWidth,
      layout.barHeight,
      0x334155,
    );
    healthBarBg.setScrollFactor(0);
    healthBarBg.setDepth(ThemeDepth.hud);
    this.healthBarFill = scene.add.rectangle(
      layout.margin,
      layout.barTop + layout.barHeight / 2,
      layout.healthBarWidth,
      layout.barHeight,
      ThemeColor.danger,
    );
    this.healthBarFill.setOrigin(0, 0.5);
    this.healthBarFill.setScrollFactor(0);
    this.healthBarFill.setDepth(ThemeDepth.hud);

    this.healthText = createUiText(scene,layout.margin, layout.barTop + layout.barHeight + physicalToLogical(2, viewport), '', labelStyle);
    this.healthText.setScrollFactor(0);
    this.healthText.setDepth(ThemeDepth.hud);

    const xpBarBg = scene.add.rectangle(
      layout.margin + layout.healthBarWidth / 2,
      layout.xpTop + layout.barHeight / 2,
      layout.healthBarWidth,
      layout.barHeight,
      0x334155,
    );
    xpBarBg.setScrollFactor(0);
    xpBarBg.setDepth(ThemeDepth.hud);
    this.xpBarFill = scene.add.rectangle(
      layout.margin,
      layout.xpTop + layout.barHeight / 2,
      layout.healthBarWidth,
      layout.barHeight,
      ThemeColor.primary,
    );
    this.xpBarFill.setOrigin(0, 0.5);
    this.xpBarFill.setScrollFactor(0);
    this.xpBarFill.setDepth(ThemeDepth.hud);

    this.levelText = createUiText(scene,layout.margin, layout.xpTop + layout.barHeight + physicalToLogical(2, viewport), '', labelStyle);
    this.levelText.setScrollFactor(0);
    this.levelText.setDepth(ThemeDepth.hud);

    this.timeText.setPosition(layout.rightHudX, layout.statsTop);
    this.killsText = createUiText(scene,layout.rightHudX, layout.statsTop + layout.statsStride, '', {
      ...labelStyle,
      align: 'right',
    });
    this.killsText.setOrigin(1, 0);
    this.killsText.setScrollFactor(0);
    this.killsText.setDepth(ThemeDepth.hud);

    this.scrapText = createUiText(scene,layout.rightHudX, layout.statsTop + layout.statsStride * 2, '', {
      ...labelStyle,
      align: 'right',
    });
    this.scrapText.setOrigin(1, 0);
    this.scrapText.setScrollFactor(0);
    this.scrapText.setDepth(ThemeDepth.hud);

    this.objectiveText = createUiText(scene, layout.margin, layout.statsTop + layout.statsStride * 3, '', {
      ...labelStyle,
      wordWrap: { width: layout.healthBarWidth },
    });
    this.objectiveText.setScrollFactor(0);
    this.objectiveText.setDepth(ThemeDepth.hud);



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
      this.objectiveText,

    ]);
  }

  private destroyDisplay(): void {
    this.backing.destroy();
    this.container.destroy(true);
  }

  private readonly handleScaleChange = (): void => {
    if (this.disposed) {
      return;
    }
    const scale = this.scene.scale;
    const next: UiViewport = this.viewport.originX === undefined
      ? logicalCanvasViewport(scale.displaySize.width, scale.displaySize.height, scale.parentSize.width, scale.parentSize.height)
      : zoomedGameUiViewport(scale.displaySize.width, scale.displaySize.height, scale.parentSize.width, scale.parentSize.height);
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

function sameViewport(a: UiViewport, b: UiViewport): boolean {
  return a.canvasWidth === b.canvasWidth
    && a.canvasHeight === b.canvasHeight
    && a.displayWidth === b.displayWidth
    && a.displayHeight === b.displayHeight
    && a.containerWidth === b.containerWidth
    && a.containerHeight === b.containerHeight
    && a.layoutInsets.top === b.layoutInsets.top
    && a.layoutInsets.right === b.layoutInsets.right
    && a.layoutInsets.bottom === b.layoutInsets.bottom
    && a.layoutInsets.left === b.layoutInsets.left;
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1);
}
