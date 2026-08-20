import { describe, expect, it } from 'vitest';
import { length } from '../src/engine/vector';
import {
  LogicalInputCore,
  applyRadialDeadzone,
  type ActionEdge,
  type GameAction,
  type InputSource,
} from '../src/engine/logicalInput';

const DEFAULT_REPEAT = { delayMs: 400, intervalMs: 150 };

function createCore(repeat = DEFAULT_REPEAT) {
  return new LogicalInputCore({ navRepeat: repeat });
}

function edge(actions: readonly ActionEdge[], action: GameAction, source: InputSource) {
  return actions.some((e) => e.action === action && e.source === source);
}

function edgeCount(actions: readonly ActionEdge[], action: GameAction) {
  return actions.filter((e) => e.action === action).length;
}

function press(
  core: LogicalInputCore,
  source: InputSource,
  action: GameAction,
  dtMs = 16,
): readonly ActionEdge[] {
  core.setActionHeld(source, action, true);
  return core.update(dtMs);
}

function release(
  core: LogicalInputCore,
  source: InputSource,
  action: GameAction,
  dtMs = 16,
): readonly ActionEdge[] {
  core.setActionHeld(source, action, false);
  return core.update(dtMs);
}

describe('applyRadialDeadzone', () => {
  it('rescales [deadzone, 1] to [0, 1]', () => {
    expect(applyRadialDeadzone(0.25, 0.25)).toBeCloseTo(0, 10);
    expect(applyRadialDeadzone(0.625, 0.25)).toBeCloseTo(0.5, 10);
    expect(applyRadialDeadzone(1, 0.25)).toBeCloseTo(1, 10);
  });

  it('clamps values outside [0, 1]', () => {
    expect(applyRadialDeadzone(1.5, 0.25)).toBe(1);
    expect(applyRadialDeadzone(-0.5, 0.25)).toBe(0);
    expect(applyRadialDeadzone(0, 0.25)).toBe(0);
  });

  it('handles zero and negative deadzones as no deadzone', () => {
    expect(applyRadialDeadzone(0.5, 0)).toBe(0.5);
    expect(applyRadialDeadzone(1.2, 0)).toBe(1);
    expect(applyRadialDeadzone(0.5, -0.1)).toBe(0.5);
  });

  it('handles deadzone >= 1 as binary threshold', () => {
    expect(applyRadialDeadzone(0.99, 1)).toBe(0);
    expect(applyRadialDeadzone(1, 1)).toBe(1);
    expect(applyRadialDeadzone(1.2, 1)).toBe(1);
  });

  it('treats NaN and Infinity as zero output', () => {
    expect(applyRadialDeadzone(Number.NaN, 0.25)).toBe(0);
    expect(applyRadialDeadzone(Number.POSITIVE_INFINITY, 0.25)).toBe(1);
    expect(applyRadialDeadzone(Number.NEGATIVE_INFINITY, 0.25)).toBe(0);
  });
});

describe('LogicalInputCore action edges', () => {
  it('emits a pressed edge on the first held frame', () => {
    const core = createCore();

    const first = press(core, 'keyboard', 'confirm');
    expect(edge(first, 'confirm', 'keyboard')).toBe(true);
    expect(edgeCount(first, 'confirm')).toBe(1);

    const second = core.update(16);
    expect(edgeCount(second, 'confirm')).toBe(0);
  });

  it('emits one edge when two sources press the same action in the same frame', () => {
    const core = createCore();

    core.setActionHeld('keyboard', 'confirm', true);
    core.setActionHeld('gamepad', 'confirm', true);
    const edges = core.update(16);

    expect(edgeCount(edges, 'confirm')).toBe(1);
    expect(core.isEffectiveHeld('confirm')).toBe(true);
  });

  it('emits no edge while any source keeps the action held', () => {
    const core = createCore();

    press(core, 'keyboard', 'confirm');
    core.setActionHeld('gamepad', 'confirm', true);
    expect(edgeCount(core.update(16), 'confirm')).toBe(0);

    core.setActionHeld('keyboard', 'confirm', false);
    expect(edgeCount(core.update(16), 'confirm')).toBe(0);

    core.setActionHeld('gamepad', 'confirm', false);
    expect(edgeCount(core.update(16), 'confirm')).toBe(0);
  });

  it('emits a new edge only after all sources release and one re-presses', () => {
    const core = createCore();

    press(core, 'keyboard', 'confirm');
    release(core, 'keyboard', 'confirm');

    const edges = press(core, 'keyboard', 'confirm');
    expect(edgeCount(edges, 'confirm')).toBe(1);
  });

  it('tracks per-source held state independently', () => {
    const core = createCore();

    press(core, 'keyboard', 'confirm');
    press(core, 'gamepad', 'back');

    expect(core.isHeld('keyboard', 'confirm')).toBe(true);
    expect(core.isHeld('gamepad', 'confirm')).toBe(false);
    expect(core.isHeld('gamepad', 'back')).toBe(true);
    expect(core.isEffectiveHeld('confirm')).toBe(true);
    expect(core.isEffectiveHeld('back')).toBe(true);
  });

  it('clears a source without emitting edges', () => {
    const core = createCore();

    press(core, 'keyboard', 'confirm');
    core.clearSource('keyboard');
    const edges = core.update(16);

    expect(edgeCount(edges, 'confirm')).toBe(0);
    expect(core.isEffectiveHeld('confirm')).toBe(false);
  });

  it('uses deterministic source order for coalesced edges', () => {
    const core = createCore();

    core.setActionHeld('pointer', 'confirm', true);
    core.setActionHeld('keyboard', 'confirm', true);
    const edges = core.update(16);

    expect(edgeCount(edges, 'confirm')).toBe(1);
    expect(edges[0].source).toBe('keyboard');
  });
});

describe('LogicalInputCore nav repeat', () => {
  it('emits the initial edge then waits for the delay', () => {
    const core = createCore();

    const initial = press(core, 'keyboard', 'navDown');
    expect(edgeCount(initial, 'navDown')).toBe(1);

    const duringDelay = core.update(400 - 16 - 1);
    expect(edgeCount(duringDelay, 'navDown')).toBe(0);

    const firstRepeat = core.update(1);
    expect(edgeCount(firstRepeat, 'navDown')).toBe(1);
  });

  it('repeats at the configured interval', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navDown', 200);
    expect(edgeCount(core.update(100), 'navDown')).toBe(1);
    expect(edgeCount(core.update(100), 'navDown')).toBe(1);
    expect(edgeCount(core.update(100), 'navDown')).toBe(1);
  });

  it('catches up across a large dt without losing repeat edges', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navDown', 200);
    const edges = core.update(350);

    expect(edgeCount(edges, 'navDown')).toBe(3);
  });

  it('resets repeat state on release', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navDown', 300);
    release(core, 'keyboard', 'navDown');

    const afterRepress = press(core, 'keyboard', 'navDown', 100);
    expect(edgeCount(afterRepress, 'navDown')).toBe(1);
  });

  it('resets repeat timer on direction change', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navUp', 300);
    const switchEdges = press(core, 'keyboard', 'navDown', 50);

    expect(edgeCount(switchEdges, 'navDown')).toBe(1);
    expect(edgeCount(switchEdges, 'navUp')).toBe(0);

    const tooSoon = core.update(149);
    expect(edgeCount(tooSoon, 'navDown')).toBe(0);

    const firstRepeat = core.update(51);
    expect(edgeCount(firstRepeat, 'navDown')).toBe(1);
  });

  it('does not repeat an older direction while a newer direction is held', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navUp', 300);
    press(core, 'keyboard', 'navDown', 500);

    const olderStillHeld = core.update(200);
    expect(edgeCount(olderStillHeld, 'navUp')).toBe(0);
    expect(edgeCount(olderStillHeld, 'navDown')).toBe(2);
  });

  it('does not burst-catch-up a superseded nav direction when re-selected', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    const initial = press(core, 'keyboard', 'navDown', 300); // initial edge + 2 repeats
    expect(edgeCount(initial, 'navDown')).toBe(3);

    press(core, 'keyboard', 'navUp', 50); // switches the active nav direction
    release(core, 'keyboard', 'navUp', 16); // navDown is re-selected while still held

    const afterReselect = core.update(300);
    expect(edgeCount(afterReselect, 'navDown')).toBe(0); // no catch-up burst

    // A fresh press still restarts the repeat delay from zero.
    release(core, 'keyboard', 'navDown', 16);
    const repress = press(core, 'keyboard', 'navDown', 100);
    expect(edgeCount(repress, 'navDown')).toBe(1);

    const afterDelay = core.update(100);
    expect(edgeCount(afterDelay, 'navDown')).toBe(1);
  });
});

describe('LogicalInputCore movement ownership', () => {
  it('returns zero movement when no source is active', () => {
    const core = createCore();
    core.update(16);
    expect(core.getMovementVector()).toEqual({ x: 0, y: 0 });
    expect(core.getActiveMovementSource()).toBeNull();
  });

  it('uses the only active movement source', () => {
    const core = createCore();

    core.setMovementSample('keyboard', { x: 1, y: 0 }, 0);
    core.update(16);

    expect(core.getMovementVector()).toEqual({ x: 1, y: 0 });
    expect(core.getActiveMovementSource()).toBe('keyboard');
  });

  it('keeps ownership until the active source drops below its deadzone', () => {
    const core = createCore();

    core.setMovementSample('pointer', { x: 1, y: 0 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');

    core.setMovementSample('keyboard', { x: 0, y: 1 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');

    core.setMovementSample('pointer', { x: 0, y: 0 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('keyboard');
  });

  it('claims ownership by the most recent source to exceed its deadzone', () => {
    const core = createCore();

    core.setMovementSample('keyboard', { x: 1, y: 0 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('keyboard');

    core.setMovementSample('keyboard', { x: 0, y: 0 }, 0);
    core.setMovementSample('gamepad', { x: 0, y: 1 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');

    core.setMovementSample('gamepad', { x: 0, y: 0 }, 0);
    core.setMovementSample('pointer', { x: -1, y: 0 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');
  });

  it('does not sum movement vectors across sources', () => {
    const core = createCore();

    core.setMovementSample('keyboard', { x: 1, y: 0 }, 0);
    core.setMovementSample('pointer', { x: 0, y: 1 }, 0);
    core.update(16);

    const vector = core.getMovementVector();
    expect(length(vector)).toBeLessThanOrEqual(1);
    expect(vector.x * vector.y).toBe(0);
    expect(vector.x === 1 || vector.y === 1).toBe(true);
  });

  it('applies per-source deadzones independently', () => {
    const core = createCore();

    core.setMovementSample('gamepad', { x: 0.2, y: 0 }, 0.25);
    core.update(16);
    expect(core.getActiveMovementSource()).toBeNull();

    core.setMovementSample('gamepad', { x: 0.5, y: 0 }, 0.25);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');
  });

  it('clears movement state on source disconnect', () => {
    const core = createCore();

    core.setMovementSample('gamepad', { x: 1, y: 0 }, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');

    core.clearSource('gamepad');
    core.update(16);
    expect(core.getActiveMovementSource()).toBeNull();
    expect(core.getMovementVector()).toEqual({ x: 0, y: 0 });
  });
});

describe('LogicalInputCore determinism and purity', () => {
  it('consumes no RNG and imports no Phaser', () => {
    const core = createCore();

    core.setActionHeld('keyboard', 'confirm', true);
    core.setMovementSample('pointer', { x: 0.5, y: 0 }, 0);
    const first = core.update(16);

    const other = createCore();
    other.setActionHeld('keyboard', 'confirm', true);
    other.setMovementSample('pointer', { x: 0.5, y: 0 }, 0);
    const second = other.update(16);

    expect(first).toEqual(second);
  });
});
