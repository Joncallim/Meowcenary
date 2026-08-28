/**
 * Epic 21 — enemy behavior registry.
 *
 * The #94 C1 debt: adding a new enemy archetype previously required editing
 * the dispatch chains in `Enemy.ts` (asChargerMovementDefinition,
 * pursuitArchetype, accentStyle, enemyColor) plus types/validation/movement
 * modules. This registry is the single runtime dispatch point: each archetype
 * declares its movement step, presentation color, accent style, and heavy-step
 * cadence in ONE registered behavior. Adding an archetype = register one
 * behavior module + ship data; Enemy.ts needs no edits.
 *
 * Shipped archetype steps are wrapped from the pre-existing pure movement
 * functions (chaseStep/chargerStep) — byte-identical semantics, no gameplay
 * rebalance. New archetypes (ranged, boss) bring new registered steps.
 */
import {
  chaseStep,
  chargerStep,
  type ChargerEnvironment,
  type ChargerMovementDefinition,
  type ChargerMovementSnapshot,
} from './enemyMovement';
import type { Vec2 } from '../engine/vector';
import type { ResolvedEnemyDefinition, SpawnableEnemyArchetype } from '../systems/types';

export type EnemyBehaviorArchetype = SpawnableEnemyArchetype | 'ranged' | 'boss';

export interface EnemyStepInput {
  readonly pos: Vec2;
  readonly target: Vec2;
  readonly definition: Readonly<ResolvedEnemyDefinition>;
  readonly dtMs: number;
  readonly env?: ChargerEnvironment;
  readonly state: EnemyState;
  readonly stateTimerMs: number;
  readonly dashDirection: Vec2;
  readonly dashOrigin: Vec2;
}

export interface EnemyStepResult {
  readonly pos: Vec2;
  readonly state: EnemyState;
  readonly stateTimerMs: number;
  readonly dashDirection: Vec2;
  readonly dashOrigin: Vec2;
  /** True when this step transitioned into an attack (for event emission). */
  readonly enteredAttack: boolean;
}

export type EnemyBehaviorState = 'idle' | 'pursuing' | 'winding' | 'attacking' | 'dead';
export type EnemyState = EnemyBehaviorState;

export interface AccentStyle {
  readonly radius: number;
  readonly fill: number;
  readonly stroke?: { readonly width: number; readonly color: number; readonly alpha: number };
}

export interface RegisteredEnemyBehavior {
  readonly archetype: EnemyBehaviorArchetype;
  readonly color: number;
  readonly accent: AccentStyle;
  /** Heavy-step (landing pulse) cadence in px; only tank reads it. */
  readonly heavyStep: boolean;
  /** True when positions apply via body.reset (directional lunge) rather
   *  than velocity — charger/boss dash semantics. */
  readonly immediate: boolean;
  /** Telegraph progress 0→1 for the winding state, if this archetype telegraphs. */
  telegraphMs(definition: Readonly<ResolvedEnemyDefinition>): number | undefined;
  step(input: EnemyStepInput): EnemyStepResult;
}

const OUTLINE_COLOR = 0x0a0f14;

function asChargerMovementDefinition(
  definition: Readonly<ResolvedEnemyDefinition>,
): ChargerMovementDefinition | undefined {
  if (definition.archetype === 'charger') return definition;
  if (
    definition.archetype === 'elite' &&
    definition.baseArchetype === 'charger' &&
    'attack' in definition
  ) {
    return definition;
  }
  return undefined;
}

function chaseInputToSnapshot(input: EnemyStepInput): ChargerMovementSnapshot {
  return {
    pos: input.pos,
    state: input.state as ChargerMovementSnapshot['state'],
    stateTimerMs: input.stateTimerMs,
    dashDirection: input.dashDirection,
    dashOrigin: input.dashOrigin,
  };
}

function stepResultFromCharger(
  snapshot: ChargerMovementSnapshot,
  enteredAttack: boolean,
): EnemyStepResult {
  return {
    pos: { ...snapshot.pos },
    state: snapshot.state,
    stateTimerMs: snapshot.stateTimerMs,
    dashDirection: { ...snapshot.dashDirection },
    dashOrigin: { ...snapshot.dashOrigin },
    enteredAttack,
  };
}

/** Chaser: steady pursuit toward the player (pre-existing chaseStep). */
const chaserBehavior: RegisteredEnemyBehavior = {
  archetype: 'chaser',
  color: 0xef4444,
  accent: { radius: 5, fill: OUTLINE_COLOR },
  heavyStep: false,
  immediate: false,
  telegraphMs: () => undefined,
  step(input: EnemyStepInput): EnemyStepResult {
    const next = chaseStep(input.pos, input.target, input.definition.speed, input.dtMs);
    return {
      pos: next,
      state: input.state,
      stateTimerMs: input.stateTimerMs,
      dashDirection: { ...input.dashDirection },
      dashOrigin: { ...input.dashOrigin },
      enteredAttack: false,
    };
  },
};

/** Charger: winding telegraph → dash attack → cooldown (pre-existing chargerStep). */
const chargerBehavior: RegisteredEnemyBehavior = {
  archetype: 'charger',
  color: 0xf97316,
  accent: { radius: 5, fill: 0xfff3c4 },
  heavyStep: false,
  immediate: true,
  telegraphMs(definition) {
    return asChargerMovementDefinition(definition)?.attack.telegraphMs;
  },
  step(input: EnemyStepInput): EnemyStepResult {
    const movement = asChargerMovementDefinition(input.definition);
    if (!movement) {
      // Defensive: registry guarantees a charger definition; fall back to a
      // stationary step rather than throwing in the frame loop.
      return {
        pos: { ...input.pos },
        state: input.state,
        stateTimerMs: input.stateTimerMs,
        dashDirection: { ...input.dashDirection },
        dashOrigin: { ...input.dashOrigin },
        enteredAttack: false,
      };
    }
    const before = input.state;
    const result = chargerStep(chaseInputToSnapshot(input), input.target, movement, input.dtMs, input.env);
    return stepResultFromCharger(result, before !== 'attacking' && result.state === 'attacking');
  },
};

/** Tank: slow pursuit with a heavy landing pulse (pre-existing chaseStep + tank cue). */
const tankBehavior: RegisteredEnemyBehavior = {
  archetype: 'tank',
  color: 0xa855f7,
  accent: {
    radius: 8,
    fill: 0x7c3aed,
    stroke: { width: 2, color: OUTLINE_COLOR, alpha: 1 },
  },
  heavyStep: true,
  immediate: false,
  telegraphMs: () => undefined,
  step(input: EnemyStepInput): EnemyStepResult {
    const next = chaseStep(input.pos, input.target, input.definition.speed, input.dtMs);
    return {
      pos: next,
      state: input.state,
      stateTimerMs: input.stateTimerMs,
      dashDirection: { ...input.dashDirection },
      dashOrigin: { ...input.dashOrigin },
      enteredAttack: false,
    };
  },
};

/** Shielded: steady pressure like a chaser, but its frontal damage gate is
 * enforced by Enemy from this behavior's authoritative facing. */
const shieldedBehavior: RegisteredEnemyBehavior = {
  archetype: 'shielded',
  color: 0x2563eb,
  accent: { radius: 8, fill: 0x67e8f9, stroke: { width: 2, color: OUTLINE_COLOR, alpha: 1 } },
  heavyStep: false,
  immediate: false,
  telegraphMs: () => undefined,
  step(input: EnemyStepInput): EnemyStepResult {
    const next = chaseStep(input.pos, input.target, input.definition.speed, input.dtMs);
    return { pos: next, state: input.state, stateTimerMs: input.stateTimerMs,
      dashDirection: { ...input.dashDirection }, dashOrigin: { ...input.dashOrigin }, enteredAttack: false };
  },
};

/** Flanker: approaches from a stable lateral offset instead of directly
 * stacking on the player, creating cross-fire/position pressure. */
const flankerBehavior: RegisteredEnemyBehavior = {
  archetype: 'flanker',
  color: 0xeab308,
  accent: { radius: 4, fill: 0xfef08a },
  heavyStep: false,
  immediate: false,
  telegraphMs: () => undefined,
  step(input: EnemyStepInput): EnemyStepResult {
    if (input.definition.archetype !== 'flanker') {
      return { pos: { ...input.pos }, state: input.state, stateTimerMs: input.stateTimerMs,
        dashDirection: { ...input.dashDirection }, dashOrigin: { ...input.dashOrigin }, enteredAttack: false };
    }
    const dx = input.pos.x - input.target.x;
    const dy = input.pos.y - input.target.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length * input.definition.flankSide;
    const normalY = dx / length * input.definition.flankSide;
    const desired = { x: input.target.x + normalX * input.definition.flankDistance, y: input.target.y + normalY * input.definition.flankDistance };
    return { pos: chaseStep(input.pos, desired, input.definition.speed, input.dtMs), state: input.state, stateTimerMs: input.stateTimerMs,
      dashDirection: { ...input.dashDirection }, dashOrigin: { ...input.dashOrigin }, enteredAttack: false };
  },
};

/** Ranged: keeps distance, stops to telegraph a shot, then cools down. */
const rangedBehavior: RegisteredEnemyBehavior = {
  archetype: 'ranged',
  color: 0x22c55e,
  accent: { radius: 5, fill: 0xfde68a },
  heavyStep: false,
  immediate: false,
  telegraphMs(definition) {
    if (definition.archetype !== 'ranged') return undefined;
    return definition.attack.telegraphMs;
  },
  step(input: EnemyStepInput): EnemyStepResult {
    if (input.state === 'dead') {
      return {
        pos: { ...input.pos },
        state: input.state,
        stateTimerMs: input.stateTimerMs,
        dashDirection: { ...input.dashDirection },
        dashOrigin: { ...input.dashOrigin },
        enteredAttack: false,
      };
    }
    if (input.definition.archetype !== 'ranged') {
      return {
        pos: { ...input.pos },
        state: input.state,
        stateTimerMs: input.stateTimerMs,
        dashDirection: { ...input.dashDirection },
        dashOrigin: { ...input.dashOrigin },
        enteredAttack: false,
      };
    }
    const attack = input.definition.attack;
    let pos = { ...input.pos };
    let state = input.state;
    let stateTimerMs = Math.max(0, input.stateTimerMs);
    let remainingMs = Math.max(0, input.dtMs);
    let enteredAttack = false;

    for (let transitions = 0; remainingMs > 0; transitions += 1) {
      if (transitions >= 10_000) {
        throw new Error('Ranged movement dt crosses too many state transitions');
      }
      if (state === 'pursuing') {
        const dx = input.target.x - pos.x;
        const dy = input.target.y - pos.y;
        const distance = Math.hypot(dx, dy);
        // Keep distance: approach while outside range, hold position inside it.
        if (distance > attack.range) {
          pos = chaseStep(pos, input.target, input.definition.speed, remainingMs);
          remainingMs = 0;
          continue;
        }
        state = 'winding';
        stateTimerMs = attack.telegraphMs;
        continue;
      }
      if (state === 'winding') {
        const consumed = Math.min(remainingMs, stateTimerMs);
        remainingMs -= consumed;
        stateTimerMs -= consumed;
        if (stateTimerMs > 0) continue;
        state = 'attacking';
        stateTimerMs = attack.cooldownMs;
        enteredAttack = true;
        continue;
      }
      if (state === 'attacking') {
        const consumed = Math.min(remainingMs, stateTimerMs);
        remainingMs -= consumed;
        stateTimerMs -= consumed;
        if (stateTimerMs > 0) continue;
        state = 'pursuing';
        continue;
      }
      remainingMs = 0;
    }

    return {
      pos,
      state,
      stateTimerMs,
      dashDirection: { ...input.dashDirection },
      dashOrigin: { ...input.dashOrigin },
      enteredAttack,
    };
  },
};

/** Boss: multi-phase pressure — chase then a wide winding telegraph → lunge. */
const bossBehavior: RegisteredEnemyBehavior = {
  archetype: 'boss',
  color: 0xdc2626,
  accent: { radius: 10, fill: 0x1e293b, stroke: { width: 2, color: 0xfbbf24, alpha: 1 } },
  heavyStep: true,
  immediate: true,
  telegraphMs(definition) {
    if (definition.archetype !== 'boss') return undefined;
    return definition.attack?.telegraphMs;
  },
  step(input: EnemyStepInput): EnemyStepResult {
    if (input.definition.archetype !== 'boss') {
      return {
        pos: { ...input.pos },
        state: input.state,
        stateTimerMs: input.stateTimerMs,
        dashDirection: { ...input.dashDirection },
        dashOrigin: { ...input.dashOrigin },
        enteredAttack: false,
      };
    }
    // Boss lunge reuses the charger state machine with the boss's attack data.
    const movement = input.definition as unknown as ChargerMovementDefinition;
    const before = input.state;
    const result = chargerStep(chaseInputToSnapshot(input), input.target, movement, input.dtMs, input.env);
    return stepResultFromCharger(result, before !== 'attacking' && result.state === 'attacking');
  },
};

const BEHAVIORS: ReadonlyMap<EnemyBehaviorArchetype, RegisteredEnemyBehavior> = new Map(
  [chaserBehavior, chargerBehavior, tankBehavior, shieldedBehavior, flankerBehavior, rangedBehavior, bossBehavior]
    .map((behavior) => [behavior.archetype, behavior] as const),
);

/**
 * Resolves the effective behavior for a definition. Elites inherit the
 * behavior of their base archetype; unknown archetypes fail loudly (never a
 * silent default — a missing registration is a catalog bug).
 */
export function enemyBehaviorFor(
  definition: Readonly<ResolvedEnemyDefinition>,
): RegisteredEnemyBehavior {
  const archetype =
    definition.archetype === 'elite' ? definition.baseArchetype : definition.archetype;
  const behavior = BEHAVIORS.get(archetype as EnemyBehaviorArchetype);
  if (!behavior) {
    throw new Error(`No registered enemy behavior for archetype "${String(archetype)}"`);
  }
  return behavior;
}

/** Every registered archetype (for conformance tests). */
export function registeredEnemyArchetypes(): readonly EnemyBehaviorArchetype[] {
  return [...BEHAVIORS.keys()];
}

/** True when an archetype has a registered behavior (boss/roster conformance). */
export function hasRegisteredBehavior(archetype: EnemyBehaviorArchetype): boolean {
  return BEHAVIORS.has(archetype);
}
