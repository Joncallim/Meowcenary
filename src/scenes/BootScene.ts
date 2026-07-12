import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';
import { createEventBus } from '../engine/eventBus';
import { createRng } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import { applySettingsPatch, LocalStorageAdapter, SaveManager } from '../systems/save';
import { loadGameData } from '../systems/validation';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    const data = loadGameData();
    const save = new SaveManager(new LocalStorageAdapter());
    const saveData = save.load();
    const settings = { ...saveData.settings };
    // This RNG is boot/menu scoped only. Run gameplay owns its own seed.
    const bootSeed = Date.now();
    const ctx: GameContext = {
      bus: createEventBus(),
      menuRng: createRng(bootSeed),
      data,
      save,
      settings,
      updateSettings(patch) {
        applySettingsPatch(settings, patch);
        save.save({ ...save.load(), settings: { ...settings } });
        return settings;
      },
    };

    this.registry.set(GAME_CONTEXT_REGISTRY_KEY, ctx);
    this.scene.start(SceneKey.Game);
  }
}
