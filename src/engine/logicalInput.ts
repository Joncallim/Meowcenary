import { ZERO_VEC2, type Vec2 } from './vector';

export type GameAction =
  | 'confirm'
  | 'back'
  | 'pause'
  | 'inventory'
  | 'dash'
  | 'ability'
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight';

export type InputSource = 'keyboard' | 'pointer' | 'gamepad';

export interface ActionEdge {
  readonly action: GameAction;
  readonly source: InputSource;
}

export interface NavRepeatConfig {
  readonly delayMs: number;
  readonly intervalMs: number;
}

export interface LogicalInputCoreOptions {
  readonly navRepeat: NavRepeatConfig;
}

interface MovementState {
  vector: Vec2;
  active: boolean;
  // The movementStartEpoch at this state's last inactive→active crossing
  // (see setMovementSample). Because the epoch advances on EVERY crossing
  // in adapter poll order, the highest activationSeq among active states is
  // exactly "the most recent source to exceed its deadzone" — the D4
  // ownership rule. Scalar, preallocated — zero per-frame allocation. The
  // epoch is the shared recency clock with the D7 presentation tracker, so
  // D4 ownership and D7 presentation agree on same-poll movement starts by
  // construction. Initialized 0 (below any real crossing, which starts at 1).
  activationSeq: number;
}

interface NavState {
  pressedAtMs: number | null;
  repeatsEmitted: number;
}

export const ALL_ACTIONS: readonly GameAction[] = [
  'confirm',
  'back',
  'pause',
  'inventory',
  'dash',
  'ability',
  'navUp',
  'navDown',
  'navLeft',
  'navRight',
];

export const NAV_ACTIONS: readonly GameAction[] = [
  'navUp',
  'navDown',
  'navLeft',
  'navRight',
];

const SOURCE_ORDER: readonly InputSource[] = ['keyboard', 'pointer', 'gamepad'];

export function applyRadialDeadzone(value: number, deadzone: number): number {
  if (Number.isNaN(value) || value <= 0) {
    return 0;
  }

  if (deadzone <= 0) {
    return Math.min(value, 1);
  }

  if (deadzone >= 1) {
    return value >= 1 ? 1 : 0;
  }

  if (value < deadzone) {
    return 0;
  }

  const scaled = (value - deadzone) / (1 - deadzone);
  return Math.min(scaled, 1);
}

export class LogicalInputCore {
  private readonly held = new Map<InputSource, Set<GameAction>>();
  private readonly previousEffective = new Map<GameAction, boolean>();
  private readonly navStates = new Map<GameAction, NavState>();
  private readonly movementStates = new Map<InputSource, MovementState>();
  private readonly edges: ActionEdge[] = [];
  private timeMs = 0;
  private activeMovementSource: InputSource | null = null;
  private activeNavAction: GameAction | null = null;
  // Epic 19 D7: movement-START generation. A source crossing inactive→active
  // is a D7 signal INDEPENDENT of the D4 owner hysteresis (the owner is
  // retained while it stays beyond deadzone even when another source begins
  // moving, so the owner alone cannot reveal a movement START). Monotonic
  // scalar counters — zero per-frame allocation (Epic 19 §6 gate); the
  // controller diffs the generation across polls to detect a START.
  private movementStartEpoch = 0;
  private lastMovementStartSource: InputSource | null = null;

  constructor(private readonly options: LogicalInputCoreOptions) {
    for (const source of SOURCE_ORDER) {
      this.held.set(source, new Set());
    }

    for (const action of ALL_ACTIONS) {
      this.previousEffective.set(action, false);
    }

    for (const action of NAV_ACTIONS) {
      this.navStates.set(action, { pressedAtMs: null, repeatsEmitted: 0 });
    }

    for (const source of SOURCE_ORDER) {
      this.movementStates.set(source, {
        vector: { ...ZERO_VEC2 },
        active: false,
        activationSeq: 0,
      });
    }
  }

  setActionHeld(source: InputSource, action: GameAction, held: boolean): void {
    const set = this.held.get(source);
    if (!set) {
      return;
    }

    if (held) {
      set.add(action);
    } else {
      set.delete(action);
    }
  }

  isHeld(source: InputSource, action: GameAction): boolean {
    return this.held.get(source)?.has(action) ?? false;
  }

  isEffectiveHeld(action: GameAction): boolean {
    for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
      if (this.held.get(SOURCE_ORDER[i])?.has(action)) {
        return true;
      }
    }
    return false;
  }

  /** D4: radial deadzone rescaled [deadzone,1] → [0,1], then length-clamped to
   *  1. Scalar x/y inputs, mutates the preallocated movement vector in place —
   *  the poll path performs zero per-frame allocations (Epic 19 §6 gate). */
  setMovementSample(
    source: InputSource,
    x: number,
    y: number,
    deadzone: number,
  ): void {
    const state = this.movementStates.get(source);
    if (!state) {
      return;
    }

    const magnitude = Math.sqrt(x * x + y * y);
    const scaled = applyRadialDeadzone(magnitude, deadzone);
    const active = scaled > 0;
    const k = magnitude > 0 ? scaled / magnitude : 0;
    state.vector.x = x * k;
    state.vector.y = y * k;

    if (active && !state.active) {
      // Record the movement START (inactive→active crossing) for the D7
      // presentation tracker — scalar writes, zero allocation (§6 gate).
      // The epoch is the shared recency clock: the per-state activationSeq
      // stamps this crossing for D4 ownership, while lastMovementStartSource
      // feeds D7. Both therefore resolve same-poll starts to the LAST
      // crossing in adapter poll order (keyboard, pointer, gamepad).
      this.movementStartEpoch += 1;
      state.activationSeq = this.movementStartEpoch;
      this.lastMovementStartSource = source;
    }

    state.active = active;
  }

  clearSource(source: InputSource): void {
    const heldSet = this.held.get(source);
    if (heldSet) {
      heldSet.clear();
    }

    const movement = this.movementStates.get(source);
    if (movement) {
      movement.vector.x = 0;
      movement.vector.y = 0;
      movement.active = false;
    }
  }

  update(dtMs: number): readonly ActionEdge[] {
    this.timeMs += Math.max(0, dtMs);
    this.edges.length = 0;

    this.updateMovementOwner();
    this.updateActions(dtMs);

    return this.edges;
  }

  getMovementVector(): Readonly<Vec2> {
    if (this.activeMovementSource === null) {
      return { ...ZERO_VEC2 };
    }

    const state = this.movementStates.get(this.activeMovementSource);
    if (!state || !state.active) {
      return { ...ZERO_VEC2 };
    }

    return { x: state.vector.x, y: state.vector.y };
  }

  getActiveMovementSource(): InputSource | null {
    return this.activeMovementSource;
  }

  /** Monotonic generation advanced on every movement inactive→active
   *  crossing (a D7 movement START). Zero-allocation scalar read; the D7
   *  presentation tracker diffs it across polls. */
  getMovementStartEpoch(): number {
    return this.movementStartEpoch;
  }

  /** The source of the most recent movement START. Non-null iff the
   *  generation advanced since the previous poll (every increment records
   *  its source). */
  getLastMovementStartSource(): InputSource | null {
    return this.lastMovementStartSource;
  }

  private updateMovementOwner(): void {
    const ownerState =
      this.activeMovementSource !== null
        ? this.movementStates.get(this.activeMovementSource)
        : undefined;

    if (this.activeMovementSource !== null && (!ownerState || !ownerState.active)) {
      this.activeMovementSource = null;
    }

    if (this.activeMovementSource === null) {
      // D4: the most recent source to exceed its deadzone owns the move
      // vector. activationSeq stamps each inactive→active crossing with the
      // shared movementStartEpoch (monotonic, advanced in adapter poll
      // order), so the HIGHEST seq among active states is exactly the last
      // crossing — the same recency rule the D7 presentation tracker uses.
      // Unlike wall-clock lastActiveAtMs, the epoch distinguishes same-poll
      // starts (equal timeMs): the last-polled adapter always wins BOTH D4
      // ownership and D7 presentation (Epic 19 §4 agreement requirement).
      // Crossings never share a seq (each advances the epoch), so a strict >
      // comparison is total; the SOURCE_ORDER tie-break is unreachable.
      let bestSource: InputSource | null = null;
      let bestSeq = 0;

      for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
        const source = SOURCE_ORDER[i];
        const state = this.movementStates.get(source);
        if (state?.active && state.activationSeq > bestSeq) {
          bestSeq = state.activationSeq;
          bestSource = source;
        }
      }

      this.activeMovementSource = bestSource;
    }
  }

  private updateActions(dtMs: number): void {
    // Pass 1: settle press/release state. A fresh nav press emits its edge and
    // supersedes the prior direction's repeat state HERE, before any
    // held-direction repeat can fire — a due repeat must never share a poll
    // with the new direction's press edge (Epic 19 D3). A single sequential
    // pass is unsound: ALL_ACTIONS order puts navUp before navDown, so the
    // old code emitted navUp's due repeat before reaching the navDown press
    // that resets it (focus moved twice on one poll).
    for (let i = 0; i < ALL_ACTIONS.length; i += 1) {
      const action = ALL_ACTIONS[i];
      const effective = this.isEffectiveHeld(action);
      const wasEffective = this.previousEffective.get(action) ?? false;

      if (effective) {
        if (!wasEffective) {
          this.emitEdge(action);
          this.initializeNavState(action, dtMs);
        }
      } else if (wasEffective) {
        this.resetNavState(action);
      }

      this.previousEffective.set(action, effective);
    }

    // Pass 2: emit repeats for the now-final active nav action only. Zero
    // allocation — same index loops and field writes as the old single pass.
    if (this.activeNavAction !== null) {
      this.emitNavRepeats(this.activeNavAction);
    }

    this.reconcileActiveNavAction();
  }

  private emitEdge(action: GameAction): void {
    const source = this.firstHoldingSource(action);
    this.edges.push({ action, source });
  }

  private initializeNavState(action: GameAction, dtMs: number): void {
    if (!NAV_ACTIONS.includes(action)) {
      return;
    }

    if (this.activeNavAction !== null && this.activeNavAction !== action) {
      const prior = this.navStates.get(this.activeNavAction);
      if (prior) {
        prior.pressedAtMs = null;
        prior.repeatsEmitted = 0;
      }
    }

    const state = this.navStates.get(action);
    if (state) {
      state.pressedAtMs = this.timeMs - dtMs;
      state.repeatsEmitted = 0;
    }

    this.activeNavAction = action;
  }

  private emitNavRepeats(action: GameAction): void {
    if (action !== this.activeNavAction) {
      return;
    }

    const state = this.navStates.get(action);
    if (!state || state.pressedAtMs === null) {
      return;
    }

    const elapsed = this.timeMs - state.pressedAtMs;
    if (elapsed < this.options.navRepeat.delayMs) {
      return;
    }

    const targetRepeats =
      Math.floor((elapsed - this.options.navRepeat.delayMs) / this.options.navRepeat.intervalMs) +
      1;

    while (state.repeatsEmitted < targetRepeats) {
      this.emitEdge(action);
      state.repeatsEmitted += 1;
    }
  }

  private resetNavState(action: GameAction): void {
    if (!NAV_ACTIONS.includes(action)) {
      return;
    }

    const state = this.navStates.get(action);
    if (state) {
      state.pressedAtMs = null;
      state.repeatsEmitted = 0;
    }

    if (this.activeNavAction === action) {
      this.activeNavAction = null;
    }
  }

  private reconcileActiveNavAction(): void {
    if (this.activeNavAction !== null && this.isEffectiveHeld(this.activeNavAction)) {
      return;
    }

    let bestAction: GameAction | null = null;
    let bestTime = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < NAV_ACTIONS.length; i += 1) {
      const action = NAV_ACTIONS[i];
      if (!this.isEffectiveHeld(action)) {
        continue;
      }

      const state = this.navStates.get(action);
      const pressedAt = state?.pressedAtMs ?? Number.NEGATIVE_INFINITY;
      if (bestAction === null || pressedAt > bestTime) {
        bestTime = pressedAt;
        bestAction = action;
      }
    }

    if (bestAction !== null) {
      const state = this.navStates.get(bestAction);
      if (state && state.pressedAtMs === null) {
        // A superseded direction re-selected while still held must resume
        // repeating after a fresh delay (Epic 19 D3). Reset the clock from
        // NOW — not this.timeMs - dtMs — so no immediate edge fires and no
        // catch-up burst of missed repeats is emitted.
        state.pressedAtMs = this.timeMs;
        state.repeatsEmitted = 0;
      }
    }

    this.activeNavAction = bestAction;
  }

  private firstHoldingSource(action: GameAction): InputSource {
    for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
      if (this.held.get(SOURCE_ORDER[i])?.has(action)) {
        return SOURCE_ORDER[i];
      }
    }
    return SOURCE_ORDER[0];
  }
}
