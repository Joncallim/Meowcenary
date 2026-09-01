import type { RunUpgradeStatKey, StatKey } from '../gameplay/stats';
import type { UnlockRule } from '../gameplay/meta';
import type { PlayerBaseStats } from '../gameplay/runStart';
import type { GameEventKey } from '../engine/eventBus';
import type { AchievementDefinition } from '../gameplay/achievementSystem';
import type { PartDefinition } from '../gameplay/gunsmith';
import type { AbilityDefinition } from '../gameplay/abilities';
import type { EquipmentDefinition } from '../gameplay/equipment';
import type {
  StageDefinition,
  EncounterProfile,
  DifficultyProfile,
  RewardProfile,
} from '../gameplay/stage/stageContracts';

// Re-export for consumers (validation.ts, registries)
export type { StageDefinition, EncounterProfile, DifficultyProfile, RewardProfile };

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A single JSON-safe upgrade effect. It carries no runtime `sourceId`; the
 * source (`card:<id>:<stack>`) is assigned when a card is applied. Epic 3
 * effects are global run modifiers — never per-weapon. This is the
 * legacy/base shape shared by meta upgrades and character static passives
 * (Epic 18 D3) — it must never gain weapon-family scope or Epic 18-only
 * behavior keys; see `RunUpgradeEffect` for run-card-only effects.
 */
export interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}

/** Epic 18 (D3): scope for a run-upgrade weapon-stat modifier. Global when
 *  absent from `RunUpgradeEffect.scope`. */
export interface WeaponFamilyScope {
  readonly kind: 'weapon-family';
  readonly family: string;
}

/** Epic 18 (D3): run-only upgrade effect shape — deliberately separate from
 *  legacy `UpgradeEffect` so weapon-family scope and behavior-only stats
 *  (`pierce`/`spreadDeg`) cannot leak into meta upgrades or character
 *  passives. Every scoped effect in one upgrade must reference the same
 *  family (enforced by validation, D5). */
export interface RunUpgradeEffect {
  readonly stat: RunUpgradeStatKey;
  readonly op: 'add' | 'mult';
  readonly value: number;
  readonly scope?: WeaponFamilyScope;
}

/** Epic 18 (D8): presentation metadata every shipped run-upgrade card
 *  requires. `iconArtId` must be exactly `upgrade-icon:<upgrade-id>`. */
export interface UpgradePresentation {
  readonly category: 'offense' | 'defense' | 'mobility' | 'utility' | 'economy' | 'synergy';
  readonly iconArtId: string;
}

export interface WeaponDefinition {
  id: string;
  name: string;
  family: string;
  rarity: Rarity;
  fireRateMs: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  mergeTier: number;
  maxTier: number;
  pierce: number;
  projectileCount: number;
  spreadDeg: number;
  art: {
    readonly iconId: string;
    readonly heldId: string;
    readonly projectileId: string;
  };
}

/**
 * Presentation-only per-family combat feel (Epic 17). Never read by gameplay
 * resolution (`weaponStats.ts`, `Projectile`) — cosmetics/audio only. Exactly
 * one entry per `WeaponDefinition.family` value in `weapons.json`.
 */
export interface WeaponFeelDefinition {
  readonly family: string;
  readonly muzzle: { readonly color: string; readonly radius: number; readonly lifetimeMs: number };
  readonly impact: { readonly color: string; readonly radius: number };
  readonly recoilPx: number;
  /** One multiplier per tier, index 0 = T1. */
  readonly sfxTierVolumeMultiplier: readonly [number, number, number];
}

/** Single source of truth for the family→definition lookup that
 *  `WeaponSystem`, `AudioManager`, and `PhaserFeedbackRenderer` each build
 *  independently from the same `weaponFeel` array — keeps their keying
 *  semantics (last entry wins on a duplicate family) from drifting apart.
 *  `validation.ts` already guarantees exactly one entry per family in the
 *  shipped catalog; duplicates only arise in ad-hoc test fixtures. */
export function weaponFeelByFamily(
  entries: readonly WeaponFeelDefinition[],
): ReadonlyMap<string, WeaponFeelDefinition> {
  const map = new Map<string, WeaponFeelDefinition>();
  for (const entry of entries) {
    map.set(entry.family, entry);
  }
  return map;
}

export type EnemyArchetype = 'chaser' | 'charger' | 'ranged' | 'tank' | 'shielded' | 'flanker' | 'elite' | 'boss';
/** Direct enemies which the encounter director can materialize. Bosses are
 * deliberately excluded: they enter through an explicit boss-stage hook. */
export const SPAWNABLE_ENEMY_ARCHETYPES = ['chaser', 'charger', 'tank', 'ranged', 'shielded', 'flanker'] as const;
export type SpawnableEnemyArchetype = (typeof SPAWNABLE_ENEMY_ARCHETYPES)[number];
export type DirectEnemyArchetype = Exclude<EnemyArchetype, 'elite'>;

interface EnemyIdentity {
  id: string;
  name: string;
  archetype: EnemyArchetype;
}

export interface EnemyStats {
  health: number;
  damage: number;
  speed: number;
  xpValue: number;
  scrapValue: number;
  /** Optional loot table for this enemy. Elites inherit the base's id. */
  lootTableId?: string;
}

export interface ChargerAttackDefinition {
  triggerRange: number;
  telegraphMs: number;
  dashSpeed: number;
  dashDurationMs: number;
  cooldownMs: number;
}

export interface RangedAttackDefinition {
  range: number;
  telegraphMs: number;
  cooldownMs: number;
}

/** Stable, registered boss actions. The phase owns composition; the Enemy
 * entity never interprets boss IDs to decide what an attack does. */
export type BossActionDefinition =
  | { readonly id: 'boss-action:aimed-shot' }
  | ({ readonly id: 'boss-action:summon' } & EnemySummonDefinition);

/** A health-threshold boss escalation, selected solely from authoritative
 * combat health.  It replaces the baseline charge and may add bounded adds. */
export interface BossPhaseDefinition {
  readonly id: string;
  readonly atHealthFraction: number;
  readonly attack: ChargerAttackDefinition;
  readonly actions: readonly BossActionDefinition[];
}

/** Data-owned, bounded reinforcement action. Existing movement/attack
 * behaviors may request it; SpawnSystem remains the only materializer. */
export interface EnemySummonDefinition {
  readonly enemyId: string;
  readonly count: number;
  readonly maxActive: number;
}

/** Data-owned bounded split on death. Child entities retain ordinary enemy
 * rules and are queued by SpawnSystem after the current update. */
export interface EnemySplitDefinition {
  readonly enemyId: string;
  readonly count: number;
  readonly maxActive: number;
}

export interface ChaserEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'chaser';
  contactDamage: true;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

export interface ChargerEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'charger';
  contactDamage: true;
  attack: ChargerAttackDefinition;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

export interface RangedEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'ranged';
  contactDamage: false;
  attack: RangedAttackDefinition;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

export interface TankEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'tank';
  contactDamage: true;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

/** A frontal shield blocks projectiles from the enemy's current facing side.
 * Attacks from behind always use ordinary combat damage. */
export interface ShieldedEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'shielded';
  contactDamage: true;
  shieldArcDeg: number;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

export interface FlankerEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'flanker';
  contactDamage: true;
  flankDistance: number;
  flankSide: -1 | 1;
  summon?: EnemySummonDefinition;
  splitOnDeath?: EnemySplitDefinition;
}

export interface BossEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'boss';
  contactDamage: false;
  /** Boss lunge behavior — same attack vocabulary as charger, larger scale. */
  attack: ChargerAttackDefinition;
  /** Base moveset action composition before any threshold phase. */
  actions: readonly BossActionDefinition[];
  phases?: readonly BossPhaseDefinition[];
  splitOnDeath?: EnemySplitDefinition;
}

export interface EliteEnemyDefinition extends EnemyIdentity {
  archetype: 'elite';
  baseEnemyId: string;
}

export type SpawnableEnemyDefinition =
  | ChaserEnemyDefinition
  | ChargerEnemyDefinition
  | TankEnemyDefinition
  | ShieldedEnemyDefinition
  | FlankerEnemyDefinition
  | RangedEnemyDefinition;

export type DirectEnemyDefinition =
  | SpawnableEnemyDefinition
  | RangedEnemyDefinition
  | BossEnemyDefinition;

export type EnemyDefinition = DirectEnemyDefinition | EliteEnemyDefinition;

export function isSpawnableEnemyArchetype(
  archetype: EnemyArchetype,
): archetype is SpawnableEnemyArchetype {
  return (SPAWNABLE_ENEMY_ARCHETYPES as readonly EnemyArchetype[]).includes(archetype);
}

export function isSpawnableEnemyDefinition(
  definition: EnemyDefinition,
): definition is SpawnableEnemyDefinition {
  return isSpawnableEnemyArchetype(definition.archetype);
}

/** Elites deliberately inherit only contact archetypes for now; ranged
 * variants are already data-driven direct encounters and do not inherit an
 * undefined projectile modifier contract. */
export function isEliteBaseEnemyDefinition(
  definition: EnemyDefinition,
): definition is ChaserEnemyDefinition | ChargerEnemyDefinition | TankEnemyDefinition {
  return definition.archetype === 'chaser' || definition.archetype === 'charger' || definition.archetype === 'tank';
}

export type ResolvedEliteEnemyDefinition<
  Base extends SpawnableEnemyDefinition = SpawnableEnemyDefinition,
> = Base extends SpawnableEnemyDefinition
  ? Omit<Base, 'archetype'> & {
      archetype: 'elite';
      baseEnemyId: string;
      baseArchetype: Base['archetype'];
    }
  : never;

export type ResolvedEnemyDefinition = DirectEnemyDefinition | ResolvedEliteEnemyDefinition;

export interface UpgradeDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  target: 'player' | 'weapon' | 'economy' | 'run';
  description: string;
  maxStacks: number;
  effects: RunUpgradeEffect[];
  presentation: UpgradePresentation;
}

/** Epic 18 (D7): one authoritative, frozen-at-offer-time read model per
 *  offered card. Built once from a canonical definition + a safe
 *  `RunState.upgradeStacks` read; the chooser consumes only this, never raw
 *  `UpgradeDefinition`/`RunUpgradeEffect` shapes. */
export interface UpgradeCardReadModel {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly target: UpgradeDefinition['target'];
  readonly description: string;
  readonly category: UpgradePresentation['category'];
  readonly iconArtId: string;
  readonly family?: string;
  readonly owned: boolean;
  readonly currentStacks: number;
  readonly maxStacks: number;
  readonly nextStack: number;
}

export interface MetaUpgradeCost {
  readonly base: number;
  readonly growth: number;
}

export interface MetaUpgradeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxLevel: number;
  readonly cost: MetaUpgradeCost;
  readonly effects: readonly UpgradeEffect[];
}

export type LootKind = 'xp' | 'scrap' | 'chest' | 'weapon' | 'nothing';

/** Discriminated loot-table entry (Epic 14 §D4). Weapon entries carry only a
 *  stable definition ID — never family/tier/display name or a runtime
 *  WeaponInstance — and must not define `amount` or `tableId`. */
export type LootEntry =
  | { readonly kind: 'xp' | 'scrap'; readonly amount: number; readonly weight: number }
  | { readonly kind: 'chest'; readonly amount: 0; readonly weight: number; readonly tableId: string }
  | { readonly kind: 'weapon'; readonly weight: number; readonly definitionId: string }
  | { readonly kind: 'nothing'; readonly amount: 0; readonly weight: number };

export interface LootTable {
  readonly id: string;
  readonly entries: readonly LootEntry[];
}

export interface AudioSfxAsset {
  readonly key: string;
  readonly url: string;
}

export interface AudioMusicAsset {
  readonly key: string;
  readonly url: string;
}

export interface AudioAssetCatalog {
  readonly sfx: readonly AudioSfxAsset[];
  readonly music: readonly AudioMusicAsset[];
}

/** One event → audio action row in audio-map.json (Epic 10 §6.2). */
export interface AudioMapEntry {
  readonly event: GameEventKey;
  readonly sfxKey?: string;
  /** Epic 17: per-family override, keyed by the event payload's `family`
   *  field (only `weapon:fired`/`projectile:hit` carry one). Falls back to
   *  `sfxKey` when the family has no entry here. */
  readonly sfxKeyByFamily?: Readonly<Record<string, string>>;
  readonly cooldownMs?: number;
  readonly stopMusic?: boolean;
  readonly musicFadeMs?: number;
}

export interface AudioData {
  readonly assets: AudioAssetCatalog;
  readonly map: readonly AudioMapEntry[];
}

export type VisualArtKind =
  | 'character'
  | 'enemy'
  | 'projectile'
  | 'drop'
  | 'weapon-icon'
  | 'weapon-held'
  | 'world'
  | 'upgrade-icon';

export type VisualArtSampling = 'nearest' | 'linear';

export type VisualArtLoad =
  | { readonly type: 'image' }
  | {
      readonly type: 'spritesheet';
      readonly frame: { readonly width: number; readonly height: number };
    };

export interface VisualArtClip {
  readonly start: number;
  readonly end: number;
  readonly frameRate: number;
  readonly repeat: -1 | 0;
}

export interface VisualArtBinding {
  readonly id: string;
  readonly kind: VisualArtKind;
  readonly textureKey: string;
  readonly url: string;
  readonly required: boolean;
  /** Explicitly authored filtering policy; no kind/default fallback exists. */
  readonly sampling: VisualArtSampling;
  readonly load: VisualArtLoad;
  readonly display: { readonly width: number; readonly height: number };
  readonly clips?: Readonly<Record<string, VisualArtClip>>;
}

export interface VisualArtCatalog {
  readonly bindings: readonly VisualArtBinding[];
}

/** Data-owned group of canonical visual-art bindings used by a stage. */
export interface AssetBundleDefinition {
  readonly id: string;
  readonly assetIds: readonly string[];
}

export interface SpawnWaveDefinition {
  startSecond: number;
  enemyId: string;
  spawnEveryMs: number;
  maxAlive: number;
}

export interface SpawnCurveDefinition {
  id: string;
  durationSeconds: number;
  scaling: EnemyScalingDefinition;
  waves: SpawnWaveDefinition[];
}

export interface EnemyScalingDefinition {
  healthPerMinute: number;
  damagePerMinute: number;
}

export const CHARACTER_PASSIVE_EVENTS = [
  'enemy:killed',
  'player:damaged',
  'level:up',
  'xp:gained',
] as const;
export type CharacterPassiveEvent = (typeof CHARACTER_PASSIVE_EVENTS)[number];

export interface CharacterStaticPassiveDefinition {
  readonly id: string;
  readonly kind: 'static';
  readonly name: string;
  readonly description: string;
  readonly effects: readonly UpgradeEffect[];
}

export interface CharacterReactivePassiveDefinition {
  readonly id: string;
  readonly kind: 'reactive';
  readonly name: string;
  readonly description: string;
  readonly event: CharacterPassiveEvent;
  readonly handlerId: string;
}

export type CharacterPassiveDefinition =
  | CharacterStaticPassiveDefinition
  | CharacterReactivePassiveDefinition;

export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly baseStats: Readonly<PlayerBaseStats>;
  readonly startingWeaponIds: readonly string[];
  /** Epic 24: registered active ability (stable ability: id). */
  readonly abilityId?: string;
  readonly passives: readonly CharacterPassiveDefinition[];
  readonly unlock: UnlockRule;
  readonly cosmeticSkinIds: readonly string[];
}

export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export type SpawnRegion =
  | { readonly kind: 'ring'; readonly cx: number; readonly cy: number; readonly minRadius: number; readonly maxRadius: number }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly kind: 'edges'; readonly margin: number }
  | {
      readonly kind: 'edge-lanes';
      readonly inset: number;
      readonly lanes: readonly EdgeSpawnLane[];
    };

export interface EdgeSpawnLane {
  readonly side: 'top' | 'right' | 'bottom' | 'left';
  readonly offset: number;
  readonly width: number;
}

export interface ObstacleDefinition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ArenaDecorationDefinition {
  readonly id: string;
  readonly artId: string;
  readonly x: number;
  readonly y: number;
  readonly flipX?: boolean;
  readonly layer: 'ground' | 'low';
}

export interface ArenaObstacleSkinDefinition {
  readonly obstacleId: string;
  readonly artId: string;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export interface ArenaVisualDefinition {
  readonly floorArtIds: readonly string[];
  readonly boundary: {
    readonly straightArtId: string;
    readonly cornerArtId: string;
    readonly patchArtId: string;
    readonly gateArtId: string;
  };
  readonly decorations: readonly ArenaDecorationDefinition[];
  readonly obstacleSkins: readonly ArenaObstacleSkinDefinition[];
}

export interface HazardDefinition {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly damagePerSecond: number;
}

export interface ArenaDefinition {
  readonly id: string;
  readonly name: string;
  readonly size: ArenaSize;
  readonly spawnCurveId: string;
  readonly spawnRegions: readonly SpawnRegion[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly hazards: readonly HazardDefinition[];
  readonly visual: ArenaVisualDefinition;
  readonly unlock: UnlockRule;
}

export interface GameData {
  /** Catalog/rebalance identity for replay diagnostics. This is deliberately
   * not part of Save V3: ordinary content changes never trigger migration. */
  readonly contentVersion: string;
  weapons: WeaponDefinition[];
  enemies: EnemyDefinition[];
  upgrades: UpgradeDefinition[];
  metaUpgrades: MetaUpgradeDefinition[];
  spawnCurves: SpawnCurveDefinition[];
  characters: CharacterDefinition[];
  arenas: ArenaDefinition[];
  lootTables: LootTable[];
  weaponFeel: WeaponFeelDefinition[];
  readonly audio: AudioData;
  readonly visualArt: VisualArtCatalog;
  /** Data-owned stage asset groups. Save V3 stores neither bundles nor their
   * members; catalog changes remain ordinary content updates. */
  readonly assetBundles: readonly AssetBundleDefinition[];
  readonly stages?: readonly StageDefinition[];
  readonly encounterProfiles?: readonly EncounterProfile[];
  readonly difficultyProfiles?: readonly DifficultyProfile[];
  readonly rewardProfiles?: readonly RewardProfile[];
  readonly achievements?: readonly AchievementDefinition[];
  readonly gunParts?: readonly PartDefinition[];
  readonly abilities?: readonly AbilityDefinition[];
  readonly equipment?: readonly EquipmentDefinition[];
}
