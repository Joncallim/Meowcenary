import Phaser from 'phaser';
import { visualAnimationKey } from '../systems/visualArt';
import type { VisualArtBinding } from '../systems/types';

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

/** Epic 17 (D7): bounded pulse for the winding-telegraph fallback on
 *  code-drawn accent nodes — amplitude grows with progress so the cue reads
 *  as "charging up," not a flat blink. Pure function, no timers. */
const TELEGRAPH_PULSE_HZ = 6;
export function telegraphPulseAlpha(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const pulse = 0.5 + 0.5 * Math.sin(clamped * Math.PI * 2 * TELEGRAPH_PULSE_HZ);
  return 0.4 + 0.6 * clamped * pulse;
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
): SpriteView | undefined {
  if (binding?.load.type !== 'spritesheet' || !binding.clips?.idle || !binding.clips.run ||
      !scene.textures.exists(binding.textureKey)) {
    return undefined;
  }
  const idle = visualAnimationKey(binding.id, 'idle');
  const run = visualAnimationKey(binding.id, 'run');
  if (!scene.anims.exists(idle) || !scene.anims.exists(run)) return undefined;
  const sprite = scene.add.sprite(body.x, body.y, binding.textureKey, 0)
    .setDepth(depth)
    .setOrigin(0.5)
    .setScale(
      binding.display.width / binding.load.frame.width,
      binding.display.height / binding.load.frame.height,
    );
  const hurt = binding.clips.hurt ? visualAnimationKey(binding.id, 'hurt') : undefined;
  const defeat = binding.clips.defeat ? visualAnimationKey(binding.id, 'defeat') : undefined;
  // Epic 17 (D7): optional windup clip — no schema change, `clips` is an
  // open record. Absent for every binding until Codex fills it in; the
  // caller falls back to the code-drawn accent pulse until then.
  const windup = binding.clips.windup ? visualAnimationKey(binding.id, 'windup') : undefined;
  return new SpriteView(body, shadow, sprite, {
    idle,
    run,
    ...(hurt && scene.anims.exists(hurt) ? { hurt } : {}),
    ...(defeat && scene.anims.exists(defeat) ? { defeat } : {}),
    ...(windup && scene.anims.exists(windup) ? { windup } : {}),
  });
}

export function createStaticArtSprite(
  scene: Phaser.Scene,
  binding: Readonly<VisualArtBinding> | undefined,
  depth: number,
): Phaser.GameObjects.Sprite | undefined {
  if (!binding || !scene.textures.exists(binding.textureKey)) return undefined;
  const frame = binding.load.type === 'spritesheet' ? 0 : undefined;
  const sprite = scene.add.sprite(0, 0, binding.textureKey, frame)
    .setDepth(depth)
    .setOrigin(0.5);
  if (binding.load.type === 'spritesheet') {
    sprite.setScale(
      binding.display.width / binding.load.frame.width,
      binding.display.height / binding.load.frame.height,
    );
  } else {
    sprite.setDisplaySize(binding.display.width, binding.display.height);
  }
  sprite
    .setActive(false)
    .setVisible(false);
  return sprite;
}
