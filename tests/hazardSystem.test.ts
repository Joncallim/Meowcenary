import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import { HazardSystem } from '../src/systems/HazardSystem';
import type { HazardDefinition } from '../src/systems/types';

function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    x: 100,
    y: 100,
    bodyRadius: 14,
    takeEnvironmentalDamage: vi.fn(),
    takeDamage: vi.fn(),
    ...overrides,
  };
}

const hazard: HazardDefinition = {
  id: 'acid-pool',
  kind: 'acid',
  x: 50, y: 50, w: 100, h: 100,
  damagePerSecond: 10,
};

describe('HazardSystem', () => {
  it('deals damage when player is inside a hazard', () => {
    const bus = createEventBus();
    const player = makePlayer({ x: 100, y: 100 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'active';
    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    const triggered = vi.fn();
    bus.on('hazard:triggered', triggered);

    // 1000ms at 10 dps = 10 damage
    system.update(1000);
    expect(player.takeEnvironmentalDamage).toHaveBeenCalledWith(10);
    expect(triggered).toHaveBeenCalledWith({
      hazardId: 'acid-pool',
      damage: 10,
      x: 100,
      y: 100,
    });
  });

  it('deals nothing when player is outside all hazards', () => {
    const bus = createEventBus();
    const player = makePlayer({ x: 0, y: 0 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    system.update(1000);
    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
  });

  it('is a no-op when hazards array is empty', () => {
    const bus = createEventBus();
    const player = makePlayer();
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [],
    });

    system.update(1000);
    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
  });

  it('stops applying after a lethal tick ends the run', () => {
    const bus = createEventBus();
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'active';

    const lethalHazard: HazardDefinition = { ...hazard, damagePerSecond: 1000 };
    const secondHazard: HazardDefinition = {
      id: 'fire-zone', kind: 'fire', x: 50, y: 50, w: 100, h: 100, damagePerSecond: 10,
    };

    const triggered = vi.fn();

    const player = makePlayer({
      x: 100,
      y: 100,
      takeEnvironmentalDamage: vi.fn().mockImplementation(() => {
        runState.status = 'lost';
      }),
    });

    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [lethalHazard, secondHazard],
    });

    bus.on('hazard:triggered', triggered);

    system.update(1000);
    expect(triggered).toHaveBeenCalledTimes(1);
    expect(triggered).toHaveBeenCalledWith(
      expect.objectContaining({ hazardId: 'acid-pool' }),
    );
  });

  it('is a no-op when the run is not active', () => {
    const bus = createEventBus();
    const player = makePlayer({ x: 100, y: 100 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'paused';

    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    system.update(1000);
    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
  });

  it('ignores non-finite or non-positive dtMs', () => {
    const bus = createEventBus();
    const player = makePlayer({ x: 100, y: 100 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });

    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    const triggered = vi.fn();
    bus.on('hazard:triggered', triggered);

    system.update(Number.NaN);
    system.update(-100);
    system.update(0);

    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
    expect(triggered).not.toHaveBeenCalled();
  });

  it('destroy is idempotent', () => {
    const bus = createEventBus();
    const player = makePlayer({ x: 100, y: 100 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });

    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    system.destroy();
    system.destroy();

    system.update(1000);
    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
  });
});