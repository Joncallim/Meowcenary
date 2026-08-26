import charactersJson from '../data/characters.json';
import enemiesJson from '../data/enemies.json';
import metaUpgradesJson from '../data/meta-upgrades.json';
import spawnCurvesJson from '../data/spawn-curves.json';
import upgradesJson from '../data/upgrades.json';
import weaponsJson from '../data/weapons.json';
import weaponFeelJson from '../data/weapon-feel.json';
import arenasJson from '../data/arenas.json';
import lootTablesJson from '../data/loot-tables.json';
import audioAssetsJson from '../data/audio-assets.json';
import audioMapJson from '../data/audio-map.json';
import visualArtJson from '../data/visual-art.json';
import { STAT_KEYS, RUN_UPGRADE_STAT_KEYS, WEAPON_MODIFIER_STAT_KEYS } from '../gameplay/stats';
import { DEFAULT_WEAPON_FAMILIES } from '../gameplay/weapons';
import { GAME_EVENT_KEYS, FAMILY_TIER_EVENT_KEYS } from '../engine/eventBus';
import { RuntimeConfig } from '../engine/config';
import type {
  ArenaDefinition,
  VisualArtCatalog,
  AudioAssetCatalog,
  AudioData,
  AudioMapEntry,
  AudioMusicAsset,
  AudioSfxAsset,
  CharacterDefinition,
  EnemyDefinition,
  EnemyArchetype,
  GameData,
  LootTable,
  MetaUpgradeDefinition,
  Rarity,
  SpawnCurveDefinition,
  UpgradeDefinition,
  WeaponDefinition,
  WeaponFeelDefinition,
} from './types';
import { isSpawnableEnemyDefinition } from './types';
import { CHARACTER_PASSIVE_EVENTS } from './types';
import { isContentId, isUnlockId } from './ids';
import { findEdgeLaneWitness, findRectWitness, findRingWitness } from '../gameplay/spawnRegion';
import { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';

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
  'mergeTier', 'maxTier', 'pierce', 'projectileCount', 'spreadDeg', 'art',
]);
const WEAPON_ART_FIELDS = new Set(['iconId', 'heldId', 'projectileId']);
const WEAPON_FEEL_FIELDS = new Set(['family', 'muzzle', 'impact', 'recoilPx', 'sfxTierVolumeMultiplier']);
const WEAPON_FEEL_MUZZLE_FIELDS = new Set(['color', 'radius', 'lifetimeMs']);
const WEAPON_FEEL_IMPACT_FIELDS = new Set(['color', 'radius']);
const UPGRADE_FIELDS = new Set([
  'id', 'name', 'rarity', 'target', 'description', 'maxStacks', 'effects', 'presentation',
]);
const UPGRADE_EFFECT_FIELDS = new Set(['stat', 'op', 'value']);
// Epic 18 (D3/D5): run-upgrade-only effect/scope shape and stat vocabulary —
// deliberately separate from the legacy UPGRADE_EFFECT_FIELDS/STAT_KEY_SET
// pair above, which stays wired to checkMetaUpgrade/character passives.
const RUN_UPGRADE_EFFECT_FIELDS = new Set(['stat', 'op', 'value', 'scope']);
const RUN_UPGRADE_SCOPE_FIELDS = new Set(['kind', 'family']);
const RUN_UPGRADE_STAT_KEY_SET = new Set<string>(RUN_UPGRADE_STAT_KEYS);
const WEAPON_MODIFIER_STAT_KEY_SET = new Set<string>(WEAPON_MODIFIER_STAT_KEYS);
const UPGRADE_PRESENTATION_FIELDS = new Set(['category', 'iconArtId']);
const UPGRADE_CATEGORIES = new Set(['offense', 'defense', 'mobility', 'utility', 'economy', 'synergy']);
const META_UPGRADE_FIELDS = new Set(['id', 'name', 'description', 'maxLevel', 'cost', 'effects']);
const META_UPGRADE_COST_FIELDS = new Set(['base', 'growth']);
const DIRECT_ENEMY_FIELDS = new Set([
  'id', 'name', 'archetype', 'health', 'damage', 'speed', 'xpValue', 'scrapValue',
  'contactDamage', 'lootTableId',
]);
const ELITE_ENEMY_FIELDS = new Set(['id', 'name', 'archetype', 'baseEnemyId']);
const CHARGER_ATTACK_FIELDS = new Set([
  'triggerRange', 'telegraphMs', 'dashSpeed', 'dashDurationMs', 'cooldownMs',
]);
const RANGED_ATTACK_FIELDS = new Set(['range', 'telegraphMs', 'cooldownMs']);
const CURVE_FIELDS = new Set(['id', 'durationSeconds', 'scaling', 'waves']);
const SCALING_FIELDS = new Set(['healthPerMinute', 'damagePerMinute']);
const WAVE_FIELDS = new Set(['startSecond', 'enemyId', 'spawnEveryMs', 'maxAlive']);
const CHARACTER_FIELDS = new Set([
  'id', 'name', 'description', 'baseStats', 'startingWeaponIds', 'passives',
  'unlock', 'cosmeticSkinIds',
]);
const CHARACTER_BASE_STATS_FIELDS = new Set(['maxHealth', 'moveSpeed']);
const CHARACTER_STATIC_PASSIVE_FIELDS = new Set(['id', 'kind', 'name', 'description', 'effects']);
const CHARACTER_REACTIVE_PASSIVE_FIELDS = new Set(['id', 'kind', 'name', 'description', 'event', 'handlerId']);
const ARENA_FIELDS = new Set(['id', 'name', 'size', 'spawnCurveId', 'spawnRegions', 'obstacles', 'hazards', 'unlock', 'visual']);
const ARENA_SIZE_FIELDS = new Set(['width', 'height']);
const REGION_RING_FIELDS = new Set(['kind', 'cx', 'cy', 'minRadius', 'maxRadius']);
const REGION_RECT_FIELDS = new Set(['kind', 'x', 'y', 'w', 'h']);
const REGION_EDGES_FIELDS = new Set(['kind', 'margin']);
const REGION_EDGE_LANES_FIELDS = new Set(['kind', 'inset', 'lanes']);
const EDGE_LANE_FIELDS = new Set(['side', 'offset', 'width']);
const EDGE_LANE_SIDES = new Set(['top', 'right', 'bottom', 'left']);
const OBSTACLE_FIELDS = new Set(['id', 'x', 'y', 'w', 'h']);
const ARENA_VISUAL_FIELDS = new Set(['floorArtIds', 'boundary', 'decorations', 'obstacleSkins']);
const ARENA_BOUNDARY_FIELDS = new Set(['straightArtId', 'cornerArtId', 'patchArtId', 'gateArtId']);
const ARENA_DECORATION_FIELDS = new Set(['id', 'artId', 'x', 'y', 'flipX', 'layer']);
const ARENA_OBSTACLE_SKIN_FIELDS = new Set(['obstacleId', 'artId', 'offsetX', 'offsetY']);
const HAZARD_FIELDS = new Set(['id', 'kind', 'x', 'y', 'w', 'h', 'damagePerSecond']);
const LOOT_KINDS = new Set(['xp', 'scrap', 'chest', 'weapon', 'nothing']);
const LOOT_FIELDS = new Set(['id', 'entries']);
const LOOT_ENTRY_FIELDS = new Set(['kind', 'amount', 'weight', 'tableId', 'definitionId']);
const MAX_LOOT_TABLES = 64;
const MAX_LOOT_ENTRIES = 32;
const AUDIO_ASSET_CATALOG_FIELDS = new Set(['sfx', 'music']);
const AUDIO_ASSET_ENTRY_FIELDS = new Set(['key', 'url']);
const AUDIO_MAP_FIELDS = new Set(['events']);
const AUDIO_MAP_ENTRY_FIELDS = new Set(['event', 'sfxKey', 'sfxKeyByFamily', 'cooldownMs', 'stopMusic', 'musicFadeMs']);
const AUDIO_EVENT_KEY_SET = new Set<string>(GAME_EVENT_KEYS);
const MAX_AUDIO_SFX = 64;
const MAX_AUDIO_MUSIC = 8;
const MAX_AUDIO_MAP_ENTRIES = 64;
const MAX_AUDIO_COOLDOWN_MS = 60_000;
const MAX_AUDIO_FADE_MS = 10_000;
const MAX_VISUAL_ART_BINDINGS = 256;
const MAX_VISUAL_ART_CLIPS = 16;
const VISUAL_ART_ROOT_FIELDS = new Set(['bindings']);
const VISUAL_ART_BINDING_FIELDS = new Set([
  'id', 'kind', 'textureKey', 'url', 'required', 'sampling', 'load', 'display', 'clips',
]);
const VISUAL_ART_IMAGE_LOAD_FIELDS = new Set(['type']);
const VISUAL_ART_SPRITESHEET_LOAD_FIELDS = new Set(['type', 'frame']);
const VISUAL_ART_DIMENSION_FIELDS = new Set(['width', 'height']);
const VISUAL_ART_CLIP_FIELDS = new Set(['start', 'end', 'frameRate', 'repeat']);
const VISUAL_ART_KINDS = new Set([
  'character', 'enemy', 'projectile', 'drop', 'weapon-icon', 'weapon-held', 'world', 'upgrade-icon',
]);
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

/** Structured validation issue (Epic 11 §5.1). `file` is the JSON file name
 *  (e.g. 'weapons.json') or '(unknown)' for unparseable lines; `index` is the
 *  catalog row index, -1 for file-level errors; `field` is the dotted field
 *  path (may embed [i]), '' for file-level errors. Root-phase failures that
 *  name no catalog — unknown root fields, a non-object aggregate — keep the
 *  frozen `game-data.` prefix as a distinct root category (Epic 11 §5.3). */
export interface ValidationIssue {
  readonly file: string;
  readonly index: number;
  readonly field: string;
  readonly message: string;
}

/** One entry per data file, in today's exact validation order (Epic 11 §5.2).
 *  The descriptor is the single registration point for a catalog: the
 *  aggregate root field, the shipped JSON import, and the per-file row
 *  pipeline. Root requirements (ROOT_FIELDS/AUDIO_ROOT_FIELDS), the shipped
 *  aggregate (shippedGameData), and the root-phase remap rules are all
 *  derived from the table, so adding a catalog is one entry. Catalog-level
 *  assertions that boot runs after every catalog's rows are validated
 *  (weapons/upgrades/spawn-curves only) live in the separate
 *  CATALOG_LEVEL_ASSERTIONS phase, preserving the frozen first-error order
 *  across multi-error inputs (§5.3).
 *
 *  The table is declared `as const satisfies` so each entry keeps its own
 *  row type: an inlined validateRows lambda's explicit return annotation
 *  (e.g. (rows): WeaponDefinition[] => …) is therefore compile-checked
 *  against the pipeline body and against the descriptor contract. */
interface CatalogDescriptor {
  readonly key: string;          // GameData assembly key ('weapons', …, 'audio-assets')
  readonly file: string;         // 'weapons.json' — used in messages, unchanged
  readonly rootKey: string;      // aggregate root field ('audio' for the audio pair)
  readonly subKey?: string;      // audio pair only: 'assets' | 'map'
  readonly data: unknown;        // shipped JSON import (assembly + root derivation)
  readonly read: (raw: Record<string, unknown>) => unknown; // locate rows in the aggregate
  readonly validateRows: (rows: unknown) => unknown;        // per-file row pipeline (throws)
}

export const CATALOG_DESCRIPTORS = [
  {
    key: 'weapons',
    file: 'weapons.json',
    rootKey: 'weapons',
    data: weaponsJson,
    read: (raw) => readOwnField(raw, 'weapons'),
    validateRows: (rows): WeaponDefinition[] => {
      throwIfErrors(jsonSafetyErrors(rows, 'weapons.json'));
      return validate<WeaponDefinition>('weapons.json', rows, checkWeapon);
    },
  },
  {
    key: 'weaponFeel',
    file: 'weapon-feel.json',
    rootKey: 'weaponFeel',
    data: weaponFeelJson,
    read: (raw) => readOwnField(raw, 'weaponFeel'),
    validateRows: (rows): WeaponFeelDefinition[] => {
      throwIfErrors(jsonSafetyErrors(rows, 'weapon-feel.json'));
      return validate<WeaponFeelDefinition>('weapon-feel.json', rows, checkWeaponFeel);
    },
  },
  {
    key: 'enemies',
    file: 'enemies.json',
    rootKey: 'enemies',
    data: enemiesJson,
    read: (raw) => readOwnField(raw, 'enemies'),
    validateRows: validateEnemyCatalog,
  },
  {
    key: 'upgrades',
    file: 'upgrades.json',
    rootKey: 'upgrades',
    data: upgradesJson,
    read: (raw) => readOwnField(raw, 'upgrades'),
    validateRows: (rows): UpgradeDefinition[] => {
      throwIfErrors(jsonSafetyErrors(rows, 'upgrades.json'));
      return validate<UpgradeDefinition>('upgrades.json', rows, checkUpgrade);
    },
  },
  {
    key: 'metaUpgrades',
    file: 'meta-upgrades.json',
    rootKey: 'metaUpgrades',
    data: metaUpgradesJson,
    read: (raw) => readOwnField(raw, 'metaUpgrades'),
    validateRows: validateMetaUpgradeCatalog,
  },
  {
    key: 'spawnCurves',
    file: 'spawn-curves.json',
    rootKey: 'spawnCurves',
    data: spawnCurvesJson,
    read: (raw) => readOwnField(raw, 'spawnCurves'),
    validateRows: (rows): SpawnCurveDefinition[] => {
      throwIfErrors(jsonSafetyErrors(rows, 'spawn-curves.json'));
      return validate<SpawnCurveDefinition>('spawn-curves.json', rows, checkSpawnCurveShape);
    },
  },
  {
    key: 'characters',
    file: 'characters.json',
    rootKey: 'characters',
    data: charactersJson,
    read: (raw) => readOwnField(raw, 'characters'),
    validateRows: validateCharacterCatalog,
  },
  {
    key: 'arenas',
    file: 'arenas.json',
    rootKey: 'arenas',
    data: arenasJson,
    read: (raw) => readOwnField(raw, 'arenas'),
    validateRows: validateArenaCatalog,
  },
  {
    key: 'lootTables',
    file: 'loot-tables.json',
    rootKey: 'lootTables',
    data: lootTablesJson,
    read: (raw) => readOwnField(raw, 'lootTables'),
    validateRows: validateLootTableCatalog,
  },
  {
    key: 'audio-assets',
    file: 'audio-assets.json',
    rootKey: 'audio',
    subKey: 'assets',
    data: audioAssetsJson,
    read: (raw) => readAudioSubField(raw, 'assets'),
    validateRows: validateAudioAssets,
  },
  {
    key: 'audio-map',
    file: 'audio-map.json',
    rootKey: 'audio',
    subKey: 'map',
    data: audioMapJson,
    read: (raw) => readAudioSubField(raw, 'map'),
    // Epic 10 §6.2 round-trip: accept the normalized AudioMapEntry[] shape as
    // well as the { events: [...] } file wrapper.
    validateRows: (rows): AudioMapEntry[] => (Array.isArray(rows) ? validateNormalizedAudioMap(rows) : validateAudioMapCatalog(rows)),
  },
  {
    key: 'visualArt',
    file: 'visual-art.json',
    rootKey: 'visualArt',
    data: visualArtJson,
    read: (raw) => readOwnField(raw, 'visualArt'),
    validateRows: validateVisualArtCatalog,
  },
] as const satisfies readonly CatalogDescriptor[];

/** Root requirements derived from the descriptor table: one aggregate root
 *  field per descriptor (the audio pair collapses to a single 'audio' root
 *  with its two sub-files), so adding a catalog cannot be rejected as an
 *  unknown root field (Epic 11 §5.2). */
const ROOT_FIELDS = new Set(CATALOG_DESCRIPTORS.map((descriptor) => descriptor.rootKey));
// The `'subKey' in descriptor` predicate narrows the as-const union to the
// audio pair, whose members declare the sub-file key.
const AUDIO_DESCRIPTORS = CATALOG_DESCRIPTORS.filter(
  (descriptor): descriptor is (typeof CATALOG_DESCRIPTORS)[number] & { readonly subKey: 'assets' | 'map' } =>
    'subKey' in descriptor,
);
const AUDIO_ROOT_FIELDS = new Set(AUDIO_DESCRIPTORS.map((descriptor) => descriptor.subKey));

/** Catalog-level assertions in the boot path's exact flat order (frozen
 *  first-error order, Epic 11 §5.3): boot validates every catalog's rows
 *  first, then runs this sequence — grouping the assertions per descriptor
 *  would fire weapons assertions before a later file's row errors, changing
 *  which error is reported first on multi-error inputs. Exported so the
 *  focused test can pin every key to a catalog descriptor. */
export const CATALOG_LEVEL_ASSERTIONS: ReadonlyArray<{
  readonly key: string;
  readonly assert: (rows: unknown) => void;
}> = [
  { key: 'weapons', assert: (rows) => assertUniqueIds('weapons.json', rows as WeaponDefinition[]) },
  { key: 'upgrades', assert: (rows) => assertUniqueIds('upgrades.json', rows as UpgradeDefinition[]) },
  { key: 'spawnCurves', assert: (rows) => assertUniqueIds('spawn-curves.json', rows as SpawnCurveDefinition[]) },
  { key: 'weapons', assert: (rows) => assertWeaponTiers(rows as WeaponDefinition[]) },
  { key: 'weapons', assert: (rows) => assertStarterWeapons(rows as WeaponDefinition[]) },
  { key: 'spawnCurves', assert: (rows) => assertPlayableSpawnCurves(rows as SpawnCurveDefinition[]) },
];

// Drift guard: every assertion key must name a descriptor. Throwing at module
// load fails fast in CI when a descriptor's key is renamed and this list is
// not updated, instead of silently asserting undefined at runtime (the
// focused test pins the same invariant).
for (const assertion of CATALOG_LEVEL_ASSERTIONS) {
  if (!CATALOG_DESCRIPTORS.some((descriptor) => descriptor.key === assertion.key)) {
    throw new Error(
      `CATALOG_LEVEL_ASSERTIONS references unknown catalog key "${assertion.key}" — add a catalog descriptor or fix the key`,
    );
  }
}

function readAudioSubField(raw: Record<string, unknown>, field: 'assets' | 'map'): unknown {
  const audio = readOwnField(raw, 'audio');
  return isRecord(audio) ? readOwnField(audio, field) : undefined;
}

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

/** Shipped-data aggregate assembled from the descriptor table: one root
 *  field per descriptor, with the audio pair nested under 'audio'. Because
 *  loadGameData and validateAllData share this single assembly, adding a
 *  catalog is one descriptor entry and the shipped data cannot drift from
 *  what the root phase accepts (Epic 11 §5.2). */
function shippedGameData(): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const audio: Record<string, unknown> = {};
  for (const descriptor of CATALOG_DESCRIPTORS) {
    if ('subKey' in descriptor) {
      audio[descriptor.subKey] = descriptor.data;
    } else {
      root[descriptor.rootKey] = descriptor.data;
    }
  }
  return { ...root, audio };
}

export function loadGameData(): GameData {
  return validateGameData(shippedGameData());
}

export function validateGameData(raw: unknown): GameData {
  assertGameDataRoot(raw);
  const record = raw as Record<string, unknown>;
  const catalogs: Record<string, unknown> = {};
  // Phase A: every catalog's row pipeline in descriptor order. Boot throws
  // on the first failure, so later catalogs are never read (frozen).
  for (const descriptor of CATALOG_DESCRIPTORS) {
    catalogs[descriptor.key] = descriptor.validateRows(descriptor.read(record));
  }
  // Phase B: catalog-level assertions in the boot path's exact flat order.
  // Boot validates every catalog's rows before any of these run (frozen
  // first-error order, Epic 11 §5.3).
  for (const { key, assert } of CATALOG_LEVEL_ASSERTIONS) {
    assert(catalogs[key]);
  }

  const weapons = catalogs.weapons as WeaponDefinition[];
  const weaponFeel = catalogs.weaponFeel as WeaponFeelDefinition[];
  const enemies = catalogs.enemies as EnemyDefinition[];
  const upgrades = catalogs.upgrades as UpgradeDefinition[];
  const metaUpgrades = catalogs.metaUpgrades as MetaUpgradeDefinition[];
  const spawnCurves = catalogs.spawnCurves as SpawnCurveDefinition[];
  const characters = catalogs.characters as CharacterDefinition[];
  const arenas = catalogs.arenas as ArenaDefinition[];
  const lootTables = catalogs.lootTables as LootTable[];
  const audioAssets = catalogs['audio-assets'] as AudioAssetCatalog;
  const audioMap = catalogs['audio-map'] as AudioMapEntry[];
  const visualArt = catalogs.visualArt as VisualArtCatalog;

  assertSpawnReferences(spawnCurves, enemies);
  assertCharacterWeaponReferences(characters, weapons);
  assertArenaSpawnCurveReferences(arenas, spawnCurves);
  assertEnemyLootTableReferences(enemies, lootTables);
  assertLootWeaponReferences(lootTables, weapons);
  assertAudioMapReferences(audioMap, audioAssets, weapons);
  assertActorAndDropArtReferences(characters, enemies, visualArt);
  assertWeaponArtReferences(weapons, visualArt);
  assertWeaponFeelReferences(weapons, weaponFeel);
  assertArenaVisualReferences(arenas, visualArt);
  // Epic 18: appended after every pre-existing cross-reference so a
  // multi-error input's frozen first failure never changes because this
  // epic exists (§5).
  assertUpgradeWeaponFamilyReferences(upgrades, weapons);
  assertUpgradeArtReferences(upgrades, visualArt);

  const audio: AudioData = { assets: audioAssets, map: audioMap };
  return { weapons, enemies, upgrades, metaUpgrades, spawnCurves, characters, arenas, lootTables, weaponFeel, audio, visualArt };
}

/** Root-shape phase, shared by the throwing boot path and the collecting
 *  path (Epic 11 §5.3). Behavior is frozen: same messages, same throw order.
 *  Audio sub-record names remap to their JSON file names (Epic 10 §6.2).
 *  The remap lives in remapRootPhaseLine so the collector can apply it to
 *  the other root lines at its boundary (§5.4). */
function assertGameDataRoot(raw: unknown): void {
  const rootErrors = jsonSafetyErrors(raw, 'game-data').map(remapRootPhaseLine);
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
  const audioRaw = readOwnField(raw, 'audio');
  if (!isRecord(audioRaw)) {
    rootErrors.push('game-data.audio: expected object');
  } else {
    rejectUnknownFields(audioRaw, AUDIO_ROOT_FIELDS, rootErrors, 'game-data.audio');
    for (const descriptor of AUDIO_DESCRIPTORS) {
      if (!Object.hasOwn(audioRaw, descriptor.subKey as string)) {
        // Audio sub-records map to their own files; report required-field
        // errors under the JSON name (Epic 10 §6.2 remapping).
        rootErrors.push(`${descriptor.file}: required field`);
      }
    }
  }
  throwIfErrors(rootErrors);
}

/** Root-phase remap rules derived from the descriptor table: each
 *  descriptor's aggregate path — `rootKey`, or `rootKey.subKey` for the
 *  audio pair — maps to its JSON file name. Derived, so adding a catalog
 *  descriptor automatically extends the remap: there is no second manual
 *  registration point to forget (Epic 11 §5.1/§5.2). */
const ROOT_REMAP_RULES: ReadonlyArray<readonly [aggregatePath: string, file: string]> =
  CATALOG_DESCRIPTORS.map((descriptor) => [
    'subKey' in descriptor ? `${descriptor.rootKey}.${descriptor.subKey}` : descriptor.rootKey,
    descriptor.file,
  ]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Dotted file-level lines from object-backed catalogs
 *  (e.g. 'audio-assets.json.sfx: required array') attribute the dotted path
 *  as the field. The file-name alternative is built from the descriptor
 *  table (escaped), so adding a catalog extends the matcher and a colon or
 *  dot inside a future file name cannot split the capture groups. */
const DOTTED_FILE_PATTERN = new RegExp(
  `^(${CATALOG_DESCRIPTORS.map((descriptor) => escapeRegExp(descriptor.file)).join('|')})\\.(.+): (.*)$`,
);

/** Maps an aggregate `game-data.` catalog path to its JSON file name.
 *  Boot messages are frozen (Epic 11 §5.3) and keep the prefix; the
 *  collecting path applies this per-line remap so issues group by file.
 *  Lines naming no catalog (unknown root fields, a non-object aggregate,
 *  the audio pair itself) are returned unchanged — the documented root
 *  category (Epic 11 §5.1).
 *
 *  Each pattern requires a separator (`:`, `.`, or `[`) after the catalog
 *  name, so a future root field that prefix-extends a catalog (e.g.
 *  `game-data.weaponsV2`, which jsonSafetyErrors flags before
 *  rejectUnknownFields runs) stays in the root category instead of
 *  mis-remapping to `weapons.jsonV2`. Exported so the descriptor-derived
 *  patterns and their idempotency are pinned by focused unit tests. */
export function remapRootPhaseLine(line: string): string {
  let remapped = line;
  for (const [aggregatePath, file] of ROOT_REMAP_RULES) {
    remapped = remapped.replace(
      new RegExp(`^game-data\\.${escapeRegExp(aggregatePath)}(?=[:.\\[])`),
      // Replacer function: file names are safe today, but a future `$`
      // in a file name must not be interpreted as a substitution token.
      () => file,
    );
  }
  return remapped;
}

/** Applies remapRootPhaseLine to every line of a thrown root-phase message
 *  before issue mapping (idempotent for lines assertGameDataRoot already
 *  remapped). */
function remapRootPhaseMessage(message: string): string {
  return message
    .split('\n')
    .map(remapRootPhaseLine)
    .join('\n');
}

/** Aggregate, non-throwing validation of the shipped catalogs (Epic 11 §5.1).
 *  Runs the exact boot pipeline — root shape, per-file row phase in
 *  descriptor order, the catalog-level assertion phase in boot order, then
 *  the five cross-references — and returns structured issues instead of
 *  throwing. */
export function validateAllData(): ValidationIssue[] {
  return collectGameDataErrors(shippedGameData());
}

/** Injectable core behind validateAllData (Epic 11 §5.4). Never throws.
 *  A bad file reports its issues and does not abort later files; the
 *  cross-reference phase runs only when every earlier phase was clean. */
export function collectGameDataErrors(raw: unknown): ValidationIssue[] {
  try {
    assertGameDataRoot(raw);
  } catch (error) {
    // Root failures mask per-file reads, mirroring boot. The thrown message
    // is the frozen boot text with `game-data.` prefixes (Epic 11 §5.3);
    // remap catalog-root lines to JSON file names so issues group by file
    // (§5.1). Lines naming no catalog keep the prefix as the root category.
    const message = error instanceof Error ? error.message : String(error);
    return mapValidationErrorLines(remapRootPhaseMessage(message));
  }
  const record = raw as Record<string, unknown>;

  const catalogs: Record<string, unknown> = {};
  const perFileIssues: ValidationIssue[] = [];
  for (const descriptor of CATALOG_DESCRIPTORS) {
    try {
      catalogs[descriptor.key] = descriptor.validateRows(descriptor.read(record));
    } catch (error) {
      perFileIssues.push(...mapValidationErrorLines(error));
    }
  }
  if (perFileIssues.length > 0) return perFileIssues;

  const catalogIssues: ValidationIssue[] = [];
  for (const { key, assert } of CATALOG_LEVEL_ASSERTIONS) {
    try {
      assert(catalogs[key]);
    } catch (error) {
      catalogIssues.push(...mapValidationErrorLines(error));
    }
  }
  if (catalogIssues.length > 0) return catalogIssues;

  const weapons = catalogs.weapons as WeaponDefinition[];
  const weaponFeel = catalogs.weaponFeel as WeaponFeelDefinition[];
  const enemies = catalogs.enemies as EnemyDefinition[];
  const upgrades = catalogs.upgrades as UpgradeDefinition[];
  const spawnCurves = catalogs.spawnCurves as SpawnCurveDefinition[];
  const characters = catalogs.characters as CharacterDefinition[];
  const arenas = catalogs.arenas as ArenaDefinition[];
  const lootTables = catalogs.lootTables as LootTable[];
  const audioAssets = catalogs['audio-assets'] as AudioAssetCatalog;
  const audioMap = catalogs['audio-map'] as AudioMapEntry[];
  const visualArt = catalogs.visualArt as VisualArtCatalog;

  const crossReferenceIssues: ValidationIssue[] = [];
  const assertions: ReadonlyArray<() => void> = [
    () => assertSpawnReferences(spawnCurves, enemies),
    () => assertCharacterWeaponReferences(characters, weapons),
    () => assertArenaSpawnCurveReferences(arenas, spawnCurves),
    () => assertEnemyLootTableReferences(enemies, lootTables),
    () => assertLootWeaponReferences(lootTables, weapons),
    () => assertAudioMapReferences(audioMap, audioAssets, weapons),
    () => assertActorAndDropArtReferences(characters, enemies, visualArt),
    () => assertWeaponArtReferences(weapons, visualArt),
    () => assertWeaponFeelReferences(weapons, weaponFeel),
    () => assertArenaVisualReferences(arenas, visualArt),
    () => assertUpgradeWeaponFamilyReferences(upgrades, weapons),
    () => assertUpgradeArtReferences(upgrades, visualArt),
  ];
  for (const assertion of assertions) {
    try {
      assertion();
    } catch (error) {
      crossReferenceIssues.push(...mapValidationErrorLines(error));
    }
  }
  return crossReferenceIssues;
}

/** Maps a thrown validator message (validators keep returning today's
 *  strings) to structured issues, line by line (Epic 11 §5.4). */
export function mapValidationErrorLines(error: unknown): ValidationIssue[] {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = 'Invalid game data:\n';
  const body = message.startsWith(prefix) ? message.slice(prefix.length) : message;
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map(mapLineToIssue);
}

function mapLineToIssue(line: string): ValidationIssue {
  const rowField = /^([^[]+)\[(\d+)\]\.(.+): (.*)$/.exec(line);
  if (rowField) {
    return {
      file: rowField[1],
      index: Number(rowField[2]),
      field: rowField[3],
      message: rowField[4],
    };
  }
  const row = /^([^[]+)\[(\d+)\]: (.*)$/.exec(line);
  if (row) {
    return { file: row[1], index: Number(row[2]), field: '', message: row[3] };
  }
  // Object-backed catalogs emit dotted file-level errors without a row index
  // (e.g. 'audio-assets.json.sfx: required array'); attribute the dotted
  // path as the field instead of swallowing it into the file name (the
  // file-name alternative is built from the descriptor table, §5.4).
  const fileField = DOTTED_FILE_PATTERN.exec(line);
  if (fileField) {
    return { file: fileField[1], index: -1, field: fileField[2], message: fileField[3] };
  }
  const fileLevel = /^([^:]+): (.*)$/.exec(line);
  if (fileLevel) {
    return { file: fileLevel[1], index: -1, field: '', message: fileLevel[2] };
  }
  return { file: '(unknown)', index: -1, field: '', message: line };
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

export function validateLootTableCatalog(raw: unknown): LootTable[] {
  throwIfErrors(jsonSafetyErrors(raw, 'loot-tables.json'));
  if (Array.isArray(raw) && raw.length > MAX_LOOT_TABLES) {
    throw new Error(`loot-tables.json: too many entries (max ${MAX_LOOT_TABLES})`);
  }
  const tables = validate<LootTable>('loot-tables.json', raw, checkLootTable);
  assertUniqueIds('loot-tables.json', tables);
  assertChestTargetsChestSafe(tables);
  return tables;
}

export function validateAudioAssets(raw: unknown): AudioAssetCatalog {
  throwIfErrors(jsonSafetyErrors(raw, 'audio-assets.json'));
  if (!isRecord(raw)) {
    throw new Error('Invalid game data:\naudio-assets.json: expected object');
  }
  const errors: string[] = [];
  rejectUnknownFields(raw, AUDIO_ASSET_CATALOG_FIELDS, errors, 'audio-assets.json');
  for (const field of AUDIO_ASSET_CATALOG_FIELDS) {
    if (!Object.hasOwn(raw, field)) errors.push(`audio-assets.json.${field}: required field`);
  }
  const sfx = readOwnField(raw, 'sfx');
  const music = readOwnField(raw, 'music');
  if (!Array.isArray(sfx)) {
    errors.push('audio-assets.json.sfx: required array');
  } else if (sfx.length > MAX_AUDIO_SFX) {
    errors.push(`audio-assets.json.sfx: too many entries (max ${MAX_AUDIO_SFX})`);
  }
  if (!Array.isArray(music)) {
    errors.push('audio-assets.json.music: required array');
  } else if (music.length > MAX_AUDIO_MUSIC) {
    errors.push(`audio-assets.json.music: too many entries (max ${MAX_AUDIO_MUSIC})`);
  }
  throwIfErrors(errors);

  const sfxList = validate<AudioSfxAsset>('audio-assets.json', sfx, (row) => checkAudioAsset(row, 'sfx-'));
  const musicList = validate<AudioMusicAsset>('audio-assets.json', music, (row) => checkAudioAsset(row, 'music-'));
  assertAudioAssetUniqueness(sfxList, musicList);
  assertAudioDefaults({ sfx: sfxList, music: musicList });
  return { sfx: sfxList, music: musicList };
}

export function validateAudioMapCatalog(raw: unknown): AudioMapEntry[] {
  throwIfErrors(jsonSafetyErrors(raw, 'audio-map.json'));
  if (!isRecord(raw)) {
    throw new Error('Invalid game data:\naudio-map.json: expected object');
  }
  const errors: string[] = [];
  rejectUnknownFields(raw, AUDIO_MAP_FIELDS, errors, 'audio-map.json');
  if (!Object.hasOwn(raw, 'events')) errors.push('audio-map.json.events: required field');
  const eventsRaw = readOwnField(raw, 'events');
  if (!Array.isArray(eventsRaw)) {
    errors.push('audio-map.json.events: required array');
  } else if (eventsRaw.length > MAX_AUDIO_MAP_ENTRIES) {
    errors.push(`audio-map.json.events: too many entries (max ${MAX_AUDIO_MAP_ENTRIES})`);
  }
  throwIfErrors(errors);

  const map = validate<AudioMapEntry>('audio-map.json', eventsRaw, checkAudioMapEntry);
  assertAudioMapUniqueness(map);
  assertPlayerDamagedCadence(map);
  return map;
}

/** Round-trip path for already-normalized data (audio.map is AudioMapEntry[]):
 *  same entry-level rules, uniqueness, and cadence pin as the file wrapper
 *  path, minus the { events } root-record checks. */
function validateNormalizedAudioMap(raw: unknown): AudioMapEntry[] {
  const map = validate<AudioMapEntry>('audio-map.json', raw, checkAudioMapEntry);
  assertAudioMapUniqueness(map);
  assertPlayerDamagedCadence(map);
  return map;
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
      } else if (kind === 'edge-lanes') {
        rejectUnknownFields(region, REGION_EDGE_LANES_FIELDS, regionErrors);
        requireNumberInRange(region, 'inset', ENEMY_BODY_RADIUS, Math.min(w, h) / 2, regionErrors);
        const lanes = readOwnField(region, 'lanes');
        if (!Array.isArray(lanes) || lanes.length !== 4) {
          regionErrors.push('lanes: required array with exactly one lane per side');
        } else {
          const seenSides = new Set<string>();
          lanes.forEach((lane, laneIndex) => {
            if (!isRecord(lane)) {
              regionErrors.push(`lanes[${laneIndex}]: expected object`);
              return;
            }
            const laneErrors: string[] = [];
            rejectUnknownFields(lane, EDGE_LANE_FIELDS, laneErrors);
            requireEnum(lane, 'side', EDGE_LANE_SIDES, laneErrors);
            requireNonNegativeNumber(lane, 'offset', laneErrors);
            requirePositiveNumber(lane, 'width', laneErrors);
            const side = readOwnField(lane, 'side');
            const offset = readOwnField(lane, 'offset');
            const width = readOwnField(lane, 'width');
            if (typeof side === 'string') {
              if (seenSides.has(side)) laneErrors.push(`side: duplicate lane side "${side}"`);
              seenSides.add(side);
            }
            if (isFiniteNumber(offset) && offset % 32 !== 0) laneErrors.push('offset: must align to the 32px grid');
            if (isFiniteNumber(width)) {
              if (width % 32 !== 0) laneErrors.push('width: must align to the 32px grid');
              if (width < ENEMY_BODY_RADIUS * 2) laneErrors.push(`width: must be at least ${ENEMY_BODY_RADIUS * 2}`);
            }
            const extent = side === 'top' || side === 'bottom' ? w : h;
            if (isFiniteNumber(offset) && isFiniteNumber(width) && extent > 0 && offset + width > extent) {
              laneErrors.push('offset + width: must not exceed its arena edge');
            }
            regionErrors.push(...laneErrors.map((error) => `lanes[${laneIndex}].${error}`));
          });
          for (const side of EDGE_LANE_SIDES) {
            if (!seenSides.has(side)) regionErrors.push(`lanes: missing side "${side}"`);
          }
        }
      } else {
        regionErrors.push('kind: must be "ring", "rect", "edges", or "edge-lanes"');
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
    const seenObstacleIds = new Set<string>();
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
      requireString(obstacle, 'id', obsErrors);
      const obstacleId = readOwnField(obstacle, 'id');
      if (typeof obstacleId === 'string') {
        if (!isContentId(obstacleId)) obsErrors.push('id: invalid content id');
        if (seenObstacleIds.has(obstacleId)) obsErrors.push(`id: duplicate obstacle id "${obstacleId}"`);
        seenObstacleIds.add(obstacleId);
      }
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

  const visual = readOwnField(row, 'visual');
  if (!isRecord(visual)) {
    errors.push('visual: required object');
  } else {
    const arenaWidth = isRecord(size) ? readOwnField(size, 'width') : undefined;
    const arenaHeight = isRecord(size) ? readOwnField(size, 'height') : undefined;
    errors.push(...checkArenaVisual(
      visual,
      isFiniteNumber(arenaWidth) ? arenaWidth : 0,
      isFiniteNumber(arenaHeight) ? arenaHeight : 0,
    ).map((error) => `visual.${error}`));
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
      if (kind === 'edges') {
        const margin = readOwnField(region, 'margin');
        if (!isFiniteNumber(margin)) continue;
        const sizeRecord = readOwnField(row, 'size');
        const wArg = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'width') : undefined;
        const hArg = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'height') : undefined;
        if (!isFiniteNumber(wArg) || !isFiniteNumber(hArg)) continue;
        const edgePts = [
          { x: wArg / 2, y: -margin },
          { x: wArg + margin, y: hArg / 2 },
          { x: wArg / 2, y: hArg + margin },
          { x: -margin, y: hArg / 2 },
        ];
        const allBlocked = edgePts.every((p) =>
          arenaObstacles.some((o: { x: number; y: number; w: number; h: number }) =>
            p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h,
          ),
        );
        if (allBlocked) {
          errors.push(`spawnRegions[${rIdx}]: edges region has no spawnable point — all edge midpoints obstructed`);
        }
      }
      if (kind === 'edge-lanes') {
        const inset = readOwnField(region, 'inset');
        const lanes = readOwnField(region, 'lanes');
        const sizeRecord = readOwnField(row, 'size');
        const width = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'width') : undefined;
        const height = isRecord(sizeRecord) ? readOwnField(sizeRecord, 'height') : undefined;
        if (!isFiniteNumber(inset) || !isFiniteNumber(width) || !isFiniteNumber(height) || !Array.isArray(lanes)) continue;
        lanes.forEach((lane, laneIndex) => {
          if (!isRecord(lane)) return;
          const side = readOwnField(lane, 'side');
          const offset = readOwnField(lane, 'offset');
          const laneWidth = readOwnField(lane, 'width');
          if (
            typeof side !== 'string' || !isFiniteNumber(offset) || !isFiniteNumber(laneWidth) ||
            (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left')
          ) return;
          // Reuse the same witness the runtime fallback uses (spawnPoint's
          // searchFallback) so "validation passed" and "runtime can find a
          // point" mean exactly the same thing — a single obstacle clipping
          // one end of the strip still leaves the rest spawnable.
          const witness = findEdgeLaneWitness(
            { side, offset, width: laneWidth },
            inset,
            { width, height },
            arenaObstacles,
          );
          if (!witness) errors.push(`spawnRegions[${rIdx}].lanes[${laneIndex}]: body-radius spawn strip fully covered by obstacles`);
        });
      }
    }
  }

  return errors;
}

function checkArenaVisual(row: Record<string, unknown>, arenaWidth: number, arenaHeight: number): string[] {
  const errors: string[] = [];
  rejectUnknownFields(row, ARENA_VISUAL_FIELDS, errors);
  const floorArtIds = readOwnField(row, 'floorArtIds');
  if (!Array.isArray(floorArtIds) || floorArtIds.length < 1 || floorArtIds.length > 8) {
    errors.push('floorArtIds: required array with 1 through 8 entries');
  } else {
    floorArtIds.forEach((value, index) => {
      if (typeof value !== 'string' || value.length === 0) errors.push(`floorArtIds[${index}]: required string`);
    });
  }

  const boundary = readOwnField(row, 'boundary');
  if (!isRecord(boundary)) {
    errors.push('boundary: required object');
  } else {
    const boundaryErrors: string[] = [];
    rejectUnknownFields(boundary, ARENA_BOUNDARY_FIELDS, boundaryErrors);
    for (const field of ARENA_BOUNDARY_FIELDS) requireString(boundary, field, boundaryErrors);
    errors.push(...boundaryErrors.map((error) => `boundary.${error}`));
  }

  const decorations = readOwnField(row, 'decorations');
  if (!Array.isArray(decorations) || decorations.length > 128) {
    errors.push('decorations: required array with at most 128 entries');
  } else {
    const seen = new Set<string>();
    decorations.forEach((decoration, index) => {
      if (!isRecord(decoration)) {
        errors.push(`decorations[${index}]: expected object`);
        return;
      }
      const rowErrors: string[] = [];
      rejectUnknownFields(decoration, ARENA_DECORATION_FIELDS, rowErrors);
      requireString(decoration, 'id', rowErrors);
      requireString(decoration, 'artId', rowErrors);
      requireNumberInRange(decoration, 'x', 0, arenaWidth, rowErrors);
      requireNumberInRange(decoration, 'y', 0, arenaHeight, rowErrors);
      requireEnum(decoration, 'layer', new Set(['ground', 'low']), rowErrors);
      const id = readOwnField(decoration, 'id');
      if (typeof id === 'string') {
        if (!isContentId(id)) rowErrors.push('id: invalid content id');
        if (seen.has(id)) rowErrors.push(`id: duplicate decoration id "${id}"`);
        seen.add(id);
      }
      const flipX = readOwnField(decoration, 'flipX');
      if (flipX !== undefined && typeof flipX !== 'boolean') rowErrors.push('flipX: expected boolean');
      errors.push(...rowErrors.map((error) => `decorations[${index}].${error}`));
    });
  }

  const skins = readOwnField(row, 'obstacleSkins');
  if (!Array.isArray(skins) || skins.length > MAX_OBSTACLES) {
    errors.push(`obstacleSkins: required array with at most ${MAX_OBSTACLES} entries`);
  } else {
    const seen = new Set<string>();
    skins.forEach((skin, index) => {
      if (!isRecord(skin)) {
        errors.push(`obstacleSkins[${index}]: expected object`);
        return;
      }
      const rowErrors: string[] = [];
      rejectUnknownFields(skin, ARENA_OBSTACLE_SKIN_FIELDS, rowErrors);
      requireString(skin, 'obstacleId', rowErrors);
      requireString(skin, 'artId', rowErrors);
      const obstacleId = readOwnField(skin, 'obstacleId');
      if (typeof obstacleId === 'string') {
        if (seen.has(obstacleId)) rowErrors.push(`obstacleId: duplicate skin for "${obstacleId}"`);
        seen.add(obstacleId);
      }
      for (const field of ['offsetX', 'offsetY'] as const) {
        const value = readOwnField(skin, field);
        if (value !== undefined && (!isFiniteNumber(value) || Math.abs(value) > 256)) {
          rowErrors.push(`${field}: expected finite number from -256 through 256`);
        }
      }
      errors.push(...rowErrors.map((error) => `obstacleSkins[${index}].${error}`));
    });
  }
  return errors;
}

function checkAudioAsset(row: unknown, requiredPrefix: string): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, AUDIO_ASSET_ENTRY_FIELDS, errors);
  requireString(row, 'key', errors);
  const key = readOwnField(row, 'key');
  if (typeof key === 'string') {
    if (!key.startsWith(requiredPrefix) || !isContentId(key)) {
      errors.push(`key: must be a content id prefixed "${requiredPrefix}"`);
    } else if (readOwnField(row, 'url') !== `assets/audio/${key}.wav`) {
      errors.push('url: must equal "assets/audio/<key>.wav"');
    }
  }
  requireString(row, 'url', errors);
  return errors;
}

function checkAudioMapEntry(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, AUDIO_MAP_ENTRY_FIELDS, errors);

  const event = readOwnField(row, 'event');
  requireString(row, 'event', errors);
  if (typeof event === 'string') {
    if (!AUDIO_EVENT_KEY_SET.has(event)) {
      errors.push('event: unknown event key');
    } else if (event === 'settings:changed') {
      errors.push('event: "settings:changed" is manager-owned and cannot be mapped');
    }
  }

  const sfxKey = readOwnField(row, 'sfxKey');
  if (sfxKey !== undefined) {
    if (typeof sfxKey !== 'string' || sfxKey.length === 0 || sfxKey.trim() !== sfxKey) {
      errors.push('sfxKey: required nonempty trimmed string');
    }
  }

  const sfxKeyByFamily = readOwnField(row, 'sfxKeyByFamily');
  if (sfxKeyByFamily !== undefined) {
    if (!isRecord(sfxKeyByFamily)) {
      errors.push('sfxKeyByFamily: required object');
    } else {
      for (const [family, key] of Object.entries(sfxKeyByFamily)) {
        if (family.length === 0 || family.trim() !== family) {
          errors.push(`sfxKeyByFamily.${family}: family key must be a nonempty trimmed string`);
        }
        if (typeof key !== 'string' || key.length === 0 || key.trim() !== key) {
          errors.push(`sfxKeyByFamily.${family}: required nonempty trimmed string`);
        }
      }
    }
  }

  const cooldownMs = readOwnField(row, 'cooldownMs');
  if (
    cooldownMs !== undefined &&
    (typeof cooldownMs !== 'number' || !Number.isSafeInteger(cooldownMs) || cooldownMs <= 0 || cooldownMs > MAX_AUDIO_COOLDOWN_MS)
  ) {
    errors.push(`cooldownMs: required positive integer at most ${MAX_AUDIO_COOLDOWN_MS}`);
  }

  const stopMusic = readOwnField(row, 'stopMusic');
  if (stopMusic !== undefined && stopMusic !== true) {
    errors.push('stopMusic: must be literal true when present');
  }

  const musicFadeMs = readOwnField(row, 'musicFadeMs');
  if (musicFadeMs !== undefined) {
    if (typeof musicFadeMs !== 'number' || !Number.isSafeInteger(musicFadeMs) || musicFadeMs <= 0 || musicFadeMs > MAX_AUDIO_FADE_MS) {
      errors.push(`musicFadeMs: required positive integer at most ${MAX_AUDIO_FADE_MS}`);
    }
    if (stopMusic !== true) {
      errors.push('musicFadeMs: requires stopMusic: true');
    }
  }

  if (sfxKey === undefined && stopMusic !== true) {
    errors.push('row: entry must define sfxKey or stopMusic');
  }

  return errors;
}

function checkLootTable(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, LOOT_FIELDS, errors);
  requireString(row, 'id', errors);
  const id = readOwnField(row, 'id');
  if (typeof id === 'string' && !isContentId(id)) errors.push('id: invalid content id');

  const entries = readOwnField(row, 'entries');
  if (!Array.isArray(entries)) {
    errors.push('entries: required array');
  } else if (entries.length > MAX_LOOT_ENTRIES) {
    errors.push(`entries: too many entries (max ${MAX_LOOT_ENTRIES})`);
  } else {
    let totalWeight = 0;
    for (let index = 0; index < entries.length; index += 1) {
      if (!(index in entries)) {
        errors.push(`entries[${index}]: sparse array entry`);
        continue;
      }
      const entry = entries[index];
      if (!isRecord(entry)) {
        errors.push(`entries[${index}]: expected object`);
        continue;
      }
      const entryErrors: string[] = [];
      rejectUnknownFields(entry, LOOT_ENTRY_FIELDS, entryErrors);
      const kind = readOwnField(entry, 'kind');
      requireEnum(entry, 'kind', LOOT_KINDS, entryErrors);
      if (kind === 'xp' || kind === 'scrap') {
        requirePositiveInteger(entry, 'amount', entryErrors);
      } else if (kind === 'weapon') {
        requireString(entry, 'definitionId', entryErrors);
        const definitionId = readOwnField(entry, 'definitionId');
        if (typeof definitionId === 'string' && !isContentId(definitionId)) {
          entryErrors.push('definitionId: invalid content id');
        }
        if (readOwnField(entry, 'amount') !== undefined) {
          entryErrors.push('amount: weapon entries must not define an amount');
        }
      } else if (kind === 'chest' || kind === 'nothing') {
        const amount = readOwnField(entry, 'amount');
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount !== 0) {
          entryErrors.push('amount: must be 0');
        }
      }
      requireNonNegativeNumber(entry, 'weight', entryErrors);
      const weight = readOwnField(entry, 'weight');
      if (isFiniteNumber(weight) && weight >= 0) {
        totalWeight += weight;
      }
      const tableId = readOwnField(entry, 'tableId');
      if (kind !== 'chest' && tableId !== undefined) {
        entryErrors.push('tableId: only chest entries may reference a table');
      }
      if (kind === 'chest') {
        requireString(entry, 'tableId', entryErrors);
      }
      const definitionId = readOwnField(entry, 'definitionId');
      if (kind !== 'weapon' && definitionId !== undefined) {
        entryErrors.push('definitionId: only weapon entries may define a definitionId');
      }
      errors.push(...entryErrors.map((error) => `entries[${index}].${error}`));
    }
    if (totalWeight <= 0) {
      errors.push('entries: total weight must be greater than 0');
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
  const art = readOwnField(row, 'art');
  if (!isRecord(art)) {
    errors.push('art: required object');
  } else {
    const artErrors: string[] = [];
    rejectUnknownFields(art, WEAPON_ART_FIELDS, artErrors);
    requireString(art, 'iconId', artErrors);
    requireString(art, 'heldId', artErrors);
    requireString(art, 'projectileId', artErrors);
    errors.push(...artErrors.map((error) => `art.${error}`));
  }
  return errors;
}

/** Shared shape for weapon-feel.json's muzzle/impact sub-objects: both
 *  require a hex color and a positive radius; muzzle additionally requires a
 *  positive lifetimeMs. Returns prefixed errors ready to concat onto the
 *  caller's error list. */
function checkColorRadiusSubObject(
  row: Record<string, unknown>,
  prefix: 'muzzle' | 'impact',
  allowedFields: ReadonlySet<string>,
  extraPositiveNumberFields: readonly string[] = [],
): string[] {
  const value = readOwnField(row, prefix);
  if (!isRecord(value)) {
    return [`${prefix}: required object`];
  }
  const subErrors: string[] = [];
  rejectUnknownFields(value, allowedFields, subErrors);
  requireHexColor(value, 'color', subErrors);
  requirePositiveNumber(value, 'radius', subErrors);
  for (const field of extraPositiveNumberFields) {
    requirePositiveNumber(value, field, subErrors);
  }
  return subErrors.map((error) => `${prefix}.${error}`);
}

function checkWeaponFeel(row: unknown): string[] {
  const errors = requireRecord(row);
  if (!isRecord(row)) return errors;
  rejectUnknownFields(row, WEAPON_FEEL_FIELDS, errors);
  requireString(row, 'family', errors);
  requirePositiveNumber(row, 'recoilPx', errors);

  errors.push(...checkColorRadiusSubObject(row, 'muzzle', WEAPON_FEEL_MUZZLE_FIELDS, ['lifetimeMs']));
  errors.push(...checkColorRadiusSubObject(row, 'impact', WEAPON_FEEL_IMPACT_FIELDS));

  const multipliers = readOwnField(row, 'sfxTierVolumeMultiplier');
  if (!Array.isArray(multipliers) || multipliers.length !== 3) {
    errors.push('sfxTierVolumeMultiplier: required array of exactly 3 entries');
  } else {
    multipliers.forEach((value, index) => {
      if (!isFiniteNumber(value) || value <= 0) {
        errors.push(`sfxTierVolumeMultiplier[${index}]: required positive number`);
      }
    });
  }

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

  const lootTableId = readOwnField(row, 'lootTableId');
  if (lootTableId !== undefined) {
    if (typeof lootTableId !== 'string' || lootTableId.length === 0 || lootTableId.trim() !== lootTableId) {
      errors.push('lootTableId: must be a non-empty trimmed string');
    }
  }

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
  checkRunUpgradeEffects(row, errors);
  checkUpgradePresentation(row, errors);
  return errors;
}

/** Epic 18 (D8): every shipped card's icon must be exactly
 *  `upgrade-icon:<upgrade-id>` — a self-consistency check needing only this
 *  row (existence/kind/required-ness of the actual binding is a
 *  cross-reference check, `assertUpgradeArtReferences`). */
function checkUpgradePresentation(row: Record<string, unknown>, errors: string[]): void {
  const presentation = readOwnField(row, 'presentation');
  if (!isRecord(presentation)) {
    errors.push('presentation: required object');
    return;
  }
  const presentationErrors: string[] = [];
  rejectUnknownFields(presentation, UPGRADE_PRESENTATION_FIELDS, presentationErrors);
  requireEnum(presentation, 'category', UPGRADE_CATEGORIES, presentationErrors);

  const id = readOwnField(row, 'id');
  const iconArtId = readOwnField(presentation, 'iconArtId');
  if (typeof iconArtId !== 'string') {
    presentationErrors.push('iconArtId: required string');
  } else if (typeof id === 'string' && iconArtId !== `upgrade-icon:${id}`) {
    presentationErrors.push(`iconArtId: must be exactly "upgrade-icon:${id}"`);
  }
  errors.push(...presentationErrors.map((error) => `presentation.${error}`));
}

/** Epic 18 (D3/D5): run-upgrade-only effect validator — uses
 *  RUN_UPGRADE_STAT_KEYS (never legacy STAT_KEYS) and validates the optional
 *  weapon-family scope. checkMetaUpgrade/character passives keep using the
 *  legacy checkUpgradeEffects()/STAT_KEY_SET below, unchanged. */
function checkRunUpgradeEffects(upgrade: Record<string, unknown>, errors: string[]): void {
  const effects = readOwnField(upgrade, 'effects');
  if (!Array.isArray(effects) || effects.length === 0) {
    errors.push('effects: required non-empty array');
    return;
  }

  const target = readOwnField(upgrade, 'target');
  const maxStacks = readOwnField(upgrade, 'maxStacks');
  let sharedFamily: string | undefined;
  let sawScope = false;

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
    rejectUnknownFields(effect, RUN_UPGRADE_EFFECT_FIELDS, effectErrors);
    const stat = readOwnField(effect, 'stat');
    const op = readOwnField(effect, 'op');
    const value = readOwnField(effect, 'value');
    if (typeof stat !== 'string' || !RUN_UPGRADE_STAT_KEY_SET.has(stat)) {
      effectErrors.push('stat: unknown run-upgrade stat key');
    }
    if (typeof op !== 'string' || !UPGRADE_OPS.has(op)) {
      effectErrors.push('op: must be "add" or "mult"');
    }
    if (!isFiniteNumber(value)) {
      effectErrors.push('value: required finite number');
    } else if (op === 'mult' && value <= 0) {
      // D5: mult values must be finite and > 0; sub-1 trade-off multipliers
      // (e.g. heavy-rounds' attackSpeed x0.94) are intentionally valid.
      effectErrors.push('value: mult value must be positive');
    } else if (isFiniteNumber(maxStacks) && Number.isSafeInteger(maxStacks)) {
      const aggregate = op === 'add' ? value * maxStacks : value ** maxStacks;
      if (!Number.isFinite(aggregate)) {
        effectErrors.push('value: aggregate across maxStacks must remain finite');
      }
    }

    const scope = readOwnField(effect, 'scope');
    if (scope !== undefined) {
      sawScope = true;
      if (!isRecord(scope)) {
        effectErrors.push('scope: required object');
      } else {
        const scopeErrors: string[] = [];
        rejectUnknownFields(scope, RUN_UPGRADE_SCOPE_FIELDS, scopeErrors);
        if (readOwnField(scope, 'kind') !== 'weapon-family') {
          scopeErrors.push('kind: must be "weapon-family"');
        }
        const family = readOwnField(scope, 'family');
        if (typeof family !== 'string' || family.trim().length === 0) {
          scopeErrors.push('family: required nonempty trimmed string');
        } else if (sharedFamily === undefined) {
          sharedFamily = family;
        } else if (sharedFamily !== family) {
          scopeErrors.push('family: every scoped effect in one upgrade must reference the same family');
        }
        if (typeof stat === 'string' && !WEAPON_MODIFIER_STAT_KEY_SET.has(stat)) {
          scopeErrors.push('stat: scope is only valid on a weapon-modifier stat');
        }
        effectErrors.push(...scopeErrors.map((error) => `scope.${error}`));
      }
    }

    errors.push(...effectErrors.map((error) => `effects[${index}].${error}`));
  }

  if (sawScope && target !== 'weapon') {
    errors.push('effects: a scoped effect requires target "weapon"');
  }
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

function assertEnemyLootTableReferences(
  enemies: readonly EnemyDefinition[],
  lootTables: readonly LootTable[],
): void {
  const ids = new Set(lootTables.map((table) => table.id));
  const errors: string[] = [];
  enemies.forEach((enemy, index) => {
    if ('lootTableId' in enemy && typeof enemy.lootTableId === 'string') {
      if (!ids.has(enemy.lootTableId)) {
        errors.push(`enemies.json[${index}].lootTableId: unknown loot table id "${enemy.lootTableId}"`);
      }
    }
  });
  throwIfErrors(errors);
}

/** Every weapon loot entry must resolve to one WeaponDefinition; an unknown
 *  ID is a data validation error before run creation (Epic 14 §5.2). Runtime
 *  invalid-ID handling in DropSystem remains for defense in depth. */
function assertLootWeaponReferences(
  lootTables: readonly LootTable[],
  weapons: readonly WeaponDefinition[],
): void {
  const weaponIds = new Set(weapons.map((weapon) => weapon.id));
  const errors: string[] = [];
  lootTables.forEach((table, tableIndex) => {
    table.entries.forEach((entry, entryIndex) => {
      if (entry.kind !== 'weapon') return;
      if (!weaponIds.has(entry.definitionId)) {
        errors.push(
          `loot-tables.json[${tableIndex}].entries[${entryIndex}].definitionId: unknown weapon id "${entry.definitionId}"`,
        );
      }
    });
  });
  throwIfErrors(errors);
}

function assertChestTargetsChestSafe(tables: readonly LootTable[]): void {
  const ids = new Set(tables.map((table) => table.id));
  const chestUnsafeIds = new Set(
    tables
      .filter((table) => table.entries.some((entry) => entry.kind === 'chest'))
      .map((table) => table.id),
  );
  const errors: string[] = [];
  tables.forEach((table, tableIndex) => {
    table.entries.forEach((entry, entryIndex) => {
      if (entry.kind !== 'chest' || entry.tableId === undefined) return;
      if (!ids.has(entry.tableId)) {
        errors.push(
          `loot-tables.json[${tableIndex}].entries[${entryIndex}].tableId: unknown table id "${entry.tableId}"`,
        );
        return;
      }
      if (chestUnsafeIds.has(entry.tableId)) {
        errors.push(
          `loot-tables.json[${tableIndex}].entries[${entryIndex}].tableId: target "${entry.tableId}" contains a chest entry and is not chest-safe`,
        );
      }
    });
  });
  throwIfErrors(errors);
}

function assertAudioAssetUniqueness(
  sfx: readonly AudioSfxAsset[],
  music: readonly AudioMusicAsset[],
): void {
  const seen = new Map<string, string>();
  const errors: string[] = [];
  const lists: ReadonlyArray<[string, readonly { key: string }[]]> = [
    ['sfx', sfx],
    ['music', music],
  ];
  for (const [source, list] of lists) {
    list.forEach((asset) => {
      const firstSource = seen.get(asset.key);
      if (firstSource !== undefined) {
        errors.push(`audio-assets.json: duplicate key "${asset.key}" (${firstSource} and ${source})`);
      } else {
        seen.set(asset.key, source);
      }
    });
  }
  throwIfErrors(errors);
}

/** Scenes reference the music-menu / music-run literals directly (Epic 10
 *  §4.5); validation guarantees both exist in audio-assets.json. */
export function assertAudioDefaults(assets: AudioAssetCatalog): void {
  const musicKeys = new Set(assets.music.map((music) => music.key));
  const errors: string[] = [];
  if (!musicKeys.has('music-menu')) {
    errors.push('audio-assets.json: missing required music key "music-menu"');
  }
  if (!musicKeys.has('music-run')) {
    errors.push('audio-assets.json: missing required music key "music-run"');
  }
  throwIfErrors(errors);
}

function assertAudioMapUniqueness(map: readonly AudioMapEntry[]): void {
  const seenEvents = new Map<string, number>();
  const seenSfxKeys = new Map<string, number>();
  const errors: string[] = [];
  map.forEach((entry, index) => {
    const firstEvent = seenEvents.get(entry.event);
    if (firstEvent !== undefined) {
      errors.push(`audio-map.json[${index}].event: duplicate event "${entry.event}" first seen at index ${firstEvent}`);
    } else {
      seenEvents.set(entry.event, index);
    }
    if (entry.sfxKey !== undefined) {
      const firstSfx = seenSfxKeys.get(entry.sfxKey);
      if (firstSfx !== undefined) {
        errors.push(`audio-map.json[${index}].sfxKey: duplicate sfxKey "${entry.sfxKey}" first seen at index ${firstSfx}`);
      } else {
        seenSfxKeys.set(entry.sfxKey, index);
      }
    }
  });
  throwIfErrors(errors);
}

/** player:damaged is not a free tunable: its cooldown must equal the i-frame
 *  window (Epic 10 §2.11) so the single event-level gate collapses both
 *  emission paths to the cadence the game already presents visually. */
function assertPlayerDamagedCadence(map: readonly AudioMapEntry[]): void {
  const entry = map.find((candidate) => candidate.event === 'player:damaged');
  if (entry === undefined) return;
  const expected = RuntimeConfig.gameplay.player.invulnerabilityMs;
  if (entry.cooldownMs !== expected) {
    throw new Error(
      `Invalid game data:\naudio-map.json: player:damaged cooldownMs must equal RuntimeConfig.gameplay.player.invulnerabilityMs (${expected})`,
    );
  }
}

/** Epic 17: exactly one presentation-only weapon-feel entry per weapon
 *  family actually used in weapons.json — no missing family (Boot fails
 *  closed rather than falling back to an implicit default), no orphan entry
 *  for a family nothing uses. */
export function assertWeaponFeelReferences(
  weapons: readonly WeaponDefinition[],
  weaponFeel: readonly WeaponFeelDefinition[],
): void {
  const usedFamilies = new Set(weapons.map((weapon) => weapon.family));
  const feelFamilies = new Map<string, number>();
  const errors: string[] = [];

  weaponFeel.forEach((entry, index) => {
    const first = feelFamilies.get(entry.family);
    if (first !== undefined) {
      errors.push(`weapon-feel.json[${index}].family: duplicate, first seen at index ${first}`);
    } else {
      feelFamilies.set(entry.family, index);
    }
    if (!usedFamilies.has(entry.family)) {
      errors.push(`weapon-feel.json[${index}].family: "${entry.family}" is not used by any weapon`);
    }
  });

  for (const family of usedFamilies) {
    if (!feelFamilies.has(family)) {
      errors.push(`weapon-feel.json: missing entry for weapon family "${family}"`);
    }
  }

  throwIfErrors(errors);
}

/** Cross-catalog check, run only from validateGameData (Epic 10 §6.2). */
export function assertAudioMapReferences(
  map: readonly AudioMapEntry[],
  assets: AudioAssetCatalog,
  weapons: readonly WeaponDefinition[] = [],
): void {
  const sfxKeys = new Set(assets.sfx.map((sfx) => sfx.key));
  const weaponFamilies = new Set(weapons.map((weapon) => weapon.family));
  const familyTierEvents = new Set<string>(FAMILY_TIER_EVENT_KEYS);
  const errors: string[] = [];
  map.forEach((entry, index) => {
    if (entry.sfxKey !== undefined && !sfxKeys.has(entry.sfxKey)) {
      errors.push(`audio-map.json[${index}].sfxKey: unknown sfx key "${entry.sfxKey}"`);
    }
    if (entry.sfxKeyByFamily !== undefined && !familyTierEvents.has(entry.event)) {
      // Fails closed rather than silently no-oping: AudioManager only reads
      // family/tier off weapon:fired/projectile:hit payloads (D4/D5), so a
      // sfxKeyByFamily on any other event would validate its keys fine yet
      // never fire at runtime.
      errors.push(
        `audio-map.json[${index}].sfxKeyByFamily: event "${entry.event}" does not carry family/tier — ` +
        `only ${[...familyTierEvents].join(', ')} do`,
      );
    }
    for (const [family, key] of Object.entries(entry.sfxKeyByFamily ?? {})) {
      if (!sfxKeys.has(key)) {
        errors.push(`audio-map.json[${index}].sfxKeyByFamily.${family}: unknown sfx key "${key}"`);
      }
      if (!weaponFamilies.has(family)) {
        errors.push(`audio-map.json[${index}].sfxKeyByFamily.${family}: family is not used by any weapon`);
      }
    }
  });
  throwIfErrors(errors);
}

/** Every weapon definition owns its UI and held silhouette, while all tiers
 * in a family deliberately share one projectile presentation. */
export function assertWeaponArtReferences(
  weapons: readonly WeaponDefinition[],
  catalog: VisualArtCatalog,
): void {
  const byId = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  const firstIcon = new Map<string, number>();
  const firstHeld = new Map<string, number>();
  const familyProjectile = new Map<string, string>();
  const errors: string[] = [];
  const roles = [
    ['iconId', 'weapon-icon'],
    ['heldId', 'weapon-held'],
    ['projectileId', 'projectile'],
  ] as const;

  weapons.forEach((weapon, index) => {
    for (const [field, expectedKind] of roles) {
      const artId = weapon.art[field];
      const binding = byId.get(artId);
      if (!binding) {
        errors.push(`weapons.json[${index}].art.${field}: unknown visual-art id "${artId}"`);
      } else if (binding.kind !== expectedKind) {
        errors.push(`weapons.json[${index}].art.${field}: expected ${expectedKind} binding, got ${binding.kind}`);
      } else if (!binding.required) {
        errors.push(`weapons.json[${index}].art.${field}: weapon art must be required`);
      }
    }

    for (const [field, seen] of [['iconId', firstIcon], ['heldId', firstHeld]] as const) {
      const artId = weapon.art[field];
      const first = seen.get(artId);
      if (first !== undefined) {
        errors.push(`weapons.json[${index}].art.${field}: duplicate first seen at index ${first}`);
      } else {
        seen.set(artId, index);
      }
    }

    const expectedProjectile = familyProjectile.get(weapon.family);
    if (expectedProjectile !== undefined && expectedProjectile !== weapon.art.projectileId) {
      errors.push(`weapons.json[${index}].art.projectileId: family "${weapon.family}" must share "${expectedProjectile}"`);
    } else {
      familyProjectile.set(weapon.family, weapon.art.projectileId);
    }
  });
  throwIfErrors(errors);
}

/** Epic 18 (D5/D6): scoped run-upgrade families must exist in the validated
 *  weapon catalog — never DEFAULT_WEAPON_FAMILIES, which is only the starter-
 *  family invariant, not the authority for every family real data may add. */
export function assertUpgradeWeaponFamilyReferences(
  upgrades: readonly UpgradeDefinition[],
  weapons: readonly WeaponDefinition[],
): void {
  const knownFamilies = new Set(weapons.map((weapon) => weapon.family));
  const errors: string[] = [];
  upgrades.forEach((upgrade, index) => {
    for (const effect of upgrade.effects) {
      if (effect.scope && !knownFamilies.has(effect.scope.family)) {
        errors.push(
          `upgrades.json[${index}].effects: scope family "${effect.scope.family}" is not used by any weapon`,
        );
      }
    }
  });
  throwIfErrors(errors);
}

/** Epic 18 (D8): every shipped card's icon must resolve to exactly one
 *  required `upgrade-icon` binding. checkUpgrade's row-level identity check
 *  (`iconArtId === upgrade-icon:<own-id>`) already makes "point at another
 *  card's icon" structurally impossible — this cross-reference confirms the
 *  binding actually exists, is the right kind, and is required. */
export function assertUpgradeArtReferences(
  upgrades: readonly UpgradeDefinition[],
  catalog: VisualArtCatalog,
): void {
  const byId = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  const errors: string[] = [];
  upgrades.forEach((upgrade, index) => {
    const iconArtId = upgrade.presentation.iconArtId;
    const binding = byId.get(iconArtId);
    if (!binding) {
      errors.push(`upgrades.json[${index}].presentation.iconArtId: unknown visual-art id "${iconArtId}"`);
    } else if (binding.kind !== 'upgrade-icon') {
      errors.push(
        `upgrades.json[${index}].presentation.iconArtId: expected upgrade-icon binding, got ${binding.kind}`,
      );
    } else if (!binding.required) {
      errors.push(`upgrades.json[${index}].presentation.iconArtId: upgrade icon must be required`);
    }
  });
  throwIfErrors(errors);
}

/** Actor catalogs and the fixed runtime grant union must never silently fall
 * back after a manifest row is removed. Requiring the shared four-state actor
 * sheet contract here also makes future character/enemy additions fail at the
 * data boundary until their production presentation is supplied. */
export function assertActorAndDropArtReferences(
  characters: readonly CharacterDefinition[],
  enemies: readonly EnemyDefinition[],
  catalog: VisualArtCatalog,
): void {
  const byId = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  const errors: string[] = [];
  const actorClips = {
    idle: { start: 0, end: 3, repeat: -1 },
    run: { start: 4, end: 9, repeat: -1 },
    hurt: { start: 10, end: 11, repeat: 0 },
    defeat: { start: 12, end: 15, repeat: 0 },
  } as const;

  const checkActor = (id: string, expectedKind: 'character' | 'enemy', path: string): void => {
    const binding = byId.get(id);
    if (!binding) {
      errors.push(`${path}: missing required visual-art id "${id}"`);
      return;
    }
    if (binding.kind !== expectedKind) {
      errors.push(`${path}: expected ${expectedKind} binding, got ${binding.kind}`);
      return;
    }
    if (!binding.required) errors.push(`${path}: actor art must be required`);
    if (binding.load.type !== 'spritesheet') {
      errors.push(`${path}: actor art must be a spritesheet`);
      return;
    }
    for (const [clipName, expected] of Object.entries(actorClips)) {
      const clip = binding.clips?.[clipName];
      if (!clip) {
        errors.push(`${path}: missing required ${clipName} clip`);
      } else if (clip.start !== expected.start || clip.end !== expected.end ||
          clip.repeat !== expected.repeat) {
        errors.push(
          `${path}: ${clipName} must use frames ${expected.start}-${expected.end} ` +
          `with repeat ${expected.repeat}`,
        );
      }
    }
  };

  characters.forEach((character, index) =>
    checkActor(`character:${character.id}`, 'character', `characters.json[${index}].visualArt`));
  enemies.forEach((enemy, index) =>
    checkActor(`enemy:${enemy.id}`, 'enemy', `enemies.json[${index}].visualArt`));

  for (const kind of ['xp', 'scrap', 'chest', 'weapon'] as const) {
    const id = `drop:${kind}`;
    const binding = byId.get(id);
    const path = `visual-art.json.${id}`;
    if (!binding) {
      errors.push(`${path}: missing required pickup binding`);
    } else if (binding.kind !== 'drop') {
      errors.push(`${path}: expected drop binding, got ${binding.kind}`);
    } else {
      if (!binding.required) errors.push(`${path}: pickup art must be required`);
      if (binding.load.type !== 'spritesheet' || !binding.clips?.idle) {
        errors.push(`${path}: pickup art must provide an idle spritesheet clip`);
      }
    }
  }

  throwIfErrors(errors);
}

export function assertArenaVisualReferences(
  arenas: readonly ArenaDefinition[],
  catalog: VisualArtCatalog,
): void {
  const byId = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  const errors: string[] = [];
  const check = (arenaIndex: number, path: string, artId: string, prefix: string): void => {
    const binding = byId.get(artId);
    if (!binding) {
      errors.push(`arenas.json[${arenaIndex}].visual.${path}: unknown visual-art id "${artId}"`);
    } else if (binding.kind !== 'world') {
      errors.push(`arenas.json[${arenaIndex}].visual.${path}: expected world binding, got ${binding.kind}`);
    } else if (!artId.startsWith(prefix)) {
      errors.push(`arenas.json[${arenaIndex}].visual.${path}: art id must start "${prefix}"`);
    } else if (!binding.required) {
      errors.push(`arenas.json[${arenaIndex}].visual.${path}: world art must be required`);
    }
  };

  arenas.forEach((arena, arenaIndex) => {
    arena.visual.floorArtIds.forEach((artId, index) =>
      check(arenaIndex, `floorArtIds[${index}]`, artId, 'world:junkyard-floor:'));
    for (const [field, artId] of Object.entries(arena.visual.boundary)) {
      check(arenaIndex, `boundary.${field}`, artId, 'world:junkyard-boundary:');
    }
    arena.visual.decorations.forEach((decoration, index) =>
      check(arenaIndex, `decorations[${index}].artId`, decoration.artId, 'world:prop:'));

    const obstacleIds = new Set(arena.obstacles.map((obstacle) => obstacle.id));
    const skinnedIds = new Set<string>();
    arena.visual.obstacleSkins.forEach((skin, index) => {
      if (!obstacleIds.has(skin.obstacleId)) {
        errors.push(`arenas.json[${arenaIndex}].visual.obstacleSkins[${index}].obstacleId: unknown obstacle "${skin.obstacleId}"`);
      }
      skinnedIds.add(skin.obstacleId);
      check(arenaIndex, `obstacleSkins[${index}].artId`, skin.artId, 'world:landmark:');
    });
    for (const obstacleId of obstacleIds) {
      if (!skinnedIds.has(obstacleId)) {
        errors.push(`arenas.json[${arenaIndex}].visual.obstacleSkins: missing skin for obstacle "${obstacleId}"`);
      }
    }
  });
  throwIfErrors(errors);
}

export function validateVisualArtCatalog(raw: unknown): VisualArtCatalog {
  throwIfErrors(jsonSafetyErrors(raw, 'visual-art.json'));
  const errors: string[] = [];
  if (!isRecord(raw)) {
    throw new Error('Invalid game data:\nvisual-art.json: expected object');
  }
  rejectUnknownFields(raw, VISUAL_ART_ROOT_FIELDS, errors);
  const bindings = readOwnField(raw, 'bindings');
  if (!Array.isArray(bindings)) {
    errors.push('bindings: required array');
  } else if (bindings.length > MAX_VISUAL_ART_BINDINGS) {
    errors.push(`bindings: exceeds maximum ${MAX_VISUAL_ART_BINDINGS}`);
  }

  const ids = new Map<string, number>();
  const textureKeys = new Map<string, number>();
  if (Array.isArray(bindings)) {
    bindings.forEach((binding, index) => {
      const prefix = `bindings[${index}]`;
      if (!isRecord(binding)) {
        errors.push(`${prefix}: expected object`);
        return;
      }
      const rowErrors: string[] = [];
      rejectUnknownFields(binding, VISUAL_ART_BINDING_FIELDS, rowErrors);
      requireString(binding, 'id', rowErrors);
      requireString(binding, 'kind', rowErrors);
      requireString(binding, 'textureKey', rowErrors);
      requireString(binding, 'url', rowErrors);

      const id = readOwnField(binding, 'id');
      const kind = readOwnField(binding, 'kind');
      const textureKey = readOwnField(binding, 'textureKey');
      const url = readOwnField(binding, 'url');
      const required = readOwnField(binding, 'required');
      const sampling = readOwnField(binding, 'sampling');
      if (required !== true && required !== false) {
        rowErrors.push('required: required boolean');
      }
      if (sampling !== 'nearest' && sampling !== 'linear') {
        rowErrors.push('sampling: must be nearest or linear');
      }
      if (typeof id === 'string' &&
          (id.length > 128 || !/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/.test(id))) {
        rowErrors.push('id: invalid visual-art id');
      }
      if (typeof kind !== 'string' || !VISUAL_ART_KINDS.has(kind)) {
        rowErrors.push('kind: unknown visual-art kind');
      } else if (typeof id === 'string' && !id.startsWith(`${kind}:`)) {
        rowErrors.push('kind: must match id prefix');
      }
      if (typeof textureKey === 'string') {
        if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(textureKey)) {
          rowErrors.push('textureKey: invalid bounded kebab-case key');
        }
        const first = textureKeys.get(textureKey);
        if (first !== undefined) rowErrors.push(`textureKey: duplicate first seen at index ${first}`);
        else textureKeys.set(textureKey, index);
      }
      if (typeof id === 'string') {
        const first = ids.get(id);
        if (first !== undefined) rowErrors.push(`id: duplicate first seen at index ${first}`);
        else ids.set(id, index);
      }
      if (typeof url === 'string' &&
          (url.length > 256 || !/^assets\/[a-z0-9][a-z0-9/-]*\.png$/.test(url))) {
        rowErrors.push('url: must be a relative assets PNG path');
      }

      const load = readOwnField(binding, 'load');
      const loadType = isRecord(load) ? readOwnField(load, 'type') : undefined;
      if (!isRecord(load)) {
        rowErrors.push('load: required object');
      } else if (loadType === 'image') {
        rejectUnknownFields(load, VISUAL_ART_IMAGE_LOAD_FIELDS, rowErrors, 'load');
      } else if (loadType === 'spritesheet') {
        const loadErrors: string[] = [];
        rejectUnknownFields(load, VISUAL_ART_SPRITESHEET_LOAD_FIELDS, loadErrors);
        const frame = readOwnField(load, 'frame');
        if (!isRecord(frame)) {
          loadErrors.push('frame: required object');
        } else {
          const frameErrors: string[] = [];
          rejectUnknownFields(frame, VISUAL_ART_DIMENSION_FIELDS, frameErrors);
          requireIntegerInRange(frame, 'width', 1, 2048, frameErrors);
          requireIntegerInRange(frame, 'height', 1, 2048, frameErrors);
          loadErrors.push(...frameErrors.map((error) => `frame.${error}`));
        }
        rowErrors.push(...loadErrors.map((error) => `load.${error}`));
      } else {
        rowErrors.push('load.type: must be image or spritesheet');
      }

      const display = readOwnField(binding, 'display');
      if (!isRecord(display)) {
        rowErrors.push('display: required object');
      } else {
        const displayErrors: string[] = [];
        rejectUnknownFields(display, VISUAL_ART_DIMENSION_FIELDS, displayErrors);
        requireNumberInRange(display, 'width', 1, 4096, displayErrors);
        requireNumberInRange(display, 'height', 1, 4096, displayErrors);
        rowErrors.push(...displayErrors.map((error) => `display.${error}`));
      }

      const clips = readOwnField(binding, 'clips');
      if (clips !== undefined && !isRecord(clips)) {
        rowErrors.push('clips: expected object');
      } else if (isRecord(clips)) {
        if (loadType !== 'spritesheet') {
          rowErrors.push('clips: allowed only for spritesheet loads');
        }
        if (Object.keys(clips).length > MAX_VISUAL_ART_CLIPS) {
          rowErrors.push(`clips: exceeds maximum ${MAX_VISUAL_ART_CLIPS}`);
        }
        for (const [name, clip] of Object.entries(clips)) {
          if (name.length > 64 || !/^[a-z][a-z0-9-]*$/.test(name)) {
            rowErrors.push(`clips.${name}: invalid clip name`);
            continue;
          }
          if (!isRecord(clip)) {
            rowErrors.push(`clips.${name}: expected object`);
            continue;
          }
          const clipErrors: string[] = [];
          rejectUnknownFields(clip, VISUAL_ART_CLIP_FIELDS, clipErrors);
          requireIntegerInRange(clip, 'start', 0, 255, clipErrors);
          requireIntegerInRange(clip, 'end', 0, 255, clipErrors);
          requireNumberInRange(clip, 'frameRate', 1, 60, clipErrors);
          const repeat = readOwnField(clip, 'repeat');
          if (repeat !== -1 && repeat !== 0) clipErrors.push('repeat: must be -1 or 0');
          const start = readOwnField(clip, 'start');
          const end = readOwnField(clip, 'end');
          if (typeof start === 'number' && typeof end === 'number' && start > end) {
            clipErrors.push('end: must be at least start');
          }
          rowErrors.push(...clipErrors.map((error) => `clips.${name}.${error}`));
        }
      }
      if ((kind === 'character' || kind === 'enemy') &&
          (loadType !== 'spritesheet' || !isRecord(clips) || !isRecord(clips.idle) || !isRecord(clips.run))) {
        rowErrors.push('clips: character and enemy bindings require idle and run');
      }
      errors.push(...rowErrors.map((error) => `${prefix}.${error}`));
    });
  }
  throwIfErrors(errors.map((error) => `visual-art.json.${error}`));
  return raw as unknown as VisualArtCatalog;
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

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

function requireHexColor(row: Record<string, unknown>, field: string, errors: string[]): void {
  const value = readOwnField(row, field);
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    errors.push(`${field}: required lowercase #rrggbb color`);
  }
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
