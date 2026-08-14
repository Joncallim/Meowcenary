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
    Scale: { Events: { RESIZE: 'resize' } },
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
  let resize: { callback: () => void; context?: unknown } | undefined;
  const objects: Array<ReturnType<typeof fakeObject>> = [];
  const tweenConfigs: Array<{ targets: unknown; alpha: number; duration: number }> = [];

  function own<T>(object: T): T {
    objects.push(object as ReturnType<typeof fakeObject>);
    return object;
  }

  function fakeObject(x = 0, y = 0, width = 0, height = 0) {
    const state: Record<string, unknown> = {
      visible: true,
      alpha: 1,
      x,
      y,
      width,
      height,
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
      text: (x: number, y: number, text: string) => own(fakeObject(x, y)).setText(text),
      rectangle: (x: number, y: number, width: number, height: number) =>
        own(fakeObject(x, y, width, height)),
    },
    tweens: {
      add(config: { targets: unknown; alpha: number; duration: number }) {
        tweenConfigs.push(config);
      },
      killTweensOf() {},
    },
    scale: {
      width: 390,
      height: 844,
      displaySize: { width: 390, height: 844 },
      parentSize: { width: 390, height: 844 },
      on(event: string, callback: () => void, context?: unknown) {
        if (event === 'resize') resize = { callback, context };
      },
      off(event: string, callback: () => void, context?: unknown) {
        if (event === 'resize' && resize?.callback === callback && resize.context === context) {
          resize = undefined;
        }
      },
      listenerCount(event: string) {
        return event === 'resize' && resize ? 1 : 0;
      },
    },
    get objects() { return objects; },
    get tweenConfigs() { return tweenConfigs; },
    resize(displayWidth: number, displayHeight: number) {
      const fitScale = Math.min(displayWidth / 390, displayHeight / 844);
      scene.scale.displaySize.width = 390 * fitScale;
      scene.scale.displaySize.height = 844 * fitScale;
      scene.scale.parentSize.width = displayWidth;
      scene.scale.parentSize.height = displayHeight;
      resize?.callback.call(resize.context);
    },
  };
  return scene;
}

function createHarness(options: { readReducedMotion?: () => boolean } = {}) {
  const { readReducedMotion = () => false } = options;
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
    readReducedMotion,
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
  it('repositions the hint and rebuilds the pause target after rotation', () => {
    const { scene, view } = createHarness();
    const oldHint = scene.objects[2];
    const oldPause = scene.objects[3];

    scene.resize(844, 390);

    expect(oldHint.state.destroyed).toBe(true);
    expect(oldPause.state.destroyed).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    const hint = scene.objects[4];
    const pause = scene.objects[5];
    const fitScale = 390 / 844;
    expect(Number(hint.state.y) * fitScale).toBeCloseTo(302, 5);
    expect(Number(pause.state.width) * fitScale).toBeCloseTo(44, 5);
    expect(Number(pause.state.height) * fitScale).toBeCloseTo(44, 5);

    view.destroy();
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });

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
    const { scene, view } = createHarness({ readReducedMotion: () => true });
    const hintText = scene.objects[2];

    view.update(2200);

    expect(hintText.state.alpha).toBe(0);
    expect(scene.tweenConfigs).toHaveLength(0);
  });

  it('rereads the reduced-motion getter at fade time', () => {
    let reducedMotion = false;
    const { scene, view } = createHarness({ readReducedMotion: () => reducedMotion });
    const hintText = scene.objects[2];

    // Accumulate time below the display duration with the setting still off.
    view.update(1000);
    expect(scene.tweenConfigs).toHaveLength(0);

    // The preference flips before the fade is due; the getter-backed setting
    // must be honoured without constructing the view again.
    reducedMotion = true;
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

  it('destroy removes the listener and destroys every object', () => {
    const { scene, view, onPauseRequested } = createHarness();
    const pauseButton = scene.objects[3];

    view.destroy();
    pauseButton.emit('pointerdown');

    expect(onPauseRequested).not.toHaveBeenCalled();
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
