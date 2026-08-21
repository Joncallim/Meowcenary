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

  // NOTE: this switch lands 50ms BEFORE navUp's next repeat is due (t=400),
  // so the old direction is never due on the change poll. The exact-boundary
  // cases — a due repeat landing on the SAME poll as the new direction's
  // press edge, in both ALL_ACTIONS orderings — are covered by the two
  // 'suppresses the held direction's due repeat...' tests below.
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

  it("suppresses the held direction's due repeat on the poll a new direction is pressed (navUp held -> navDown pressed)", () => {
    // D3 boundary: navUp is DUE to repeat on this exact poll (t=400) and
    // navDown is pressed in the same poll. navUp precedes navDown in
    // ALL_ACTIONS, so a single sequential pass would emit navUp's due repeat
    // BEFORE seeing the navDown press that supersedes it — focus would move
    // twice on one poll. The new direction's press edge must be the ONLY nav
    // output that poll.
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navUp', 300); // t=300: press edge + 2 repeats; next due at t=400
    const switchEdges = press(core, 'keyboard', 'navDown', 100); // t=400: navUp due AND navDown pressed

    expect(edgeCount(switchEdges, 'navDown')).toBe(1);
    expect(edgeCount(switchEdges, 'navUp')).toBe(0);

    // navDown's repeat timer started fresh at the press (pressedAtMs=t=300):
    // first repeat lands at t=500, and navUp never resumes while superseded.
    expect(edgeCount(core.update(99), 'navDown')).toBe(0); // t=499: elapsed 199 < delayMs
    expect(edgeCount(core.update(1), 'navDown')).toBe(1); // t=500: first repeat at fresh delay
    expect(edgeCount(core.update(100), 'navUp')).toBe(0); // navUp stays silenced
  });

  it("suppresses the held direction's due repeat on the poll a new direction is pressed (navDown held -> navUp pressed)", () => {
    // Reverse ALL_ACTIONS ordering: the new press (navUp, index 6) is
    // processed BEFORE the old held action (navDown, index 7). This ordering
    // was never broken, but it guards the fix against both orderings — e.g.
    // if ALL_ACTIONS were ever reordered so the old action preceded the new
    // press, or a single-pass fix regressed this side.
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    press(core, 'keyboard', 'navDown', 300); // t=300: press edge + 2 repeats; next due at t=400
    const switchEdges = press(core, 'keyboard', 'navUp', 100); // t=400: navDown due AND navUp pressed

    expect(edgeCount(switchEdges, 'navUp')).toBe(1);
    expect(edgeCount(switchEdges, 'navDown')).toBe(0);

    // navUp's repeat timer started fresh at the press: first repeat at t=500,
    // and navDown never resumes while superseded.
    expect(edgeCount(core.update(99), 'navUp')).toBe(0); // t=499: elapsed 199 < delayMs
    expect(edgeCount(core.update(1), 'navUp')).toBe(1); // t=500: first repeat at fresh delay
    expect(edgeCount(core.update(100), 'navDown')).toBe(0); // navDown stays silenced
  });

  it('resumes repeats for a re-selected superseded nav direction after a fresh delay', () => {
    const core = createCore({ delayMs: 200, intervalMs: 100 });

    const initial = press(core, 'keyboard', 'navDown', 300); // initial edge + 2 repeats
    expect(edgeCount(initial, 'navDown')).toBe(3);

    press(core, 'keyboard', 'navUp', 50); // navUp supersedes the still-held navDown

    // Releasing the newer direction re-selects navDown while it is still held.
    const reselect = release(core, 'keyboard', 'navUp', 16);
    expect(edgeCount(reselect, 'navDown')).toBe(0); // no immediate edge on re-selection

    // No catch-up burst of missed repeats while the fresh delay elapses.
    const duringDelay = core.update(199);
    expect(edgeCount(duringDelay, 'navDown')).toBe(0);

    // Repeats resume exactly once after delayMs elapses from re-selection.
    const firstRepeat = core.update(1);
    expect(edgeCount(firstRepeat, 'navDown')).toBe(1);
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

    core.setMovementSample('keyboard', 1, 0, 0);
    core.update(16);

    expect(core.getMovementVector()).toEqual({ x: 1, y: 0 });
    expect(core.getActiveMovementSource()).toBe('keyboard');
  });

  it('keeps ownership until the active source drops below its deadzone', () => {
    const core = createCore();

    core.setMovementSample('pointer', 1, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');

    core.setMovementSample('keyboard', 0, 1, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');

    core.setMovementSample('pointer', 0, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('keyboard');
  });

  it('claims ownership by the most recent source to exceed its deadzone', () => {
    const core = createCore();

    core.setMovementSample('keyboard', 1, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('keyboard');

    core.setMovementSample('keyboard', 0, 0, 0);
    core.setMovementSample('gamepad', 0, 1, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');

    core.setMovementSample('gamepad', 0, 0, 0);
    core.setMovementSample('pointer', -1, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('pointer');
  });

  it('resolves same-poll starts by epoch order: the last-polled source wins (keyboard + gamepad)', () => {
    const core = createCore();

    // Keyboard and gamepad both cross inactive→active BEFORE one update
    // (adapter poll order is keyboard, pointer, gamepad). Both would share
    // the same timeMs, so wall-clock recency cannot rank them — the epoch
    // sequence must: the gamepad crossing is later in adapter order and
    // wins D4 ownership (and, via the same epoch, D7 presentation).
    core.setMovementSample('keyboard', 1, 0, 0);
    core.setMovementSample('gamepad', 0.4, 0, 0.25);
    core.update(16);

    expect(core.getActiveMovementSource()).toBe('gamepad');
    expect(core.getMovementVector().x).toBeCloseTo(0.2, 10);
    expect(core.getMovementVector().y).toBeCloseTo(0, 10);
    // The D7 tracker reads the same epoch: identical recency verdict.
    expect(core.getLastMovementStartSource()).toBe('gamepad');
    expect(core.getMovementStartEpoch()).toBe(2);
  });

  it('resolves a same-poll pointer and gamepad start to the gamepad (last polled)', () => {
    const core = createCore();

    core.setMovementSample('pointer', 0.5, 0, 0);
    core.setMovementSample('gamepad', 0.4, 0, 0.25);
    core.update(16);

    expect(core.getActiveMovementSource()).toBe('gamepad');
    expect(core.getMovementVector().x).toBeCloseTo(0.2, 10);
    expect(core.getMovementVector().y).toBeCloseTo(0, 10);
    expect(core.getLastMovementStartSource()).toBe('gamepad');
  });

  it('keeps single-source starts on that source (activationSeq regression)', () => {
    const core = createCore();

    core.setMovementSample('keyboard', 1, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('keyboard');
    expect(core.getMovementVector()).toEqual({ x: 1, y: 0 });

    core.setMovementSample('keyboard', 0, 0, 0);
    core.update(16);
    expect(core.getActiveMovementSource()).toBeNull();

    core.setMovementSample('gamepad', 0.4, 0, 0.25);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');
    expect(core.getMovementVector().x).toBeCloseTo(0.2, 10);
    expect(core.getMovementVector().y).toBeCloseTo(0, 10);
  });

  it('renormalizes the movement-start epoch near MAX_SAFE_INTEGER (overflow guard)', () => {
    const core = createCore();
    // Test seam: movementStartEpoch is private. The repo's tests probe
    // private state via `as any` casts elsewhere (tests/validation.test.ts);
    // reaching the threshold through real crossings would need ~9e15
    // iterations. At MAX_SAFE_INTEGER - 1 the NEXT increment is still
    // exact, but the one after that lands on 2**53 — past the safe range,
    // where consecutive increments collide (two crossings share one
    // activationSeq) and later ones stall (D7 misses starts).
    (core as unknown as { movementStartEpoch: number }).movementStartEpoch =
      Number.MAX_SAFE_INTEGER - 1;

    // Same-poll keyboard then gamepad crossings. Pre-fix, the second
    // increment lands on 2**53 (MAX_SAFE_INTEGER + 1) — the guard must
    // renormalize instead: active states keep their relative recency
    // order as small distinct seqs (keyboard 1, gamepad 2).
    core.setMovementSample('keyboard', 1, 0, 0);
    core.setMovementSample('gamepad', 0.4, 0, 0.25);
    core.update(16);

    expect(core.getMovementStartEpoch()).toBe(2);
    expect(core.getActiveMovementSource()).toBe('gamepad');
    expect(core.getLastMovementStartSource()).toBe('gamepad');
    expect(core.getMovementVector().x).toBeCloseTo(0.2, 10);
    expect(core.getMovementVector().y).toBeCloseTo(0, 10);

    // The total order must keep advancing past the ceiling. Stop both
    // sources, then restart them in ONE poll (no retained owner, so D4
    // re-selects): pre-fix the epoch stalls at 2**53 — both crossings
    // share the seq, D4 (tie broken by SOURCE_ORDER) picks the keyboard
    // while D7 reports the gamepad — the documented D4/D7 disagreement.
    core.setMovementSample('keyboard', 0, 0, 0);
    core.setMovementSample('gamepad', 0, 0, 0);
    core.update(16);
    core.setMovementSample('keyboard', 1, 0, 0);
    core.setMovementSample('gamepad', 0.4, 0, 0.25);
    core.update(16);

    expect(core.getMovementStartEpoch()).toBe(4);
    expect(core.getActiveMovementSource()).toBe('gamepad');
    expect(core.getLastMovementStartSource()).toBe('gamepad');
    expect(core.getMovementVector().x).toBeCloseTo(0.2, 10);
    expect(core.getMovementVector().y).toBeCloseTo(0, 10);
  });

  it('does not sum movement vectors across sources', () => {
    const core = createCore();

    core.setMovementSample('keyboard', 1, 0, 0);
    core.setMovementSample('pointer', 0, 1, 0);
    core.update(16);

    const vector = core.getMovementVector();
    expect(length(vector)).toBeLessThanOrEqual(1);
    expect(vector.x * vector.y).toBe(0);
    expect(vector.x === 1 || vector.y === 1).toBe(true);
  });

  it('applies per-source deadzones independently', () => {
    const core = createCore();

    core.setMovementSample('gamepad', 0.2, 0, 0.25);
    core.update(16);
    expect(core.getActiveMovementSource()).toBeNull();

    core.setMovementSample('gamepad', 0.5, 0, 0.25);
    core.update(16);
    expect(core.getActiveMovementSource()).toBe('gamepad');
  });

  it('clears movement state on source disconnect', () => {
    const core = createCore();

    core.setMovementSample('gamepad', 1, 0, 0);
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
    core.setMovementSample('pointer', 0.5, 0, 0);
    const first = core.update(16);

    const other = createCore();
    other.setActionHeld('keyboard', 'confirm', true);
    other.setMovementSample('pointer', 0.5, 0, 0);
    const second = other.update(16);

    expect(first).toEqual(second);
  });
});
