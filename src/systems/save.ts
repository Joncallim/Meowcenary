import { RuntimeConfig } from '../engine/config';
import { isContentId, isGrantTransactionId, isInstanceId, isUnlockId } from './ids';
import { BEHAVIOR_TRAITS, MAX_TRAITS_PER_PART, RARITY_TIER, WEAPON_SLOT_COMPATIBILITY, type PartSlot } from '../gameplay/gunsmith';
import { EQUIPMENT_TIERS } from '../gameplay/equipment';

export interface Settings {
  readonly muted: boolean;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
}

export type MetaStateV1 = Readonly<Record<string, never>>;

/** ProgressionState replaces the flat MetaState in V3. Same shape, new name
 *  per Alpha 3 architecture §4.2. */
export interface ProgressionState {
  readonly scrap: number;
  readonly unlocks: readonly string[];
  readonly permanentUpgrades: Readonly<Record<string, number>>;
}

/** Durable receipt IDs for source-owned progression transactions. */
export type AppliedGrantTransactions = Readonly<Record<string, true>>;
/** Binds a source receipt to its exact canonical durable payload. */
export type GrantTransactionFingerprints = Readonly<Record<string, string>>;
/** Sparse durable inventory counts.  Item definitions remain static content;
 * this map records only player-owned quantities and is committed with the
 * source reward receipt. */
export type ItemInventoryState = Readonly<Record<string, number>>;

export interface BossProgress { readonly defeated: boolean; readonly firstDefeatedAt?: number }
export type BossProgressState = Readonly<Record<string, BossProgress>>;

/** Backward-compatible alias: all existing gameplay functions accept MetaState. */
export type MetaState = ProgressionState;

export interface StageProgress {
  readonly completed: boolean;
  readonly bestTimeMs?: number;
}

export interface AchievementProgress {
  readonly completed: boolean;
  readonly progress?: number;
  readonly completedAt?: number;
}

export interface MasteryProgress {
  readonly tier: number;
  readonly xp: number;
}

/** Persistent player-owned weapon build (Epic 23). */
export interface Build {
  readonly id: string;
  readonly name: string;
  readonly baseWeaponFamily: string;
  readonly fitted: Readonly<Partial<Record<string, string>>>;
  readonly traitParts: readonly string[];
}

/** Persistent player-owned part instance (Epic 23). */
export interface PartInstance {
  readonly partId: string;
  /** Per-owned-copy engineering tier. Definition rarity is static content;
   * this is the material result of a merge and must survive reload. */
  readonly tier: number;
  readonly infusedTraits: readonly string[];
}

/** Placeholder: Equipment instance. Epic 25 defines the real shape. */
export interface EquipmentInstance {
  /** Exact equipment catalog definition ID; never a set-derived alias. */
  readonly equipmentId: string;
  readonly tier: number;
}

export interface GunsmithState {
  readonly builds: readonly Build[];
  readonly parts: Record<string, PartInstance>;
  /** Explicit equipped persistent main gun.  Definition IDs never stand in
   * for this player-owned build identity. */
  readonly selectedBuildId?: string;
}

export type StageProgressState = Record<string, StageProgress>;
export type AchievementProgressState = Record<string, AchievementProgress>;
/** Monotonic authoritative counters consumed by achievement metric extractors. */
export type AchievementMetricState = Readonly<Record<string, number>>;
export type CharacterMasteryState = Record<string, MasteryProgress>;
export type EquipmentState = Record<string, EquipmentInstance>;
export type EquipmentLoadoutState = Readonly<Partial<Record<'helmet' | 'armour' | 'gloves' | 'boots', string>>>;

export interface SaveDataV1 {
  readonly version: 1;
  readonly settings: Settings;
  readonly meta: MetaStateV1;
}

export interface SaveDataV2 {
  readonly version: 2;
  readonly settings: Settings;
  readonly meta: MetaState;
}

export interface SaveDataV3 {
  readonly version: 3;
  readonly settings: Settings;
  readonly progression: ProgressionState;
  readonly stages: StageProgressState;
  readonly achievements: AchievementProgressState;
  readonly achievementMetrics: AchievementMetricState;
  readonly characters: CharacterMasteryState;
  /** Last roster choice; GameContext validates it against current unlocks. */
  readonly selectedCharacterId?: string;
  readonly gunsmith: GunsmithState;
  readonly equipment: EquipmentState;
  readonly equipmentLoadout?: EquipmentLoadoutState;
  readonly items: ItemInventoryState;
  readonly bosses: BossProgressState;
  /** Durable outbox for best-effort native achievement mirrors. */
  readonly pendingAchievementReports: readonly string[];
  readonly appliedGrantTransactions: AppliedGrantTransactions;
  readonly grantTransactionFingerprints: GrantTransactionFingerprints;
}

export type SaveData = SaveDataV3;
export type MetaUpgradeMaxLevels = Readonly<Record<string, number>>;

/** Current save format version. Incremented to 3 per Alpha 3 architecture §4. */
export const CURRENT_SAVE_VERSION = 3;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  reducedMotion: false,
});

export function createDefaultProgression(): ProgressionState {
  return freezeProgression({ scrap: 0, unlocks: [], permanentUpgrades: {} });
}

/** @deprecated Use createDefaultProgression() for V3. */
export function createDefaultMeta(): MetaState {
  return createDefaultProgression();
}

export function createDefaultSaveV3(): SaveDataV3 {
  return freezeSaveV3({
    version: 3,
    settings: DEFAULT_SETTINGS,
    progression: createDefaultProgression(),
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
  });
}

export function createDefaultSave(): SaveData {
  return createDefaultSaveV3();
}

export function applySettingsPatch(
  settings: Settings,
  patch: Readonly<Partial<Settings>>,
): Settings {
  try {
    const next = sanitizeSettings(isPlainRecord(patch) ? { ...settings, ...patch } : settings, settings);
    return settingsEqual(settings, next) ? settings : next;
  } catch {
    return settings;
  }
}

export function sanitizeProgression(raw: unknown, maxLevels: MetaUpgradeMaxLevels): ProgressionState {
  try {
    return sanitizeProgressionRecord(raw, maxLevels);
  } catch {
    return createDefaultProgression();
  }
}

/** @deprecated Use sanitizeProgression() for V3. */
export function sanitizeMeta(raw: unknown, maxLevels: MetaUpgradeMaxLevels): MetaState {
  return sanitizeProgression(raw, maxLevels);
}

function sanitizeProgressionRecord(raw: unknown, maxLevels: MetaUpgradeMaxLevels): ProgressionState {
  if (!isPlainRecord(raw)) return createDefaultProgression();
  const scrapRaw = readOwn(raw, 'scrap');
  const scrap = isNonNegativeSafeInteger(scrapRaw) ? scrapRaw : 0;
  const unlocksRaw = readOwn(raw, 'unlocks');
  const unlocks: string[] = [];
  const seenUnlocks = new Set<string>();
  if (Array.isArray(unlocksRaw)) {
    for (const id of unlocksRaw) {
      if (typeof id === 'string' && isUnlockId(id) && !seenUnlocks.has(id)) {
        seenUnlocks.add(id);
        unlocks.push(id);
      }
    }
  }

  const permanentUpgrades: Record<string, number> = Object.create(null) as Record<string, number>;
  const upgradesRaw = readOwn(raw, 'permanentUpgrades');
  if (isPlainRecord(upgradesRaw)) {
    for (const id of Object.keys(upgradesRaw)) {
      const level = readOwn(upgradesRaw, id);
      if (!isContentId(id) || !Number.isSafeInteger(level) || (level as number) <= 0) continue;
      const max = readOwnMaxLevel(maxLevels, id);
      permanentUpgrades[id] = max === undefined ? level as number : Math.min(level as number, max);
    }
  }
  return freezeProgression({ scrap, unlocks, permanentUpgrades });
}

/** V2 → V3 migration per Alpha 3 architecture §4.4.
 *  Preserves: scrap → progression.scrap, unlocks → progression.unlocks,
 *  permanentUpgrades → progression.permanentUpgrades,
 *  achievement:first-victory → achievements['achievement:first-victory']. */
export function migrateV2ToV3(raw: Readonly<Record<string, unknown>>, maxLevels: MetaUpgradeMaxLevels = {}): SaveDataV3 {
  const v2Progression = sanitizeProgression(readOwn(raw, 'meta'), maxLevels);
  return freezeSaveV3({
    version: 3,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
    progression: v2Progression,
    stages: {},
    achievements: migrateAchievementsFromV2(v2Progression),
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
  });
}

function migrateAchievementsFromV2(progression: ProgressionState): AchievementProgressState {
  const achievements: AchievementProgressState = {};
  if (progression.unlocks.includes('achievement:first-victory')) {
    achievements['achievement:first-victory'] = {
      completed: true,
    };
  }
  return achievements;
}

/** Content-contract reconciliation, not a schema migration: old V3 saves
 * already contain the authoritative 100-kill achievement but were granted
 * the wrong character ID. Preserve legacy unlocks and add the canonical one
 * so no completed achievement becomes a permanent dead-end. */
function reconcileAchievementOwnedUnlocks(
  progression: ProgressionState,
  achievements: AchievementProgressState,
): ProgressionState {
  if (!achievements['achievement:kill-milestone-100']?.completed
    || progression.unlocks.includes('character:scrap-weasel')) return progression;
  return freezeProgression({
    ...progression,
    unlocks: [...progression.unlocks, 'character:scrap-weasel'],
  });
}

export function migrate(raw: unknown, maxLevels: MetaUpgradeMaxLevels = {}): SaveData {
  try { return decodeSave(raw, maxLevels).data; } catch { return createDefaultSaveV3(); }
}

interface SaveDecodeResult {
  readonly data: SaveData;
  readonly unsupportedFutureVersion: boolean;
}

function decodeSave(raw: unknown, maxLevels: MetaUpgradeMaxLevels): SaveDecodeResult {
  const parsed = parseRawSave(raw);
  if (!isPlainRecord(parsed)) return { data: createDefaultSaveV3(), unsupportedFutureVersion: false };
  const version = readOwn(parsed, 'version');
  if (version === 1) return { data: migrateV1ToV3(parsed), unsupportedFutureVersion: false };
  if (version === 2) return { data: migrateV2ToV3(parsed, maxLevels), unsupportedFutureVersion: false };
  if (version === 3) {
    const equipment = sanitizeEquipmentState(readOwn(parsed, 'equipment'));
    const selectedCharacterId = sanitizeSelectedCharacterId(readOwn(parsed, 'selectedCharacterId'));
    const achievements = sanitizeAchievementProgress(readOwn(parsed, 'achievements'));
    return {
      data: freezeSaveV3({
        version: 3,
        settings: sanitizeSettings(readOwn(parsed, 'settings'), DEFAULT_SETTINGS),
        progression: reconcileAchievementOwnedUnlocks(sanitizeProgression(readOwn(parsed, 'progression'), maxLevels), achievements),
        stages: sanitizeStageProgress(readOwn(parsed, 'stages')),
        achievements,
        achievementMetrics: sanitizeAchievementMetrics(readOwn(parsed, 'achievementMetrics')),
        characters: sanitizeCharacterMastery(readOwn(parsed, 'characters')),
        ...(selectedCharacterId === undefined ? {} : { selectedCharacterId }),
        gunsmith: sanitizeGunsmithState(readOwn(parsed, 'gunsmith')),
        equipment,
        equipmentLoadout: sanitizeEquipmentLoadout(readOwn(parsed, 'equipmentLoadout'), equipment),
        items: sanitizeItemInventory(readOwn(parsed, 'items')),
        bosses: sanitizeBossProgress(readOwn(parsed, 'bosses')),
        pendingAchievementReports: sanitizePendingAchievementReports(readOwn(parsed, 'pendingAchievementReports')),
        appliedGrantTransactions: sanitizeAppliedGrantTransactions(readOwn(parsed, 'appliedGrantTransactions')),
        grantTransactionFingerprints: sanitizeGrantTransactionFingerprints(readOwn(parsed, 'grantTransactionFingerprints')),
      }),
      unsupportedFutureVersion: false,
    };
  }
  return {
    data: createDefaultSaveV3(),
    unsupportedFutureVersion: Number.isSafeInteger(version) && (version as number) > 3,
  };
}

function migrateV1ToV3(raw: Readonly<Record<string, unknown>>): SaveDataV3 {
  return freezeSaveV3({
    version: 3,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
    progression: createDefaultProgression(),
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
  });
}

// ── V3 domain sanitizers ────────────────────────────────────────────

function sanitizeStageProgress(raw: unknown): StageProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, StageProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isUnlockId(key) || !key.startsWith('stage:')) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const completed = readOwn(entry, 'completed');
    const bestTimeMs = readOwn(entry, 'bestTimeMs');
    result[key] = {
      completed: typeof completed === 'boolean' ? completed : false,
      ...(Number.isSafeInteger(bestTimeMs) && (bestTimeMs as number) > 0
        ? { bestTimeMs: bestTimeMs as number }
        : {}),
    };
  }
  return result;
}

function sanitizeAchievementProgress(raw: unknown): AchievementProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, AchievementProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isUnlockId(key) || !key.startsWith('achievement:')) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const completed = readOwn(entry, 'completed');
    const progress = readOwn(entry, 'progress');
    const completedAt = readOwn(entry, 'completedAt');
    result[key] = {
      completed: typeof completed === 'boolean' ? completed : false,
      ...(Number.isSafeInteger(progress) && (progress as number) >= 0
        ? { progress: progress as number }
        : {}),
      ...(Number.isSafeInteger(completedAt) && (completedAt as number) > 0
        ? { completedAt: completedAt as number }
        : {}),
    };
  }
  return result;
}

function sanitizeAchievementMetrics(raw: unknown): AchievementMetricState {
  if (!isPlainRecord(raw)) return Object.freeze({});
  const result: Record<string, number> = Object.create(null);
  for (const id of Object.keys(raw)) {
    const value = readOwn(raw, id);
    if (isUnlockId(id) && id.startsWith('metric:') && Number.isSafeInteger(value) && (value as number) >= 0) result[id] = value as number;
  }
  return Object.freeze(result);
}

function sanitizeCharacterMastery(raw: unknown): CharacterMasteryState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, MasteryProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isContentId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const tier = readOwn(entry, 'tier');
    const xp = readOwn(entry, 'xp');
    result[key] = {
      tier: Number.isSafeInteger(tier) && (tier as number) >= 0 ? tier as number : 0,
      xp: Number.isSafeInteger(xp) && (xp as number) >= 0 ? xp as number : 0,
    };
  }
  return result;
}

function sanitizeGunsmithState(raw: unknown): GunsmithState {
  if (!isPlainRecord(raw)) return { builds: [], parts: {} };
  const buildsRaw = readOwn(raw, 'builds');
  const partsRaw = readOwn(raw, 'parts');
  const parts: Record<string, PartInstance> = Object.create(null);
  if (isPlainRecord(partsRaw)) {
    for (const key of Object.keys(partsRaw)) {
      if (!isInstanceId(key)) continue;
      const entry = readOwn(partsRaw as Record<string, unknown>, key);
      if (!isPlainRecord(entry)) continue;
      const partId = readOwn(entry, 'partId');
      if (typeof partId === 'string' && isUnlockId(partId) && partId.startsWith('part:')) {
        const infused = readOwn(entry, 'infusedTraits');
        // Save data is user-controlled input.  Keep the durable owned-instance
        // contract bounded and vocabulary-safe so a hand-edited tier or trait
        // cannot turn into unbounded live weapon modifiers after a reload.
        const validTraits = new Set<string>(BEHAVIOR_TRAITS);
        const rawTier = readOwn(entry, 'tier');
        parts[key] = {
          partId,
          tier: Number.isSafeInteger(rawTier) && (rawTier as number) > 0
            ? Math.min(rawTier as number, RARITY_TIER.legendary)
            : 1,
          infusedTraits: Array.isArray(infused)
            ? (infused as unknown[])
              .filter((t): t is string => typeof t === 'string' && validTraits.has(t))
              .filter((trait, index, all) => all.indexOf(trait) === index)
              .slice(0, MAX_TRAITS_PER_PART)
            : [],
        };
      }
    }
  }
  // Old pre-foundation builds stored static part definition IDs. Convert only
  // the unambiguous case; a duplicated definition must never pick an arbitrary
  // owned copy and silently lose its infusion/tier identity.
  const uniqueInstanceByDefinition = new Map<string, string | undefined>();
  for (const [instanceId, part] of Object.entries(parts)) {
    uniqueInstanceByDefinition.set(
      part.partId,
      uniqueInstanceByDefinition.has(part.partId) ? undefined : instanceId,
    );
  }
  const asOwnedReference = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    if (Object.hasOwn(parts, value)) return value;
    return uniqueInstanceByDefinition.get(value);
  };
  const builds: Build[] = Array.isArray(buildsRaw)
    ? buildsRaw.filter((b): b is Record<string, unknown> => isPlainRecord(b) && typeof readOwn(b, 'id') === 'string')
        .map((b) => sanitizeBuild(b, asOwnedReference))
    : [];
  const selectedBuildId = readOwn(raw, 'selectedBuildId');
  return {
    builds,
    parts,
    ...(typeof selectedBuildId === 'string' && builds.some((build) => build.id === selectedBuildId)
      ? { selectedBuildId }
      : {}),
  };
}

function sanitizeBuild(
  raw: Record<string, unknown>,
  asOwnedReference: (value: unknown) => string | undefined,
): Build {
  const rawFamily = readOwn(raw, 'baseWeaponFamily');
  const baseWeaponFamily = typeof rawFamily === 'string' && Object.hasOwn(WEAPON_SLOT_COMPATIBILITY, rawFamily)
    ? rawFamily
    : 'pistol';
  const fitted = sanitizeFittedParts(readOwn(raw, 'fitted'), asOwnedReference, baseWeaponFamily);
  // A corrupt save must not multiply one owned part through several slots or
  // append it again as a trait. Keep the first canonical fitted occurrence;
  // trait ordering remains stable for the remaining distinct references.
  const used = new Set(Object.values(fitted));
  const traitParts = Array.isArray(readOwn(raw, 'traitParts'))
    ? (readOwn(raw, 'traitParts') as unknown[])
      .map(asOwnedReference)
      .filter((instanceId): instanceId is string => instanceId !== undefined && !used.has(instanceId))
      .filter((instanceId) => {
        used.add(instanceId);
        return true;
      })
    : [];
  return {
    id: readOwn(raw, 'id') as string,
    name: typeof readOwn(raw, 'name') === 'string' ? readOwn(raw, 'name') as string : readOwn(raw, 'id') as string,
    baseWeaponFamily,
    fitted,
    traitParts,
  };
}

function sanitizeFittedParts(
  raw: unknown,
  asOwnedReference: (value: unknown) => string | undefined,
  family: string,
): Readonly<Partial<Record<string, string>>> {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, string> = {};
  const used = new Set<string>();
  const allowedSlots = new Set<PartSlot>(WEAPON_SLOT_COMPATIBILITY[family] ?? []);
  for (const [slot, partId] of Object.entries(raw)) {
    if (!allowedSlots.has(slot as PartSlot)) continue;
    const owned = asOwnedReference(partId);
    if (owned !== undefined && !used.has(owned)) {
      used.add(owned);
      result[slot] = owned;
    }
  }
  return Object.freeze(result);
}

function sanitizeEquipmentState(raw: unknown): EquipmentState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, EquipmentInstance> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isInstanceId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const equipmentId = readOwn(entry, 'equipmentId');
    const tier = readOwn(entry, 'tier');
    // Existing V3 entries used { setId, tier } under an instance/definition
    // key. Preserve the key and recover the definition ID from it once.
    // Old V3 stored a definition key with `{ setId, tier }`.  Only migrate
    // that unambiguous form; an arbitrary instance key is not a definition.
    const canonicalId = typeof equipmentId === 'string'
      ? equipmentId
      : (isUnlockId(key) && key.startsWith('equipment:') ? key : undefined);
    if (canonicalId !== undefined && isUnlockId(canonicalId) && canonicalId.startsWith('equipment:')) {
      result[key] = {
        equipmentId: canonicalId,
        tier: Number.isSafeInteger(tier) && (tier as number) >= 1
          ? Math.min(tier as number, EQUIPMENT_TIERS.length)
          : 1,
      };
    }
  }
  return result;
}

function sanitizeEquipmentLoadout(raw: unknown, owned: EquipmentState): EquipmentLoadoutState {
  if (!isPlainRecord(raw)) return Object.freeze({});
  const result: Partial<Record<'helmet' | 'armour' | 'gloves' | 'boots', string>> = {};
  for (const slot of ['helmet', 'armour', 'gloves', 'boots'] as const) {
    const instanceId = readOwn(raw, slot);
    if (typeof instanceId === 'string' && Object.hasOwn(owned, instanceId)) result[slot] = instanceId;
  }
  return Object.freeze(result);
}

function sanitizeItemInventory(raw: unknown): ItemInventoryState {
  if (!isPlainRecord(raw)) return Object.freeze({});
  const result: Record<string, number> = Object.create(null);
  for (const id of Object.keys(raw)) {
    const amount = readOwn(raw, id);
    if (isUnlockId(id) && id.startsWith('item:') && Number.isSafeInteger(amount) && (amount as number) > 0) {
      result[id] = amount as number;
    }
  }
  return Object.freeze(result);
}

function sanitizeBossProgress(raw: unknown): BossProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, BossProgress> = Object.create(null);
  for (const id of Object.keys(raw)) {
    if (!isContentId(id)) continue;
    const value = readOwn(raw, id);
    if (!isPlainRecord(value) || readOwn(value, 'defeated') !== true) continue;
    const firstDefeatedAt = readOwn(value, 'firstDefeatedAt');
    result[id] = { defeated: true, ...(Number.isSafeInteger(firstDefeatedAt) && (firstDefeatedAt as number) > 0 ? { firstDefeatedAt: firstDefeatedAt as number } : {}) };
  }
  return Object.freeze(result);
}

function sanitizeAppliedGrantTransactions(raw: unknown): AppliedGrantTransactions {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, true> = Object.create(null);
  for (const id of Object.keys(raw)) if (isGrantTransactionId(id)) result[id] = true;
  return Object.freeze(result);
}

function sanitizeGrantTransactionFingerprints(raw: unknown): GrantTransactionFingerprints {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, string> = Object.create(null);
  for (const id of Object.keys(raw)) {
    const fingerprint = readOwn(raw, id);
    if (isGrantTransactionId(id) && typeof fingerprint === 'string' && fingerprint.length > 0 && fingerprint.length <= 8_192) {
      result[id] = fingerprint;
    }
  }
  return Object.freeze(result);
}

// ── SaveManager ──────────────────────────────────────────────────────

export class SaveManager {
  private writeProtected = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly key: string = RuntimeConfig.storageKey,
    private readonly maxLevels: MetaUpgradeMaxLevels = {},
  ) {}

  load(): SaveData {
    try {
      const decoded = decodeSave(this.storage.getItem(this.key), this.maxLevels);
      this.writeProtected ||= decoded.unsupportedFutureVersion;
      return decoded.data;
    } catch {
      return createDefaultSaveV3();
    }
  }

  /** V3-aware load: decodes V1/V2/V3, write-protects > 3 per architecture §4.6. */
  loadV3(): SaveDataV3 {
    return this.load();
  }

  save(data: SaveData): boolean {
    if (this.writeProtected) return false;
    try {
      const equipment = sanitizeEquipmentState(data.equipment);
      const selectedCharacterId = sanitizeSelectedCharacterId(data.selectedCharacterId);
      const achievements = sanitizeAchievementProgress(data.achievements);
      const sanitized = freezeSaveV3({
        version: 3,
        settings: sanitizeSettings(data.settings, DEFAULT_SETTINGS),
        progression: reconcileAchievementOwnedUnlocks(sanitizeProgression(data.progression, this.maxLevels), achievements),
        stages: sanitizeStageProgress(data.stages),
        achievements,
        achievementMetrics: sanitizeAchievementMetrics(data.achievementMetrics),
        characters: sanitizeCharacterMastery(data.characters),
        ...(selectedCharacterId === undefined ? {} : { selectedCharacterId }),
        gunsmith: sanitizeGunsmithState(data.gunsmith),
        equipment,
        equipmentLoadout: sanitizeEquipmentLoadout(data.equipmentLoadout, equipment),
        items: sanitizeItemInventory(data.items),
        bosses: sanitizeBossProgress(data.bosses),
        pendingAchievementReports: sanitizePendingAchievementReports(data.pendingAchievementReports),
        appliedGrantTransactions: sanitizeAppliedGrantTransactions(data.appliedGrantTransactions),
        grantTransactionFingerprints: sanitizeGrantTransactionFingerprints(data.grantTransactionFingerprints),
      });
      return this.storage.setItem(this.key, JSON.stringify(sanitized)) === true;
    } catch {
      return false;
    }
  }

  /** V3-aware save per architecture §4.6. */
  saveV3(data: SaveDataV3): boolean {
    return this.save(data);
  }

  clear(): boolean {
    try {
      const cleared = this.storage.removeItem(this.key) === true;
      if (cleared) this.writeProtected = false;
      return cleared;
    } catch {
      return false;
    }
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly localStorageRef: Storage | null;

  constructor(localStorageRef?: Storage) {
    this.localStorageRef = localStorageRef ?? getBrowserLocalStorage();
  }

  getItem(key: string): string | null {
    try { return this.localStorageRef?.getItem(key) ?? null; } catch { return null; }
  }

  setItem(key: string, value: string): boolean {
    try {
      if (!this.localStorageRef) return false;
      this.localStorageRef.setItem(key, value);
      return true;
    } catch { return false; }
  }

  removeItem(key: string): boolean {
    try {
      if (!this.localStorageRef) return false;
      this.localStorageRef.removeItem(key);
      return true;
    } catch { return false; }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): boolean { this.values.set(key, value); return true; }
  removeItem(key: string): boolean { this.values.delete(key); return true; }
}

// ── Internal helpers ─────────────────────────────────────────────────

function sanitizeSettings(raw: unknown, fallback: Settings): Settings {
  if (!isPlainRecord(raw)) return freezeSettings(fallback);
  const mutedRaw = readOwn(raw, 'muted');
  const reducedMotionRaw = readOwn(raw, 'reducedMotion');
  return freezeSettings({
    muted: typeof mutedRaw === 'boolean' ? mutedRaw : fallback.muted,
    musicVolume: clampVolume(readOwn(raw, 'musicVolume'), fallback.musicVolume),
    sfxVolume: clampVolume(readOwn(raw, 'sfxVolume'), fallback.sfxVolume),
    reducedMotion: typeof reducedMotionRaw === 'boolean' ? reducedMotionRaw : fallback.reducedMotion,
  });
}

function freezeSettings(settings: Settings): Settings {
  return Object.freeze({ ...settings });
}

function freezeProgression(p: ProgressionState): ProgressionState {
  return Object.freeze({
    scrap: p.scrap,
    unlocks: Object.freeze([...p.unlocks]),
    permanentUpgrades: Object.freeze({ ...p.permanentUpgrades }),
  });
}

/**
 * Produces the only externally visible Save V3 snapshot shape.  Every nested
 * record is copied and frozen as well as the domain map, so callers cannot
 * mutate owned-instance/fact state behind GameContext's persistence boundary.
 */
export function freezeSaveV3(save: SaveDataV3): SaveDataV3 {
  return Object.freeze({
    version: 3,
    settings: Object.isFrozen(save.settings) ? save.settings : freezeSettings(save.settings),
    progression: Object.isFrozen(save.progression) ? save.progression : freezeProgression(save.progression),
    stages: Object.freeze(Object.fromEntries(Object.entries(save.stages).map(([id, state]) => [id, Object.freeze({ ...state })]))),
    achievements: Object.freeze(Object.fromEntries(Object.entries(save.achievements).map(([id, state]) => [id, Object.freeze({ ...state })]))),
    achievementMetrics: Object.freeze({ ...save.achievementMetrics }),
    characters: Object.freeze(Object.fromEntries(Object.entries(save.characters).map(([id, state]) => [id, Object.freeze({ ...state })]))),
    ...(save.selectedCharacterId === undefined ? {} : { selectedCharacterId: save.selectedCharacterId }),
    gunsmith: Object.freeze({
      builds: Object.freeze(save.gunsmith.builds.map((build) => Object.freeze({
        ...build,
        fitted: Object.freeze({ ...build.fitted }),
        traitParts: Object.freeze([...build.traitParts]),
      }))),
      parts: Object.freeze(Object.fromEntries(Object.entries(save.gunsmith.parts).map(([id, part]) => [id, Object.freeze({
        ...part,
        infusedTraits: Object.freeze([...part.infusedTraits]),
      })]))),
      ...(save.gunsmith.selectedBuildId === undefined ? {} : { selectedBuildId: save.gunsmith.selectedBuildId }),
    }),
    equipment: Object.freeze(Object.fromEntries(Object.entries(save.equipment).map(([id, equipment]) => [id, Object.freeze({ ...equipment })]))),
    equipmentLoadout: Object.freeze({ ...(save.equipmentLoadout ?? {}) }),
    items: Object.freeze({ ...save.items }),
    bosses: Object.freeze(Object.fromEntries(Object.entries(save.bosses).map(([id, boss]) => [id, Object.freeze({ ...boss })]))),
    pendingAchievementReports: Object.freeze([...save.pendingAchievementReports]),
    appliedGrantTransactions: Object.freeze({ ...save.appliedGrantTransactions }),
    grantTransactionFingerprints: Object.freeze({ ...save.grantTransactionFingerprints }),
  });
}

function sanitizeSelectedCharacterId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : undefined;
}

function sanitizePendingAchievementReports(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze([...new Set(value.filter((id): id is string => typeof id === 'string' && isUnlockId(id) && id.startsWith('achievement:')))].slice(0, 128));
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return a.muted === b.muted && a.musicVolume === b.musicVolume &&
    a.sfxVolume === b.sfxVolume && a.reducedMotion === b.reducedMotion;
}

function parseRawSave(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  if (raw.trim() === '') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function readOwn(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function readOwnMaxLevel(levels: MetaUpgradeMaxLevels, id: string): number | undefined {
  const value = Object.hasOwn(levels, id) ? levels[id] : undefined;
  return Number.isSafeInteger(value) && (value as number) > 0 ? value : undefined;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch { return false; }
}

function getBrowserLocalStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
