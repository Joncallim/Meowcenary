import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { GameData } from '../systems/types';
import type { MetaUpgradeRegistry } from '../systems/metaUpgrades';
import {
  applySettingsPatch,
  createDefaultMeta,
  sanitizeMeta,
  type MetaState,
  type SaveData,
  type SaveManager,
  type Settings,
} from '../systems/save';

export const GAME_CONTEXT_REGISTRY_KEY = 'meowcenary.gameContext';

export interface PersistenceUpdate<T> { readonly value: T; readonly persisted: boolean }

export interface GameContext {
  readonly bus: EventBus;
  /** Boot/menu scoped only; gameplay RNG comes from RunState.seed. */
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
  readonly saveData: SaveData;
  readonly settings: Settings;
  updateSettings(patch: Readonly<Partial<Settings>>): PersistenceUpdate<Settings>;
  updateMeta(transform: (meta: MetaState) => MetaState): PersistenceUpdate<MetaState>;
  resetProgression(): PersistenceUpdate<MetaState>;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
}

export function createGameContext(options: CreateGameContextOptions): GameContext {
  let current = options.save.load();
  const context: GameContext = {
    bus: options.bus,
    menuRng: options.menuRng,
    data: options.data,
    metaUpgrades: options.metaUpgrades,
    save: options.save,
    get saveData() { return current; },
    get settings() { return current.settings; },
    updateSettings(patch) {
      const settings = applySettingsPatch(current.settings, patch);
      current = Object.freeze({ version: 2, settings, meta: current.meta });
      return Object.freeze({ value: settings, persisted: options.save.save(current) });
    },
    updateMeta(transform) {
      const transformed = transform(current.meta);
      const meta = sanitizeMeta(transformed, options.metaUpgrades.maxLevels());
      current = Object.freeze({ version: 2, settings: current.settings, meta });
      return Object.freeze({ value: meta, persisted: options.save.save(current) });
    },
    resetProgression() { return context.updateMeta(() => createDefaultMeta()); },
  };
  return context;
}
