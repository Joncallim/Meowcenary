import { describe, expect, it, vi } from 'vitest';
import { MockInputPlugin } from './__mocks__/phaser';
import { InputController } from '../src/systems/input';

describe('Shared modal input quarantine boundary', () => {
  it('quarantines later ability/navigation edges from the same Confirm poll until every source is neutral', () => {
    const input = new MockInputPlugin({ keyboard: true });
    const controller = new InputController({ input } as any);
    const confirm = vi.fn(() => controller.quarantineUntilNeutral());
    const ability = vi.fn(); const nav = vi.fn();
    controller.onAction('confirm', confirm); controller.onAction('ability', ability); controller.onAction('navDown', nav);
    input.keyboard!.keydown('Enter'); input.keyboard!.keydown('q'); input.keyboard!.keydown('down');
    controller.update(16);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ability).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
    controller.update(1000); expect(ability).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
    input.keyboard!.keyup('Enter'); input.keyboard!.keyup('q'); input.keyboard!.keyup('down');
    controller.update(16);
    input.keyboard!.keydown('q'); controller.update(16);
    expect(ability).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

// Scene keyboard plugins deliberately have different Key instances. The
// game-scoped manager keeps receiving releases while no scene adapter exists.
describe('physical source handoff across scene lifetimes', () => {
  it('keeps Enter OR Space and movement held across destroyed/recreated scene keys', async () => {
    const { EventEmitter } = await import('node:events');
    const events = new EventEmitter(); const gameEvents = new EventEmitter();
    const manager = { events, keyboard: { queue: [] as object[] }, pointers: [], game: { events: gameEvents } };
    const input = new MockInputPlugin({ keyboard: true }); (input as any).manager = manager;
    const old = new InputController({ input } as any);
    const physical = (type: string, keyCode: string) => {
      manager.keyboard.queue.push({ type, keyCode }); events.emit('process');
    };
    physical('keydown', 'ENTER'); physical('keydown', 'SPACE'); physical('keydown', 'W');
    input.keyboard!.keydown('Enter'); input.keyboard!.keydown('Space'); input.keyboard!.keydown('w'); old.update(16);
    old.destroy(); expect(input.keyboard!.keys.size).toBe(0);
    const nextInput = new MockInputPlugin({ keyboard: true }); (nextInput as any).manager = manager;
    const next = new InputController({ input: nextInput } as any); next.quarantineUntilNeutral();
    const confirm = vi.fn(); next.onAction('confirm', confirm); next.update(16);
    expect(next.isQuarantined()).toBe(true); expect(next.isNeutral()).toBe(false);
    physical('keyup', 'ENTER'); next.update(16); expect(next.isQuarantined()).toBe(true); expect(next.isNeutral()).toBe(false);
    physical('keyup', 'SPACE'); next.update(16); expect(next.isQuarantined()).toBe(true); expect(next.isNeutral()).toBe(false);
    physical('keyup', 'W'); next.update(16); expect(next.isQuarantined()).toBe(false); expect(next.isNeutral()).toBe(true);
    physical('keydown', 'ENTER'); next.update(16); expect(confirm).toHaveBeenCalledOnce();
    next.destroy(); gameEvents.emit('destroy'); expect(events.listenerCount('process')).toBe(0);
  });
  it('does not call suspended pointer movement neutral while either physical pointer is down', () => {
    const input = new MockInputPlugin({ keyboard: true });
    const a = { id: 1, isDown: true }; const b = { id: 2, isDown: true };
    (input as any).manager = { pointers: [a, b] };
    const controller = new InputController({ input } as any);
    controller.quarantineUntilNeutral(); controller.update(16);
    expect(controller.isQuarantined()).toBe(true); expect(controller.isNeutral()).toBe(false);
    a.isDown = false; controller.update(16); expect(controller.isQuarantined()).toBe(true); expect(controller.isNeutral()).toBe(false);
    b.isDown = false; controller.update(16); expect(controller.isQuarantined()).toBe(false); expect(controller.isNeutral()).toBe(true);
    controller.destroy();
  });
});

describe('physical interruption cleanup', () => {
  it('observes release between adapters and drops blur-stale repeats without retaining game listeners', async () => {
    const { EventEmitter } = await import('node:events'); const events = new EventEmitter(); const gameEvents = new EventEmitter();
    const pointer = { id: 1, isDown: true };
    const manager = { events, keyboard: { queue: [] as object[] }, pointers: [pointer], game: { events: gameEvents } };
    const input = new MockInputPlugin({ keyboard: true }); (input as any).manager = manager;
    const emit = (type: string, keyCode: string, repeat = false) => { manager.keyboard.queue.push({ type, keyCode, repeat }); events.emit('process'); };
    const first = new InputController({ input } as any); emit('keydown', 'ESC'); first.update(16); first.destroy();
    emit('keyup', 'ESC');
    const secondInput = new MockInputPlugin({ keyboard: true }); (secondInput as any).manager = manager;
    const second = new InputController({ input: secondInput } as any); const back = vi.fn(); second.onAction('back', back); second.quarantineUntilNeutral();
    second.update(16); expect(second.isQuarantined()).toBe(true); expect(second.isNeutral()).toBe(false);
    gameEvents.emit('blur'); second.update(16); expect(second.isQuarantined()).toBe(false); expect(second.isNeutral()).toBe(true);
    emit('keydown', 'ESC', true); second.update(16); expect(back).not.toHaveBeenCalled();
    emit('keyup', 'ESC'); emit('keydown', 'ESC'); second.update(16); expect(back).toHaveBeenCalledOnce();
    second.destroy(); gameEvents.emit('destroy'); expect(events.listenerCount('process')).toBe(0); expect(gameEvents.listenerCount('blur')).toBe(0);
  });
});

// Phaser's manager is an earlier game-destroy listener and nulls its game
// reference before the physical observer's final cleanup callback runs.
it('releases physical listeners after Phaser has destroyed its InputManager', async () => {
  const { EventEmitter } = await import('node:events');
  const events = new EventEmitter(); const gameEvents = new EventEmitter();
  const manager = { events, keyboard: { queue: [] }, pointers: [], game: { events: gameEvents } as { events: typeof gameEvents } | null };
  gameEvents.once('destroy', () => { events.removeAllListeners(); manager.game = null; });
  const input = new MockInputPlugin({ keyboard: true }); (input as any).manager = manager;
  const controller = new InputController({ input, game: { events: gameEvents } } as any);
  controller.destroy();
  expect(() => gameEvents.emit('destroy')).not.toThrow();
  expect(events.listenerCount('process')).toBe(0);
  expect(gameEvents.listenerCount('blur')).toBe(0);
  expect(gameEvents.listenerCount('destroy')).toBe(0);
});

it.each([
  ['A', 'D', { x: -1, y: 0 }],
  ['W', 'S', { x: 0, y: -1 }],
] as const)('requires both opposed %s/%s physical keys to release across scene handoff', async (firstKey, secondKey, freshVector) => {
  const { EventEmitter } = await import('node:events');
  const events = new EventEmitter(); const gameEvents = new EventEmitter();
  const manager = { events, keyboard: { queue: [] as object[] }, pointers: [], game: { events: gameEvents } };
  const physical = (type: string, keyCode: string) => { manager.keyboard.queue.push({ type, keyCode }); events.emit('process'); };
  const oldInput = new MockInputPlugin({ keyboard: true }); (oldInput as any).manager = manager;
  const old = new InputController({ input: oldInput } as any);
  physical('keydown', firstKey); physical('keydown', secondKey); old.update(16); old.destroy();
  const input = new MockInputPlugin({ keyboard: true }); (input as any).manager = manager;
  const next = new InputController({ input } as any); next.quarantineUntilNeutral(); next.update(16);
  expect(next.isQuarantined()).toBe(true); expect(next.isNeutral()).toBe(false);
  physical('keyup', secondKey); next.update(16);
  expect(next.isQuarantined()).toBe(true); expect(next.isNeutral()).toBe(false);
  expect(next.getMoveVector()).toEqual({ x: 0, y: 0 });
  physical('keyup', firstKey); next.update(16);
  expect(next.isQuarantined()).toBe(false); expect(next.isNeutral()).toBe(true);
  physical('keydown', firstKey); next.update(16);
  expect(next.getMoveVector()).toEqual(freshVector);
  next.destroy(); gameEvents.emit('destroy');
});

// Use the installed real Phaser Gamepad constructor/update, not a fake which
// eagerly populates wrapper state. New scene wrappers are initially all zero,
// and Phaser skips samples older than their creation timestamp.
async function realPadScene(nativePads: any[]) {
  const { EventEmitter } = await import('node:events');
  const { createRequire } = await import('node:module');
  const RealGamepad = createRequire(import.meta.url)('phaser/src/input/gamepad/Gamepad.js');
  const input = new MockInputPlugin({ keyboard: true });
  const plugin = new EventEmitter() as any;
  plugin.gamepads = nativePads.map(native => new RealGamepad(plugin, native));
  (input as any).gamepad = plugin;
  const controller = new InputController({ input } as any);
  const sample = () => {
    nativePads.forEach((native, index) => { native.timestamp = performance.now(); plugin.gamepads[index].update(native); });
  };
  return { controller, pads: plugin.gamepads, sample };
}
function nativePad(index: number, held: 'confirm' | 'stick') {
  return { id: `controller-${index}`, index, connected: true, timestamp: 0,
    buttons: Array.from({ length: 17 }, (_, button) => ({ pressed: held === 'confirm' && button === 0, value: held === 'confirm' && button === 0 ? 1 : 0, touched: false })),
    axes: held === 'stick' ? [1, 0, 0, 0] : [0, 0, 0, 0] };
}
it.each(['confirm', 'stick'] as const)('quarantines a physical %s across actual Phaser wrapper recreation and stale samples', async held => {
  const native = nativePad(0, held);
  const old = await realPadScene([native]); old.sample(); old.controller.update(16); old.controller.destroy();
  const next = await realPadScene([native]); const confirm = vi.fn(); next.controller.onAction('confirm', confirm);
  next.controller.quarantineUntilNeutral();
  expect(next.pads[0].buttons[0].pressed).toBe(false); expect(next.pads[0].leftStick.x).toBe(0);
  for (let poll = 0; poll < 4; poll += 1) {
    // Unchanged physical state retains its old timestamp, so the actual
    // Phaser update returns without hydrating the wrapper on every pass.
    next.pads[0].update(native); next.controller.update(16);
    expect(next.controller.isQuarantined()).toBe(true); expect(next.controller.isNeutral()).toBe(false);
  }
  next.sample(); next.controller.update(16);
  expect(confirm).not.toHaveBeenCalled(); expect(next.controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  native.buttons[0].pressed = false; native.buttons[0].value = 0; native.axes[0] = 0;
  next.sample(); next.controller.update(16); expect(next.controller.isQuarantined()).toBe(false); expect(next.controller.isNeutral()).toBe(true);
  native.buttons[0].pressed = held === 'confirm'; native.buttons[0].value = held === 'confirm' ? 1 : 0; native.axes[0] = held === 'stick' ? 1 : 0;
  next.sample(); next.controller.update(16); next.controller.update(16);
  expect(confirm).toHaveBeenCalledTimes(held === 'confirm' ? 1 : 0);
  expect(next.controller.getMoveVector()).toEqual(held === 'stick' ? { x: 1, y: 0 } : { x: 0, y: 0 });
  next.controller.destroy(); next.pads[0].destroy(); old.pads[0].destroy();
});
it('requires all connected physical pads to release before fresh Confirm rearms', async () => {
  const first = nativePad(0, 'confirm'); const second = nativePad(1, 'confirm');
  const next = await realPadScene([first, second]); const confirm = vi.fn(); next.controller.onAction('confirm', confirm);
  next.controller.quarantineUntilNeutral(); next.controller.update(16); expect(next.controller.isQuarantined()).toBe(true); expect(next.controller.isNeutral()).toBe(false);
  first.buttons[0].pressed = false; first.buttons[0].value = 0;
  next.sample(); next.controller.update(16); expect(next.controller.isQuarantined()).toBe(true); expect(next.controller.isNeutral()).toBe(false);
  second.buttons[0].pressed = false; second.buttons[0].value = 0;
  next.sample(); next.controller.update(16); expect(next.controller.isQuarantined()).toBe(false); expect(next.controller.isNeutral()).toBe(true);
  first.buttons[0].pressed = true; first.buttons[0].value = 1;
  next.sample(); next.controller.update(16); expect(confirm).toHaveBeenCalledOnce();
  next.controller.destroy(); next.pads.forEach((pad: any) => pad.destroy());
});
