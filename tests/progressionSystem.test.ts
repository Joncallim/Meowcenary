import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';

describe('ProgressionSystem terminal lifecycle', () => {
  it.each(['won', 'lost'] as const)('cannot persist a %s run through the retired compatibility shell', (status) => {
    const bus = createEventBus();
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = status; run.currency = 12.9;
    const system = new ProgressionSystem({ runState: run, bus, context: {} as never });
    bus.emit(status === 'won' ? 'run:won' : 'run:lost', { timeMs: 0, level: 1, kills: 0 });
    bus.emit('run:won', { timeMs: 0, level: 1, kills: 0 });
    bus.emit('run:lost', { timeMs: 0, level: 1, kills: 0 });
    expect(system.hasBanked).toBe(false);
    expect(system.lastBankedRun).toBeNull();
    expect(system.bankFinishedRun()).toBeNull();
  });

  it('is a safe, idempotent no-op after destruction', () => {
    const bus = createEventBus();
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    const system = new ProgressionSystem({ runState: run, bus, context: {} as never });
    system.destroy(); system.destroy(); system.update(0);
    expect(system.bankFinishedRun()).toBeNull();
  });
});
