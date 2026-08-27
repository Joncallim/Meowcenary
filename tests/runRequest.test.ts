import { describe, expect, it } from 'vitest';
import { createRunRequest, assembleRunRequest } from '../src/gameplay/runRequest';
import { createRng } from '../src/engine/rng';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
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

  it('assembleRunRequest reads live selections', () => {
    const data = loadGameData();
    const characters = new DataCharacterRegistry(data);
    const arenas = new DataArenaRegistry(data);

    // Create minimal GameContext-style object for testing
    const ctx = {
      characters,
      arenas,
      selectedCharacterId: 'scrap-tabby',
      selectedArenaId: 'junkyard-lot',
      saveData: { progression: { unlocks: [] } as any },
      selectionRevision: 1,
      arenaSelectionRevision: 1,
    } as any;

    const rng = createRng(42);
    const request = assembleRunRequest(ctx, rng);
    expect(request.characterId).toBe('scrap-tabby');
    expect(request.arenaId).toBe('junkyard-lot');
    expect(Object.isFrozen(request)).toBe(true);
    expect(Number.isSafeInteger(request.seed)).toBe(true);
  });

  it('assembleRunRequest falls back to defaults when selection is locked', () => {
    const data = loadGameData();
    const characters = new DataCharacterRegistry(data);
    const arenas = new DataArenaRegistry(data);

    const ctx = {
      characters,
      arenas,
      selectedCharacterId: 'bolt-hound',
      selectedArenaId: 'unknown-arena',
      saveData: { progression: { unlocks: [] } as any },
    } as any;

    const rng = createRng(42);
    const request = assembleRunRequest(ctx, rng);
    expect(request.characterId).toBe('scrap-tabby');
    expect(request.arenaId).toBe('junkyard-lot');
    expect(Object.isFrozen(request)).toBe(true);
  });
});