import Phaser from 'phaser';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../engine/context';
import { createEventBus } from '../engine/eventBus';
import { createRng } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../systems/audio';
import { DataCharacterRegistry } from '../systems/characters';
import { DataArenaRegistry } from '../systems/arenas';
import { StageRegistry } from '../systems/stageRegistry';
import { LocalStorageAdapter, SaveManager } from '../systems/save';
import { loadGameData } from '../systems/validation';
import { DataVisualArtRegistry, ensureVisualAnimations } from '../systems/visualArt';
import { DataAssetBundleRegistry } from '../systems/assetBundles';
import { queueAudioResources, resolveAudioResources } from '../systems/audioResources';
import { queueTextureResources } from '../systems/resourceLoader';
import { performanceProbe } from '../platform/performanceProbe';

export const BOOT_RESOURCE_BUNDLE_ID = 'bundle:boot-core';

/** Apply filtering from explicit manifest policy only. Texture keys are
 * deduped defensively so future registry fixtures cannot issue duplicate GPU
 * updates; Text canvas keys never enter this catalog-driven loop. */
export function applyNearestTextureSampling(
  textures: Pick<Phaser.Textures.TextureManager, 'exists' | 'get'>,
  visualArt: Pick<DataVisualArtRegistry, 'all'>,
): void {
  const filtered = new Set<string>();
  for (const binding of visualArt.all()) {
    if (
      binding.sampling !== 'nearest'
      || filtered.has(binding.textureKey)
      || !textures.exists(binding.textureKey)
    ) continue;
    filtered.add(binding.textureKey);
    textures.get(binding.textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

export class BootScene extends Phaser.Scene {
  private preloadTextureKeys = new Set<string>();
  private preloadData?: ReturnType<typeof loadGameData>;
  private readonly failedVisualTextureKeys = new Set<string>();
  private readonly recordVisualLoadError = (file: { readonly key?: unknown }): void => {
    if (typeof file.key === 'string') this.failedVisualTextureKeys.add(file.key);
  };
  private readonly removeVisualLoadListeners = (): void => {
    this.load.off('loaderror', this.recordVisualLoadError);
    this.load.off('complete', this.removeVisualLoadListeners);
    this.events.off('shutdown', this.removeVisualLoadListeners);
    this.events.off('destroy', this.removeVisualLoadListeners);
  };

  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    const started = performanceProbe?.now();
    this.preloadData = loadGameData();
    const bundles = new DataAssetBundleRegistry(this.preloadData);
    this.failedVisualTextureKeys.clear();
    this.load.on('loaderror', this.recordVisualLoadError);
    this.load.once('complete', this.removeVisualLoadListeners);
    this.events.once('shutdown', this.removeVisualLoadListeners);
    this.events.once('destroy', this.removeVisualLoadListeners);

    const menuAudio = resolveAudioResources(this.preloadData.audio.assets, 'menu-common');
    queueAudioResources(this, menuAudio);
    const bootResources = bundles.resourcesForBundle(BOOT_RESOURCE_BUNDLE_ID);
    if (!bootResources) throw new Error(`Missing required boot resource bundle "${BOOT_RESOURCE_BUNDLE_ID}"`);
    this.preloadTextureKeys = new Set(bootResources.map((resource) => resource.textureKey));
    queueTextureResources(this, bootResources);
    if (started !== undefined) {
      performanceProbe!.record('boot.preload', started, { physicalResources: bootResources.length, audioFiles: menuAudio.length });
      let loadStart = performanceProbe!.now();
      const audio = new Set(menuAudio.map(asset => asset.key));
      const visual = new Set(bootResources.map(resource => resource.textureKey));
      const failures = new Set<string>();
      const audioFailures = new Set<string>();
      const visualFailures = new Set<string>();
      const finish = (keys: Set<string>, owner: 'boot.audio' | 'boot.visual', key: string): void => {
        if (keys.delete(key) && keys.size === 0) performanceProbe!.record(owner, loadStart, {
          failed: owner === 'boot.audio' ? audioFailures.size : visualFailures.size,
        });
      };
      const fileComplete = (key: string): void => { finish(audio, 'boot.audio', key); };
      // Atlas image/json children may finish earlier than the owning physical
      // resource. Observe Phaser's keyed multi-file completion, as the normal
      // resource loader does, rather than calling the image child atlas-ready.
      const visualHandlers = bootResources.map(resource => ({
        event: `filecomplete-${resource.load.type === 'atlas' ? 'atlasjson' : resource.load.type}-${resource.textureKey}`,
        complete: (): void => finish(visual, 'boot.visual', resource.textureKey),
      }));
      const failed = (file: { key?: string }): void => {
        if (file.key) {
          failures.add(file.key);
          if (audio.has(file.key)) audioFailures.add(file.key);
          if (visual.has(file.key)) visualFailures.add(file.key);
          fileComplete(file.key); finish(visual, 'boot.visual', file.key);
        }
      };
      const onStart = (): void => { loadStart = performanceProbe!.now(); };
      const cleanup = (): void => {
        this.load.off('start', onStart); this.load.off('filecomplete', fileComplete); this.load.off('loaderror', failed);
        this.events.off('shutdown', cleanup); this.events.off('destroy', cleanup);
        this.load.off('complete', complete);
        for (const handler of visualHandlers) this.load.off(handler.event, handler.complete);
      };
      const complete = (): void => {
        performanceProbe!.record('boot.load', loadStart, { physicalResources: bootResources.length, audioFiles: menuAudio.length,
          incompleteAudio: audio.size, incompleteVisual: visual.size, failures: [...failures] });
        cleanup();
      };
      this.load.once('start', onStart); this.load.on('filecomplete', fileComplete); this.load.on('loaderror', failed);
      for (const handler of visualHandlers) this.load.once(handler.event, handler.complete);
      this.load.once('complete', complete); this.events.once('shutdown', cleanup); this.events.once('destroy', cleanup);
    }
  }

  create(): void {
    const started = performanceProbe?.now();
    const data = this.preloadData ?? loadGameData();
    const visualArt = new DataVisualArtRegistry(data);
    for (const binding of visualArt.all()) {
      if (binding.required && this.preloadTextureKeys.has(binding.textureKey) &&
          (this.failedVisualTextureKeys.has(binding.textureKey) || !this.textures.exists(binding.textureKey))) {
        throw new Error(
          `Required visual art failed to load: id="${binding.id}", textureKey="${binding.textureKey}", url="${binding.url}"`,
        );
      }
    }
    applyNearestTextureSampling(this.textures, visualArt);
    const characters = new DataCharacterRegistry(data);
    const arenas = new DataArenaRegistry(data);
    const stages = new StageRegistry(data);
    ensureVisualAnimations(this, visualArt);
    const save = new SaveManager(new LocalStorageAdapter(), undefined);
    // This RNG is boot/menu scoped only. Run gameplay owns its own seed.
    const visualTestBuild = import.meta.env.VITE_VISUAL_TEST === '1'
      && new URLSearchParams(globalThis.location?.search ?? '').get('visual-test') === '1';
    const bootSeed = visualTestBuild ? 191 : Date.now();
    const ctx = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(bootSeed),
      data,
      save,
      characters,
      arenas,
      stages,
    });

    this.registry.set(GAME_CONTEXT_REGISTRY_KEY, ctx);

    // Exactly one game-scoped AudioManager per game lifetime: constructed by
    // Boot, initialized once, and published for Menu/Game to fetch. There is
    // no Boot shutdown hook for the manager; scenes never destroy it.
    const audio = new AudioManager(this);
    audio.init(ctx.bus, ctx.settings, ctx.data.audio, ctx.data.weaponFeel);
    this.registry.set(AUDIO_MANAGER_REGISTRY_KEY, audio);

    if (started !== undefined) performanceProbe?.record('boot.create', started);
    this.scene.start(SceneKey.Menu);
  }
}
