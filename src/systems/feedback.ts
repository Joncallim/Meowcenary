import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { createPool, type Pool } from '../engine/pool';
import { shouldUseHeavyMotion } from '../engine/motion';
import type { Settings } from '../systems/save';
import type { System } from '../engine/system';
import { weaponFeelByFamily, type WeaponFeelDefinition } from './types';
import type { UiViewport } from '../ui/layout';

export interface FeedbackRenderer {
  /** Epic 17: family-keyed muzzle puff. Unknown/missing family draws nothing
   *  rather than guessing a color — validation guarantees every weapon
   *  family used in weapons.json has a weapon-feel entry, so "unknown" only
   *  happens in isolated-unit-test harnesses that skip the real catalog. */
  muzzleFlash(x: number, y: number, family: string): void;
  projectileHit(x: number, y: number, family: string, heavyMotion: boolean): void;
  enemyKilled(x: number, y: number, heavyMotion: boolean): void;
  /** Epic 17 (D7): amount scales the heavy-motion shake weight so a Trash
   *  Brute hit reads as heavier than a Dust Mite's — light/no-shake
   *  behavior under reduced motion is unchanged. */
  playerDamaged(amount: number, heavyMotion: boolean): void;
  levelUp(heavyMotion: boolean): void;
  /** Visible acknowledgement for a committed upgrade card. */
  upgradeChosen(heavyMotion: boolean): void;
  /** Epic 17: tier-up moment on a rack merge. Screen-space like levelUp
   *  (merges happen from a paused menu, not a world position) — toTier
   *  scales intensity so higher tiers read as more significant. */
  weaponMerged(toTier: number, heavyMotion: boolean): void;
  /** Epic 17 (D7): pooled, heavy-gated motion trail on a charger's dash. */
  enemyDashed(x: number, y: number, dirX: number, dirY: number, heavyMotion: boolean): void;
  /** Epic 17 (D7): Trash Brute's periodic landing pulse while pursuing. */
  enemyHeavyStep(x: number, y: number, heavyMotion: boolean): void;
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
      options.bus.on('weapon:fired', ({ x, y, family }) => {
        this.renderer.muzzleFlash(x, y, family);
      }),
      options.bus.on('projectile:hit', ({ x, y, family }) => {
        this.renderer.projectileHit(x, y, family, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('enemy:killed', ({ x, y }) => {
        this.renderer.enemyKilled(x, y, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('player:damaged', ({ amount }) => {
        this.renderer.playerDamaged(amount, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('level:up', () => {
        this.renderer.levelUp(shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('card:chosen', () => {
        this.renderer.upgradeChosen(shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('weapon:merged', ({ toTier }) => {
        this.renderer.weaponMerged(toTier, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('enemy:dashed', ({ x, y, dirX, dirY }) => {
        this.renderer.enemyDashed(x, y, dirX, dirY, shouldUseHeavyMotion(this.reducedMotion));
      }),
      options.bus.on('enemy:heavyStep', ({ x, y }) => {
        this.renderer.enemyHeavyStep(x, y, shouldUseHeavyMotion(this.reducedMotion));
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
  /** Epic 17: presentation-only family colors/sizes for muzzle/impact cues. */
  readonly weaponFeel?: readonly WeaponFeelDefinition[];
  /** Zoomed GameScene viewport for screen feedback overlays. */
  readonly viewport?: UiViewport;
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
const MERGE_COLOR = 0xfacc15; // amber power-up, distinct from kill/danger
const DASH_TRAIL_COLOR = 0xd6d3d1; // kicked-up junkyard dust
const HEAVY_STEP_COLOR = 0x92613a; // scrap-dust thud, distinct from dash trail
const FEEDBACK_DEPTH = 60;
const OVERLAY_DEPTH = 90;
const MUZZLE_HIT_RADIUS_FALLBACK = 4;

// Epic 17 (D7): a charger's dash trail is a fixed, staggered comet-tail —
// speed/lifetime vary per ghost so they recede rather than overlap. All
// spawn from the same origin, so a single event drives the whole cue.
const DASH_TRAIL_STEPS = [
  { speed: 60, lifetimeMs: 120 },
  { speed: 40, lifetimeMs: 160 },
  { speed: 24, lifetimeMs: 200 },
] as const;

function hexToColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Weapons only merge to tier 2 or 3 (mergeTier is always >= 2 for a merge
 *  result), but clamp defensively so a future tier range never produces a
 *  negative or runaway pulse. */
function clampMergeTier(tier: number): number {
  return Math.min(3, Math.max(1, Math.round(tier)));
}

// Epic 17 (D7): player:damaged shake scales from this dust-mite-sized
// baseline so a Trash Brute's 14-damage contact hit reads as heavier than a
// dust mite's 5 — bounded so cheats/environmental spikes never run away.
const DAMAGE_SHAKE_REFERENCE_AMOUNT = 5;
const DAMAGE_SHAKE_BASE_INTENSITY = 0.0025;
const DAMAGE_SHAKE_BASE_DURATION_MS = 90;
const DAMAGE_SHAKE_INTENSITY_PER_POINT = 0.00025;
const DAMAGE_SHAKE_DURATION_PER_POINT_MS = 4;
const DAMAGE_SHAKE_MAX_INTENSITY = 0.006;
const DAMAGE_SHAKE_MAX_DURATION_MS = 160;

function damageShakeIntensity(amount: number): number {
  const extra = Math.max(0, amount - DAMAGE_SHAKE_REFERENCE_AMOUNT) * DAMAGE_SHAKE_INTENSITY_PER_POINT;
  return Math.min(DAMAGE_SHAKE_MAX_INTENSITY, DAMAGE_SHAKE_BASE_INTENSITY + extra);
}

function damageShakeDurationMs(amount: number): number {
  const extra = Math.max(0, amount - DAMAGE_SHAKE_REFERENCE_AMOUNT) * DAMAGE_SHAKE_DURATION_PER_POINT_MS;
  return Math.min(DAMAGE_SHAKE_MAX_DURATION_MS, DAMAGE_SHAKE_BASE_DURATION_MS + extra);
}

interface PresentationColors {
  readonly muzzleColor: number;
  readonly impactColor: number;
}

export class PhaserFeedbackRenderer implements FeedbackRenderer {
  private readonly scene: Phaser.Scene;
  private readonly maxEffects: number;
  private readonly maxHeavyEffects: number;
  private readonly weaponFeelByFamily: ReadonlyMap<string, WeaponFeelDefinition>;
  // Precomputed once per family rather than re-parsing the hex string on
  // every muzzleFlash/projectileHit call — a hot path at high fire rates.
  private readonly presentationColorsByFamily: ReadonlyMap<string, PresentationColors>;
  private readonly dotPool: Pool<FeedbackDot>;
  private readonly ownedDots: FeedbackDot[] = [];
  private readonly liveDots = new Set<FeedbackDot>();
  private readonly damageRect: Phaser.GameObjects.Rectangle;
  private readonly levelRect: Phaser.GameObjects.Rectangle;
  private readonly mergeRect: Phaser.GameObjects.Rectangle;
  private damageTimerMs = 0;
  private levelTimerMs = 0;
  private levelPulseDurationMs = 0;
  private mergeTimerMs = 0;
  private mergePulseDurationMs = 0;
  private mergePeakAlpha = 0;
  private dropped = 0;

  constructor(options: PhaserFeedbackRendererOptions) {
    this.scene = options.scene;
    this.maxEffects = options.maxEffects;
    this.maxHeavyEffects = options.maxHeavyEffects;
    this.weaponFeelByFamily = weaponFeelByFamily(options.weaponFeel ?? []);
    this.presentationColorsByFamily = new Map(
      [...this.weaponFeelByFamily].map(([family, feel]) => [
        family,
        { muzzleColor: hexToColor(feel.muzzle.color), impactColor: hexToColor(feel.impact.color) },
      ]),
    );

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

    const viewport = options.viewport;
    const width = viewport?.canvasWidth ?? this.scene.scale.width;
    const height = viewport?.canvasHeight ?? this.scene.scale.height;
    const x = (viewport?.originX ?? 0) + width / 2;
    const y = (viewport?.originY ?? 0) + height / 2;
    this.damageRect = this.scene.add.rectangle(x, y, width, height, DANGER_COLOR)
      .setAlpha(0)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);
    this.levelRect = this.scene.add.rectangle(x, y, width, height, 0x000000, 0)
      .setStrokeStyle(2, KILL_COLOR, 0)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);
    this.mergeRect = this.scene.add.rectangle(x, y, width, height, 0x000000, 0)
      .setStrokeStyle(3, MERGE_COLOR, 0)
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

  muzzleFlash(x: number, y: number, family: string): void {
    const feel = this.weaponFeelByFamily.get(family);
    if (!feel) return;
    // presentationColorsByFamily is built from the same keys as
    // weaponFeelByFamily in the constructor, so a hit here always resolves.
    const colors = this.presentationColorsByFamily.get(family)!;
    this.spawnStationary(x, y, colors.muzzleColor, feel.muzzle.radius, feel.muzzle.lifetimeMs);
  }

  projectileHit(x: number, y: number, family: string, heavyMotion: boolean): void {
    const feel = this.weaponFeelByFamily.get(family);
    const color = feel ? this.presentationColorsByFamily.get(family)!.impactColor : HIT_COLOR;
    const radius = feel ? feel.impact.radius : MUZZLE_HIT_RADIUS_FALLBACK;
    this.spawnStationary(x, y, color, radius, 80);
    if (!heavyMotion) {
      return;
    }
    for (let i = 0; i < Math.min(3, BURST_DIRECTIONS.length); i += 1) {
      const dir = BURST_DIRECTIONS[i];
      this.spawnMoving(x, y, color, 2, 90, 120, dir.x, dir.y);
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

  playerDamaged(amount: number, heavyMotion: boolean): void {
    this.damageTimerMs = Math.max(this.damageTimerMs, 120);
    this.damageRect.setAlpha(0.16);
    if (heavyMotion) {
      this.scene.cameras.main.shake(damageShakeDurationMs(amount), damageShakeIntensity(amount), true);
    }
  }

  levelUp(heavyMotion: boolean): void {
    const duration = heavyMotion ? 180 : 90;
    this.levelTimerMs = Math.max(this.levelTimerMs, duration);
    this.levelPulseDurationMs = Math.max(this.levelPulseDurationMs, duration);
    const alpha = 0.22;
    this.levelRect.setStrokeStyle(2, KILL_COLOR, alpha);
  }

  upgradeChosen(heavyMotion: boolean): void {
    this.levelUp(heavyMotion);
  }

  weaponMerged(toTier: number, heavyMotion: boolean): void {
    const tier = clampMergeTier(toTier);
    const baseDuration = heavyMotion ? 220 : 110;
    const duration = baseDuration + (tier - 1) * 40;
    this.mergeTimerMs = Math.max(this.mergeTimerMs, duration);
    this.mergePulseDurationMs = Math.max(this.mergePulseDurationMs, duration);
    const alpha = 0.28 + (tier - 1) * 0.06;
    this.mergePeakAlpha = Math.max(this.mergePeakAlpha, alpha);
    this.mergeRect.setStrokeStyle(3, MERGE_COLOR, this.mergePeakAlpha);
  }

  enemyDashed(x: number, y: number, dirX: number, dirY: number, heavyMotion: boolean): void {
    if (!heavyMotion) {
      return;
    }
    const behindX = -dirX;
    const behindY = -dirY;
    for (const step of DASH_TRAIL_STEPS) {
      this.spawnMoving(x, y, DASH_TRAIL_COLOR, 3, step.speed, step.lifetimeMs, behindX, behindY);
    }
  }

  enemyHeavyStep(x: number, y: number, heavyMotion: boolean): void {
    if (!heavyMotion) {
      return;
    }
    // heavy: true — this cue only ever spawns under heavy motion, so it must
    // count against maxHeavyEffects and retract immediately via
    // cancelHeavyMotion() when reduced motion is toggled on mid-run, exactly
    // like the dash trail's spawnMoving dots.
    this.spawnStationary(x, y, HEAVY_STEP_COLOR, 7, 220, true);
  }

  cancelHeavyMotion(): void {
    this.scene.cameras?.main?.shakeEffect?.reset();
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

    if (this.mergeTimerMs > 0) {
      this.mergeTimerMs = Math.max(0, this.mergeTimerMs - dtMs);
      if (this.mergePulseDurationMs > 0) {
        const ratio = this.mergeTimerMs / this.mergePulseDurationMs;
        this.mergeRect.setStrokeStyle(3, MERGE_COLOR, this.mergePeakAlpha * ratio);
        if (this.mergeTimerMs <= 0) {
          this.mergePulseDurationMs = 0;
          this.mergePeakAlpha = 0;
        }
      }
    }
  }

  destroy(): void {
    // Phaser clears CameraManager.main before late scene-shutdown callbacks in
    // some transitions. Feedback teardown still owns its display nodes even
    // when there is no remaining shake effect to reset.
    this.scene.cameras?.main?.shakeEffect?.reset();
    for (const dot of this.ownedDots) {
      dot.sprite.destroy();
    }
    this.ownedDots.length = 0;
    this.liveDots.clear();
    this.damageRect.destroy();
    this.levelRect.destroy();
    this.mergeRect.destroy();
  }

  private liveHeavyCount(): number {
    let count = 0;
    for (const dot of this.liveDots) {
      if (dot.heavy) count += 1;
    }
    return count;
  }

  private spawnStationary(
    x: number,
    y: number,
    color: number,
    radius: number,
    lifetimeMs: number,
    heavy = false,
  ): void {
    if (this.liveDots.size >= this.maxEffects || (heavy && this.liveHeavyCount() >= this.maxHeavyEffects)) {
      this.dropped += 1;
      return;
    }
    const dot = this.dotPool.acquire();
    dot.ageMs = 0;
    dot.lifetimeMs = lifetimeMs;
    dot.vx = 0;
    dot.vy = 0;
    dot.startAlpha = color === HIT_COLOR ? 0.90 : 0.85;
    dot.heavy = heavy;
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
