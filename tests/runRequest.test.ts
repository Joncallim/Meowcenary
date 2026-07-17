import { describe, expect, it } from 'vitest';
import { createRunRequest, defaultArenaId } from '../src/gameplay/runRequest';
import { createRng } from '../src/engine/rng';
import { loadGameData } from '../src/systems/validation';

describe('runRequest', () => {
  it('freezes its result', () => {
    const rng = createRng(42);
    const request = createRunRequest({ characterId: 'scrap-tabby', arenaId: 'arena', rng });
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('derives seed via nextRunSeed from the provided RNG', () => {
    const rng1 = createRng(42);
    const seed1 = createRunRequest({ characterId: 'scrap-tabby', arenaId: 'arena', rng: rng1 }).seed;
    const rng2 = createRng(42);
    const seed2 = createRunRequest({ characterId: 'scrap-tabby', arenaId: 'arena', rng: rng2 }).seed;
    expect(seed1).toBe(seed2);
  });

  it('produces different seeds for different RNG states', () => {
    const rng = createRng(42);
    const seed1 = createRunRequest({ characterId: 'scrap-tabby', arenaId: 'arena', rng }).seed;
    const seed2 = createRunRequest({ characterId: 'scrap-tabby', arenaId: 'arena', rng }).seed;
    expect(seed1).not.toBe(seed2);
  });

  it('preserves characterId and arenaId in the frozen result', () => {
    const rng = createRng(42);
    const request = createRunRequest({ characterId: 'bolt-hound', arenaId: 'junkyard', rng });
    expect(request.characterId).toBe('bolt-hound');
    expect(request.arenaId).toBe('junkyard');
    expect(Number.isSafeInteger(request.seed)).toBe(true);
  });

  it('defaultArenaId matches the existing fallback expression', () => {
    const data = loadGameData();
    const ctx = { data };
    const existing = data.spawnCurves[0]?.id ?? 'arena';
    expect(defaultArenaId(ctx)).toBe(existing);
  });

  it('defaultArenaId returns "arena" when no spawn curves exist', () => {
    const ctx = { data: { spawnCurves: [] } };
    expect(defaultArenaId(ctx as any)).toBe('arena');
  });
});
