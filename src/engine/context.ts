import type Phaser from 'phaser';
import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { GameData } from '../systems/types';
import type { CharacterRegistry } from '../systems/characters';
import type { ArenaRegistry } from '../systems/arenas';
import type { StageRegistry } from '../systems/stageRegistry';
import { StageRegistry as StageRegistryCtor } from '../systems/stageRegistry';
import type { MetaUpgradeRegistry } from '../systems/metaUpgrades';
import { canSelectCharacter } from '../gameplay/characterSelection';
import { canSelectArena } from '../gameplay/arenaSelection';
import { createConditionContext, evaluateCondition, type ProgressionCondition } from '../gameplay/conditionEvaluator';
import {
  applySettingsPatch,
  createDefaultProgression,
  sanitizeProgression,
  type MetaState,
  type AchievementMetricState,
  type AchievementProgressState,
  type GunsmithState,
  type EquipmentState,
  type EquipmentLoadoutState,
  type SaveData,
  type SaveManager,
  type Settings,
} from '../systems/save';
import { applyDurableGrantTransaction, type DurableGrantTransaction } from '../gameplay/grantProcessor';
import { noopAchievementAdapter, type AchievementPlatformAdapter } from '../gameplay/achievementPlatform';
import { EQUIPMENT_TIERS, upgradeCost } from '../gameplay/equipment';

export const GAME_CONTEXT_REGISTRY_KEY = 'meowcenary.gameContext';

/** Typed registry accessor for the boot-published GameContext (Epic 19 P2-5):
 *  centralizes the cast AND validates the value at runtime, so a missing,
 *  mis-keyed, or wrong-type registry entry fails loudly at the accessor, not
 *  at first use. */
export function getGameContext(scene: Phaser.Scene): GameContext {
  const ctx = scene.registry.get(GAME_CONTEXT_REGISTRY_KEY);
  if (!isGameContext(ctx)) {
    throw new Error(
      `GameContext missing from Phaser registry under '${GAME_CONTEXT_REGISTRY_KEY}'`,
    );
  }

  return ctx;
}

/** Module-private brand: only objects returned by createGameContext are
 *  accepted as a GameContext. A structurally similar impostor (e.g.
 *  `{ bus: { on() {} } }`) passes any shape check but crashes later at
 *  scene creation when menuRng/arenas/data/characters/saveData are touched —
 *  membership here rejects it at the accessor instead. */
const branded = new WeakSet<object>();

/** Structural brand: a GameContext must be a factory-created instance.
 *  The registry stores the boot-published instance; any truthy-but-wrong
 *  value (a string, a stale object, a bus-shaped impostor) is rejected
 *  rather than cast. */
function isGameContext(value: unknown): value is GameContext {
  // WeakSet.has throws on primitives — the typeof gate doubles as the
  // cheap pre-filter.
  return typeof value === 'object' && value !== null && branded.has(value);
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
export type SelectStageFailureReason = 'unknown-stage' | 'locked' | 'stale-selection';
export type SelectStageResult =
  | { readonly ok: true; readonly stageId: string; readonly revision: number }
  | { readonly ok: false; readonly reason: SelectStageFailureReason; readonly stageId: string; readonly revision: number };

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
  readonly stages: StageRegistry;
  readonly selectedStageId: string;
  readonly stageSelectionRevision: number;
  updateSettings(patch: Readonly<Partial<Settings>>): PersistenceUpdate<Settings>;
  updateMeta(transform: (meta: MetaState) => MetaState): PersistenceUpdate<MetaState>;
  /** The only runtime mutation boundary for owned parts/builds.  Commands
   * prepare a complete immutable state; publication occurs only after its
   * Save V3 snapshot is durable. */
  updateGunsmith(transform: (state: GunsmithState) => GunsmithState): PersistenceUpdate<GunsmithState>;
  updateEquipment(transform: (state: { readonly equipment: EquipmentState; readonly loadout: EquipmentLoadoutState }) => { readonly equipment: EquipmentState; readonly loadout: EquipmentLoadoutState }): PersistenceUpdate<EquipmentState>;
  /** Atomically spend durable scrap and advance one owned equipment instance. */
  commitEquipmentUpgrade(instanceId: string, expectedTier: number, nextTier: number, cost: number): boolean;
  applyGrantTransaction(transaction: DurableGrantTransaction): boolean;
  /** One durable commit for the first-clear fact, optional boss fact, and its
   * source-owned rewards.  No fact becomes visible without its receipt. */
  completeStageTransaction(stageId: string, timeMs: number, bossId: string | undefined, transaction: DurableGrantTransaction): boolean;
  commitAchievementTransaction(achievements: AchievementProgressState, metrics: AchievementMetricState, transaction?: DurableGrantTransaction): boolean;
  reportAchievement(definitionId: string, progress: import('../systems/save').AchievementProgress): void;
  /** Persist stage completion into Save V3 stages domain. Returns true if saved. */
  completeStage(stageId: string, timeMs: number): boolean;
  resetProgression(): PersistenceUpdate<MetaState>;
  selectCharacter(characterId: string, expectedRevision: number): SelectCharacterResult;
  selectArena(arenaId: string, expectedRevision: number): SelectArenaResult;
  selectStage(stageId: string, expectedRevision: number): SelectStageResult;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
  readonly characters: CharacterRegistry;
  readonly arenas: ArenaRegistry;
  readonly stages?: StageRegistry;
  readonly achievementPlatform?: AchievementPlatformAdapter;
}

export function createGameContext(options: CreateGameContextOptions): GameContext {
  let current = options.save.load();
  const stages = options.stages ?? new StageRegistryCtor(options.data);
  const knownEquipmentIds = new Set((options.data.equipment ?? []).map((equipment) => equipment.id));
  const knownPartIds = new Set((options.data.gunParts ?? []).map((part) => part.id));
  const knownTraitIds = new Set((options.data.gunParts ?? []).flatMap((part) => part.traits.map((trait) => `trait:${trait.toLowerCase()}`)));
  const knownAchievementIds = new Set((options.data.achievements ?? []).map((achievement) => achievement.id));
  const hasKnownContentRewards = (transaction: DurableGrantTransaction): boolean => transaction.grants.every((grant) => {
    switch (grant.type) {
      case 'unlock-equipment':
      case 'grant-equipment-instance': return knownEquipmentIds.has(grant.equipmentId);
      case 'unlock-part':
      case 'grant-part-instance': return knownPartIds.has(grant.partId);
      case 'unlock-trait': return knownTraitIds.has(grant.traitId);
      case 'unlock-character': return options.characters.characterById(grant.characterId.slice('character:'.length)) !== undefined;
      case 'unlock-stage': return stages.stageById(grant.stageId) !== undefined;
      case 'achievement-completed': return knownAchievementIds.has(grant.achievementId);
      default: return true;
    }
  });
  let selectedCharacterId = options.characters.defaultCharacterId();
  let selectionRevision = 1;
  let selectedArenaId = options.arenas.defaultArenaId();
  let arenaSelectionRevision = 1;
  let selectedStageId = stages.defaultStageId();
  let stageSelectionRevision = 1;
  const achievementPlatform = options.achievementPlatform ?? noopAchievementAdapter;

  /** After a meta mutation, if the currently-selected character is no longer
   *  selectable (e.g. its unlock was removed), silently reset to the default.
   *  This is a side-effect of updateMeta/resetProgression — consumers watching
   *  selectionRevision will see a bump when this fires. */
  function revalidateSelection(): void {
    const def = options.characters.characterById(selectedCharacterId);
    if (def && !canSelectCharacter(def, current.progression)) {
      selectedCharacterId = options.characters.defaultCharacterId();
      selectionRevision += 1;
    }
    const adef = options.arenas.arenaById(selectedArenaId);
    if (adef && !canSelectArena(adef, current.progression)) {
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
    stages,
    get saveData() { return current; },
    get settings() { return current.settings; },
    get selectedCharacterId() { return selectedCharacterId; },
    get selectionRevision() { return selectionRevision; },
    get selectedArenaId() { return selectedArenaId; },
    get arenaSelectionRevision() { return arenaSelectionRevision; },
    get selectedStageId() { return selectedStageId; },
    get stageSelectionRevision() { return stageSelectionRevision; },
    updateSettings(patch) {
      const previousSettings = current.settings;
      const settings = applySettingsPatch(previousSettings, patch);
      current = Object.freeze({ ...current, settings });
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
      const transformed = transform(current.progression);
      const progression = sanitizeProgression(transformed, options.metaUpgrades.maxLevels());
      current = Object.freeze({ ...current, progression });
      const persisted = options.save.save(current);
      revalidateSelection();
      return Object.freeze({ value: progression, persisted });
    },
    updateGunsmith(transform) {
      const gunsmith = transform(current.gunsmith);
      const candidate = Object.freeze({ ...current, gunsmith });
      // SaveManager is deliberately the sanitizer/normalizer.  Reload the
      // persisted representation before publication so a controller can
      // never expose an optimistic owned instance that would disappear on
      // the next boot.
      if (!options.save.save(candidate)) return Object.freeze({ value: current.gunsmith, persisted: false });
      current = options.save.load();
      return Object.freeze({ value: current.gunsmith, persisted: true });
    },
    updateEquipment(transform) {
      const next = transform({ equipment: current.equipment, loadout: current.equipmentLoadout ?? {} });
      const candidate = Object.freeze({ ...current, equipment: next.equipment, equipmentLoadout: next.loadout });
      if (!options.save.save(candidate)) return Object.freeze({ value: current.equipment, persisted: false });
      current = options.save.load();
      return Object.freeze({ value: current.equipment, persisted: true });
    },
    commitEquipmentUpgrade(instanceId, expectedTier, nextTier, cost) {
      const owned = current.equipment[instanceId];
      if (!owned
        || !Number.isSafeInteger(expectedTier) || !Number.isSafeInteger(nextTier)
        || !Number.isSafeInteger(cost) || cost <= 0
        || owned.tier !== expectedTier || expectedTier < 1 || expectedTier >= EQUIPMENT_TIERS.length
        || nextTier !== expectedTier + 1 || nextTier > EQUIPMENT_TIERS.length
        || cost !== upgradeCost(expectedTier)
        || current.progression.scrap < cost) return false;
      const candidate = Object.freeze({
        ...current,
        progression: Object.freeze({ ...current.progression, scrap: current.progression.scrap - cost }),
        equipment: Object.freeze({ ...current.equipment, [instanceId]: Object.freeze({ ...owned, tier: nextTier }) }),
      });
      if (!options.save.save(candidate)) return false;
      current = options.save.load();
      return true;
    },
    applyGrantTransaction(transaction) {
      if (!hasKnownContentRewards(transaction)) return false;
      const result = applyDurableGrantTransaction(current, transaction);
      if (!result.valid) return false;
      if (!result.changed) return true;
      // SaveManager writes a sanitized V3 snapshot.  Publish that same
      // canonical state, not an optimistic variant that a reload would drop.
      const save = Object.freeze({
        ...result.save,
        progression: sanitizeProgression(result.save.progression, options.metaUpgrades.maxLevels()),
      });
      // Do not expose a reward that failed to become durable: retry receives
      // the same source transaction ID against the unchanged snapshot.
      if (!options.save.save(save)) return false;
      current = save;
      revalidateSelection();
      return true;
    },
    completeStageTransaction(stageId, timeMs, bossId, transaction) {
      // Stage facts are part of the same durable transaction as the reward
      // receipt.  Validate the source-owned identifiers before writing that
      // receipt: otherwise a malformed callback could permanently consume a
      // reward transaction without ever producing its corresponding fact.
      const definition = stages.stageById(stageId);
      if (!definition || !Number.isFinite(timeMs) || timeMs < 0) return false;
      if (!hasKnownContentRewards(transaction)) return false;
      if (bossId !== undefined) {
        const encounter = stages.encounterProfileById(definition.encounterProfileId);
        if (definition.bossId !== bossId || encounter?.bossId !== bossId) return false;
      }

      const granted = applyDurableGrantTransaction(current, transaction);
      if (!granted.valid) return false;
      // A receipt asserts that the complete transaction was committed.  Do
      // not silently report success when a corrupted or hand-edited save has
      // retained the receipt but lost one of the facts it certifies.
      if (!granted.changed) {
        if (current.stages[stageId]?.completed !== true) return false;
        if (bossId !== undefined && current.bosses[bossId]?.defeated !== true) return false;
        return true;
      }
      const previous = current.stages[stageId];
      const stage = Object.freeze({
        completed: true,
        ...(timeMs > 0 ? { bestTimeMs: previous?.bestTimeMs !== undefined && previous.bestTimeMs < timeMs ? previous.bestTimeMs : timeMs } : {}),
      });
      const bosses = bossId === undefined ? current.bosses : Object.freeze({
        ...current.bosses,
        [bossId]: {
          ...(current.bosses[bossId] ?? {}),
          defeated: true,
          ...(current.bosses[bossId]?.firstDefeatedAt === undefined ? { firstDefeatedAt: timeMs } : {}),
        },
      });
      const save = Object.freeze({
        ...granted.save,
        progression: sanitizeProgression(granted.save.progression, options.metaUpgrades.maxLevels()),
        stages: Object.freeze({ ...current.stages, [stageId]: stage }),
        bosses,
      });
      if (!options.save.save(save)) return false;
      current = save;
      revalidateSelection();
      return true;
    },
    commitAchievementTransaction(achievements, metrics, transaction) {
      if (transaction !== undefined && !hasKnownContentRewards(transaction)) return false;
      const granted = transaction === undefined
        ? { save: current, valid: true, changed: true }
        : applyDurableGrantTransaction(current, transaction);
      if (!granted.valid) return false;
      if (!granted.changed) {
        // A durable receipt without the achievement facts it claims to have
        // committed is corruption, not a successful retry.  Failing closed
        // leaves the transaction retryable after recovery rather than losing
        // the completion forever behind its receipt.
        return achievementStateMatches(current.achievements, achievements)
          && metricStateMatches(current.achievementMetrics, metrics);
      }
      const save = Object.freeze({
        ...granted.save,
        progression: sanitizeProgression(granted.save.progression, options.metaUpgrades.maxLevels()),
        achievements: Object.freeze({ ...achievements }),
        achievementMetrics: Object.freeze({ ...metrics }),
      });
      if (!options.save.save(save)) return false;
      current = save;
      revalidateSelection();
      return true;
    },
    reportAchievement(definitionId, progress) {
      // Deliberately post-commit and best-effort: an unavailable native
      // mirror must never delay or roll back local/browser progression.
      void Promise.resolve()
        .then(() => achievementPlatform.report(definitionId, progress))
        .catch(() => undefined);
    },
    resetProgression() { return context.updateMeta(() => createDefaultProgression()); },
    completeStage(stageId: string, timeMs: number): boolean {
      if (!stages.stageById(stageId) || !Number.isFinite(timeMs) || timeMs < 0) return false;
      const progress = current.stages[stageId];
      const newProgress = {
        completed: true,
        ...(timeMs > 0 ? { bestTimeMs: progress?.bestTimeMs !== undefined && progress.bestTimeMs < timeMs ? progress.bestTimeMs : timeMs } : {}),
      };
      const save = Object.freeze({
        ...current,
        stages: Object.freeze({ ...current.stages, [stageId]: newProgress }),
      });
      if (!options.save.save(save)) return false;
      current = save;
      return true;
    },
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
      if (!canSelectCharacter(def, current.progression)) {
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
      if (!canSelectArena(def, current.progression)) {
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
    selectStage(stageId: string, expectedRevision: number): SelectStageResult {
      const stage = context.stages.stageById(stageId);
      if (!stage || expectedRevision !== stageSelectionRevision) return { ok: false, reason: !stage ? 'unknown-stage' : 'stale-selection', stageId: selectedStageId, revision: stageSelectionRevision };
      const facts = createConditionContext(current.progression, {
        stages: current.stages,
        achievements: current.achievements,
        characters: current.characters,
        bosses: current.bosses,
      });
      if (!evaluateCondition(stage.unlock as ProgressionCondition, facts)) {
        return { ok: false, reason: 'locked', stageId: selectedStageId, revision: stageSelectionRevision };
      }
      selectedStageId = stageId;
      stageSelectionRevision += 1;
      return { ok: true, stageId: selectedStageId, revision: stageSelectionRevision };
    },
  };
  branded.add(context);
  return context;
}

function achievementStateMatches(
  left: Readonly<AchievementProgressState>,
  right: Readonly<AchievementProgressState>,
): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  if (leftIds.length !== rightIds.length) return false;
  return leftIds.every((id) => {
    const a = left[id];
    const b = right[id];
    return b !== undefined && a.progress === b.progress && a.completed === b.completed && a.completedAt === b.completedAt;
  });
}

function metricStateMatches(
  left: Readonly<AchievementMetricState>,
  right: Readonly<AchievementMetricState>,
): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  return leftIds.length === rightIds.length && leftIds.every((id) => left[id] === right[id]);
}
