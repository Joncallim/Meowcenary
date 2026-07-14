import { describe, expect, it } from 'vitest';
import { STAT_KEYS, type StatKey } from '../src/gameplay/stats';
import {
  collectValidationErrors,
  loadGameData,
  validateGameData,
} from '../src/systems/validation';

type MutableData = ReturnType<typeof loadGameData>;

function enemyFixture(archetype: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: `${archetype}-fixture`,
    name: `${archetype} fixture`,
    archetype,
    health: 10,
    damage: 2,
    speed: 50,
    xpValue: 1,
    scrapValue: 1,
    contactDamage: true,
  };
  if (archetype === 'charger') {
    base.attack = {
      triggerRange: 100,
      telegraphMs: 200,
      dashSpeed: 100,
      dashDurationMs: 300,
      cooldownMs: 500,
    };
  } else if (archetype === 'ranged') {
    base.contactDamage = false;
    base.attack = { range: 200, telegraphMs: 250, cooldownMs: 750 };
  } else if (archetype === 'boss') {
    base.contactDamage = false;
  } else if (archetype === 'elite') {
    return {
      id: 'elite-fixture',
      name: 'Elite fixture',
      archetype: 'elite',
      baseEnemyId: 'chaser-fixture',
      ...overrides,
    };
  }
  return { ...base, ...overrides };
}

function withEnemies(enemies: Record<string, unknown>[]): unknown {
  const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
  data.enemies = enemies;
  data.spawnCurves = [{
    id: 'fixture-curve',
    durationSeconds: 60,
    scaling: { healthPerMinute: 0.1, damagePerMinute: 0.1 },
    waves: [
      { startSecond: 0, enemyId: 'chaser-fixture', spawnEveryMs: 1000, maxAlive: 1 },
      { startSecond: 0, enemyId: 'charger-fixture', spawnEveryMs: 1000, maxAlive: 1 },
      { startSecond: 0, enemyId: 'tank-fixture', spawnEveryMs: 1000, maxAlive: 1 },
    ],
  }];
  return data;
}

function withFirstUpgradeEffects(effects: unknown): ReturnType<typeof loadGameData> {
  const data = structuredClone(loadGameData());
  (data.upgrades[0] as unknown as { effects: unknown }).effects = effects;
  return data;
}

describe('game data validation', () => {
  it('validates starter JSON', () => {
    const data = loadGameData();

    expect(data.weapons.length).toBeGreaterThan(0);
    expect(data.enemies.length).toBeGreaterThan(0);
    expect(data.upgrades.length).toBeGreaterThan(0);
    expect(data.spawnCurves.length).toBeGreaterThan(0);
  });

  it('fails missing fields with file, index, and field', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    Reflect.deleteProperty(broken.weapons[0], 'damage');

    expect(() => validateGameData(broken)).toThrow(/weapons\.json\[0\]\.damage/);
  });

  it('fails bad spawn enemy references with file, index, and field', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.spawnCurves[0].waves[0].enemyId = 'missing-enemy';

    expect(() => validateGameData(broken)).toThrow(
      /spawn-curves\.json\[0\]\.waves\[0\]\.enemyId/,
    );
  });

  it('rejects spawn content that cannot produce a playable run', () => {
    const data = loadGameData();

    const missingCurves = structuredClone(data);
    missingCurves.spawnCurves = [];
    expect(() => validateGameData(missingCurves)).toThrow(/at least one spawn curve/);

    const missingWaves = structuredClone(data);
    missingWaves.spawnCurves[0].waves = [];
    expect(() => validateGameData(missingWaves)).toThrow(/at least one wave/);

    const unreachableWave = structuredClone(data);
    unreachableWave.spawnCurves[0].waves[0].startSecond =
      unreachableWave.spawnCurves[0].durationSeconds;
    expect(() => validateGameData(unreachableWave)).toThrow(/must be before durationSeconds/);
  });

  it('rejects fractional integer fields', () => {
    const data = loadGameData();

    const fractionalMergeTier = structuredClone(data);
    fractionalMergeTier.weapons[0].mergeTier = 1.5;
    expect(() => validateGameData(fractionalMergeTier)).toThrow(/weapons\.json\[0\]\.mergeTier/);

    const fractionalMaxStacks = structuredClone(data);
    fractionalMaxStacks.upgrades[0].maxStacks = 2.5;
    expect(() => validateGameData(fractionalMaxStacks)).toThrow(/upgrades\.json\[0\]\.maxStacks/);

    const fractionalMaxAlive = structuredClone(data);
    fractionalMaxAlive.spawnCurves[0].waves[0].maxAlive = 3.5;
    expect(() => validateGameData(fractionalMaxAlive)).toThrow(
      /spawn-curves\.json\[0\]\.waves\[0\]\.maxAlive/,
    );
  });

  it('validates shipped weapon family tiers', () => {
    const data = loadGameData();

    expect(data.weapons.map((weapon) => weapon.id)).toEqual([
      'scrap-pistol-t1',
      'scrap-pistol-t2',
      'scrap-pistol-t3',
      'can-smg-t1',
      'can-smg-t2',
      'can-smg-t3',
      'bolt-shotgun-t1',
      'bolt-shotgun-t2',
      'bolt-shotgun-t3',
    ]);
  });

  it('rejects non-contiguous weapon family tiers', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons = broken.weapons.filter((weapon) => weapon.id !== 'scrap-pistol-t2');

    expect(() => validateGameData(broken)).toThrow(/family "pistol" missing mergeTier 2/);
  });

  it('rejects catalogs that cannot build the default starter loadout', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons = broken.weapons.filter((weapon) => weapon.family !== 'shotgun');

    expect(() => validateGameData(broken)).toThrow(
      /missing required starter family "shotgun" at mergeTier 1/,
    );
  });

  it('rejects weapon merge tiers above max tier', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons[0].mergeTier = 4;

    expect(() => validateGameData(broken)).toThrow(/mergeTier: 4 exceeds maxTier 3/);
  });

  it('rejects invalid projectile count, pierce, and spread values', () => {
    const data = loadGameData();

    const badProjectileCount = structuredClone(data);
    badProjectileCount.weapons[0].projectileCount = 0;
    expect(() => validateGameData(badProjectileCount)).toThrow(
      /weapons\.json\[0\]\.projectileCount/,
    );

    const badPierce = structuredClone(data);
    badPierce.weapons[0].pierce = -1;
    expect(() => validateGameData(badPierce)).toThrow(/weapons\.json\[0\]\.pierce/);

    const badSpread = structuredClone(data);
    badSpread.weapons[0].spreadDeg = Number.NaN;
    expect(() => validateGameData(badSpread)).toThrow(/weapons\.json\[0\]\.spreadDeg/);
  });

  it('accepts an upgrade with a single valid effect', () => {
    const data = withFirstUpgradeEffects([{ stat: 'moveSpeed', op: 'mult', value: 1.1 }]);
    expect(() => validateGameData(data)).not.toThrow();
  });

  it('accepts attackSpeed as the canonical fire-cadence upgrade stat', () => {
    const cadenceStat: StatKey = 'attackSpeed';
    const data = withFirstUpgradeEffects([{ stat: cadenceStat, op: 'mult', value: 1.1 }]);

    expect(STAT_KEYS).toContain(cadenceStat);
    expect(() => validateGameData(data)).not.toThrow();
  });

  it('accepts an upgrade with multiple valid effects', () => {
    const data = withFirstUpgradeEffects([
      { stat: 'moveSpeed', op: 'mult', value: 1.1 },
      { stat: 'damage', op: 'add', value: 3 },
    ]);
    expect(() => validateGameData(data)).not.toThrow();
  });

  it('rejects missing or empty upgrade effects', () => {
    expect(() => validateGameData(withFirstUpgradeEffects([]))).toThrow(
      /upgrades\.json\[0\]\.effects/,
    );

    const missing = structuredClone(loadGameData());
    Reflect.deleteProperty(missing.upgrades[0], 'effects');
    expect(() => validateGameData(missing)).toThrow(/upgrades\.json\[0\]\.effects/);
  });

  it('rejects unknown effect stat keys', () => {
    expect(() =>
      validateGameData(withFirstUpgradeEffects([{ stat: 'bogus', op: 'mult', value: 1 }])),
    ).toThrow(/upgrades\.json\[0\]\.effects\[0\]\.stat/);
  });

  it('rejects fireRate as an unknown upgrade stat', () => {
    expect(() =>
      validateGameData(withFirstUpgradeEffects([{ stat: 'fireRate', op: 'mult', value: 1.1 }])),
    ).toThrow(/upgrades\.json\[0\]\.effects\[0\]\.stat: unknown stat key/);
  });

  it('rejects invalid effect operations', () => {
    expect(() =>
      validateGameData(withFirstUpgradeEffects([{ stat: 'damage', op: 'divide', value: 1 }])),
    ).toThrow(/upgrades\.json\[0\]\.effects\[0\]\.op/);
  });

  it('rejects non-finite and non-number effect values', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'x']) {
      expect(() =>
        validateGameData(withFirstUpgradeEffects([{ stat: 'damage', op: 'add', value }])),
      ).toThrow(/upgrades\.json\[0\]\.effects\[0\]\.value/);
    }
  });

  it('rejects malformed effect entries', () => {
    expect(() => validateGameData(withFirstUpgradeEffects([42]))).toThrow(
      /upgrades\.json\[0\]\.effects\[0\]: expected object/,
    );
  });

  it('rejects zero and negative stack limits', () => {
    const zero = structuredClone(loadGameData());
    zero.upgrades[0].maxStacks = 0;
    expect(() => validateGameData(zero)).toThrow(/upgrades\.json\[0\]\.maxStacks/);

    const negative = structuredClone(loadGameData());
    negative.upgrades[0].maxStacks = -1;
    expect(() => validateGameData(negative)).toThrow(/upgrades\.json\[0\]\.maxStacks/);
  });

  it('rejects duplicate upgrade ids', () => {
    const data = structuredClone(loadGameData());
    data.upgrades.push(structuredClone(data.upgrades[0]));
    expect(() => validateGameData(data)).toThrow(/duplicate id "quick-paws"/);
  });

  it('accepts the shipped upgrade pool as non-empty, global-scoped effects', () => {
    const data = loadGameData();

    expect(data.upgrades.length).toBeGreaterThan(0);
    for (const upgrade of data.upgrades) {
      expect(upgrade.effects.length).toBeGreaterThan(0);
      for (const effect of upgrade.effects) {
        expect(['add', 'mult']).toContain(effect.op);
        expect(Number.isFinite(effect.value)).toBe(true);
      }
      // Epic 3 modifiers are run-global; copy must never claim a single-weapon scope.
      expect(upgrade.description.toLowerCase()).toContain('this run');
      expect(upgrade.description.toLowerCase()).not.toMatch(/one\b.*weapon|single weapon/);
      expect(upgrade.description.toLowerCase()).not.toContain('coin');
    }
  });

  it('can collect row errors without throwing', () => {
    const errors = collectValidationErrors('example.json', [{ id: '' }, {}], (row) =>
      typeof row === 'object' && row !== null && 'id' in row ? [] : ['id: required string'],
    );

    expect(errors).toEqual(['example.json[1].id: required string']);
  });

  it('validates all six archetype branches through fixtures', () => {
    const enemies = [
      enemyFixture('chaser'),
      enemyFixture('charger'),
      enemyFixture('ranged'),
      enemyFixture('tank'),
      enemyFixture('boss'),
      enemyFixture('elite'),
    ];
    expect(() => validateGameData(withEnemies(enemies))).not.toThrow();
  });

  it('accepts unknown and fails closed for malformed roots and catalogs', () => {
    for (const raw of [null, [], 'data', 42]) {
      expect(() => validateGameData(raw)).toThrow(/expected object/);
    }

    const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
    data.enemies = {};
    expect(() => validateGameData(data)).toThrow(/enemies\.json: expected array/);

    const extraRoot = { ...structuredClone(loadGameData()), surprise: true };
    expect(() => validateGameData(extraRoot)).toThrow(/game-data\.surprise: unknown field/);
  });

  it('rejects sparse arrays, non-record rows, and non-JSON-safe values', () => {
    const sparse = structuredClone(loadGameData()) as unknown as MutableData;
    const sparseEnemies = new Array(2);
    sparseEnemies[0] = structuredClone(sparse.enemies[0]);
    (sparse as unknown as { enemies: unknown[] }).enemies = sparseEnemies;
    expect(() => validateGameData(sparse)).toThrow(/enemies\.json\[1\]: sparse array entry/);

    const scalarRow = structuredClone(loadGameData()) as unknown as { enemies: unknown[] };
    scalarRow.enemies[0] = 12;
    expect(() => validateGameData(scalarRow)).toThrow(/enemies\.json\[0\]\.row: expected object/);

    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n, new Date()]) {
      const unsafe = structuredClone(loadGameData()) as unknown as { enemies: Record<string, unknown>[] };
      unsafe.enemies[0].health = value;
      expect(() => validateGameData(unsafe)).toThrow(/enemies\.json\[0\]\.health/);
    }
  });

  it('rejects missing, unknown, irrelevant, and untrimmed enemy fields', () => {
    const missing = enemyFixture('chaser');
    delete missing.scrapValue;
    expect(() => validateGameData(withEnemies([missing, enemyFixture('charger'), enemyFixture('tank')]))).toThrow(/scrapValue/);

    expect(() => validateGameData(withEnemies([
      enemyFixture('chaser', { surprise: 1 }), enemyFixture('charger'), enemyFixture('tank'),
    ]))).toThrow(/surprise: unknown field/);

    expect(() => validateGameData(withEnemies([
      enemyFixture('chaser', { attack: {} }), enemyFixture('charger'), enemyFixture('tank'),
    ]))).toThrow(/attack: unknown field/);

    expect(() => validateGameData(withEnemies([
      enemyFixture('chaser', { id: ' chaser-fixture' }), enemyFixture('charger'), enemyFixture('tank'),
    ]))).toThrow(/required nonempty trimmed string/);
  });

  it('enforces direct enemy numeric, integer, contact, and shell rules', () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [enemyFixture('chaser', { health: 0 }), /health/],
      [enemyFixture('chaser', { damage: 0 }), /damage/],
      [enemyFixture('tank', { speed: 0 }), /speed/],
      [enemyFixture('chaser', { xpValue: 1.5 }), /xpValue/],
      [enemyFixture('chaser', { scrapValue: -1 }), /scrapValue/],
      [enemyFixture('chaser', { contactDamage: false }), /contactDamage/],
      [enemyFixture('ranged', { contactDamage: true }), /contactDamage/],
      [enemyFixture('boss', { contactDamage: true }), /contactDamage/],
      [enemyFixture('boss', { attack: {} }), /attack: unknown field/],
      [enemyFixture('ranged', { baseEnemyId: 'chaser-fixture' }), /baseEnemyId: unknown field/],
    ];
    for (const [candidate, pattern] of cases) {
      expect(() => validateGameData(withEnemies([
        candidate.archetype === 'chaser' ? candidate : enemyFixture('chaser'),
        candidate.archetype === 'charger' ? candidate : enemyFixture('charger'),
        candidate.archetype === 'tank' ? candidate : enemyFixture('tank'),
        ...(candidate.archetype === 'ranged' || candidate.archetype === 'boss' ? [candidate] : []),
      ]))).toThrow(pattern);
    }
  });

  it('enforces charger and ranged attack contracts', () => {
    const badChargers = [
      enemyFixture('charger', { attack: undefined }),
      enemyFixture('charger', { attack: { triggerRange: 0, telegraphMs: 1, dashSpeed: 100, dashDurationMs: 1, cooldownMs: 1 } }),
      enemyFixture('charger', { attack: { triggerRange: 1, telegraphMs: 1.5, dashSpeed: 100, dashDurationMs: 1, cooldownMs: 1 } }),
      enemyFixture('charger', { attack: { triggerRange: 1, telegraphMs: 1, dashSpeed: 50, dashDurationMs: 1, cooldownMs: 1 } }),
      enemyFixture('charger', { attack: { triggerRange: 1, telegraphMs: 1, dashSpeed: 100, dashDurationMs: 1, cooldownMs: 1, extra: 1 } }),
    ];
    for (const charger of badChargers) {
      expect(() => validateGameData(withEnemies([
        enemyFixture('chaser'), charger, enemyFixture('tank'),
      ]))).toThrow(/attack/);
    }

    for (const attack of [
      undefined,
      { range: 0, telegraphMs: 1, cooldownMs: 1 },
      { range: 1, telegraphMs: 0, cooldownMs: 1 },
      { range: 1, telegraphMs: 1, cooldownMs: 1.5 },
      { range: 1, telegraphMs: 1, cooldownMs: 1, extra: 1 },
    ]) {
      expect(() => validateGameData(withEnemies([
        enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank'),
        enemyFixture('ranged', { attack }),
      ]))).toThrow(/attack/);
    }
  });

  it('rejects invalid elite shapes and base references', () => {
    const direct = [enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank')];
    const cases = [
      enemyFixture('elite', { health: 20 }),
      enemyFixture('elite', { baseEnemyId: 'elite-fixture' }),
      enemyFixture('elite', { baseEnemyId: 'missing' }),
      enemyFixture('elite', { baseEnemyId: 'ranged-fixture' }),
      enemyFixture('elite', { baseEnemyId: 'boss-fixture' }),
    ];
    for (const elite of cases) {
      expect(() => validateGameData(withEnemies([
        ...direct, enemyFixture('ranged'), enemyFixture('boss'), elite,
      ]))).toThrow(/baseEnemyId|health: unknown field/);
    }

    const chainBase = enemyFixture('elite', { id: 'elite-base', baseEnemyId: 'chaser-fixture' });
    const chain = enemyFixture('elite', { baseEnemyId: 'elite-base' });
    expect(() => validateGameData(withEnemies([...direct, chainBase, chain]))).toThrow(/direct chaser, charger, or tank/);
  });

  it('enforces curve identity, duration, scaling, ordering, cadence, and cap constraints', () => {
    const mutateCurve = (mutate: (curve: Record<string, any>) => void): unknown => {
      const data = structuredClone(loadGameData()) as unknown as { spawnCurves: Record<string, any>[] };
      mutate(data.spawnCurves[0]);
      return data;
    };
    const cases: Array<[unknown, RegExp]> = [
      [mutateCurve((curve) => { curve.id = ' bad'; }), /id/],
      [mutateCurve((curve) => { curve.durationSeconds = 0; }), /durationSeconds/],
      [mutateCurve((curve) => { curve.durationSeconds = 3601; }), /durationSeconds/],
      [mutateCurve((curve) => { curve.scaling.healthPerMinute = 1.1; }), /healthPerMinute/],
      [mutateCurve((curve) => { curve.scaling.damagePerMinute = -0.1; }), /damagePerMinute/],
      [mutateCurve((curve) => { curve.scaling.extra = 1; }), /extra: unknown field/],
      [mutateCurve((curve) => { curve.waves[0].startSecond = 1; }), /first wave must start at 0/],
      [mutateCurve((curve) => { curve.waves[1].startSecond = 150; curve.waves[2].startSecond = 60; }), /nondecreasing/],
      [mutateCurve((curve) => { curve.waves[0].startSecond = -1; }), /startSecond/],
      [mutateCurve((curve) => { curve.waves[0].spawnEveryMs = 1.5; }), /spawnEveryMs/],
      [mutateCurve((curve) => { curve.waves[0].maxAlive = 257; }), /maxAlive/],
      [mutateCurve((curve) => { curve.waves[0].extra = 1; }), /extra: unknown field/],
      [mutateCurve((curve) => { curve.waves.push({ ...curve.waves[0] }); }), /duplicate layer/],
      [mutateCurve((curve) => { curve.waves.forEach((wave: Record<string, number>) => { wave.maxAlive = 100; }); }), /combined maxAlive 300 exceeds 256/],
      [mutateCurve((curve) => { curve.waves = [{ startSecond: 0, enemyId: 'dust-mite', spawnEveryMs: 300000, maxAlive: 1 }]; }), /first due spawn must be before curve end/],
    ];
    for (const [data, pattern] of cases) expect(() => validateGameData(data)).toThrow(pattern);
  });

  it('allows equal starts in JSON tie order and overlapping persistent layers', () => {
    const data = structuredClone(loadGameData());
    data.spawnCurves[0].waves[1].startSecond = 0;
    data.spawnCurves[0].waves[2].startSecond = 0;
    expect(() => validateGameData(data)).not.toThrow();
    expect(data.spawnCurves[0].waves.map((wave) => wave.enemyId)).toEqual([
      'dust-mite', 'junk-rusher', 'trash-brute',
    ]);
  });

  it('rejects duplicate curve ids and ranged, elite, or boss spawn references', () => {
    const duplicate = structuredClone(loadGameData());
    duplicate.spawnCurves.push(structuredClone(duplicate.spawnCurves[0]));
    expect(() => validateGameData(duplicate)).toThrow(/duplicate id "junkyard-intro"/);

    for (const archetype of ['ranged', 'elite', 'boss']) {
      const enemies = [
        enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank'),
        enemyFixture('ranged'), enemyFixture('boss'), enemyFixture('elite'),
      ];
      const data = withEnemies(enemies) as Record<string, any>;
      data.spawnCurves[0].waves[0].enemyId = `${archetype}-fixture`;
      expect(() => validateGameData(data)).toThrow(/must reference a direct chaser, charger, or tank/);
    }
  });
});
