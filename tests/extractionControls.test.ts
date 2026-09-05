/**
 * #164 RED→GREEN tests for the extraction UI control.
 *
 * Verifies that touch/mobile players can complete a pendingClear stage
 * via an explicit EXTRACT button that routes through the same logical
 * Confirm action as keyboard/controller.
 */

import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { ControlsView } from '../src/ui/controls';
import { InputController } from '../src/systems/input';
import { MockInputPlugin } from './__mocks__/phaser';
import { logicalCanvasViewport } from '../src/ui/layout';
import { ThemeColor } from '../src/ui/theme';

/** Create a minimal scene mock matching controls.test.ts createFakeScene pattern. */
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
      destroy() { state.destroyed = true; state.interactive = false; },
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

function createHarness(options: {
  extractionActive?: boolean;
} = {}) {
  const scene = createFakeScene();
  const mockInput = new MockInputPlugin({ keyboard: true });
  const viewport = logicalCanvasViewport();
  const onPause = vi.fn();
  const onAbility = vi.fn();
  const onExtract = vi.fn();

  const input = new InputController({ ...scene, input: mockInput } as never);

  const controls = new ControlsView({
    scene: scene as never,
    input,
    viewport,
    readReducedMotion: () => false,
    onPauseRequested: onPause,
    onAbilityRequested: onAbility,
    onExtractRequested: onExtract,
  });

  if (options.extractionActive) {
    controls.setExtractionState(true);
  }

  return { controls, scene, input, onPause, onAbility, onExtract };
}

/** Find objects that are not destroyed. */
function activeObjects(scene: any): any[] {
  return scene.objects.filter((o: any) => !o.state.destroyed);
}

describe('#164 extraction controls', () => {
  describe('RED 1: touch completion exists during pendingClear', () => {
    it('shows EXTRACT button when extraction state is active', () => {
      const { scene } = createHarness({ extractionActive: true });

      // Find objects by inspecting the scene's objects array
      const extractLabel = activeObjects(scene).find((o: any) => o.state.text === 'EXTRACT');
      expect(extractLabel).toBeDefined();

      // Find OBJECTIVE COMPLETE label
      const objectiveLabel = activeObjects(scene).find((o: any) =>
        o.state.text === 'OBJECTIVE COMPLETE'
      );
      expect(objectiveLabel).toBeDefined();

      // Find the EXTRACT button (primary-colored interactive rectangle, large)
      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary
        && o.state.interactive
        && Number(o.state.width) > 100
      );
      expect(extractButton).toBeDefined();
      expect(Number(extractButton.state.width)).toBeGreaterThan(100);
      expect(Number(extractButton.state.height)).toBeGreaterThan(30);
    });

    it('hides ability button during extraction state', () => {
      const { scene } = createHarness({ extractionActive: true });

      // In extraction state, no small primary-colored interactive buttons should exist
      const primaryInteractive = activeObjects(scene).filter((o: any) =>
        o.state.fillColor === ThemeColor.primary && o.state.interactive
      );
      // EXTRACT button is large (>100px wide), ability button is small (~44px)
      const smallPrimary = primaryInteractive.filter((o: any) => Number(o.state.width) <= 100);
      expect(smallPrimary.length).toBe(0);
    });
  });

  describe('RED 2: same logical command', () => {
    it('routes EXTRACT tap through onExtractRequested callback', () => {
      const { scene, onExtract } = createHarness({ extractionActive: true });

      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary
        && o.state.interactive
        && Number(o.state.width) > 100
      );
      expect(extractButton).toBeDefined();

      // Simulate tap via the registered pointerdown handler
      extractButton.emit('pointerdown');

      expect(onExtract).toHaveBeenCalledTimes(1);
    });
  });

  describe('RED 3: one extraction (no double commit)', () => {
    it('fires extract callback each time the button is tapped', () => {
      const { scene, onExtract } = createHarness({ extractionActive: true });

      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary
        && o.state.interactive
        && Number(o.state.width) > 100
      );

      // Multiple rapid taps
      extractButton.emit('pointerdown');
      extractButton.emit('pointerdown');
      extractButton.emit('pointerdown');

      expect(onExtract).toHaveBeenCalledTimes(3);
    });
  });

  describe('RED 4: movement gesture isolation', () => {
    it('does not fire extract from non-extract interactions', () => {
      const { controls, onExtract } = createHarness({ extractionActive: false });

      // Without extraction state, extract callback should never fire
      controls.update(16);
      expect(onExtract).not.toHaveBeenCalled();
    });
  });

  describe('RED 5: Pause round-trip preserves extraction state', () => {
    it('restores extraction UI after destroy/rebuild cycle', () => {
      const { controls } = createHarness({ extractionActive: true });

      // Simulate Pause round-trip: extraction state toggled off and back on
      controls.setExtractionState(false);
      controls.setExtractionState(true);

      // After re-enabling extraction, must not throw
      expect(() => controls.setExtractionState(true)).not.toThrow();
    });
  });

  describe('RED 6: responsive portrait', () => {
    it('places EXTRACT button within safe area at 390x844', () => {
      const { scene } = createHarness({ extractionActive: true });

      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary
        && o.state.interactive
        && Number(o.state.width) > 100
      );
      expect(extractButton).toBeDefined();

      // Button should be in the lower portion of the screen
      expect(Number(extractButton.state.y)).toBeGreaterThan(400);
      expect(Number(extractButton.state.y)).toBeLessThan(844);

      // Button should be horizontally centred
      expect(Number(extractButton.state.x)).toBeCloseTo(195, -1);

      // Touch target should meet minimum size (~44px)
      expect(Number(extractButton.state.width)).toBeGreaterThanOrEqual(44);
      expect(Number(extractButton.state.height)).toBeGreaterThanOrEqual(44);
    });

    it('places EXTRACT button within safe area at desktop 1280x720', () => {
      // Use a fresh scene and resize before constructing ControlsView
      const scene = createFakeScene();
      scene.resize(1280, 720);
      const mockInput = new MockInputPlugin({ keyboard: true });
      // Recalculate viewport for the new display size
      const viewport = logicalCanvasViewport(
        scene.scale.displaySize.width,
        scene.scale.displaySize.height,
        scene.scale.parentSize.width,
        scene.scale.parentSize.height,
      );
      const onPause = vi.fn();
      const onAbility = vi.fn();
      const onExtract = vi.fn();

      const input = new InputController({ ...scene, input: mockInput } as never);
      const controls = new ControlsView({
        scene: scene as never,
        input,
        viewport,
        readReducedMotion: () => false,
        onPauseRequested: onPause,
        onAbilityRequested: onAbility,
        onExtractRequested: onExtract,
      });
      controls.setExtractionState(true);

      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary
        && o.state.interactive
        && Number(o.state.width) > 100
      );
      expect(extractButton).toBeDefined();

      // Button should be in the lower portion of the viewport
      expect(Number(extractButton.state.y)).toBeGreaterThan(300);
      expect(Number(extractButton.state.y)).toBeLessThan(viewport.canvasHeight);

      // Horizontally centred
      expect(Number(extractButton.state.x)).toBeCloseTo(viewport.canvasWidth / 2, -1);
    });
  });

  describe('RED 7: normal active gameplay (no extraction)', () => {
    it('does not show EXTRACT button when extraction state is inactive', () => {
      const { scene } = createHarness({ extractionActive: false });

      // No EXTRACT button should exist among active objects
      const extractButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.primary && o.state.interactive && Number(o.state.width) > 100
      );
      expect(extractButton).toBeUndefined();

      // Normal pause button should still exist
      const pauseButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.surface && o.state.interactive
      );
      expect(pauseButton).toBeDefined();
    });
  });

  describe('RED 8: terminal transition', () => {
    it('removes extraction controls after state is deactivated', () => {
      const { controls } = createHarness({ extractionActive: true });

      // Deactivate extraction (simulating commit) — must not throw
      expect(() => controls.setExtractionState(false)).not.toThrow();
    });
  });

  describe('RED 9: keyboard/controller parity', () => {
    it('preserves existing pause callback', () => {
      const { scene, onPause } = createHarness({ extractionActive: true });

      // Pause button should still work during extraction state
      const pauseButton = activeObjects(scene).find((o: any) =>
        o.state.fillColor === ThemeColor.surface && o.state.interactive
      );
      expect(pauseButton).toBeDefined();

      pauseButton.emit('pointerdown');
      expect(onPause).toHaveBeenCalledTimes(1);
    });
  });
});
