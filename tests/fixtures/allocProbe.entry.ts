// Allocation-probe entry for the Epic 19 §6 zero-allocation gate.
//
// Bundled with esbuild (alias phaser -> a KeyCodes stub) and spawned as a
// child `node --trace-gc` process by tests/zeroAllocation.test.ts. The parent
// counts V8 "Scavenge" events in the child's stderr: every allocation type
// (Set, Map, array literal, object literal, string, iterator) puts pressure on
// the young generation and triggers scavenges — including allocations that V8
// collects before the window ends, which heap-delta measurement misses.
//
// ALLOC_CANARY=none|set|array|object selects the per-frame allocation to
// inject NEXT TO the real poll path in the measured window. The baseline
// (none) run proves the real poll path allocates nothing; the canary runs
// prove the harness would detect each allocation type (must exceed baseline).
import type Phaser from 'phaser';
import { InputController } from '../../src/systems/input';

interface FakeKeyRecord {
  isDown: boolean;
}

function makeInput() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    keyboard: {
      addKeys: (mapping: Record<string, unknown>) => {
        const record: Record<string, FakeKeyRecord> = {};
        for (const name of Object.keys(mapping)) {
          record[name] = { isDown: false };
        }
        return record;
      },
      removeKey: () => {},
      off: () => {},
      keys: new Map(),
    },
    gamepad: {
      gamepads: [] as unknown[],
      on: () => {},
      off: () => {},
    },
    on: (event: string, handler: () => void) => {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
    },
    off: () => {},
    once: () => {},
    emit: (event: string) => {
      for (const h of listeners.get(event) ?? []) h();
    },
    activePointer: { x: 0, y: 0 },
    pointers: [] as unknown[],
  };
}

const canary = process.env.ALLOC_CANARY ?? 'none';
const input = makeInput();
const scene = { input } as unknown as Phaser.Scene;
const controller = new InputController(scene);

// Warm-up: JIT and lazy init happen here, outside the measured window.
for (let i = 0; i < 2_000; i += 1) controller.update(16);

// Measured window: 50k real poll-path updates. The canary allocates per
// iteration in the same loop (kept alive briefly, then released) so the
// harness must record the allocation pressure even when V8 collects it.
const sink: unknown[] = [];
for (let i = 0; i < 50_000; i += 1) {
  controller.update(16);
  if (canary === 'set') {
    sink.push(new Set<string>());
  } else if (canary === 'array') {
    sink.push([0, 0, 0]);
  } else if (canary === 'object') {
    sink.push({ a: 1, b: 2 });
  }
  if (sink.length > 1000) sink.length = 0;
}
console.log('PROBE-DONE canary=' + canary);
