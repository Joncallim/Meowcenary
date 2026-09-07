import { deepFreeze } from '../engine/freeze';
import type Phaser from 'phaser';
import type { ResolvedVisualArtBinding, VisualTextureResource } from './types';
import { validateVisualArtCatalog } from './validation';

export interface VisualArtLookup {
  bindingById(id: string): Readonly<ResolvedVisualArtBinding> | undefined;
  all(): readonly Readonly<ResolvedVisualArtBinding>[];
}

export class DataVisualResourceRegistry {
  private readonly byId = new Map<string, Readonly<VisualTextureResource>>();
  private readonly snapshot: readonly Readonly<VisualTextureResource>[];

  constructor(data: { readonly visualResources: readonly VisualTextureResource[] }) {
    const canonical = data.visualResources.map((resource) => deepFreeze(structuredClone(resource)));
    for (const resource of canonical) this.byId.set(resource.id, resource);
    this.snapshot = Object.freeze(canonical);
  }

  resourceById(id: string): Readonly<VisualTextureResource> | undefined { return this.byId.get(id); }
  all(): readonly Readonly<VisualTextureResource>[] { return this.snapshot; }
}

export class DataVisualArtRegistry implements VisualArtLookup {
  private readonly byId = new Map<string, Readonly<ResolvedVisualArtBinding>>();
  private readonly snapshot: readonly Readonly<ResolvedVisualArtBinding>[];

  constructor(data: { readonly visualArt: unknown; readonly visualResources: readonly VisualTextureResource[] }) {
    const catalog = validateVisualArtCatalog(data.visualArt);
    const resources = new DataVisualResourceRegistry(data);
    const canonical = catalog.bindings.map((binding) => {
      const resource = binding.resourceId === undefined ? undefined : resources.resourceById(binding.resourceId);
      if (!resource) throw new Error(`Visual art \"${binding.id}\" references missing resource \"${binding.resourceId}\"`);
      const load = resource.load.type === 'spritesheet'
        ? { type: 'spritesheet' as const, frame: { width: resource.load.frameWidth ?? 32, height: resource.load.frameHeight ?? 32 } }
        : resource.load.type === 'atlas'
          ? { type: 'atlas' as const }
          : { type: 'image' as const };
      return deepFreeze({ ...structuredClone(binding), textureKey: resource.textureKey, url: resource.load.imageUrl, sampling: resource.sampling, load });
    });
    for (const binding of canonical) this.byId.set(binding.id, binding);
    this.snapshot = Object.freeze(canonical);
  }

  bindingById(id: string): Readonly<ResolvedVisualArtBinding> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<ResolvedVisualArtBinding>[] {
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
