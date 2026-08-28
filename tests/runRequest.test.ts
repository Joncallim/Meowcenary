import { describe, expect, it } from 'vitest';
import { createRunRequest, createStageRunRequest, asLegacyComposedRunRequest, assembleComposedRunRequest, assembleRunRequest } from '../src/gameplay/runRequest';
import { createRng } from '../src/engine/rng';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { StageRegistry } from '../src/systems/stageRegistry';
import { loadGameData } from '../src/systems/validation';

describe('runRequest', () => {
  it('makes stage and legacy composition mutually explicit', () => {
    const rng = createRng(1);
    const stage = createStageRunRequest({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', rng });
    const legacy = asLegacyComposedRunRequest(createRunRequest({ characterId: 'scrap-tabby', arenaId: 'junkyard-lot', rng }));
    expect(stage).toMatchObject({ kind: 'stage', stageId: 'stage:junkyard-01' });
    expect(legacy).toMatchObject({ kind: 'legacy-arena', arenaId: 'junkyard-lot' });
  });
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
      saveData: { progression: { unlocks: [] } as any, stages: { 'stage:junkyard-01': { completed: true } }, achievements: {}, characters: {}, bosses: {} },
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
      saveData: { progression: { unlocks: [] } as any, stages: { 'stage:junkyard-01': { completed: true } }, achievements: {}, characters: {}, bosses: {} },
    } as any;

    const rng = createRng(42);
    const request = assembleRunRequest(ctx, rng);
    expect(request.characterId).toBe('scrap-tabby');
    expect(request.arenaId).toBe('junkyard-lot');
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('makes the selected stage the normal composed request without translating it through an arena', () => {
    const data = loadGameData();
    const ctx = {
      characters: new DataCharacterRegistry(data),
      arenas: new DataArenaRegistry(data),
      stages: new StageRegistry(data),
      selectedCharacterId: 'scrap-tabby',
      selectedArenaId: 'junkyard-lot',
      selectedStageId: 'stage:junkyard-02',
      saveData: { progression: { unlocks: [] } as any, stages: { 'stage:junkyard-01': { completed: true } }, achievements: {}, characters: {}, bosses: {} },
    } as any;
    expect(assembleComposedRunRequest(ctx, createRng(7))).toMatchObject({
      kind: 'stage', characterId: 'scrap-tabby', stageId: 'stage:junkyard-02',
    });
  });

  it('repairs a stale stage selection to the stage default rather than silently composing a legacy arena', () => {
    const data = loadGameData();
    const ctx = {
      characters: new DataCharacterRegistry(data),
      arenas: new DataArenaRegistry(data),
      stages: new StageRegistry(data),
      selectedCharacterId: 'scrap-tabby',
      selectedArenaId: 'junkyard-lot',
      selectedStageId: 'stage:removed-by-content-update',
      saveData: { progression: { unlocks: [] } as any },
    } as any;

    expect(assembleComposedRunRequest(ctx, createRng(7))).toMatchObject({
      kind: 'stage', stageId: 'stage:junkyard-01',
    });
  });

  it('repairs a selected locked stage to the first unlocked stage at the runtime boundary', () => {
    const data = loadGameData();
    const ctx = {
      characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data), stages: new StageRegistry(data),
      selectedCharacterId: 'scrap-tabby', selectedArenaId: 'junkyard-lot', selectedStageId: 'stage:junkyard-02',
      saveData: { progression: { unlocks: [] }, stages: {}, achievements: {}, characters: {}, bosses: {} },
    } as any;
    expect(assembleComposedRunRequest(ctx, createRng(7))).toMatchObject({ kind: 'stage', stageId: 'stage:junkyard-01' });
  });
});
