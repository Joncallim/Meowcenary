import { createPerfSampler, type PerfSampler } from '../gameplay/perf';

const OWNER_NAMES = ['menu.snapshot', 'menu.render', 'resource.load', 'resource.audio', 'boot.fonts', 'boot.font-weight', 'boot.preload', 'boot.load', 'boot.audio', 'boot.visual', 'boot.create', 'run.prepare', 'game.create'] as const;
const FRAME_OWNERS = [{ name: 'frame.cpu' }, { name: 'frame.render' }] as const;
export type PerformanceOwner = typeof OWNER_NAMES[number];
export type PerformanceFacts = Readonly<Record<string, string | number | boolean | readonly string[]>>;
export interface PerformanceEvent {
  readonly owner: PerformanceOwner;
  readonly startMs: number;
  readonly durationMs: number;
  readonly facts: PerformanceFacts;
}

/** An opt-in browser clock/event adapter for the existing bounded PerfSampler.
 * Frame recording never sorts or creates events. Action metadata never retains
 * scene objects; explicit diagnostic reads alone allocate detailed snapshots. */
export function createPerformanceProbe(clock: () => number, capacity = 256) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Performance event capacity must be positive');
  const sampler = createPerfSampler(600, 60, [...OWNER_NAMES.map(name => ({ name })), ...FRAME_OWNERS]);
  const events: PerformanceEvent[] = [];
  let head = 0;
  let count = 0;
  let droppedEvents = 0;
  let gameplay: PerfSampler | undefined;
  return {
    now: clock,
    record(owner: PerformanceOwner, startMs: number, facts: PerformanceFacts = {}, endMs = clock()): void {
      const durationMs = endMs - startMs;
      if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || durationMs < 0) return;
      const copied: Record<string, string | number | boolean | readonly string[]> = {};
      for (const [key, value] of Object.entries(facts)) copied[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
      sampler.recordOwner(owner, durationMs);
      events[head] = Object.freeze({ owner, startMs, durationMs, facts: Object.freeze(copied) });
      head = (head + 1) % capacity;
      if (count < capacity) count += 1;
      else droppedEvents += 1;
    },
    recordFrame: sampler.recordFrame,
    recordFrameOwner: sampler.recordOwner,
    attachGameplay(next: PerfSampler): void { gameplay = next; },
    releaseGameplay(previous: PerfSampler | undefined): void { if (gameplay === previous) gameplay = undefined; },
    resetMeasurement(): void {
      sampler.reset();
      gameplay?.reset();
      events.length = 0;
      head = count = droppedEvents = 0;
    },
    snapshot() {
      const ordered: PerformanceEvent[] = [];
      const start = count < capacity ? 0 : head;
      for (let index = 0; index < count; index += 1) ordered.push(events[(start + index) % capacity]);
      return { ...sampler.detailedSnapshot(), events: Object.freeze(ordered), droppedEvents, gameplay: gameplay?.detailedSnapshot() };
    },
  };
}

export function performanceProbeEnabled(development: boolean, testBuild: boolean, search: string): boolean {
  return (development || testBuild) && new URLSearchParams(search).get('perf-test') === '1';
}

/** A query alone never enables telemetry in an ordinary production build. */
export const performanceProbe = (import.meta.env.DEV || import.meta.env.VITE_VISUAL_TEST === '1')
  && performanceProbeEnabled(import.meta.env.DEV, import.meta.env.VITE_VISUAL_TEST === '1', globalThis.location?.search ?? '')
  ? createPerformanceProbe(() => performance.now())
  : undefined;
