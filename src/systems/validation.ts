import charactersJson from '../data/characters.json';
import enemiesJson from '../data/enemies.json';
import metaUpgradesJson from '../data/meta-upgrades.json';
import spawnCurvesJson from '../data/spawn-curves.json';
import upgradesJson from '../data/upgrades.json';
import weaponsJson from '../data/weapons.json';
import arenasJson from '../data/arenas.json';
import { STAT_KEYS } from '../gameplay/stats';
import { DEFAULT_WEAPON_FAMILIES } from '../gameplay/weapons';
import type {
  ArenaDefinition,
  CharacterDefinition,
  EnemyDefinition,
  EnemyArchetype,
  GameData,
  MetaUpgradeDefinition,
  Rarity,
  SpawnCurveDefinition,
  UpgradeDefinition,
  WeaponDefinition,
} from './types';
import { isSpawnableEnemyDefinition } from './types';
import { CHARACTER_PASSIVE_EVENTS } from './types';
import { isContentId, isUnlockId } from './ids';
import { findRectWitness, findRingWitness } from '../gameplay/spawnRegion';

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
const META_UPGRADE_FIELDS = new Set(['id', 'name', 'description', 'maxLevel', 'cost', 'effects']);
const META_UPGRADE_COST_FIELDS = new Set(['base', 'growth']);
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
const ROOT_FIELDS = new Set(['weapons', 'enemies', 'upgrades', 'metaUpgrades', 'spawnCurves', 'characters', 'arenas']);
const CHARACTER_FIELDS = new Set([
  'id', 'name', 'description', 'baseStats', 'startingWeaponIds', 'passives',
  'unlock', 'cosmeticSkinIds',
]);
const CHARACTER_BASE_STATS_FIELDS = new Set(['maxHealth', 'moveSpeed']);
const CHARACTER_STATIC_PASSIVE_FIELDS = new Set(['id', 'kind', 'name', 'description', 'effects']);
const CHARACTER_REACTIVE_PASSIVE_FIELDS = new Set(['id', 'kind', 'name', 'description', 'event', 'handlerId']);
const ARENA_FIELDS = new Set(['id', 'name', 'size', 'spawnCurveId', 'spawnRegions', 'obstacles', 'hazards', 'unlock']);
const ARENA_SIZE_FIELDS = new Set(['width', 'height']);
const REGION_RING_FIELDS = new Set(['kind', 'cx', 'cy', 'minRadius', 'maxRadius']);
const REGION_RECT_FIELDS = new Set(['kind', 'x', 'y', 'w', 'h']);
const REGION_EDGES_FIELDS = new Set(['kind', 'margin']);
const OBSTACLE_FIELDS = new Set(['x', 'y', 'w', 'h']);
const HAZARD_FIELDS = new Set(['id', 'kind', 'x', 'y', 'w', 'h', 'damagePerSecond']);
// Catalog-count ceilings. The spawn-witness search (findRectWitness/findRingWitness)
// partitions the arena at obstacle edges — cost grows super-linearly with the
// obstacle count — so an unbounded catalog could make boot-time validation hang.
// These caps keep the witness (and the per-entry/coverage scans) bounded, in the
// same spirit as the existing size/maxAlive bounds.
const MAX_SPAWN_REGIONS = 16;
const MAX_OBSTACLES = 256;
const MAX_HAZARDS = 64;
const UNLOCK_DEFAULT_FIELDS = new Set(['type']);
const UNLOCK_META_FIELDS = new Set(['type', 'requiresUnlockId']);

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
    metaUpgrades: metaUpgradesJson,
    spawnCurves: spawnCurvesJson,
    characters: charactersJson,
    arenas: arenasJson,
  });
}

export function validateGameData(raw: unknown): GameData {
  const rootErrors = jsonSafetyErrors(raw, 'game-data').map((error) =>
    error
      .replace(/^game-data\.weapons/, 'weapons.json')
      .replace(/^game-data\.enemies/, 'enemies.json')
      .replace(/^game-data\.upgrades/, 'upgrades.json')
      .replace(/^game-data\.metaUpgrades/, 'meta-upgrades.json')
      .replace(/^game-data\.spawnCurves/, 'spawn-curves.json')
      .replace(/^game-data\.characters/, 'characters.json')
      .replace(/^game-data\.arenas/, 'arenas.json'),
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
  const metaUpgrades = validateMetaUpgradeCatalog(readOwnField(raw, 'metaUpgrades'));
  const spawnCurves = validate<SpawnCurveDefinition>(
    'spawn-curves.json',
    readOwnField(raw, 'spawnCurves'),
    checkSpawnCurveShape,
  );
  const characters = validateCharacterCatalog(readOwnField(raw, 'characters'));
  const arenas = validateArenaCatalog(readOwnField(raw, 'arenas'));

  assertUniqueIds('weapons.json', weapons);
  assertUniqueIds('upgrades.json', upgrades);
  assertUniqueIds('spawn-curves.json', spawnCurves);
  assertWeaponTiers(weapons);
  assertStarterWeapons(weapons);
  assertPlayableSpawnCurves(spawnCurves);
  assertSpawnReferences(spawnCurves, enemies);
  assertCharacterWeaponReferences(characters, weapons);
  assertArenaSpawnCurveReferences(arenas, spawnCurves);

  return { weapons, enemies, upgrades, metaUpgrades, spawnCurves, characters, arenas };
}

export function validateMetaUpgradeCatalog(raw: unknown): MetaUpgradeDefinition[] {
  throwIfErrors(jsonSafetyErrors(raw, 'meta-upgrades.json'));
  const definitions = validate<MetaUpgradeDefinition>(
    'meta-upgrades.json',
    raw,
    checkMetaUpgrade,
  );
  assertUniqueIds('meta-upgrades.json', definitions);
  return definitions;
}

export function validateEnemyCatalog(raw: unknown): EnemyDefinition[] {
  throwIfErrors(jsonSafetyErrors(raw, 'enemies.json'));
  const enemies = validate<EnemyDefinition>('enemies.json', raw, checkEnemy);
  assertUniqueIds('enemies.json', enemies);
  assertEliteReferences(enemies);
  return enemies;
}

export function validateArenaCatalog(raw: unknown): ArenaDefinition[] {
  throwIfErrors(jsonSafetyErrors(raw, 'arenas.json'));
  const arenas = validate<ArenaDefinition>('arenas.json', raw, checkArena);
  assertUniqueIds('arenas.json', arenas);
  assertArenaDefaultExists(arenas);
  return arenas;
}

export function validateCharacterCatalog(raw: unknown): CharacterDefinition[] {
  throwIfErrors(jsonSafetyErrors(raw, 'characters.json'));
  const characters = validate<CharacterDefinition>('characters.json', raw, checkCharacter);
  assertUniqueIds('characters.json', characters);
  assertCharacterDefaultExists(characters);
  return characters;
}

function checkUnlockRule(unlock: Record<string, unknown>, errors: string[]): void {
  const unlockType = readOwnField(unlock, 'type');
  if (unlockType === 'default') {
    rejectUnknownFields(unlock, UNLOCK_DEFAULT_FIELDS, errors);
  } else if (unlockType === 'meta') {
    rejectUnknownFields(unlock, UNLOCK_META_FIELDS, errors);
    requireString(unlock, 'requiresUnlockId', errors);
    const requiresUnlockId = readOwnField(unlock, 'requiresUnlockId');
    if (typeof requiresUnlockId === 'string' && !isUnlockId(requiresUnlockId)) {
      errors.push('requiresUnlockId: invalid unlock id');
    }
  } else {
    errors.push('type: must be "default" or "meta"');
  }
}

function checkArena(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, ARENA_FIELDS, errors);

  requireString(row, 'id', errors);
  const id = readOwnField(row, 'id');
  if (typeof id === 'string' && !isContentId(id)) errors.push('id: invalid content id');
  requireString(row, 'name', errors);

  const size = readOwnField(row, 'size');
  if (!isRecord(size)) {
    errors.push('size: required object');
  } else {
    const sizeErrors: string[] = [];
    rejectUnknownFields(size, ARENA_SIZE_FIELDS, sizeErrors);
    requireIntegerInRange(size, 'width', 256, 16384, sizeErrors);
    requireIntegerInRange(size, 'height', 256, 16384, sizeErrors);
    errors.push(...sizeErrors.map((error) => `size.${error}`));
  }

  requireString(row, 'spawnCurveId', errors);

  const spawnRegions = readOwnField(row, 'spawnRegions');
  const spawnRegionList: unknown[] = Array.isArray(spawnRegions) ? spawnRegions : [];
  if (!Array.isArray(spawnRegions) || spawnRegions.length < 1) {
    errors.push('spawnRegions: required array with at least one entry');
  } else if (spawnRegions.length > MAX_SPAWN_REGIONS) {
    errors.push(`spawnRegions: too many entries (max ${MAX_SPAWN_REGIONS})`);
  } else {
    const arenaWidth = isRecord(size) ? readOwnField(size, 'width') : undefined;
    const arenaHeight = isRecord(size) ? readOwnField(size, 'height') : undefined;
    const w = typeof arenaWidth === 'number' ? arenaWidth : 0;
    const h = typeof arenaHeight === 'number' ? arenaHeight : 0;
    for (let index = 0; index < spawnRegions.length; index += 1) {
      if (!(index in spawnRegions)) {
        errors.push(`spawnRegions[${index}]: sparse array entry`);
        continue;
      }
      const region = spawnRegions[index];
      if (!isRecord(region)) {
        errors.push(`spawnRegions[${index}]: expected object`);
        continue;
      }
      const kind = readOwnField(region, 'kind');
      const regionErrors: string[] = [];
      if (kind === 'ring') {
        rejectUnknownFields(region, REGION_RING_FIELDS, regionErrors);
        requireNonNegativeNumber(region, 'cx', regionErrors);
        requireNonNegativeNumber(region, 'cy', regionErrors);
        requireNonNegativeNumber(region, 'minRadius', regionErrors);
        requirePositiveNumber(region, 'maxRadius', regionErrors);
        const minR = readOwnField(region, 'minRadius');
        const maxR = readOwnField(region, 'maxRadius');
        if (isFiniteNumber(minR) && isFiniteNumber(maxR) && maxR <= minR) {
          regionErrors.push('maxRadius: must exceed minRadius');
        }
        const cx = readOwnField(region, 'cx');
        const cy = readOwnField(region, 'cy');
        if (isFiniteNumber(cx) && w > 0 && (cx < 0 || cx > w)) regionErrors.push('cx: must be within arena width');
        if (isFiniteNumber(cy) && h > 0 && (cy < 0 || cy > h)) regionErrors.push('cy: must be within arena height');
        // Reject impossible rings: minRadius must not exceed max distance from
        // centre to any arena corner, otherwise no point on the annulus is in bounds.
        if (isFiniteNumber(cx) && isFiniteNumber(cy) && isFiniteNumber(minR) && w > 0 && h > 0) {
          const cornerDist = Math.max(
            Math.hypot(cx, cy),
            Math.hypot(w - cx, cy),
            Math.hypot(cx, h - cy),
            Math.hypot(w - cx, h - cy),
          );
          if (minR > cornerDist + 1e-9) {
            regionErrors.push('minRadius: annulus has no intersection with arena bounds');
          }
        }
      } else if (kind === 'rect') {
        rejectUnknownFields(region, REGION_RECT_FIELDS, regionErrors);
        requireNonNegativeNumber(region, 'x', regionErrors);
        requireNonNegativeNumber(region, 'y', regionErrors);
        requirePositiveNumber(region, 'w', regionErrors);
        requirePositiveNumber(region, 'h', regionErrors);
        const rx = readOwnField(region, 'x');
        const ry = readOwnField(region, 'y');
        const rw = readOwnField(region, 'w');
        const rh = readOwnField(region, 'h');
        if (isFiniteNumber(rx) && isFiniteNumber(rw) && w > 0 && rx + rw > w) {
          regionErrors.push('x + w: must not exceed arena width');
        }
        if (isFiniteNumber(ry) && isFiniteNumber(rh) && h > 0 && ry + rh > h) {
          regionErrors.push('y + h: must not exceed arena height');
        }
      } else if (kind === 'edges') {
        rejectUnknownFields(region, REGION_EDGES_FIELDS, regionErrors);
        requireNonNegativeNumber(region, 'margin', regionErrors);
        const margin = readOwnField(region, 'margin');
        if (isFiniteNumber(margin) && w > 0 && h > 0 && margin > Math.min(w, h) / 2) {
          regionErrors.push('margin: must not exceed half the smaller arena dimension');
        }
      } else {
        regionErrors.push('kind: must be "ring", "rect", or "edges"');
      }
      errors.push(...regionErrors.map((error) => `spawnRegions[${index}].${error}`));
    }
  }

  const obstacles = readOwnField(row, 'obstacles');
  if (!Array.isArray(obstacles)) {
    errors.push('obstacles: required array');
  } else if (obstacles.length > MAX_OBSTACLES) {
    errors.push(`obstacles: too many entries (max ${MAX_OBSTACLES})`);
  } else {
    const arenaWidth = isRecord(size) ? readOwnField(size, 'width') : undefined;
    const arenaHeight = isRecord(size) ? readOwnField(size, 'height') : undefined;
    const w = typeof arenaWidth === 'number' ? arenaWidth : 0;
    const h = typeof arenaHeight === 'number' ? arenaHeight : 0;
    for (let index = 0; index < obstacles.length; index += 1) {
      if (!(index in obstacles)) {
        errors.push(`obstacles[${index}]: sparse array entry`);
        continue;
      }
      const obstacle = obstacles[index];
      if (!isRecord(obstacle)) {
        errors.push(`obstacles[${index}]: expected object`);
        continue;
      }
      const obsErrors: string[] = [];
      rejectUnknownFields(obstacle, OBSTACLE_FIELDS, obsErrors);
      requireNonNegativeNumber(obstacle, 'x', obsErrors);
      requireNonNegativeNumber(obstacle, 'y', obsErrors);
      requirePositiveNumber(obstacle, 'w', obsErrors);
      requirePositiveNumber(obstacle, 'h', obsErrors);
      const ox = readOwnField(obstacle, 'x');
      const oy = readOwnField(obstacle, 'y');
      const ow = readOwnField(obstacle, 'w');
      const oh = readOwnField(obstacle, 'h');
      if (isFiniteNumber(ox) && isFiniteNumber(ow) && w > 0 && ox + ow > w) {
        obsErrors.push('x + w: must not exceed arena width');
      }
      if (isFiniteNumber(oy) && isFiniteNumber(oh) && h > 0 && oy + oh > h) {
        obsErrors.push('y + h: must not exceed arena height');
      }
      if (isFiniteNumber(ox) && isFiniteNumber(oy) && isFiniteNumber(ow) && isFiniteNumber(oh) && w > 0 && h > 0) {
        const centreX = w / 2;
        const centreY = h / 2;
        if (centreX >= ox && centreX <= ox + ow && centreY >= oy && centreY <= oy + oh) {
          obsErrors.push('obstacle must not contain arena centre');
        }
      }
      errors.push(...obsErrors.map((error) => `obstacles[${index}].${error}`));
    }

    // Check obstacles don't fully cover any rect/ring spawn region's bounding box.
    // Bounded by MAX_SPAWN_REGIONS so an over-cap catalog (already flagged above)
    // cannot make this coverage scan super-linear.
    for (let rIdx = 0; rIdx < spawnRegionList.length && rIdx < MAX_SPAWN_REGIONS; rIdx += 1) {
      const region = spawnRegionList[rIdx];
      if (!isRecord(region)) continue;
      const kind = readOwnField(region, 'kind');
      if (kind !== 'rect' && kind !== 'ring') continue;

      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      if (kind === 'rect') {
        const rx = readOwnField(region, 'x');
        const ry = readOwnField(region, 'y');
        const rw = readOwnField(region, 'w');
        const rh = readOwnField(region, 'h');
        if (isFiniteNumber(rx) && isFiniteNumber(ry) && isFiniteNumber(rw) && isFiniteNumber(rh)) {
          minX = rx; minY = ry; maxX = rx + rw; maxY = ry + rh;
        }
      } else if (kind === 'ring') {
        const cx = readOwnField(region, 'cx');
        const cy = readOwnField(region, 'cy');
        const maxR = readOwnField(region, 'maxRadius');
        if (isFiniteNumber(cx) && isFiniteNumber(cy) && isFiniteNumber(maxR)) {
          minX = cx - maxR; minY = cy - maxR; maxX = cx + maxR; maxY = cy + maxR;
        }
      }

      for (let oIdx = 0; oIdx < obstacles.length; oIdx += 1) {
        const obstacle = obstacles[oIdx];
        if (!isRecord(obstacle)) continue;
        const ox = readOwnField(obstacle, 'x');
        const oy = readOwnField(obstacle, 'y');
        const ow = readOwnField(obstacle, 'w');
        const oh = readOwnField(obstacle, 'h');
        if (isFiniteNumber(ox) && isFiniteNumber(oy) && isFiniteNumber(ow) && isFiniteNumber(oh)) {
          if (ox <= minX && oy <= minY && ox + ow >= maxX && oy + oh >= maxY) {
            errors.push(`obstacles[${oIdx}]: must not fully cover spawnRegions[${rIdx}] (${kind})`);
          }
        }
      }
    }
  }

  const hazards = readOwnField(row, 'hazards');
  if (!Array.isArray(hazards)) {
    errors.push('hazards: required array');
  } else if (hazards.length > MAX_HAZARDS) {
    errors.push(`hazards: too many entries (max ${MAX_HAZARDS})`);
  } else {
    const arenaWidth = isRecord(size) ? readOwnField(size, 'width') : undefined;
    const arenaHeight = isRecord(size) ? readOwnField(size, 'height') : undefined;
    const w = typeof arenaWidth === 'number' ? arenaWidth : 0;
    const h = typeof arenaHeight === 'number' ? arenaHeight : 0;
    const seenHazardIds = new Set<string>();
    for (let index = 0; index < hazards.length; index += 1) {
      if (!(index in hazards)) {
        errors.push(`hazards[${index}]: sparse array entry`);
        continue;
      }
      const hazard = hazards[index];
      if (!isRecord(hazard)) {
        errors.push(`hazards[${index}]: expected object`);
        continue;
      }
      const hazErrors: string[] = [];
      rejectUnknownFields(hazard, HAZARD_FIELDS, hazErrors);
      requireString(hazard, 'id', hazErrors);
      const hid = readOwnField(hazard, 'id');
      if (typeof hid === 'string' && !isContentId(hid)) hazErrors.push('id: invalid content id');
      if (typeof hid === 'string' && seenHazardIds.has(hid)) hazErrors.push(`id: duplicate hazard id "${hid}"`);
      if (typeof hid === 'string') seenHazardIds.add(hid);
      requireString(hazard, 'kind', hazErrors);
      requireNonNegativeNumber(hazard, 'x', hazErrors);
      requireNonNegativeNumber(hazard, 'y', hazErrors);
      requirePositiveNumber(hazard, 'w', hazErrors);
      requirePositiveNumber(hazard, 'h', hazErrors);
      const hx = readOwnField(hazard, 'x');
      const hy = readOwnField(hazard, 'y');
      const hw = readOwnField(hazard, 'w');
      const hh = readOwnField(hazard, 'h');
      if (isFiniteNumber(hx) && isFiniteNumber(hw) && w > 0 && hx + hw > w) {
        hazErrors.push('x + w: must not exceed arena width');
      }
      if (isFiniteNumber(hy) && isFiniteNumber(hh) && h > 0 && hy + hh > h) {
        hazErrors.push('y + h: must not exceed arena height');
      }
      const dps = readOwnField(hazard, 'damagePerSecond');
      if (!isFiniteNumber(dps) || dps <= 0 || dps > 1000) {
        hazErrors.push('damagePerSecond: required finite number in (0, 1000]');
      }
      errors.push(...hazErrors.map((error) => `hazards[${index}].${error}`));
    }
  }

  const unlock = readOwnField(row, 'unlock');
  if (!isRecord(unlock)) {
    errors.push('unlock: required object');
  } else {
    const unlockErrors: string[] = [];
    checkUnlockRule(unlock, unlockErrors);
    errors.push(...unlockErrors.map((error) => `unlock.${error}`));
  }

  // Reject rect/ring regions without a deterministic spawn witness.
  if (errors.length === 0) {
    const arenaObstacles: Array<{ x: number; y: number; w: number; h: number }> = [];
    const obstaclesRaw = readOwnField(row, 'obstacles');
    if (Array.isArray(obstaclesRaw)) {
      for (const o of obstaclesRaw) {
        if (!isRecord(o)) continue;
        const ox = readOwnField(o, 'x');
        const oy = readOwnField(o, 'y');
        const ow = readOwnField(o, 'w');
        const oh = readOwnField(o, 'h');
        if (isFiniteNumber(ox) && isFiniteNumber(oy) && isFiniteNumber(ow) && isFiniteNumber(oh)) {
          arenaObstacles.push({ x: ox, y: oy, w: ow, h: oh });
        }
      }
    }
    for (let rIdx = 0; rIdx < spawnRegionList.length; rIdx += 1) {
      const region = spawnRegionList[rIdx];
      if (!isRecord(region)) continue;
      const kind = readOwnField(region, 'kind');
      if (kind === 'rect') {
        const rx = readOwnField(region, 'x');
        const ry = readOwnField(region, 'y');
        const rw = readOwnField(region, 'w');
        const rh = readOwnField(region, 'h');
        if (!isFiniteNumber(rx) || !isFiniteNumber(ry) || !isFiniteNumber(rw) || !isFiniteNumber(rh)) continue;
        const witness = findRectWitness(
          { x: rx, y: ry, w: rw, h: rh },
          arenaObstacles,
        );
        if (!witness) {
          errors.push(`spawnRegions[${rIdx}]: rect region fully covered by obstacles — no spawnable point`);
        }
        continue;
      }
      if (kind === 'ring') {
        const cx = readOwnField(region, 'cx');
        const cy = readOwnField(region, 'cy');
        const minRadius = readOwnField(region, 'minRadius');
        const maxRadius = readOwnField(region, 'maxRadius');
        const sizeRecord = readOwnField(row, 'size');
        const width = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'width') : undefined;
        const height = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'height') : undefined;
        if (
          !isFiniteNumber(cx) || !isFiniteNumber(cy) ||
          !isFiniteNumber(minRadius) || !isFiniteNumber(maxRadius) ||
          !isFiniteNumber(width) || !isFiniteNumber(height)
        ) {
          continue;
        }
        const witness = findRingWitness(
          { kind: 'ring', cx, cy, minRadius, maxRadius },
          { width, height },
          arenaObstacles,
        );
        if (!witness) {
          errors.push(`spawnRegions[${rIdx}]: ring region has no spawnable point`);
        }
      }
    }
  }

  return errors;
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

function checkCharacter(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, CHARACTER_FIELDS, errors);

  requireString(row, 'id', errors);
  const id = readOwnField(row, 'id');
  if (typeof id === 'string' && !isContentId(id)) errors.push('id: invalid content id');
  requireString(row, 'name', errors);
  requireString(row, 'description', errors);

  const baseStats = readOwnField(row, 'baseStats');
  if (!isRecord(baseStats)) {
    errors.push('baseStats: required object');
  } else {
    const baseStatsErrors: string[] = [];
    rejectUnknownFields(baseStats, CHARACTER_BASE_STATS_FIELDS, baseStatsErrors);
    requirePositiveNumber(baseStats, 'maxHealth', baseStatsErrors);
    requirePositiveNumber(baseStats, 'moveSpeed', baseStatsErrors);
    errors.push(...baseStatsErrors.map((error) => `baseStats.${error}`));
  }

  const startingWeaponIds = readOwnField(row, 'startingWeaponIds');
  if (!Array.isArray(startingWeaponIds)) {
    errors.push('startingWeaponIds: required array');
  } else if (startingWeaponIds.length < 1 || startingWeaponIds.length > 6) {
    errors.push('startingWeaponIds: must have 1-6 entries');
  } else {
    const seenIds = new Set<string>();
    for (let index = 0; index < startingWeaponIds.length; index += 1) {
      if (!(index in startingWeaponIds)) {
        errors.push(`startingWeaponIds[${index}]: sparse array entry`);
        continue;
      }
      const weaponId = startingWeaponIds[index];
      if (typeof weaponId !== 'string' || weaponId.length === 0 || weaponId.trim() !== weaponId) {
        errors.push(`startingWeaponIds[${index}]: required nonempty trimmed string`);
      } else if (seenIds.has(weaponId)) {
        errors.push(`startingWeaponIds[${index}]: duplicate weapon id "${weaponId}"`);
      } else {
        seenIds.add(weaponId);
      }
    }
  }

  const passives = readOwnField(row, 'passives');
  if (!Array.isArray(passives)) {
    errors.push('passives: required array');
  } else {
    const seenPassiveIds = new Set<string>();
    for (let index = 0; index < passives.length; index += 1) {
      if (!(index in passives)) {
        errors.push(`passives[${index}]: sparse array entry`);
        continue;
      }
      const passive = passives[index];
      if (!isRecord(passive)) {
        errors.push(`passives[${index}]: expected object`);
        continue;
      }
      const kind = readOwnField(passive, 'kind');
      if (kind === 'static') {
        checkCharacterStaticPassive(passive, seenPassiveIds, `passives[${index}]`, errors);
      } else if (kind === 'reactive') {
        checkCharacterReactivePassive(passive, seenPassiveIds, `passives[${index}]`, errors);
      } else {
        errors.push(`passives[${index}].kind: must be "static" or "reactive"`);
      }
    }
  }

  const unlock = readOwnField(row, 'unlock');
  if (!isRecord(unlock)) {
    errors.push('unlock: required object');
  } else {
    const unlockErrors: string[] = [];
    checkUnlockRule(unlock, unlockErrors);
    errors.push(...unlockErrors.map((error) => `unlock.${error}`));
  }

  const cosmeticSkinIds = readOwnField(row, 'cosmeticSkinIds');
  if (!Array.isArray(cosmeticSkinIds)) {
    errors.push('cosmeticSkinIds: required array');
  } else {
    const seenSkinIds = new Set<string>();
    for (let index = 0; index < cosmeticSkinIds.length; index += 1) {
      if (!(index in cosmeticSkinIds)) {
        errors.push(`cosmeticSkinIds[${index}]: sparse array entry`);
        continue;
      }
      const skinId = cosmeticSkinIds[index];
      if (typeof skinId !== 'string' || skinId.length === 0 || skinId.trim() !== skinId) {
        errors.push(`cosmeticSkinIds[${index}]: required nonempty trimmed string`);
      } else if (!isContentId(skinId)) {
        errors.push(`cosmeticSkinIds[${index}]: invalid content id`);
      } else if (seenSkinIds.has(skinId)) {
        errors.push(`cosmeticSkinIds[${index}]: duplicate skin id "${skinId}"`);
      } else {
        seenSkinIds.add(skinId);
      }
    }
  }

  return errors;
}

function checkCharacterStaticPassive(
  passive: Record<string, unknown>,
  seenPassiveIds: Set<string>,
  path: string,
  errors: string[],
): void {
  const passiveErrors: string[] = [];
  rejectUnknownFields(passive, CHARACTER_STATIC_PASSIVE_FIELDS, passiveErrors);

  requireString(passive, 'id', passiveErrors);
  const pid = readOwnField(passive, 'id');
  if (typeof pid === 'string' && !isContentId(pid)) passiveErrors.push('id: invalid content id');
  if (typeof pid === 'string' && seenPassiveIds.has(pid)) {
    passiveErrors.push(`id: duplicate passive id "${pid}"`);
  }
  if (typeof pid === 'string') seenPassiveIds.add(pid);

  requireString(passive, 'name', passiveErrors);
  requireString(passive, 'description', passiveErrors);

  const effects = readOwnField(passive, 'effects');
  if (!Array.isArray(effects) || effects.length === 0) {
    passiveErrors.push('effects: required non-empty array');
  } else {
    const seenPairs = new Set<string>();
    for (let index = 0; index < effects.length; index += 1) {
      if (!(index in effects)) {
        passiveErrors.push(`effects[${index}]: sparse array entry`);
        continue;
      }
      const effect = effects[index];
      if (!isRecord(effect)) {
        passiveErrors.push(`effects[${index}]: expected object`);
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
      if (typeof stat === 'string' && typeof op === 'string') {
        const pair = `${stat}:${op}`;
        if (seenPairs.has(pair)) effectErrors.push('duplicate stat/op pair');
        seenPairs.add(pair);
      }
      passiveErrors.push(...effectErrors.map((error) => `effects[${index}]: ${error}`));
    }
  }

  errors.push(...passiveErrors.map((error) => `${path}.${error}`));
}

function checkCharacterReactivePassive(
  passive: Record<string, unknown>,
  seenPassiveIds: Set<string>,
  path: string,
  errors: string[],
): void {
  const passiveErrors: string[] = [];
  rejectUnknownFields(passive, CHARACTER_REACTIVE_PASSIVE_FIELDS, passiveErrors);

  requireString(passive, 'id', passiveErrors);
  const pid = readOwnField(passive, 'id');
  if (typeof pid === 'string' && !isContentId(pid)) passiveErrors.push('id: invalid content id');
  if (typeof pid === 'string' && seenPassiveIds.has(pid)) {
    passiveErrors.push(`id: duplicate passive id "${pid}"`);
  }
  if (typeof pid === 'string') seenPassiveIds.add(pid);

  requireString(passive, 'name', passiveErrors);
  requireString(passive, 'description', passiveErrors);

  const event = readOwnField(passive, 'event');
  const eventSet = new Set<string>(CHARACTER_PASSIVE_EVENTS);
  if (typeof event !== 'string' || !eventSet.has(event)) {
    passiveErrors.push(`event: must be one of ${CHARACTER_PASSIVE_EVENTS.join(', ')}`);
  }

  requireString(passive, 'handlerId', passiveErrors);

  errors.push(...passiveErrors.map((error) => `${path}.${error}`));
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

function checkMetaUpgrade(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, META_UPGRADE_FIELDS, errors);
  requireString(row, 'id', errors);
  const id = readOwnField(row, 'id');
  if (typeof id === 'string' && !isContentId(id)) errors.push('id: invalid content id');
  requireString(row, 'name', errors);
  requireString(row, 'description', errors);
  requireIntegerInRange(row, 'maxLevel', 1, 100, errors);

  const cost = readOwnField(row, 'cost');
  if (!isRecord(cost)) {
    errors.push('cost: required object');
  } else {
    const costErrors: string[] = [];
    rejectUnknownFields(cost, META_UPGRADE_COST_FIELDS, costErrors);
    requirePositiveInteger(cost, 'base', costErrors);
    const growth = readOwnField(cost, 'growth');
    if (!isFiniteNumber(growth) || growth < 1) {
      costErrors.push('growth: required finite number at least 1');
    }
    const maxLevel = readOwnField(row, 'maxLevel');
    const base = readOwnField(cost, 'base');
    if (
      typeof maxLevel === 'number' && Number.isSafeInteger(maxLevel) && maxLevel >= 1 && maxLevel <= 100 &&
      isFiniteNumber(base) && isFiniteNumber(growth)
    ) {
      for (let level = 0; level < maxLevel; level += 1) {
        const nextCost = Math.round(base * growth ** level);
        if (!Number.isSafeInteger(nextCost) || nextCost <= 0) {
          costErrors.push(`level ${level}: rounded cost must be a positive safe integer`);
          break;
        }
      }
    }
    errors.push(...costErrors.map((error) => `cost.${error}`));
  }

  const effects = readOwnField(row, 'effects');
  checkUpgradeEffects(row, errors);
  if (Array.isArray(effects)) {
    const seen = new Set<string>();
    effects.forEach((effect, index) => {
      if (!isRecord(effect)) return;
      const stat = readOwnField(effect, 'stat');
      const op = readOwnField(effect, 'op');
      const value = readOwnField(effect, 'value');
      const pair = `${String(stat)}:${String(op)}`;
      if (seen.has(pair)) errors.push(`effects[${index}]: duplicate stat/op pair`);
      seen.add(pair);
      if (op === 'add' && isFiniteNumber(value) && value <= 0) {
        errors.push(`effects[${index}].value: add value must be positive`);
      }
      if (op === 'mult' && isFiniteNumber(value) && value <= 1) {
        errors.push(`effects[${index}].value: mult value must exceed 1`);
      }
      const maxLevel = readOwnField(row, 'maxLevel');
      if (typeof maxLevel === 'number' && Number.isSafeInteger(maxLevel) && isFiniteNumber(value)) {
        const aggregate = op === 'add' ? value * maxLevel : value ** maxLevel;
        if (!Number.isFinite(aggregate)) {
          errors.push(`effects[${index}].value: aggregate must remain finite`);
        }
      }
    });
  }
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

function assertCharacterDefaultExists(characters: readonly CharacterDefinition[]): void {
  const errors: string[] = [];
  if (!characters.some((character) => character.unlock.type === 'default')) {
    errors.push('characters.json: at least one character must have unlock.type "default"');
  }
  throwIfErrors(errors);
}

function assertArenaDefaultExists(arenas: readonly ArenaDefinition[]): void {
  const errors: string[] = [];
  if (!arenas.some((arena) => arena.unlock.type === 'default')) {
    errors.push('arenas.json: at least one arena must have unlock.type "default"');
  }
  throwIfErrors(errors);
}

function assertCharacterWeaponReferences(
  characters: readonly CharacterDefinition[],
  weapons: readonly WeaponDefinition[],
): void {
  const weaponIds = new Set(weapons.map((weapon) => weapon.id));
  const errors: string[] = [];
  characters.forEach((character, index) => {
    for (const weaponId of character.startingWeaponIds) {
      if (!weaponIds.has(weaponId)) {
        errors.push(`characters.json[${index}].startingWeaponIds: unknown weapon id "${weaponId}"`);
        break;
      }
    }
  });
  throwIfErrors(errors);
}

function assertArenaSpawnCurveReferences(
  arenas: readonly ArenaDefinition[],
  curves: readonly SpawnCurveDefinition[],
): void {
  const ids = new Set(curves.map((c) => c.id));
  const errors: string[] = [];
  arenas.forEach((arena, index) => {
    if (!ids.has(arena.spawnCurveId)) {
      errors.push(`arenas.json[${index}].spawnCurveId: unknown spawnCurveId "${arena.spawnCurveId}"`);
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
