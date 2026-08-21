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

    // 1 MiB smoke bound: heap-delta without a trailing gc is inherently
    // noisy (V8 may promote objects or scavenge mid-window under full-suite
    // load — observed one-off deltas above 512 KiB). This is a COARSE canary
    // only; the authoritative GC-event gate below catches per-frame
    // allocations of any size deterministically (mutation-verified).
    expect(after - before).toBeLessThan(1024 * 1024);
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

    // 1 MiB smoke bound: heap-delta without a trailing gc is inherently
    // noisy (V8 may promote objects or scavenge mid-window under full-suite
    // load — observed one-off deltas above 512 KiB). This is a COARSE canary
    // only; the authoritative GC-event gate below catches per-frame
    // allocations of any size deterministically (mutation-verified).
    expect(after - before).toBeLessThan(1024 * 1024);
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

/** AUTHORITATIVE Epic 19 §6 gate (round-3 hardened). The counting wrappers
 *  above cover Set/Map/hypot but NOT array/object literals, spreads, or
 *  iterator allocations — a per-frame `[0, 0, 0]` sailed through both prior
 *  gates (verified: 20k per-frame array literals → {sets:0, maps:0,
 *  hypotCalls:0} and < 512KB heap smoke in 19/20 windows). This gate runs the
 *  REAL poll path in a child `node --trace-gc` process and counts V8
 *  Scavenge events BETWEEN the fixture's PROBE-START/PROBE-DONE markers (raw
 *  fd writes, strictly ordered with the trace lines): every allocation type —
 *  including literals V8 collects mid-window — pressures the young generation
 *  and must produce in-window scavenges.
 *
 *  Round-3 hardening: (1) the measured interval is delimited by the asserted
 *  markers and the heap is settled (gc gc) before PROBE-START, so startup
 *  garbage is never counted; the old whole-process count had a detection
 *  floor (a used per-frame [0, 0, 0] produced 3-4 scavenges against a <= 4
 *  bound and passed every time). (2) The child pins a small semi-space
 *  (--max-semi-space-size=2) and polls 200k frames, calibrated so the clean
 *  baseline performs ZERO in-window scavenges while ONE live per-frame
 *  [0, 0, 0] reliably triggers at least one — the baseline is now zero, not
 *  <= 4. (3) The array canary overwrites ONE retained slot per iteration
 *  (sink[0] = [0,0,0]) instead of bulk-retaining 1001 arrays, matching the
 *  one-live-array shape of the reviewed regression. (4) The probe runs under
 *  EVERY input scenario (idle, keyboard-held, gamepad, pointer) so the
 *  gamepad/pointer/keyboard poll branches are actually exercised: a used
 *  allocation in the connected-gamepad branch previously passed all 9 tests
 *  because the probe never ran that branch. Canary runs must exceed the
 *  (zero) baseline in the scenario they instrument. */
describe('Epic 19 §6 authoritative GC-event allocation gate', () => {
  const probePath = path.join(repoRoot(), 'tests/fixtures/allocProbe.entry.ts');
  const outfile = path.join(repoRoot(), '.tmp', 'alloc-probe.cjs');
  const stubPath = path.join(repoRoot(), 'tests/fixtures/phaserStub.ts');
  let bundled = false;

  function repoRoot(): string {
    return path.resolve(__dirname, '..');
  }

  // --expose-gc: the fixture settles the heap (gc gc) before PROBE-START.
  // --max-semi-space-size=2: pins the young generation small so a single
  // retained per-frame [0, 0, 0] (~80B) reliably fills it inside a 200k-poll
  // window (calibrated: clean baseline 0 in-window scavenges across all
  // scenarios, array canary 6-7 per run — 5/5 runs each).
  const PROBE_FLAGS = ['--max-semi-space-size=2', '--expose-gc', '--trace-gc'];

  function runProbe(canary: string, scenario: string): number {
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
      [...PROBE_FLAGS, outfile],
      {
        encoding: 'utf8',
        env: { ...process.env, ALLOC_CANARY: canary, ALLOC_SCENARIO: scenario },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (child.status !== 0) {
      throw new Error('probe child failed: ' + child.stderr);
    }
    // The markers are asserted: their absence means the fixture did not
    // delimit the window (startup failure or a fixture bug) — never a pass.
    const stdout = child.stdout;
    const startIdx = stdout.indexOf('PROBE-START');
    const endIdx = stdout.indexOf('PROBE-DONE');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      throw new Error('probe markers missing or out of order in child stdout');
    }
    // Count ONLY the in-window Scavenge lines (between the markers).
    // --trace-gc writes to stdout in this Node build (verified: Scavenge
    // lines on stdout, 0 on stderr), so count from stdout.
    const inWindow = (stdout.slice(startIdx, endIdx).match(/Scavenge/g) ?? []).length;
    const done = (stdout.match(/PROBE-DONE[^\n]*/) ?? [])[0] ?? 'NO-DONE-MARKER';
    // eslint-disable-next-line no-console
    console.log(
      `[gate] canary=${canary} scenario=${scenario} status=${child.status} ${done} inWindowScavenges=${inWindow}`,
    );
    return inWindow;
  }

  const SCENARIOS = ['idle', 'keyboard-held', 'gamepad', 'pointer'] as const;

  it('baseline: real poll path performs zero per-frame allocations in every input scenario', () => {
    // The zero bound is the detection floor: a single live per-frame
    // [0, 0, 0] must produce at least one in-window scavenge (verified by
    // mutation: injecting it into InputController.update() fails this test;
    // the old <= 4 bound passed it 20/20 times).
    for (const scenario of SCENARIOS) {
      const count = runProbe('none', scenario);
      expect(count, `in-window Scavenge count must be 0 for scenario=${scenario}`).toBe(0);
    }
  }, 120_000);

  it('canary: harness detects per-frame Set allocations', () => {
    const baseline = runProbe('none', 'idle');
    const count = runProbe('set', 'idle');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame array literals (idle)', () => {
    // The regression class the round-2 review proved invisible to both prior
    // gates (array literals bypass Set/Map wrappers AND heap smoke).
    const baseline = runProbe('none', 'idle');
    const count = runProbe('array', 'idle');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame array literals (gamepad poll active)', () => {
    // Proves the gamepad scenario instruments its branches: the connected-pad
    // poll path (stick read, nav projection, button loop) executes in-window,
    // so a regression there must exceed the scenario's zero baseline.
    const baseline = runProbe('none', 'gamepad');
    const count = runProbe('array', 'gamepad');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame array literals (pointer gesture active)', () => {
    // Proves the pointer scenario instruments the active clamped-movement
    // branch (dx/dy, magnitude, radius clamp) each frame.
    const baseline = runProbe('none', 'pointer');
    const count = runProbe('array', 'pointer');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);

  it('canary: harness detects per-frame object literals', () => {
    const baseline = runProbe('none', 'idle');
    const count = runProbe('object', 'idle');
    expect(count).toBeGreaterThan(baseline);
  }, 60_000);
});
