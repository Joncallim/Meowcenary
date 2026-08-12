import { describe, expect, it, vi } from 'vitest';
import { physicsDebugEnabled, togglePhysicsDebugWorld } from '../src/systems/debug';

describe('physicsDebugEnabled', () => {
  it('is always false outside development', () => {
    expect(physicsDebugEnabled('?physicsdebug=1', false)).toBe(false);
  });

  it.each(['', '?physicsdebug=', '?physicsdebug=0', '?physicsdebug=2', '?physicsdebug=true'])(
    'rejects %s',
    (search) => expect(physicsDebugEnabled(search, true)).toBe(false),
  );

  it('accepts only the exact first value 1', () => {
    expect(physicsDebugEnabled('?physicsdebug=1', true)).toBe(true);
    expect(physicsDebugEnabled('?physicsdebug=1&physicsdebug=0', true)).toBe(true);
    expect(physicsDebugEnabled('?physicsdebug=0&physicsdebug=1', true)).toBe(false);
  });

  it('is total for malformed input', () => {
    expect(() => physicsDebugEnabled('?physicsdebug=%E0%A4%A', true)).not.toThrow();
  });
});

describe('togglePhysicsDebugWorld', () => {
  it('first enables despite createDebugGraphic enabling as a side effect, then clears on disable', () => {
    const graphic = { setVisible: vi.fn(), clear: vi.fn() };
    const world = {
      drawDebug: false,
      debugGraphic: undefined as typeof graphic | undefined,
      createDebugGraphic() {
        this.drawDebug = true;
        this.debugGraphic = graphic;
      },
    };

    expect(togglePhysicsDebugWorld(world)).toBe(true);
    expect(world.drawDebug).toBe(true);
    expect(graphic.setVisible).toHaveBeenLastCalledWith(true);
    expect(togglePhysicsDebugWorld(world)).toBe(false);
    expect(world.drawDebug).toBe(false);
    expect(graphic.setVisible).toHaveBeenLastCalledWith(false);
    expect(graphic.clear).toHaveBeenCalledOnce();
  });
});
