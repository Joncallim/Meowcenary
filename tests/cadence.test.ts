import { describe, expect, it } from 'vitest';
import { createCadence } from '../src/engine/cadence';

describe('createCadence', () => {
  it('emits whole ticks from accumulated dt', () => {
    const cadence = createCadence(100);

    expect(cadence.update(30)).toBe(0);
    expect(cadence.update(70)).toBe(1);
    expect(cadence.update(250)).toBe(2);
    expect(cadence.update(50)).toBe(1);
  });

  it('reset clears accumulated time', () => {
    const cadence = createCadence(100);

    expect(cadence.update(90)).toBe(0);
    cadence.reset();
    expect(cadence.update(20)).toBe(0);
  });

  it('preserves fractional progress when changing interval', () => {
    const cadence = createCadence(100);

    expect(cadence.update(60)).toBe(0);
    cadence.setInterval(80);

    expect(cadence.update(31)).toBe(0);
    expect(cadence.update(1)).toBe(1);
  });

  it('does not emit catch-up bursts when the interval becomes much shorter', () => {
    const cadence = createCadence(100);

    expect(cadence.update(90)).toBe(0);
    cadence.setInterval(10);

    expect(cadence.update(1)).toBe(1);
  });
});
