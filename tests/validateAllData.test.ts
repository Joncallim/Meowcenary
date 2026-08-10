import { describe, expect, it } from 'vitest';
import {
  CATALOG_DESCRIPTORS,
  collectGameDataErrors,
  loadGameData,
  mapValidationErrorLines,
  validateAllData,
  validateGameData,
  type ValidationIssue,
} from '../src/systems/validation';

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
