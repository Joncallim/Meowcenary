import { describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '../src/engine/vector';
import { InputController } from '../src/systems/input';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: {
          W: 'KeyW',
          A: 'KeyA',
          S: 'KeyS',
          D: 'KeyD',
          UP: 'ArrowUp',
          DOWN: 'ArrowDown',
          LEFT: 'ArrowLeft',
          RIGHT: 'ArrowRight',
        },
      },
    },
  },
}));

class FakeEmitter {
  private readonly listeners = new Map<string, Array<{ callback: (...args: unknown[]) => void; context?: unknown }>>();

  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ callback, context });
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, callback: (...args: unknown[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((listener) => listener.callback !== callback || listener.context !== context),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    [...(this.listeners.get(event) ?? [])].forEach((listener) => {
      listener.callback.apply(listener.context, args);
    });
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

interface FakeKey {
  isDown: boolean;
}

class FakeKeyboard {
  readonly keys: Record<string, FakeKey>;

  constructor() {
    this.keys = {};
    for (const name of ['w', 'a', 's', 'd', 'up', 'down', 'left', 'right']) {
      this.keys[name] = { isDown: false };
    }
  }

  addKeys(): Record<string, FakeKey> {
    return this.keys;
  }
}

function createHarness() {
  const events = new FakeEmitter();
  const keyboard = new FakeKeyboard();
  const input = events as FakeEmitter & { keyboard: FakeKeyboard };
  input.keyboard = keyboard;
  const controller = new InputController({ input } as never);
  return { controller, events, keyboard };
}

function pointerAt(x: number, y: number, isDown = true) {
  return { x, y, isDown };
}

function drag(events: FakeEmitter, from: Vec2, to: Vec2) {
  events.emit('pointerdown', pointerAt(from.x, from.y));
  events.emit('pointermove', pointerAt(to.x, to.y));
}

describe('InputController movement', () => {
  it('preserves keyboard movement: single keys and normalized diagonals', () => {
    const { controller, keyboard } = createHarness();

    keyboard.keys.d.isDown = true;
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    keyboard.keys.d.isDown = false;
    keyboard.keys.w.isDown = true;
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: -1 });

    keyboard.keys.d.isDown = true;
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(-Math.SQRT1_2, 10);

    keyboard.keys.d.isDown = false;
    keyboard.keys.w.isDown = false;
    keyboard.keys.left.isDown = true;
    keyboard.keys.down.isDown = true;
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('preserves pointer drag intent scaled by the 64 px radius', () => {
    const { controller, events } = createHarness();

    drag(events, { x: 100, y: 100 }, { x: 132, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0.5, y: 0 });
  });

  it('combines keyboard and pointer intents clamped to unit length', () => {
    const { controller, events, keyboard } = createHarness();

    keyboard.keys.d.isDown = true;
    drag(events, { x: 100, y: 100 }, { x: 132, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('ignores pointermove outside an active drag', () => {
    const { controller, events } = createHarness();

    events.emit('pointermove', pointerAt(132, 100));
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('restores keyboard-only movement after the pointer is released', () => {
    const { controller, events, keyboard } = createHarness();

    keyboard.keys.d.isDown = true;
    drag(events, { x: 100, y: 100 }, { x: 164, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    events.emit('pointerup', pointerAt(164, 100));
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
    expect(controller.getPointer()).toBeNull();

    keyboard.keys.d.isDown = false;
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('returns fresh copies from getMoveVector and getPointer', () => {
    const { controller, events } = createHarness();

    const move = controller.getMoveVector();
    move.x = 5;
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });

    drag(events, { x: 100, y: 100 }, { x: 132, y: 100 });
    controller.update(16);
    const pointer = controller.getPointer();
    if (pointer) pointer.x = 999;
    expect(controller.getPointer()).toEqual({ x: 132, y: 100 });
  });
});

describe('InputController presentation snapshots', () => {
  it('freezes the snapshot and every vector', () => {
    const { controller } = createHarness();

    const idle = controller.getPresentationSnapshot();
    expect(Object.isFrozen(idle)).toBe(true);
    expect(Object.isFrozen(idle.moveVector)).toBe(true);
    expect(idle.pointerStart).toBeNull();
    expect(idle.pointerCurrent).toBeNull();
    expect(idle.moveVector).toEqual({ x: 0, y: 0 });

    const { controller: active, events } = createHarness();
    drag(events, { x: 100, y: 100 }, { x: 132, y: 100 });
    active.update(16);

    const snapshot = active.getPresentationSnapshot();
    expect(Object.isFrozen(snapshot.pointerStart)).toBe(true);
    expect(Object.isFrozen(snapshot.pointerCurrent)).toBe(true);
    expect(snapshot.pointerStart).toEqual({ x: 100, y: 100 });
    expect(snapshot.pointerCurrent).toEqual({ x: 132, y: 100 });
  });

  it('rejects mutation of the snapshot and its vectors without leaking into the controller', () => {
    const { controller, events } = createHarness();

    drag(events, { x: 100, y: 100 }, { x: 132, y: 100 });
    controller.update(16);

    const snapshot = controller.getPresentationSnapshot();
    expect(() => {
      (snapshot.moveVector as { x: number }).x = 99;
    }).toThrow();
    expect(() => {
      (snapshot.pointerStart as { x: number }).x = 99;
    }).toThrow();
    expect(() => {
      (snapshot as { mode: string }).mode = 'keyboard';
    }).toThrow();

    const fresh = controller.getPresentationSnapshot();
    expect(fresh.moveVector).toEqual({ x: 0.5, y: 0 });
    expect(fresh.pointerStart).toEqual({ x: 100, y: 100 });
    expect(fresh.mode).toBe('pointer');
  });

  it('reflects live state on every call', () => {
    const { controller, events } = createHarness();

    const before = controller.getPresentationSnapshot();
    drag(events, { x: 200, y: 300 }, { x: 232, y: 300 });
    controller.update(16);

    const after = controller.getPresentationSnapshot();
    expect(after).not.toBe(before);
    expect(after.pointerStart).toEqual({ x: 200, y: 300 });
    expect(after.moveVector).toEqual({ x: 0.5, y: 0 });
  });
});

describe('InputController mode switching', () => {
  it('starts in pointer mode', () => {
    const { controller } = createHarness();
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });

  it('a non-zero keyboard vector selects keyboard mode', () => {
    const { controller, keyboard } = createHarness();

    keyboard.keys.a.isDown = true;
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('idle updates do not flap the mode back to pointer', () => {
    const { controller, keyboard } = createHarness();

    keyboard.keys.a.isDown = true;
    controller.update(16);
    keyboard.keys.a.isDown = false;
    controller.update(16);
    controller.update(16);

    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('pointer down selects pointer mode and a later keyboard vector returns to keyboard', () => {
    const { controller, events, keyboard } = createHarness();

    events.emit('pointerdown', pointerAt(100, 100));
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    keyboard.keys.d.isDown = true;
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');

    events.emit('pointerdown', pointerAt(200, 200));
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });
});

describe('InputController joystick clamp', () => {
  it('maps a 64 px drag to a unit vector', () => {
    const { controller, events } = createHarness();

    drag(events, { x: 100, y: 100 }, { x: 164, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('clamps drags beyond the 64 px radius at unit length', () => {
    const { controller, events } = createHarness();

    drag(events, { x: 100, y: 100 }, { x: 228, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    drag(events, { x: 100, y: 100 }, { x: 228, y: 228 });
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('scales short drags linearly with the 64 px radius', () => {
    const { controller, events } = createHarness();

    drag(events, { x: 100, y: 100 }, { x: 116, y: 100 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0.25, y: 0 });

    drag(events, { x: 100, y: 100 }, { x: 100, y: 132 });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0.5 });
  });
});

describe('InputController destroy', () => {
  it('removes every pointer listener', () => {
    const { controller, events } = createHarness();

    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(events.listenerCount(event)).toBe(1);
    }

    controller.destroy();

    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(events.listenerCount(event)).toBe(0);
    }
  });

  it('pointer events after destroy cannot change controller state', () => {
    const { controller, events, keyboard } = createHarness();

    keyboard.keys.d.isDown = true;
    controller.update(16);
    controller.destroy();

    events.emit('pointerdown', pointerAt(100, 100));
    events.emit('pointermove', pointerAt(200, 200));
    events.emit('pointerup', pointerAt(200, 200));
    controller.update(16);

    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
    expect(controller.getPointer()).toBeNull();
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
    expect(controller.getPresentationSnapshot().pointerStart).toBeNull();
  });
});
