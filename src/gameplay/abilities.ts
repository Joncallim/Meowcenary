/**
 * Active-ability registry + pure state machine (Epic 24).
 *
 * Abilities are registered behavior contracts referenced by character
 * definitions via stable `abilityId`s — never `if (characterId === ...)`
 * branches. The state machine is deterministic and pause-safe: time only
 * advances via explicit tick calls (a paused loop simply stops ticking).
 * Input sends logical `ability` commands; the state machine is the single
 * authoritative cooldown/state store.
 */
import type { Modifier } from './stats';

export type AbilityEffect =
  | { readonly kind: 'knockback'; readonly radius: number; readonly power: number }
  | { readonly kind: 'stat-burst'; readonly modifiers: readonly Modifier[] }
  | { readonly kind: 'invulnerable' }
  | { readonly kind: 'heal'; readonly amount: number }
  | { readonly kind: 'elemental-burst'; readonly trait: string; readonly radius: number; readonly power: number }
  | { readonly kind: 'loot-pulse'; readonly radius: number };

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly effect: AbilityEffect;
}

export type AbilityPhase = 'ready' | 'active' | 'cooling';

export interface AbilityState {
  readonly phase: AbilityPhase;
  /** Remaining active time (ms) when phase is 'active'. */
  readonly activeRemainingMs: number;
  /** Remaining cooldown (ms) when phase is 'cooling'. */
  readonly cooldownRemainingMs: number;
}

export function createAbilityState(): AbilityState {
  return Object.freeze({ phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 });
}

/**
 * Attempts to activate the ability. Returns the new state plus whether the
 * activation fired (exactly once per cooldown). Deterministic: identical
 * state + inputs → identical result. Pause-safe: caller controls ticking.
 */
export function activateAbility(
  state: AbilityState,
  definition: AbilityDefinition,
): { readonly state: AbilityState; readonly fired: boolean } {
  if (state.phase !== 'ready') {
    return { state, fired: false };
  }
  return {
    state: Object.freeze({
      phase: 'active',
      activeRemainingMs: definition.durationMs,
      cooldownRemainingMs: definition.cooldownMs,
    }),
    fired: true,
  };
}

/**
 * Advances ability time by deltaMs. Monotonic in real time; the active phase
 * decays first, then the cooldown. A paused loop never calls this, so pause
 * freezes ability state exactly.
 */
export function tickAbility(state: AbilityState, deltaMs: number): AbilityState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  if (state.phase === 'active') {
    const remaining = state.activeRemainingMs - deltaMs;
    if (remaining > 0) {
      return Object.freeze({
        phase: 'active',
        activeRemainingMs: remaining,
        cooldownRemainingMs: Math.max(0, state.cooldownRemainingMs - deltaMs),
      });
    }
    // Active expired: fall through to the cooling phase with leftover time.
    const cooldown = Math.max(0, state.cooldownRemainingMs - deltaMs);
    if (cooldown > 0) {
      return Object.freeze({ phase: 'cooling', activeRemainingMs: 0, cooldownRemainingMs: cooldown });
    }
    // Cooldown also fully elapsed within this tick.
    return createAbilityState();
  }
  if (state.phase === 'cooling') {
    const cooldown = state.cooldownRemainingMs - deltaMs;
    if (cooldown > 0) {
      return Object.freeze({ phase: 'cooling', activeRemainingMs: 0, cooldownRemainingMs: cooldown });
    }
    return createAbilityState();
  }
  return state;
}

/** Fractional cooldown readiness 0..1 (for UI meters), deterministic. */
export function abilityReadiness(state: AbilityState, definition: AbilityDefinition): number {
  if (state.phase === 'ready') return 1;
  if (state.phase === 'active') return 0;
  if (definition.cooldownMs <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - state.cooldownRemainingMs / definition.cooldownMs));
}
