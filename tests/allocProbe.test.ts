import { describe, expect, it } from 'vitest';
import v8 from 'node:v8';

describe('probe semi-space trick', () => {
  it('huge semi-space makes array garbage visible without gc', () => {
    try {
      v8.setFlagsFromString('--max-semi-space-size=1024');
    } catch (e) {
      console.log('SETFLAGS ERR:', String(e));
      return;
    }
    // settle
    global.gc?.();
    global.gc?.();

    const before = process.memoryUsage().heapUsed;
    const sink: unknown[] = [];
    for (let i = 0; i < 200_000; i += 1) {
      const arr = [0, 0, 0];
      if (i % 1000 === 0) sink.push(arr);
    }
    const after = process.memoryUsage().heapUsed;
    console.log('ARRAY-GARBAGE DELTA KB:', ((after - before) / 1024).toFixed(0));
    expect(true).toBe(true);
  });

  it('baseline: no allocation with huge semi-space', () => {
    try {
      v8.setFlagsFromString('--max-semi-space-size=1024');
    } catch {
      // ignore
    }
    global.gc?.();
    global.gc?.();

    const before = process.memoryUsage().heapUsed;
    let acc = 0;
    for (let i = 0; i < 200_000; i += 1) {
      acc += i;
    }
    const after = process.memoryUsage().heapUsed;
    console.log('BASELINE DELTA KB:', ((after - before) / 1024).toFixed(0), 'acc:', acc);
    expect(true).toBe(true);
  });
});
