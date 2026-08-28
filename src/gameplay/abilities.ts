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

export interface AbilityRuntime {
  readonly player: { x: number; y: number; heal(amount: number): void; grantInvulnerability(durationMs: number): void };
  readonly stats: { add(modifier: Modifier): void; remove(sourceId: string): void };
  readonly enemies: Iterable<{ x: number; y: number; takeDamage(amount: number): void; body: { setVelocity(x: number, y: number): void } }>;
  collectNearbyConsumables(radius: number): void;
}

export type AbilityEffect =
  | { readonly kind: 'knockback'; readonly radius: number; readonly power: number }
  | { readonly kind: 'stat-burst'; readonly modifiers: readonly Modifier[] }
  | { readonly kind: 'invulnerable' }
  | { readonly kind: 'heal'; readonly amount: number }
  | { readonly kind: 'elemental-burst'; readonly radius: number; readonly power: number }
  | { readonly kind: 'loot-pulse'; readonly radius: number };

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly effect: AbilityEffect;
}

export function applyAbilityEffect(definition: AbilityDefinition, runtime: AbilityRuntime): void {
  const effect = definition.effect;
  const handlers: Record<AbilityEffect['kind'], () => void> = {
    heal: () => { if (effect.kind === 'heal') runtime.player.heal(effect.amount); },
    invulnerable: () => runtime.player.grantInvulnerability(definition.durationMs),
    'stat-burst': () => { if (effect.kind === 'stat-burst') effect.modifiers.forEach((modifier) => runtime.stats.add(modifier)); },
    'loot-pulse': () => { if (effect.kind === 'loot-pulse') runtime.collectNearbyConsumables(effect.radius); },
    knockback: () => applyAreaEffect(effect as Extract<AbilityEffect, { kind: 'knockback' }>, runtime, false),
    'elemental-burst': () => applyAreaEffect(effect as Extract<AbilityEffect, { kind: 'elemental-burst' }>, runtime, true),
  };
  handlers[effect.kind]();
}

export function expireAbilityEffect(definition: AbilityDefinition, runtime: Pick<AbilityRuntime, 'stats'>): void {
  if (definition.effect.kind === 'stat-burst') definition.effect.modifiers.forEach((modifier) => runtime.stats.remove(modifier.sourceId));
}

function applyAreaEffect(effect: Extract<AbilityEffect, { radius: number; power: number }>, runtime: AbilityRuntime, damage: boolean): void {
  for (const enemy of runtime.enemies) {
    const dx = enemy.x - runtime.player.x;
    const dy = enemy.y - runtime.player.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > effect.radius) continue;
    if (damage) enemy.takeDamage(effect.power);
    else enemy.body.setVelocity(dx / distance * effect.power, dy / distance * effect.power);
  }
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
