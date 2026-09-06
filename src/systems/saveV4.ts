/**
 * Save V4 — migration, terminal settlement, and reconciliation.
 *
 * Implements the comprehensive V3→V4 migration per Alpha 3 V4 amendments:
 *   First Victory split-boundary repair
 *   Condition-Achievement gap settlement
 *   Well Protected historical settlement
 *   Mercenary grandfathering
 *   Equipment tier capability floor
 *   Warden Mastered-Fire / Warden-Down bridge
 *   Duplicate Equipment consolidation/refund
 *   Best-time reset
 *   Achievement shadow-token cleanup
 *   Generic V4 load-time Achievement reconciliation
 *   Atomic run terminal settlement
 */

import type {
  ProgressionStateV4,
  StageProgressState,
  AchievementProgressState,
  AchievementMetricState,
  CharacterMasteryState,
  BossProgressState,
  BossProgress,
  StageProgress,
  AchievementProgress,
  PartInstance,
  EquipmentInstance,
  Build,
  Settings,
  SaveDataV3,
  SaveDataV4,
  StorageAdapter,
  MasteryProgress,
} from './save';
import { freezeSaveV4, createDefaultSaveV4, createDefaultProgressionV4, DEFAULT_SETTINGS } from './save';

// ── ProgressionGrant type (local copy to avoid circular deps) ─────────

export type ProgressionGrant =
  | { readonly type: 'grant-scrap'; readonly amount: number }
  | { readonly type: 'unlock-stage'; readonly stageId: string }
  | { readonly type: 'unlock-character'; readonly characterId: string }
  | { readonly type: 'unlock-equipment'; readonly equipmentId: string }
  | { readonly type: 'unlock-part'; readonly partId: string }
  | { readonly type: 'unlock-trait'; readonly traitId: string }
  | { readonly type: 'grant-part-instance'; readonly instanceId: string; readonly partId: string; readonly tier?: number }
  | { readonly type: 'grant-equipment-instance'; readonly instanceId: string; readonly equipmentId: string; readonly tier?: number }
  | { readonly type: 'grant-item'; readonly itemId: string; readonly amount?: number }
  | { readonly type: 'achievement-completed'; readonly achievementId: string };

// ── Frozen historical migration data ─────────────────────────────────

/** Frozen RC1 Mercenary selectability rules (migration-only). */
const RC1_MERCENARY_RULES: Readonly<Record<string, (v3: SaveDataV3) => boolean>> = {
  'scrap-tabby': () => true,
  'bolt-hound': (v3) => v3.achievements['achievement:first-victory']?.completed === true,
  'volt-lynx': (v3) => (v3.achievementMetrics['metric:kills'] ?? 0) >= 25,
  'brass-boar': (v3) => v3.bosses['boss-crusher']?.defeated === true,
  'ember-cougar': (v3) => v3.stages['stage:junkyard-05']?.completed === true,
  'scrap-weasel': (v3) => v3.achievements['achievement:kill-milestone-100']?.completed === true,
  'rattle-raptor': (v3) => v3.bosses['boss-crusher']?.defeated === true,
  'piston-ram': (v3) => (v3.characters['scrap-tabby']?.tier ?? 0) >= 1,
};

/** Frozen RC1 condition-Achievement gap settlements. */
interface GapSettlement {
  condition: (v3: SaveDataV3) => boolean;
  reward: () => { scrap: number; unlocks?: readonly string[]; equipment?: Readonly<Record<string, { equipmentId: string; tier: number }>> };
}

const RC1_CONDITION_ACHIEVEMENT_GAPS: Readonly<Record<string, GapSettlement>> = {
  'achievement:boss-crusher': {
    condition: (v3) => v3.bosses['boss-crusher']?.defeated === true,
    reward: () => ({
      scrap: 100,
      unlocks: ['equipment:commando-helmet'],
      equipment: { 'reward:crusher-commando-helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 } },
    }),
  },
  'achievement:chapter-junkyard': {
    condition: (v3) =>
      v3.stages['stage:junkyard-01']?.completed === true &&
      v3.stages['stage:junkyard-02']?.completed === true &&
      v3.stages['stage:junkyard-03']?.completed === true &&
      v3.stages['stage:junkyard-04']?.completed === true &&
      v3.stages['stage:junkyard-05']?.completed === true,
    reward: () => ({ scrap: 200 }),
  },
  'achievement:mastery-scrap-tabby': {
    condition: (v3) => (v3.characters['scrap-tabby']?.tier ?? 0) >= 1,
    reward: () => ({ scrap: 75 }),
  },
};

/** Frozen historical duplicate Equipment pair for Commando Helmet. */
const LEGACY_DUPLICATE_HELMET_PAIR: readonly [string, string] = [
  'reward:stage-01-commando-helmet',
  'reward:crusher-commando-helmet',
];

/** Frozen RC1 upgrade costs for duplicate Equipment refund. */
const DUPLICATE_REFUND_BY_TIER: Readonly<Record<number, number>> = { 1: 0, 2: 100, 3: 250, 4: 450 };

/** Known V3 achievement IDs for shadow-token cleanup. */
const KNOWN_V3_ACHIEVEMENT_IDS: readonly string[] = [
  'achievement:first-victory', 'achievement:first-blood', 'achievement:scrap-squad',
  'achievement:junkyard-veteran', 'achievement:forge-initiate', 'achievement:scrap-tycoon',
  'achievement:boss-crusher', 'achievement:chapter-junkyard', 'achievement:mastery-scrap-tabby',
  'achievement:permanent-reinforced-coat-3', 'achievement:kill-milestone-25', 'achievement:kill-milestone-100',
];

/** Historical Boss repair mapping: Stage completion → Boss fact. */
const HISTORICAL_BOSS_REPAIR: Readonly<Record<string, string>> = {
  'stage:junkyard-05': 'boss-crusher',
  'stage:junkyard-06': 'boss-forge',
};

/** Current ten Stage IDs for best-time reset. */
const CURRENT_TEN_STAGE_IDS: readonly string[] = [
  'stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03',
  'stage:junkyard-04', 'stage:junkyard-05', 'stage:junkyard-06',
  'stage:forge-01', 'stage:forge-02', 'stage:forge-03', 'stage:forge-04',
];

/** Active V4 Achievement catalog IDs (for reconciliation). */
const ACTIVE_V4_ACHIEVEMENT_IDS: readonly string[] = [
  'achievement:first-victory', 'achievement:first-blood', 'achievement:scrap-squad',
  'achievement:junkyard-veteran', 'achievement:forge-initiate', 'achievement:scrap-tycoon',
  'achievement:boss-crusher', 'achievement:chapter-junkyard', 'achievement:mastery-scrap-tabby',
  'achievement:boss-forge', 'achievement:kill-milestone-25', 'achievement:kill-milestone-100',
];

// ── Safe helpers ──────────────────────────────────────────────────────

function safeAddScrap(current: number, amount: number): number {
  const safe = Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
  if (safe === 0) return current;
  return Math.min(Number.MAX_SAFE_INTEGER, current + safe);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch { return false; }
}

function freezeProgressionV4(p: ProgressionStateV4): ProgressionStateV4 {
  return Object.freeze({ scrap: p.scrap, unlocks: Object.freeze([...p.unlocks]) });
}

// ── Full V3 → V4 migration ───────────────────────────────────────────

export interface V4MigrationResult {
  readonly save: SaveDataV4;
  readonly capabilityFloors: readonly string[];
}

/**
 * Comprehensive V3 → V4 migration implementing all Alpha 3 V4 amendments.
 */
export function migrateV3ToV4Full(v3: SaveDataV3): V4MigrationResult {
  const capabilityFloors: string[] = [];

  // Build mutable working state from V3
  let progression: ProgressionStateV4 = { scrap: v3.progression.scrap, unlocks: [...v3.progression.unlocks] };
  const stages: Record<string, StageProgress> = { ...v3.stages };
  const achievements: Record<string, AchievementProgress> = { ...v3.achievements };
  const achievementMetrics: Record<string, number> = { ...v3.achievementMetrics };
  const characters: Record<string, MasteryProgress> = { ...v3.characters };
  let selectedCharacterId: string | undefined = v3.selectedCharacterId;
  const gunsmithParts: Record<string, PartInstance> = { ...v3.gunsmith.parts };
  const gunsmithBuilds: Build[] = [...v3.gunsmith.builds];
  let gunsmithSelectedBuildId: string | undefined = v3.gunsmith.selectedBuildId;
  const equipment: Record<string, EquipmentInstance> = { ...v3.equipment };
  let equipmentLoadout: Record<string, string | undefined> = v3.equipmentLoadout ? { ...v3.equipmentLoadout } : {};
  const items: Record<string, number> = { ...v3.items };
  const bosses: Record<string, BossProgress> = { ...v3.bosses };
  let pendingAchievementReports: string[] = [...v3.pendingAchievementReports];
  const appliedGrantTransactions: Record<string, true> = { ...v3.appliedGrantTransactions };
  const grantTransactionFingerprints: Record<string, string> = { ...v3.grantTransactionFingerprints };

  // Step 3: Repair historical Boss facts from Stage completion
  for (const [stageId, bossId] of Object.entries(HISTORICAL_BOSS_REPAIR)) {
    if (stages[stageId]?.completed === true && !bosses[bossId]?.defeated) {
      bosses[bossId] = Object.freeze({ defeated: true });
    }
  }

  // Step 4: Evaluate frozen RC1 Mercenary selectability
  const existingEntitlements = new Set(progression.unlocks);
  let unlocksMutable = [...progression.unlocks];
  for (const [characterId, rule] of Object.entries(RC1_MERCENARY_RULES)) {
    const entitlementId = `character:${characterId}`;
    if (!existingEntitlements.has(entitlementId) && rule(v3)) {
      unlocksMutable.push(entitlementId);
    }
  }

  progression = { scrap: progression.scrap, unlocks: unlocksMutable };

  // Step 5: Settle First Victory V3 token-only gap
  const firstVictoryToken = 'achievement:first-victory';
  const firstVictoryCompletion = achievements[firstVictoryToken];
  const hasFirstVictoryToken = progression.unlocks.includes(firstVictoryToken);
  if (!firstVictoryCompletion?.completed && hasFirstVictoryToken) {
    achievements[firstVictoryToken] = Object.freeze({ completed: true });
    progression = { scrap: safeAddScrap(progression.scrap, 25), unlocks: progression.unlocks };
  }

  // Step 6: Settle frozen condition-Achievement gaps
  for (const [achievementId, gap] of Object.entries(RC1_CONDITION_ACHIEVEMENT_GAPS)) {
    if (achievements[achievementId]?.completed) continue;
    if (!gap.condition(v3)) continue;

    const reward = gap.reward();
    progression = { scrap: safeAddScrap(progression.scrap, reward.scrap), unlocks: progression.unlocks };
    if (reward.unlocks) {
      for (const unlock of reward.unlocks) {
        if (!progression.unlocks.includes(unlock)) {
          progression = { scrap: progression.scrap, unlocks: [...progression.unlocks, unlock] };
        }
      }
    }
    if (reward.equipment) {
      for (const [instanceId, eq] of Object.entries(reward.equipment)) {
        if (!equipment[instanceId]) {
          equipment[instanceId] = Object.freeze({ equipmentId: eq.equipmentId, tier: eq.tier });
        }
      }
    }
    achievements[achievementId] = Object.freeze({ completed: true });
  }

  // Step 7: Settle retired Well Protected
  const wellProtectedId = 'achievement:permanent-reinforced-coat-3';
  if (!achievements[wellProtectedId]?.completed) {
    const vestLevel = v3.progression.permanentUpgrades['reinforced-vest'] ?? 0;
    if (vestLevel >= 3) {
      achievements[wellProtectedId] = Object.freeze({ completed: true });
      progression = { scrap: safeAddScrap(progression.scrap, 150), unlocks: progression.unlocks };
    }
  }

  // Step 8: Derive historical Equipment tier capability floor
  const crusherDownCompleted = achievements['achievement:boss-crusher']?.completed === true;
  const bossCrusherDefeated = bosses['boss-crusher']?.defeated === true;
  const j2Completed = v3.stages['stage:junkyard-02']?.completed === true;

  if (crusherDownCompleted) {
    capabilityFloors.push('capability:equipment-tier-4');
  } else if (bossCrusherDefeated) {
    capabilityFloors.push('capability:equipment-tier-3');
  } else if (j2Completed) {
    capabilityFloors.push('capability:equipment-tier-2');
  }

  // Step 9: Apply Warden Mastered-Fire / Warden-Down historical bridge
  const bossForgeDefeated = bosses['boss-forge']?.defeated === true;
  const masteredFireInstanceId = 'reward:stage-06-mastered-fire-trait';
  if (bossForgeDefeated && !gunsmithParts[masteredFireInstanceId]) {
    gunsmithParts[masteredFireInstanceId] = Object.freeze({
      partId: 'part:trait-fire-mastered',
      tier: 3,
      infusedTraits: Object.freeze([]),
    });
  }
  const wardenDownId = 'achievement:boss-forge';
  if (bossForgeDefeated && !achievements[wardenDownId]?.completed) {
    achievements[wardenDownId] = Object.freeze({ completed: true });
  }

  // Step 10: Collapse legitimate duplicate Equipment and refund
  const helmetEquipmentId = 'equipment:commando-helmet';
  const helmetInstances = Object.entries(equipment)
    .filter(([, inst]) => inst.equipmentId === helmetEquipmentId);

  if (helmetInstances.length > 1) {
    const instanceIds = helmetInstances.map(([id]) => id);
    const isLegitimatePair =
      instanceIds.includes(LEGACY_DUPLICATE_HELMET_PAIR[0]) &&
      instanceIds.includes(LEGACY_DUPLICATE_HELMET_PAIR[1]);

    const sorted = [...helmetInstances].sort(([idA, instA], [idB, instB]) => {
      if (instB.tier !== instA.tier) return instB.tier - instA.tier;
      const equippedA = Object.values(equipmentLoadout).includes(idA);
      const equippedB = Object.values(equipmentLoadout).includes(idB);
      if (equippedA !== equippedB) return equippedA ? -1 : 1;
      return idA < idB ? -1 : 1;
    });

    const survivor = sorted[0];
    const removed = sorted.slice(1);

    if (isLegitimatePair) {
      for (const [, removedInst] of removed) {
        const refund = DUPLICATE_REFUND_BY_TIER[removedInst.tier] ?? 0;
        progression = { scrap: safeAddScrap(progression.scrap, refund), unlocks: progression.unlocks };
      }
    }

    // Keep only the survivor (and non-helmet equipment)
    const newEquipment: Record<string, EquipmentInstance> = {};
    newEquipment[survivor[0]] = survivor[1];
    for (const [id, inst] of Object.entries(equipment)) {
      if (inst.equipmentId !== helmetEquipmentId || id === survivor[0]) {
        newEquipment[id] = inst;
      }
    }
    for (const key of Object.keys(equipment)) delete equipment[key];
    for (const [key, val] of Object.entries(newEquipment)) equipment[key] = val;

    // Rewrite loadout to survivor
    for (const slot of Object.keys(equipmentLoadout)) {
      const currentId = equipmentLoadout[slot];
      if (currentId && removed.some(([id]) => id === currentId)) {
        equipmentLoadout[slot] = survivor[0];
      }
    }
  }

  // Step 11: Sanitize Part trait state
  const sanitizedParts: Record<string, PartInstance> = {};
  for (const [id, part] of Object.entries(gunsmithParts)) {
    const infusedTraits = part.infusedTraits.length > 2
      ? part.infusedTraits.slice(0, 2)
      : [...part.infusedTraits];
    sanitizedParts[id] = Object.freeze({
      partId: part.partId,
      tier: part.tier,
      infusedTraits: Object.freeze(infusedTraits),
    });
  }

  // Step 12: Clear incomparable bestTimeMs and retire Boss firstDefeatedAt
  for (const stageId of CURRENT_TEN_STAGE_IDS) {
    if (stages[stageId]?.completed) {
      stages[stageId] = Object.freeze({ completed: true });
    }
  }
  const sanitizedBosses: Record<string, BossProgress> = {};
  for (const [id, boss] of Object.entries(bosses)) {
    sanitizedBosses[id] = Object.freeze({ defeated: boss.defeated });
  }
  for (const key of Object.keys(bosses)) delete bosses[key];
  for (const [key, val] of Object.entries(sanitizedBosses)) bosses[key] = val;

  // Step 13: Remove Achievement shadow tokens and permanent upgrades
  progression = {
    scrap: progression.scrap,
    unlocks: progression.unlocks.filter((id) => {
      if (id.startsWith('achievement:')) return false;
      if (id.startsWith('permanent-level:')) return false;
      return true;
    }),
  };

  // Add capability floors as explicit entitlements
  for (const cap of capabilityFloors) {
    if (!progression.unlocks.includes(cap)) {
      progression = { scrap: progression.scrap, unlocks: [...progression.unlocks, cap] };
    }
  }

  // Step 14: Prune non-reportable platform outbox entries
  pendingAchievementReports = pendingAchievementReports.filter((id) =>
    KNOWN_V3_ACHIEVEMENT_IDS.includes(id),
  );

  // Step 15: Build and freeze the V4 save
  const save = freezeSaveV4({
    version: 4,
    settings: v3.settings,
    progression: freezeProgressionV4(progression),
    stages: Object.freeze(Object.fromEntries(
      Object.entries(stages).map(([id, s]) => [id, Object.freeze({ ...s })]),
    )),
    achievements: Object.freeze(Object.fromEntries(
      Object.entries(achievements).map(([id, a]) => [id, Object.freeze({ ...a })]),
    )),
    achievementMetrics: Object.freeze({ ...achievementMetrics }),
    characters: Object.freeze(Object.fromEntries(
      Object.entries(characters).map(([id, c]) => [id, Object.freeze({ ...c })]),
    )),
    selectedCharacterId,
    gunsmith: Object.freeze({
      builds: Object.freeze(gunsmithBuilds.map((b) =>
        Object.freeze({ ...b, fitted: Object.freeze({ ...b.fitted }), traitParts: Object.freeze([...b.traitParts]) }),
      )),
      parts: Object.freeze(sanitizedParts),
      selectedBuildId: gunsmithSelectedBuildId,
      fabricationSerials: Object.freeze({}),
    }),
    equipment: Object.freeze(Object.fromEntries(
      Object.entries(equipment).map(([id, e]) => [id, Object.freeze({ ...e })]),
    )),
    equipmentLoadout: Object.freeze({ ...equipmentLoadout }),
    items: Object.freeze({ ...items }),
    bosses: Object.freeze(Object.fromEntries(
      Object.entries(bosses).map(([id, b]) => [id, Object.freeze({ ...b })]),
    )),
    compendium: Object.freeze({}),
    pendingAchievementReports: Object.freeze([...pendingAchievementReports]),
    appliedGrantTransactions: Object.freeze({ ...appliedGrantTransactions }),
    grantTransactionFingerprints: Object.freeze({ ...grantTransactionFingerprints }),
  });

  return { save, capabilityFloors };
}

// ── V4 Achievement reconciliation ────────────────────────────────────

export interface V4AchievementCompletion {
  readonly achievementId: string;
  readonly completed: boolean;
  readonly scrapAwarded: number;
}

/**
 * Generic V4 load-time Achievement reconciliation.
 * Evaluates active V4 Achievements against current canonical facts and
 * completes any that are satisfied but missing.
 */
export function reconcileV4Achievements(
  _save: SaveDataV4,
  facts: {
    stages: StageProgressState;
    bosses: BossProgressState;
    metrics: AchievementMetricState;
    characters: CharacterMasteryState;
    achievements: AchievementProgressState;
  },
): { readonly completions: readonly V4AchievementCompletion[]; readonly scrapAwarded: number } {
  const completions: V4AchievementCompletion[] = [];
  let scrapAwarded = 0;

  for (const achievementId of ACTIVE_V4_ACHIEVEMENT_IDS) {
    if (facts.achievements[achievementId]?.completed) continue;

    let shouldComplete = false;
    let scrapReward = 0;

    switch (achievementId) {
      case 'achievement:first-victory':
        shouldComplete = (facts.metrics['metric:runs-completed'] ?? 0) >= 1;
        scrapReward = 25;
        break;
      case 'achievement:first-blood':
        shouldComplete = (facts.metrics['metric:kills'] ?? 0) >= 1;
        break;
      case 'achievement:scrap-squad':
        shouldComplete = (facts.metrics['metric:scrap-banked'] ?? 0) >= 500;
        break;
      case 'achievement:junkyard-veteran':
        shouldComplete =
          facts.stages['stage:junkyard-01']?.completed === true &&
          facts.stages['stage:junkyard-02']?.completed === true &&
          facts.stages['stage:junkyard-03']?.completed === true &&
          facts.stages['stage:junkyard-04']?.completed === true &&
          facts.stages['stage:junkyard-05']?.completed === true &&
          facts.stages['stage:junkyard-06']?.completed === true;
        break;
      case 'achievement:forge-initiate':
        shouldComplete =
          facts.stages['stage:forge-01']?.completed === true &&
          facts.stages['stage:forge-02']?.completed === true &&
          facts.stages['stage:forge-03']?.completed === true &&
          facts.stages['stage:forge-04']?.completed === true;
        break;
      case 'achievement:scrap-tycoon':
        shouldComplete = (facts.metrics['metric:scrap-banked'] ?? 0) >= 10000;
        break;
      case 'achievement:boss-crusher':
        shouldComplete = facts.bosses['boss-crusher']?.defeated === true;
        scrapReward = 100;
        break;
      case 'achievement:chapter-junkyard':
        shouldComplete =
          facts.stages['stage:junkyard-01']?.completed === true &&
          facts.stages['stage:junkyard-02']?.completed === true &&
          facts.stages['stage:junkyard-03']?.completed === true &&
          facts.stages['stage:junkyard-04']?.completed === true &&
          facts.stages['stage:junkyard-05']?.completed === true;
        scrapReward = 200;
        break;
      case 'achievement:mastery-scrap-tabby':
        shouldComplete = (facts.characters['scrap-tabby']?.tier ?? 0) >= 1;
        scrapReward = 75;
        break;
      case 'achievement:boss-forge':
        shouldComplete = facts.bosses['boss-forge']?.defeated === true;
        break;
      case 'achievement:kill-milestone-25':
        shouldComplete = (facts.metrics['metric:kills'] ?? 0) >= 25;
        break;
      case 'achievement:kill-milestone-100':
        shouldComplete = (facts.metrics['metric:kills'] ?? 0) >= 100;
        break;
    }

    if (shouldComplete) {
      completions.push({ achievementId, completed: true, scrapAwarded: scrapReward });
      scrapAwarded += scrapReward;
    }
  }

  return { completions, scrapAwarded };
}

// ── Run terminal settlement ──────────────────────────────────────────

export interface RunTerminalInput {
  readonly terminalStatus: 'win' | 'loss';
  readonly runScrap: number;
  readonly characterId: string;
  readonly runDurationMs: number;
  readonly stageId?: string;
  readonly bossId?: string;
  readonly isTraining?: boolean;
}

export interface RunTerminalSettlementResult {
  readonly ok: boolean;
  readonly terminalApplied: boolean;
  readonly runScrapBanked: number;
  readonly firstClear: boolean;
  readonly bestTimeImproved: boolean;
  readonly firstClearScrap: number;
  readonly persistentGrantIds: readonly string[];
  readonly achievementIdsCompleted: readonly string[];
  readonly scrapAwardedFromAchievements: number;
  readonly masteryTierAwarded: number;
}

export interface AchievementDefinition {
  readonly id: string;
  readonly condition: (save: SaveDataV4, stageId?: string, bossId?: string, metrics?: Record<string, number>) => boolean;
  readonly scrapReward?: number;
}

/**
 * One atomic candidate save for a normal V4 run terminal event.
 * Persists once, publishes once. Storage failure publishes none.
 */
export function settleRunTerminal(
  currentSave: SaveDataV4,
  input: RunTerminalInput,
  resolveFirstClearReward: (stageId: string) => { scrap: number; grants?: readonly ProgressionGrant[] } | null,
  resolveMasteryAward: (characterId: string, currentTier: number, currentXp: number) => { tier: number; xp: number; tierAwarded: number },
  achievementDefinitions: readonly AchievementDefinition[],
): { result: RunTerminalSettlementResult; candidate: SaveDataV4 } {
  let progression: ProgressionStateV4 = {
    scrap: currentSave.progression.scrap,
    unlocks: [...currentSave.progression.unlocks],
  };
  const stages: Record<string, StageProgress> = { ...currentSave.stages };
  const achievements: Record<string, AchievementProgress> = { ...currentSave.achievements };
  const metrics: Record<string, number> = { ...currentSave.achievementMetrics };
  const characters: Record<string, MasteryProgress> = { ...currentSave.characters };
  const bosses: Record<string, BossProgress> = { ...currentSave.bosses };
  const pendingReports: string[] = [...currentSave.pendingAchievementReports];
  let firstClear = false;
  let bestTimeImproved = false;
  let firstClearScrap = 0;
  const persistentGrantIds: string[] = [];
  const achievementIdsCompleted: string[] = [];
  let scrapAwardedFromAchievements = 0;
  let masteryTierAwarded = 0;

  // Bank run Scrap (both win and loss)
  const bankedScrap = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(input.runScrap)));
  progression = { scrap: Math.min(Number.MAX_SAFE_INTEGER, progression.scrap + bankedScrap), unlocks: progression.unlocks };

  // Update scrap-banked metric
  const currentScrapBanked = metrics['metric:scrap-banked'] ?? 0;
  metrics['metric:scrap-banked'] = currentScrapBanked + bankedScrap;

  if (input.terminalStatus === 'win' && !input.isTraining && input.stageId) {
    const existingStage = stages[input.stageId];
    firstClear = !existingStage?.completed;

    // Update Stage fact
    const currentBestTime = existingStage?.bestTimeMs;
    bestTimeImproved = firstClear || (currentBestTime !== undefined && input.runDurationMs < currentBestTime);
    const newBestTime = firstClear || bestTimeImproved ? input.runDurationMs : currentBestTime;
    stages[input.stageId] = Object.freeze({
      completed: true,
      ...(newBestTime !== undefined ? { bestTimeMs: newBestTime } : {}),
    });

    // Update Boss fact
    if (input.bossId && !bosses[input.bossId]?.defeated) {
      bosses[input.bossId] = Object.freeze({ defeated: true });
    }

    // Apply first-clear reward if applicable
    if (firstClear) {
      const reward = resolveFirstClearReward(input.stageId);
      if (reward) {
        firstClearScrap = reward.scrap;
        progression = {
          scrap: Math.min(Number.MAX_SAFE_INTEGER, progression.scrap + reward.scrap),
          unlocks: progression.unlocks,
        };
        if (reward.grants) {
          for (const grant of reward.grants) {
            if (grant.type === 'grant-part-instance' && grant.instanceId) {
              persistentGrantIds.push(grant.instanceId);
            }
          }
        }
      }
    }

    // Update win metrics
    const currentRunsCompleted = metrics['metric:runs-completed'] ?? 0;
    metrics['metric:runs-completed'] = currentRunsCompleted + 1;

    // Apply win mastery
    const currentMastery = characters[input.characterId] ?? { tier: 0, xp: 0 };
    const masteryResult = resolveMasteryAward(input.characterId, currentMastery.tier, currentMastery.xp);
    characters[input.characterId] = Object.freeze({ tier: masteryResult.tier, xp: masteryResult.xp });
    masteryTierAwarded = masteryResult.tierAwarded;

    // Evaluate Achievements against candidate facts
    for (const def of achievementDefinitions) {
      if (achievements[def.id]?.completed) continue;
      if (def.condition(currentSave, input.stageId, input.bossId, metrics)) {
        achievements[def.id] = Object.freeze({ completed: true });
        achievementIdsCompleted.push(def.id);
        if (def.scrapReward && def.scrapReward > 0) {
          progression = {
            scrap: Math.min(Number.MAX_SAFE_INTEGER, progression.scrap + def.scrapReward),
            unlocks: progression.unlocks,
          };
          scrapAwardedFromAchievements += def.scrapReward;
        }
        if (!pendingReports.includes(def.id)) {
          pendingReports.push(def.id);
        }
      }
    }
  }

  // Build final candidate
  const candidate: SaveDataV4 = freezeSaveV4({
    version: 4,
    settings: currentSave.settings,
    progression: freezeProgressionV4(progression),
    stages: Object.freeze(Object.fromEntries(
      Object.entries(stages).map(([id, s]) => [id, Object.freeze({ ...s })]),
    )),
    achievements: Object.freeze(Object.fromEntries(
      Object.entries(achievements).map(([id, a]) => [id, Object.freeze({ ...a })]),
    )),
    achievementMetrics: Object.freeze({ ...metrics }),
    characters: Object.freeze(Object.fromEntries(
      Object.entries(characters).map(([id, c]) => [id, Object.freeze({ ...c })]),
    )),
    selectedCharacterId: currentSave.selectedCharacterId,
    gunsmith: currentSave.gunsmith,
    equipment: currentSave.equipment,
    equipmentLoadout: currentSave.equipmentLoadout,
    items: currentSave.items,
    bosses: Object.freeze(Object.fromEntries(
      Object.entries(bosses).map(([id, b]) => [id, Object.freeze({ ...b })]),
    )),
    compendium: currentSave.compendium,
    pendingAchievementReports: Object.freeze([...pendingReports]),
    appliedGrantTransactions: currentSave.appliedGrantTransactions,
    grantTransactionFingerprints: currentSave.grantTransactionFingerprints,
  });

  const result: RunTerminalSettlementResult = {
    ok: true,
    terminalApplied: true,
    runScrapBanked: bankedScrap,
    firstClear,
    bestTimeImproved,
    firstClearScrap,
    persistentGrantIds,
    achievementIdsCompleted,
    scrapAwardedFromAchievements,
    masteryTierAwarded,
  };

  return { result, candidate };
}

// ── V4 SaveManager ───────────────────────────────────────────────────

/**
 * V4-aware SaveManager that handles V1-V4 migration and V4 persistence.
 * Keeps the existing LocalStorage key `meowcenary.save.v2`.
 */
export class SaveManagerV4 {
  private writeProtected = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly key: string = 'meowcenary.save.v2',
  ) {}

  /** Load and migrate to V4. Returns a complete V4 save. */
  load(): SaveDataV4 {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return createDefaultSaveV4();
      const parsed = this.parseRaw(raw);
      if (!isPlainRecord(parsed)) return createDefaultSaveV4();

      const version = parsed['version'];
      if (version === 4) {
        return this.sanitizeV4(parsed as Record<string, unknown>);
      }
      if (version === 3 || version === 2 || version === 1) {
        return this.migrateToV4(parsed as Record<string, unknown>);
      }
      if (Number.isSafeInteger(version) && (version as number) > 4) {
        this.writeProtected = true;
      }
      return createDefaultSaveV4();
    } catch {
      return createDefaultSaveV4();
    }
  }

  /** Save V4 state. */
  save(data: SaveDataV4): boolean {
    if (this.writeProtected) return false;
    try {
      return this.storage.setItem(this.key, JSON.stringify(data)) === true;
    } catch {
      return false;
    }
  }

  /** Clear all save data. */
  clear(): boolean {
    try {
      const cleared = this.storage.removeItem(this.key) === true;
      if (cleared) this.writeProtected = false;
      return cleared;
    } catch {
      return false;
    }
  }

  private parseRaw(raw: string): unknown {
    if (raw.trim() === '') return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  /** Migrate raw save to V4 (handles V1-V3 via existing migration path). */
  private migrateToV4(raw: Record<string, unknown>): SaveDataV4 {
    // For V1 and V2, we need to use the existing migration path
    // But since we can't import migrate() from save without circular deps,
    // we do a simple V3 normalization first
    const version = raw['version'];
    let v3: SaveDataV3;

    if (version === 1) {
      v3 = {
        version: 3,
        settings: this.sanitizeSettings(raw['settings'] as any),
        progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
        stages: {},
        achievements: {},
        achievementMetrics: {},
        characters: {},
        gunsmith: { builds: [], parts: {} },
        equipment: {},
        equipmentLoadout: {},
        items: {},
        bosses: {},
        pendingAchievementReports: [],
        appliedGrantTransactions: {},
        grantTransactionFingerprints: {},
      };
    } else if (version === 2) {
      const meta = this.sanitizeV2Meta(raw['meta'] as any);
      const achievements: AchievementProgressState = {};
      if (meta.unlocks.includes('achievement:first-victory')) {
        achievements['achievement:first-victory'] = { completed: true };
      }
      v3 = {
        version: 3,
        settings: this.sanitizeSettings(raw['settings'] as any),
        progression: { scrap: meta.scrap, unlocks: [...meta.unlocks], permanentUpgrades: { ...meta.permanentUpgrades } },
        stages: {},
        achievements,
        achievementMetrics: {},
        characters: {},
        gunsmith: { builds: [], parts: {} },
        equipment: {},
        equipmentLoadout: {},
        items: {},
        bosses: {},
        pendingAchievementReports: [],
        appliedGrantTransactions: {},
        grantTransactionFingerprints: {},
      };
    } else {
      // V3
      v3 = raw as unknown as SaveDataV3;
    }

    const { save: v4 } = migrateV3ToV4Full(v3);
    return v4;
  }

  private sanitizeSettings(raw: unknown): Settings {
    if (!isPlainRecord(raw)) return DEFAULT_SETTINGS;
    return Object.freeze({
      muted: typeof raw['muted'] === 'boolean' ? raw['muted'] as boolean : DEFAULT_SETTINGS.muted,
      musicVolume: typeof raw['musicVolume'] === 'number' && Number.isFinite(raw['musicVolume'])
        ? Math.min(1, Math.max(0, raw['musicVolume'] as number)) : DEFAULT_SETTINGS.musicVolume,
      sfxVolume: typeof raw['sfxVolume'] === 'number' && Number.isFinite(raw['sfxVolume'])
        ? Math.min(1, Math.max(0, raw['sfxVolume'] as number)) : DEFAULT_SETTINGS.sfxVolume,
      reducedMotion: typeof raw['reducedMotion'] === 'boolean' ? raw['reducedMotion'] as boolean : DEFAULT_SETTINGS.reducedMotion,
    });
  }

  private sanitizeV2Meta(raw: unknown): { scrap: number; unlocks: string[]; permanentUpgrades: Record<string, number> } {
    if (!isPlainRecord(raw)) return { scrap: 0, unlocks: [], permanentUpgrades: {} };
    return {
      scrap: Number.isSafeInteger(raw['scrap']) && (raw['scrap'] as number) >= 0 ? raw['scrap'] as number : 0,
      unlocks: Array.isArray(raw['unlocks'])
        ? (raw['unlocks'] as unknown[]).filter((id): id is string => typeof id === 'string')
        : [],
      permanentUpgrades: isPlainRecord(raw['permanentUpgrades'])
        ? Object.fromEntries(
            Object.entries(raw['permanentUpgrades'] as Record<string, unknown>)
              .filter(([, v]) => Number.isSafeInteger(v) && (v as number) > 0)
              .map(([k, v]) => [k, v as number]),
          )
        : {},
    };
  }

  private sanitizeV4(raw: Record<string, unknown>): SaveDataV4 {
    // Minimal sanitization for V4 - trust the V4 format
    const progression = this.sanitizeProgressionV4(raw['progression'] as any);
    return freezeSaveV4({
      version: 4,
      settings: this.sanitizeSettings(raw['settings'] as any),
      progression,
      stages: this.sanitizeRecord(raw['stages'] as any) as unknown as StageProgressState,
      achievements: this.sanitizeRecord(raw['achievements'] as any) as unknown as AchievementProgressState,
      achievementMetrics: Object.freeze({}),
      characters: this.sanitizeRecord(raw['characters'] as any) as unknown as CharacterMasteryState,
      selectedCharacterId: typeof raw['selectedCharacterId'] === 'string' ? raw['selectedCharacterId'] as string : undefined,
      gunsmith: isPlainRecord(raw['gunsmith'])
        ? Object.freeze({
            builds: Object.freeze([]),
            parts: Object.freeze({}),
            selectedBuildId: undefined,
            fabricationSerials: Object.freeze({}),
          })
        : Object.freeze({ builds: Object.freeze([]), parts: Object.freeze({}), fabricationSerials: Object.freeze({}) }),
      equipment: Object.freeze({}),
      equipmentLoadout: Object.freeze({}),
      items: Object.freeze({}),
      bosses: Object.freeze({}),
      compendium: Object.freeze({}),
      pendingAchievementReports: Object.freeze([]),
      appliedGrantTransactions: Object.freeze({}),
      grantTransactionFingerprints: Object.freeze({}),
    });
  }

  private sanitizeProgressionV4(raw: unknown): ProgressionStateV4 {
    if (!isPlainRecord(raw)) return createDefaultProgressionV4();
    const scrap = Number.isSafeInteger(raw['scrap']) && (raw['scrap'] as number) >= 0 ? raw['scrap'] as number : 0;
    const unlocksRaw = raw['unlocks'];
    const unlocks: string[] = [];
    const seen = new Set<string>();
    if (Array.isArray(unlocksRaw)) {
      for (const id of unlocksRaw) {
        if (typeof id === 'string' && !seen.has(id)) {
          seen.add(id);
          unlocks.push(id);
        }
      }
    }
    return Object.freeze({ scrap, unlocks: Object.freeze(unlocks) });
  }

  private sanitizeRecord(raw: unknown): Record<string, unknown> {
    return isPlainRecord(raw) ? Object.freeze({ ...raw }) : Object.freeze({});
  }
}
