import type { StatKey } from '../gameplay/stats';
import type { UnlockRule } from '../gameplay/meta';
import type { PlayerBaseStats } from '../gameplay/runStart';
import type { GameEventKey } from '../engine/eventBus';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A single JSON-safe upgrade effect. It carries no runtime `sourceId`; the
 * source (`card:<id>:<stack>`) is assigned when a card is applied. Epic 3
 * effects are global run modifiers — never per-weapon.
 */
export interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
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

export type EnemyArchetype = 'chaser' | 'charger' | 'ranged' | 'tank' | 'elite' | 'boss';
export const SPAWNABLE_ENEMY_ARCHETYPES = ['chaser', 'charger', 'tank'] as const;
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

export interface ChaserEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'chaser';
  contactDamage: true;
}

export interface ChargerEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'charger';
  contactDamage: true;
  attack: ChargerAttackDefinition;
}

export interface RangedEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'ranged';
  contactDamage: false;
  attack: RangedAttackDefinition;
}

export interface TankEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'tank';
  contactDamage: true;
}

export interface BossEnemyDefinition extends EnemyIdentity, EnemyStats {
  archetype: 'boss';
  contactDamage: false;
}

export interface EliteEnemyDefinition extends EnemyIdentity {
  archetype: 'elite';
  baseEnemyId: string;
}

export type SpawnableEnemyDefinition =
  | ChaserEnemyDefinition
  | ChargerEnemyDefinition
  | TankEnemyDefinition;

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
  effects: UpgradeEffect[];
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
  | 'world';

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
  readonly load: VisualArtLoad;
  readonly display: { readonly width: number; readonly height: number };
  readonly clips?: Readonly<Record<string, VisualArtClip>>;
}

export interface VisualArtCatalog {
  readonly bindings: readonly VisualArtBinding[];
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
  weapons: WeaponDefinition[];
  enemies: EnemyDefinition[];
  upgrades: UpgradeDefinition[];
  metaUpgrades: MetaUpgradeDefinition[];
  spawnCurves: SpawnCurveDefinition[];
  characters: CharacterDefinition[];
  arenas: ArenaDefinition[];
  lootTables: LootTable[];
  readonly audio: AudioData;
  readonly visualArt: VisualArtCatalog;
}
