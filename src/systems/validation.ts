import enemiesJson from '../data/enemies.json';
import spawnCurvesJson from '../data/spawn-curves.json';
import upgradesJson from '../data/upgrades.json';
import weaponsJson from '../data/weapons.json';
import { STAT_KEYS } from '../gameplay/stats';
import { DEFAULT_WEAPON_FAMILIES } from '../gameplay/weapons';
import type {
  EnemyDefinition,
  EnemyArchetype,
  GameData,
  Rarity,
  SpawnCurveDefinition,
  UpgradeDefinition,
  WeaponDefinition,
} from './types';
import { isSpawnableEnemyDefinition } from './types';

const RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const ENEMY_ARCHETYPES = new Set<EnemyArchetype>([
  'chaser',
  'charger',
  'ranged',
  'tank',
  'elite',
  'boss',
]);
const UPGRADE_TARGETS = new Set<UpgradeDefinition['target']>(['player', 'weapon', 'economy', 'run']);
const STAT_KEY_SET = new Set<string>(STAT_KEYS);
const UPGRADE_OPS = new Set(['add', 'mult']);

const WEAPON_FIELDS = new Set([
  'id', 'name', 'family', 'rarity', 'fireRateMs', 'damage', 'projectileSpeed', 'range',
  'mergeTier', 'maxTier', 'pierce', 'projectileCount', 'spreadDeg',
]);
const UPGRADE_FIELDS = new Set([
  'id', 'name', 'rarity', 'target', 'description', 'maxStacks', 'effects',
]);
const UPGRADE_EFFECT_FIELDS = new Set(['stat', 'op', 'value']);
const DIRECT_ENEMY_FIELDS = new Set([
  'id', 'name', 'archetype', 'health', 'damage', 'speed', 'xpValue', 'scrapValue',
  'contactDamage',
]);
const ELITE_ENEMY_FIELDS = new Set(['id', 'name', 'archetype', 'baseEnemyId']);
const CHARGER_ATTACK_FIELDS = new Set([
  'triggerRange', 'telegraphMs', 'dashSpeed', 'dashDurationMs', 'cooldownMs',
]);
const RANGED_ATTACK_FIELDS = new Set(['range', 'telegraphMs', 'cooldownMs']);
const CURVE_FIELDS = new Set(['id', 'durationSeconds', 'scaling', 'waves']);
const SCALING_FIELDS = new Set(['healthPerMinute', 'damagePerMinute']);
const WAVE_FIELDS = new Set(['startSecond', 'enemyId', 'spawnEveryMs', 'maxAlive']);
const ROOT_FIELDS = new Set(['weapons', 'enemies', 'upgrades', 'spawnCurves']);

export type RowCheck = (row: unknown, index: number) => string[];

export function validate<T>(name: string, rows: unknown, check: RowCheck): T[] {
  const errors = collectValidationErrors(name, rows, check);
  throwIfErrors(errors);
  return rows as T[];
}

export function collectValidationErrors(name: string, rows: unknown, check: RowCheck): string[] {
  if (!Array.isArray(rows)) {
    return [`${name}: expected array`];
  }

  const errors: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (!(index in rows)) {
      errors.push(`${name}[${index}]: sparse array entry`);
      continue;
    }
    for (const fieldError of check(rows[index], index)) {
      errors.push(`${name}[${index}].${fieldError}`);
    }
  }
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

export function validateGameData(raw: unknown): GameData {
  const rootErrors = jsonSafetyErrors(raw, 'game-data').map((error) =>
    error
      .replace(/^game-data\.weapons/, 'weapons.json')
      .replace(/^game-data\.enemies/, 'enemies.json')
      .replace(/^game-data\.upgrades/, 'upgrades.json')
      .replace(/^game-data\.spawnCurves/, 'spawn-curves.json'),
  );
  if (!isRecord(raw)) {
    rootErrors.push('game-data: expected object');
    throw new Error(`Invalid game data:\n${rootErrors.join('\n')}`);
  }
  rejectUnknownFields(raw, ROOT_FIELDS, rootErrors, 'game-data');
  for (const field of ROOT_FIELDS) {
    if (!Object.hasOwn(raw, field)) {
      rootErrors.push(`game-data.${field}: required field`);
    }
  }
  throwIfErrors(rootErrors);

  const weapons = validate<WeaponDefinition>('weapons.json', readOwnField(raw, 'weapons'), checkWeapon);
  const enemies = validateEnemyCatalog(readOwnField(raw, 'enemies'));
  const upgrades = validate<UpgradeDefinition>('upgrades.json', readOwnField(raw, 'upgrades'), checkUpgrade);
  const spawnCurves = validate<SpawnCurveDefinition>(
    'spawn-curves.json',
    readOwnField(raw, 'spawnCurves'),
    checkSpawnCurveShape,
  );

  assertUniqueIds('weapons.json', weapons);
  assertUniqueIds('upgrades.json', upgrades);
  assertUniqueIds('spawn-curves.json', spawnCurves);
  assertWeaponTiers(weapons);
  assertStarterWeapons(weapons);
  assertPlayableSpawnCurves(spawnCurves);
  assertSpawnReferences(spawnCurves, enemies);

  return { weapons, enemies, upgrades, spawnCurves };
}

export function validateEnemyCatalog(raw: unknown): EnemyDefinition[] {
  throwIfErrors(jsonSafetyErrors(raw, 'enemies.json'));
  const enemies = validate<EnemyDefinition>('enemies.json', raw, checkEnemy);
  assertUniqueIds('enemies.json', enemies);
  assertEliteReferences(enemies);
  return enemies;
}

function checkWeapon(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, WEAPON_FIELDS, errors);
  requireString(row, 'id', errors);
  requireString(row, 'name', errors);
  requireString(row, 'family', errors);
  requireRarity(row, 'rarity', errors);
  requirePositiveNumber(row, 'fireRateMs', errors);
  requirePositiveNumber(row, 'damage', errors);
  requirePositiveNumber(row, 'projectileSpeed', errors);
  requirePositiveNumber(row, 'range', errors);
  requirePositiveInteger(row, 'mergeTier', errors);
  requirePositiveInteger(row, 'maxTier', errors);
  requireNonNegativeInteger(row, 'pierce', errors);
  requirePositiveInteger(row, 'projectileCount', errors);
  requireNonNegativeNumber(row, 'spreadDeg', errors);
  return errors;
}

function checkEnemy(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  requireString(row, 'id', errors);
  requireString(row, 'name', errors);
  requireEnum(row, 'archetype', ENEMY_ARCHETYPES, errors);

  const archetype = readOwnField(row, 'archetype');
  if (archetype === 'elite') {
    rejectUnknownFields(row, ELITE_ENEMY_FIELDS, errors);
    requireString(row, 'baseEnemyId', errors);
    return errors;
  }

  const allowedFields = new Set(DIRECT_ENEMY_FIELDS);
  if (archetype === 'charger' || archetype === 'ranged') allowedFields.add('attack');
  rejectUnknownFields(row, allowedFields, errors);
  requirePositiveNumber(row, 'health', errors);
  requireNonNegativeNumber(row, 'damage', errors);
  requireNonNegativeNumber(row, 'speed', errors);
  requireNonNegativeInteger(row, 'xpValue', errors);
  requireNonNegativeInteger(row, 'scrapValue', errors);

  if (
    typeof archetype === 'string' &&
    isSpawnableEnemyDefinition(row as unknown as EnemyDefinition)
  ) {
    requirePositiveNumber(row, 'damage', errors);
    requirePositiveNumber(row, 'speed', errors);
    requirePositiveInteger(row, 'xpValue', errors);
    requireLiteral(row, 'contactDamage', true, errors);
  } else if (archetype === 'ranged' || archetype === 'boss') {
    requireLiteral(row, 'contactDamage', false, errors);
  } else {
    errors.push('archetype: invalid value');
  }

  if (archetype === 'charger') checkChargerAttack(row, errors);
  if (archetype === 'ranged') checkRangedAttack(row, errors);
  return errors;
}

function checkChargerAttack(enemy: Record<string, unknown>, errors: string[]): void {
  const attack = readOwnField(enemy, 'attack');
  if (!isRecord(attack)) {
    errors.push('attack: required object');
    return;
  }
  const attackErrors: string[] = [];
  rejectUnknownFields(attack, CHARGER_ATTACK_FIELDS, attackErrors);
  requirePositiveNumber(attack, 'triggerRange', attackErrors);
  requirePositiveInteger(attack, 'telegraphMs', attackErrors);
  requirePositiveNumber(attack, 'dashSpeed', attackErrors);
  requirePositiveInteger(attack, 'dashDurationMs', attackErrors);
  requirePositiveInteger(attack, 'cooldownMs', attackErrors);
  const dashSpeed = readOwnField(attack, 'dashSpeed');
  const baseSpeed = readOwnField(enemy, 'speed');
  if (isFiniteNumber(dashSpeed) && isFiniteNumber(baseSpeed) && dashSpeed <= baseSpeed) {
    attackErrors.push('dashSpeed: must exceed base speed');
  }
  errors.push(...attackErrors.map((error) => `attack.${error}`));
}

function checkRangedAttack(enemy: Record<string, unknown>, errors: string[]): void {
  const attack = readOwnField(enemy, 'attack');
  if (!isRecord(attack)) {
    errors.push('attack: required object');
    return;
  }
  const attackErrors: string[] = [];
  rejectUnknownFields(attack, RANGED_ATTACK_FIELDS, attackErrors);
  requirePositiveNumber(attack, 'range', attackErrors);
  requirePositiveInteger(attack, 'telegraphMs', attackErrors);
  requirePositiveInteger(attack, 'cooldownMs', attackErrors);
  errors.push(...attackErrors.map((error) => `attack.${error}`));
}

function checkUpgrade(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, UPGRADE_FIELDS, errors);
  requireString(row, 'id', errors);
  requireString(row, 'name', errors);
  requireRarity(row, 'rarity', errors);
  requireEnum(row, 'target', UPGRADE_TARGETS, errors);
  requireString(row, 'description', errors);
  requirePositiveInteger(row, 'maxStacks', errors);
  checkUpgradeEffects(row, errors);
  return errors;
}

function checkUpgradeEffects(upgrade: Record<string, unknown>, errors: string[]): void {
  const effects = readOwnField(upgrade, 'effects');
  if (!Array.isArray(effects) || effects.length === 0) {
    errors.push('effects: required non-empty array');
    return;
  }
  for (let index = 0; index < effects.length; index += 1) {
    if (!(index in effects)) {
      errors.push(`effects[${index}]: sparse array entry`);
      continue;
    }
    const effect = effects[index];
    if (!isRecord(effect)) {
      errors.push(`effects[${index}]: expected object`);
      continue;
    }
    const effectErrors: string[] = [];
    rejectUnknownFields(effect, UPGRADE_EFFECT_FIELDS, effectErrors);
    const stat = readOwnField(effect, 'stat');
    const op = readOwnField(effect, 'op');
    const value = readOwnField(effect, 'value');
    if (typeof stat !== 'string' || !STAT_KEY_SET.has(stat)) {
      effectErrors.push('stat: unknown stat key');
    }
    if (typeof op !== 'string' || !UPGRADE_OPS.has(op)) {
      effectErrors.push('op: must be "add" or "mult"');
    }
    if (!isFiniteNumber(value)) effectErrors.push('value: required finite number');
    errors.push(...effectErrors.map((error) => `effects[${index}].${error}`));
  }
}

function checkSpawnCurveShape(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, CURVE_FIELDS, errors);
  requireString(row, 'id', errors);
  requireIntegerInRange(row, 'durationSeconds', 1, 3600, errors);

  const scaling = readOwnField(row, 'scaling');
  if (!isRecord(scaling)) {
    errors.push('scaling: required object');
  } else {
    const scalingErrors: string[] = [];
    rejectUnknownFields(scaling, SCALING_FIELDS, scalingErrors);
    requireNumberInRange(scaling, 'healthPerMinute', 0, 1, scalingErrors);
    requireNumberInRange(scaling, 'damagePerMinute', 0, 1, scalingErrors);
    errors.push(...scalingErrors.map((error) => `scaling.${error}`));
  }

  const waves = readOwnField(row, 'waves');
  if (!Array.isArray(waves)) {
    errors.push('waves: required array');
    return errors;
  }
  for (let index = 0; index < waves.length; index += 1) {
    if (!(index in waves)) {
      errors.push(`waves[${index}]: sparse array entry`);
      continue;
    }
    const wave = waves[index];
    if (!isRecord(wave)) {
      errors.push(`waves[${index}]: expected object`);
      continue;
    }
    const waveErrors: string[] = [];
    rejectUnknownFields(wave, WAVE_FIELDS, waveErrors);
    requireNonNegativeInteger(wave, 'startSecond', waveErrors);
    requireString(wave, 'enemyId', waveErrors);
    requirePositiveInteger(wave, 'spawnEveryMs', waveErrors);
    requireIntegerInRange(wave, 'maxAlive', 1, 256, waveErrors);
    errors.push(...waveErrors.map((error) => `waves[${index}].${error}`));
  }
  return errors;
}

function assertUniqueIds(name: string, rows: ReadonlyArray<{ id: string }>): void {
  const seen = new Map<string, number>();
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const firstIndex = seen.get(row.id);
    if (firstIndex !== undefined) {
      errors.push(`${name}[${index}].id: duplicate id "${row.id}" first seen at index ${firstIndex}`);
    } else {
      seen.set(row.id, index);
    }
  });
  throwIfErrors(errors);
}

function assertEliteReferences(enemies: readonly EnemyDefinition[]): void {
  const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const errors: string[] = [];
  enemies.forEach((enemy, index) => {
    if (enemy.archetype !== 'elite') return;
    const base = byId.get(enemy.baseEnemyId);
    if (enemy.baseEnemyId === enemy.id) {
      errors.push(`enemies.json[${index}].baseEnemyId: elite cannot reference itself`);
    } else if (!base) {
      errors.push(`enemies.json[${index}].baseEnemyId: unknown enemyId "${enemy.baseEnemyId}"`);
    } else if (!isSpawnableEnemyDefinition(base)) {
      errors.push(`enemies.json[${index}].baseEnemyId: must reference a direct chaser, charger, or tank`);
    }
  });
  throwIfErrors(errors);
}

function assertWeaponTiers(weapons: readonly WeaponDefinition[]): void {
  const byFamily = new Map<string, Array<{ weapon: WeaponDefinition; index: number }>>();
  const errors: string[] = [];
  weapons.forEach((weapon, index) => {
    if (weapon.mergeTier > weapon.maxTier) {
      errors.push(`weapons.json[${index}].mergeTier: ${weapon.mergeTier} exceeds maxTier ${weapon.maxTier}`);
    }
    const family = byFamily.get(weapon.family) ?? [];
    family.push({ weapon, index });
    byFamily.set(weapon.family, family);
  });
  byFamily.forEach((entries, family) => {
    const expectedMaxTier = entries[0]?.weapon.maxTier;
    if (expectedMaxTier === undefined) return;
    const tiers = new Map<number, number>();
    entries.forEach(({ weapon, index }) => {
      if (weapon.maxTier !== expectedMaxTier) {
        errors.push(`weapons.json[${index}].maxTier: family "${family}" expected ${expectedMaxTier}`);
      }
      const firstIndex = tiers.get(weapon.mergeTier);
      if (firstIndex !== undefined) {
        errors.push(`weapons.json[${index}].mergeTier: duplicate tier ${weapon.mergeTier} for family "${family}" first seen at index ${firstIndex}`);
      } else {
        tiers.set(weapon.mergeTier, index);
      }
    });
    for (let tier = 1; tier <= expectedMaxTier; tier += 1) {
      if (!tiers.has(tier)) errors.push(`weapons.json: family "${family}" missing mergeTier ${tier}`);
    }
    for (const [tier, index] of tiers) {
      if (tier < 1 || tier > expectedMaxTier) {
        errors.push(`weapons.json[${index}].mergeTier: tier ${tier} outside 1..${expectedMaxTier}`);
      }
    }
  });
  throwIfErrors(errors);
}

function assertStarterWeapons(weapons: readonly WeaponDefinition[]): void {
  const starters = new Set(weapons.filter((weapon) => weapon.mergeTier === 1).map((weapon) => weapon.family));
  throwIfErrors(DEFAULT_WEAPON_FAMILIES
    .filter((family) => !starters.has(family))
    .map((family) => `weapons.json: missing required starter family "${family}" at mergeTier 1`));
}

function assertSpawnReferences(
  curves: readonly SpawnCurveDefinition[],
  enemies: readonly EnemyDefinition[],
): void {
  const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const errors: string[] = [];
  curves.forEach((curve, curveIndex) => curve.waves.forEach((wave, waveIndex) => {
    const enemy = byId.get(wave.enemyId);
    if (!enemy) {
      errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].enemyId: unknown enemyId "${wave.enemyId}"`);
    } else if (!isSpawnableEnemyDefinition(enemy)) {
      errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].enemyId: must reference a direct chaser, charger, or tank`);
    }
  }));
  throwIfErrors(errors);
}

function assertPlayableSpawnCurves(curves: readonly SpawnCurveDefinition[]): void {
  const errors: string[] = [];
  if (curves.length === 0) errors.push('spawn-curves.json: at least one spawn curve is required');
  curves.forEach((curve, curveIndex) => {
    if (curve.waves.length === 0) {
      errors.push(`spawn-curves.json[${curveIndex}].waves: at least one wave is required`);
      return;
    }
    if (curve.waves[0]?.startSecond !== 0) {
      errors.push(`spawn-curves.json[${curveIndex}].waves[0].startSecond: first wave must start at 0`);
    }
    let previousStart = -1;
    let totalMaxAlive = 0;
    const enemyIds = new Set<string>();
    curve.waves.forEach((wave, waveIndex) => {
      if (wave.startSecond < previousStart) {
        errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].startSecond: must be nondecreasing`);
      }
      previousStart = wave.startSecond;
      if (wave.startSecond >= curve.durationSeconds) {
        errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].startSecond: must be before durationSeconds`);
      }
      if (wave.startSecond * 1000 + wave.spawnEveryMs >= curve.durationSeconds * 1000) {
        errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].spawnEveryMs: first due spawn must be before curve end`);
      }
      if (enemyIds.has(wave.enemyId)) {
        errors.push(`spawn-curves.json[${curveIndex}].waves[${waveIndex}].enemyId: duplicate layer "${wave.enemyId}"`);
      }
      enemyIds.add(wave.enemyId);
      totalMaxAlive += wave.maxAlive;
    });
    if (totalMaxAlive > 256) {
      errors.push(`spawn-curves.json[${curveIndex}].waves: combined maxAlive ${totalMaxAlive} exceeds 256`);
    }
  });
  throwIfErrors(errors);
}

function rejectUnknownFields(row: Record<string, unknown>, allowed: ReadonlySet<string>, errors: string[], prefix = ''): void {
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) errors.push(`${prefix ? `${prefix}.` : ''}${key}: unknown field`);
  }
}

function requireRecord(value: unknown): string[] {
  return isRecord(value) ? [] : ['row: expected object'];
}

function requireString(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    errors.push(`${field}: required nonempty trimmed string`);
  }
}

function requirePositiveNumber(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (!isFiniteNumber(value) || value <= 0) errors.push(`${field}: required positive number`);
}

function requireNonNegativeNumber(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (!isFiniteNumber(value) || value < 0) errors.push(`${field}: required non-negative number`);
}

function requirePositiveInteger(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${field}: required positive integer`);
  }
}

function requireNonNegativeInteger(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`${field}: required non-negative integer`);
  }
}

function requireIntegerInRange(row: Record<string, unknown>, field: string, min: number, max: number, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${field}: required integer from ${min} through ${max}`);
  }
}

function requireNumberInRange(row: Record<string, unknown>, field: string, min: number, max: number, errors: string[]): void {
  const value = readOwnField(row, field);
  if (!isFiniteNumber(value) || value < min || value > max) {
    errors.push(`${field}: required finite number from ${min} through ${max}`);
  }
}

function requireLiteral(row: Record<string, unknown>, field: string, expected: boolean, errors: string[]): void {
  if (readOwnField(row, field) !== expected) errors.push(`${field}: must be ${String(expected)}`);
}

function requireRarity(row: Record<string, unknown>, field: string, errors: string[]): void {
  requireEnum(row, field, RARITIES, errors);
}

function requireEnum<T extends string>(row: Record<string, unknown>, field: string, allowed: ReadonlySet<T>, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'string' || !allowed.has(value as T)) errors.push(`${field}: invalid value`);
}

function jsonSafetyErrors(value: unknown, path: string, active = new WeakSet<object>()): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path}: non-JSON-safe number`];
  if (typeof value !== 'object') return [`${path}: non-JSON-safe value`];
  if (active.has(value)) return [`${path}: circular reference is not JSON-safe`];
  if (!Array.isArray(value) && !isRecord(value)) return [`${path}: non-JSON-safe object`];

  active.add(value);
  const errors: string[] = [];
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      if (typeof key !== 'string' || !isCanonicalArrayIndex(key, value.length)) {
        errors.push(`${path}.${String(key)}: non-index array property is not JSON-safe`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const itemPath = `${path}[${index}]`;
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) errors.push(`${itemPath}: sparse array entry`);
      else errors.push(...jsonPropertySafetyErrors(descriptor, itemPath, active));
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        errors.push(`${path}.${String(key)}: symbol-keyed property is not JSON-safe`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor) {
        errors.push(...jsonPropertySafetyErrors(descriptor, `${path}.${key}`, active));
      }
    }
  }
  active.delete(value);
  return errors;
}

function jsonPropertySafetyErrors(
  descriptor: PropertyDescriptor,
  path: string,
  active: WeakSet<object>,
): string[] {
  if (!descriptor.enumerable) return [`${path}: property must be enumerable`];
  if (!Object.hasOwn(descriptor, 'value')) {
    return [`${path}: accessor property is not JSON-safe`];
  }
  return jsonSafetyErrors(descriptor.value, path, active);
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function readOwnField(row: Record<string, unknown>, field: string): unknown {
  return Object.hasOwn(row, field) ? row[field] : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function throwIfErrors(errors: string[]): void {
  if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
}
