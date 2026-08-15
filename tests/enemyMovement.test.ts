import { describe, expect, it } from 'vitest';
import {
  chaseStep,
  chargerStep,
  type ChargerMovementDefinition,
  type ChargerMovementSnapshot,
} from '../src/gameplay/enemyMovement';

const charger: ChargerMovementDefinition = {
  speed: 100,
  attack: {
    triggerRange: 150,
    telegraphMs: 650,
    dashSpeed: 260,
    dashDurationMs: 700,
    cooldownMs: 1_200,
  },
};

function pursuing(pos = { x: 0, y: 0 }): ChargerMovementSnapshot {
  return {
    pos,
    state: 'pursuing',
    stateTimerMs: 0,
    dashDirection: { x: 0, y: 0 },
    dashOrigin: { ...pos },
  };
}

describe('enemy movement', () => {
  it('moves straight toward a target without overshooting', () => {
    expect(chaseStep({ x: 0, y: 0 }, { x: 30, y: 40 }, 10, 1_000)).toEqual({ x: 6, y: 8 });
    expect(chaseStep({ x: 0, y: 0 }, { x: 3, y: 4 }, 10, 1_000)).toEqual({ x: 3, y: 4 });
  });

  it('preserves prototype-backed entity coordinates when catching the target', () => {
    const target = Object.create({ x: 3, y: 4 }) as { x: number; y: number };

    expect(chaseStep({ x: 0, y: 0 }, target, 10, 1_000)).toEqual({ x: 3, y: 4 });
  });

  it('keeps chase inputs isolated and handles stopped time or speed', () => {
    const pos = { x: 2, y: 3 };
    const target = { x: 10, y: 3 };

    expect(chaseStep(pos, target, 0, 1_000)).toEqual(pos);
    expect(chaseStep(pos, target, 10, 0)).toEqual(pos);
    expect(chaseStep(pos, target, 10, -1)).toEqual(pos);
    expect(pos).toEqual({ x: 2, y: 3 });
    expect(target).toEqual({ x: 10, y: 3 });
  });

  it('rejects invalid chase domains', () => {
    expect(() => chaseStep({ x: Number.NaN, y: 0 }, { x: 1, y: 0 }, 1, 1)).toThrow();
    expect(() => chaseStep({ x: 0, y: 0 }, { x: 1, y: 0 }, -1, 1)).toThrow();
    expect(() => chaseStep({ x: 0, y: 0 }, { x: 1, y: 0 }, 1, Infinity)).toThrow();
    expect(() =>
      chaseStep(
        { x: -Number.MAX_VALUE, y: 0 },
        { x: Number.MAX_VALUE, y: 0 },
        1,
        1,
      ),
    ).toThrow();
  });

  it('pursues outside trigger range and winds without moving inside it', () => {
    const outside = chargerStep(pursuing(), { x: 200, y: 0 }, charger, 400);
    expect(outside).toEqual({
      pos: { x: 40, y: 0 },
      state: 'pursuing',
      stateTimerMs: 0,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });

    const inside = chargerStep(pursuing(), { x: 100, y: 0 }, charger, 100);
    expect(inside).toEqual({
      pos: { x: 0, y: 0 },
      state: 'winding',
      stateTimerMs: 550,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });
  });

  it('carries trigger-boundary crossing time into windup without frame dependence', () => {
    const single = chargerStep(pursuing(), { x: 200, y: 0 }, charger, 600);
    const atBoundary = chargerStep(pursuing(), { x: 200, y: 0 }, charger, 500);
    const chunked = chargerStep(atBoundary, { x: 200, y: 0 }, charger, 100);

    expect(atBoundary).toEqual({
      pos: { x: 50, y: 0 },
      state: 'winding',
      stateTimerMs: 650,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });
    expect(single).toEqual({
      pos: { x: 50, y: 0 },
      state: 'winding',
      stateTimerMs: 550,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });
    expect(single).toEqual(chunked);
  });

  it('locks dash direction after telegraph and ignores later target movement', () => {
    const wound = chargerStep(pursuing(), { x: 100, y: 0 }, charger, 650);
    expect(wound.state).toBe('attacking');
    expect(wound.dashDirection).toEqual({ x: 1, y: 0 });

    const dashed = chargerStep(wound, { x: 0, y: 100 }, charger, 100);
    expect(dashed.pos).toEqual({ x: 26, y: 0 });
    expect(dashed.state).toBe('attacking');
    expect(dashed.stateTimerMs).toBe(600);
  });

  it('crosses windup, dash, and cooldown deterministically for large dt', () => {
    const result = chargerStep(pursuing(), { x: 100, y: 0 }, charger, 2_550);

    const afterWindup = chargerStep(pursuing(), { x: 100, y: 0 }, charger, 650);
    const afterDash = chargerStep(afterWindup, { x: 100, y: 0 }, charger, 700);
    const chunked = chargerStep(afterDash, { x: 100, y: 0 }, charger, 1_200);

    expect(result.pos).toEqual({ x: 182, y: 0 });
    expect(result.state).toBe('pursuing');
    expect(result.stateTimerMs).toBe(0);
    expect(result.dashDirection).toEqual({ x: 0, y: 0 });
    expect(result.dashOrigin).toEqual({ x: 182, y: 0 });
    expect(result).toEqual(chunked);
  });

  it('returns new snapshots without mutating input and leaves dead chargers stopped', () => {
    const snapshot: ChargerMovementSnapshot = {
      pos: { x: 4, y: 5 },
      state: 'dead',
      stateTimerMs: 12,
      dashDirection: { x: 1, y: 0 },
      dashOrigin: { x: 4, y: 5 },
    };
    const before = structuredClone(snapshot);
    const result = chargerStep(snapshot, { x: 100, y: 100 }, charger, 1_000);

    expect(result).toEqual(before);
    expect(result).not.toBe(snapshot);
    expect(result.pos).not.toBe(snapshot.pos);
    expect(snapshot).toEqual(before);
  });

  it('clamps an active dash to inset world bounds without changing its timer', () => {
    const attacking: ChargerMovementSnapshot = {
      pos: { x: 80, y: 50 }, state: 'attacking', stateTimerMs: 600,
      dashDirection: { x: 1, y: 0 }, dashOrigin: { x: 80, y: 50 },
    };
    const result = chargerStep(attacking, { x: 200, y: 50 }, charger, 500, {
      bounds: { x: 0, y: 0, width: 100, height: 100 }, obstacles: [], bodyRadius: 13,
    });
    expect(result.pos).toEqual({ x: 87, y: 50 });
    expect(result.state).toBe('attacking');
    expect(result.stateTimerMs).toBe(100);
  });

  it('stops a large-dt dash at expanded-obstacle contact without tunneling', () => {
    const attacking: ChargerMovementSnapshot = {
      pos: { x: 46, y: 50 }, state: 'attacking', stateTimerMs: 600,
      dashDirection: { x: 1, y: 0 }, dashOrigin: { x: 20, y: 50 },
    };
    const result = chargerStep(attacking, { x: 200, y: 50 }, charger, 500, {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      obstacles: [{ x: 100, y: 40, w: 20, h: 20 }], bodyRadius: 13,
    });
    expect(result.pos.x).toBeCloseTo(87);
    expect(result.pos.y).toBe(50);
    expect(result.state).toBe('idle');
    expect(result.stateTimerMs).toBeCloseTo(1_200 - (500 - (41 / 260) * 1_000));

    const toContact = chargerStep(attacking, { x: 200, y: 50 }, charger, (41 / 260) * 1_000, {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      obstacles: [{ x: 100, y: 40, w: 20, h: 20 }], bodyRadius: 13,
    });
    const chunked = chargerStep(toContact, { x: 200, y: 50 }, charger, 500 - (41 / 260) * 1_000, {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      obstacles: [{ x: 100, y: 40, w: 20, h: 20 }], bodyRadius: 13,
    });
    expect(result).toEqual(chunked);
  });

  it('never clamps a dash endpoint inside an expanded obstacle at a wall corner', () => {
    // The dash exits the right wall while the straight dash line passes below
    // an obstacle AABB it never enters. A per-axis bounds clamp would pull the
    // endpoint off the dash line into the AABB; the parametric clamp keeps the
    // endpoint on the true trajectory at the wall crossing.
    const env = {
      bounds: { x: 0, y: 0, width: 300, height: 300 },
      obstacles: [{ x: 280, y: 110, w: 20, h: 30 }],
      bodyRadius: 13,
    };
    const dash: ChargerMovementDefinition = {
      speed: 100,
      attack: { triggerRange: 150, telegraphMs: 650, dashSpeed: 400, dashDurationMs: 700, cooldownMs: 1_200 },
    };
    const attacking: ChargerMovementSnapshot = {
      pos: { x: 100, y: 250 }, state: 'attacking', stateTimerMs: 700,
      dashDirection: { x: 0.919, y: -0.394 }, dashOrigin: { x: 100, y: 250 },
    };
    const result = chargerStep(attacking, { x: 450, y: 100 }, dash, 700, env);
    const insideStrict = (p: { x: number; y: number }) =>
      p.x > 280 - 13 && p.x < 280 + 20 + 13 && p.y > 110 - 13 && p.y < 110 + 30 + 13;
    // Endpoint sits at the right-wall crossing on the dash line, clear of the
    // expanded AABB; the dash completed into idle/cooldown.
    expect(insideStrict(result.pos)).toBe(false);
    expect(result.pos.x).toBeCloseTo(287);
    expect(result.pos.y).toBeCloseTo(250 - (0.394 / 0.919) * 187, 2);
    expect(result.state).toBe('idle');

    // Single large tick equals chunked ticks: the same wall-crossing point,
    // no tunneling into the AABB, and the same end state.
    const halfway = chargerStep(attacking, { x: 450, y: 100 }, dash, 400, env);
    expect(insideStrict(halfway.pos)).toBe(false);
    const chunked = chargerStep(halfway, { x: 450, y: 100 }, dash, 300, env);
    expect(insideStrict(chunked.pos)).toBe(false);
    expect(chunked).toEqual(result);
  });

  it('lets a dash starting on the expanded boundary move away from the obstacle', () => {
    // A charger that stopped at a prior collision rests exactly on the
    // expanded AABB face. A new dash pointing away from the obstacle must not
    // re-report that resting contact as a collision (enter starts at 0 and
    // boundary points read as inside): it would pin the charger into an
    // instant-idle loop.
    const env = {
      bounds: { x: 0, y: 0, width: 300, height: 100 },
      obstacles: [{ x: 100, y: 40, w: 20, h: 20 }],
      bodyRadius: 13,
    };
    const onBoundary: ChargerMovementSnapshot = {
      pos: { x: 87, y: 50 }, state: 'attacking', stateTimerMs: 600,
      dashDirection: { x: -1, y: 0 }, dashOrigin: { x: 87, y: 50 },
    };
    const leaving = chargerStep(onBoundary, { x: 0, y: 50 }, charger, 50, env);
    expect(leaving.state).toBe('attacking');
    // 50ms consumed → 150ms elapsed dash → 39px traveled from the origin.
    expect(leaving.pos.x).toBeCloseTo(87 - 260 * (150 / 1_000));
    expect(leaving.pos.y).toBe(50);

    // Dashing into the obstacle it is already touching still stops at once.
    const entering = chargerStep(
      { ...onBoundary, dashDirection: { x: 1, y: 0 } },
      { x: 200, y: 50 },
      charger,
      50,
      env,
    );
    expect(entering.state).toBe('idle');
    expect(entering.pos).toEqual({ x: 87, y: 50 });
  });

  it('rejects invalid charger timing and movement inputs', () => {
    expect(() => chargerStep(pursuing(), { x: 1, y: 1 }, charger, Number.NaN)).toThrow();
    expect(() =>
      chargerStep(
        pursuing(),
        { x: 1, y: 1 },
        { ...charger, attack: { ...charger.attack, telegraphMs: 0 } },
        1,
      ),
    ).toThrow();
    expect(() =>
      chargerStep(
        { ...pursuing(), stateTimerMs: Number.POSITIVE_INFINITY },
        { x: 1, y: 1 },
        charger,
        1,
      ),
    ).toThrow();

    const attacking: ChargerMovementSnapshot = {
      pos: { x: 0, y: 0 },
      state: 'attacking',
      stateTimerMs: Number.MAX_SAFE_INTEGER,
      dashDirection: { x: 1, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    };
    const extremeDash: ChargerMovementDefinition = {
      speed: 1,
      attack: {
        triggerRange: 1,
        telegraphMs: 1,
        dashSpeed: Number.MAX_VALUE,
        dashDurationMs: Number.MAX_SAFE_INTEGER,
        cooldownMs: 1,
      },
    };
    expect(() =>
      chargerStep(attacking, { x: 1, y: 0 }, extremeDash, Number.MAX_SAFE_INTEGER),
    ).toThrow();
    expect(attacking).toEqual({
      pos: { x: 0, y: 0 },
      state: 'attacking',
      stateTimerMs: Number.MAX_SAFE_INTEGER,
      dashDirection: { x: 1, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });
  });
});
