import Phaser from 'phaser';
import { visualAnimationKey } from '../systems/visualArt';
import type { VisualArtBinding } from '../systems/types';

export interface ActorPose {
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly moving: boolean;
  readonly alpha: number;
}

export interface ActorView {
  update(pose: ActorPose): void;
  playOneShot(clip: 'hurt' | 'defeat'): void;
  destroy(): void;
}

export interface GluedLayer {
  readonly node: Phaser.GameObjects.Arc;
  readonly dx: number;
  readonly dy: number;
  readonly flashes: boolean;
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
      if (layer.flashes) layer.node.setAlpha(pose.alpha);
    }
    this.shadow.node.setPosition(pose.x, pose.y + this.shadow.dy);
  }

  playOneShot(): void {}

  destroy(): void {
    for (const layer of this.layers) layer.node.destroy();
    this.shadow.node.destroy();
  }
}

export class SpriteView implements ActorView {
  private moving = false;
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
    const movementChanged = pose.moving !== this.moving;
    this.moving = pose.moving;
    if (movementChanged && this.oneShot === undefined) {
      this.sprite.play(pose.moving ? this.clips.run : this.clips.idle);
    }
  }

  playOneShot(clip: 'hurt' | 'defeat'): void {
    if (this.oneShot === 'defeat' || (clip === 'hurt' && !this.clips.hurt) ||
        (clip === 'defeat' && !this.clips.defeat)) return;
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
    this.sprite.play(this.moving ? this.clips.run : this.clips.idle);
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
  return new SpriteView(body, shadow, sprite, {
    idle,
    run,
    ...(hurt && scene.anims.exists(hurt) ? { hurt } : {}),
    ...(defeat && scene.anims.exists(defeat) ? { defeat } : {}),
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
