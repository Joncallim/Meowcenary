import { describe, expect, it, vi } from 'vitest';
import { createEventBus, GAME_EVENT_KEYS } from '../src/engine/eventBus';

describe('GAME_EVENT_KEYS', () => {
  it('contains every key exactly once', () => {
    expect(new Set(GAME_EVENT_KEYS).size).toBe(GAME_EVENT_KEYS.length);
  });

  it('contains the four Epic 10 keys', () => {
    for (const key of ['settings:changed', 'ui:navigate', 'ui:confirm', 'ui:back']) {
      expect(GAME_EVENT_KEYS).toContain(key);
    }
  });

  it('has the pinned 24-key contract (compile-time exhaustiveness typechecks)', () => {
    expect(GAME_EVENT_KEYS).toHaveLength(24);
  });
});

describe('createEventBus', () => {
  it('returns an unsubscribe function that works when on is destructured', () => {
    const bus = createEventBus();
    const { on } = bus;
    const listener = vi.fn();
    const unsubscribe = on('level:up', listener);

    unsubscribe();
    bus.emit('level:up', { level: 2 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('off removes a listener', () => {
    const bus = createEventBus();
    const listener = vi.fn();

    bus.on('level:up', listener);
    bus.off('level:up', listener);
    bus.emit('level:up', { level: 2 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('emit calls all listeners', () => {
    const bus = createEventBus();
    const first = vi.fn();
    const second = vi.fn();

    bus.on('level:up', first);
    bus.on('level:up', second);
    bus.emit('level:up', { level: 2 });

    expect(first).toHaveBeenCalledWith({ level: 2 });
    expect(second).toHaveBeenCalledWith({ level: 2 });
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

  it('unsubscribing one listener does not remove unrelated listeners', () => {
    const bus = createEventBus();
    const removed = vi.fn();
    const kept = vi.fn();
    const unsubscribe = bus.on('level:up', removed);
    bus.on('level:up', kept);

    unsubscribe();
    bus.emit('level:up', { level: 2 });

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith({ level: 2 });
  });

  it('removing a listener during emit does not corrupt the emit loop', () => {
    const bus = createEventBus();
    const second = vi.fn();
    const unsubscribeSecond = bus.on('level:up', second);
    const first = vi.fn(() => {
      unsubscribeSecond();
    });

    bus.on('level:up', first);

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ level: 2 });
  });
});
