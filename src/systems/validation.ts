import enemiesJson from '../data/enemies.json';
import spawnCurvesJson from '../data/spawn-curves.json';
import upgradesJson from '../data/upgrades.json';
import weaponsJson from '../data/weapons.json';
import type {
  EnemyDefinition,
  GameData,
  Rarity,
  SpawnCurveDefinition,
  UpgradeDefinition,
  WeaponDefinition,
} from './types';

const RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const ENEMY_ARCHETYPES = new Set<EnemyDefinition['archetype']>([
  'chaser',
  'charger',
  'ranged',
  'tank',
  'boss',
]);
const UPGRADE_TARGETS = new Set<UpgradeDefinition['target']>(['player', 'weapon', 'economy', 'run']);

export type RowCheck = (row: unknown, index: number) => string[];

export function validate<T>(name: string, rows: unknown[], check: RowCheck): T[] {
  const errors = collectValidationErrors(name, rows, check);
  if (errors.length > 0) {
    throw new Error(`Invalid game data:\n${errors.join('\n')}`);
  }

  return rows as T[];
}

export function collectValidationErrors(name: string, rows: unknown[], check: RowCheck): string[] {
  if (!Array.isArray(rows)) {
    return [`${name}[0].rows: expected array`];
  }

  const errors: string[] = [];
  rows.forEach((row, index) => {
    for (const fieldError of check(row, index)) {
      errors.push(`${name}[${index}].${fieldError}`);
    }
  });

  return errors;
}

export function loadGameData(): GameData {
  return validateGameData({
    weapons: weaponsJson,
    enemies: enemiesJson,
    upgrades: upgradesJson,
    spawnCurves: spawnCurvesJson,
  });
}

export function validateGameData(raw: {
  weapons: unknown[];
  enemies: unknown[];
  upgrades: unknown[];
  spawnCurves: unknown[];
}): GameData {
  const weapons = validate<WeaponDefinition>('weapons.json', raw.weapons, checkWeapon);
  const enemies = validate<EnemyDefinition>('enemies.json', raw.enemies, checkEnemy);
  const upgrades = validate<UpgradeDefinition>('upgrades.json', raw.upgrades, checkUpgrade);
  const spawnCurves = validate<SpawnCurveDefinition>(
    'spawn-curves.json',
    raw.spawnCurves,
    checkSpawnCurveShape,
  );

  assertUniqueIds('weapons.json', weapons);
  assertUniqueIds('enemies.json', enemies);
  assertUniqueIds('upgrades.json', upgrades);
  assertUniqueIds('spawn-curves.json', spawnCurves);
  assertWeaponTiers(weapons);
  assertSpawnReferences(spawnCurves, new Set(enemies.map((enemy) => enemy.id)));

  return { weapons, enemies, upgrades, spawnCurves };
}

function checkWeapon(row: unknown): string[] {
  const errors = requireRecord(row);
  if (errors.length > 0) {
    return errors;
  }

  const weapon = row as Record<string, unknown>;
  requireString(weapon, 'id', errors);
  requireString(weapon, 'name', errors);
  requireString(weapon, 'family', errors);
  requireRarity(weapon, 'rarity', errors);
  requirePositiveNumber(weapon, 'fireRateMs', errors);
  requirePositiveNumber(weapon, 'damage', errors);
  requirePositiveNumber(weapon, 'projectileSpeed', errors);
  requirePositiveNumber(weapon, 'range', errors);
  requirePositiveInteger(weapon, 'mergeTier', errors);
  requirePositiveInteger(weapon, 'maxTier', errors);
  requireNonNegativeInteger(weapon, 'pierce', errors);
  requirePositiveInteger(weapon, 'projectileCount', errors);
  requireNonNegativeNumber(weapon, 'spreadDeg', errors);
  return errors;
}

function checkEnemy(row: unknown): string[] {
  const errors = requireRecord(row);
  if (errors.length > 0) {
    return errors;
  }

  const enemy = row as Record<string, unknown>;
  requireString(enemy, 'id', errors);
  requireString(enemy, 'name', errors);
  requireEnum(enemy, 'archetype', ENEMY_ARCHETYPES, errors);
  requirePositiveNumber(enemy, 'health', errors);
  requirePositiveNumber(enemy, 'damage', errors);
  requirePositiveNumber(enemy, 'speed', errors);
  requirePositiveNumber(enemy, 'xpValue', errors);
  return errors;
}

function checkUpgrade(row: unknown): string[] {
  const errors = requireRecord(row);
  if (errors.length > 0) {
    return errors;
  }

  const upgrade = row as Record<string, unknown>;
  requireString(upgrade, 'id', errors);
  requireString(upgrade, 'name', errors);
  requireRarity(upgrade, 'rarity', errors);
  requireEnum(upgrade, 'target', UPGRADE_TARGETS, errors);
  requireString(upgrade, 'description', errors);
  requirePositiveInteger(upgrade, 'maxStacks', errors);
  return errors;
}

function checkSpawnCurveShape(row: unknown): string[] {
  const errors = requireRecord(row);
  if (errors.length > 0) {
    return errors;
  }

  const curve = row as Record<string, unknown>;
  requireString(curve, 'id', errors);
  requirePositiveNumber(curve, 'durationSeconds', errors);

  if (!Array.isArray(curve.waves)) {
    errors.push('waves: required array');
    return errors;
  }

  curve.waves.forEach((wave, waveIndex) => {
    if (!isRecord(wave)) {
      errors.push(`waves[${waveIndex}]: expected object`);
      return;
    }

    const waveErrors: string[] = [];
    requireNonNegativeNumber(wave, 'startSecond', waveErrors);
    requireString(wave, 'enemyId', waveErrors);
    requirePositiveNumber(wave, 'spawnEveryMs', waveErrors);
    requirePositiveInteger(wave, 'maxAlive', waveErrors);
    errors.push(...waveErrors.map((error) => `waves[${waveIndex}].${error}`));
  });

  return errors;
}

function assertUniqueIds(name: string, rows: ReadonlyArray<{ id: string }>): void {
  const seen = new Map<string, number>();
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const firstIndex = seen.get(row.id);
    if (firstIndex !== undefined) {
      errors.push(`${name}[${index}].id: duplicate id "${row.id}" first seen at index ${firstIndex}`);
      return;
    }

    seen.set(row.id, index);
  });

  throwIfErrors(errors);
}

function assertWeaponTiers(weapons: readonly WeaponDefinition[]): void {
  const byFamily = new Map<string, Array<{ weapon: WeaponDefinition; index: number }>>();
  const errors: string[] = [];

  weapons.forEach((weapon, index) => {
    if (weapon.mergeTier > weapon.maxTier) {
      errors.push(
        `weapons.json[${index}].mergeTier: ${weapon.mergeTier} exceeds maxTier ${weapon.maxTier}`,
      );
    }

    const family = byFamily.get(weapon.family) ?? [];
    family.push({ weapon, index });
    byFamily.set(weapon.family, family);
  });

  byFamily.forEach((entries, family) => {
    const expectedMaxTier = entries[0]?.weapon.maxTier;
    if (expectedMaxTier === undefined) {
      return;
    }

    const tiers = new Map<number, number>();
    entries.forEach(({ weapon, index }) => {
      if (weapon.maxTier !== expectedMaxTier) {
        errors.push(
          `weapons.json[${index}].maxTier: family "${family}" expected ${expectedMaxTier}`,
        );
      }

      const firstIndex = tiers.get(weapon.mergeTier);
      if (firstIndex !== undefined) {
        errors.push(
          `weapons.json[${index}].mergeTier: duplicate tier ${weapon.mergeTier} for family "${family}" first seen at index ${firstIndex}`,
        );
        return;
      }

      tiers.set(weapon.mergeTier, index);
    });

    for (let tier = 1; tier <= expectedMaxTier; tier += 1) {
      if (!tiers.has(tier)) {
        errors.push(`weapons.json: family "${family}" missing mergeTier ${tier}`);
      }
    }

    for (const [tier, index] of tiers.entries()) {
      if (tier < 1 || tier > expectedMaxTier) {
        errors.push(`weapons.json[${index}].mergeTier: tier ${tier} outside 1..${expectedMaxTier}`);
      }
    }
  });

  throwIfErrors(errors);
}

function assertSpawnReferences(
  spawnCurves: readonly SpawnCurveDefinition[],
  enemyIds: ReadonlySet<string>,
): void {
  const errors: string[] = [];

  spawnCurves.forEach((curve, curveIndex) => {
    curve.waves.forEach((wave, waveIndex) => {
      if (!enemyIds.has(wave.enemyId)) {
        errors.push(
          `spawn-curves.json[${curveIndex}].waves[${waveIndex}].enemyId: unknown enemyId "${wave.enemyId}"`,
        );
      }
    });
  });

  throwIfErrors(errors);
}

function requireRecord(row: unknown): string[] {
  return isRecord(row) ? [] : ['row: expected object'];
}

function requireString(row: Record<string, unknown>, field: string, errors: string[]): void {
  if (typeof readField(row, field) !== 'string' || readField(row, field) === '') {
    errors.push(`${field}: required string`);
  }
}

function requirePositiveNumber(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readField(row, field);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${field}: required positive number`);
  }
}

function requirePositiveInteger(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readField(row, field);
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    errors.push(`${field}: required positive integer`);
  }
}

function requireNonNegativeInteger(
  row: Record<string, unknown>,
  field: string,
  errors: string[],
): void {
  const value = readField(row, field);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${field}: required non-negative integer`);
  }
}

function requireNonNegativeNumber(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readField(row, field);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${field}: required non-negative number`);
  }
}

function requireRarity(row: Record<string, unknown>, field: string, errors: string[]): void {
  requireEnum(row, field, RARITIES, errors);
}

function requireEnum<T extends string>(
  row: Record<string, unknown>,
  field: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): void {
  const value = readField(row, field);
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    errors.push(`${field}: invalid value`);
  }
}

function readField(row: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => {
    if (!isRecord(value)) {
      return undefined;
    }

    return value[key];
  }, row);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Invalid game data:\n${errors.join('\n')}`);
  }
}
