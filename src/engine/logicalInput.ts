import { ZERO_VEC2, length, type Vec2 } from './vector';

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
  lastActiveAtMs: number;
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
        lastActiveAtMs: Number.NEGATIVE_INFINITY,
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
    for (const source of SOURCE_ORDER) {
      if (this.held.get(source)?.has(action)) {
        return true;
      }
    }
    return false;
  }

  setMovementSample(
    source: InputSource,
    vector: Readonly<Vec2>,
    deadzone: number,
  ): void {
    const state = this.movementStates.get(source);
    if (!state) {
      return;
    }

    const magnitude = length(vector);
    const scaled = applyRadialDeadzone(magnitude, deadzone);
    const active = scaled > 0;
    const k = magnitude > 0 ? scaled / magnitude : 0;
    state.vector = { x: vector.x * k, y: vector.y * k };

    if (active && !state.active) {
      state.lastActiveAtMs = this.timeMs;
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
      movement.vector = { ...ZERO_VEC2 };
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

  private updateMovementOwner(): void {
    const ownerState =
      this.activeMovementSource !== null
        ? this.movementStates.get(this.activeMovementSource)
        : undefined;

    if (this.activeMovementSource !== null && (!ownerState || !ownerState.active)) {
      this.activeMovementSource = null;
    }

    if (this.activeMovementSource === null) {
      let bestSource: InputSource | null = null;
      let bestTime = Number.NEGATIVE_INFINITY;

      for (const source of SOURCE_ORDER) {
        const state = this.movementStates.get(source);
        if (state?.active && state.lastActiveAtMs > bestTime) {
          bestTime = state.lastActiveAtMs;
          bestSource = source;
        }
      }

      this.activeMovementSource = bestSource;
    }
  }

  private updateActions(dtMs: number): void {
    for (const action of ALL_ACTIONS) {
      const effective = this.isEffectiveHeld(action);
      const wasEffective = this.previousEffective.get(action) ?? false;

      if (effective) {
        if (!wasEffective) {
          this.emitEdge(action);
          this.initializeNavState(action, dtMs);
        }
        this.emitNavRepeats(action);
      } else if (wasEffective) {
        this.resetNavState(action);
      }

      this.previousEffective.set(action, effective);
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

    for (const action of NAV_ACTIONS) {
      if (!this.isEffectiveHeld(action)) {
        continue;
      }

      const state = this.navStates.get(action);
      const pressedAt = state?.pressedAtMs ?? Number.NEGATIVE_INFINITY;
      if (pressedAt > bestTime) {
        bestTime = pressedAt;
        bestAction = action;
      }
    }

    this.activeNavAction = bestAction;
  }

  private firstHoldingSource(action: GameAction): InputSource {
    for (const source of SOURCE_ORDER) {
      if (this.held.get(source)?.has(action)) {
        return source;
      }
    }
    return SOURCE_ORDER[0];
  }
}
