import { describe, expect, it } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at
// module evaluation time (see tests/input.test.ts for the pattern).
import { MockInputPlugin, MockGamepad } from './__mocks__/phaser';
import type Phaser from 'phaser';
import { InputController } from '../src/systems/input';

// Vitest workers run with --expose-gc (vite.config.ts test.poolOptions) so the
// heap can be settled BEFORE the measurement window. Crucially, the AFTER
// measurement must NOT gc: a per-frame allocation that V8 has not yet
// collected shows up as heap growth; a trailing gc would hide it.
declare const gc: (() => void) | undefined;

function createController(options: { keyboard?: boolean; gamepad?: boolean } = {}) {
  const input = new MockInputPlugin(options);
  const scene = { input } as unknown as Phaser.Scene;
  const controller = new InputController(scene);
  return { controller, input };
}

function settleHeap(): void {
  if (typeof gc === 'function') {
    gc();
    gc();
  }
}

/** Epic 19 §6 gate: the POLL PATH performs ZERO per-frame allocations.
 *  (Edge emission and dispatch — discrete events, not polling — may allocate;
 *  the gate is about steady-state frames.) Runs a large number of idle and
 *  held-input polls and asserts the heap does not grow beyond a small
 *  constant. Any per-frame allocation (Set, array, vector object, Math.hypot)
 *  shows up as megabytes of uncollected young-gen garbage in the window
 *  (verified: 50k Set iterations ≈ 3MB, 50k Math.hypot ≈ 2.3MB without a
 *  trailing gc; the fixed poll path measures single-digit KB). */
describe('Epic 19 §6 zero-allocation poll path', () => {
  it('does not allocate per frame across idle polls', () => {
    const { controller } = createController({ keyboard: true, gamepad: true });
    // Warm-up: JIT compilation and lazy init happen here, not in the window.
    for (let i = 0; i < 2_000; i += 1) {
      controller.update(16);
    }

    settleHeap();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 50_000; i += 1) {
      controller.update(16);
    }
    // NO trailing gc — uncollected garbage must be visible.
    const after = process.memoryUsage().heapUsed;

    expect(after - before).toBeLessThan(512 * 1024);
  });

  it('does not allocate per frame while inputs are held', () => {
    const { controller, input } = createController({ keyboard: true, gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);
    // Held inputs that produce NO edges: confirm is not a nav action (one
    // press edge, then held), and the stick stays below navThreshold so no
    // nav auto-repeat fires.
    input.keyboard!.holdKey('enter');
    pad.setButton(0, true);
    pad.setLeftStick(0.3, 0);

    for (let i = 0; i < 2_000; i += 1) {
      controller.update(16);
    }

    settleHeap();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 50_000; i += 1) {
      controller.update(16);
    }
    const after = process.memoryUsage().heapUsed;

    expect(after - before).toBeLessThan(512 * 1024);
  });
});
