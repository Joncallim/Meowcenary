import type { StatKey } from '../gameplay/stats';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A single JSON-safe upgrade effect. It carries no runtime `sourceId`; the
 * source (`upgrade:<id>:stack:<n>`) is assigned when a card is applied. Epic 3
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

export interface EnemyDefinition {
  id: string;
  name: string;
  archetype: 'chaser' | 'charger' | 'ranged' | 'tank' | 'boss';
  health: number;
  damage: number;
  speed: number;
  xpValue: number;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  target: 'player' | 'weapon' | 'economy' | 'run';
  description: string;
  maxStacks: number;
  effects: UpgradeEffect[];
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
  waves: SpawnWaveDefinition[];
}

export interface GameData {
  weapons: WeaponDefinition[];
  enemies: EnemyDefinition[];
  upgrades: UpgradeDefinition[];
  spawnCurves: SpawnCurveDefinition[];
}
