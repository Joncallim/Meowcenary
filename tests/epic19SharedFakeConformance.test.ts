import { describe, expect, it } from 'vitest';
import {
  createSharedFakeObjectForConformance,
  createSharedFakeSceneForConformance,
} from './helpers/epic19JourneyComposition';

describe('Epic 19 Slice 5 shared fake lifecycle conformance', () => {
  it('rejects post-destroy text and interactive operations while clearing their live state', () => {
    const text = createSharedFakeObjectForConformance('text', 'Before destroy');
    const interactive = createSharedFakeObjectForConformance('rect', '', 44, 44);
    let pointerUps = 0;

    text.on('pointerup', () => { pointerUps += 1; });
    interactive.setInteractive().on('pointerup', () => { pointerUps += 1; });
    text.destroy();
    interactive.destroy();

    expect(text.state.destroyed).toBe(true);
    expect(text.state.handlers).toEqual({});
    expect(interactive.state.destroyed).toBe(true);
    expect(interactive.state.interactive).toBe(false);
    expect(interactive.state.handlers).toEqual({});

    expect(() => text.setText('stale')).toThrow('operation after destroy');
    expect(() => text.getBounds()).toThrow('operation after destroy');
    expect(() => interactive.emit('pointerup')).toThrow('operation after destroy');
    expect(() => interactive.setInteractive()).toThrow('operation after destroy');
    expect(pointerUps).toBe(0);
  });

  it('records setScale and per-object setScrollFactor and rejects them after destroy (M-02/M-08)', () => {
    const scaled = createSharedFakeObjectForConformance('arc', '', 10, 10);
    const child = createSharedFakeObjectForConformance('rect', '', 44, 44);

    // Defaults are the real Phaser GameObject defaults.
    expect(scaled.state.scaleX).toBe(1);
    expect(scaled.state.scaleY).toBe(1);
    expect(child.state.scrollFactorX).toBe(1);
    expect(child.state.scrollFactorY).toBe(1);

    scaled.setScale(0.8);
    child.setScrollFactor(0);
    expect(scaled.state.scaleX).toBe(0.8);
    expect(scaled.state.scaleY).toBe(0.8);
    expect(child.state.scrollFactorX).toBe(0);
    expect(child.state.scrollFactorY).toBe(0);

    // The recorded scale participates in the rendered bounds (real Phaser
    // Shape.displayWidth = scaleX * width).
    expect(scaled.getBounds().width).toBeCloseTo(10 * 0.8);

    scaled.destroy();
    child.destroy();
    expect(() => scaled.setScale(0.5)).toThrow('operation after destroy');
    expect(() => child.setScrollFactor(0)).toThrow('operation after destroy');
  });

  it('records camera setZoom and exposes the scale fullscreen state/events/spies (M-02)', () => {
    const { camera, scale } = createSharedFakeSceneForConformance();

    expect(camera.zoom).toBe(1);
    camera.setZoom(1.25);
    expect(camera.zoom).toBe(1.25);
    expect(camera.setZoomCalls).toBe(1);

    // Fullscreen surface: state defaults, request spies, and the real Phaser
    // event names routed through the shared emitter with exact cardinality.
    expect(scale.isFullscreen).toBe(false);
    expect(scale.startFullscreen).toBeTypeOf('function');
    expect(scale.stopFullscreen).toBeTypeOf('function');
    const settled = () => {};
    scale.on('enterfullscreen', settled);
    scale.on('leavefullscreen', settled);
    scale.on('fullscreenfailed', settled);
    scale.on('fullscreenunsupported', settled);
    expect(scale.listenerCount('enterfullscreen')).toBe(1);
    expect(scale.listenerCount('leavefullscreen')).toBe(1);
    expect(scale.listenerCount('fullscreenfailed')).toBe(1);
    expect(scale.listenerCount('fullscreenunsupported')).toBe(1);
    expect(scale.emitCount('enterfullscreen')).toBe(0);
    scale.emit('enterfullscreen');
    expect(scale.emitCount('enterfullscreen')).toBe(1);
    expect(scale.listenerCallCount('enterfullscreen')).toBe(1);
    scale.off('enterfullscreen', settled);
    expect(scale.listenerCount('enterfullscreen')).toBe(0);
  });

  it('emits pointerdown and pointerup with the SAME pointer instance per id (identity)', () => {
    const { input } = createSharedFakeSceneForConformance();
    const down: unknown[] = [];
    const up: unknown[] = [];
    input.on('pointerdown', (pointer: unknown) => down.push(pointer));
    input.on('pointerup', (pointer: unknown) => up.push(pointer));

    input.pointerDown(120, 300, 5);
    input.pointerUp(5);

    expect(down).toHaveLength(1);
    expect(up).toHaveLength(1);
    // Identity, not a copy: the arming funnel reads pointer.id on both edges.
    expect(down[0]).toBe(up[0]);
    expect((down[0] as { id: number }).id).toBe(5);
  });
});
