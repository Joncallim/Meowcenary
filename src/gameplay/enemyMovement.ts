import type { Vec2 } from '../engine/vector';
import { distanceSq, towards } from '../engine/vector';
import type { ChargerAttackDefinition } from '../systems/types';

export type EnemyMovementState = 'idle' | 'pursuing' | 'winding' | 'attacking' | 'dead';

export interface ChargerMovementDefinition {
  readonly speed: number;
  readonly attack: Readonly<ChargerAttackDefinition>;
}

export interface ChargerMovementSnapshot {
  readonly pos: Vec2;
  readonly state: EnemyMovementState;
  readonly stateTimerMs: number;
  readonly dashDirection: Vec2;
}

export interface ChargerStepResult extends ChargerMovementSnapshot {}

export function chaseStep(pos: Vec2, target: Vec2, speed: number, dtMs: number): Vec2 {
  assertFiniteVector(pos, 'Enemy position');
  assertFiniteVector(target, 'Enemy target');
  assertFinite(speed, 'Enemy speed');
  assertFinite(dtMs, 'Enemy movement dt');
  if (speed < 0) throw new Error('Enemy speed must not be negative');
  if (speed === 0 || dtMs <= 0) return { ...pos };

  const deltaX = target.x - pos.x;
  const deltaY = target.y - pos.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return { ...pos };

  const travel = speed * (dtMs / 1_000);
  if (!Number.isFinite(travel)) throw new Error('Enemy movement result must be finite');
  if (travel >= distance) return { ...target };

  const scale = travel / distance;
  return {
    x: pos.x + deltaX * scale,
    y: pos.y + deltaY * scale,
  };
}

export function chargerStep(
  snapshot: ChargerMovementSnapshot,
  target: Vec2,
  definition: ChargerMovementDefinition,
  dtMs: number,
): ChargerStepResult {
  validateChargerInputs(snapshot, target, definition, dtMs);
  if (snapshot.state === 'dead') {
    return { ...snapshot, pos: { ...snapshot.pos }, dashDirection: { ...snapshot.dashDirection } };
  }

  let pos = { ...snapshot.pos };
  let state = snapshot.state;
  let stateTimerMs = Math.max(0, snapshot.stateTimerMs);
  let dashDirection = { ...snapshot.dashDirection };
  let remainingMs = Math.max(0, dtMs);

  // One update can cross winding, dash, and cooldown boundaries. Durations are
  // strictly positive, so each pair of transitions consumes time.
  for (let transitions = 0; remainingMs > 0; transitions += 1) {
    if (transitions >= 10_000) {
      throw new Error('Charger movement dt crosses too many state transitions');
    }
    if (state === 'pursuing') {
      const distanceSquared = distanceSq(pos, target);
      if (distanceSquared > definition.attack.triggerRange ** 2) {
        const distance = Math.hypot(target.x - pos.x, target.y - pos.y);
        const timeToTriggerMs =
          ((distance - definition.attack.triggerRange) / definition.speed) * 1_000;
        if (timeToTriggerMs > remainingMs) {
          pos = chaseStep(pos, target, definition.speed, remainingMs);
          remainingMs = 0;
          continue;
        }

        pos = chaseStep(pos, target, definition.speed, timeToTriggerMs);
        remainingMs = Math.max(0, remainingMs - timeToTriggerMs);
      }
      state = 'winding';
      stateTimerMs = definition.attack.telegraphMs;
      continue;
    }

    if (state === 'winding') {
      const consumed = Math.min(remainingMs, stateTimerMs);
      remainingMs -= consumed;
      stateTimerMs -= consumed;
      if (stateTimerMs > 0) continue;

      state = 'attacking';
      stateTimerMs = definition.attack.dashDurationMs;
      dashDirection = towards(pos, target);
      continue;
    }

    if (state === 'attacking') {
      const consumed = Math.min(remainingMs, stateTimerMs);
      const travel = definition.attack.dashSpeed * (consumed / 1_000);
      pos = {
        x: pos.x + dashDirection.x * travel,
        y: pos.y + dashDirection.y * travel,
      };
      remainingMs -= consumed;
      stateTimerMs -= consumed;
      if (stateTimerMs > 0) continue;

      state = 'idle';
      stateTimerMs = definition.attack.cooldownMs;
      continue;
    }

    if (state === 'idle') {
      const consumed = Math.min(remainingMs, stateTimerMs);
      remainingMs -= consumed;
      stateTimerMs -= consumed;
      if (stateTimerMs > 0) continue;

      state = 'pursuing';
      dashDirection = { x: 0, y: 0 };
      continue;
    }

    remainingMs = 0;
  }

  return { pos, state, stateTimerMs, dashDirection };
}

function validateChargerInputs(
  snapshot: ChargerMovementSnapshot,
  target: Vec2,
  definition: ChargerMovementDefinition,
  dtMs: number,
): void {
  assertFiniteVector(snapshot.pos, 'Charger position');
  assertFiniteVector(snapshot.dashDirection, 'Charger dash direction');
  assertFiniteVector(target, 'Charger target');
  assertFinite(snapshot.stateTimerMs, 'Charger state timer');
  assertFinite(dtMs, 'Charger movement dt');
  const values = [
    definition.speed,
    definition.attack.triggerRange,
    definition.attack.telegraphMs,
    definition.attack.dashSpeed,
    definition.attack.dashDurationMs,
    definition.attack.cooldownMs,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Charger movement definition must contain positive finite values');
  }
}

function assertFiniteVector(value: Vec2, label: string): void {
  assertFinite(value.x, label);
  assertFinite(value.y, label);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}
