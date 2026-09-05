/**
 * Development-only bounded trace ring buffer for diagnosing drop/collection
 * lifecycle freezes (#164). Zero production overhead when DIAGNOSTICS_ENABLED
 * is false. Records the last N events in a fixed-size ring; exposed through
 * a global diagnostic handle for console inspection after an apparent freeze.
 *
 * Usage:
 *   import { trace } from '../engine/diagnostics';
 *   trace('drop:spawn', { kind: 'weapon', instanceId: '...' });
 *
 * After a freeze, open devtools and inspect:
 *   window.__meowcenary_diag?.events
 */
const RING_SIZE = 512;
const DIAGNOSTICS_ENABLED = true; // toggle for development builds

export interface TraceEvent {
  readonly t: number;        // timestamp ms (relative to first event)
  readonly tag: string;      // event category
  readonly data?: Record<string, unknown>;
}

const ring: TraceEvent[] = [];
let head = 0;
let count = 0;
let baseTime = 0;

/** Record a diagnostic trace event. No-op when diagnostics are disabled. */
export function trace(tag: string, data?: Record<string, unknown>): void {
  if (!DIAGNOSTICS_ENABLED) return;

  const now = performance.now();
  if (count === 0) baseTime = now;

  const event: TraceEvent = Object.freeze({
    t: Math.round(now - baseTime),
    tag,
    data: data ? Object.freeze({ ...data }) : undefined,
  });

  ring[head] = event;
  head = (head + 1) % RING_SIZE;
  if (count < RING_SIZE) count += 1;
}

/** Expose the trace buffer on the global object for devtools inspection. */
export function installDiagnostics(): void {
  if (!DIAGNOSTICS_ENABLED) return;
  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).__meowcenary_diag = {
      get events(): readonly TraceEvent[] {
        // Return in chronological order
        const result: TraceEvent[] = [];
        const start = count < RING_SIZE ? 0 : head;
        for (let i = 0; i < count; i++) {
          result.push(ring[(start + i) % RING_SIZE]);
        }
        return Object.freeze(result);
      },
      get size(): number { return RING_SIZE; },
      get used(): number { return count; },
    };
  }
}

/** Reset the trace buffer (useful between test runs). */
export function resetDiagnostics(): void {
  ring.length = 0;
  head = 0;
  count = 0;
  baseTime = 0;
}

/** Current event count. */
export function traceCount(): number {
  return count;
}
