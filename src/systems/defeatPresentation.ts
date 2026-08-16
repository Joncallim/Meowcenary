import Phaser from 'phaser';
import type { EventBus, GameEventListener } from '../engine/eventBus';
import { createPool, type Pool } from '../engine/pool';
import type { System } from '../engine/system';
import type { VisualArtBinding } from './types';
import type { VisualArtLookup } from './visualArt';
import { visualAnimationKey } from './visualArt';
import { VisualDepth } from './visualDepths';

interface DefeatPresentation {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly binding: Readonly<VisualArtBinding>;
  remainingMs: number;
  listener?: (animation: Phaser.Animations.Animation) => void;
}

export interface DefeatPresentationOptions {
  readonly scene: Phaser.Scene;
  readonly bus: EventBus;
  readonly visualArt: VisualArtLookup;
  readonly maxPresentations: number;
}

/** Physics-free cosmetic corpses. Gameplay enemies still die and destroy
 * synchronously; this listener only mirrors the already-emitted kill. */
export class DefeatPresentationSystem implements System {
  private readonly pools = new Map<string, Pool<DefeatPresentation>>();
  private readonly owners = new Map<DefeatPresentation, Pool<DefeatPresentation>>();
  private readonly active = new Set<DefeatPresentation>();
  private readonly allocated: DefeatPresentation[] = [];
  private readonly unsubscribe: () => void;
  private dropped = 0;

  constructor(private readonly options: DefeatPresentationOptions) {
    this.unsubscribe = options.bus.on('enemy:killed', this.handleEnemyKilled);
  }

  get activePresentationCount(): number { return this.active.size; }
  get allocatedPresentationCount(): number { return this.allocated.length; }
  get droppedPresentationCount(): number { return this.dropped; }

  update(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    for (const presentation of [...this.active]) {
      presentation.remainingMs = Math.max(0, presentation.remainingMs - dtMs);
      if (presentation.remainingMs === 0) this.release(presentation);
    }
  }

  destroy(): void {
    this.unsubscribe();
    for (const presentation of this.allocated) {
      if (presentation.listener) {
        presentation.sprite.off('animationcomplete', presentation.listener);
      }
      presentation.sprite.destroy();
    }
    this.allocated.length = 0;
    this.active.clear();
    this.owners.clear();
    this.pools.clear();
  }

  private readonly handleEnemyKilled: GameEventListener<'enemy:killed'> = ({ enemyId, x, y }) => {
    const binding = this.options.visualArt.bindingById(`enemy:${enemyId}`);
    if (binding?.load.type !== 'spritesheet' || !binding.clips?.defeat ||
        !this.options.scene.textures.exists(binding.textureKey)) return;
    const animationKey = visualAnimationKey(binding.id, 'defeat');
    if (!this.options.scene.anims.exists(animationKey)) return;
    if (this.active.size >= this.options.maxPresentations) {
      this.dropped += 1;
      return;
    }

    const presentation = this.poolFor(binding).acquire();
    this.active.add(presentation);
    const clip = binding.clips.defeat;
    presentation.remainingMs = ((clip.end - clip.start + 1) / clip.frameRate) * 1000 + 100;
    presentation.listener = (animation) => {
      if (animation.key === animationKey) this.release(presentation);
    };
    presentation.sprite
      .on('animationcomplete', presentation.listener)
      .stop()
      .setFrame(clip.start)
      .setPosition(x, y)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true)
      .play(animationKey);
  };

  private poolFor(binding: Readonly<VisualArtBinding>): Pool<DefeatPresentation> {
    const existing = this.pools.get(binding.id);
    if (existing) return existing;
    let pool: Pool<DefeatPresentation>;
    pool = createPool(
      () => {
        const sprite = this.options.scene.add.sprite(0, 0, binding.textureKey, binding.clips!.defeat!.start)
          .setDepth(VisualDepth.enemy)
          .setOrigin(0.5)
          .setScale(
            binding.display.width / (binding.load.type === 'spritesheet' ? binding.load.frame.width : 1),
            binding.display.height / (binding.load.type === 'spritesheet' ? binding.load.frame.height : 1),
          )
          .setActive(false)
          .setVisible(false);
        const presentation: DefeatPresentation = { sprite, binding, remainingMs: 0 };
        this.allocated.push(presentation);
        this.owners.set(presentation, pool);
        return presentation;
      },
      (presentation) => this.reset(presentation),
    );
    this.pools.set(binding.id, pool);
    return pool;
  }

  private release(presentation: DefeatPresentation): void {
    if (!this.active.delete(presentation)) return;
    this.owners.get(presentation)?.release(presentation);
  }

  private reset(presentation: DefeatPresentation): void {
    if (presentation.listener) {
      presentation.sprite.off('animationcomplete', presentation.listener);
      presentation.listener = undefined;
    }
    presentation.remainingMs = 0;
    presentation.sprite.stop().setFrame(0).setAlpha(1).setActive(false).setVisible(false);
  }
}
