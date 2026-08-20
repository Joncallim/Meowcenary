import type Phaser from 'phaser';
import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { GameData } from '../systems/types';
import type { CharacterRegistry } from '../systems/characters';
import type { ArenaRegistry } from '../systems/arenas';
import type { MetaUpgradeRegistry } from '../systems/metaUpgrades';
import { canSelectCharacter } from '../gameplay/characterSelection';
import { canSelectArena } from '../gameplay/arenaSelection';
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

/** Typed registry accessor for the boot-published GameContext (Epic 19 P2-5):
 *  centralizes the cast and adds a runtime existence check so a missing or
 *  mis-keyed registry entry fails loudly at the accessor, not at first use. */
export function getGameContext(scene: Phaser.Scene): GameContext {
  const ctx = scene.registry.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
  if (!ctx) {
    throw new Error(
      `GameContext missing from Phaser registry under '${GAME_CONTEXT_REGISTRY_KEY}'`,
    );
  }

  return ctx;
}

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

export type SelectArenaFailureReason = 'unknown-arena' | 'locked' | 'stale-selection';
export type SelectArenaResult =
  | { readonly ok: true; readonly arenaId: string; readonly revision: number }
  | { readonly ok: false; readonly reason: SelectArenaFailureReason; readonly arenaId: string; readonly revision: number };

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
  readonly arenas: ArenaRegistry;
  readonly selectedArenaId: string;
  readonly arenaSelectionRevision: number;
  updateSettings(patch: Readonly<Partial<Settings>>): PersistenceUpdate<Settings>;
  updateMeta(transform: (meta: MetaState) => MetaState): PersistenceUpdate<MetaState>;
  resetProgression(): PersistenceUpdate<MetaState>;
  selectCharacter(characterId: string, expectedRevision: number): SelectCharacterResult;
  selectArena(arenaId: string, expectedRevision: number): SelectArenaResult;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
  readonly characters: CharacterRegistry;
  readonly arenas: ArenaRegistry;
}

export function createGameContext(options: CreateGameContextOptions): GameContext {
  let current = options.save.load();
  let selectedCharacterId = options.characters.defaultCharacterId();
  let selectionRevision = 1;
  let selectedArenaId = options.arenas.defaultArenaId();
  let arenaSelectionRevision = 1;

  /** After a meta mutation, if the currently-selected character is no longer
   *  selectable (e.g. its unlock was removed), silently reset to the default.
   *  This is a side-effect of updateMeta/resetProgression — consumers watching
   *  selectionRevision will see a bump when this fires. */
  function revalidateSelection(): void {
    const def = options.characters.characterById(selectedCharacterId);
    if (def && !canSelectCharacter(def, current.meta)) {
      selectedCharacterId = options.characters.defaultCharacterId();
      selectionRevision += 1;
    }
    const adef = options.arenas.arenaById(selectedArenaId);
    if (adef && !canSelectArena(adef, current.meta)) {
      selectedArenaId = options.arenas.defaultArenaId();
      arenaSelectionRevision += 1;
    }
  }

  const context: GameContext = {
    bus: options.bus,
    menuRng: options.menuRng,
    data: options.data,
    metaUpgrades: options.metaUpgrades,
    characters: options.characters,
    arenas: options.arenas,
    get saveData() { return current; },
    get settings() { return current.settings; },
    get selectedCharacterId() { return selectedCharacterId; },
    get selectionRevision() { return selectionRevision; },
    get selectedArenaId() { return selectedArenaId; },
    get arenaSelectionRevision() { return arenaSelectionRevision; },
    updateSettings(patch) {
      const previousSettings = current.settings;
      const settings = applySettingsPatch(previousSettings, patch);
      current = Object.freeze({ version: 2, settings, meta: current.meta });
      const persisted = options.save.save(current);

      // Identity equality (never patch-object equality) decides emission: a
      // no-op or sanitized-to-current patch emits nothing, and a real
      // in-memory change emits even when persistence failed. Assignment
      // happens before emission so listeners reading context.settings observe
      // the same object carried in the payload.
      if (settings !== previousSettings) {
        options.bus.emit('settings:changed', { settings });
      }

      return Object.freeze({ value: settings, persisted });
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
    selectArena(arenaId: string, expectedRevision: number): SelectArenaResult {
      const def = options.arenas.arenaById(arenaId);
      if (!def) {
        return {
          ok: false,
          reason: 'unknown-arena',
          arenaId: selectedArenaId,
          revision: arenaSelectionRevision,
        };
      }
      if (expectedRevision !== arenaSelectionRevision) {
        return {
          ok: false,
          reason: 'stale-selection',
          arenaId: selectedArenaId,
          revision: arenaSelectionRevision,
        };
      }
      if (!canSelectArena(def, current.meta)) {
        return {
          ok: false,
          reason: 'locked',
          arenaId: selectedArenaId,
          revision: arenaSelectionRevision,
        };
      }
      if (arenaId === selectedArenaId) {
        return { ok: true, arenaId, revision: arenaSelectionRevision };
      }
      selectedArenaId = arenaId;
      arenaSelectionRevision += 1;
      return { ok: true, arenaId, revision: arenaSelectionRevision };
    },
  };
  return context;
}
