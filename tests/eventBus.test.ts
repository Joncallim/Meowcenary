import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';

describe('createEventBus', () => {
  it('returns an unsubscribe function', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.on('level:up', listener);

    unsubscribe();
    bus.emit('level:up', { level: 2 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying listeners if one throws', () => {
    const bus = createEventBus();
    const afterThrow = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    bus.on('level:up', () => {
      throw new Error('broken listener');
    });
    bus.on('level:up', afterThrow);

    bus.emit('level:up', { level: 2 });

    expect(afterThrow).toHaveBeenCalledWith({ level: 2 });
    consoleError.mockRestore();
  });
});

