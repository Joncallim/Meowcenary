import { describe, expect, it } from 'vitest';
import { createPerfSampler } from '../src/gameplay/perf';
import { createPerformanceProbe, performanceProbeEnabled } from '../src/platform/performanceProbe';

describe('opt-in performance evidence boundary', () => {
  it('requires both a permitted build and explicit query; production query cannot enable it', () => {
    expect(performanceProbeEnabled(false, false, '?perf-test=1')).toBe(false);
    expect(performanceProbeEnabled(true, false, '')).toBe(false);
    expect(performanceProbeEnabled(false, true, '?visual-test=1')).toBe(false);
    expect(performanceProbeEnabled(true, false, '?perf-test=1')).toBe(true);
    expect(performanceProbeEnabled(false, true, '?perf-test=1')).toBe(true);
  });
  it('bounds events in chronological order and freezes copies of action facts', () => {
    let time = 0;
    const probe = createPerformanceProbe(() => time, 2);
    const ids = ['a'];
    time = 2; probe.record('resource.load', 0, { ids });
    ids.push('mutated');
    time = 5; probe.record('menu.render', 2, { reason: 'panel-transition' });
    const first = probe.snapshot();
    expect(first.events[0].facts.ids).toEqual(['a']);
    expect(Object.isFrozen(first.events[0].facts.ids)).toBe(true);
    time = 8; probe.record('menu.render', 5);
    expect(probe.snapshot().events.map(event => event.startMs)).toEqual([2, 5]);
    expect(probe.snapshot().droppedEvents).toBe(1);
    expect(first.events).toHaveLength(2);
  });
  it('reset clears only measurement and a stale scene release cannot detach a newer sampler', () => {
    const probe = createPerformanceProbe(() => 10);
    const old = createPerfSampler(); const current = createPerfSampler();
    probe.attachGameplay(old); probe.attachGameplay(current); probe.releaseGameplay(old);
    current.recordFrame(20); probe.recordFrame(25); probe.record('menu.render', 5);
    expect(probe.snapshot().gameplay?.frame.sampleCount).toBe(1);
    probe.resetMeasurement();
    expect(probe.snapshot().frame.sampleCount).toBe(0);
    expect(probe.snapshot().gameplay?.frame.sampleCount).toBe(0);
    expect(probe.snapshot().events).toEqual([]);
    current.recordFrame(30);
    expect(probe.snapshot().gameplay?.frame.worstMs).toBe(30);
    probe.releaseGameplay(current);
    expect(probe.snapshot().gameplay).toBeUndefined();
  });
  it('ignores invalid clock readings and validates bounded capacity', () => {
    const probe = createPerformanceProbe(() => 5);
    probe.record('menu.render', 10); probe.record('menu.render', NaN);
    expect(probe.snapshot().events).toEqual([]);
    expect(() => createPerformanceProbe(() => 0, 0)).toThrow();
  });
});
