import Phaser from 'phaser';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../engine/context';
import { createEventBus } from '../engine/eventBus';
import { createRng } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import audioAssetsJson from '../data/audio-assets.json';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../systems/audio';
import { DataCharacterRegistry } from '../systems/characters';
import { DataArenaRegistry } from '../systems/arenas';
import { LocalStorageAdapter, SaveManager } from '../systems/save';
import { DataMetaUpgradeRegistry } from '../systems/metaUpgrades';
import { loadGameData } from '../systems/validation';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    for (const asset of [...audioAssetsJson.sfx, ...audioAssetsJson.music]) {
      this.load.audio(asset.key, asset.url);
    }
  }

  create(): void {
    const data = loadGameData();
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const arenas = new DataArenaRegistry(data);
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
    audio.init(ctx.bus, ctx.settings, ctx.data.audio);
    this.registry.set(AUDIO_MANAGER_REGISTRY_KEY, audio);

    this.scene.start(SceneKey.Menu);
  }
}
