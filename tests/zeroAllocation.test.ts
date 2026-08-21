import { describe, expect, it } from 'vitest';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
 *  trailing gc; the fixed poll path measures single-digit KB).
 *
 *  NOTE: this heap-delta check is a SMOKE test, not the authority — V8 runs
 *  automatic minor collections inside the window, so an allocating
 *  implementation can slip under the 512KB bound (verified: a per-frame
 *  `new Set()` passed 3/12 windows with 134KB/193KB/229KB deltas). The
 *  authoritative gate is the allocation counter in the describe block
 *  below. */
describe('Epic 19 §6 zero-allocation poll path (heap smoke)', () => {
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

/** AUTHORITATIVE Epic 19 §6 gate. The heap-delta tests above can be fooled by
 *  V8 automatic minor collections inside the window, so this gate counts the
 *  allocations themselves: during the poll window, the constructors/functions
 *  the poll path is forbidden from calling per frame (`new Set`, `new Map`,
 *  `Math.hypot`) are temporarily replaced with counting wrappers. Any
 *  per-frame construction is recorded even when V8 collects the object before
 *  the window ends. (The poll path is also forbidden from per-frame spreads
 *  and `for...of` iterator objects; those are language constructs that cannot
 *  be wrapped — the poll path uses index loops only, and the canary below
 *  proves the wrappers do record.) */
describe('Epic 19 §6 authoritative allocation count', () => {
  function countConstructionsDuring(fn: () => void): {
    sets: number;
    maps: number;
    hypotCalls: number;
  } {
    const RealSet = globalThis.Set;
    const RealMap = globalThis.Map;
    const RealHypot = Math.hypot;
    let sets = 0;
    let maps = 0;
    let hypotCalls = 0;

    class CountingSet extends RealSet {
      // never[] rest: the wrapper only ever receives the no-arg `new Set()`
      // call, and a never[] spread is assignable to any base signature.
      constructor(..._args: never[]) {
        super();
        sets += 1;
      }
    }
    class CountingMap extends RealMap {
      constructor(..._args: never[]) {
        super();
        maps += 1;
      }
    }

    globalThis.Set = CountingSet as unknown as typeof globalThis.Set;
    globalThis.Map = CountingMap as unknown as typeof globalThis.Map;
    Math.hypot = (...values: number[]): number => {
      hypotCalls += 1;
      return RealHypot(...values);
    };
    try {
      fn();
    } finally {
      globalThis.Set = RealSet;
      globalThis.Map = RealMap;
      Math.hypot = RealHypot;
    }
    return { sets, maps, hypotCalls };
  }

  it('performs zero Set/Map/hypot constructions across idle polls', () => {
    const { controller } = createController({ keyboard: true, gamepad: true });
    // Warm-up outside the counting window: JIT and lazy init may construct
    // containers; the window itself must not.
    for (let i = 0; i < 2_000; i += 1) {
      controller.update(16);
    }

    const { sets, maps, hypotCalls } = countConstructionsDuring(() => {
      for (let i = 0; i < 20_000; i += 1) {
        controller.update(16);
      }
    });

    expect(sets).toBe(0);
    expect(maps).toBe(0);
    expect(hypotCalls).toBe(0);
  });

  it('performs zero Set/Map/hypot constructions while inputs are held', () => {
    const { controller, input } = createController({ keyboard: true, gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);
    input.keyboard!.holdKey('enter');
    pad.setButton(0, true);
    pad.setLeftStick(0.3, 0);

    for (let i = 0; i < 2_000; i += 1) {
      controller.update(16);
    }

    const { sets, maps, hypotCalls } = countConstructionsDuring(() => {
      for (let i = 0; i < 20_000; i += 1) {
        controller.update(16);
      }
    });

    expect(sets).toBe(0);
    expect(maps).toBe(0);
    expect(hypotCalls).toBe(0);
  });

  it('canary: the counting harness records per-frame new Set() allocations', () => {
    // A deliberately allocating loop through the SAME harness must be
    // detected — proving the counter records allocations even though V8
    // collects every discarded Set before the window ends. If this canary
    // ever stops detecting, the gate is blind and must be fixed.
    const { sets } = countConstructionsDuring(() => {
      for (let i = 0; i < 1_000; i += 1) {
        new Set(); // discarded immediately; V8 may collect these
      }
    });

    expect(sets).toBeGreaterThan(0);
  });
});

/** AUTHORITATIVE Epic 19 §6 gate (round-2 hardened). The counting wrappers
 *  above cover Set/Map/hypot but NOT array/object literals, spreads, or
 *  iterator allocations — a per-frame `[0, 0, 0]` sailed through both prior
 *  gates (verified: 20k per-frame array literals → {sets:0, maps:0,
 *  hypotCalls:0} and < 512KB heap smoke in 19/20 windows). This gate runs the
 *  REAL poll path in a child `node --trace-gc` process and counts V8
 *  Scavenge events: every allocation type — including literals V8 collects
 *  mid-window — pressures the young generation and must produce scavenges.
 *  Baseline (canary=none) proves the poll path allocates nothing; the canary
 *  runs prove the harness detects Set, array, AND object literals (each must
 *  exceed the baseline) so a regression in any allocation class is caught. */
describe('Epic 19 §6 authoritative GC-event allocation gate', () => {
  const probePath = path.join(repoRoot(), 'tests/fixtures/allocProbe.entry.ts');
  const outfile = path.join(repoRoot(), '.tmp', 'alloc-probe.cjs');
  const stubPath = path.join(repoRoot(), 'tests/fixtures/phaserStub.ts');
  let bundled = false;

  function repoRoot(): string {
    return path.resolve(__dirname, '..');
  }

  function runProbe(canary: string): number {
    if (!bundled) {
      fs.mkdirSync(path.dirname(outfile), { recursive: true });
      const res = childProcess.spawnSync(
        path.join(repoRoot(), 'node_modules', '.bin', 'esbuild'),
        [
          probePath,
          '--bundle',
          '--platform=node',
          '--format=cjs',
          '--outfile=' + outfile,
          '--alias:phaser=' + stubPath,
          '--define:import.meta.env.DEV=false',
          '--define:import.meta.env.PROD=true',
        ],
        { encoding: 'utf8' },
      );
      if (res.status !== 0) {
        throw new Error('esbuild bundle failed: ' + res.stderr);
      }
      bundled = true;
    }

    const child = childProcess.spawnSync(
      process.execPath,
      ['--trace-gc', outfile],
      {
        encoding: 'utf8',
        env: { ...process.env, ALLOC_CANARY: canary },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (child.status !== 0) {
      throw new Error('probe child failed: ' + child.stderr);
    }
    const done = (child.stdout.match(/PROBE-DONE[^\n]*/) ?? [])[0] ?? 'NO-DONE-MARKER';
    // --trace-gc writes to stdout in this Node build (verified: 11 Scavenge
    // lines on stdout, 0 on stderr), so count from stdout.
    const scavenges = (child.stdout.match(/Scavenge/g) ?? []).length;
    // eslint-disable-next-line no-console
    console.log(`[gate] canary=${canary} status=${child.status} ${done} scavenges=${scavenges}`);
    return scavenges;
  }

  it('baseline: real poll path performs zero per-frame allocations', () => {
    // Stable across runs (verified 1-2 scavenges for 50k polls). Any per-frame
    // allocation in the poll path raises this to 5+ (the array-canary level).
    const count = runProbe('none');
    expect(count).toBeLessThanOrEqual(4);
  }, 60_000);

  it('canary: harness detects per-frame Set allocations', () => {
    const baseline = runProbe('none');
    const count = runProbe('set');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame array literals', () => {
    // The regression class the round-2 review proved invisible to both prior
    // gates (array literals bypass Set/Map wrappers AND heap smoke).
    const baseline = runProbe('none');
    const count = runProbe('array');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame object literals', () => {
    const baseline = runProbe('none');
    const count = runProbe('object');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);
});
