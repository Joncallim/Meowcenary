export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
