import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockInputPlugin, MockGamepad } from './__mocks__/phaser';
import { InputController } from '../src/systems/input';
import { ControlsView } from '../src/ui/controls';
import type { TouchStickConfig } from '../src/engine/config';
import { logicalCanvasViewport, zoomedGameUiViewport, GAMEPLAY_ZOOM } from '../src/ui/layout';
import { ThemeColor, ThemeDepth } from '../src/ui/theme';

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
      radius: 0,
      scaleX: 1,
      scaleY: 1,
      scrollFactorX: 1,
      scrollFactorY: 1,
      text: '',
      interactive: false,
      fillColor: undefined,
      fillAlpha: 1,
      strokeWidth: 0,
      strokeColor: undefined,
      strokeAlpha: 0,
      depth: 0,
      destroyed: false,
    };
    const listeners = new Map<string, Array<{ callback: (...args: unknown[]) => void; context?: unknown }>>();
    const chain = (key: string, value: unknown) => {
      state[key] = value;
      return api;
    };
    const api = {
      get state() { return { ...state }; },
      get x() { return Number(state.x); },
      get y() { return Number(state.y); },
      setText(text: string) { return chain('text', text); },
      setOrigin() { return api; },
      setScrollFactor(x: number, y: number = x) {
        state.scrollFactorX = x;
        state.scrollFactorY = y;
        return api;
      },
      setScale(x: number, y: number = x) {
        state.scaleX = x;
        state.scaleY = y;
        return api;
      },
      setDepth(depth: number) { return chain('depth', depth); },
      setResolution(resolution: number) { return chain('resolution', resolution); },
      setVisible(visible: boolean) { return chain('visible', visible); },
      setAlpha(alpha: number) { return chain('alpha', alpha); },
      setPosition(x: number, y: number) { state.x = x; state.y = y; return api; },
      setRadius(radius: number) { state.radius = radius; return api; },
      setStrokeStyle(width: number, color: number, alpha: number) {
        state.strokeWidth = width;
        state.strokeColor = color;
        state.strokeAlpha = alpha;
        return api;
      },
      setFillStyle(color: number, alpha = 1) {
        state.fillColor = color;
        state.fillAlpha = alpha;
        return api;
      },
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
      listenerCount(event: string) { return listeners.get(event)?.length ?? 0; },
      destroy() { state.destroyed = true; },
    };
    return api;
  }

  const scene = {
    add: {
      arc: (x: number, y: number, radius: number) =>
        own(fakeObject(x, y, radius * 2, radius * 2)).setRadius(radius),
      container: (x = 0, y = 0) => {
        const base = own(fakeObject(x, y));
        return {
          ...base,
          children: [] as Array<ReturnType<typeof fakeObject>>,
          add(children: unknown) {
            const list = Array.isArray(children) ? children : [children];
            list.forEach((child) => {
              const object = child as ReturnType<typeof fakeObject>;
              if (!this.children.includes(object)) this.children.push(object);
            });
            return this;
          },
          destroy() {
            this.children.forEach((child) => child.destroy());
            base.destroy();
          },
        };
      },
      text: (x: number, y: number, text: string, style: { resolution?: number } = {}) => {
        if (style.resolution !== 2) throw new Error('UI text must use resolution 2');
        return own(fakeObject(x, y).setResolution(style.resolution)).setText(text);
      },
      rectangle: (x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number) => {
        const object = own(fakeObject(x, y, width, height));
        if (fillColor !== undefined) object.setFillStyle(fillColor, fillAlpha ?? 1);
        return object;
      },
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

function createHarness(options: { readReducedMotion?: () => boolean; gamepad?: boolean; touchStick?: TouchStickConfig; zoomed?: boolean } = {}) {
  const { readReducedMotion = () => false, gamepad = false, touchStick, zoomed = false } = options;
  const scene = createFakeScene();
  const input = new MockInputPlugin({ keyboard: true, gamepad });
  const controller = new InputController({ ...scene, input } as never, { touchStick });
  const onPauseRequested = vi.fn();
  const view = new ControlsView({
    scene: scene as never,
    input: controller,
    viewport: zoomed ? zoomedGameUiViewport(scene.scale.displaySize.width, scene.scale.displaySize.height) : logicalCanvasViewport(),
    readReducedMotion,
    onPauseRequested,
    touchStick,
  });
  // GameScene runs InputController.update before the view update each frame.
  const tick = (dtMs = 16) => {
    controller.update(dtMs);
    view.update(dtMs);
  };
  return { scene, input, controller, view, onPauseRequested, tick };
}

describe('ControlsView virtual stick', () => {
  it('sets the controls root to HUD depth instead of relying on child depths', () => {
    const { scene, view } = createHarness();
    expect(scene.objects[0]?.state.depth).toBe(ThemeDepth.hud);
    view.destroy();
  });

  it('starts hidden and shows only during an active pointer gesture', () => {
    const { scene, input, view } = createHarness();
    // objects[0] is the UI root container (created in both modes, exactly
    // like production); the stick arcs follow it.
    const [stickBase, stickThumb] = scene.objects.slice(1);

    expect(stickBase.state.visible).toBe(false);
    expect(stickThumb.state.visible).toBe(false);

    input.pointerDown(100, 100);
    view.update(16);
    expect(stickBase.state.visible).toBe(true);
    expect(stickThumb.state.visible).toBe(true);
    expect(stickBase.state.x).toBe(100);
    expect(stickBase.state.y).toBe(100);

    input.pointerUp();
    view.update(16);
    expect(stickBase.state.visible).toBe(false);
    expect(stickThumb.state.visible).toBe(false);
  });

  it('clamps the stick thumb to the same 64 px radius as the intent math', () => {
    const { scene, input, view } = createHarness();
    // [root, stickBase, stickThumb, hint, pause]
    const stickThumb = scene.objects[2];

    input.pointerDown(100, 100);
    input.pointerMove(300, 100);
    view.update(16);
    expect(stickThumb.state.x).toBe(164);
    expect(stickThumb.state.y).toBe(100);

    input.pointerMove(300, 300);
    view.update(16);
    const dx = (stickThumb.state.x as number) - 100;
    const dy = (stickThumb.state.y as number) - 100;
    expect(Math.hypot(dx, dy)).toBeCloseTo(64, 10);
  });
  it('uses one injected anchored config for fixed base and shared radius intent', () => {
    const touchStick: TouchStickConfig = {
      radius: 40,
      mode: 'anchored',
      anchored: { centerX: 82, centerY: 700, activationRadius: 120 },
    };
    const { scene, input, controller, tick } = createHarness({ touchStick });
    const [stickBase, stickThumb] = scene.objects.slice(1);
    input.pointerDown(122, 700);
    tick();
    expect(stickBase.state.x).toBe(82);
    expect(stickBase.state.y).toBe(700);
    expect(stickThumb.state.x).toBe(122);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    input.pointerUp();
    input.pointerDown(203, 700);
    tick();
    expect(stickBase.state.visible).toBe(false);
    expect(stickThumb.state.visible).toBe(false);
  });
});

describe('ControlsView zoomed GameScene stick (AM-2/AM-3)', () => {
  it('authors the stick radius at 64/1.25 with no arc scale — ONE zoom compensation (M-02/AM-3)', () => {
    const { scene } = createHarness({ zoomed: true });
    const [root, stickBase, stickThumb] = scene.objects;
    // The camera zoom 1.25 grows world units, so the authored radius is
    // divided by the zoom; the arcs carry NO extra scale — the rendered
    // diameter is 2·(64/1.25)·1.25·s = 128·s physical px (AM-3 binding).
    expect(root.state.x).toBeCloseTo(39, 6);
    expect(root.state.y).toBeCloseTo(84.4, 6);
    expect(stickBase.state.radius).toBe(64 / GAMEPLAY_ZOOM);
    expect(stickThumb.state.radius).toBe((64 / GAMEPLAY_ZOOM) * 0.45);
    expect(stickBase.state.scaleX).toBe(1);
    expect(stickBase.state.scaleY).toBe(1);
    expect(stickThumb.state.scaleX).toBe(1);
    expect(stickThumb.state.scaleY).toBe(1);

    // The unzoomed (menu/plain) controls never shrink the arcs.
    const plain = createHarness();
    expect(plain.scene.objects[1].state.radius).toBe(64);
    expect(plain.scene.objects[1].state.scaleX).toBe(1);
  });

  it('parents every control child under the zoomed UI root and records each child own scrollFactor 0 (AM-2/M-08)', () => {
    const { scene } = createHarness({ zoomed: true });
    const root = scene.objects[0];
    expect(root.state.x).toBeCloseTo(39, 6);
    expect(root.state.y).toBeCloseTo(84.4, 6);
    // Every interactive/control child declares its OWN scroll factor — a
    // parent Container's factor never propagates in Phaser, and hit tests
    // read the child value.
    for (const child of scene.objects.slice(1)) {
      expect(child.state.scrollFactorX).toBe(0);
      expect(child.state.scrollFactorY).toBe(0);
    }
  });

  it('re-reads the zoomed viewport on resize and rebuilds the controls once', () => {
    const { scene, view } = createHarness({ zoomed: true });
    const oldPause = scene.objects.find((object) => object.state.interactive)!;
    expect(oldPause.state.width).toBeCloseTo(44 / GAMEPLAY_ZOOM, 5);

    scene.resize(844, 390);

    expect(oldPause.state.destroyed).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    const live = scene.objects.filter((object) => !object.state.destroyed);
    // Rebuilt tree: root + stickBase + stickThumb + hint + pause.
    const pause = live.find((object) => object.state.interactive)!;
    const fit = 390 / 844;
    // The zoomed viewport's logical canvas is invariant; the 44px target is
    // 44/(1.25·fit) logical and renders exactly 44px after camera zoom (the
    // arch FIT table row for 844×390).
    expect(pause.state.width).toBeCloseTo(44 / (GAMEPLAY_ZOOM * fit), 5);

    view.destroy();
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });
});

describe('ControlsView hints', () => {
  it('repositions the hint and rebuilds the pause target after rotation', () => {
    const { scene, view } = createHarness();
    const oldHint = scene.objects.find((object) => object.state.text === 'Drag to move • Tap A ability • Tap pause')!;
    const oldPause = scene.objects.find((object) => object.state.interactive)!;

    scene.resize(844, 390);

    expect(oldHint.state.destroyed).toBe(true);
    expect(oldPause.state.destroyed).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    const hint = scene.objects.find((object) => !object.state.destroyed && object.state.text === 'Drag to move • Tap A ability • Tap pause')!;
    const pause = scene.objects.find((object) => !object.state.destroyed && object.state.interactive)!;
    const fitScale = 390 / 844;
    // The strip is gone: the hint owns the bottom safe margin above the stick.
    expect(Number(hint.state.y) * fitScale).toBeCloseTo(238, 5);
    expect(Number(pause.state.width) * fitScale).toBeCloseTo(44, 5);
    expect(Number(pause.state.height) * fitScale).toBeCloseTo(44, 5);

    view.destroy();
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });

  it('rebuilds on an inset-only change instead of deduping equal dimensions', () => {
    const values: Record<string, string> = {
      '--safe-top': '0px', '--safe-right': '0px', '--safe-bottom': '0px', '--safe-left': '0px',
    };
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (property: string) => values[property] ?? '0px' }));
    try {
      const { scene, view } = createHarness();
      const oldPause = scene.objects.find((object) => object.state.interactive)!;
      values['--safe-top'] = '59px';
      values['--safe-bottom'] = '34px';
      scene.resize(390, 844);
      expect(oldPause.state.destroyed).toBe(true);
      expect(scene.scale.listenerCount('resize')).toBe(1);
      const pause = scene.objects.find((object) => !object.state.destroyed && object.state.interactive)!;
      expect(pause.state.y).toBeGreaterThan(oldPause.state.y as number);
      view.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('starts with pointer-mode copy and switches on mode change', () => {
    const { scene, input, tick } = createHarness();
    const hintText = scene.objects[3];

    expect(hintText.state.text).toBe('Drag to move • Tap A ability • Tap pause');

    input.keyboard!.keydown('d');
    tick();
    expect(hintText.state.text).toBe('WASD / arrows • Q ability • P / Esc');
    expect(hintText.state.alpha).toBe(1);

    input.keyboard!.keyup('d');
    tick();
    // Idle frames do not flap the copy back.
    expect(hintText.state.text).toBe('WASD / arrows • Q ability • P / Esc');
  });

  it('a pointer gesture restores pointer-mode copy', () => {
    const { scene, input, tick } = createHarness();
    const hintText = scene.objects[3];

    input.keyboard!.keydown('d');
    tick();
    expect(hintText.state.text).toBe('WASD / arrows • Q ability • P / Esc');

    input.keyboard!.keyup('d');
    input.pointerDown(10, 10);
    input.pointerMove(74, 10);
    tick();
    expect(hintText.state.text).toBe('Drag to move • Tap A ability • Tap pause');
  });

  it('shows the gamepad hint when gamepad input is active', () => {
    const { scene, input, tick } = createHarness({ gamepad: true });
    const hintText = scene.objects[3];

    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);
    pad.setLeftStick(1, 0);
    tick();

    expect(hintText.state.text).toBe('Left stick • Left face ability • Bottom face / Menu');
  });

  it('fades the hint once after the display duration with a tween', () => {
    const { scene, view } = createHarness();
    const hintText = scene.objects[3];

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
    const hintText = scene.objects[3];

    view.update(2200);

    expect(hintText.state.alpha).toBe(0);
    expect(scene.tweenConfigs).toHaveLength(0);
  });

  it('rereads the reduced-motion getter at fade time', () => {
    let reducedMotion = false;
    const { scene, view } = createHarness({ readReducedMotion: () => reducedMotion });
    const hintText = scene.objects[3];

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
    const pauseButton = scene.objects.find((object) => object.state.interactive)!;
    expect(pauseButton.state.interactive).toBe(true);

    pauseButton.emit('pointerdown');

    expect(onPauseRequested).toHaveBeenCalledTimes(1);
  });

  it('destroy removes the listener and destroys every object', () => {
    const { scene, view, onPauseRequested } = createHarness();
    const pauseButton = scene.objects.find((object) => object.state.interactive)!;

    view.destroy();
    pauseButton.emit('pointerdown');

    expect(onPauseRequested).not.toHaveBeenCalled();
    // The four control objects are owned by the view; the UI root container
    // is a scene-level object production never destroys.
    expect(scene.objects.slice(1).every((object) => object.state.destroyed)).toBe(true);
    expect(scene.objects[0].state.destroyed).toBe(true);

    // Double destroy is a no-op.
    view.destroy();
  });

  it('renders exactly two non-interactive cream pause bars inside the unchanged target', () => {
    const { scene, view, onPauseRequested } = createHarness();
    const pauseButton = scene.objects.find((object) => object.state.interactive)!;
    const bars = scene.objects.filter((object) => object !== pauseButton
      && object.state.fillColor === ThemeColor.cream
      && object.state.width === 8
      && object.state.height === 22);
    expect(pauseButton.state.width).toBe(44);
    expect(pauseButton.state.height).toBe(44);
    expect(pauseButton.state.strokeWidth).toBe(2);
    expect(pauseButton.state.strokeColor).toBe(ThemeColor.cream);
    expect(pauseButton.state.strokeAlpha).toBe(0.8);
    expect(bars).toHaveLength(2);
    const pauseX = Number(pauseButton.state.x);
    expect(bars.map((bar) => Number(bar.state.x)).sort((a, b) => a - b)).toEqual([pauseX - 8, pauseX + 8]);
    expect(bars.every((bar) => !bar.state.interactive && bar.state.scrollFactorX === 0 && bar.state.scrollFactorY === 0)).toBe(true);
    expect(pauseButton.listenerCount('pointerdown')).toBe(1);
    expect(bars.every((bar) => bar.listenerCount('pointerdown') === 0)).toBe(true);
    pauseButton.emit('pointerdown');
    expect(onPauseRequested).toHaveBeenCalledTimes(1);
    view.destroy();
  });
});

describe('ControlsView lifecycle guards', () => {
  it('update after destroy is a no-op', () => {
    const { scene, input, view } = createHarness();
    const [stickBase] = scene.objects.slice(1);

    view.destroy();
    input.pointerDown(100, 100);
    view.update(16);

    expect(stickBase.state.visible).toBe(false);
  });
});
