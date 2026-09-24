import { describe, expect, it } from 'vitest';
import { applyCard } from '../src/gameplay/upgrades';
import { prepareRun } from '../src/gameplay/runStart';
import { startRun } from '../src/gameplay/runState';
import { loadGameData } from '../src/systems/validation';

const data = loadGameData();

describe('ordered run preparation', () => {
  it('applies normalized character contributions before later cards', () => {
    const prepared = makePrepared();
    expect(prepared.run.status).toBe('intro');
    expect(prepared.basePlayer).toEqual({ maxHealth: 80, moveSpeed: 120 });
    expect(prepared.run.stats.countBySource('character:starter-meowcenary:agile')).toBe(1);
    expect(prepared.run.stats.resolve('maxHealth', prepared.basePlayer.maxHealth)).toBe(80);
    expect(prepared.run.stats.resolve('moveSpeed', prepared.basePlayer.moveSpeed)).toBe(132);
    expect(prepared.run.equipped).toEqual([{ instanceId: 'starter', defId: 'weapon', family: 'pistol', tier: 1 }]);
    startRun(prepared.run);
    expect(prepared.run.status).toBe('active');
    const card = data.upgrades[0]!;
    expect(applyCard(prepared.run, card)).toBe(true);
    expect(prepared.run.stats.countBySource(`card:${card.id}:1`)).toBe(card.effects.length);
  });

  it('a fresh run always applies cleanly', () => {
    const first = makePrepared();
    const before = first.run.stats.resolve('maxHealth', 80);
    const second = makePrepared();
    expect(second.run.stats.resolve('maxHealth', 80)).toBe(before);
  });

  it('rejects malformed character sources and unsafe base stats', () => {
    expect(() => makePrepared([{ stat: 'moveSpeed', op: 'mult', value: 1.1, sourceId: 'wrong' }]))
      .toThrow(/Invalid character modifier source/);
    expect(() => prepareRun({
      state: { seed: 1, characterId: 'cat', arenaId: 'arena' },
      basePlayer: { maxHealth: Number.NaN, moveSpeed: 100 },
      character: { baseStats: {}, passiveModifiers: [], startingWeapons: [] },
    })).toThrow(/positive finite/);
  });
});

function makePrepared(passiveModifiers = [{
  stat: 'moveSpeed' as const, op: 'mult' as const, value: 1.1,
  sourceId: 'character:starter-meowcenary:agile',
}]) {
  return prepareRun({
    state: { seed: 1, characterId: 'starter-meowcenary', arenaId: 'arena' },
    basePlayer: { maxHealth: 100, moveSpeed: 100 },
    character: {
      baseStats: { maxHealth: 80, moveSpeed: 120 }, passiveModifiers,
      startingWeapons: [{ instanceId: 'starter', defId: 'weapon', family: 'pistol', tier: 1 }],
    },
  });
}
