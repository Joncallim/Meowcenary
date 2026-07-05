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
