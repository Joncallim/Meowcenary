import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { SaveManager, Settings } from '../systems/save';
import type { GameData } from '../systems/types';

export const GAME_CONTEXT_REGISTRY_KEY = 'meowcenary.gameContext';

export interface GameContext {
  bus: EventBus;
  /**
   * Boot/menu-scoped randomness only. Gameplay runs must create their RNG from
   * RunState.seed so combat, loot, spawns, and cards stay reproducible per run.
   */
  rng: Rng;
  data: GameData;
  save: SaveManager;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): Settings;
}
