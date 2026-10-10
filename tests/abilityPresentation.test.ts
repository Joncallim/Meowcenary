import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { createEventBus, type GameEventMap } from '../src/engine/eventBus';
import { AbilityPresentationSystem } from '../src/systems/abilityPresentation';

function harness() {
  const graphics = {
    setDepth: () => graphics, clear: vi.fn(), lineStyle: vi.fn(), fillStyle: vi.fn(),
    fillCircle: vi.fn(), fillTriangle: vi.fn(), strokeCircle: vi.fn(),
    lineBetween: vi.fn(), strokeTriangle: vi.fn(), destroy: vi.fn(),
  };
  const banner = {
    setDepth: () => banner, setScrollFactor: () => banner, setOrigin: () => banner,
    setVisible: vi.fn(() => banner), setText: vi.fn(() => banner), setPosition: vi.fn(() => banner),
    setFontSize: vi.fn(() => banner), setWordWrapWidth: vi.fn(() => banner), destroy: vi.fn(),
  };
  const add = { graphics: vi.fn(() => graphics), text: vi.fn(() => banner) };
  const scale = { width: 390, height: 844, on: vi.fn(), off: vi.fn() };
  const scene = { add, scale } as any;
  const bus = createEventBus();
  const player = { x: 10, y: 20 };
  return { system: new AbilityPresentationSystem(scene, bus, player), bus, player, graphics, banner, add, scale };
}

function activation(overrides: Partial<GameEventMap['ability:activated']> = {}): GameEventMap['ability:activated'] {
  return { abilityId: 'fixture:new-content', mechanicKind: 'knockback', cue: 'shockwave',
    x: 4, y: 5, radius: 73, durationMs: 500, color: '#ffffff',
    headline: 'Fixture Burst', detail: 'Knock back nearby enemies within 73 range.', ...overrides };
}

function primitiveCount(graphics: ReturnType<typeof harness>['graphics']): number {
  return graphics.strokeCircle.mock.calls.length + graphics.lineBetween.mock.calls.length
    + graphics.fillTriangle.mock.calls.length + graphics.strokeTriangle.mock.calls.length + graphics.fillCircle.mock.calls.length;
}

describe('AbilityPresentationSystem mechanical facts', () => {
  it.each(['knockback', 'elemental-burst', 'loot-pulse'] as const)('keeps the exact outer %s boundary in motion and reduced motion', mechanicKind => {
    for (const reducedMotion of [false, true]) {
      const { system, bus, graphics, player } = harness();
      bus.emit('ability:activated', activation({ mechanicKind, radius: 137 }));
      player.x = 700; player.y = 800;
      for (const delta of [0, 80, 90]) {
        graphics.strokeCircle.mockClear();
        system.update(delta, reducedMotion);
        expect(graphics.strokeCircle).toHaveBeenCalledWith(4, 5, 137);
        expect(graphics.strokeCircle.mock.calls.every(call => call[2] <= 137)).toBe(true);
      }
      system.destroy();
    }
  });

  it('uses mechanic kind for a new content fixture despite an unrelated legacy cue', () => {
    const { system, bus, graphics } = harness();
    bus.emit('ability:activated', activation({ mechanicKind: 'heal', cue: 'shockwave', radius: undefined, durationMs: 0 }));
    system.update(0, true);
    expect(graphics.lineBetween).toHaveBeenCalledWith(4 - 9, 5, 4 + 9, 5);
    expect(graphics.strokeCircle.mock.calls.every(call => call[2] < 73)).toBe(true);
  });

  it('shows immediate name/effect and then actual capped heal and collected receipts', () => {
    const { system, bus, banner } = harness();
    bus.emit('ability:activated', activation({ mechanicKind: 'heal' }));
    expect(banner.setText).toHaveBeenCalledWith('Fixture Burst\nKnock back nearby enemies within 73 range.');
    bus.emit('ability:resolved', { abilityId: 'fixture:new-content', activationId: 1, name: 'Fixture Burst', origin: { x: 4, y: 5 }, resolution: { kind: 'heal', requested: 40, applied: 7 } });
    expect(banner.setText).toHaveBeenLastCalledWith('Fixture Burst\n+7 HP');
    bus.emit('ability:resolved', { abilityId: 'fixture:new-content', activationId: 2, name: 'Fixture Burst', origin: { x: 4, y: 5 }, resolution: { kind: 'heal', requested: 40, applied: 0 } });
    expect(banner.setText).toHaveBeenLastCalledWith('Fixture Burst\n+0 HP');
    bus.emit('ability:resolved', { abilityId: 'fixture:new-content', activationId: 3, name: 'Fixture Burst', origin: { x: 4, y: 5 }, resolution: { kind: 'loot-pulse', radius: 73, collected: 5 } });
    expect(banner.setText).toHaveBeenLastCalledWith('Fixture Burst\nCollected 5');
    system.destroy();
  });

  it('keeps a persistent shield on the player until the authoritative end, with no local expiry', () => {
    const { system, bus, player, graphics } = harness();
    bus.emit('ability:activated', activation({ mechanicKind: 'invulnerable', durationMs: 100, radius: undefined }));
    player.x = 40; player.y = 50;
    system.update(10000, true);
    expect(graphics.lineBetween).toHaveBeenCalled();
    graphics.lineBetween.mockClear();
    system.update(0, true);
    expect(graphics.lineBetween.mock.calls.some(call => call[0] >= 4 && call[0] <= 76)).toBe(true);
    bus.emit('ability:ended', { abilityId: 'fixture:new-content' });
    graphics.lineBetween.mockClear();
    system.update(0, true);
    expect(graphics.lineBetween).not.toHaveBeenCalled();
  });

  it('renders speed, fire-rate, damage and pierce stat glyphs from modifier semantics', () => {
    const signatures = new Set<string>();
    for (const stat of ['moveSpeed', 'attackSpeed', 'damage', 'pierce'] as const) {
      const { system, bus, graphics } = harness();
      bus.emit('ability:activated', activation({ mechanicKind: 'stat-burst', cue: 'shockwave', modifiers: [{ stat, op: 'add', value: 1, sourceId: 'fixture' }] }));
      system.update(0, true);
      signatures.add(JSON.stringify(graphics.lineBetween.mock.calls) + JSON.stringify(graphics.strokeCircle.mock.calls) + JSON.stringify(graphics.strokeTriangle.mock.calls));
      system.destroy();
    }
    expect(signatures.size).toBe(4);
  });

  it('bounds repeated activations to one transient, one persistent and sixteen drawing primitives', () => {
    const { system, bus, graphics, add } = harness();
    for (let index = 0; index < 30; index += 1) bus.emit('ability:activated', activation({ abilityId: `fixture:${index}` }));
    bus.emit('ability:activated', activation({ mechanicKind: 'stat-burst', modifiers: [
      { stat: 'attackSpeed', op: 'mult', value: 1.5, sourceId: 'fixture' },
      { stat: 'moveSpeed', op: 'mult', value: 1.25, sourceId: 'fixture' },
    ] }));
    system.update(0, true);
    expect(primitiveCount(graphics)).toBeLessThanOrEqual(16);
    expect(graphics.strokeCircle).toHaveBeenCalledWith(4, 5, 73);
    expect(add.graphics).toHaveBeenCalledTimes(1);
    expect(add.text).toHaveBeenCalledTimes(1);
  });

  it('freezes transient lifetime at zero delta and keeps reduced-motion silhouettes static', () => {
    const { system, bus, graphics } = harness();
    bus.emit('ability:activated', activation());
    system.update(0, true);
    const first = JSON.stringify(graphics.strokeCircle.mock.calls);
    graphics.strokeCircle.mockClear();
    system.update(0, true);
    expect(JSON.stringify(graphics.strokeCircle.mock.calls)).toBe(first);
    system.update(500, true);
    graphics.strokeCircle.mockClear();
    system.update(0, true);
    expect(graphics.strokeCircle).not.toHaveBeenCalled();
  });

  it('removes all objects and subscriptions on repeated destroy and ignores later facts', () => {
    const { system, bus, graphics, banner, scale } = harness();
    system.destroy(); system.destroy();
    bus.emit('ability:activated', activation());
    system.update(16, false);
    expect(graphics.clear).not.toHaveBeenCalled();
    expect(graphics.destroy).toHaveBeenCalledTimes(1);
    expect(banner.destroy).toHaveBeenCalledTimes(1);
    expect(banner.setText).not.toHaveBeenCalled();
    expect(scale.off).toHaveBeenCalledTimes(1);
  });
});
