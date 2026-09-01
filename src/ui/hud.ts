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
  readonly durationMs?: number;
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

  /** Request an immediate render for state changes that are owned by the
   * active scene rather than represented by a global gameplay event. */
  requestRender(): void {
    this.markDirty();
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
  readonly durationMs?: number;
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
  // A compact instrument strip: one header, then two labelled meter rows.
  // Labels sit inside their own meters so no text baseline can collide with
  // the next bar on Safari's larger-than-CSS font raster.
  const fontSize = physicalToLogical(11, viewport);
  const labelSize = physicalToLogical(11, viewport);
  const canvasWidth = viewport.canvasWidth;
  // The right edge hosts the shared ability and pause buttons. Bars and run
  // numbers end before that control lane instead of drawing beneath it.
  const controlLane = physicalToLogical(44 * 2 + 10 + 8, viewport);
  const rightHudX = canvasWidth - rightMargin - controlLane;
  const barTop = topMargin + fontSize * 1.25 + physicalToLogical(5, viewport);
  const barHeight = Math.max(physicalToLogical(18, viewport), labelSize * 1.35);
  const healthBarWidth = Math.max(1, rightHudX - margin);
  const xpTop = barTop + barHeight + physicalToLogical(4, viewport);
  const statsTop = xpTop + barHeight + physicalToLogical(5, viewport);
  const statsStride = labelSize + physicalToLogical(3, viewport);
  return {
    margin, topMargin, rightMargin, fontSize, labelSize, canvasWidth, rightHudX,
    barTop, barHeight, healthBarWidth, xpTop, statsTop, statsStride,
  };
}

/** Bottom of the compact run strip. Feedback shares one bounded line so the
 * HUD never grows into the playable surface on portrait phones. */
export function topHudContentBottom(viewport: UiViewport): number {
  const layout = topHudLayout(viewport);
  // Kills and scrap occupy the right-side metric column on separate lines.
  // Reserve the taller column, not only the left-side feedback baseline.
  return layout.statsTop + layout.labelSize * 2.5;
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
  private headerTextWidth = 1;
  private meterTextWidth = 1;
  private headerFontSize = 1;
  private labelFontSize = 1;

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

    this.setContainedText(this.statusText, snapshot.status === 'active' ? 'RUN' : capitalize(snapshot.status), this.headerTextWidth, this.headerFontSize);
    this.setContainedText(this.timeText, snapshot.durationMs === undefined ? formatTime(snapshot.timeMs) : `${formatTime(snapshot.timeMs)} / ${formatTime(snapshot.durationMs)}`, this.headerTextWidth, this.headerFontSize);
    this.setContainedText(this.healthText, `HP ${formatNumber(Math.ceil(safeHealth))}/${formatNumber(Math.ceil(safeMaxHealth))}`, this.meterTextWidth, this.labelFontSize);
    this.setContainedText(this.levelText, `LV ${snapshot.level}  ${formatNumber(Math.floor(safeXp))}/${formatNumber(safeXpToNext)}`, this.meterTextWidth, this.labelFontSize);
    this.setContainedText(this.killsText, `K ${formatNumber(snapshot.kills)}`, this.headerTextWidth, this.labelFontSize);
    this.setContainedText(this.scrapText, `S ${formatNumber(Math.floor(snapshot.currency))}`, this.headerTextWidth, this.labelFontSize);
    const feedback = [snapshot.objective, snapshot.ability, snapshot.achievement].filter(Boolean);
    this.setContainedText(this.objectiveText, truncateHudFeedback(feedback[0]), this.meterTextWidth, this.labelFontSize);

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
      // The HUD is a reserved screen region, not a translucent filter over
      // the arena. An opaque plate makes the playfield begin below the panel
      // and prevents actors/scenery reading as though they are inside it.
      1,
    );
    this.backing.setScrollFactor(0).setDepth(ThemeDepth.hudBacking);

    const textStyle = {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${layout.fontSize}px`,
    };
    this.headerTextWidth = Math.max(1, layout.rightHudX - layout.margin);
    this.meterTextWidth = Math.max(1, layout.healthBarWidth - physicalToLogical(10, viewport));
    this.headerFontSize = layout.fontSize;
    this.labelFontSize = layout.labelSize;

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

    this.healthText = createUiText(scene, layout.margin + physicalToLogical(5, viewport), layout.barTop + layout.barHeight / 2, '', {
      ...labelStyle,
      color: '#f8fafc',
    });
    this.healthText.setOrigin(0, 0.5);
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

    this.levelText = createUiText(scene,layout.margin + physicalToLogical(5, viewport), layout.xpTop + layout.barHeight / 2, '', {
      ...labelStyle,
      color: '#f8fafc',
    });
    this.levelText.setOrigin(0, 0.5);
    this.levelText.setScrollFactor(0);
    this.levelText.setDepth(ThemeDepth.hud);

    this.timeText.setPosition(layout.rightHudX, layout.topMargin);
    this.killsText = createUiText(scene, layout.rightHudX, layout.statsTop, '', {
      ...labelStyle,
      align: 'right',
    });
    this.killsText.setOrigin(1, 0);
    this.killsText.setScrollFactor(0);
    this.killsText.setDepth(ThemeDepth.hud);

    this.scrapText = createUiText(scene, layout.rightHudX, layout.statsTop + layout.labelSize * 1.15, '', {
      ...labelStyle,
      align: 'right',
    });
    this.scrapText.setOrigin(1, 0);
    this.scrapText.setScrollFactor(0);
    this.scrapText.setDepth(ThemeDepth.hud);

    this.objectiveText = createUiText(scene, layout.margin, layout.statsTop, '', {
      ...labelStyle,
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

  private setContainedText(
    text: Phaser.GameObjects.Text,
    value: string,
    width: number,
    fontSize: number,
  ): void {
    let size = fontSize;
    text.setText(value).setFontSize(`${size}px`);
    const minimum = Math.max(1, fontSize * 0.75);
    while (text.width > width && size - 0.25 >= minimum) {
      size -= 0.25;
      text.setFontSize(`${size}px`);
    }
    if (text.width <= width) return;
    let clipped = value;
    while (clipped.length > 1 && text.width > width) {
      clipped = clipped.slice(0, -1).trimEnd();
      text.setText(`${clipped}…`);
    }
  }


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

function truncateHudFeedback(value: string | undefined): string {
  if (!value) return '';
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length <= 44 ? singleLine : `${singleLine.slice(0, 43).trimEnd()}…`;
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1);
}
