/**
 * Resource loading/closure system.
 *
 * V4 (Slice E): separates logical VisualArt identity from physical Phaser
 * texture/resource identity. Boot loads only boot/home-critical resources.
 * Heavy surfaces load explicit bundles/lazy resources.
 * Run resource closure derives from actual composition.
 */
import type Phaser from 'phaser';
import type { VisualTextureResource } from './types';

export interface LoadedResource {
  readonly resourceId: string;
  readonly textureKey: string;
  readonly success: boolean;
}

/** Result of a resource load operation. */
export interface ResourceLoadResult {
  readonly loaded: readonly LoadedResource[];
  readonly failed: readonly LoadedResource[];
}

/** Compatibility projection while current PNG exports are progressively
 * packed into atlases. The loader's unit of work is already a physical
 * texture key, so several logical bindings sharing a key produce one load. */
export function physicalResourcesForBindings(
  bindings: readonly { readonly textureKey: string; readonly url: string; readonly sampling: 'nearest' | 'linear'; readonly load: { readonly type: 'image' } | { readonly type: 'spritesheet'; readonly frame: { readonly width: number; readonly height: number } } }[],
): readonly VisualTextureResource[] {
  const byTextureKey = new Map<string, VisualTextureResource>();
  for (const binding of bindings) {
    if (byTextureKey.has(binding.textureKey)) continue;
    byTextureKey.set(binding.textureKey, {
      id: `resource:${binding.textureKey}`,
      textureKey: binding.textureKey,
      sampling: binding.sampling,
      load: binding.load.type === 'image'
        ? { type: 'image', imageUrl: binding.url }
        : { type: 'spritesheet', imageUrl: binding.url, frameWidth: binding.load.frame.width, frameHeight: binding.load.frame.height },
    });
  }
  return [...byTextureKey.values()];
}

/** Queue physical resources on Phaser's normal scene preload queue. This is
 * intentionally separate from the lazy `loadTextureResources` path, whose
 * explicit `start()` is correct only after a scene has entered. */
export function queueTextureResources(
  scene: Pick<Phaser.Scene, 'load'>,
  resources: readonly VisualTextureResource[],
): void {
  for (const resource of findSharedResources(resources).values()) {
    switch (resource.load.type) {
      case 'image': scene.load.image(resource.textureKey, resource.load.imageUrl); break;
      case 'atlas':
        if (!resource.load.dataUrl) throw new Error(`Atlas resource "${resource.id}" is missing dataUrl`);
        scene.load.atlas(resource.textureKey, resource.load.imageUrl, resource.load.dataUrl);
        break;
      case 'spritesheet':
        scene.load.spritesheet(resource.textureKey, resource.load.imageUrl, {
          frameWidth: resource.load.frameWidth ?? 32,
          frameHeight: resource.load.frameHeight ?? 32,
        });
        break;
    }
  }
}

/**
 * Load a single texture resource into Phaser.
 */
export function loadTextureResource(
  scene: Phaser.Scene,
  resource: VisualTextureResource,
): Promise<LoadedResource> {
  return new Promise((resolve) => {
    const key = resource.textureKey;
    // Skip if already loaded
    if (scene.textures.exists(key)) {
      resolve({ resourceId: resource.id, textureKey: key, success: true });
      return;
    }

    const onComplete = () => {
      resolve({ resourceId: resource.id, textureKey: key, success: true });
    };
    const onError = () => {
      resolve({ resourceId: resource.id, textureKey: key, success: false });
    };

    scene.load.once(`filecomplete-${key}`, onComplete);
    scene.load.once(`loaderror-${key}`, onError);

    switch (resource.load.type) {
      case 'image':
        scene.load.image(key, resource.load.imageUrl);
        break;
      case 'atlas':
        if (resource.load.dataUrl) {
          scene.load.atlas(key, resource.load.imageUrl, resource.load.dataUrl);
        } else {
          resolve({ resourceId: resource.id, textureKey: key, success: false });
          return;
        }
        break;
      case 'spritesheet':
        scene.load.spritesheet(key, resource.load.imageUrl, {
          frameWidth: resource.load.frameWidth ?? 32,
          frameHeight: resource.load.frameHeight ?? 32,
        });
        break;
      default:
        resolve({ resourceId: resource.id, textureKey: key, success: false });
        return;
    }

    scene.load.start();
  });
}

/**
 * Load multiple texture resources.
 */
export async function loadTextureResources(
  scene: Phaser.Scene,
  resources: readonly VisualTextureResource[],
): Promise<ResourceLoadResult> {
  const results = await Promise.allSettled(
    resources.map((r) => loadTextureResource(scene, r)),
  );

  const loaded: LoadedResource[] = [];
  const failed: LoadedResource[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        loaded.push(result.value);
      } else {
        failed.push(result.value);
      }
    }
  }

  return { loaded, failed };
}

/**
 * Compute the resource closure for a run: the set of resources needed based
 * on selected character, encounter enemies, boss, world bundle, and run core.
 */
export function computeRunResourceClosure(
  selectedCharacterResourceIds: readonly string[],
  encounterEnemyResourceIds: readonly string[],
  bossResourceIds: readonly string[],
  worldBundleResourceIds: readonly string[],
  runCoreResourceIds: readonly string[],
): readonly string[] {
  const uniqueIds = new Set<string>();
  for (const ids of [
    selectedCharacterResourceIds,
    encounterEnemyResourceIds,
    bossResourceIds,
    worldBundleResourceIds,
    runCoreResourceIds,
  ]) {
    for (const id of ids) {
      uniqueIds.add(id);
    }
  }
  return [...uniqueIds];
}

/**
 * Determine which resources to load for a menu surface.
 */
export function computeMenuBundle(
  resourceRegistry: ReadonlyMap<string, VisualTextureResource>,
  menuLogicalArtIds: readonly string[],
  artBindingToResource: ReadonlyMap<string, string>,
): readonly VisualTextureResource[] {
  const resourceIds = new Set<string>();
  for (const artId of menuLogicalArtIds) {
    const resourceId = artBindingToResource.get(artId);
    if (resourceId) resourceIds.add(resourceId);
  }
  return [...resourceIds]
    .map((id) => resourceRegistry.get(id))
    .filter((r): r is VisualTextureResource => r !== undefined);
}

/** Shared resource deduplication check. */
export function findSharedResources(
  resources: readonly VisualTextureResource[],
): Map<string, VisualTextureResource> {
  const byKey = new Map<string, VisualTextureResource>();
  for (const r of resources) {
    const existing = byKey.get(r.textureKey);
    if (existing && existing.id !== r.id) {
      // Same texture key, different resource IDs — they share a physical resource
    }
    if (!existing) {
      byKey.set(r.textureKey, r);
    }
  }
  return byKey;
}
