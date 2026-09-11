import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { AbilityPresentationSystem } from '../src/systems/abilityPresentation';

function harness() {
  const strokeCircle = vi.fn();
  const graphics = { setDepth: () => graphics, clear: vi.fn(), lineStyle: vi.fn(), strokeCircle, destroy: vi.fn() };
  const scene = { add: { graphics: () => graphics } } as any;
  const bus = createEventBus();
  const player = { x: 10, y: 20 };
  return { system: new AbilityPresentationSystem(scene, bus, player), bus, player, strokeCircle };
}

describe('AbilityPresentationSystem', () => {
  it('keeps a duration-zero burst through its first presentation frame', () => {
    const { system, bus, strokeCircle } = harness();
    bus.emit('ability:activated', { abilityId: 'ability:heal', cue: 'heal-burst', x: 4, y: 5, durationMs: 0, color: '#ffffff' });
    bus.emit('ability:ended', { abilityId: 'ability:heal' });
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledWith(4, 5, expect.any(Number));
    system.update(16, false);
    expect(strokeCircle).toHaveBeenCalledTimes(1);
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
    expect(strokeCircle).toHaveBeenCalledTimes(4); // shield draws two circles on both active frames
  });
});
