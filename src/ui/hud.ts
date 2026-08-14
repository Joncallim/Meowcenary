import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { Player } from '../entities/Player';
import type { RunState, RunStatus } from '../gameplay/runState';
import { WEAPON_RACK_CAPACITY } from '../gameplay/weaponRack';
import type { DataWeaponRegistry } from '../systems/weaponRegistry';
import { formatNumber, formatTime } from './format';
import { physicalToLogical, type UiViewport } from './layout';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';

export interface HudWeaponView {
  readonly instanceId: string;
  readonly name: string;
  readonly tier: number;
}

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
  readonly weapons: readonly HudWeaponView[];
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
      bus.on('weapon:merged', () => this.markDirty()),
      bus.on('weapon:acquired', () => this.markDirty()),
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
    snapshot.weapons.map((weapon) => `${weapon.instanceId}:${weapon.name}:${weapon.tier}`).join(','),
  ].join('|');
}

export interface CreateHudSourceOptions {
  readonly runState: RunState;
  readonly player: Player;
  readonly durationMs: number;
  readonly weaponRegistry: DataWeaponRegistry;
}

export function createHudSource(options: CreateHudSourceOptions): HudSource {
  const { runState, player, durationMs, weaponRegistry } = options;
  return {
    snapshot(): HudSnapshot {
      const weapons = runState.equipped.map((instance) => {
        const def = weaponRegistry.weaponById(instance.defId);
        return Object.freeze({
          instanceId: instance.instanceId,
          name: def?.name ?? instance.defId,
          tier: instance.tier,
        });
      });
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
        weapons,
      };
      return Object.freeze(snapshot);
    },
  };
}

export interface HudViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
}

export class PhaserHudView implements HudView {
  private readonly container: Phaser.GameObjects.Container;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly healthBarFill: Phaser.GameObjects.Rectangle;
  private readonly healthBarWidth: number;
  private readonly healthText: Phaser.GameObjects.Text;
  private readonly xpBarFill: Phaser.GameObjects.Rectangle;
  private readonly xpBarWidth: number;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly scrapText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly weaponText: Phaser.GameObjects.Text;

  constructor(options: HudViewOptions) {
    const { scene, viewport } = options;
    const margin = physicalToLogical(12, viewport);
    const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
    const labelSize = physicalToLogical(ThemeFont.labelMin, viewport);
    const canvasWidth = viewport.canvasWidth;
    const canvasHeight = viewport.canvasHeight;

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

    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(ThemeDepth.hud);

    this.statusText = scene.add.text(margin, margin, '', textStyle);
    this.statusText.setScrollFactor(0);
    this.statusText.setDepth(ThemeDepth.hud);

    this.timeText = scene.add.text(canvasWidth - margin, margin, '', {
      ...textStyle,
      align: 'right',
    });
    this.timeText.setOrigin(1, 0);
    this.timeText.setScrollFactor(0);
    this.timeText.setDepth(ThemeDepth.hud);

    const barTop = margin + fontSize * 1.4;
    const barHeight = physicalToLogical(8, viewport);
    this.healthBarWidth = Math.max(1, canvasWidth - margin * 2);
    const healthBarBg = scene.add.rectangle(
      margin + this.healthBarWidth / 2,
      barTop + barHeight / 2,
      this.healthBarWidth,
      barHeight,
      0x334155,
    );
    healthBarBg.setScrollFactor(0);
    healthBarBg.setDepth(ThemeDepth.hud);
    this.healthBarFill = scene.add.rectangle(
      margin,
      barTop + barHeight / 2,
      this.healthBarWidth,
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
    this.xpBarWidth = Math.max(1, canvasWidth - margin * 2);
    const xpBarBg = scene.add.rectangle(
      margin + this.xpBarWidth / 2,
      xpTop + barHeight / 2,
      this.xpBarWidth,
      barHeight,
      0x334155,
    );
    xpBarBg.setScrollFactor(0);
    xpBarBg.setDepth(ThemeDepth.hud);
    this.xpBarFill = scene.add.rectangle(
      margin,
      xpTop + barHeight / 2,
      this.xpBarWidth,
      barHeight,
      ThemeColor.primary,
    );
    this.xpBarFill.setOrigin(0, 0.5);
    this.xpBarFill.setScrollFactor(0);
    this.xpBarFill.setDepth(ThemeDepth.hud);

    this.levelText = scene.add.text(margin, xpTop + barHeight + physicalToLogical(2, viewport), '', labelStyle);
    this.levelText.setScrollFactor(0);
    this.levelText.setDepth(ThemeDepth.hud);

    this.killsText = scene.add.text(canvasWidth - margin, barTop, '', {
      ...labelStyle,
      align: 'right',
    });
    this.killsText.setOrigin(1, 0);
    this.killsText.setScrollFactor(0);
    this.killsText.setDepth(ThemeDepth.hud);

    this.scrapText = scene.add.text(canvasWidth - margin, barTop + labelSize + physicalToLogical(4, viewport), '', {
      ...labelStyle,
      align: 'right',
    });
    this.scrapText.setOrigin(1, 0);
    this.scrapText.setScrollFactor(0);
    this.scrapText.setDepth(ThemeDepth.hud);

    this.weaponText = scene.add.text(margin, canvasHeight - margin - fontSize, '', textStyle);
    this.weaponText.setScrollFactor(0);
    this.weaponText.setDepth(ThemeDepth.hud);

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
      this.weaponText,
    ]);
  }

  render(snapshot: HudSnapshot): void {
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
    this.weaponText.setText(
      snapshot.weapons.length > 0
        ? `Weapons ${snapshot.weapons.length}/${WEAPON_RACK_CAPACITY}: ${snapshot.weapons.map((weapon) => `T${weapon.tier} ${weapon.name}`).join('  ')}`
        : `Weapons 0/${WEAPON_RACK_CAPACITY}`,
    );
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toUpperCase() + value.slice(1);
}
