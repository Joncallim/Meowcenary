// Allocation-probe entry for the Epic 19 §6 zero-allocation gate.
//
// Bundled with esbuild (alias phaser -> a KeyCodes stub) and spawned as a
// child `node --trace-gc` process by tests/zeroAllocation.test.ts. The parent
// counts V8 "Scavenge" events in the child's stdout BETWEEN the PROBE-START
// and PROBE-DONE markers: every allocation type (Set, Map, array literal,
// object literal, string, iterator) puts pressure on the young generation and
// triggers scavenges — including allocations that V8 collects before the
// window ends, which heap-delta measurement misses.
//
// ALLOC_SCENARIO=idle|keyboard-held|gamepad|pointer selects the input state
// the REAL poll path runs under, so every adapter branch production can hit
// is covered by the gate: the neutral idle state alone would let a regression
// hide in a branch the probe never executes (round-3 finding: a used
// allocation in the connected-gamepad poll branch passed the entire suite).
//
// ALLOC_CANARY=none|set|array|object selects the per-frame allocation to
// inject NEXT TO the real poll path in the measured window. The baseline
// (none) run proves the real poll path allocates nothing; the canary runs
// prove the harness would detect each allocation type (must exceed baseline).
//
// The window is delimited by PROBE-START/PROBE-DONE written with
// fs.writeSync(1, ...) — a raw fd write, so the marker bytes are strictly
// ordered with the --trace-gc lines on the same fd and the parent can count
// ONLY the in-window Scavenge events. The heap is settled (gc gc) before
// PROBE-START so startup garbage is never collected inside the window. The
// child runs with --expose-gc and a pinned --max-semi-space-size (see the
// gate test) calibrated so a single retained per-frame `[0, 0, 0]` reliably
// fills the young generation inside the window.
//
// update(0): the poll path does not read dt, and freezing the logical clock
// keeps nav auto-repeat (a discrete edge — allowed to allocate, not part of
// the steady-state poll) from firing inside the measured window: a held
// stick beyond navThreshold would otherwise emit repeat edges every ~10
// frames and pollute the zero baseline with edge-dispatch garbage.
import * as fs from 'node:fs';
import type Phaser from 'phaser';
import { InputController } from '../../src/systems/input';

// Window length in polls. Calibrated with the gate's --max-semi-space-size
// so the clean baseline performs ZERO in-window scavenges while a single
// retained per-frame `[0, 0, 0]` reliably triggers at least one.
const PROBE_POLLS = 200_000;

// The gate spawns the child with --expose-gc (see tests/zeroAllocation.test.ts).
declare const gc: (() => void) | undefined;

interface FakeKeyRecord {
  isDown: boolean;
}

interface FakePadButton {
  pressed: boolean;
}

interface FakePad {
  connected: boolean;
  leftStick: { x: number; y: number };
  axes: { value: number }[];
  buttons: FakePadButton[];
}

interface FakePointer {
  id: number;
  x: number;
  y: number;
  isDown: boolean;
}

type Listener = (...args: unknown[]) => void;

function makeInput() {
  const listeners = new Map<string, Listener[]>();
  const keyRecords: Record<string, FakeKeyRecord> = {};
  const input = {
    keyboard: {
      addKeys: (mapping: Record<string, unknown>) => {
        for (const name of Object.keys(mapping)) {
          keyRecords[name] = { isDown: false };
        }
        return keyRecords;
      },
      removeKey: () => {},
      off: () => {},
      keys: new Map(),
    },
    gamepad: {
      gamepads: [] as FakePad[],
      on: () => {},
      off: () => {},
    },
    // Context-bound like the real Phaser event emitter: PointerAdapter
    // registers its handlers with `this` as the third argument.
    on: (event: string, handler: Listener, context?: unknown) => {
      const list = listeners.get(event) ?? [];
      const wrapped = context !== undefined ? handler.bind(context) : handler;
      list.push(wrapped);
      listeners.set(event, list);
    },
    off: () => {},
    once: () => {},
    emit: (event: string, ...args: unknown[]) => {
      for (const h of listeners.get(event) ?? []) {
        h(...args);
      }
    },
    activePointer: { x: 0, y: 0 },
    pointers: [] as unknown[],
  };
  return { input, keyRecords };
}

const canary = process.env.ALLOC_CANARY ?? 'none';
const scenario = process.env.ALLOC_SCENARIO ?? 'idle';

const { input, keyRecords } = makeInput();
const scene = { input } as unknown as Phaser.Scene;
const controller = new InputController(scene);

if (scenario === 'keyboard-held') {
  // Hold a movement key and a confirm key: the keyboard action-poll and
  // movement branches take their held=true paths every frame.
  keyRecords.d.isDown = true;
  keyRecords.enter.isDown = true;
} else if (scenario === 'gamepad') {
  // A connected standard-layout pad in the plugin's slot array. The adapter
  // iterates gamepads[] directly and reads pad.connected, pad.leftStick,
  // pad.axes[0..1] and pad.buttons[0..15] via its bounds-safe helper. The
  // left stick sits beyond navThreshold (0.5) so the nav projection and
  // movement paths run every frame; confirm (index 0) is held so the
  // button-poll loop takes its pressed branch.
  const buttons: FakePadButton[] = [];
  for (let i = 0; i < 16; i += 1) {
    buttons.push({ pressed: i === 0 });
  }
  const pad: FakePad = {
    connected: true,
    leftStick: { x: 0.8, y: 0 },
    axes: [{ value: 0.8 }, { value: 0 }],
    buttons,
  };
  input.gamepad.gamepads[0] = pad;
} else if (scenario === 'pointer') {
  // Pin a gesture before the window: pointerdown anchors pointerStart, then
  // a move far beyond the stick radius (64px) makes every in-window update
  // execute the active clamped-movement branch (dx/dy, magnitude, radius
  // clamp, setMovementSample).
  const start: FakePointer = { id: 1, x: 10, y: 10, isDown: true };
  const current: FakePointer = { id: 1, x: 300, y: 200, isDown: true };
  input.emit('pointerdown', start);
  input.emit('pointermove', current);
}

// Warm-up: JIT compilation and lazy init happen here, outside the measured
// window.
for (let i = 0; i < 2_000; i += 1) {
  controller.update(0);
}

// Settle the heap so no startup garbage is collected inside the window.
if (typeof gc === 'function') {
  gc();
  gc();
}

const sink: unknown[] = [];
fs.writeSync(1, 'PROBE-START canary=' + canary + ' scenario=' + scenario + '\n');

for (let i = 0; i < PROBE_POLLS; i += 1) {
  controller.update(0);
  if (canary === 'set') {
    sink.push(new Set<string>());
  } else if (canary === 'array') {
    // Overwrite ONE retained slot per iteration: exactly the one-live-array
    // shape of the reviewed regression (a per-frame [0, 0, 0] stored on the
    // controller, element read) — NOT bulk retention pressure.
    sink[0] = [0, 0, 0];
  } else if (canary === 'object') {
    sink.push({ a: 1, b: 2 });
  }
  if (sink.length > 1000) {
    sink.length = 0;
  }
}
fs.writeSync(1, 'PROBE-DONE canary=' + canary + ' scenario=' + scenario + '\n');
