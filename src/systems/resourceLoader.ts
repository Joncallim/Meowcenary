/**
 * Resource loading/closure system.
 *
 * V4 (Slice E): separates logical VisualArt identity from physical Phaser
 * texture/resource identity. Boot loads only boot/home-critical resources.
 * Heavy surfaces load explicit bundles/lazy resources.
 * Run resource closure derives from actual composition.
 */
import type Phaser from 'phaser';
import type { ArenaDefinition, EnemyDefinition, GameData, VisualTextureResource } from './types';
import { DataVisualArtRegistry, ensureVisualAnimations, visualAnimationKey } from './visualArt';

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
  const loaded: LoadedResource[] = [];
  const failed: LoadedResource[] = [];
  const pending = [...findSharedResources(resources).values()]
    .filter((resource) => {
      if (scene.textures.exists(resource.textureKey)) {
        loaded.push({ resourceId: resource.id, textureKey: resource.textureKey, success: true });
        return false;
      }
      if (resource.load.type === 'atlas' && !resource.load.dataUrl) {
        failed.push({ resourceId: resource.id, textureKey: resource.textureKey, success: false });
        return false;
      }
      return true;
    });
  if (pending.length === 0) return { loaded, failed };

  // Phaser's LoaderPlugin has one queue. Starting it once after all physical
  // resources are queued prevents concurrent `start()` calls from racing and
  // reporting a partial closure as complete on slower mobile browsers.
  await new Promise<void>((resolve) => {
    let remaining = pending.length;
    const settle = (resource: VisualTextureResource, success: boolean): void => {
      scene.load.off(`filecomplete-${resource.textureKey}`, completeHandlers.get(resource.textureKey));
      scene.load.off(`loaderror-${resource.textureKey}`, errorHandlers.get(resource.textureKey));
      (success ? loaded : failed).push({ resourceId: resource.id, textureKey: resource.textureKey, success });
      remaining -= 1;
      if (remaining === 0) resolve();
    };
    const completeHandlers = new Map<string, () => void>();
    const errorHandlers = new Map<string, () => void>();
    for (const resource of pending) {
      const complete = () => settle(resource, true);
      const error = () => settle(resource, false);
      completeHandlers.set(resource.textureKey, complete);
      errorHandlers.set(resource.textureKey, error);
      scene.load.once(`filecomplete-${resource.textureKey}`, complete);
      scene.load.once(`loaderror-${resource.textureKey}`, error);
      switch (resource.load.type) {
        case 'image': scene.load.image(resource.textureKey, resource.load.imageUrl); break;
        case 'atlas': scene.load.atlas(resource.textureKey, resource.load.imageUrl, resource.load.dataUrl!); break;
        case 'spritesheet': scene.load.spritesheet(resource.textureKey, resource.load.imageUrl, {
          frameWidth: resource.load.frameWidth ?? 32,
          frameHeight: resource.load.frameHeight ?? 32,
        }); break;
      }
    }
    scene.load.start();
  });
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

/** The physical presentation contract for one playable run.  This resolves
 * content composition, rather than relying on whichever small boot bundle
 * happened to be loaded when the player pressed Play. */
export function resolveRunPhysicalResources(options: {
  readonly data: GameData;
  readonly characterId: string;
  readonly arena: Readonly<ArenaDefinition>;
  readonly encounterEnemyIds: readonly string[];
  readonly bossId?: string;
}): readonly VisualTextureResource[] {
  const art = new DataVisualArtRegistry(options.data);
  const resourceById = new Map(options.data.visualResources.map((resource) => [resource.id, resource]));
  const artIds = new Set<string>();
  const addArt = (id: string): void => { artIds.add(id); };

  addArt(`character:${options.characterId}`);
  for (const id of options.arena.visual.floorArtIds) addArt(id);
  for (const id of Object.values(options.arena.visual.boundary)) addArt(id);
  for (const decoration of options.arena.visual.decorations) addArt(decoration.artId);
  for (const skin of options.arena.visual.obstacleSkins) addArt(skin.artId);

  const enemyById = new Map(options.data.enemies.map((enemy) => [enemy.id, enemy]));
  const visitedEnemies = new Set<string>();
  const addEnemy = (enemyId: string): void => {
    if (visitedEnemies.has(enemyId)) return;
    visitedEnemies.add(enemyId);
    const enemy = enemyById.get(enemyId);
    if (!enemy) throw new Error(`Run resource closure references missing enemy "${enemyId}"`);
    if (enemy.archetype === 'elite') {
      addEnemy(enemy.baseEnemyId);
      // Elites deliberately use their base actor art at runtime.
      return;
    }
    addArt(`enemy:${enemy.id}`);
    addEnemyChildren(enemy, addEnemy);
  };
  for (const enemyId of options.encounterEnemyIds) addEnemy(enemyId);
  if (options.bossId) addEnemy(options.bossId);

  // A weapon pickup can produce any currently registered definition.  Load
  // their held/projectile/icon art up-front so an ordinary loot result cannot
  // degrade to geometry in a live run.
  for (const weapon of options.data.weapons) {
    addArt(weapon.art.iconId);
    addArt(weapon.art.heldId);
    addArt(weapon.art.projectileId);
  }
  for (const kind of ['xp', 'scrap', 'chest', 'weapon'] as const) addArt(`drop:${kind}`);
  // Upgrade cards are a gameplay modal, so their required presentation is in
  // the normal run closure too.
  for (const upgrade of options.data.upgrades) addArt(upgrade.presentation.iconArtId);

  const resources: VisualTextureResource[] = [];
  const seen = new Set<string>();
  for (const artId of artIds) {
    const binding = art.bindingById(artId);
    if (!binding || !binding.required || !binding.resourceId) {
      throw new Error(`Required run visual binding "${artId}" is unavailable`);
    }
    const resource = resourceById.get(binding.resourceId);
    if (!resource) throw new Error(`Run visual binding "${artId}" references missing physical resource "${binding.resourceId}"`);
    if (!seen.has(resource.id)) {
      seen.add(resource.id);
      resources.push(resource);
    }
  }
  return resources;
}

function addEnemyChildren(enemy: Exclude<EnemyDefinition, { readonly archetype: 'elite' }>, addEnemy: (id: string) => void): void {
  if ('summon' in enemy && enemy.summon) addEnemy(enemy.summon.enemyId);
  if (enemy.splitOnDeath) addEnemy(enemy.splitOnDeath.enemyId);
  if (enemy.archetype !== 'boss') return;
  for (const action of [...enemy.actions, ...(enemy.phases ?? []).flatMap((phase) => phase.actions)]) {
    if (action.id === 'boss-action:summon') addEnemy(action.enemyId);
  }
}

/** Fail closed before entity construction. A texture key alone is not enough
 * for atlas-backed bindings: the declared frame must be live too. */
export function assertRunPhysicalResourcesLoaded(
  textures: Pick<Phaser.Textures.TextureManager, 'exists' | 'get'>,
  bindings: readonly { readonly id: string; readonly textureKey: string; readonly frameKey?: string; readonly required: boolean }[],
): void {
  const missing: string[] = [];
  for (const binding of bindings) {
    if (!binding.required) continue;
    if (!textures.exists(binding.textureKey)) {
      missing.push(`${binding.id} (texture ${binding.textureKey})`);
      continue;
    }
    if (binding.frameKey !== undefined && !textures.get(binding.textureKey).has(binding.frameKey)) {
      missing.push(`${binding.id} (frame ${binding.frameKey})`);
    }
  }
  if (missing.length > 0) throw new Error(`Required run resources failed to load: ${missing.join(', ')}`);
}

/** Prepare a complete run closure for rendering before GameScene constructs
 * entities. Lazy spritesheets need animation registration after their loader
 * completes; a live texture by itself is not an actor-ready resource. */
export async function prepareRunPresentation(
  scene: Phaser.Scene,
  data: GameData,
  resources: readonly VisualTextureResource[],
): Promise<void> {
  const result = await loadTextureResources(scene, resources);
  if (result.failed.length > 0) throw new Error('Required presentation resources could not load');
  const art = new DataVisualArtRegistry(data);
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const requiredBindings = art.all().filter((binding) =>
    binding.resourceId !== undefined && resourceIds.has(binding.resourceId));
  assertRunPhysicalResourcesLoaded(scene.textures, requiredBindings);
  ensureVisualAnimations(scene, art);
  const missing: string[] = [];
  for (const binding of requiredBindings) {
    if ((binding.kind !== 'character' && binding.kind !== 'enemy') ||
        binding.load.type !== 'spritesheet' || !binding.clips) continue;
    for (const clip of ['idle', 'run', 'hurt', 'defeat'] as const) {
      if (binding.clips[clip] && !scene.anims.exists(visualAnimationKey(binding.id, clip))) {
        missing.push(`${binding.id} ${clip}`);
      }
    }
  }
  if (missing.length > 0) throw new Error(`Required actor animations are unavailable: ${missing.join(', ')}`);
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
