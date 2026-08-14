import { describe, expect, it } from 'vitest';
import type { Enemy as RuntimeEnemy } from '../src/entities/Enemy';
import { STAT_KEYS, type StatKey } from '../src/gameplay/stats';
import { RuntimeConfig } from '../src/engine/config';
import { resolveLoot } from '../src/gameplay/loot';
import { createRng } from '../src/engine/rng';
import { DataLootTableRegistry } from '../src/systems/lootTables';
import type { EnemyDefinition, GameData } from '../src/systems/types';
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
  data.arenas = [{
    id: 'fixture-arena',
    name: 'Fixture Arena',
    size: { width: 390, height: 844 },
    spawnCurveId: 'fixture-curve',
    spawnRegions: [{ kind: 'edges', margin: 28 }],
    obstacles: [],
    hazards: [],
    unlock: { type: 'default' },
  }];
  return data;
}

function withFirstUpgradeEffects(effects: unknown): ReturnType<typeof loadGameData> {
  const data = structuredClone(loadGameData());
  (data.upgrades[0] as unknown as { effects: unknown }).effects = effects;
  return data;
}

/** validateGameData output normalizes audio.map from the file wrapper
 *  ({ events: [...] }) to the AudioMapEntry[] contract; these helpers rebuild
 *  the raw input shape for clone-valid → mutate → assert-throws recipes. */
function audioInputShape(audio: { assets: unknown; map: readonly Record<string, unknown>[] }): Record<string, unknown> {
  return { assets: audio.assets, map: { events: [...audio.map] } };
}

function withAudioAssets(assets: unknown): unknown {
  const data = structuredClone(loadGameData()) as unknown as {
    audio: { assets: unknown; map: readonly Record<string, unknown>[] };
  };
  return { ...data, audio: audioInputShape({ assets, map: data.audio.map }) };
}

function withAudioMap(map: unknown): unknown {
  const data = structuredClone(loadGameData()) as unknown as {
    audio: { assets: unknown; map: readonly Record<string, unknown>[] };
  };
  return { ...data, audio: audioInputShape({ assets: data.audio.assets, map: map as readonly Record<string, unknown>[] }) };
}

type MutableAudio = {
  audio: {
    assets: { sfx: Array<Record<string, unknown>>; music: Array<Record<string, unknown>> };
    map: { events: Array<Record<string, unknown>> };
  };
};

function mutableAudio(): MutableAudio {
  const data = structuredClone(loadGameData()) as unknown as {
    audio: { assets: unknown; map: readonly Record<string, unknown>[] };
  };
  return { ...data, audio: audioInputShape(data.audio) } as unknown as MutableAudio;
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

  it('exposes elite through the default public union while legacy runtime stays direct-only', () => {
    const elite: Extract<EnemyDefinition, { archetype: 'elite' }> = {
      id: 'typed-elite',
      name: 'Typed Elite',
      archetype: 'elite',
      baseEnemyId: 'dust-mite',
    };
    const catalogEnemy: GameData['enemies'][number] = elite;
    expect(catalogEnemy.archetype).toBe('elite');

    // @ts-expect-error Unresolved elite shells cannot enter the legacy Phaser entity.
    const legacyRuntimeEnemy: ConstructorParameters<typeof RuntimeEnemy>[1] = elite;
    expect(legacyRuntimeEnemy.archetype).toBe('elite');
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

  it('requires positive XP for every directly spawnable archetype', () => {
    for (const archetype of ['chaser', 'charger', 'tank']) {
      const rows = [enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank')];
      const target = rows.find((row) => row.archetype === archetype);
      if (!target) throw new Error(`missing ${archetype} fixture`);
      target.xpValue = 0;
      expect(() => validateGameData(withEnemies(rows))).toThrow(new RegExp(`${archetype}-fixture.*|xpValue`));
    }

    expect(() => validateGameData(withEnemies([
      enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank'),
      enemyFixture('ranged', { xpValue: 0 }), enemyFixture('boss', { xpValue: 0 }),
    ]))).not.toThrow();
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

  it('uses one spawnability decision for curves and elite bases across all archetypes', () => {
    const archetypes = ['chaser', 'charger', 'ranged', 'tank', 'elite', 'boss'] as const;
    const spawnable = new Set(['chaser', 'charger', 'tank']);

    for (const archetype of archetypes) {
      const rows = archetypes.map((entry) => enemyFixture(entry));
      const candidateId = `${archetype}-fixture`;

      const curveData = withEnemies(rows) as Record<string, any>;
      curveData.spawnCurves[0].waves = [
        { startSecond: 0, enemyId: candidateId, spawnEveryMs: 1000, maxAlive: 1 },
      ];
      if (spawnable.has(archetype)) {
        expect(() => validateGameData(curveData)).not.toThrow();
      } else {
        expect(() => validateGameData(curveData)).toThrow(/direct chaser, charger, or tank/);
      }

      const eliteBaseRows = archetypes.map((entry) => enemyFixture(entry));
      const eliteRow = eliteBaseRows.find((row) => row.archetype === 'elite');
      if (!eliteRow) throw new Error('missing elite fixture');
      eliteRow.baseEnemyId = candidateId;
      const eliteData = withEnemies(eliteBaseRows);
      if (spawnable.has(archetype)) {
        expect(() => validateGameData(eliteData)).not.toThrow();
      } else {
        expect(() => validateGameData(eliteData)).toThrow(/baseEnemyId/);
      }
    }
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

  it('rejects prototype-inherited required fields at their exact paths', () => {
    const healthDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'health');
    const cooldownDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'cooldownMs');
    try {
      Object.defineProperty(Object.prototype, 'health', { value: 10, configurable: true });
      const missingHealth = structuredClone(loadGameData()) as unknown as { enemies: Record<string, unknown>[] };
      delete missingHealth.enemies[0].health;
      expect(() => validateGameData(missingHealth)).toThrow(/enemies\.json\[0\]\.health/);

      Object.defineProperty(Object.prototype, 'cooldownMs', { value: 1200, configurable: true });
      const inheritedTiming = structuredClone(loadGameData()) as unknown as {
        enemies: Array<{ attack?: Record<string, unknown> }>;
      };
      delete inheritedTiming.enemies[1].attack?.cooldownMs;
      expect(() => validateGameData(inheritedTiming)).toThrow(/enemies\.json\[1\]\.attack\.cooldownMs/);
    } finally {
      if (healthDescriptor) Object.defineProperty(Object.prototype, 'health', healthDescriptor);
      else Reflect.deleteProperty(Object.prototype, 'health');
      if (cooldownDescriptor) Object.defineProperty(Object.prototype, 'cooldownMs', cooldownDescriptor);
      else Reflect.deleteProperty(Object.prototype, 'cooldownMs');
    }
  });

  it('accepts the safe-integer boundary and rejects the first unsafe integer', () => {
    const accepted = structuredClone(loadGameData());
    if (accepted.enemies[0].archetype !== 'chaser') throw new Error('missing chaser');
    accepted.enemies[0].xpValue = Number.MAX_SAFE_INTEGER;
    if (accepted.enemies[1].archetype !== 'charger') throw new Error('missing charger');
    accepted.enemies[1].attack.cooldownMs = Number.MAX_SAFE_INTEGER;
    expect(() => validateGameData(accepted)).not.toThrow();

    const unsafeReward = structuredClone(loadGameData());
    if (unsafeReward.enemies[0].archetype !== 'chaser') throw new Error('missing chaser');
    unsafeReward.enemies[0].scrapValue = Number.MAX_SAFE_INTEGER + 1;
    expect(() => validateGameData(unsafeReward)).toThrow(/scrapValue/);

    const unsafeTiming = structuredClone(loadGameData());
    if (unsafeTiming.enemies[1].archetype !== 'charger') throw new Error('missing charger');
    unsafeTiming.enemies[1].attack.cooldownMs = Number.MAX_SAFE_INTEGER + 1;
    expect(() => validateGameData(unsafeTiming)).toThrow(/attack\.cooldownMs/);
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

  describe('character data validation', () => {
    function characterFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'test-cat',
        name: 'Test Cat',
        description: 'A test cat.',
        baseStats: { maxHealth: 100, moveSpeed: 175 },
        startingWeaponIds: ['scrap-pistol-t1'],
        passives: [],
        unlock: { type: 'default' as const },
        cosmeticSkinIds: [],
        ...overrides,
      };
    }

    function withCharacters(characters: Record<string, unknown>[]): unknown {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      data.characters = characters;
      return data;
    }

    it('validates shipped characters.json', () => {
      const data = loadGameData();
      expect(data.characters.length).toBeGreaterThan(0);
      expect(data.characters[0].id).toBe('scrap-tabby');
      expect(data.characters[1].id).toBe('bolt-hound');
    });

    it('requires the characters field', () => {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      delete data.characters;
      expect(() => validateGameData(data)).toThrow(/characters: required field/);
    });

    it('fails missing character fields with file, index, and field', () => {
      const data = structuredClone(loadGameData()) as unknown as { characters: Record<string, unknown>[] };
      delete data.characters[0].name;
      expect(() => validateGameData(data)).toThrow(/characters\.json\[0\]\.name/);
    });

    it('rejects unknown character fields', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ surprise: true }),
      ]))).toThrow(/surprise: unknown field/);
    });

    it('rejects bad character id', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ id: ' bad' }),
      ]))).toThrow(/id: invalid content id/);
      expect(() => validateGameData(withCharacters([
        characterFixture({ id: '' }),
      ]))).toThrow(/id: required nonempty trimmed string/);
    });

    it('rejects bad base stats', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ baseStats: { maxHealth: -1, moveSpeed: 100 } }),
      ]))).toThrow(/baseStats\.maxHealth/);
      expect(() => validateGameData(withCharacters([
        characterFixture({ baseStats: { maxHealth: 100, moveSpeed: 0 } }),
      ]))).toThrow(/baseStats\.moveSpeed/);
      expect(() => validateGameData(withCharacters([
        characterFixture({ baseStats: { maxHealth: 100, moveSpeed: 100, surprise: 1 } }),
      ]))).toThrow(/baseStats\.surprise: unknown field/);
    });

    it('rejects invalid starting weapon ids (length, duplicates, empty)', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ startingWeaponIds: [] }),
      ]))).toThrow(/startingWeaponIds: must have 1-6 entries/);

      expect(() => validateGameData(withCharacters([
        characterFixture({ startingWeaponIds: ['scrap-pistol-t1', 'scrap-pistol-t1'] }),
      ]))).toThrow(/duplicate weapon id/);

      expect(() => validateGameData(withCharacters([
        characterFixture({ startingWeaponIds: [''] }),
      ]))).toThrow(/startingWeaponIds\[0\]: required nonempty trimmed string/);
    });

    it('rejects unknown weapon id references', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ startingWeaponIds: ['nonexistent-weapon'] }),
      ]))).toThrow(/unknown weapon id/);
    });

    it('rejects bad unlock rules', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ unlock: { type: 'bogus' } }),
      ]))).toThrow(/unlock\.type: must be "default" or "meta"/);

      expect(() => validateGameData(withCharacters([
        characterFixture({ unlock: { type: 'meta' } }),
      ]))).toThrow(/unlock\.requiresUnlockId/);

      expect(() => validateGameData(withCharacters([
        characterFixture({ unlock: { type: 'meta', requiresUnlockId: 'bad' } }),
      ]))).toThrow(/unlock\.requiresUnlockId: invalid unlock id/);
    });

    it('rejects bad cosmetic skin ids', () => {
      expect(() => validateGameData(withCharacters([
        characterFixture({ cosmeticSkinIds: ['dupe', 'dupe'] }),
      ]))).toThrow(/cosmeticSkinIds\[1\]: duplicate skin id/);

      expect(() => validateGameData(withCharacters([
        characterFixture({ cosmeticSkinIds: [''] }),
      ]))).toThrow(/cosmeticSkinIds\[0\]: required nonempty trimmed string/);
    });

    it('validates static passives', () => {
      const withStaticPassive = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'scrap-hoarder',
            kind: 'static',
            name: 'Scrap Hoarder',
            description: 'Test passive.',
            effects: [{ stat: 'pickupRadius', op: 'add', value: 15 }],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withStaticPassive]))).not.toThrow();
    });

    it('rejects static passive with invalid effects', () => {
      const withBadEffect = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'test-passive',
            kind: 'static',
            name: 'Test',
            description: 'Test.',
            effects: [{ stat: 'bogus', op: 'add', value: 1 }],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withBadEffect])))
        .toThrow(/stat: unknown stat key/);
    });

    it('rejects static passive with empty effects', () => {
      const withEmptyEffects = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'test-passive',
            kind: 'static',
            name: 'Test',
            description: 'Test.',
            effects: [],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withEmptyEffects])))
        .toThrow(/effects: required non-empty array/);
    });

    it('rejects static passive with duplicate stat/op pairs', () => {
      const withDupEffect = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'test-passive',
            kind: 'static',
            name: 'Test',
            description: 'Test.',
            effects: [
              { stat: 'moveSpeed', op: 'mult', value: 1.1 },
              { stat: 'moveSpeed', op: 'mult', value: 1.2 },
            ],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withDupEffect])))
        .toThrow(/effects\[1\]: duplicate stat\/op pair/);
    });

    it('rejects duplicate passive id within one character', () => {
      const withDupPassive = characterFixture({
        passives: [
          {
            id: 'dup-passive',
            kind: 'static',
            name: 'First',
            description: 'A.',
            effects: [{ stat: 'moveSpeed', op: 'add', value: 10 }],
          },
          {
            id: 'dup-passive',
            kind: 'static',
            name: 'Second',
            description: 'B.',
            effects: [{ stat: 'damage', op: 'add', value: 5 }],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([withDupPassive])))
        .toThrow(/id: duplicate passive id/);
    });

    it('validates reactive passive shape', () => {
      const withReactive = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'reactive-one',
            kind: 'reactive',
            name: 'Reactive',
            description: 'Test.',
            event: 'enemy:killed',
            handlerId: 'test-handler',
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withReactive]))).not.toThrow();
    });

    it('rejects reactive passive with bad event', () => {
      const withBadEvent = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'test-passive',
            kind: 'reactive',
            name: 'Test',
            description: 'Test.',
            event: 'run:won',
            handlerId: 'test-handler',
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withBadEvent])))
        .toThrow(/event: must be one of/);
    });

    it('rejects unknown fields on reactive passives', () => {
      const withExtraField = characterFixture({
        id: 'test-cat-2',
        passives: [
          {
            id: 'test-passive',
            kind: 'reactive',
            name: 'Test',
            description: 'Test.',
            event: 'enemy:killed',
            handlerId: 'test-handler',
            effects: [],
          },
        ],
      });
      expect(() => validateGameData(withCharacters([characterFixture(), withExtraField])))
        .toThrow(/effects: unknown field/);
    });

    it('rejects catalog with no default character', () => {
      const noDefault = characterFixture({ id: 'fighter', unlock: { type: 'meta', requiresUnlockId: 'achievement:test' } });
      expect(() => validateGameData(withCharacters([noDefault])))
        .toThrow(/at least one character must have unlock\.type "default"/);
    });

    it('rejects duplicate character ids', () => {
      const dup = withCharacters([characterFixture(), characterFixture({ id: 'test-cat' })]);
      expect(() => validateGameData(dup)).toThrow(/duplicate id "test-cat"/);
    });

    it('rejects sparse arrays in nested character arrays', () => {
      const data = structuredClone(loadGameData()) as unknown as { characters: unknown[] };
      const sparsePassives = new Array(1);
      const char = characterFixture() as Record<string, unknown>;
      char.passives = sparsePassives;
      data.characters = [char, characterFixture({ id: 'test-cat-2' })];
      expect(() => validateGameData(data)).toThrow(/sparse array entry/);
    });

    it('rejects prototype-inherited base stats fields at their exact paths', () => {
      const maxHealthDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'maxHealth');
      try {
        Object.defineProperty(Object.prototype, 'maxHealth', { value: 100, configurable: true });
        const data = structuredClone(loadGameData()) as unknown as {
          characters: Array<{ id: string; name: string; description: string; baseStats: Record<string, unknown>; startingWeaponIds: string[]; passives: unknown[]; unlock: Record<string, unknown>; cosmeticSkinIds: string[] }>;
        };
        delete data.characters[0].baseStats.maxHealth;
        expect(() => validateGameData(data)).toThrow(/characters\.json\[0\]\.baseStats\.maxHealth/);
      } finally {
        if (maxHealthDescriptor) Object.defineProperty(Object.prototype, 'maxHealth', maxHealthDescriptor);
        else Reflect.deleteProperty(Object.prototype, 'maxHealth');
      }
    });
  });

  describe('arena validation', () => {
    function withArenas(arenas: Record<string, unknown>[]): unknown {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      data.arenas = arenas;
      return data;
    }

    function arenaFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'test-arena',
        name: 'Test Arena',
        size: { width: 400, height: 400 },
        spawnCurveId: 'junkyard-intro',
        spawnRegions: [{ kind: 'edges', margin: 28 }],
        obstacles: [],
        hazards: [],
        unlock: { type: 'default' },
        ...overrides,
      };
    }

    it('accepts the shipped arenas.json', () => {
      const data = loadGameData();
      expect(data.arenas.length).toBeGreaterThan(0);
      expect(data.arenas[0].id).toBe('junkyard-lot');
    });

    it('requires the arenas field', () => {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      delete data.arenas;
      expect(() => validateGameData(data)).toThrow(/arenas: required field/);
    });

    it('rejects empty spawnRegions', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({ spawnRegions: [] }),
      ]))).toThrow(/required array with at least one entry/);
    });

    it('rejects bad arena id', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({ id: '' }),
      ]))).toThrow(/required nonempty trimmed string/);
    });

    it('rejects bad size bounds', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({ size: { width: 10, height: 10 } }),
      ]))).toThrow(/required integer from 256/);
    });

    it('rejects a catalog with too many obstacles (bounds the witness scan)', () => {
      const tooMany = Array.from({ length: 257 }, (_, i) => ({ x: i, y: 0, w: 1, h: 1 }));
      expect(() => validateGameData(withArenas([
        arenaFixture({ obstacles: tooMany }),
      ]))).toThrow(/obstacles: too many entries \(max 256\)/);
    });

    it('rejects a catalog with too many spawn regions', () => {
      const tooMany = Array.from({ length: 17 }, () => ({ kind: 'edges', margin: 28 }));
      expect(() => validateGameData(withArenas([
        arenaFixture({ spawnRegions: tooMany }),
      ]))).toThrow(/spawnRegions: too many entries \(max 16\)/);
    });

    it('rejects a catalog with too many hazards', () => {
      const tooMany = Array.from({ length: 65 }, (_, i) => ({
        id: `haz-${i}`, kind: 'acid', x: 0, y: 0, w: 1, h: 1, damagePerSecond: 5,
      }));
      expect(() => validateGameData(withArenas([
        arenaFixture({ hazards: tooMany }),
      ]))).toThrow(/hazards: too many entries \(max 64\)/);
    });

    it('accepts rings with deterministic in-bounds witnesses', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({
          spawnRegions: [{ kind: 'ring', cx: 200, cy: 400, minRadius: 390, maxRadius: 400 }],
        }),
      ]))).not.toThrow();

      expect(() => validateGameData(withArenas([
        arenaFixture({
          spawnRegions: [{ kind: 'ring', cx: 0, cy: 0, minRadius: 500, maxRadius: 550 }],
        }),
      ]))).not.toThrow();
    });

    it('rejects a ring covered by an obstacle union with no witness', () => {
      const almostCoveringObstacles = [
        { x: 40, y: 40, w: 60, h: 120 },
        { x: 100, y: 40, w: 60, h: 59 },
        { x: 100, y: 101, w: 60, h: 59 },
        { x: 100, y: 99, w: 49, h: 2 },
      ];
      const ring = { kind: 'ring', cx: 100, cy: 100, minRadius: 50, maxRadius: 60 };

      expect(() => validateGameData(withArenas([
        arenaFixture({ spawnRegions: [ring], obstacles: almostCoveringObstacles }),
      ]))).not.toThrow();

      expect(() => validateGameData(withArenas([
        arenaFixture({
          spawnRegions: [ring],
          obstacles: [...almostCoveringObstacles, { x: 149, y: 99, w: 11, h: 2 }],
        }),
      ]))).toThrow(/ring region has no spawnable point/);
    });

    it('rejects unknown spawnCurveId', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({ spawnCurveId: 'nonexistent-curve' }),
      ]))).toThrow(/unknown spawnCurveId/);
    });

    it('rejects obstacle that contains arena centre', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({
          obstacles: [{ x: 0, y: 0, w: 400, h: 400 }],
        }),
      ]))).toThrow(/must not contain arena centre/);
    });

    it('rejects no default arena', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({
          id: 'locked-arena',
          unlock: { type: 'meta', requiresUnlockId: 'arena:locked' },
        }),
      ]))).toThrow(/at least one arena must have unlock\.type "default"/);
    });

    it('rejects duplicate arena ids', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture(), arenaFixture({ name: 'Duplicate' }),
      ]))).toThrow(/duplicate id/);
    });

    it('rejects bad hazard fields', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({
          hazards: [{ id: '', kind: 'acid', x: 0, y: 0, w: 100, h: 100, damagePerSecond: -1 }],
        }),
      ]))).toThrow(/damagePerSecond/);
    });

    it('rejects duplicate hazard ids within an arena', () => {
      const haz = { id: 'pool', kind: 'acid', x: 10, y: 10, w: 10, h: 10, damagePerSecond: 5 };
      expect(() => validateGameData(withArenas([
        arenaFixture({ hazards: [haz, haz] }),
      ]))).toThrow(/duplicate hazard id/);
    });

    it('rejects malformed unlock rule', () => {
      expect(() => validateGameData(withArenas([
        arenaFixture({ unlock: { type: 'bad' } }),
      ]))).toThrow(/must be "default" or "meta"/);
    });
  });

  describe('loot table data validation', () => {
    function lootTableFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'test-table',
        entries: [{ kind: 'xp', amount: 1, weight: 1 }],
        ...overrides,
      };
    }

    function withLootTables(tables: Record<string, unknown>[]): unknown {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      data.lootTables = tables;
      return data;
    }

    it('accepts the shipped loot-tables.json', () => {
      const data = loadGameData();
      expect(data.lootTables.length).toBe(3);
      expect(data.lootTables[0].id).toBe('chest-standard');
      expect(data.lootTables[1].id).toBe('brute-cache');
      expect(data.lootTables[2].id).toBe('weapon-world');
    });

    it('requires the lootTables field', () => {
      const data = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      delete data.lootTables;
      expect(() => validateGameData(data)).toThrow(/lootTables: required field/);
    });

    it('rejects bad loot table id', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ id: '' }),
      ]))).toThrow(/required nonempty trimmed string/);

      expect(() => validateGameData(withLootTables([
        lootTableFixture({ id: ' bad' }),
      ]))).toThrow(/id: invalid content id/);
    });

    it('rejects unknown fields', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ surprise: true }),
      ]))).toThrow(/surprise: unknown field/);

      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'xp', amount: 1, weight: 1, extra: 1 }] }),
      ]))).toThrow(/extra: unknown field/);
    });

    it('rejects bad kind', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'gold', amount: 0, weight: 1 }] }),
      ]))).toThrow(/kind: invalid value/);
    });

    it('rejects negative weight', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'xp', amount: 1, weight: -1 }] }),
      ]))).toThrow(/weight: required non-negative number/);
    });

    it('rejects zero total weight', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'xp', amount: 1, weight: 0 }] }),
      ]))).toThrow(/total weight must be greater than 0/);
    });

    it('requires xp/scrap amount >= 1', () => {
      for (const kind of ['xp', 'scrap']) {
        expect(() => validateGameData(withLootTables([
          lootTableFixture({ entries: [{ kind, amount: 0, weight: 1 }] }),
        ]))).toThrow(/amount: required positive integer/);
      }
    });

    it('requires chest/nothing amount === 0', () => {
      const chestEntry: Record<string, unknown> = { kind: 'chest', amount: 1, weight: 1, tableId: 'test-table' };
      const nothingEntry: Record<string, unknown> = { kind: 'nothing', amount: 1, weight: 1 };
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [chestEntry] }),
      ]))).toThrow(/amount: must be 0/);
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [nothingEntry] }),
      ]))).toThrow(/amount: must be 0/);
    });

    it('rejects chest without tableId', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'chest', amount: 0, weight: 1 }] }),
      ]))).toThrow(/tableId: required nonempty trimmed string/);
    });

    it('rejects tableId on non-chest entries', () => {
      for (const kind of ['xp', 'scrap', 'nothing']) {
        expect(() => validateGameData(withLootTables([
          lootTableFixture({ entries: [{ kind, amount: kind === 'nothing' ? 0 : 1, weight: 1, tableId: 'test-table' }] }),
        ]))).toThrow(/tableId: only chest entries may reference a table/);
      }
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1, definitionId: 'scrap-pistol-t1', tableId: 'test-table' }] }),
      ]))).toThrow(/tableId: only chest entries may reference a table/);
    });

    it('accepts a valid weapon entry', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1, definitionId: 'scrap-pistol-t1' }] }),
      ]))).not.toThrow();
    });

    it('rejects a weapon entry with an amount', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', amount: 1, weight: 1, definitionId: 'scrap-pistol-t1' }] }),
      ]))).toThrow(/amount: weapon entries must not define an amount/);
    });

    it('rejects a weapon entry with a missing or malformed definitionId', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1 }] }),
      ]))).toThrow(/definitionId: required nonempty trimmed string/);

      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1, definitionId: ' bad ' }] }),
      ]))).toThrow(/definitionId: required nonempty trimmed string/);

      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1, definitionId: 'Scrap_Pistol' }] }),
      ]))).toThrow(/definitionId: invalid content id/);
    });

    it('rejects definitionId on non-weapon entries', () => {
      for (const kind of ['xp', 'scrap', 'chest', 'nothing']) {
        expect(() => validateGameData(withLootTables([
          lootTableFixture({
            entries: [{
              kind,
              amount: kind === 'chest' || kind === 'nothing' ? 0 : 1,
              weight: 1,
              definitionId: 'scrap-pistol-t1',
              ...(kind === 'chest' ? { tableId: 'test-table' } : {}),
            }],
          }),
        ]))).toThrow(/definitionId: only weapon entries may define a definitionId/);
      }
    });

    it('rejects a weapon entry referencing an unknown weapon definition', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'weapon', weight: 1, definitionId: 'missing-weapon' }] }),
      ]))).toThrow(/definitionId: unknown weapon id "missing-weapon"/);
    });

    it('rejects unknown chest tableId', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: [{ kind: 'chest', amount: 0, weight: 1, tableId: 'missing' }] }),
      ]))).toThrow(/unknown table id/);
    });

    it('rejects chest-unsafe target (target containing chest entries)', () => {
      const selfReferencing: Record<string, unknown> = {
        id: 'chest-unsafe',
        entries: [{ kind: 'chest', amount: 0, weight: 1, tableId: 'chest-unsafe' }],
      };
      expect(() => validateGameData(withLootTables([
        lootTableFixture(),
        selfReferencing,
      ]))).toThrow(/not chest-safe/);
    });

    it('rejects duplicate loot table ids', () => {
      expect(() => validateGameData(withLootTables([
        lootTableFixture(), lootTableFixture({ id: 'test-table' }),
      ]))).toThrow(/duplicate id "test-table"/);
    });

    it('rejects too many loot tables', () => {
      const tooMany = Array.from({ length: 65 }, (_, index) => lootTableFixture({ id: `table-${index}` }));
      expect(() => validateGameData(withLootTables(tooMany))).toThrow(/too many entries \(max 64\)/);
    });

    it('rejects too many entries per table', () => {
      const tooMany = Array.from({ length: 33 }, () => ({ kind: 'xp', amount: 1, weight: 1 }));
      expect(() => validateGameData(withLootTables([
        lootTableFixture({ entries: tooMany }),
      ]))).toThrow(/entries: too many entries \(max 32\)/);
    });

    it('rejects unknown enemy lootTableId', () => {
      const data = structuredClone(loadGameData()) as unknown as { enemies: Record<string, unknown>[] };
      data.enemies[0].lootTableId = 'missing-table';
      expect(() => validateGameData(data)).toThrow(/unknown loot table id/);
    });

    it('rejects bad enemy lootTableId shape', () => {
      const data = structuredClone(loadGameData()) as unknown as { enemies: Record<string, unknown>[] };
      data.enemies[0].lootTableId = '';
      expect(() => validateGameData(data)).toThrow(/lootTableId: must be a non-empty trimmed string/);
    });

    it('rejects lootTableId on elite enemies', () => {
      const enemies = [
        enemyFixture('chaser'), enemyFixture('charger'), enemyFixture('tank'),
        enemyFixture('elite', { lootTableId: 'test-table' }),
      ];
      expect(() => validateGameData(withEnemies(enemies))).toThrow(/lootTableId: unknown field/);
    });

    it('allows optional lootTableId on direct enemies', () => {
      const data = structuredClone(loadGameData()) as unknown as { enemies: Record<string, unknown>[] };
      data.enemies[0].lootTableId = 'chest-standard';
      expect(() => validateGameData(data)).not.toThrow();
    });
  });

  describe('shipped weapon-world table (Epic 14 §5.3)', () => {
    const T1_IDS = ['scrap-pistol-t1', 'can-smg-t1', 'bolt-shotgun-t1'] as const;
    const T2_T3_IDS = ['scrap-pistol-t2', 'scrap-pistol-t3', 'can-smg-t2', 'can-smg-t3', 'bolt-shotgun-t2', 'bolt-shotgun-t3'];

    it('exists exactly once in the shipped catalog', () => {
      const tables = loadGameData().lootTables.filter((table) => table.id === 'weapon-world');
      expect(tables).toHaveLength(1);
    });

    it('contains only weapon entries with positive weights covering every current T1 definition', () => {
      const table = loadGameData().lootTables.find((candidate) => candidate.id === 'weapon-world');
      expect(table).toBeDefined();
      const ids = new Set(table?.entries.map((entry) => {
        expect(entry.kind).toBe('weapon');
        if (entry.kind !== 'weapon') throw new Error('unreachable');
        expect(entry.weight).toBeGreaterThan(0);
        return entry.definitionId;
      }));
      for (const id of T1_IDS) {
        expect(ids.has(id)).toBe(true);
      }
    });

    it('never contains a T2/T3 definition', () => {
      const table = loadGameData().lootTables.find((candidate) => candidate.id === 'weapon-world');
      const ids = new Set(table?.entries.map((entry) => (entry.kind === 'weapon' ? entry.definitionId : '')));
      for (const id of T2_T3_IDS) {
        expect(ids.has(id)).toBe(false);
      }
    });

    it('seeded weighted resolution returns only valid T1 definition ids', () => {
      const data = loadGameData();
      const lookup = new DataLootTableRegistry(data);
      for (const seed of [1, 7, 42, 2024, 14073]) {
        const grants = resolveLoot('weapon-world', lookup, createRng(seed));
        expect(grants).toHaveLength(1);
        const [grant] = grants;
        expect(grant).toBeDefined();
        if (grant.kind !== 'weapon') throw new Error('weapon-world must resolve a weapon grant');
        expect(T1_IDS).toContain(grant.definitionId);
      }
    });
  });

  describe('audio data validation', () => {
    it('validates the boot audio catalog and map', () => {
      const data = loadGameData();
      expect(data.audio.assets.sfx).toHaveLength(12);
      expect(data.audio.assets.music).toHaveLength(2);
      expect(data.audio.map).toHaveLength(12);
      expect(data.audio.assets.music.map((m) => m.key)).toEqual(
        expect.arrayContaining(['music-menu', 'music-run']),
      );
      expect(() => validateGameData(data)).not.toThrow();
    });

    it('pins player:damaged cooldown to the invulnerability window', () => {
      const entry = loadGameData().audio.map.find((e) => e.event === 'player:damaged');
      expect(entry?.cooldownMs).toBe(RuntimeConfig.gameplay.player.invulnerabilityMs);
    });

    it('rejects an unknown event key', () => {
      const data = mutableAudio();
      data.audio.map.events[0].event = 'bogus:event';
      expect(() => validateGameData(data)).toThrow(/audio-map\.json\[0\]\.event/);
    });

    it('rejects a settings:changed entry (manager-owned)', () => {
      const data = mutableAudio();
      data.audio.map.events[0].event = 'settings:changed';
      expect(() => validateGameData(data)).toThrow(/manager-owned/);
    });

    it('rejects unknown fields in the catalog and map records', () => {
      const data = mutableAudio();
      data.audio.assets.sfx[0].surprise = true;
      expect(() => validateGameData(data)).toThrow(/audio-assets\.json\[0\]\.surprise: unknown field/);

      const data2 = mutableAudio();
      data2.audio.map.events[0].surprise = true;
      expect(() => validateGameData(data2)).toThrow(/audio-map\.json\[0\]\.surprise: unknown field/);

      const data3 = mutableAudio();
      (data3.audio as unknown as Record<string, unknown>).surprise = true;
      expect(() => validateGameData(data3)).toThrow(/game-data\.audio\.surprise: unknown field/);

      const data4 = mutableAudio();
      (data4.audio.map as unknown as Record<string, unknown>).surprise = true;
      expect(() => validateGameData(data4)).toThrow(/audio-map\.json\.surprise: unknown field/);
    });

    it('rejects a map entry without any action', () => {
      const data = mutableAudio();
      delete data.audio.map.events[0].sfxKey;
      expect(() => validateGameData(data)).toThrow(/sfxKey or stopMusic/);
    });

    it('rejects musicFadeMs without stopMusic', () => {
      const data = mutableAudio();
      data.audio.map.events[0].musicFadeMs = 600;
      expect(() => validateGameData(data)).toThrow(/musicFadeMs: requires stopMusic: true/);
    });

    it('rejects non-positive and out-of-range numbers', () => {
      const zeroCooldown = mutableAudio();
      zeroCooldown.audio.map.events[0].cooldownMs = 0;
      expect(() => validateGameData(zeroCooldown)).toThrow(/cooldownMs/);

      const hugeCooldown = mutableAudio();
      hugeCooldown.audio.map.events[0].cooldownMs = 60_001;
      expect(() => validateGameData(hugeCooldown)).toThrow(/cooldownMs/);

      const zeroFade = mutableAudio();
      zeroFade.audio.map.events[0].stopMusic = true;
      zeroFade.audio.map.events[0].musicFadeMs = 0;
      expect(() => validateGameData(zeroFade)).toThrow(/musicFadeMs/);
    });

    it('rejects a duplicate event', () => {
      const data = mutableAudio();
      data.audio.map.events[1].event = 'weapon:fired';
      expect(() => validateGameData(data)).toThrow(/duplicate event "weapon:fired"/);
    });

    it('rejects a duplicate sfxKey', () => {
      const data = mutableAudio();
      data.audio.map.events[1].sfxKey = 'sfx-weapon-fired';
      expect(() => validateGameData(data)).toThrow(/duplicate sfxKey "sfx-weapon-fired"/);
    });

    it('rejects an sfxKey missing from audio-assets.json (cross-ref)', () => {
      const data = mutableAudio();
      data.audio.map.events[0].sfxKey = 'sfx-does-not-exist';
      expect(() => validateGameData(data)).toThrow(/unknown sfx key "sfx-does-not-exist"/);
    });

    it('rejects a url that violates the assets/audio/<key>.wav convention', () => {
      const data = mutableAudio();
      data.audio.assets.sfx[0].url = 'assets/audio/sfx-wrong.wav';
      expect(() => validateGameData(data)).toThrow(/url: must equal "assets\/audio\/<key>\.wav"/);
    });

    it('rejects a key with the wrong prefix', () => {
      const musicMisplaced = mutableAudio();
      musicMisplaced.audio.assets.music[0] = {
        key: 'sfx-menu',
        url: 'assets/audio/sfx-menu.wav',
      };
      expect(() => validateGameData(musicMisplaced)).toThrow(/prefixed "music-"/);

      const sfxMisplaced = mutableAudio();
      sfxMisplaced.audio.assets.sfx[0] = {
        key: 'music-run',
        url: 'assets/audio/music-run.wav',
      };
      expect(() => validateGameData(sfxMisplaced)).toThrow(/prefixed "sfx-"/);
    });

    it('rejects a missing required music key', () => {
      const noMenu = mutableAudio();
      noMenu.audio.assets.music = noMenu.audio.assets.music.filter((m) => m.key !== 'music-menu');
      expect(() => validateGameData(noMenu)).toThrow(/missing required music key "music-menu"/);

      const noRun = mutableAudio();
      noRun.audio.assets.music = noRun.audio.assets.music.filter((m) => m.key !== 'music-run');
      expect(() => validateGameData(noRun)).toThrow(/missing required music key "music-run"/);
    });

    it('rejects a missing or malformed audio root', () => {
      const missingAssets = mutableAudio();
      delete (missingAssets.audio as unknown as Record<string, unknown>).assets;
      expect(() => validateGameData(missingAssets)).toThrow(/audio-assets\.json: required field/);

      const missingMap = mutableAudio();
      delete (missingMap.audio as unknown as Record<string, unknown>).map;
      expect(() => validateGameData(missingMap)).toThrow(/audio-map\.json: required field/);

      const missingAudio = structuredClone(loadGameData()) as unknown as Record<string, unknown>;
      delete missingAudio.audio;
      expect(() => validateGameData(missingAudio)).toThrow(/game-data\.audio: required field/);

      const emptyWrapper = mutableAudio();
      (emptyWrapper.audio as unknown as Record<string, unknown>).map = {};
      expect(() => validateGameData(emptyWrapper)).toThrow(/audio-map\.json\.events: required field/);
    });

    it('rejects too many sfx entries', () => {
      const tooMany = Array.from({ length: 65 }, (_, index) => ({
        key: `sfx-bulk-${index}`,
        url: `assets/audio/sfx-bulk-${index}.wav`,
      }));
      expect(() => validateGameData(withAudioAssets({
        sfx: tooMany,
        music: loadGameData().audio.assets.music,
      }))).toThrow(/too many entries \(max 64\)/);
    });

    it('rejects too many map entries', () => {
      const tooMany = Array.from({ length: 65 }, () => ({
        event: 'ui:confirm',
        sfxKey: 'sfx-ui-confirm',
      }));
      expect(() => validateGameData(withAudioMap(tooMany))).toThrow(
        /audio-map\.json\.events: too many entries \(max 64\)/,
      );
    });
  });
});
