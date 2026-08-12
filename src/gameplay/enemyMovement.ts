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
  readonly dashOrigin: Vec2;
}

export interface ChargerStepResult extends ChargerMovementSnapshot {}

export interface ChargerEnvironment {
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly obstacles: ReadonlyArray<{ readonly x: number; readonly y: number; readonly w: number; readonly h: number }>;
  readonly bodyRadius: number;
}

export function chaseStep(pos: Vec2, target: Vec2, speed: number, dtMs: number): Vec2 {
  assertFiniteVector(pos, 'Enemy position');
  assertFiniteVector(target, 'Enemy target');
  assertFinite(speed, 'Enemy speed');
  assertFinite(dtMs, 'Enemy movement dt');
  if (speed < 0) throw new Error('Enemy speed must not be negative');
  if (speed === 0 || dtMs <= 0) return { ...pos };

  const deltaX = target.x - pos.x;
  const deltaY = target.y - pos.y;
  assertFinite(deltaX, 'Enemy movement delta');
  assertFinite(deltaY, 'Enemy movement delta');
  const distance = Math.hypot(deltaX, deltaY);
  assertFinite(distance, 'Enemy movement distance');
  if (distance === 0) return { ...pos };

  const travel = speed * (dtMs / 1_000);
  if (!Number.isFinite(travel)) throw new Error('Enemy movement result must be finite');
  if (travel >= distance) return { ...target };

  const scale = travel / distance;
  const result = {
    x: pos.x + deltaX * scale,
    y: pos.y + deltaY * scale,
  };
  assertFiniteVector(result, 'Enemy movement result');
  return result;
}

export function chargerStep(
  snapshot: ChargerMovementSnapshot,
  target: Vec2,
  definition: ChargerMovementDefinition,
  dtMs: number,
  env?: ChargerEnvironment,
): ChargerStepResult {
  validateChargerInputs(snapshot, target, definition, dtMs, env);
  if (snapshot.state === 'dead') {
    return {
      ...snapshot,
      pos: { ...snapshot.pos },
      dashDirection: { ...snapshot.dashDirection },
      dashOrigin: { ...snapshot.dashOrigin },
    };
  }

  let pos = { ...snapshot.pos };
  let state = snapshot.state;
  let stateTimerMs = Math.max(0, snapshot.stateTimerMs);
  let dashDirection = { ...snapshot.dashDirection };
  let dashOrigin = { ...snapshot.dashOrigin };
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
        assertFinite(distance, 'Charger pursuit distance');
        const timeToTriggerMs =
          ((distance - definition.attack.triggerRange) / definition.speed) * 1_000;
        assertFinite(timeToTriggerMs, 'Charger trigger time');
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
      dashOrigin = { ...pos };
      assertFiniteVector(dashDirection, 'Charger dash direction');
      continue;
    }

    if (state === 'attacking') {
      const previousPos = { ...pos };
      const consumed = Math.min(remainingMs, stateTimerMs);
      const nextTimerMs = stateTimerMs - consumed;
      const elapsedDashMs = definition.attack.dashDurationMs - nextTimerMs;
      const travel = definition.attack.dashSpeed * (elapsedDashMs / 1_000);
      assertFinite(travel, 'Charger dash travel');
      pos = {
        x: dashOrigin.x + dashDirection.x * travel,
        y: dashOrigin.y + dashDirection.y * travel,
      };
      assertFiniteVector(pos, 'Charger dash result');
      if (env) {
        const hit = earliestObstacleHit(previousPos, pos, env);
        if (hit) {
          pos = hit;
          const distanceToHit = Math.hypot(hit.x - previousPos.x, hit.y - previousPos.y);
          const consumedAtHitMs = Math.min(
            consumed,
            (distanceToHit / definition.attack.dashSpeed) * 1_000,
          );
          remainingMs -= consumedAtHitMs;
          state = 'idle';
          stateTimerMs = definition.attack.cooldownMs;
          continue;
        }
        pos = clampToBounds(pos, env);
      }
      remainingMs -= consumed;
      stateTimerMs = nextTimerMs;
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
      dashOrigin = { ...pos };
      continue;
    }

    remainingMs = 0;
  }

  assertFiniteVector(pos, 'Charger movement result');
  assertFinite(stateTimerMs, 'Charger state timer result');
  assertFiniteVector(dashDirection, 'Charger dash direction result');
  assertFiniteVector(dashOrigin, 'Charger dash origin result');
  return { pos, state, stateTimerMs, dashDirection, dashOrigin };
}

function validateChargerInputs(
  snapshot: ChargerMovementSnapshot,
  target: Vec2,
  definition: ChargerMovementDefinition,
  dtMs: number,
  env?: ChargerEnvironment,
): void {
  assertFiniteVector(snapshot.pos, 'Charger position');
  assertFiniteVector(snapshot.dashDirection, 'Charger dash direction');
  assertFiniteVector(snapshot.dashOrigin, 'Charger dash origin');
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
  if (env) validateEnvironment(env);
}

function validateEnvironment(env: ChargerEnvironment): void {
  const values = [env.bounds.x, env.bounds.y, env.bounds.width, env.bounds.height, env.bodyRadius];
  if (values.some((value) => !Number.isFinite(value)) || env.bounds.width <= 0 ||
      env.bounds.height <= 0 || env.bodyRadius <= 0 || env.bodyRadius * 2 > env.bounds.width ||
      env.bodyRadius * 2 > env.bounds.height) {
    throw new Error('Charger environment must contain finite usable bounds and radius');
  }
  for (const obstacle of env.obstacles) {
    if ([obstacle.x, obstacle.y, obstacle.w, obstacle.h].some((value) => !Number.isFinite(value)) ||
        obstacle.w <= 0 || obstacle.h <= 0) {
      throw new Error('Charger environment obstacles must be finite positive rectangles');
    }
  }
}

function clampToBounds(pos: Vec2, env: ChargerEnvironment): Vec2 {
  const minX = env.bounds.x + env.bodyRadius;
  const maxX = env.bounds.x + env.bounds.width - env.bodyRadius;
  const minY = env.bounds.y + env.bodyRadius;
  const maxY = env.bounds.y + env.bounds.height - env.bodyRadius;
  return { x: Math.min(maxX, Math.max(minX, pos.x)), y: Math.min(maxY, Math.max(minY, pos.y)) };
}

function earliestObstacleHit(from: Vec2, to: Vec2, env: ChargerEnvironment): Vec2 | undefined {
  let earliest = Number.POSITIVE_INFINITY;
  for (const obstacle of env.obstacles) {
    const minX = obstacle.x - env.bodyRadius;
    const maxX = obstacle.x + obstacle.w + env.bodyRadius;
    const minY = obstacle.y - env.bodyRadius;
    const maxY = obstacle.y + obstacle.h + env.bodyRadius;
    const t = segmentAabbHit(from, to, minX, minY, maxX, maxY);
    if (t !== undefined && t < earliest) earliest = t;
  }
  if (!Number.isFinite(earliest)) return undefined;
  return {
    x: from.x + (to.x - from.x) * earliest,
    y: from.y + (to.y - from.y) * earliest,
  };
}

function segmentAabbHit(
  from: Vec2, to: Vec2, minX: number, minY: number, maxX: number, maxY: number,
): number | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, min, max] of [[from.x, dx, minX, maxX], [from.y, dy, minY, maxY]] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return undefined;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return undefined;
  }
  return enter >= 0 && enter <= 1 ? enter : undefined;
}

function assertFiniteVector(value: Vec2, label: string): void {
  assertFinite(value.x, label);
  assertFinite(value.y, label);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}
