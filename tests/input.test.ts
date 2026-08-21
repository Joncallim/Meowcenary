import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockInputPlugin, MockGamepad } from './__mocks__/phaser';
import type Phaser from 'phaser';
import { InputController } from '../src/systems/input';

function createScene(options: { keyboard?: boolean; gamepad?: boolean } = {}) {
  const input = new MockInputPlugin(options);
  const scene = { input } as unknown as Phaser.Scene;
  return { scene, input };
}

function createController(options: { keyboard?: boolean; gamepad?: boolean } = {}) {
  const { scene, input } = createScene(options);
  const controller = new InputController(scene);
  return { controller, input };
}

describe('InputController keyboard movement', () => {
  it('preserves single-key movement and normalized diagonals', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    input.keyboard!.keyup('d');
    input.keyboard!.keydown('w');
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: -1 });

    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(-Math.SQRT1_2, 10);

    input.keyboard!.keyup('d');
    input.keyboard!.keyup('w');
    input.keyboard!.keydown('left');
    input.keyboard!.keydown('down');
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(-Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('returns a zero vector when no keys are held', () => {
    const { controller } = createController({ keyboard: true });
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });
});

describe('InputController pointer movement', () => {
  it('scales pointer drag intent by the configured radius', () => {
    const { controller, input } = createController();

    input.pointerDown(100, 100);
    input.pointerMove(132, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0.5, y: 0 });
  });

  it('clamps combined keyboard and pointer intents to unit length', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    input.pointerDown(100, 100);
    input.pointerMove(132, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('ignores pointermove outside an active drag', () => {
    const { controller, input } = createController();

    input.pointerMove(132, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('pins movement to the pointer that began the gesture and ignores later pointers (D8)', () => {
    const { controller, input } = createController();

    // Finger 1 starts the stick gesture at (100, 100).
    input.pointerDown(100, 100);
    controller.update(16);

    // Finger 2 taps a UI button elsewhere, then drags: it must NOT re-anchor
    // the stick origin or inject movement.
    input.pointerDown(200, 200, 1);
    input.pointerMove(264, 200, 1);
    controller.update(16);

    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
    expect(controller.getPresentationSnapshot().pointerStart).toEqual({ x: 100, y: 100 });
    expect(controller.getPresentationSnapshot().pointerCurrent).toEqual({ x: 100, y: 100 });

    // Releasing the non-pinned finger must NOT end movement.
    input.pointerUp(1);
    controller.update(16);

    // The pinned finger still drives movement.
    input.pointerMove(164, 100);
    controller.update(16);
    expect(controller.getMoveVector().x).toBeGreaterThan(0);

    // Releasing the pinned finger ends movement.
    input.pointerUp();
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('restores keyboard-only movement after the pointer is released', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    input.pointerDown(100, 100);
    input.pointerMove(164, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    input.pointerUp();
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
    expect(controller.getPointer()).toBeNull();

    input.keyboard!.keyup('d');
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('returns fresh copies from getMoveVector and getPointer', () => {
    const { controller, input } = createController();

    const move = controller.getMoveVector();
    move.x = 5;
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });

    input.pointerDown(100, 100);
    input.pointerMove(132, 100);
    controller.update(16);
    const pointer = controller.getPointer();
    if (pointer) pointer.x = 999;
    expect(controller.getPointer()).toEqual({ x: 132, y: 100 });
  });
});

describe('InputController gamepad adapter', () => {
  it('reads left-stick movement and applies the deadzone', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    pad.setLeftStick(0.1, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });

    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    pad.setLeftStick(0, 1);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 1 });
  });

  it('D-pad drives navigation only; movement comes from the left stick (Epic 19 §4)', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const navLeft = vi.fn();
    const navRight = vi.fn();
    controller.onAction('navLeft', navLeft);
    controller.onAction('navRight', navRight);

    // D-pad left: nav edge, but the analog movement vector stays zero.
    pad.setButton(14, true);
    controller.update(16);
    expect(navLeft).toHaveBeenCalledTimes(1);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });

    pad.setButton(14, false);
    pad.setButton(15, true);
    controller.update(16);
    expect(navRight).toHaveBeenCalledTimes(1);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });

    // Left stick still drives movement independently.
    pad.setButton(15, false);
    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('ignores disconnected pads still occupying gamepad slots (D2/D3)', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    pad.setLeftStick(0.75, 0);
    pad.setButton(0, true); // confirm held before disconnect
    controller.update(16);
    expect(controller.getMoveVector().x).toBeGreaterThan(0);

    // Real Phaser keeps the disconnected wrapper in the slot with stale
    // values; the adapter must exclude it by the connected flag.
    input.gamepad!.disconnect(pad);
    pad.setLeftStick(0.75, 0); // stale state remains on the wrapper
    pad.setButton(0, true);
    controller.update(16);

    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
    const confirm = vi.fn();
    controller.onAction('confirm', confirm);
    controller.update(16);
    expect(confirm).not.toHaveBeenCalled();

    // A reconnected pad works again.
    input.gamepad!.connect(pad);
    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('does not crash on a short (non-standard) pad (D5)', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);
    pad.clearButtons(); // fewer than 16 buttons — real Phaser isButtonDown throws

    expect(() => controller.update(16)).not.toThrow();
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });

  it('emits action edges for face and d-pad buttons', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const handler = vi.fn();
    controller.onAction('confirm', handler);

    pad.setButton(0, true);
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'confirm', source: 'gamepad' }));

    pad.setButton(0, false);
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('selects gamepad mode on stick movement', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('gamepad');
  });

  it('clears gamepad state on disconnect', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    input.gamepad!.disconnect(pad);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 });
  });
});

describe('InputController action subscriptions', () => {
  it('calls per-action handlers only for the subscribed action', () => {
    const { controller, input } = createController({ keyboard: true });

    const pauseHandler = vi.fn();
    const inventoryHandler = vi.fn();
    controller.onAction('pause', pauseHandler);
    controller.onAction('inventory', inventoryHandler);

    input.keyboard!.keydown('p');
    controller.update(16);
    expect(pauseHandler).toHaveBeenCalledTimes(1);
    expect(inventoryHandler).not.toHaveBeenCalled();

    input.keyboard!.keydown('i');
    controller.update(16);
    expect(pauseHandler).toHaveBeenCalledTimes(1);
    expect(inventoryHandler).toHaveBeenCalledTimes(1);
  });

  it('calls onAnyAction handlers for every edge', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    controller.onAnyAction(handler);

    input.keyboard!.keydown('p');
    controller.update(16);
    input.keyboard!.keydown('esc');
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: 'pause' }));
    expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: 'back' }));
  });

  it('unsubscribe removes the handler', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    const unsubscribe = controller.onAction('pause', handler);
    unsubscribe();

    input.keyboard!.keydown('p');
    controller.update(16);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not emit repeated edges while an action is held', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    controller.onAction('pause', handler);

    input.keyboard!.keydown('p');
    controller.update(16);
    controller.update(16);
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);

    input.keyboard!.keyup('p');
    controller.update(16);
    input.keyboard!.keydown('p');
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('delivers the current edge to a sibling handler unsubscribed mid-dispatch', () => {
    const { controller, input } = createController({ keyboard: true });

    const calls: string[] = [];
    let unsubscribeSibling: () => void = () => {};
    const sibling = vi.fn(() => calls.push('sibling'));
    const first = vi.fn(() => {
      calls.push('first');
      unsubscribeSibling();
    });

    controller.onAction('pause', first);
    unsubscribeSibling = controller.onAction('pause', sibling);

    input.keyboard!.keydown('p');
    controller.update(16);

    expect(first).toHaveBeenCalledTimes(1);
    expect(sibling).toHaveBeenCalledTimes(1); // still received the in-flight edge
    expect(calls).toEqual(['first', 'sibling']);

    // The sibling is now unsubscribed; a later edge must not reach it.
    input.keyboard!.keyup('p');
    controller.update(16);
    input.keyboard!.keydown('p');
    controller.update(16);
    expect(first).toHaveBeenCalledTimes(2);
    expect(sibling).toHaveBeenCalledTimes(1);
  });

  it('does not deliver the in-flight edge to a handler subscribed mid-dispatch', () => {
    const { controller, input } = createController({ keyboard: true });

    const late = vi.fn();
    const early = vi.fn(() => {
      controller.onAction('pause', late);
    });
    controller.onAction('pause', early);

    input.keyboard!.keydown('p');
    controller.update(16);

    expect(early).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled(); // not part of the copied snapshot

    // The late subscriber receives the next genuine edge.
    input.keyboard!.keyup('p');
    controller.update(16);
    input.keyboard!.keydown('p');
    controller.update(16);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('does not deliver the in-flight edge to an onAnyAction handler subscribed mid-dispatch', () => {
    const { controller, input } = createController({ keyboard: true });

    const late = vi.fn();
    const early = vi.fn(() => {
      controller.onAnyAction(late);
    });
    controller.onAnyAction(early);

    input.keyboard!.keydown('p');
    controller.update(16);

    expect(early).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();

    input.keyboard!.keyup('p');
    controller.update(16);
    input.keyboard!.keydown('p');
    controller.update(16);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('InputController presentation snapshots', () => {
  it('freezes the snapshot and every vector', () => {
    const { controller } = createController();

    const idle = controller.getPresentationSnapshot();
    expect(Object.isFrozen(idle)).toBe(true);
    expect(Object.isFrozen(idle.moveVector)).toBe(true);
    expect(idle.pointerStart).toBeNull();
    expect(idle.pointerCurrent).toBeNull();
    expect(idle.moveVector).toEqual({ x: 0, y: 0 });

    const { controller: active, input } = createController();
    input.pointerDown(100, 100);
    input.pointerMove(132, 100);
    active.update(16);

    const snapshot = active.getPresentationSnapshot();
    expect(Object.isFrozen(snapshot.pointerStart)).toBe(true);
    expect(Object.isFrozen(snapshot.pointerCurrent)).toBe(true);
    expect(snapshot.pointerStart).toEqual({ x: 100, y: 100 });
    expect(snapshot.pointerCurrent).toEqual({ x: 132, y: 100 });
  });

  it('rejects mutation of the snapshot and its vectors without leaking into the controller', () => {
    const { controller, input } = createController();

    input.pointerDown(100, 100);
    input.pointerMove(132, 100);
    controller.update(16);

    const snapshot = controller.getPresentationSnapshot();
    expect(() => {
      (snapshot.moveVector as { x: number }).x = 99;
    }).toThrow();
    expect(() => {
      (snapshot.pointerStart as { x: number }).x = 99;
    }).toThrow();
    expect(() => {
      (snapshot as { mode: string }).mode = 'keyboard';
    }).toThrow();

    const fresh = controller.getPresentationSnapshot();
    expect(fresh.moveVector).toEqual({ x: 0.5, y: 0 });
    expect(fresh.pointerStart).toEqual({ x: 100, y: 100 });
    expect(fresh.mode).toBe('pointer');
  });

  it('reflects live state on every call', () => {
    const { controller, input } = createController();

    const before = controller.getPresentationSnapshot();
    input.pointerDown(200, 300);
    input.pointerMove(232, 300);
    controller.update(16);

    const after = controller.getPresentationSnapshot();
    expect(after).not.toBe(before);
    expect(after.pointerStart).toEqual({ x: 200, y: 300 });
    expect(after.moveVector).toEqual({ x: 0.5, y: 0 });
  });
});

describe('InputController mode switching', () => {
  it('starts in pointer mode', () => {
    const { controller } = createController();
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });

  it('a non-zero keyboard vector selects keyboard mode', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('a');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('idle updates do not flap the mode back to pointer', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('a');
    controller.update(16);
    input.keyboard!.keyup('a');
    controller.update(16);
    controller.update(16);

    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('pointer down selects pointer mode and a later keyboard vector returns to keyboard', () => {
    const { controller, input } = createController({ keyboard: true });

    input.pointerDown(100, 100);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');

    input.pointerUp();
    controller.update(16);

    input.keyboard!.keyup('d');
    input.pointerDown(200, 200);
    input.pointerMove(232, 200);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });
});

describe('InputController joystick clamp', () => {
  it('maps a full-radius drag to a unit vector', () => {
    const { controller, input } = createController();

    input.pointerDown(100, 100);
    input.pointerMove(164, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('clamps drags beyond the radius at unit length', () => {
    const { controller, input } = createController();

    input.pointerDown(100, 100);
    input.pointerMove(228, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });

    input.pointerDown(100, 100);
    input.pointerMove(228, 228);
    controller.update(16);
    expect(controller.getMoveVector().x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(controller.getMoveVector().y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('scales short drags linearly with the radius', () => {
    const { controller, input } = createController();

    input.pointerDown(100, 100);
    input.pointerMove(116, 100);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0.25, y: 0 });

    input.pointerDown(100, 100);
    input.pointerMove(100, 132);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0.5 });
  });
});

describe('InputController destroy', () => {
  it('removes every pointer listener', () => {
    const { controller, input } = createController();

    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(input.listenerCount(event)).toBe(1);
    }

    controller.destroy();

    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
      expect(input.listenerCount(event)).toBe(0);
    }
  });

  it('pointer events after destroy cannot change controller state', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    controller.update(16);
    controller.destroy();

    input.pointerDown(100, 100);
    input.pointerMove(200, 200);
    input.pointerUp();
    controller.update(16);

    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
    expect(controller.getPointer()).toBeNull();
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
    expect(controller.getPresentationSnapshot().pointerStart).toBeNull();
  });
});

describe('InputController active-mode tracking (Epic 19 D7)', () => {
  it('switches mode to keyboard on a confirm edge without any movement', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('enter');
    controller.update(16);

    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('switches mode to gamepad on a face-button edge without any stick movement', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    pad.setButton(0, true); // bottom face button = confirm
    controller.update(16);

    expect(controller.getPresentationSnapshot().mode).toBe('gamepad');
  });

  it('a bare pointerdown (no move) switches mode to pointer', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');

    input.keyboard!.keyup('d');
    controller.update(16);

    input.pointerDown(200, 200); // tap, no drag
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
  });

  it('a second-pointer down signals pointer mode without re-anchoring the pinned gesture', () => {
    const { controller, input } = createController({ keyboard: true });

    // Pin pointer 0 to begin the movement gesture.
    input.pointerDown(100, 100);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    // Switch to keyboard via a keyboard action edge (no movement required).
    input.keyboard!.keydown('enter');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
    input.keyboard!.keyup('enter');
    controller.update(16);

    // A second finger tapping a UI control must signal pointer mode...
    input.pointerDown(200, 200, 1);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    // ...but must NOT re-anchor the pinned movement gesture.
    const snapshot = controller.getPresentationSnapshot();
    expect(snapshot.pointerStart).toEqual({ x: 100, y: 100 });
    expect(snapshot.pointerCurrent).toEqual({ x: 100, y: 100 });

    // The pinned finger still drives movement.
    input.pointerMove(164, 100, 0);
    controller.update(16);
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('a gamepad confirm edge while keyboard movement is held presents gamepad mode (D4 owner unchanged)', () => {
    const { controller, input } = createController({ keyboard: true, gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    // Hold keyboard movement: D4 owner is keyboard.
    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');

    // An action edge from another device must change the PRESENTED source
    // (D7) even though movement is still held from the keyboard...
    pad.setButton(0, true); // bottom face button = confirm
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('gamepad');

    // ...while the D4 movement-owner hysteresis is untouched.
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('a keyboard confirm edge while pointer movement is held presents keyboard mode', () => {
    const { controller, input } = createController({ keyboard: true });

    // Hold pointer movement (drag beyond the stick radius).
    input.pointerDown(100, 100);
    input.pointerMove(164, 100);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    input.keyboard!.keydown('enter');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });

  it('a bare pointerdown while keyboard movement is held presents pointer mode and persists across polls', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');

    // Bare tap: no drag, no edge. D7: the pointerdown is the most recent
    // event and must win over the HELD movement state.
    input.pointerDown(200, 200);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    // The held keyboard movement must not clobber the pointerdown on later
    // polls — pointer mode persists until a later event acts.
    controller.update(16);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 });
  });

  it('an action edge after a pointerdown wins (later event), even while keyboard movement is held', () => {
    const { controller, input } = createController({ keyboard: true });

    input.keyboard!.keydown('d');
    controller.update(16);

    input.pointerDown(200, 200);
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('pointer');

    // The keyboard edge fires AFTER the pointerdown: later wins (D7).
    input.keyboard!.keydown('enter');
    controller.update(16);
    expect(controller.getPresentationSnapshot().mode).toBe('keyboard');
  });
});

describe('InputController gamepad left-stick navigation (Epic 19 §4)', () => {
  it('projects a full-right left-stick deflection onto navRight', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const handler = vi.fn();
    controller.onAction('navRight', handler);

    pad.setLeftStick(1, 0);
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'navRight', source: 'gamepad' }),
    );
    expect(controller.getPresentationSnapshot().mode).toBe('gamepad');
  });

  it('projects a full-up left-stick deflection onto navUp', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const handler = vi.fn();
    controller.onAction('navUp', handler);

    pad.setLeftStick(0, -1);
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'navUp', source: 'gamepad' }),
    );
  });

  it('does not project stick deflections at or below navThreshold', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const handler = vi.fn();
    controller.onAction('navRight', handler);

    pad.setLeftStick(0.5, 0); // exactly at navThreshold: no projection
    controller.update(16);
    expect(handler).not.toHaveBeenCalled();

    pad.setLeftStick(0.51, 0); // just beyond navThreshold
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('combines D-pad and left-stick projection with OR semantics', () => {
    const { controller, input } = createController({ gamepad: true });
    const pad = new MockGamepad(0);
    input.gamepad!.connect(pad);

    const leftHandler = vi.fn();
    const rightHandler = vi.fn();
    controller.onAction('navLeft', leftHandler);
    controller.onAction('navRight', rightHandler);

    // D-pad left + stick right in the same frame: both are genuine inputs.
    pad.setButton(14, true);
    pad.setLeftStick(1, 0);
    controller.update(16);
    expect(leftHandler).toHaveBeenCalledTimes(1);
    expect(rightHandler).toHaveBeenCalledTimes(1);
  });
});

describe('InputController polled keyboard actions (Epic 19 D3)', () => {
  it('emits an action edge for a key already held when the adapter attached', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    controller.onAction('confirm', handler);

    input.keyboard!.holdKey('enter'); // held before any key event fires
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'confirm', source: 'keyboard' }),
    );
  });

  it('does not double-fire an edge for a held key across polls', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    controller.onAction('confirm', handler);

    input.keyboard!.holdKey('enter');
    controller.update(16);
    controller.update(16);
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(1);

    input.keyboard!.keyup('enter');
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('maps Q to the reserved ability action with no consumer (D11)', () => {
    const { controller, input } = createController({ keyboard: true });

    const handler = vi.fn();
    controller.onAction('ability', handler);

    input.keyboard!.keydown('q');
    controller.update(16);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'ability', source: 'keyboard' }),
    );

    input.keyboard!.keyup('q');
    controller.update(16);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
