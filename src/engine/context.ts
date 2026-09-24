import type Phaser from 'phaser';
import type { EventBus } from './eventBus';
import type { Rng } from './rng';
import type { GameData } from '../systems/types';
import type { CharacterRegistry } from '../systems/characters';
import type { ArenaRegistry } from '../systems/arenas';
import type { StageRegistry } from '../systems/stageRegistry';
import { StageRegistry as StageRegistryCtor } from '../systems/stageRegistry';

import { canSelectCharacter } from '../gameplay/characterSelection';
import { canSelectArena } from '../gameplay/arenaSelection';
import { createConditionContext, evaluateCondition, type ProgressionCondition } from '../gameplay/conditionEvaluator';
import {
  applySettingsPatch,
  createDefaultSaveV4,
  freezeSaveV4,
  sanitizeProgressionV4,
  type ProgressionStateV4,
  type AchievementMetricState,
  type AchievementProgressState,
  type GunsmithState,
  type EquipmentState,
  type EquipmentLoadoutState,
  type SaveData,
  type SaveManager,
  type Settings,
} from '../systems/save';
import { applyDurableGrantTransaction, durableGrantFingerprint, type DurableGrantTransaction } from '../gameplay/grantProcessor';
import { noopAchievementAdapter, type AchievementPlatformAdapter } from '../gameplay/achievementPlatform';
import { EQUIPMENT_TIERS, equipmentUpgradeUnlock, maxEquipmentTier, ownsEquipmentDefinition, upgradeCost } from '../gameplay/equipment';
import { updateCompendiumDiscovery } from '../systems/compendium';
import { settleRunTerminal as buildRunTerminalSettlement, type RunTerminalSettlementResult } from '../systems/saveV4';
import { DataAchievementRegistry, metricExtractor } from '../systems/achievements';
import { evaluateAchievements } from '../gameplay/achievementSystem';
import { resolveAvailabilitySnapshot, type PersistentAvailabilitySnapshot } from '../gameplay/persistentAvailability';

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

export type SelectCharacterFailureReason = 'unknown-character' | 'locked' | 'stale-selection' | 'persistence-failed';
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

/** The only caller-provided terminal facts.  Catalog rewards, boss identity,
 * mastery and achievement consequences are always re-resolved by GameContext. */
export interface RunTerminalRequest {
  readonly terminalStatus: 'win' | 'loss';
  readonly runScrap: number;
  readonly characterId: string;
  readonly runDurationMs: number;
  readonly stageId?: string;
  readonly isTraining?: boolean;
  /** Monotonic run-local metric facts collected by gameplay.  They are
   * committed only with this terminal candidate, never by UI callbacks. */
  readonly metricIncrements?: Readonly<Record<string, number>>;
  /** Context-owned, immutable presentation truth captured when this run was
   * launched. It can widen result reporting, but never changes persistence. */
  readonly presentationBaseline?: RunPresentationBaseline;
}

export interface RunPresentationBaseline {
  readonly availability: PersistentAvailabilitySnapshot;
  readonly completedAchievementIds: readonly string[];
}

/** These are observed immutable run facts. Terminal-owned metrics such as
 * Scrap banked and completed runs are deliberately excluded: callers must
 * never manufacture the consequences of a win or bank operation. */
const RUN_FACT_METRIC_IDS = new Set(['metric:enemies-defeated', 'metric:merges-performed']);

export interface GameContext {
  readonly bus: EventBus;
  /** Boot/menu scoped only; gameplay RNG comes from RunState.seed. */
  readonly menuRng: Rng;
  readonly data: GameData;
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
  updateMeta(transform: (progression: ProgressionStateV4) => ProgressionStateV4): PersistenceUpdate<ProgressionStateV4>;
  /** Transactional progression mutation for replayable run settlement. Unlike
   * legacy menu mutations, failed persistence is never published. */
  commitProgression(transform: (progression: ProgressionStateV4) => ProgressionStateV4): PersistenceUpdate<ProgressionStateV4>;
  /** The only runtime mutation boundary for owned parts/builds.  Commands
   * prepare a complete immutable state; publication occurs only after its
   * Save V4 snapshot is durable. */
  updateGunsmith(transform: (state: GunsmithState) => GunsmithState): PersistenceUpdate<GunsmithState>;
  updateEquipment(transform: (state: { readonly equipment: EquipmentState; readonly loadout: EquipmentLoadoutState }) => { readonly equipment: EquipmentState; readonly loadout: EquipmentLoadoutState }): PersistenceUpdate<EquipmentState>;
  /** V4 Set fabrication: one owned copy per definition, atomically paid. */
  fabricateEquipment(equipmentId: string): boolean;
  /** V4 Gunsmith fabrication: one physical T1 part and its Scrap charge are
   * one durable transaction. */
  fabricatePart(partId: string): boolean;
  /** Records one monotonic compendium fact only after its V4 snapshot is durable. */
  recordCompendiumDiscovery(enemyId: string, status: import('../systems/save').CompendiumDiscoveryStatus): boolean;
  /** Atomically spend durable scrap and advance one owned equipment instance. */
  commitEquipmentUpgrade(instanceId: string, expectedTier: number, nextTier: number, cost: number): boolean;
  applyGrantTransaction(transaction: DurableGrantTransaction): boolean;
  /** The sole normal-run durable boundary. A successful terminal event
   * becomes visible only after its complete Save V4 candidate is written. */
  settleRunTerminal(input: RunTerminalRequest): RunTerminalSettlementResult;
  /** Captures whole-run presentation truth before asynchronous loading or
   * gameplay can advance durable availability/Achievement facts. */
  captureRunPresentationBaseline(): RunPresentationBaseline;
  /** One durable commit for the first-clear fact, optional boss fact, and its
   * source-owned rewards.  No fact becomes visible without its receipt. */
  completeStageTransaction(stageId: string, timeMs: number, bossId: string | undefined, transaction: DurableGrantTransaction): boolean;
  commitAchievementTransaction(achievements: AchievementProgressState, metrics: AchievementMetricState, transaction?: DurableGrantTransaction): boolean;
  reportAchievement(definitionId: string, progress: import('../systems/save').AchievementProgress): void;
  /** Compatibility completion command. It derives the catalog-owned first
   * clear transaction and delegates to the atomic stage boundary; callers
   * cannot persist a completion fact without its reward receipt. */
  completeStage(stageId: string, timeMs: number): boolean;
  /** Awards authoritative completed-run mastery before achievements consume it. */
  recordCharacterMastery(characterId: string, xp: number): boolean;
  resetProgression(): PersistenceUpdate<ProgressionStateV4>;
  selectCharacter(characterId: string, expectedRevision: number): SelectCharacterResult;
  selectArena(arenaId: string, expectedRevision: number): SelectArenaResult;
  selectStage(stageId: string, expectedRevision: number): SelectStageResult;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly save: SaveManager;
  readonly characters: CharacterRegistry;
  readonly arenas: ArenaRegistry;
  readonly stages?: StageRegistry;
  readonly achievementPlatform?: AchievementPlatformAdapter;
  /** @deprecated V4 retirement: meta-upgrade shop removed. Accept-only for test compat. */
  readonly metaUpgrades?: import('../systems/metaUpgrades').MetaUpgradeRegistry;
}

export function createGameContext(options: CreateGameContextOptions): GameContext {
  let current = options.save.load();
  const stages = options.stages ?? new StageRegistryCtor(options.data);
  const knownEquipmentIds = new Set((options.data.equipment ?? []).map((equipment) => equipment.id));
  const equipmentSlotById = new Map((options.data.equipment ?? []).map((equipment) => [equipment.id, equipment.slot] as const));
  const knownPartIds = new Set((options.data.gunParts ?? []).map((part) => part.id));
  const partDefinitions = new Map((options.data.gunParts ?? []).map((part) => [part.id, part] as const));
  const knownTraitIds = new Set((options.data.gunParts ?? []).flatMap((part) => part.traits.map((trait) => `trait:${trait.toLowerCase()}`)));
  const knownAchievementIds = new Set((options.data.achievements ?? []).map((achievement) => achievement.id));
  const normalizeEquipmentLoadout = (
    equipment: EquipmentState,
    loadout: EquipmentLoadoutState,
  ): EquipmentLoadoutState => {
    const normalized: Partial<Record<'helmet' | 'armour' | 'gloves' | 'boots', string>> = {};
    for (const slot of ['helmet', 'armour', 'gloves', 'boots'] as const) {
      const instanceId = loadout[slot];
      const owned = instanceId === undefined ? undefined : equipment[instanceId];
      if (owned && equipmentSlotById.get(owned.equipmentId) === slot) normalized[slot] = instanceId;
    }
    return Object.freeze(normalized);
  };
  const normalizeEquipmentSnapshot = (save: SaveData): SaveData => {
    const loadout = normalizeEquipmentLoadout(save.equipment, save.equipmentLoadout ?? {});
    const previous = save.equipmentLoadout ?? {};
    const unchanged = ['helmet', 'armour', 'gloves', 'boots'].every((slot) =>
      previous[slot as keyof EquipmentLoadoutState] === loadout[slot as keyof EquipmentLoadoutState]);
    return unchanged ? save : freezeSaveV4({ ...save, equipmentLoadout: loadout });
  };
  const equipmentUpgradeFactsFor = (save: SaveData) => createConditionContext(save.progression, {
    stages: save.stages,
    achievements: save.achievements,
    characters: save.characters,
    bosses: save.bosses,
  });
  const equipmentUpgradeFacts = () => equipmentUpgradeFactsFor(current);
  const availabilityFor = (save: SaveData): PersistentAvailabilitySnapshot => {
    const facts = equipmentUpgradeFactsFor(save);
    return resolveAvailabilitySnapshot(
      facts,
      options.characters.all(),
      options.data.equipmentSets ?? [],
      options.data.gunParts ?? [],
      options.data.equipmentRules === undefined ? 1 : maxEquipmentTier(facts, options.data.equipmentRules, save.progression.unlocks),
    );
  };
  const issuedRunPresentationBaselines = new WeakSet<object>();
  const captureRunPresentationBaseline = (): RunPresentationBaseline => {
    const baseline = Object.freeze({
      availability: availabilityFor(current),
      completedAchievementIds: Object.freeze((options.data.achievements ?? [])
        .filter((definition) => current.achievements[definition.id]?.completed === true)
        .map((definition) => definition.id)),
    });
    issuedRunPresentationBaselines.add(baseline);
    return baseline;
  };
  // Character availability is a read of the same authoritative facts as
  // stages/equipment, never a legacy meta-unlock side channel.
  const characterUnlockFacts = () => createConditionContext(current.progression, {
    stages: current.stages,
    achievements: current.achievements,
    characters: current.characters,
    bosses: current.bosses,
  });
  const normalizedInitial = normalizeEquipmentSnapshot(current);
  if (normalizedInitial !== current && options.save.save(normalizedInitial)) current = normalizedInitial;
  const hasKnownContentRewards = (transaction: DurableGrantTransaction, factsSave: SaveData = current): boolean => transaction.grants.every((grant) => {
    switch (grant.type) {
      case 'unlock-equipment':
        return knownEquipmentIds.has(grant.equipmentId);
      case 'grant-equipment-instance': {
        if (!knownEquipmentIds.has(grant.equipmentId)) return false;
        const tier = grant.tier ?? 1;
        for (let targetTier = 2; targetTier <= tier; targetTier += 1) {
          const unlock = options.data.equipmentRules && equipmentUpgradeUnlock(targetTier as 2 | 3 | 4, options.data.equipmentRules);
          if (unlock !== undefined && !evaluateCondition(unlock, equipmentUpgradeFactsFor(factsSave))) return false;
        }
        return true;
      }
      case 'unlock-part':
      case 'grant-part-instance': {
        const part = partDefinitions.get(grant.partId);
        // A stage's first-clear receipt may be the event that makes this
        // blueprint available.  Validate catalog identity here; availability
        // gates fabrication, never the authoritative authored reward itself.
        return part !== undefined && knownPartIds.has(grant.partId);
      }
      case 'unlock-trait': return knownTraitIds.has(grant.traitId);
      case 'unlock-character': return options.characters.characterById(grant.characterId.slice('character:'.length)) !== undefined;
      case 'unlock-stage': return stages.stageById(grant.stageId) !== undefined;
      case 'achievement-completed': return knownAchievementIds.has(grant.achievementId);
      case 'permanent-upgrade-level': return false; // retired in V4
      // Item grants have quantity semantics, but no item catalog yet exists
      // to prove a target is legitimate. Refuse external durable item grants
      // rather than persisting arbitrary player-controlled inventory keys.
      case 'grant-item': return false;
      default: return true;
    }
  });
  const savedCharacter = options.characters.characterById(current.selectedCharacterId ?? '');
  let selectedCharacterId = savedCharacter && canSelectCharacter(savedCharacter, characterUnlockFacts())
    ? savedCharacter.id
    : options.characters.defaultCharacterId();
  let selectionRevision = 1;
  let selectedArenaId = options.arenas.defaultArenaId();
  let arenaSelectionRevision = 1;
  // Stage selection is a convenience, not a separate durable domain. Rebuild
  // its normal-run frontier from durable progression facts after every reload.
  // This prevents a completed first contract from silently composing the
  // already-cleared default stage on the next browser session.
  function normalStageTargetId(): string {
    const facts = createConditionContext(current.progression, {
      stages: current.stages,
      achievements: current.achievements,
      characters: current.characters,
      bosses: current.bosses,
    });
    const available = stages.allStages().filter((candidate) =>
      evaluateCondition(candidate.unlock as ProgressionCondition, facts));
    return available.find((candidate) => current.stages[candidate.id]?.completed !== true)?.id
      ?? available[0]?.id
      ?? stages.defaultStageId();
  }
  let selectedStageId = normalStageTargetId();
  let stageSelectionRevision = 1;
  const achievementPlatform = options.achievementPlatform ?? noopAchievementAdapter;

  /** After a meta mutation, if the currently-selected character is no longer
   *  selectable (e.g. its unlock was removed), silently reset to the default.
   *  This is a side-effect of updateMeta/resetProgression — consumers watching
   *  selectionRevision will see a bump when this fires. */
  function revalidateSelection(): void {
    const def = options.characters.characterById(selectedCharacterId);
    if (def && !canSelectCharacter(def, characterUnlockFacts())) {
      selectedCharacterId = options.characters.defaultCharacterId();
      selectionRevision += 1;
    }
    const adef = options.arenas.arenaById(selectedArenaId);
    if (adef && !canSelectArena(adef, current.progression)) {
      selectedArenaId = options.arenas.defaultArenaId();
      arenaSelectionRevision += 1;
    }
  }

  /** A first clear advances the default normal-run target to the next
   * newly-available stage. Replays retain the player's explicit choice. */
  function advanceSelectedStage(completedStageId: string): void {
    if (selectedStageId !== completedStageId) return;
    const nextId = normalStageTargetId();
    if (nextId !== selectedStageId) {
      selectedStageId = nextId;
      stageSelectionRevision += 1;
    }
  }

  const context: GameContext = {
    bus: options.bus,
    menuRng: options.menuRng,
    data: options.data,
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
    captureRunPresentationBaseline,
    updateSettings(patch) {
      const previousSettings = current.settings;
      const settings = applySettingsPatch(previousSettings, patch);
      current = freezeSaveV4({ ...current, settings });
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
      const progression = sanitizeProgressionV4(transformed);
      current = freezeSaveV4({ ...current, progression });
      const persisted = options.save.save(current);
      revalidateSelection();
      return Object.freeze({ value: progression, persisted });
    },
    commitProgression(transform) {
      const progression = sanitizeProgressionV4(transform(current.progression));
      const candidate = freezeSaveV4({ ...current, progression });
      if (!options.save.save(candidate)) return Object.freeze({ value: current.progression, persisted: false });
      current = candidate;
      revalidateSelection();
      return Object.freeze({ value: progression, persisted: true });
    },
    updateGunsmith(transform) {
      const gunsmith = transform(current.gunsmith);
      const candidate = freezeSaveV4({ ...current, gunsmith });
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
      const candidate = normalizeEquipmentSnapshot(freezeSaveV4({ ...current, equipment: next.equipment, equipmentLoadout: next.loadout }));
      if (!options.save.save(candidate)) return Object.freeze({ value: current.equipment, persisted: false });
      current = options.save.load();
      return Object.freeze({ value: current.equipment, persisted: true });
    },
    fabricateEquipment(equipmentId) {
      const definition = options.data.equipment?.find((piece) => piece.id === equipmentId);
      const set = definition === undefined ? undefined : options.data.equipmentSets?.find((candidate) => candidate.id === definition.setId);
      if (!definition || !set || !evaluateCondition(set.unlock, equipmentUpgradeFacts())) return false;
      const instanceId = `owned:${equipmentId.replace(':', '-')}`;
      if (ownsEquipmentDefinition(Object.values(current.equipment), equipmentId)
        || current.equipment[instanceId] !== undefined
        || current.progression.scrap < set.pieceFabricationCost) return false;
      const candidate = freezeSaveV4({ ...current,
        progression: Object.freeze({ ...current.progression, scrap: current.progression.scrap - set.pieceFabricationCost }),
        equipment: Object.freeze({ ...current.equipment, [instanceId]: Object.freeze({ equipmentId, tier: 1 }) }),
      });
      if (!options.save.save(candidate)) return false;
      current = options.save.load();
      return true;
    },
    fabricatePart(partId) {
      const definition = partDefinitions.get(partId);
      if (!definition) return false;
      const fabricationCost = definition.fabricationCost;
      if (typeof fabricationCost !== 'number' || !Number.isSafeInteger(fabricationCost) || fabricationCost <= 0
        || (definition.unlock !== undefined && !evaluateCondition(definition.unlock, equipmentUpgradeFacts()))
        || current.progression.scrap < fabricationCost) return false;
      const serial = current.gunsmith.fabricationSerials?.[partId] ?? 0;
      if (!Number.isSafeInteger(serial) || serial < 0 || serial >= Number.MAX_SAFE_INTEGER) return false;
      const nextSerial = serial + 1;
      const instanceId = `owned:${partId.slice('part:'.length)}:${nextSerial}`;
      if (current.gunsmith.parts[instanceId] !== undefined) return false;
      const candidate = freezeSaveV4({ ...current,
        progression: Object.freeze({ ...current.progression, scrap: current.progression.scrap - fabricationCost }),
        gunsmith: Object.freeze({
          ...current.gunsmith,
          parts: Object.freeze({ ...current.gunsmith.parts, [instanceId]: Object.freeze({ partId, tier: 1, infusedTraits: [] }) }),
          fabricationSerials: Object.freeze({ ...(current.gunsmith.fabricationSerials ?? {}), [partId]: nextSerial }),
        }),
      });
      if (!options.save.save(candidate)) return false;
      current = options.save.load();
      return true;
    },
    recordCompendiumDiscovery(enemyId, status) {
      if (typeof enemyId !== 'string' || enemyId.length === 0 || (status !== 'encountered' && status !== 'defeated')) return false;
      const next = updateCompendiumDiscovery(current, enemyId, status);
      if (next === current) return true;
      // Never publish optimistic discovery: a failed durable write leaves
      // both the context and the next boot at the prior authoritative state.
      if (!options.save.save(next)) return false;
      current = options.save.load();
      return true;
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
      const rules = options.data.equipmentRules;
      if (rules !== undefined && nextTier > maxEquipmentTier(equipmentUpgradeFacts(), rules, current.progression.unlocks)) return false;
      const candidate = freezeSaveV4({
        ...current,
        progression: Object.freeze({ ...current.progression, scrap: current.progression.scrap - cost }),
        equipment: Object.freeze({ ...current.equipment, [instanceId]: Object.freeze({ ...owned, tier: nextTier }) }),
      });
      if (!options.save.save(candidate)) return false;
      current = options.save.load();
      return true;
    },
    settleRunTerminal(input) {
      const failed = (): RunTerminalSettlementResult => Object.freeze({
        ok: false,
        terminalApplied: false,
        runScrapBanked: 0,
        firstClear: false,
        bestTimeImproved: false,
        firstClearScrap: 0,
        persistentGrantIds: Object.freeze([]),
        achievementIdsCompleted: Object.freeze([]),
        scrapAwardedFromAchievements: 0,
        masteryTierAwarded: 0,
        availabilityBefore: availabilityFor(current),
        availabilityAfter: availabilityFor(current),
      });
      if (!input || (input.terminalStatus !== 'win' && input.terminalStatus !== 'loss')
        || !Number.isFinite(input.runDurationMs) || input.runDurationMs < 0
        || !options.characters.characterById(input.characterId)) return failed();
      if (input.metricIncrements !== undefined && Object.entries(input.metricIncrements).some(([id, amount]) =>
        !RUN_FACT_METRIC_IDS.has(id) || !Number.isSafeInteger(amount) || amount < 0,
      )) return failed();

      const normalStage = input.isTraining === true ? undefined : input.stageId === undefined ? undefined : stages.stageById(input.stageId);
      // A normal win must identify a current Contract. Losses may identify its
      // Contract for validation, but cannot manufacture its clear facts.
      if (input.isTraining !== true && input.stageId !== undefined && !normalStage) return failed();
      if (input.terminalStatus === 'win' && input.isTraining !== true && !normalStage) return failed();

      const runBaseline = input.presentationBaseline !== undefined
        && issuedRunPresentationBaselines.has(input.presentationBaseline)
        ? input.presentationBaseline
        : undefined;
      const wholeRunAchievementIds = (candidate: SaveData, terminalIds: readonly string[]): readonly string[] => {
        if (runBaseline === undefined) return Object.freeze([...terminalIds]);
        const completedAtLaunch = new Set(runBaseline.completedAchievementIds);
        return Object.freeze((options.data.achievements ?? [])
          .filter((definition) => candidate.achievements[definition.id]?.completed === true
            && !completedAtLaunch.has(definition.id))
          .map((definition) => definition.id));
      };

      // Training is composed through this one terminal owner so result/input
      // lifecycle stays identical, but its explicit product contract grants
      // no durable economy, mastery, achievements, or discovery progress.
      if (input.isTraining === true) {
        const availability = availabilityFor(current);
        return Object.freeze({
          ok: true, terminalApplied: true, runScrapBanked: 0, firstClear: false,
          bestTimeImproved: false, firstClearScrap: 0, persistentGrantIds: Object.freeze([]),
          achievementIdsCompleted: wholeRunAchievementIds(current, Object.freeze([])), scrapAwardedFromAchievements: 0,
          masteryTierAwarded: 0, availabilityBefore: runBaseline?.availability ?? availability, availabilityAfter: availability,
        });
      }

      const availabilityBefore = runBaseline?.availability ?? availabilityFor(current);
      const base = buildRunTerminalSettlement(current, {
        ...input,
        terminalStatus: input.terminalStatus === 'win' ? 'win' : 'loss',
        bossId: normalStage?.bossId,
      }, () => null, (_characterId, tier, xp) => {
        const nextXp = xp + 100;
        const nextTier = Math.max(tier, Math.floor(nextXp / 100));
        return { tier: nextTier, xp: nextXp, tierAwarded: Math.max(0, nextTier - tier) };
      }, []);

      let candidate = base.candidate;
      if (input.metricIncrements !== undefined) {
        const metrics = { ...candidate.achievementMetrics };
        for (const [id, amount] of Object.entries(input.metricIncrements)) {
          if (amount > 0) metrics[id] = Math.min(Number.MAX_SAFE_INTEGER, (metrics[id] ?? 0) + amount);
        }
        candidate = freezeSaveV4({ ...candidate, achievementMetrics: Object.freeze(metrics) });
      }
      let firstClearScrap = 0;
      const persistentGrantIds: string[] = [];
      const collectPersistentIds = (transaction: DurableGrantTransaction): void => {
        for (const grant of transaction.grants) {
          if (grant.type === 'grant-part-instance' || grant.type === 'grant-equipment-instance') persistentGrantIds.push(grant.instanceId);
          else if (grant.type === 'unlock-stage') persistentGrantIds.push(grant.stageId);
          else if (grant.type === 'unlock-character') persistentGrantIds.push(grant.characterId);
          else if (grant.type === 'unlock-equipment') persistentGrantIds.push(grant.equipmentId);
          else if (grant.type === 'unlock-part') persistentGrantIds.push(grant.partId);
          else if (grant.type === 'unlock-trait') persistentGrantIds.push(grant.traitId);
        }
      };
      const apply = (transaction: DurableGrantTransaction): boolean => {
        if (!hasKnownContentRewards(transaction, candidate)) return false;
        const granted = applyDurableGrantTransaction(candidate, transaction);
        if (!granted.valid) return false;
        candidate = granted.save;
        if (granted.changed) collectPersistentIds(transaction);
        return true;
      };

      // The builder has projected the Stage/Boss facts first. Only a genuine
      // new clear may now consume the current catalog-owned source receipt.
      if (base.result.firstClear && normalStage) {
        const reward = stages.rewardProfileById(normalStage.rewardProfileId);
        if (!reward) return failed();
        const transaction: DurableGrantTransaction = {
          id: `${normalStage.id}:first-clear`,
          grants: [{ type: 'grant-scrap', amount: reward.firstClearScrap }, ...(reward.grants ?? [])],
        };
        if (!apply(transaction)) return failed();
        firstClearScrap = reward.firstClearScrap;
      }

      // Evaluate the validated active catalog against the *complete* terminal
      // candidate, then give every completion its own receipt in that same
      // candidate save. No scene-supplied completion/reward is accepted.
      const registry = new DataAchievementRegistry({ achievements: options.data.achievements ?? [] });
      const metricEntries = new Map<string, NonNullable<ReturnType<typeof metricExtractor>>>();
      for (const definition of registry.all()) {
        if (definition.metricId === undefined) continue;
        const extractor = metricExtractor(definition.metricId);
        if (extractor !== undefined) metricEntries.set(definition.metricId, extractor);
      }
      const evaluation = evaluateAchievements(candidate.achievements, {
        metrics: candidate.achievementMetrics,
        progression: candidate.progression,
        stages: candidate.stages,
        characters: candidate.characters,
        bosses: candidate.bosses,
      }, { definitions: registry.asMap(), metrics: metricEntries }, input.runDurationMs);
      let achievementScrap = 0;
      for (const achievementId of evaluation.completed) {
        const definition = registry.achievementById(achievementId);
        if (!definition) return failed();
        const grants = [{ type: 'achievement-completed' as const, achievementId }, ...(definition.rewards ?? []).map((reward) => reward.grant)];
        const transaction: DurableGrantTransaction = { id: `${achievementId}:completion`, grants };
        if (!apply(transaction)) return failed();
        achievementScrap += grants.reduce((sum, grant) => sum + (grant.type === 'grant-scrap' ? grant.amount : 0), 0);
      }
      // Incremental achievement progress is player-visible durable state too;
      // retain it even when this terminal event did not complete a reward.
      if (evaluation.state !== candidate.achievements || evaluation.completed.length > 0) {
        candidate = freezeSaveV4({
          ...candidate,
          achievements: evaluation.state,
          pendingAchievementReports: Object.freeze([...new Set([...candidate.pendingAchievementReports, ...evaluation.completed])]),
        });
      }

      // Exactly one synchronous persistence boundary; no candidate is
      // published or revalidated unless it becomes durable.
      if (!options.save.save(candidate)) return failed();
      current = candidate;
      revalidateSelection();
      if (normalStage && base.result.firstClear) advanceSelectedStage(normalStage.id);
      // The candidate already contains the durable outbox entry. Dispatching
      // after publication avoids a second pre-report write and preserves a
      // retryable entry if the non-authoritative platform call fails.
      for (const achievementId of evaluation.completed) {
        const progress = current.achievements[achievementId];
        if (!progress) continue;
        void Promise.resolve()
          .then(() => achievementPlatform.report(achievementId, progress))
          .then(() => {
            const pending = current.pendingAchievementReports.filter((id) => id !== achievementId);
            const saved = freezeSaveV4({ ...current, pendingAchievementReports: Object.freeze(pending) });
            if (options.save.save(saved)) current = saved;
          })
          .catch(() => undefined);
      }
      return Object.freeze({
        ...base.result,
        ok: true,
        terminalApplied: true,
        firstClearScrap,
        persistentGrantIds: Object.freeze(persistentGrantIds),
        achievementIdsCompleted: wholeRunAchievementIds(candidate, evaluation.completed),
        scrapAwardedFromAchievements: achievementScrap,
        availabilityBefore,
        availabilityAfter: availabilityFor(candidate),
      });
    },
    applyGrantTransaction(transaction) {
      if (!hasKnownContentRewards(transaction)) return false;
      const result = applyDurableGrantTransaction(current, transaction);
      if (!result.valid) return false;
      if (!result.changed) return true;
      // SaveManager writes a sanitized V4 snapshot.  Publish that same
      // canonical state, not an optimistic variant that a reload would drop.
      const save = freezeSaveV4({
        ...result.save,
        progression: sanitizeProgressionV4(result.save.progression),
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
      const rewardProfile = stages.rewardProfileById(definition.rewardProfileId);
      const expectedTransaction: DurableGrantTransaction | undefined = rewardProfile === undefined ? undefined : {
        id: `${stageId}:first-clear`,
        grants: [{
          type: 'grant-scrap',
          amount: rewardProfile.firstClearScrap,
        }, ...(rewardProfile.grants ?? [])],
      };
      // Stage rewards are catalog-owned. A fresh arbitrary receipt at this
      // boundary would otherwise mint durable rewards while marking a stage
      // complete, so bind both source identity and exact grant payload.
      if (expectedTransaction === undefined || transaction.id !== expectedTransaction.id
        || durableGrantFingerprint(transaction) !== durableGrantFingerprint(expectedTransaction)) return false;
      if (!hasKnownContentRewards(transaction)) return false;
      // A boss-stage completion fact is inseparable from the matching boss
      // defeat fact. Allowing an omitted boss ID would bank its first-clear
      // receipt while starving achievement/progression consumers of the
      // authoritative boss fact.
      if (definition.bossId !== bossId) return false;
      if (bossId !== undefined) {
        const encounter = stages.encounterProfileById(definition.encounterProfileId);
        if (encounter?.bossId !== bossId) return false;
      }

      const granted = applyDurableGrantTransaction(current, transaction);
      if (!granted.valid) return false;
      // A receipt asserts that the complete transaction was committed.  Do
      // not silently report success when a corrupted or hand-edited save has
      // retained the receipt but lost one of the facts it certifies.
      if (!granted.changed) {
        if (current.stages[stageId]?.completed !== true) return false;
        if (bossId !== undefined && current.bosses[bossId]?.defeated !== true) return false;
        // A replay must never mint its first-clear reward again, but a later
        // legitimate completion may still improve the non-reward best-time
        // record. Keep that update durable as a separate fact-only write.
        const previous = current.stages[stageId];
        if (timeMs > 0 && (previous?.bestTimeMs === undefined || timeMs < previous.bestTimeMs)) {
          const save = freezeSaveV4({
            ...current,
            stages: Object.freeze({
              ...current.stages,
              [stageId]: Object.freeze({ ...previous, completed: true, bestTimeMs: timeMs }),
            }),
          });
          if (!options.save.save(save)) return false;
          current = save;
          revalidateSelection();
        }
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
      const save = freezeSaveV4({
        ...granted.save,
        progression: sanitizeProgressionV4(granted.save.progression),
        stages: Object.freeze({ ...current.stages, [stageId]: stage }),
        bosses,
      });
      if (!options.save.save(save)) return false;
      current = save;
      revalidateSelection();
      advanceSelectedStage(stageId);
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
      const save = freezeSaveV4({
        ...granted.save,
        progression: sanitizeProgressionV4(granted.save.progression),
        achievements: Object.freeze({ ...achievements }),
        achievementMetrics: Object.freeze({ ...metrics }),
      });
      if (!options.save.save(save)) return false;
      const selectedWasCompleted = current.stages[selectedStageId]?.completed === true;
      const unlocksChanged = save.progression.unlocks.some((id) => !current.progression.unlocks.includes(id));
      current = save;
      revalidateSelection();
      // Achievement grants can unlock a stage. If the player has just
      // completed the selected contract, advance its normal target using the
      // newly durable fact rather than waiting for a browser reload.
      if (selectedWasCompleted && unlocksChanged) advanceSelectedStage(selectedStageId);
      return true;
    },
    reportAchievement(definitionId, progress) {
      // First persist an outbox entry. Native mirrors are non-authoritative,
      // but a transient failure must survive a restart and be retryable.
      const pending = current.pendingAchievementReports.includes(definitionId)
        ? current.pendingAchievementReports
        : Object.freeze([...current.pendingAchievementReports, definitionId]);
      if (!options.save.save(freezeSaveV4({ ...current, pendingAchievementReports: pending }))) return;
      current = freezeSaveV4({ ...current, pendingAchievementReports: pending });
      void Promise.resolve()
        .then(() => achievementPlatform.report(definitionId, progress))
        .then(() => {
          const remaining = current.pendingAchievementReports.filter((id) => id !== definitionId);
          const saved = freezeSaveV4({ ...current, pendingAchievementReports: Object.freeze(remaining) });
          if (options.save.save(saved)) current = saved;
        })
        .catch(() => undefined);
    },
    resetProgression() {
      const reset = freezeSaveV4({ ...createDefaultSaveV4(), settings: current.settings });
      if (!options.save.save(reset)) return Object.freeze({ value: current.progression, persisted: false });
      // `reset` is already a complete, validated V4 snapshot. Retaining it
      // preserves the existing immutable settings identity for UI consumers
      // while still committing the whole reset atomically.
      current = reset;
      revalidateSelection();
      return Object.freeze({ value: current.progression, persisted: true });
    },
    recordCharacterMastery(characterId, xp) {
      if (!options.characters.characterById(characterId) || !Number.isSafeInteger(xp) || xp <= 0) return false;
      const previous = current.characters[characterId] ?? { tier: 0, xp: 0 };
      const nextXp = previous.xp + xp;
      const next = Object.freeze({ xp: nextXp, tier: Math.max(previous.tier, Math.floor(nextXp / 100)) });
      const save = freezeSaveV4({ ...current, characters: Object.freeze({ ...current.characters, [characterId]: next }) });
      if (!options.save.save(save)) return false;
      current = options.save.load();
      return true;
    },
    completeStage(stageId: string, timeMs: number): boolean {
      const definition = stages.stageById(stageId);
      const rewardProfile = definition && stages.rewardProfileById(definition.rewardProfileId);
      if (!definition || !rewardProfile || !Number.isFinite(timeMs) || timeMs < 0) return false;
      const previous = current.stages[stageId];
      // A first-clear receipt has a deliberately immutable catalog payload.
      // Subsequent finishes therefore update only the performance record,
      // never reconstructing a differently valued reward transaction.
      if (previous?.completed === true) {
        if (timeMs <= 0 || (previous.bestTimeMs !== undefined && previous.bestTimeMs <= timeMs)) return true;
        const save = freezeSaveV4({
          ...current,
          stages: Object.freeze({
            ...current.stages,
            [stageId]: Object.freeze({ ...previous, bestTimeMs: timeMs }),
          }),
        });
        if (!options.save.save(save)) return false;
        current = save;
        revalidateSelection();
        return true;
      }
      return context.completeStageTransaction(stageId, timeMs, definition.bossId, {
        id: `${stageId}:first-clear`,
        grants: [{
          type: 'grant-scrap',
          amount: rewardProfile.firstClearScrap,
        }, ...(rewardProfile.grants ?? [])],
      });
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
      if (!canSelectCharacter(def, characterUnlockFacts())) {
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
      const next = freezeSaveV4({ ...current, selectedCharacterId: characterId });
      if (!options.save.save(next)) {
        return { ok: false, reason: 'persistence-failed', characterId: selectedCharacterId, revision: selectionRevision };
      }
      current = next;
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
  // Retry any report that was durably queued before a previous browser/native
  // session ended. Unknown/stale entries fail soft rather than blocking boot.
  for (const achievementId of current.pendingAchievementReports) {
    const progress = current.achievements[achievementId];
    if (progress) context.reportAchievement(achievementId, progress);
  }
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
