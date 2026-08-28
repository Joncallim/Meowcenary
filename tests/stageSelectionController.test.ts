import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext, type GameContext } from '../src/engine/context';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { SaveManager, MemoryStorageAdapter, createDefaultSaveV3 } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { StageSelectionController } from '../src/ui/stageSelectionController';

function createHarness(): { context: GameContext; controller: StageSelectionController } {
  const data = loadGameData();
  const context = createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    metaUpgrades: new DataMetaUpgradeRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'test', {}),
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    stages: new StageRegistry(data),
  });
  return { context, controller: new StageSelectionController(context) };
}

describe('StageSelectionController (Epic 20)', () => {
  it('lists all six stages in display order with unlocked/locked state', () => {
    const { controller } = createHarness();
    const snap = controller.snapshot();
    expect(snap.stages).toHaveLength(6);
    // Fresh save: only stage 1 (unlock-count 0) is unlocked
    expect(snap.stages[0].locked).toBe(false);
    expect(snap.stages[0].completed).toBe(false);
    for (let i = 1; i < snap.stages.length; i++) {
      expect(snap.stages[i].locked).toBe(true);
    }
  });

  it('selects only unlocked stages; rejects locked ones', () => {
    const { controller } = createHarness();
    expect(controller.select('stage:junkyard-01').ok).toBe(true);
    expect(controller.select('stage:junkyard-02').ok).toBe(false);
    expect(controller.select('does-not-exist').ok).toBe(false);
  });

  it('navigates to the next/previous unlocked stage only', () => {
    const { controller } = createHarness();
    // Only stage 1 unlocked → next/prev have nowhere to go
    expect(controller.selectNext().ok).toBe(false);
    expect(controller.selectPrevious().ok).toBe(false);
  });

  it('reflects completed stages and unlocks downstream stages', () => {
    const { context, controller } = createHarness();
    context.completeStage('stage:junkyard-01', 100_000);
    const snap = controller.snapshot();
    expect(snap.stages[0].completed).toBe(true);
    expect(snap.stages[1].locked).toBe(false);
    // Stage 2 now selectable
    expect(controller.select('stage:junkyard-02').ok).toBe(true);
  });

  it('keeps a frozen snapshot and bumps the revision on selection', () => {
    const { controller } = createHarness();
    const before = controller.snapshot();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.stages)).toBe(true);
    const after = controller.select('stage:junkyard-01');
    expect(after.snapshot.revision).toBeGreaterThan(before.revision);
    expect(after.snapshot.stages[0].selected).toBe(true);
  });

  it('persists stage completion through the Save V3 stages domain', () => {
    const { context } = createHarness();
    expect(context.saveData.stages).toEqual({});
    const saved = context.completeStage('stage:junkyard-01', 90_000);
    expect(saved).toBe(true);
    expect(context.saveData.stages['stage:junkyard-01']).toMatchObject({
      completed: true,
      bestTimeMs: 90_000,
    });
    // Best time is retained when a slower completion arrives
    context.completeStage('stage:junkyard-01', 120_000);
    expect(context.saveData.stages['stage:junkyard-01'].bestTimeMs).toBe(90_000);
  });

  it('rejects malformed stage facts before they can become live-only state', () => {
    const { context } = createHarness();
    expect(context.completeStage('stage:missing', 1)).toBe(false);
    expect(context.completeStage('stage:junkyard-01', Number.NaN)).toBe(false);
    expect(context.saveData.stages).toEqual({});
  });

  it('createDefaultSaveV3 has an empty stages domain (no fabricated progress)', () => {
    expect(createDefaultSaveV3().stages).toEqual({});
  });
});
