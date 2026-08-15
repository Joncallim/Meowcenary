import { describe, expect, it } from 'vitest';
import { assembleRunRequest } from '../src/gameplay/runRequest';
import { loadGameData } from '../src/systems/validation';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';

describe('arena integration — headless resolution chain', () => {
  const data = loadGameData();
  const characters = new DataCharacterRegistry(data);
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);

  function makeContext() {
    return createGameContext({
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      arenas,
      metaUpgrades,
      characters,
      save: new SaveManager(new MemoryStorageAdapter(), 'arena-integration', metaUpgrades.maxLevels()),
    });
  }

  it('assembleRunRequest resolves arena from selection, not spawnCurves[0]', () => {
    const ctx = makeContext();
    const request = assembleRunRequest(ctx, createRng(42));
    expect(request.arenaId).toBe('junkyard-lot');
    expect(Object.isFrozen(request)).toBe(true);
    expect(Number.isSafeInteger(request.seed)).toBe(true);
  });

  it('selected arena resolves through the full chain', () => {
    const ctx = makeContext();
    const request = assembleRunRequest(ctx, createRng(42));

    const arena = ctx.arenas.arenaById(request.arenaId);
    expect(arena).toBeDefined();
    expect(arena!.size).toEqual({ width: 768, height: 1344 });
    expect(arena!.spawnCurveId).toBe('junkyard-intro');

    const curve = ctx.data.spawnCurves.find((c) => c.id === arena!.spawnCurveId);
    expect(curve).toBeDefined();
    expect(curve!.durationSeconds).toBe(300);
    expect(curve!.id).toBe('junkyard-intro');
  });

  it('ships the authored junkyard traversal and exact body-safe gate contract', () => {
    const ctx = makeContext();
    expect(ctx.selectedArenaId).toBe('junkyard-lot');

    const arena = ctx.arenas.arenaById(ctx.selectedArenaId)!;
    expect(arena.size).toEqual({ width: 768, height: 1344 });

    // Uses the existing spawn curve
    expect(arena.spawnCurveId).toBe('junkyard-intro');

    expect(arena.spawnRegions).toHaveLength(1);
    expect(arena.spawnRegions[0]).toEqual({
      kind: 'edge-lanes', inset: 20,
      lanes: [
        { side: 'top', offset: 160, width: 96 },
        { side: 'right', offset: 896, width: 96 },
        { side: 'bottom', offset: 512, width: 96 },
        { side: 'left', offset: 320, width: 96 },
      ],
    });

    expect(arena.obstacles.map((obstacle) => obstacle.id)).toEqual([
      'hanging-press', 'barrel-power-stack',
    ]);
    expect(arena.obstacles.every((obstacle) =>
      obstacle.x + obstacle.w <= 288 || obstacle.x >= 480 ||
      obstacle.y + obstacle.h <= 544 || obstacle.y >= 800,
    )).toBe(true);
    expect(arena.hazards).toHaveLength(0);
    expect(arena.visual.obstacleSkins).toHaveLength(2);
  });

  it('arena selection is session-transient, never persisted', () => {
    const ctx = makeContext();
    const saveData = ctx.saveData;
    ctx.selectArena('junkyard-lot', ctx.arenaSelectionRevision);
    // The saveData snapshot should not have changed (selection is in-memory only)
    expect(ctx.saveData).toBe(saveData);
  });
});
