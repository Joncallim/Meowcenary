import { describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/systems/input';
import { ControlsView } from '../src/ui/controls';
import { logicalCanvasViewport } from '../src/ui/layout';

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

function pointerAt(x: number, y: number, isDown = true) {
  return { x, y, isDown };
}

function createFakeScene() {
  const objects: Array<ReturnType<typeof fakeObject>> = [];
  const tweenConfigs: Array<{ targets: unknown; alpha: number; duration: number }> = [];

  function own<T>(object: T): T {
    objects.push(object as ReturnType<typeof fakeObject>);
    return object;
  }

  function fakeObject() {
    const state: Record<string, unknown> = {
      visible: true,
      alpha: 1,
      x: 0,
      y: 0,
      text: '',
      interactive: false,
      destroyed: false,
    };
    const listeners = new Map<string, Array<{ callback: (...args: unknown[]) => void; context?: unknown }>>();
    const chain = (key: string, value: unknown) => {
      state[key] = value;
      return api;
    };
    const api = {
      get state() { return { ...state }; },
      setText(text: string) { return chain('text', text); },
      setOrigin() { return api; },
      setScrollFactor() { return api; },
      setDepth() { return api; },
      setVisible(visible: boolean) { return chain('visible', visible); },
      setAlpha(alpha: number) { return chain('alpha', alpha); },
      setPosition(x: number, y: number) { state.x = x; state.y = y; return api; },
      setStrokeStyle() { return api; },
      setInteractive() { state.interactive = true; return api; },
      disableInteractive() { state.interactive = false; return api; },
      on(event: string, callback: (...args: unknown[]) => void, context?: unknown) {
        const listenersFor = listeners.get(event) ?? [];
        listenersFor.push({ callback, context });
        listeners.set(event, listenersFor);
        return api;
      },
      off(event: string, callback: (...args: unknown[]) => void, context?: unknown) {
        const listenersFor = listeners.get(event) ?? [];
        listeners.set(
          event,
          listenersFor.filter((listener) => listener.callback !== callback || listener.context !== context),
        );
        return api;
      },
      emit(event: string, ...args: unknown[]) {
        [...(listeners.get(event) ?? [])].forEach((listener) => {
          listener.callback.apply(listener.context, args);
        });
        return api;
      },
      destroy() { state.destroyed = true; },
    };
    return api;
  }

  const scene = {
    add: {
      arc: () => own(fakeObject()),
      text: (_x: number, _y: number, text: string) => own(fakeObject()).setText(text),
      rectangle: () => own(fakeObject()),
    },
    tweens: {
      add(config: { targets: unknown; alpha: number; duration: number }) {
        tweenConfigs.push(config);
      },
    },
    get objects() { return objects; },
    get tweenConfigs() { return tweenConfigs; },
  };
  return scene;
}

function createHarness(options: { reducedMotion?: boolean } = {}) {
  const { reducedMotion = false } = options;
  const scene = createFakeScene();
  const events = new FakeEmitter();
  const keyboard = new FakeKeyboard();
  const input = events as FakeEmitter & { keyboard: FakeKeyboard };
  input.keyboard = keyboard;
  const controller = new InputController({ input } as never);
  const onPauseRequested = vi.fn();
  const view = new ControlsView({
    scene: scene as never,
    input: controller,
    viewport: logicalCanvasViewport(),
    reducedMotion,
    onPauseRequested,
  });
  // GameScene runs InputController.update before the view update each frame.
  const tick = (dtMs = 16) => {
    controller.update(dtMs);
    view.update(dtMs);
  };
  return { scene, events, controller, keyboard, view, onPauseRequested, tick };
}

describe('ControlsView virtual stick', () => {
  it('starts hidden and shows only during an active pointer gesture', () => {
    const { scene, events, view } = createHarness();
    const [stickBase, stickThumb] = scene.objects;

    expect(stickBase.state.visible).toBe(false);
    expect(stickThumb.state.visible).toBe(false);

    events.emit('pointerdown', pointerAt(100, 100));
    view.update(16);
    expect(stickBase.state.visible).toBe(true);
    expect(stickThumb.state.visible).toBe(true);
    expect(stickBase.state.x).toBe(100);
    expect(stickBase.state.y).toBe(100);

    events.emit('pointerup', pointerAt(132, 100));
    view.update(16);
    expect(stickBase.state.visible).toBe(false);
    expect(stickThumb.state.visible).toBe(false);
  });

  it('clamps the stick thumb to the same 64 px radius as the intent math', () => {
    const { scene, events, view } = createHarness();
    const [, stickThumb] = scene.objects;

    events.emit('pointerdown', pointerAt(100, 100));
    events.emit('pointermove', pointerAt(300, 100));
    view.update(16);
    expect(stickThumb.state.x).toBe(164);
    expect(stickThumb.state.y).toBe(100);

    events.emit('pointermove', pointerAt(300, 300));
    view.update(16);
    const dx = (stickThumb.state.x as number) - 100;
    const dy = (stickThumb.state.y as number) - 100;
    expect(Math.hypot(dx, dy)).toBeCloseTo(64, 10);
  });
});

describe('ControlsView hints', () => {
  it('starts with pointer-mode copy and switches on mode change', () => {
    const { scene, keyboard, tick } = createHarness();
    const hintText = scene.objects[2];

    expect(hintText.state.text).toBe('Drag to move • Tap pause');

    keyboard.keys.d.isDown = true;
    tick();
    expect(hintText.state.text).toBe('WASD / arrows • P / Esc');
    expect(hintText.state.alpha).toBe(1);

    keyboard.keys.d.isDown = false;
    tick();
    // Idle frames do not flap the copy back.
    expect(hintText.state.text).toBe('WASD / arrows • P / Esc');
  });

  it('a pointer gesture restores pointer-mode copy', () => {
    const { scene, events, keyboard, tick } = createHarness();
    const hintText = scene.objects[2];

    keyboard.keys.d.isDown = true;
    tick();
    expect(hintText.state.text).toBe('WASD / arrows • P / Esc');

    keyboard.keys.d.isDown = false;
    events.emit('pointerdown', pointerAt(10, 10));
    tick();
    expect(hintText.state.text).toBe('Drag to move • Tap pause');
  });

  it('fades the hint once after the display duration with a tween', () => {
    const { scene, view } = createHarness();
    const hintText = scene.objects[2];

    view.update(1000);
    expect(hintText.state.alpha).toBe(1);
    expect(scene.tweenConfigs).toHaveLength(0);

    view.update(2200);
    expect(scene.tweenConfigs).toHaveLength(1);
    expect(scene.tweenConfigs[0].targets).toBe(hintText);
    expect(scene.tweenConfigs[0]).toMatchObject({ alpha: 0, duration: 400 });

    // Already faded: further updates add no second tween.
    view.update(16);
    expect(scene.tweenConfigs).toHaveLength(1);
  });

  it('with reduced motion the hint disappears immediately without a tween', () => {
    const { scene, view } = createHarness({ reducedMotion: true });
    const hintText = scene.objects[2];

    view.update(2200);

    expect(hintText.state.alpha).toBe(0);
    expect(scene.tweenConfigs).toHaveLength(0);
  });
});

describe('ControlsView pause button', () => {
  it('invokes the pause callback on pointer down', () => {
    const { scene, onPauseRequested } = createHarness();
    const pauseButton = scene.objects[3];
    expect(pauseButton.state.interactive).toBe(true);

    pauseButton.emit('pointerdown');

    expect(onPauseRequested).toHaveBeenCalledTimes(1);
  });

  it('destroy removes the listener, disables interactivity, and destroys every object', () => {
    const { scene, view, onPauseRequested } = createHarness();
    const pauseButton = scene.objects[3];

    view.destroy();
    pauseButton.emit('pointerdown');

    expect(onPauseRequested).not.toHaveBeenCalled();
    expect(pauseButton.state.interactive).toBe(false);
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);

    // Double destroy is a no-op.
    view.destroy();
  });
});

describe('ControlsView lifecycle guards', () => {
  it('update after destroy is a no-op', () => {
    const { scene, events, view } = createHarness();
    const [stickBase] = scene.objects;

    view.destroy();
    events.emit('pointerdown', pointerAt(100, 100));
    view.update(16);

    expect(stickBase.state.visible).toBe(false);
  });
});
