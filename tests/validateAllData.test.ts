import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CATALOG_DESCRIPTORS,
  CATALOG_LEVEL_ASSERTIONS,
  collectGameDataErrors,
  loadGameData,
  mapValidationErrorLines,
  remapRootPhaseLine,
  validateAllData,
  validateGameData,
  type ValidationIssue,
} from '../src/systems/validation';
import type { WeaponDefinition } from '../src/systems/types';

function mutableData(): Record<string, any> {
  return structuredClone(loadGameData()) as unknown as Record<string, any>;
}

describe('validateAllData', () => {
  it('returns no issues for shipped data', () => {
    expect(validateAllData()).toEqual([]);
  });

  it('accepts the normalized audio.map round-trip shape', () => {
    // loadGameData() output normalizes audio.map to AudioMapEntry[]; the
    // collector must accept that shape as well as the { events: [...] }
    // wrapper (Epic 10 §6.2).
    expect(collectGameDataErrors(loadGameData())).toEqual([]);
  });

  it('reports every broken catalog without aborting', () => {
    const data = mutableData();
    data.weapons[0].damage = -1;
    data.enemies[0].health = -1;
    data.spawnCurves[0].waves[0].maxAlive = 0;

    expect(collectGameDataErrors(data)).toEqual([
      { file: 'weapons.json', index: 0, field: 'damage', message: 'required positive number' },
      { file: 'enemies.json', index: 0, field: 'health', message: 'required positive number' },
      {
        file: 'spawn-curves.json',
        index: 0,
        field: 'waves[0].maxAlive',
        message: 'required integer from 1 through 256',
      },
    ]);
  });

  it('maps nested field paths and multi-line errors line by line', () => {
    const data = mutableData();
    data.spawnCurves[0].waves[0].maxAlive = 0;
    data.spawnCurves[0].waves[1].spawnEveryMs = 1.5;

    expect(collectGameDataErrors(data)).toEqual([
      {
        file: 'spawn-curves.json',
        index: 0,
        field: 'waves[0].maxAlive',
        message: 'required integer from 1 through 256',
      },
      {
        file: 'spawn-curves.json',
        index: 0,
        field: 'waves[1].spawnEveryMs',
        message: 'required positive integer',
      },
    ]);
  });

  it('maps file-level errors with index -1 and an empty field', () => {
    const data = mutableData();
    data.spawnCurves = [];

    expect(collectGameDataErrors(data)).toEqual([
      {
        file: 'spawn-curves.json',
        index: -1,
        field: '',
        message: 'at least one spawn curve is required',
      },
    ]);
  });

  it('maps row-level errors without a field', () => {
    const data = mutableData();
    const sparse = new Array(2);
    sparse[0] = data.enemies[0];
    data.enemies = sparse;

    expect(collectGameDataErrors(data)).toEqual([
      { file: 'enemies.json', index: 1, field: '', message: 'sparse array entry' },
    ]);
  });

  it('falls back to (unknown) for unparseable lines', () => {
    expect(mapValidationErrorLines(new Error('boom'))).toEqual([
      { file: '(unknown)', index: -1, field: '', message: 'boom' },
    ]);

    expect(mapValidationErrorLines('Invalid game data:\nweapons.json[0].id: bad')).toEqual([
      { file: 'weapons.json', index: 0, field: 'id', message: 'bad' },
    ]);
  });

  it('skips cross-references when a per-file catalog is dirty', () => {
    const data = mutableData();
    data.enemies[0].health = -1; // per-file error
    data.spawnCurves[0].waves[0].enemyId = 'missing-enemy'; // would be a cross-ref error

    const issues = collectGameDataErrors(data);
    expect(issues.some((issue) => issue.file === 'enemies.json')).toBe(true);
    expect(issues.some((issue) => issue.message.includes('unknown enemyId'))).toBe(false);
  });

  it('attributes cross-reference issues to their file, row, and field', () => {
    const data = mutableData();
    data.spawnCurves[0].waves[0].enemyId = 'missing-enemy';

    expect(collectGameDataErrors(data)).toEqual([
      {
        file: 'spawn-curves.json',
        index: 0,
        field: 'waves[0].enemyId',
        message: 'unknown enemyId "missing-enemy"',
      },
    ]);
  });

  it('attributes loot weapon cross-reference issues to their table, row, and field', () => {
    const data = mutableData();
    data.lootTables[0].entries[0] = {
      kind: 'weapon',
      weight: 1,
      definitionId: 'missing-weapon',
    };

    expect(collectGameDataErrors(data)).toEqual([
      {
        file: 'loot-tables.json',
        index: 0,
        field: 'entries[0].definitionId',
        message: 'unknown weapon id "missing-weapon"',
      },
    ]);
  });

  it('reports a later file row error before any catalog-level assertion', () => {
    // Phase order (Epic 11 §5.3): every per-file row pipeline runs before
    // the catalog-level assertion phase, so a spawn-curves row error must
    // be the only report even when the weapons catalog would fail
    // assertWeaponTiers (mergeTier 99 passes the row checks).
    const data = mutableData();
    data.weapons[0].mergeTier = 99;
    data.spawnCurves[0].waves[0].maxAlive = 0;

    expect(collectGameDataErrors(data)).toEqual([
      {
        file: 'spawn-curves.json',
        index: 0,
        field: 'waves[0].maxAlive',
        message: 'required integer from 1 through 256',
      },
    ]);
  });

  it('attributes dotted object-backed file errors to their field', () => {
    const data = mutableData();
    data.audio.assets.sfx = 'not-an-array';

    expect(collectGameDataErrors(data)).toEqual([
      { file: 'audio-assets.json', index: -1, field: 'sfx', message: 'required array' },
    ]);
  });

  it('keys every catalog-level assertion to a catalog descriptor', () => {
    // Drift guard pin: a descriptor key rename must not silently leave a
    // CATALOG_LEVEL_ASSERTIONS entry asserting undefined rows (Epic 11 §5.3).
    const descriptorKeys = new Set<string>(CATALOG_DESCRIPTORS.map((descriptor) => descriptor.key));
    for (const assertion of CATALOG_LEVEL_ASSERTIONS) {
      expect(descriptorKeys.has(assertion.key)).toBe(true);
    }
  });

  it('types the weapons row pipeline to WeaponDefinition[] at compile time', () => {
    // CATALOG_DESCRIPTORS is declared `as const`, so index access keeps the
    // per-descriptor validateRows return type (position [0] = weapons is
    // pinned by the ordering test above). If the inlined lambda's return
    // annotation drifts from the catalog row type, this file fails to
    // compile (Epic 11 review, Finding 4).
    expectTypeOf(CATALOG_DESCRIPTORS[0].validateRows).returns.toEqualTypeOf<WeaponDefinition[]>();
    expect(CATALOG_DESCRIPTORS[0].file).toBe('weapons.json');
  });

  it('masks per-file phases when the root shape fails', () => {
    const data = mutableData();
    Reflect.deleteProperty(data, 'enemies');
    data.weapons[0].damage = -1;

    // The boot message keeps the frozen `game-data.enemies` text (Epic 11
    // §5.3); the collector remaps catalog-root lines to JSON file names so
    // issues group by file (§5.1).
    expect(collectGameDataErrors(data)).toEqual([
      { file: 'enemies.json', index: -1, field: '', message: 'required field' },
    ]);
  });

  it('keeps the game-data. prefix for root lines naming no catalog', () => {
    const data = mutableData();
    (data as Record<string, unknown>).surprise = 1;

    expect(collectGameDataErrors(data)).toEqual([
      { file: 'game-data.surprise', index: -1, field: '', message: 'unknown field' },
    ]);
  });

  it('maps a non-JSON-safe catalog value to its file via the root-phase remap', () => {
    // jsonSafetyErrors emits `game-data.weapons: non-JSON-safe number`
    // inside assertGameDataRoot, which remaps it to the file name; the
    // collector's boundary remap must leave that line unchanged
    // (idempotency, Epic 11 §5.4).
    expect(collectGameDataErrors({
      weapons: NaN,
      enemies: [],
      upgrades: [],
      metaUpgrades: [],
      spawnCurves: [],
      characters: [],
      arenas: [],
      lootTables: [],
      audio: { assets: {}, map: [] },
      visualArt: { bindings: [] },
    })).toEqual([
      { file: 'weapons.json', index: -1, field: '', message: 'non-JSON-safe number' },
    ]);
  });

  it('attributes a non-object aggregate to the game-data root category', () => {
    expect(collectGameDataErrors(42)).toEqual([
      { file: 'game-data', index: -1, field: '', message: 'expected object' },
    ]);
  });

  it('keeps the throwing boot path byte-identical: weapons error first', () => {
    const data = mutableData();
    data.weapons[0].damage = -1;
    data.enemies[0].health = -1;

    let message = '';
    try {
      validateGameData(data);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('weapons.json[0].damage');
    expect(message).not.toContain('enemies.json');
  });

  it('orders descriptors like the boot pipeline', () => {
    expect(CATALOG_DESCRIPTORS.map((descriptor) => descriptor.key)).toEqual([
      'weapons',
      'enemies',
      'upgrades',
      'metaUpgrades',
      'spawnCurves',
      'characters',
      'arenas',
      'lootTables',
      'audio-assets',
      'audio-map',
      'visualArt',
    ]);
  });

  it('never throws for arbitrary inputs', () => {
    for (const raw of [undefined, null, 42, 'data', [], {}]) {
      expect(() => collectGameDataErrors(raw)).not.toThrow();
      expect(Array.isArray(collectGameDataErrors(raw))).toBe(true);
    }
  });

  it('shapes every issue with the ValidationIssue contract', () => {
    const data = mutableData();
    data.weapons[0].damage = -1;
    const issues: ValidationIssue[] = collectGameDataErrors(data);

    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('weapons.json');
    expect(issues[0].index).toBe(0);
    expect(issues[0].field).toBe('damage');
    expect(issues[0].message).toBe('required positive number');
  });
});

describe('remapRootPhaseLine', () => {
  // The 11 explicit catalog-root patterns (Epic 11 §5.1/§5.4), each with
  // the root-phase line shape that reaches the remap today.
  const catalogLines: ReadonlyArray<readonly [string, string]> = [
    ['game-data.weapons: required field', 'weapons.json: required field'],
    ['game-data.enemies: required field', 'enemies.json: required field'],
    ['game-data.upgrades: required field', 'upgrades.json: required field'],
    ['game-data.metaUpgrades: required field', 'meta-upgrades.json: required field'],
    ['game-data.spawnCurves: required field', 'spawn-curves.json: required field'],
    ['game-data.characters: required field', 'characters.json: required field'],
    ['game-data.arenas: required field', 'arenas.json: required field'],
    ['game-data.lootTables: required field', 'loot-tables.json: required field'],
    ['game-data.audio.assets: required field', 'audio-assets.json: required field'],
    ['game-data.audio.map: required field', 'audio-map.json: required field'],
    ['game-data.visualArt: required field', 'visual-art.json: required field'],
  ];

  it('remaps every catalog-root line to its JSON file name', () => {
    for (const [input, expected] of catalogLines) {
      expect(remapRootPhaseLine(input)).toBe(expected);
    }
  });

  it('derives a remap rule from every catalog descriptor', () => {
    // Adding a catalog must not leave the root-phase remap stale: each
    // descriptor's aggregate path (rootKey, or rootKey.subKey for the audio
    // pair) has to remap to its JSON file name (Epic 11 §5.1/§5.2).
    for (const descriptor of CATALOG_DESCRIPTORS) {
      const aggregatePath = 'subKey' in descriptor
        ? `${descriptor.rootKey}.${descriptor.subKey}`
        : descriptor.rootKey;
      expect(remapRootPhaseLine(`game-data.${aggregatePath}: required field`))
        .toBe(`${descriptor.file}: required field`);
    }
  });

  it('is idempotent: applying it twice equals applying it once', () => {
    // Idempotency is load-bearing: assertGameDataRoot remaps the
    // jsonSafetyErrors lines, then the collector remaps the whole thrown
    // message again (§5.4). A destructive second pass would corrupt
    // already-remapped lines.
    for (const [input] of catalogLines) {
      expect(remapRootPhaseLine(remapRootPhaseLine(input))).toBe(remapRootPhaseLine(input));
    }
    // Row-indexed and already-remapped lines (as produced by the first
    // remap inside assertGameDataRoot) are stable too.
    expect(remapRootPhaseLine(remapRootPhaseLine('weapons.json: required field'))).toBe('weapons.json: required field');
    expect(remapRootPhaseLine(remapRootPhaseLine('weapons.json[0].damage: bad'))).toBe('weapons.json[0].damage: bad');
  });

  it('keeps lines naming no catalog unchanged', () => {
    // Unknown root fields, the non-object aggregate, the audio pair, and a
    // prefix-extension root (which jsonSafetyErrors can flag before
    // rejectUnknownFields runs) all stay in the root category.
    const nonCatalogLines = [
      'game-data.surprise: unknown field',
      'game-data: expected object',
      'game-data.audio: expected object',
      'game-data.weaponsV2: non-JSON-safe number',
    ];
    for (const line of nonCatalogLines) {
      expect(remapRootPhaseLine(line)).toBe(line);
    }
  });
});
