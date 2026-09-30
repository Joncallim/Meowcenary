import Phaser from 'phaser';
import { visualAnimationKey } from '../systems/visualArt';
import type { VisualArtBinding } from '../systems/types';

/** Presentation-only multiplier. Physics bodies retain their authored radii. */
export const ACTOR_VISUAL_SCALE_BY_KIND = Object.freeze({
  // Present authored actor sheets above their collision footprint so they
  // remain readable against detailed arenas without changing gameplay.
  character: 1.55,
  enemy: 1.45,
});

export function actorVisualFactor(binding: Readonly<VisualArtBinding>): number {
  return binding.kind === 'character' || binding.kind === 'enemy'
    ? ACTOR_VISUAL_SCALE_BY_KIND[binding.kind]
    : 1;
}

export interface ActorPose {
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly moving: boolean;
  readonly alpha: number;
  /** Epic 17 (D7): winding-charge progress, 0→1 as the telegraph completes.
   *  Undefined outside the winding state. The caller derives this from
   *  Enemy.state/stateTimerMs — views never own a second countdown. */
  readonly telegraph?: number;
}

export interface ActorView {
  update(pose: ActorPose): void;
  playOneShot(clip: 'hurt' | 'defeat'): void;
  destroy(): void;
}

/**
 * Primitive actors are deliberately a harness/debug capability, never an
 * alternate release presentation path. Callers must opt in at construction
 * time so a missing required texture or animation cannot quietly turn a
 * production actor into circles.
 */
export interface ActorViewFallbackOptions {
  readonly allowPrimitiveFallback?: boolean;
}

const REQUIRED_ACTOR_CLIPS = ['idle', 'run', 'hurt', 'defeat'] as const;

/** Epic 17 (D7): bounded pulse for the winding-telegraph fallback on
 *  code-drawn accent nodes — amplitude grows with progress so the cue reads
 *  as "charging up," not a flat blink. Pure function, no timers. */
const TELEGRAPH_PULSE_HZ = 6;
export function telegraphPulseAlpha(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const pulse = 0.5 + 0.5 * Math.sin(clamped * Math.PI * 2 * TELEGRAPH_PULSE_HZ);
  return 0.4 + 0.6 * clamped * pulse;
}

/** Epic 17 (D7): SpriteView's own windup fallback for a binding with full
 *  idle/run/hurt/defeat art but no `windup` clip (e.g. `enemy:junk-rusher`
 *  today) — the accent-node pulse only exists on PlaceholderView, and a
 *  sprite with real art never builds one (see Enemy's constructor), so the
 *  sprite needs a self-contained cue. Lerps from no tint toward a warning
 *  color as the charge completes; no oscillation (unlike the accent pulse)
 *  since tinting a full sprite at 6Hz reads as a glitch, not a charge-up.
 *  Pure function, no timers. */
const TELEGRAPH_TINT_COLOR = { r: 0xff, g: 0x4d, b: 0x4d }; // warning red
export function telegraphTintColor(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const r = Math.round(0xff + (TELEGRAPH_TINT_COLOR.r - 0xff) * clamped);
  const g = Math.round(0xff + (TELEGRAPH_TINT_COLOR.g - 0xff) * clamped);
  const b = Math.round(0xff + (TELEGRAPH_TINT_COLOR.b - 0xff) * clamped);
  return (r << 16) | (g << 8) | b;
}

export interface GluedLayer {
  readonly node: Phaser.GameObjects.Arc;
  readonly dx: number;
  readonly dy: number;
  readonly flashes: boolean;
  /** Epic 17 (D7): this layer pulses per `telegraphPulseAlpha` while
   *  `ActorPose.telegraph` is present, and holds full alpha otherwise. Only
   *  Enemy's accent node sets this — Player's ears are unaffected. */
  readonly telegraphTint?: boolean;
}

export class PlaceholderView implements ActorView {
  constructor(
    private readonly body: Phaser.GameObjects.Arc,
    private readonly layers: readonly GluedLayer[],
    private readonly shadow: { readonly node: Phaser.GameObjects.Arc; readonly dy: number },
  ) {}

  update(pose: ActorPose): void {
    this.body.setAlpha(pose.alpha);
    for (const layer of this.layers) {
      layer.node.setPosition(pose.x + layer.dx, pose.y + layer.dy);
      if (layer.telegraphTint) {
        layer.node.setAlpha(pose.telegraph !== undefined ? telegraphPulseAlpha(pose.telegraph) : 1);
      } else if (layer.flashes) {
        layer.node.setAlpha(pose.alpha);
      }
    }
    this.shadow.node.setPosition(pose.x, pose.y + this.shadow.dy);
  }

  playOneShot(): void {}

  destroy(): void {
    for (const layer of this.layers) layer.node.destroy();
    this.shadow.node.destroy();
  }
}

type Locomotion = 'idle' | 'run' | 'windup';

export class SpriteView implements ActorView {
  private locomotion: Locomotion = 'idle';
  private oneShot?: 'hurt' | 'defeat';

  constructor(
    body: Phaser.GameObjects.Arc,
    private readonly shadow: { readonly node: Phaser.GameObjects.Arc; readonly dy: number },
    private readonly sprite: Phaser.GameObjects.Sprite,
    private readonly clips: {
      readonly idle: string;
      readonly run: string;
      readonly hurt?: string;
      readonly defeat?: string;
      /** Epic 17 (D7): optional winding-telegraph clip. Falls back to the
       *  code-drawn accent pulse (PlaceholderView) when absent. */
      readonly windup?: string;
    },
  ) {
    body.setVisible(false);
    this.sprite.play(this.clips.idle);
    this.sprite.on('animationcomplete', this.handleAnimationComplete, this);
  }

  update(pose: ActorPose): void {
    this.sprite
      .setPosition(pose.x, pose.y)
      .setFlipX(pose.facing === -1)
      .setAlpha(this.oneShot === 'defeat' ? 1 : pose.alpha);
    this.shadow.node.setPosition(pose.x, pose.y + this.shadow.dy);
    const nextLocomotion: Locomotion =
      pose.telegraph !== undefined && this.clips.windup ? 'windup' : pose.moving ? 'run' : 'idle';
    const locomotionChanged = nextLocomotion !== this.locomotion;
    this.locomotion = nextLocomotion;
    if (locomotionChanged && this.oneShot === undefined) {
      this.sprite.play(this.clips[nextLocomotion] ?? this.clips.idle);
    }
    // Epic 17 (D7): tint fallback only when there's no windup clip to lean on
    // instead — a binding with a real windup animation tells its own story,
    // and a sprite with full base art but no windup clip (e.g.
    // enemy:junk-rusher today) would otherwise show no telegraph at all,
    // since it never builds the PlaceholderView accent node.
    if (pose.telegraph !== undefined && !this.clips.windup) {
      this.sprite.setTint(telegraphTintColor(pose.telegraph));
    } else {
      this.sprite.clearTint();
    }
  }

  playOneShot(clip: 'hurt' | 'defeat'): void {
    if (this.oneShot === 'defeat' || (clip === 'hurt' && !this.clips.hurt) ||
        (clip === 'defeat' && !this.clips.defeat)) return;
    // Already mid-playback of this exact clip: Phaser's play() restarts an
    // already-playing animation by default, so re-triggering every frame
    // (e.g. continuous hazard damage) would loop it at frame 0 forever and
    // never fire animationcomplete. Let it run to completion instead.
    if (this.oneShot === clip) return;
    this.oneShot = clip;
    if (clip === 'defeat') this.sprite.setAlpha(1);
    this.sprite.play(this.clips[clip]!);
  }

  destroy(): void {
    this.sprite.off('animationcomplete', this.handleAnimationComplete, this);
    this.sprite.destroy();
    this.shadow.node.destroy();
  }

  private readonly handleAnimationComplete = (animation: Phaser.Animations.Animation): void => {
    if (this.oneShot === undefined || animation.key !== this.clips[this.oneShot]) return;
    if (this.oneShot === 'defeat') return;
    this.oneShot = undefined;
    this.sprite.play(this.clips[this.locomotion] ?? this.clips.idle);
  };
}

export function createAnimatedActorView(
  scene: Phaser.Scene,
  body: Phaser.GameObjects.Arc,
  shadow: { readonly node: Phaser.GameObjects.Arc; readonly dy: number },
  binding: Readonly<VisualArtBinding> | undefined,
  depth: number,
  fallbackOptions: Readonly<ActorViewFallbackOptions> = {},
): SpriteView | undefined {
  const failure = unavailableRequiredActorPresentation(scene, binding);
  if (failure !== undefined) {
    if (fallbackOptions.allowPrimitiveFallback) return undefined;
    throw new Error(`Required actor presentation is unavailable: ${failure}`);
  }
  // `unavailableRequiredActorPresentation` proved the binding, texture and
  // all release clips above. Keep the local narrowing explicit because the
  // binding still arrives at this presentation boundary as optional data.
  const actorBinding = binding!;
  // Unreachable after the diagnostic guard above; retained for TypeScript's
  // discriminated-union narrowing at the sprite construction site.
  if (actorBinding.load.type !== 'spritesheet' || !actorBinding.clips) {
    throw new Error(`Required actor presentation is unavailable: ${actorBinding.id} is not a complete spritesheet binding`);
  }
  const idle = visualAnimationKey(actorBinding.id, 'idle');
  const run = visualAnimationKey(actorBinding.id, 'run');
  const sprite = scene.add.sprite(body.x, body.y, actorBinding.textureKey, 0)
    .setDepth(depth)
    .setOrigin(0.5)
    .setScale(
      actorBinding.display.width / actorBinding.load.frame.width * actorVisualFactor(actorBinding),
      actorBinding.display.height / actorBinding.load.frame.height * actorVisualFactor(actorBinding),
    );
  const hurt = visualAnimationKey(actorBinding.id, 'hurt');
  const defeat = visualAnimationKey(actorBinding.id, 'defeat');
  // Epic 17 (D7): optional windup clip — no schema change, `clips` is an
  // open record. Absent for every binding until Codex fills it in; the
  // caller falls back to the code-drawn accent pulse until then.
  const windup = actorBinding.clips.windup ? visualAnimationKey(actorBinding.id, 'windup') : undefined;
  return new SpriteView(body, shadow, sprite, {
    idle,
    run,
    hurt,
    defeat,
    ...(windup && scene.anims.exists(windup) ? { windup } : {}),
  });
}

/** Return a diagnostic suitable for the launch failure boundary, rather than
 * treating an asset-present texture as sufficient actor presentation. */
function unavailableRequiredActorPresentation(
  scene: Pick<Phaser.Scene, 'textures' | 'anims'>,
  binding: Readonly<VisualArtBinding> | undefined,
): string | undefined {
  if (!binding) return 'binding is missing';
  if (binding.load.type !== 'spritesheet') return `${binding.id} is not a spritesheet`;
  const missingClips = REQUIRED_ACTOR_CLIPS.filter((clip) => !binding.clips?.[clip]);
  if (missingClips.length > 0) return `${binding.id} is missing required clip(s): ${missingClips.join(', ')}`;
  if (!scene.textures.exists(binding.textureKey)) return `${binding.id} texture "${binding.textureKey}" is missing`;
  const missingAnimations = REQUIRED_ACTOR_CLIPS.filter((clip) => !scene.anims.exists(visualAnimationKey(binding.id, clip)));
  if (missingAnimations.length > 0) return `${binding.id} animation(s) are missing: ${missingAnimations.join(', ')}`;
  return undefined;
}

export function createStaticArtSprite(
  scene: Phaser.Scene,
  binding: Readonly<VisualArtBinding> | undefined,
  depth: number,
  visualFactor = 1,
): Phaser.GameObjects.Sprite | undefined {
  if (!binding || !scene.textures.exists(binding.textureKey)) return undefined;
  // Static sprites service projectiles and drops too. The explicit multiplier
  // is actor-only so a future non-actor caller cannot accidentally inherit
  // the R3 readability enlargement.
  const actorOnlyFactor = binding.kind === 'character' || binding.kind === 'enemy' ? visualFactor : 1;
  const frame = binding.load.type === 'spritesheet' ? 0 : binding.frameKey;
  const sprite = scene.add.sprite(0, 0, binding.textureKey, frame)
    .setDepth(depth)
    .setOrigin(0.5);
  if (binding.load.type === 'spritesheet') {
    sprite.setScale(
      binding.display.width / binding.load.frame.width * actorOnlyFactor,
      binding.display.height / binding.load.frame.height * actorOnlyFactor,
    );
  } else {
    sprite.setDisplaySize(binding.display.width * actorOnlyFactor, binding.display.height * actorOnlyFactor);
  }
  sprite
    .setActive(false)
    .setVisible(false);
  return sprite;
}
