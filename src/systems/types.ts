import type { StatKey } from '../gameplay/stats';
import type { UnlockRule } from '../gameplay/meta';
import type { PlayerBaseStats } from '../gameplay/runStart';

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

export interface GameData {
  weapons: WeaponDefinition[];
  enemies: EnemyDefinition[];
  upgrades: UpgradeDefinition[];
  metaUpgrades: MetaUpgradeDefinition[];
  spawnCurves: SpawnCurveDefinition[];
  characters: CharacterDefinition[];
}
