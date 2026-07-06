import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { SaveManager, Settings } from '../systems/save';
import type { GameData } from '../systems/types';

export const GAME_CONTEXT_REGISTRY_KEY = 'meowcenary.gameContext';

export interface GameContext {
  bus: EventBus;
  rng: Rng;
  data: GameData;
  save: SaveManager;
  settings: Settings;
}

