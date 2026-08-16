import Phaser from 'phaser';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../engine/context';
import { createEventBus } from '../engine/eventBus';
import { createRng } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import audioAssetsJson from '../data/audio-assets.json';
import visualArtJson from '../data/visual-art.json';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../systems/audio';
import { DataCharacterRegistry } from '../systems/characters';
import { DataArenaRegistry } from '../systems/arenas';
import { LocalStorageAdapter, SaveManager } from '../systems/save';
import { DataMetaUpgradeRegistry } from '../systems/metaUpgrades';
import { loadGameData } from '../systems/validation';
import { DataVisualArtRegistry, ensureVisualAnimations } from '../systems/visualArt';

export class BootScene extends Phaser.Scene {
  private preloadVisualArt?: DataVisualArtRegistry;
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
    this.preloadVisualArt = new DataVisualArtRegistry({ visualArt: visualArtJson });
    this.failedVisualTextureKeys.clear();
    this.load.on('loaderror', this.recordVisualLoadError);
    this.load.once('complete', this.removeVisualLoadListeners);
    this.events.once('shutdown', this.removeVisualLoadListeners);
    this.events.once('destroy', this.removeVisualLoadListeners);

    for (const asset of [...audioAssetsJson.sfx, ...audioAssetsJson.music]) {
      this.load.audio(asset.key, asset.url);
    }
    for (const binding of this.preloadVisualArt.all()) {
      if (binding.load.type === 'image') {
        this.load.image(binding.textureKey, binding.url);
      } else {
        this.load.spritesheet(binding.textureKey, binding.url, {
          frameWidth: binding.load.frame.width,
          frameHeight: binding.load.frame.height,
        });
      }
    }
  }

  create(): void {
    const data = loadGameData();
    const visualArt = new DataVisualArtRegistry(data);
    for (const binding of visualArt.all()) {
      if (binding.required &&
          (this.failedVisualTextureKeys.has(binding.textureKey) || !this.textures.exists(binding.textureKey))) {
        throw new Error(
          `Required visual art failed to load: id="${binding.id}", textureKey="${binding.textureKey}", url="${binding.url}"`,
        );
      }
    }
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const arenas = new DataArenaRegistry(data);
    ensureVisualAnimations(this, visualArt);
    const save = new SaveManager(new LocalStorageAdapter(), undefined, metaUpgrades.maxLevels());
    // This RNG is boot/menu scoped only. Run gameplay owns its own seed.
    const bootSeed = Date.now();
    const ctx = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(bootSeed),
      data,
      metaUpgrades,
      save,
      characters,
      arenas,
    });

    this.registry.set(GAME_CONTEXT_REGISTRY_KEY, ctx);

    // Exactly one game-scoped AudioManager per game lifetime: constructed by
    // Boot, initialized once, and published for Menu/Game to fetch. There is
    // no Boot shutdown hook for the manager; scenes never destroy it.
    const audio = new AudioManager(this);
    audio.init(ctx.bus, ctx.settings, ctx.data.audio, ctx.data.weaponFeel);
    this.registry.set(AUDIO_MANAGER_REGISTRY_KEY, audio);

    this.scene.start(SceneKey.Menu);
  }
}
