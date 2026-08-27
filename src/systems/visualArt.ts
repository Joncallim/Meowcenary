import { deepFreeze } from '../engine/freeze';
import type Phaser from 'phaser';
import type { VisualArtBinding } from './types';
import { validateVisualArtCatalog } from './validation';

export interface VisualArtLookup {
  bindingById(id: string): Readonly<VisualArtBinding> | undefined;
  all(): readonly Readonly<VisualArtBinding>[];
}

export class DataVisualArtRegistry implements VisualArtLookup {
  private readonly byId = new Map<string, Readonly<VisualArtBinding>>();
  private readonly snapshot: readonly Readonly<VisualArtBinding>[];

  constructor(data: { readonly visualArt: unknown }) {
    const catalog = validateVisualArtCatalog(data.visualArt);
    const canonical = catalog.bindings.map((binding) => deepFreeze(structuredClone(binding)));
    for (const binding of canonical) this.byId.set(binding.id, binding);
    this.snapshot = Object.freeze(canonical);
  }

  bindingById(id: string): Readonly<VisualArtBinding> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<VisualArtBinding>[] {
    return this.snapshot;
  }
}

export function visualAnimationKey(bindingId: string, clipName: string): string {
  return `art:${bindingId}:${clipName}`;
}

export function ensureVisualAnimations(scene: Phaser.Scene, registry: VisualArtLookup): void {
  for (const binding of registry.all()) {
    if (binding.load.type !== 'spritesheet' || !binding.clips || !scene.textures.exists(binding.textureKey)) continue;
    for (const [clipName, clip] of Object.entries(binding.clips)) {
      const key = visualAnimationKey(binding.id, clipName);
      if (scene.anims.exists(key)) continue;
      const animation = scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(binding.textureKey, {
          start: clip.start,
          end: clip.end,
        }),
        frameRate: clip.frameRate,
        repeat: clip.repeat,
      });
      if (!animation || animation.frames.length === 0) scene.anims.remove(key);
    }
  }
}
