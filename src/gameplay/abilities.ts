/**
 * Active-ability registry + pure state machine (Epic 24).
 *
 * Abilities are registered behavior contracts referenced by character
 * definitions via stable `abilityId`s — never `if (characterId === ...)`
 * branches. The state machine is deterministic and pause-safe: time only
 * advances via explicit tick calls (a paused loop simply stops ticking).
 * Input sends logical `ability` commands; the state machine is the single
 * authoritative cooldown/state store.
 *
 * V4 (Slice B): enemy damage routes through an injected `damageEnemy` seam
 * rather than exposing `takeDamage` directly, so every lethal source
 * converges through the universal EnemyDamageResolver.
 */
import type { Modifier } from './stats';

export type AbilityPresentationCue = 'shockwave' | 'overclock-aura' | 'shield-aura' | 'heal-burst' | 'speed-trail' | 'heat-ring' | 'loot-pulse' | 'precision-mark';
export interface AbilityPresentationDefinition {
  readonly cue: AbilityPresentationCue;
  readonly color: string;
  readonly visualRadius?: number;
  /** Explicit logical identity; physical atlas packing remains registry-owned. */
  readonly iconArtId: string;
}

export interface AbilityRuntime {
  readonly player: { x: number; y: number; heal(amount: number): number; grantInvulnerability(durationMs: number): void };
  readonly stats: { add(modifier: Modifier): void; remove(sourceId: string): void };
  /** Enemies that abilities can affect. No longer exposes takeDamage
   * directly — use damageEnemy() instead so all lethal damage converges
   * through the universal resolver. */
  readonly enemies: Iterable<{
    x: number;
    y: number;
    readonly active: boolean;
    readonly state: string;
    body: { setVelocity(x: number, y: number): void };
    /** Optional entity-owned boundary for impulses that must survive the
     * scene's subsequent steering update. */
    applyKnockback?(x: number, y: number): boolean;
  }>;
  /** Apply damage to an enemy through the universal lethal-settlement
   * boundary (increments runState.kills, emits enemy:killed exactly once
   * per alive→dead transition). Returns true only when health damage was applied. */
  damageEnemy(enemy: { x: number; y: number }, amount: number): boolean;
  collectNearbyConsumables(radius: number): number;
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
  readonly presentation: AbilityPresentationDefinition;
}

/** Scalar mutation receipts; presentation never counts candidates or retains entities. */
export type AbilityResolution =
  | Readonly<{ kind: 'heal'; requested: number; applied: number }>
  | Readonly<{ kind: 'loot-pulse'; radius: number; collected: number }>
  | Readonly<{ kind: 'knockback' | 'elemental-burst'; radius: number; affected: number }>
  | Readonly<{ kind: 'stat-burst'; durationMs: number; modifiers: readonly Readonly<Modifier>[] }>
  | Readonly<{ kind: 'invulnerable'; durationMs: number }>;

export function isPersistentAbilityEffect(effect: AbilityEffect): boolean {
  return effect.kind === 'stat-burst' || effect.kind === 'invulnerable';
}

export function applyAbilityEffect(definition: AbilityDefinition, runtime: AbilityRuntime): AbilityResolution {
  const effect = definition.effect;
  switch (effect.kind) {
    case 'heal':
      return Object.freeze({ kind: effect.kind, requested: effect.amount, applied: runtime.player.heal(effect.amount) });
    case 'invulnerable':
      runtime.player.grantInvulnerability(definition.durationMs);
      return Object.freeze({ kind: effect.kind, durationMs: definition.durationMs });
    case 'stat-burst': {
      const modifiers = Object.freeze(effect.modifiers.map((modifier) => Object.freeze({
        ...modifier,
        ...(modifier.scope ? { scope: Object.freeze({ ...modifier.scope }) } : {}),
      })));
      modifiers.forEach((modifier) => runtime.stats.add(modifier));
      return Object.freeze({ kind: effect.kind, durationMs: definition.durationMs, modifiers });
    }
    case 'loot-pulse':
      return Object.freeze({ kind: effect.kind, radius: effect.radius, collected: runtime.collectNearbyConsumables(effect.radius) });
    case 'knockback':
    case 'elemental-burst':
      return Object.freeze({ kind: effect.kind, radius: effect.radius, affected: applyAreaEffect(effect, runtime) });
    default: {
      const unsupported: never = effect;
      throw new Error(`Unsupported ability effect: ${String(unsupported)}`);
    }
  }
}

export function expireAbilityEffect(definition: AbilityDefinition, runtime: Pick<AbilityRuntime, 'stats'>): void {
  if (definition.effect.kind === 'stat-burst') definition.effect.modifiers.forEach((modifier) => runtime.stats.remove(modifier.sourceId));
}

function applyAreaEffect(effect: Extract<AbilityEffect, { radius: number; power: number }>, runtime: AbilityRuntime): number {
  let affected = 0;
  for (const enemy of runtime.enemies) {
    if (!enemy.active || enemy.state === 'dead') continue;
    const dx = enemy.x - runtime.player.x;
    const dy = enemy.y - runtime.player.y;
    // Preserve the existing zero-distance impulse (0,0) and radius boundary.
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > effect.radius) continue;
    if (effect.kind === 'elemental-burst') {
      if (runtime.damageEnemy(enemy, effect.power)) affected += 1;
    } else {
      const velocityX = dx / distance * effect.power;
      const velocityY = dy / distance * effect.power;
      if (enemy.applyKnockback) {
        if (enemy.applyKnockback(velocityX, velocityY)) affected += 1;
      } else {
        enemy.body.setVelocity(velocityX, velocityY);
        affected += 1;
      }
    }
  }
  return affected;
}

export type AbilityPhase = 'ready' | 'active' | 'cooling';

export interface AbilityState {
  readonly phase: AbilityPhase;
  /** Remaining active time (ms) when phase is 'active'. */
  readonly activeRemainingMs: number;
  /** Remaining cooldown (ms), decaying concurrently with active time. */
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
 * Advances both active time and cooldown concurrently by deltaMs. The active
 * phase ends independently of the remaining cooldown. A paused loop never calls this, so pause
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

/** Frozen UI view of authoritative simulation time; no independent view timer. */
export interface AbilityUiState {
  readonly phase: AbilityPhase;
  readonly activeRemainingMs: number;
  readonly cooldownRemainingMs: number;
  readonly readiness: number;
  /** Remaining sustained duration as a fraction of its initial duration. */
  readonly activeProgress: number;
}

export function resolveAbilityUiState(state: AbilityState, definition: AbilityDefinition): AbilityUiState {
  const active = state.phase === 'active' && isPersistentAbilityEffect(definition.effect) && state.activeRemainingMs > 0;
  const phase = state.phase === 'active' && !active ? 'cooling' : state.phase;
  return Object.freeze({
    phase,
    activeRemainingMs: active ? state.activeRemainingMs : 0,
    cooldownRemainingMs: state.cooldownRemainingMs,
    readiness: phase === 'ready' ? 1 : Math.max(0, Math.min(1, 1 - state.cooldownRemainingMs / definition.cooldownMs)),
    activeProgress: active && definition.durationMs > 0 ? Math.max(0, Math.min(1, state.activeRemainingMs / definition.durationMs)) : 0,
  });
}
