import { describe, expect, it } from 'vitest';
import type { Rng } from '../src/engine/rng';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import { STAT_KEYS } from '../src/gameplay/stats';
import {
  applyCard,
  offerCards,
  UPGRADE_RARITY_WEIGHTS,
} from '../src/gameplay/upgrades';
import type { Rarity, UpgradeDefinition } from '../src/systems/types';

class ScriptedRng implements Rng {
  readonly weightedCalls: number[][] = [];

  constructor(private readonly indices: number[] = []) {}

  next(): number {
    throw new Error('offerCards must use Rng.weighted');
  }

  int(): number {
    throw new Error('offerCards must use Rng.weighted');
  }

  pick<T>(): T {
    throw new Error('offerCards must use Rng.weighted');
  }

  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T {
    this.weightedCalls.push(entries.map((entry) => entry.weight));
    const index = this.indices.shift() ?? 0;
    const selected = entries[index];
    if (!selected) {
      throw new Error(`Missing scripted weighted entry at index ${index}`);
    }
    return selected.item;
  }
}

function upgrade(
  id: string,
  overrides: Partial<UpgradeDefinition> = {},
): UpgradeDefinition {
  return {
    id,
    name: id,
    rarity: 'common',
    target: 'run',
    description: `${id} for this run.`,
    maxStacks: 3,
    effects: [{ stat: 'damage', op: 'add', value: 1 }],
    ...overrides,
  };
}

function createTestRun() {
  return createRunState({ seed: 7, characterId: 'starter', arenaId: 'arena' });
}

function resolvedStats(run: ReturnType<typeof createTestRun>): Record<string, number> {
  return Object.fromEntries(STAT_KEYS.map((stat) => [stat, run.stats.resolve(stat, 10)]));
}

describe('offerCards', () => {
  const definitions = [
    upgrade('common-a'),
    upgrade('common-b'),
    upgrade('uncommon', { rarity: 'uncommon' }),
    upgrade('rare', { rarity: 'rare' }),
    upgrade('epic', { rarity: 'epic' }),
    upgrade('legendary', { rarity: 'legendary' }),
  ];

  it('returns the same offer for the same RNG seed and state', () => {
    const first = offerCards(definitions, {}, createRng(1234)).map((card) => card.id);
    const second = offerCards(definitions, {}, createRng(1234)).map((card) => card.id);

    expect(first).toEqual(second);
  });

  it('allows different deterministic RNG evolution to produce a different valid offer', () => {
    const first = offerCards(definitions, {}, new ScriptedRng([0]), 1);
    const second = offerCards(definitions, {}, new ScriptedRng([1]), 1);

    expect(first.map((card) => card.id)).toEqual(['common-a']);
    expect(second.map((card) => card.id)).toEqual(['common-b']);
  });

  it('excludes maxed cards and treats missing stack entries as zero', () => {
    const cards = [upgrade('maxed', { maxStacks: 2 }), upgrade('missing')];

    expect(offerCards(cards, { maxed: 2 }, new ScriptedRng(), 3).map((card) => card.id)).toEqual([
      'missing',
    ]);
  });

  it('draws weighted definitions without replacement', () => {
    const cards = [
      upgrade('common'),
      upgrade('uncommon', { rarity: 'uncommon' }),
      upgrade('rare', { rarity: 'rare' }),
    ];
    const rng = new ScriptedRng([1, 1, 0]);

    const offer = offerCards(cards, {}, rng, 3);

    expect(offer.map((card) => card.id)).toEqual(['uncommon', 'rare', 'common']);
    expect(new Set(offer.map((card) => card.id)).size).toBe(3);
    expect(rng.weightedCalls).toEqual([
      [100, 60, 30],
      [100, 30],
      [100],
    ]);
  });

  it('returns fewer cards only when the eligible pool is smaller', () => {
    const offer = offerCards([upgrade('a'), upgrade('b')], {}, new ScriptedRng(), 3);

    expect(offer.map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty pool or non-positive/non-finite count', () => {
    expect(offerCards([], {}, new ScriptedRng())).toEqual([]);
    expect(offerCards(definitions, {}, new ScriptedRng(), 0)).toEqual([]);
    expect(offerCards(definitions, {}, new ScriptedRng(), -1)).toEqual([]);
    expect(offerCards(definitions, {}, new ScriptedRng(), Number.NaN)).toEqual([]);
    expect(offerCards(definitions, {}, new ScriptedRng(), Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('does not mutate definitions, effect arrays, or stack input', () => {
    const effects = Object.freeze([{ stat: 'damage', op: 'add', value: 2 }] as const);
    const first = Object.freeze(
      upgrade('frozen', { effects: effects as unknown as UpgradeDefinition['effects'] }),
    );
    const second = Object.freeze(upgrade('other'));
    const cards = Object.freeze([first, second]);
    const stacks = Object.freeze({ frozen: 1 });
    const cardsBefore = structuredClone(cards);
    const stacksBefore = structuredClone(stacks);

    expect(() => offerCards(cards, stacks, new ScriptedRng(), 2)).not.toThrow();
    expect(cards).toEqual(cardsBefore);
    expect(effects).toEqual(cardsBefore[0].effects);
    expect(stacks).toEqual(stacksBefore);
  });

  it('rejects an invalid total before invoking Rng.weighted', () => {
    const rng = new ScriptedRng();
    const invalid = upgrade('invalid-rarity', { rarity: 'unknown' as Rarity });

    expect(() => offerCards([invalid], {}, rng)).toThrow(/positive finite total rarity weight/);
    expect(rng.weightedCalls).toEqual([]);
  });

  it.each([
    ['the same definition reference', (card: UpgradeDefinition) => [card, card]],
    ['distinct definitions with one id', (card: UpgradeDefinition) => [card, { ...card }]],
  ])('rejects duplicate IDs from %s before consuming RNG', (_name, duplicateCards) => {
    const rng = new ScriptedRng();
    const card = upgrade('duplicate');

    expect(() => offerCards(duplicateCards(card), {}, rng, 2)).toThrow(/duplicate "duplicate"/);
    expect(rng.weightedCalls).toEqual([]);
  });

  it('exports the complete fixed positive finite rarity table', () => {
    expect(UPGRADE_RARITY_WEIGHTS).toEqual({
      common: 100,
      uncommon: 60,
      rare: 30,
      epic: 10,
      legendary: 3,
    });
    expect(Object.keys(UPGRADE_RARITY_WEIGHTS).sort()).toEqual(
      ['common', 'uncommon', 'rare', 'epic', 'legendary'].sort(),
    );
    expect(Object.values(UPGRADE_RARITY_WEIGHTS).every((weight) => Number.isFinite(weight) && weight > 0)).toBe(
      true,
    );
  });

  it('uses only the injected weighted RNG contract', () => {
    const rng = new ScriptedRng([2]);

    expect(offerCards(definitions, {}, rng, 1)[0]).toBe(definitions[2]);
    expect(rng.weightedCalls).toHaveLength(1);
  });
});

describe('applyCard', () => {
  it('applies a valid one-effect card and creates stack one', () => {
    const run = createTestRun();
    const card = upgrade('quick-paws', {
      effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.1 }],
    });

    expect(applyCard(run, card)).toBe(true);
    expect(run.upgradeStacks).toEqual({ 'quick-paws': 1 });
    expect(run.stats.resolve('moveSpeed', 100)).toBeCloseTo(110);
    expect(run.stats.countBySource('card:quick-paws:1')).toBe(1);
  });

  it('applies every effect from one selection under one source and one selected stack', () => {
    const run = createTestRun();
    const card = upgrade('multi', {
      effects: [
        { stat: 'damage', op: 'add', value: 3 },
        { stat: 'attackSpeed', op: 'mult', value: 1.2 },
        { stat: 'projectileCount', op: 'add', value: 1 },
      ],
    });

    expect(applyCard(run, card)).toBe(true);
    expect(run.upgradeStacks.multi).toBe(1);
    expect(run.stats.resolve('damage', 10)).toBe(13);
    expect(run.stats.resolve('attackSpeed', 1)).toBe(1.2);
    expect(run.stats.resolve('projectileCount', 1)).toBe(2);
    expect(run.stats.countBySource('card:multi:1')).toBe(3);
  });

  it('uses successive source IDs and increments exactly once per selection', () => {
    const run = createTestRun();
    const card = upgrade('repeat', {
      effects: [
        { stat: 'damage', op: 'add', value: 2 },
        { stat: 'range', op: 'mult', value: 1.1 },
      ],
    });

    expect(applyCard(run, card)).toBe(true);
    expect(applyCard(run, card)).toBe(true);

    expect(run.upgradeStacks.repeat).toBe(2);
    expect(run.stats.countBySource('card:repeat:1')).toBe(2);
    expect(run.stats.countBySource('card:repeat:2')).toBe(2);
    expect(run.stats.resolve('damage', 10)).toBe(14);
  });

  it('treats a missing stack as zero and rejects a maxed card', () => {
    const run = createTestRun();
    const card = upgrade('limited', { maxStacks: 1 });

    expect(applyCard(run, card)).toBe(true);
    const statsAfterFirst = resolvedStats(run);
    const stacksAfterFirst = structuredClone(run.upgradeStacks);

    expect(applyCard(run, card)).toBe(false);
    expect(run.upgradeStacks).toEqual(stacksAfterFirst);
    expect(resolvedStats(run)).toEqual(statsAfterFirst);
  });

  it.each([
    ['empty id', upgrade('', {})],
    ['whitespace-only id', upgrade('   ', {})],
    ['zero maxStacks', upgrade('bad', { maxStacks: 0 })],
    ['negative maxStacks', upgrade('bad', { maxStacks: -1 })],
    ['fractional maxStacks', upgrade('bad', { maxStacks: 1.5 })],
    ['NaN maxStacks', upgrade('bad', { maxStacks: Number.NaN })],
    ['infinite maxStacks', upgrade('bad', { maxStacks: Number.POSITIVE_INFINITY })],
    ['empty effects', upgrade('bad', { effects: [] })],
    [
      'missing effects',
      { ...upgrade('bad'), effects: undefined } as unknown as UpgradeDefinition,
    ],
    [
      'unknown stat',
      upgrade('bad', {
        effects: [
          { stat: 'unknown', op: 'add', value: 1 },
        ] as unknown as UpgradeDefinition['effects'],
      }),
    ],
    [
      'invalid operation',
      upgrade('bad', {
        effects: [
          { stat: 'damage', op: 'divide', value: 1 },
        ] as unknown as UpgradeDefinition['effects'],
      }),
    ],
    ['NaN value', upgrade('bad', { effects: [{ stat: 'damage', op: 'add', value: Number.NaN }] })],
    [
      'positive infinity value',
      upgrade('bad', {
        effects: [{ stat: 'damage', op: 'add', value: Number.POSITIVE_INFINITY }],
      }),
    ],
    [
      'negative infinity value',
      upgrade('bad', {
        effects: [{ stat: 'damage', op: 'add', value: Number.NEGATIVE_INFINITY }],
      }),
    ],
    [
      'malformed effect',
      upgrade('bad', { effects: [null] as unknown as UpgradeDefinition['effects'] }),
    ],
  ])('rejects %s without mutating stacks or modifiers', (_name, card) => {
    const run = createTestRun();
    run.stats.add({ stat: 'damage', op: 'add', value: 4, sourceId: 'baseline' });
    const stacksBefore = structuredClone(run.upgradeStacks);
    const statsBefore = resolvedStats(run);

    expect(applyCard(run, card)).toBe(false);
    expect(run.upgradeStacks).toEqual(stacksBefore);
    expect(resolvedStats(run)).toEqual(statsBefore);
    expect(run.stats.countBySource('baseline')).toBe(1);
    expect(run.stats.countBySource('card:bad:1')).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, '1', undefined])(
    'rejects invalid existing stack state %s without mutation',
    (stack) => {
      const run = createTestRun();
      const card = upgrade('bad-stack');
      (run.upgradeStacks as Record<string, unknown>)['bad-stack'] = stack;
      const stacksBefore = { ...run.upgradeStacks };
      const statsBefore = resolvedStats(run);

      expect(applyCard(run, card)).toBe(false);
      expect(run.upgradeStacks).toEqual(stacksBefore);
      expect(resolvedStats(run)).toEqual(statsBefore);
      expect(run.stats.countBySource('card:bad-stack:1')).toBe(0);
    },
  );

  it('preflights every effect so a later invalid effect cannot partially apply', () => {
    const run = createTestRun();
    const card = upgrade('partial', {
      effects: [
        { stat: 'damage', op: 'add', value: 99 },
        { stat: 'range', op: 'invalid', value: 2 },
      ] as unknown as UpgradeDefinition['effects'],
    });
    const statsBefore = resolvedStats(run);

    expect(applyCard(run, card)).toBe(false);
    expect(run.upgradeStacks).toEqual({});
    expect(resolvedStats(run)).toEqual(statsBefore);
    expect(run.stats.countBySource('card:partial:1')).toBe(0);
  });

  it('rolls back modifiers when the stack record rejects the commit', () => {
    const run = createTestRun();
    Object.freeze(run.upgradeStacks);
    const statsBefore = resolvedStats(run);
    let result: boolean | undefined;

    expect(() => {
      result = applyCard(run, upgrade('frozen-stack'));
    }).not.toThrow();
    expect(result).toBe(false);
    expect(run.upgradeStacks).toEqual({});
    expect(resolvedStats(run)).toEqual(statsBefore);
    expect(run.stats.countBySource('card:frozen-stack:1')).toBe(0);
  });

  it('rejects throwing definition getters without mutation', () => {
    const run = createTestRun();
    const card = Object.defineProperty(upgrade('throwing-getter'), 'effects', {
      get() {
        throw new Error('getter failed');
      },
    });
    const statsBefore = resolvedStats(run);
    let result: boolean | undefined;

    expect(() => {
      result = applyCard(run, card);
    }).not.toThrow();
    expect(result).toBe(false);
    expect(run.upgradeStacks).toEqual({});
    expect(resolvedStats(run)).toEqual(statsBefore);
    expect(run.stats.countBySource('card:throwing-getter:1')).toBe(0);
  });

  it('rejects a pre-existing derived source without treating modifier count as stack count', () => {
    const run = createTestRun();
    const sourceId = 'card:collision:1';
    run.stats.add({ stat: 'damage', op: 'add', value: 5, sourceId });
    const statsBefore = resolvedStats(run);

    expect(applyCard(run, upgrade('collision'))).toBe(false);
    expect(run.upgradeStacks).toEqual({});
    expect(resolvedStats(run)).toEqual(statsBefore);
    expect(run.stats.countBySource(sourceId)).toBe(1);
  });

  it('does not mutate the input definition or effect array', () => {
    const run = createTestRun();
    const effects = Object.freeze([
      Object.freeze({ stat: 'damage', op: 'add', value: 2 }),
      Object.freeze({ stat: 'range', op: 'mult', value: 1.1 }),
    ] as const);
    const card = Object.freeze(
      upgrade('frozen', { effects: effects as unknown as UpgradeDefinition['effects'] }),
    );
    const before = structuredClone(card);

    expect(applyCard(run, card)).toBe(true);
    expect(card).toEqual(before);
    expect(effects).toEqual(before.effects);
  });
});
