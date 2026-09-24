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
  it('tiles the authoritative hazard skin across the exact gameplay rectangle', () => {
    const tileSprite = {
      setDepth: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    const rectangle = vi.fn();
    const scene = {
      add: { tileSprite: vi.fn(() => tileSprite), rectangle },
      textures: { exists: vi.fn(() => true) },
    };
    const visualArt = {
      all: vi.fn(() => []),
      bindingById: vi.fn(() => ({
        id: 'world:forge-hazard:heat-grate', kind: 'world', required: true,
        textureKey: 'art-world-forge', frameKey: 'world:forge-hazard:heat-grate',
        url: 'assets/world/forge/forge-world-atlas.png', sampling: 'nearest',
        load: { type: 'atlas', imageUrl: 'assets/world/forge/forge-world-atlas.png', dataUrl: 'assets/world/forge/forge-world-atlas.json' },
        display: { width: 32, height: 32 },
      })),
    };
    const system = new HazardSystem({
      scene: scene as never,
      runState: createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' }),
      bus: createEventBus(),
      player: makePlayer() as never,
      hazards: [hazard],
      hazardSkins: [{ hazardId: 'acid-pool', artId: 'world:forge-hazard:heat-grate' }],
      visualArt: visualArt as never,
    });

    expect(scene.add.tileSprite).toHaveBeenCalledWith(
      100, 100, 100, 100, 'art-world-forge', 'world:forge-hazard:heat-grate',
    );
    expect(tileSprite.setDepth).toHaveBeenCalledWith(-3);
    expect(rectangle).not.toHaveBeenCalled();
    system.destroy();
    expect(tileSprite.destroy).toHaveBeenCalledOnce();
  });

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

  it('deals nothing when the player body is just outside a hazard corner', () => {
    const bus = createEventBus();
    // Hazard corner is (50,50). Centre (40,40) is sqrt(10^2+10^2)=14.14px away —
    // outside the r=14 body circle, but INSIDE an r-expanded bounding box. This
    // only stays a no-op under a true circle-rect test; a bounding-box regression
    // would wrongly damage here.
    const player = makePlayer({ x: 40, y: 40 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'active';
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

  it('deals damage when the player body overlaps a hazard corner', () => {
    const bus = createEventBus();
    // Centre (41,41) is sqrt(9^2+9^2)=12.73px from the (50,50) corner — inside the
    // r=14 body circle, so the corner overlap must register as damage.
    const player = makePlayer({ x: 41, y: 41 });
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'active';
    const system = new HazardSystem({
      scene: {} as never,
      runState,
      bus,
      player: player as never,
      hazards: [hazard],
    });

    system.update(1000);
    expect(player.takeEnvironmentalDamage).toHaveBeenCalledWith(10);
  });

  it('is a no-op when hazards array is empty', () => {
    const bus = createEventBus();
    const player = makePlayer();
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.status = 'active';
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
    // Active run + player inside the hazard: the ONLY reason nothing happens below
    // is the bad dtMs. Without this the status guard would mask a missing dtMs/damage
    // guard, so the test would pass even against broken code.
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

    system.update(Number.NaN);
    system.update(-100);
    system.update(0);

    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
    expect(triggered).not.toHaveBeenCalled();

    // Positive control: the fixture is otherwise live — a valid tick DOES apply
    // damage and emit exactly once, so the no-ops above are attributable to dtMs.
    system.update(1000);
    expect(player.takeEnvironmentalDamage).toHaveBeenCalledTimes(1);
    expect(triggered).toHaveBeenCalledTimes(1);
  });

  it('destroy is idempotent', () => {
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

    system.destroy();
    system.destroy();

    system.update(1000);
    expect(player.takeEnvironmentalDamage).not.toHaveBeenCalled();
  });
});
