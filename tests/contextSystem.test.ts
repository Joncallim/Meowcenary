import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import type { System } from '../src/engine/system';
import {
  DEFAULT_SETTINGS,
  MemoryStorageAdapter,
  SaveManager,
} from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

describe('foundation seams', () => {
  it('can compose a GameContext without Phaser', () => {
    const save = new SaveManager(new MemoryStorageAdapter(), 'test-save');
    const ctx: GameContext = {
      bus: createEventBus(),
      rng: createRng(1),
      data: loadGameData(),
      save,
      settings: DEFAULT_SETTINGS,
    };

    expect(ctx.data.weapons.length).toBeGreaterThan(0);
    expect(ctx.rng.next()).toBeGreaterThanOrEqual(0);
  });

  it('defines the minimal System lifecycle', () => {
    const calls: number[] = [];
    const system: System = {
      update(dtMs) {
        calls.push(dtMs);
      },
      destroy() {
        calls.push(-1);
      },
    };

    system.update(16.67);
    system.destroy();

    expect(calls).toEqual([16.67, -1]);
  });
});

