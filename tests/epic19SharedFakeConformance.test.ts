import { describe, expect, it } from 'vitest';
import { createSharedFakeObjectForConformance } from './helpers/epic19JourneyComposition';

describe('Epic 19 Slice 5 shared fake lifecycle conformance', () => {
  it('rejects post-destroy text and interactive operations while clearing their live state', () => {
    const text = createSharedFakeObjectForConformance('text', 'Before destroy');
    const interactive = createSharedFakeObjectForConformance('rect', '', 44, 44);
    let pointerUps = 0;

    text.on('pointerup', () => { pointerUps += 1; });
    interactive.setInteractive().on('pointerup', () => { pointerUps += 1; });
    text.destroy();
    interactive.destroy();

    expect(text.state.destroyed).toBe(true);
    expect(text.state.handlers).toEqual({});
    expect(interactive.state.destroyed).toBe(true);
    expect(interactive.state.interactive).toBe(false);
    expect(interactive.state.handlers).toEqual({});

    expect(() => text.setText('stale')).toThrow('operation after destroy');
    expect(() => text.getBounds()).toThrow('operation after destroy');
    expect(() => interactive.emit('pointerup')).toThrow('operation after destroy');
    expect(() => interactive.setInteractive()).toThrow('operation after destroy');
    expect(pointerUps).toBe(0);
  });
});
