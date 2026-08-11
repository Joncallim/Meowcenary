import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { createPool, type Pool } from '../engine/pool';
import { shouldUseHeavyMotion } from '../engine/motion';
import type { Settings } from '../systems/save';
import type { System } from '../engine/system';

export interface FeedbackRenderer {
  projectileHit(x: number, y: number, heavyMotion: boolean): void;
  enemyKilled(x: number, y: number, heavyMotion: boolean): void;
  playerDamaged(heavyMotion: boolean): void;
  levelUp(heavyMotion: boolean): void;
  cancelHeavyMotion(): void;
  update(dtMs: number): void;
  destroy(): void;
  readonly activeEffectCount: number;
  readonly allocatedEffectCount: number;
  readonly droppedEffectCount: number;
}

export interface FeedbackSystemOptions {
  readonly bus: EventBus;
  readonly settings: Settings;
  readonly renderer: FeedbackRenderer;
}

export class FeedbackSystem implements System {
  private readonly renderer: FeedbackRenderer;
  private readonly unsubscribe: Array<() => void> = [];
  private reducedMotion: boolean;

  get activeEffectCount(): number {
    return this.renderer.activeEffectCount;
  }

  get allocatedEffectCount(): number {
    return this.renderer.allocatedEffectCount;
  }

  get droppedEffectCount(): number {
    return this.renderer.droppedEffectCount;
  }

  constructor(options: FeedbackSystemOptions) {
    this.renderer = options.renderer;
    this.reducedMotion = options.settings.reducedMotion;

    this.unsubscribe.push(
      options.bus.on('projectile:hit', ({ x, y }) => {
        this.renderer.projectileHit(x, y, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('enemy:killed', ({ x, y }) => {
        this.renderer.enemyKilled(x, y, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('player:damaged', () => {
        this.renderer.playerDamaged(shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('level:up', () => {
        this.renderer.levelUp(shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('settings:changed', ({ settings }) => {
        const wasReduced = this.reducedMotion;
        this.reducedMotion = settings.reducedMotion;
        if (!wasReduced && this.reducedMotion) {
          this.renderer.cancelHeavyMotion();
        }
      }),
    );
  }

  update(dtMs: number): void {
    this.renderer.update(dtMs);
  }

  destroy(): void {
    for (const off of this.unsubscribe) {
      off();
    }
    this.unsubscribe.length = 0;
    this.renderer.destroy();
  }
}

export interface PhaserFeedbackRendererOptions {
  readonly scene: Phaser.Scene;
  readonly maxEffects: number;
  readonly maxHeavyEffects: number;
}

interface FeedbackDot {
  readonly sprite: Phaser.GameObjects.Arc;
  ageMs: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
  startAlpha: number;
  heavy: boolean;
}

const BURST_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0.7071, y: 0.7071 },
  { x: 0, y: 1 },
  { x: -0.7071, y: 0.7071 },
  { x: -1, y: 0 },
  { x: -0.7071, y: -0.7071 },
  { x: 0, y: -1 },
  { x: 0.7071, y: -0.7071 },
] as const;

const HIT_COLOR = 0xf7f1d5; // cream
const KILL_COLOR = 0x2dd4bf; // teal
const DANGER_COLOR = 0xf87171; // danger red
const FEEDBACK_DEPTH = 60;
const OVERLAY_DEPTH = 90;

export class PhaserFeedbackRenderer implements FeedbackRenderer {
  private readonly scene: Phaser.Scene;
  private readonly maxEffects: number;
  private readonly maxHeavyEffects: number;
  private readonly dotPool: Pool<FeedbackDot>;
  private readonly ownedDots: FeedbackDot[] = [];
  private readonly liveDots = new Set<FeedbackDot>();
  private readonly damageRect: Phaser.GameObjects.Rectangle;
  private readonly levelRect: Phaser.GameObjects.Rectangle;
  private damageTimerMs = 0;
  private levelTimerMs = 0;
  private levelPulseDurationMs = 0;
  private dropped = 0;

  constructor(options: PhaserFeedbackRendererOptions) {
    this.scene = options.scene;
    this.maxEffects = options.maxEffects;
    this.maxHeavyEffects = options.maxHeavyEffects;

    this.dotPool = createPool(
      () => {
        const sprite = this.scene.add.circle(0, 0, 2, HIT_COLOR)
          .setDepth(FEEDBACK_DEPTH)
          .setActive(false)
          .setVisible(false);
        const dot: FeedbackDot = {
          sprite,
          ageMs: 0,
          lifetimeMs: 0,
          vx: 0,
          vy: 0,
          startAlpha: 1,
          heavy: false,
        };
        this.ownedDots.push(dot);
        return dot;
      },
      (dot) => {
        dot.ageMs = 0;
        dot.lifetimeMs = 0;
        dot.vx = 0;
        dot.vy = 0;
        dot.startAlpha = 0;
        dot.heavy = false;
        dot.sprite.setPosition(0, 0);
        dot.sprite.setFillStyle(HIT_COLOR);
        dot.sprite.setActive(false).setVisible(false);
      },
    );

    const { width, height } = this.scene.scale;
    this.damageRect = this.scene.add.rectangle(width / 2, height / 2, width, height, DANGER_COLOR)
      .setAlpha(0)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);
    this.levelRect = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setStrokeStyle(2, KILL_COLOR, 0)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);
  }

  get activeEffectCount(): number {
    return this.liveDots.size;
  }

  get allocatedEffectCount(): number {
    return this.ownedDots.length;
  }

  get droppedEffectCount(): number {
    return this.dropped;
  }

  projectileHit(x: number, y: number, heavyMotion: boolean): void {
    this.spawnStationary(x, y, HIT_COLOR, 4, 80);
    if (!heavyMotion) {
      return;
    }
    for (let i = 0; i < Math.min(3, BURST_DIRECTIONS.length); i += 1) {
      const dir = BURST_DIRECTIONS[i];
      this.spawnMoving(x, y, HIT_COLOR, 2, 90, 120, dir.x, dir.y);
    }
  }

  enemyKilled(x: number, y: number, heavyMotion: boolean): void {
    this.spawnStationary(x, y, KILL_COLOR, 6, 100);
    if (!heavyMotion) {
      return;
    }
    for (let i = 0; i < Math.min(6, BURST_DIRECTIONS.length); i += 1) {
      const dir = BURST_DIRECTIONS[i];
      this.spawnMoving(x, y, KILL_COLOR, 2, 120, 180, dir.x, dir.y);
    }
  }

  playerDamaged(heavyMotion: boolean): void {
    this.damageTimerMs = Math.max(this.damageTimerMs, 120);
    this.damageRect.setAlpha(0.16);
    if (heavyMotion) {
      this.scene.cameras.main.shake(90, 0.0025, true);
    }
  }

  levelUp(heavyMotion: boolean): void {
    const duration = heavyMotion ? 180 : 90;
    this.levelTimerMs = Math.max(this.levelTimerMs, duration);
    this.levelPulseDurationMs = Math.max(this.levelPulseDurationMs, duration);
    const alpha = 0.22;
    this.levelRect.setStrokeStyle(2, KILL_COLOR, alpha);
  }

  cancelHeavyMotion(): void {
    this.scene.cameras.main.shakeEffect.reset();
    for (const dot of [...this.liveDots]) {
      if (dot.heavy) {
        this.releaseDot(dot);
      }
    }
  }

  update(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }

    for (const dot of this.liveDots) {
      dot.ageMs += dtMs;
      if (dot.heavy) {
        dot.sprite.x += dot.vx * (dtMs / 1000);
        dot.sprite.y += dot.vy * (dtMs / 1000);
      }
      const alpha = dot.startAlpha * Math.max(0, 1 - dot.ageMs / dot.lifetimeMs);
      dot.sprite.setAlpha(alpha);
      if (dot.ageMs >= dot.lifetimeMs) {
        this.releaseDot(dot);
      }
    }

    if (this.damageTimerMs > 0) {
      this.damageTimerMs = Math.max(0, this.damageTimerMs - dtMs);
      this.damageRect.setAlpha(0.16 * (this.damageTimerMs / 120));
    }

    if (this.levelTimerMs > 0) {
      this.levelTimerMs = Math.max(0, this.levelTimerMs - dtMs);
      if (this.levelPulseDurationMs > 0) {
        const ratio = this.levelTimerMs / this.levelPulseDurationMs;
        this.levelRect.setStrokeStyle(2, KILL_COLOR, 0.22 * ratio);
        if (this.levelTimerMs <= 0) {
          this.levelPulseDurationMs = 0;
        }
      }
    }
  }

  destroy(): void {
    this.scene.cameras.main.shakeEffect.reset();
    for (const dot of this.ownedDots) {
      dot.sprite.destroy();
    }
    this.ownedDots.length = 0;
    this.liveDots.clear();
    this.damageRect.destroy();
    this.levelRect.destroy();
  }

  private liveHeavyCount(): number {
    let count = 0;
    for (const dot of this.liveDots) {
      if (dot.heavy) count += 1;
    }
    return count;
  }

  private spawnStationary(x: number, y: number, color: number, radius: number, lifetimeMs: number): void {
    if (this.liveDots.size >= this.maxEffects) {
      this.dropped += 1;
      return;
    }
    const dot = this.dotPool.acquire();
    dot.ageMs = 0;
    dot.lifetimeMs = lifetimeMs;
    dot.vx = 0;
    dot.vy = 0;
    dot.startAlpha = color === HIT_COLOR ? 0.90 : 0.85;
    dot.heavy = false;
    dot.sprite.setPosition(x, y);
    dot.sprite.setFillStyle(color);
    dot.sprite.setRadius(radius);
    dot.sprite.setAlpha(dot.startAlpha);
    dot.sprite.setActive(true).setVisible(true);
    this.liveDots.add(dot);
  }

  private spawnMoving(
    x: number,
    y: number,
    color: number,
    radius: number,
    speed: number,
    lifetimeMs: number,
    dirX: number,
    dirY: number,
  ): void {
    if (this.liveDots.size >= this.maxEffects || this.liveHeavyCount() >= this.maxHeavyEffects) {
      this.dropped += 1;
      return;
    }
    const dot = this.dotPool.acquire();
    dot.ageMs = 0;
    dot.lifetimeMs = lifetimeMs;
    dot.vx = dirX * speed;
    dot.vy = dirY * speed;
    dot.startAlpha = 0.85;
    dot.heavy = true;
    dot.sprite.setPosition(x, y);
    dot.sprite.setFillStyle(color);
    dot.sprite.setRadius(radius);
    dot.sprite.setAlpha(dot.startAlpha);
    dot.sprite.setActive(true).setVisible(true);
    this.liveDots.add(dot);
  }

  private releaseDot(dot: FeedbackDot): void {
    if (!this.liveDots.delete(dot)) {
      return;
    }
    this.dotPool.release(dot);
  }
}
