import type Phaser from 'phaser';
import type { ActorArtBinding, GameData } from './types';
import { validateActorArtCatalog } from './validation';

export interface ActorArtLookup {
  bindingById(id: string): Readonly<ActorArtBinding> | undefined;
  all(): readonly Readonly<ActorArtBinding>[];
}

export class DataActorArtRegistry implements ActorArtLookup {
  private readonly byId = new Map<string, Readonly<ActorArtBinding>>();
  private readonly snapshot: readonly Readonly<ActorArtBinding>[];

  constructor(data: Pick<GameData, 'actorArt'>) {
    const catalog = validateActorArtCatalog(data.actorArt);
    const canonical = catalog.bindings.map((binding) => deepFreeze(structuredClone(binding)));
    for (const binding of canonical) this.byId.set(binding.id, binding);
    this.snapshot = Object.freeze(canonical);
  }

  bindingById(id: string): Readonly<ActorArtBinding> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<ActorArtBinding>[] {
    return this.snapshot;
  }
}

export function actorAnimationKey(bindingId: string, clipName: string): string {
  return `art:${bindingId}:${clipName}`;
}

export function ensureActorAnimations(scene: Phaser.Scene, registry: ActorArtLookup): void {
  for (const binding of registry.all()) {
    if (!binding.clips || !scene.textures.exists(binding.textureKey)) continue;
    for (const [clipName, clip] of Object.entries(binding.clips)) {
      const key = actorAnimationKey(binding.id, clipName);
      if (scene.anims.exists(key)) continue;
      const animation = scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(binding.textureKey, {
          start: clip.start,
          end: clip.end,
        }),
        frameRate: clip.frameRate,
        repeat: -1,
      });
      if (!animation || animation.frames.length === 0) scene.anims.remove(key);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
