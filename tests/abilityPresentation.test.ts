import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { AbilityPresentationSystem } from '../src/systems/abilityPresentation';

function harness() {
  const strokeCircle = vi.fn();
  const lineBetween = vi.fn();
  const strokeTriangle = vi.fn();
  const graphics = {
    setDepth: () => graphics,
    clear: vi.fn(),
    lineStyle: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    fillTriangle: vi.fn(),
    strokeCircle,
    lineBetween,
    strokeTriangle,
    destroy: vi.fn(),
  };
  const scene = { add: { graphics: () => graphics } } as any;
  const bus = createEventBus();
  const player = { x: 10, y: 20 };
  return { system: new AbilityPresentationSystem(scene, bus, player), bus, player, strokeCircle, lineBetween, strokeTriangle, graphics };
}

describe('AbilityPresentationSystem', () => {
  it('gives a duration-zero gameplay burst a brief readable presentation without changing its authority', () => {
    const { system, bus, strokeCircle } = harness();
    bus.emit('ability:activated', { abilityId: 'ability:heal', cue: 'heal-burst', x: 4, y: 5, durationMs: 0, color: '#ffffff' });
    bus.emit('ability:ended', { abilityId: 'ability:heal' });
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledWith(4, 5, expect.any(Number));
    system.update(264, false);
    expect(strokeCircle).toHaveBeenCalledTimes(4);
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledTimes(4);
  });

  it('anchors radial cues at activation but lets sustained cues follow the player', () => {
    const { system, bus, player, strokeCircle } = harness();
    bus.emit('ability:activated', { abilityId: 'ability:ring', cue: 'heat-ring', x: 3, y: 4, durationMs: 800, color: '#ff0000' });
    player.x = 40; player.y = 50;
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledWith(3, 4, expect.any(Number));
    strokeCircle.mockClear();
    bus.emit('ability:activated', { abilityId: 'ability:aura', cue: 'shield-aura', x: 3, y: 4, durationMs: 800, color: '#ffffff' });
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledWith(40, 50, expect.any(Number));
  });

  it('does not advance presentation time while its owner does not call update', () => {
    const { system, bus, strokeCircle } = harness();
    bus.emit('ability:activated', { abilityId: 'ability:aura', cue: 'shield-aura', x: 0, y: 0, durationMs: 100, color: '#ffffff' });
    // Manual/level-up pause intentionally makes GameScene skip this call.
    system.update(50, false);
    system.update(50, false);
    expect(strokeCircle).toHaveBeenCalledTimes(8); // outline + colour, two rings, two active frames
  });

  it('renders an activation on a frozen extraction frame without advancing it', () => {
    const { system, bus, strokeCircle } = harness();
    bus.emit('ability:activated', { abilityId: 'ability:heat', cue: 'heat-ring', x: 8, y: 9, durationMs: 100, color: '#ff0000' });
    system.update(0, false);
    system.update(100, false);
    expect(strokeCircle).toHaveBeenCalledTimes(6); // outline, colour, and highlight remain visible on both frames
  });

  it('gives radial, heat, movement, shield, and mark cues distinct non-colour silhouettes', () => {
    const signatures = new Set<string>();
    for (const [abilityId, cue] of [
      ['ability:scrap', 'shockwave'],
      ['ability:heat', 'heat-ring'],
      ['ability:loot', 'loot-pulse'],
      ['ability:heal', 'heal-burst'],
      ['ability:speed', 'speed-trail'],
      ['ability:clock', 'overclock-aura'],
      ['ability:shield', 'shield-aura'],
      ['ability:mark', 'precision-mark'],
    ] as const) {
      const { system, bus, strokeCircle, lineBetween, strokeTriangle } = harness();
      bus.emit('ability:activated', { abilityId, cue, x: 4, y: 5, durationMs: 500, color: '#ffffff' });
      system.update(16, true);
      signatures.add(`${strokeCircle.mock.calls.length}:${lineBetween.mock.calls.length}:${strokeTriangle.mock.calls.length}`);
      system.destroy();
    }
    expect(signatures.size).toBe(8);
  });

  it('uses a stable reduced-motion frame while animated effects visibly advance', () => {
    const reduced = harness();
    reduced.bus.emit('ability:activated', { abilityId: 'ability:ring', cue: 'shockwave', x: 4, y: 5, durationMs: 500, color: '#ffffff' });
    reduced.system.update(80, true);
    const reducedFirst = reduced.strokeCircle.mock.calls.at(-1)?.[2];
    reduced.system.update(80, true);
    const reducedSecond = reduced.strokeCircle.mock.calls.at(-1)?.[2];
    expect(reducedSecond).toBe(reducedFirst);

    const animated = harness();
    animated.bus.emit('ability:activated', { abilityId: 'ability:ring', cue: 'shockwave', x: 4, y: 5, durationMs: 500, color: '#ffffff' });
    animated.system.update(80, false);
    const animatedFirst = animated.strokeCircle.mock.calls.at(-1)?.[2];
    animated.system.update(80, false);
    const animatedSecond = animated.strokeCircle.mock.calls.at(-1)?.[2];
    expect(animatedSecond).not.toBe(animatedFirst);
  });
});
