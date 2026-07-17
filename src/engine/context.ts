import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { GameData } from '../systems/types';
import type { CharacterRegistry } from '../systems/characters';
import type { MetaUpgradeRegistry } from '../systems/metaUpgrades';
import { canSelectCharacter } from '../gameplay/characterSelection';
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

export type SelectCharacterFailureReason = 'unknown-character' | 'locked' | 'stale-selection';
export type SelectCharacterResult =
  | { readonly ok: true; readonly characterId: string; readonly revision: number }
  | {
      readonly ok: false;
      readonly reason: SelectCharacterFailureReason;
      readonly characterId: string;
      readonly revision: number;
    };

export interface GameContext {
  readonly bus: EventBus;
  /** Boot/menu scoped only; gameplay RNG comes from RunState.seed. */
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly saveData: SaveData;
  readonly settings: Settings;
  readonly characters: CharacterRegistry;
  readonly selectedCharacterId: string;
  readonly selectionRevision: number;
  updateSettings(patch: Readonly<Partial<Settings>>): PersistenceUpdate<Settings>;
  updateMeta(transform: (meta: MetaState) => MetaState): PersistenceUpdate<MetaState>;
  resetProgression(): PersistenceUpdate<MetaState>;
  selectCharacter(characterId: string, expectedRevision: number): SelectCharacterResult;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
  readonly characters: CharacterRegistry;
}

export function createGameContext(options: CreateGameContextOptions): GameContext {
  let current = options.save.load();
  let selectedCharacterId = options.characters.defaultCharacterId();
  let selectionRevision = 1;

  function revalidateSelection(): void {
    const def = options.characters.characterById(selectedCharacterId);
    if (def && !canSelectCharacter(def, current.meta)) {
      selectedCharacterId = options.characters.defaultCharacterId();
      selectionRevision += 1;
    }
  }

  const context: GameContext = {
    bus: options.bus,
    menuRng: options.menuRng,
    data: options.data,
    metaUpgrades: options.metaUpgrades,
    characters: options.characters,
    get saveData() { return current; },
    get settings() { return current.settings; },
    get selectedCharacterId() { return selectedCharacterId; },
    get selectionRevision() { return selectionRevision; },
    updateSettings(patch) {
      const settings = applySettingsPatch(current.settings, patch);
      current = Object.freeze({ version: 2, settings, meta: current.meta });
      return Object.freeze({ value: settings, persisted: options.save.save(current) });
    },
    updateMeta(transform) {
      const transformed = transform(current.meta);
      const meta = sanitizeMeta(transformed, options.metaUpgrades.maxLevels());
      current = Object.freeze({ version: 2, settings: current.settings, meta });
      const persisted = options.save.save(current);
      revalidateSelection();
      return Object.freeze({ value: meta, persisted });
    },
    resetProgression() { return context.updateMeta(() => createDefaultMeta()); },
    selectCharacter(characterId: string, expectedRevision: number): SelectCharacterResult {
      const def = options.characters.characterById(characterId);
      if (!def) {
        return {
          ok: false,
          reason: 'unknown-character',
          characterId: selectedCharacterId,
          revision: selectionRevision,
        };
      }
      if (expectedRevision !== selectionRevision) {
        return {
          ok: false,
          reason: 'stale-selection',
          characterId: selectedCharacterId,
          revision: selectionRevision,
        };
      }
      if (!canSelectCharacter(def, current.meta)) {
        return {
          ok: false,
          reason: 'locked',
          characterId: selectedCharacterId,
          revision: selectionRevision,
        };
      }
      if (characterId === selectedCharacterId) {
        return { ok: true, characterId, revision: selectionRevision };
      }
      selectedCharacterId = characterId;
      selectionRevision += 1;
      return { ok: true, characterId, revision: selectionRevision };
    },
  };
  return context;
}
