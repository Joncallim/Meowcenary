import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, type RunStatus } from '../src/gameplay/runState';
import { loadGameData } from '../src/systems/validation';

class SpawnBody {
  velocity = { x: 0, y: 0 };

  constructor(private readonly owner: SpawnArc) {}

  setCircle(): void {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }

  reset(x: number, y: number): void {
    this.owner.x = x;
    this.owner.y = y;
    this.velocity = { x: 0, y: 0 };
  }
}

class SpawnArc {
  active = true;
  alpha = 1;
  body: SpawnBody | undefined;

  constructor(
    public x: number,
    public y: number,
  ) {
    this.body = new SpawnBody(this);
  }

  setDepth(): this {
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setStrokeStyle(): this {
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setVisible(): this {
    return this;
  }

  setActive(): this {
    return this;
  }

  setFillStyle(): this {
    return this;
  }

  destroy(): void {
    this.active = false;
    this.body = undefined;
  }
}

vi.mock('phaser', () => ({ default: {} }));

interface HarnessOptions {
  status?: RunStatus;
  enemies?: unknown[];
  arena?: Record<string, unknown>;
  curve?: Record<string, unknown>;
  visualArt?: unknown;
}

async function createHarness(options: HarnessOptions = {}) {
  const { SpawnSystem } = await import('../src/systems/SpawnSystem');
  const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  runState.status = options.status ?? 'active';
  const bus = createEventBus();
  const data = loadGameData();
  const enemies = options.enemies ?? [];
  const enemyGroup = { add: vi.fn() };
  const player = {
    active: true,
    x: 400,
    y: 300,
    sprite: { kind: 'player' },
    takeDamage: vi.fn(),
  };
  const overlaps: Array<(playerObject: unknown, enemyObject: unknown) => void> = [];
  const scene = {
    scale: { width: 800, height: 600 },
    add: { circle: (x: number, y: number) => new SpawnArc(x, y) },
    physics: {
      add: {
        existing: () => undefined,
        overlap(
          _playerObject: unknown,
          _enemyGroup: unknown,
          callback: (playerObject: unknown, enemyObject: unknown) => void,
          _processCallback: unknown,
          context: unknown,
        ): void {
          overlaps.push(callback.bind(context));
        },
      },
    },
  };
  const rng = { int: (min: number) => min, next: () => 0.5 };
  const arenaFixture = options.arena ?? {
    id: 'test', name: 'Test', size: { width: 390, height: 844 },
    spawnCurveId: 'curve',
    spawnRegions: [{ kind: 'edges' as const, margin: 28 }],
    obstacles: [], hazards: [],
    unlock: { type: 'default' as const },
  };
  const curveFixture = options.curve ?? {
    id: 'curve', durationSeconds: 360,
    scaling: { healthPerMinute: 0.18, damagePerMinute: 0.10 },
    waves: [{ startSecond: 0, enemyId: 'dust-mite', spawnEveryMs: 1600, maxAlive: 12 }],
  };
  const system = new SpawnSystem(
    scene as never,
    { bus, data } as never,
    runState,
    rng as never,
    player as never,
    enemies as never,
    enemyGroup as never,
    arenaFixture as never,
    curveFixture as never,
    options.visualArt as never,
  );

  return {
    system, runState, bus, data, enemies, enemyGroup, player, overlaps,
    get overlap() { return overlaps[0]; },
  };
}

describe('SpawnSystem', () => {
  it('materialises a pooled ranged threat and applies its authoritative damage once', async () => {
    const harness = await createHarness();
    expect(harness.overlaps).toHaveLength(25); // contact + fixed projectile pool
    harness.bus.emit('enemy:ranged-shot', {
      enemyId: 'scrap-sniper', x: 10, y: 20, dirX: 1, dirY: 0, damage: 6,
    });
    harness.overlaps[1]?.(harness.player.sprite, {});
    expect(harness.player.takeDamage).toHaveBeenCalledTimes(1);
    expect(harness.player.takeDamage).toHaveBeenCalledWith(6);
    harness.overlaps[1]?.(harness.player.sprite, {});
    expect(harness.player.takeDamage).toHaveBeenCalledTimes(1);
  });

  it('freezes active enemies without touching destroyed ones while not active', async () => {
    const activeBody = {
      velocity: { x: 40, y: -20 },
      setVelocity(x: number, y: number): void {
        this.velocity = { x, y };
      },
    };
    const activeEnemy = { active: true, body: activeBody, destroy: vi.fn() };
    const destroyedEnemy = { active: false, body: undefined as unknown, destroy: vi.fn() };
    const harness = await createHarness({ status: 'won', enemies: [destroyedEnemy, activeEnemy] });

    expect(() => harness.system.update(16)).not.toThrow();
    expect(activeBody.velocity).toEqual({ x: 0, y: 0 });
    expect(harness.enemies).toEqual([activeEnemy]);
    expect(destroyedEnemy.destroy).toHaveBeenCalledTimes(1);
  });

  it('publishes one spawned event after adding the runtime enemy to its group', async () => {
    const harness = await createHarness();
    const spawned = vi.fn();
    harness.bus.on('enemy:spawned', spawned);

    harness.system.update(1_600);

    expect(harness.enemies).toHaveLength(1);
    expect(harness.enemyGroup.add).toHaveBeenCalledTimes(1);
    expect(spawned).toHaveBeenCalledTimes(1);
    expect(harness.enemyGroup.add.mock.invocationCallOrder[0]).toBeLessThan(
      spawned.mock.invocationCallOrder[0],
    );
    const enemy = harness.enemies[0] as {
      instanceId: number;
      defId: string;
      pos: { x: number; y: number };
    };
    expect(spawned).toHaveBeenCalledWith({
      instanceId: enemy.instanceId,
      enemyId: enemy.defId,
      x: enemy.pos.x,
      y: enemy.pos.y,
    });
  });

  it('builds one frozen environment and reuses its identity for every spawned enemy', async () => {
    const obstacle = { x: 100, y: 120, w: 30, h: 40 };
    const harness = await createHarness({
      arena: {
        id: 'test', name: 'Test', size: { width: 390, height: 844 },
        spawnCurveId: 'curve', spawnRegions: [{ kind: 'edges', margin: 28 }],
        obstacles: [obstacle], hazards: [], unlock: { type: 'default' },
      },
    });

    harness.system.update(3_200);
    const spawned = harness.enemies as Array<{ environment?: unknown }>;
    const firstEnvironment = spawned[0].environment;
    expect(firstEnvironment).toBeDefined();
    expect(spawned[1].environment).toBe(firstEnvironment);
    expect(Object.isFrozen(firstEnvironment)).toBe(true);
    expect(Object.isFrozen((firstEnvironment as { obstacles: unknown[] }).obstacles[0])).toBe(true);
    expect((firstEnvironment as { obstacles: Array<{ x: number }> }).obstacles[0]).not.toBe(obstacle);
  });

  it('scales batched spawns from stable snapshots at each exact cadence timestamp', async () => {
    const harness = await createHarness();
    const source = harness.data.enemies.find((enemy) => enemy.id === 'dust-mite');
    if (!source || source.archetype === 'elite') throw new Error('missing dust-mite');
    source.health = 999;
    source.damage = 999;

    harness.system.update(3_200);

    expect(harness.enemies).toHaveLength(2);
    const spawned = harness.enemies as Array<{
      maxHealth: number;
      definition: { health: number; damage: number };
    }>;
    expect(spawned[0].maxHealth).toBeCloseTo(10 * (1 + 0.18 * (1_600 / 60_000)));
    expect(spawned[0].definition.damage).toBeCloseTo(5 * (1 + 0.1 * (1_600 / 60_000)));
    expect(spawned[1].maxHealth).toBeCloseTo(10 * (1 + 0.18 * (3_200 / 60_000)));
    expect(spawned[1].definition.damage).toBeCloseTo(5 * (1 + 0.1 * (3_200 / 60_000)));
    expect(source.health).toBe(999);
    expect(source.damage).toBe(999);
  });

  it('enforces runtime active counts and replaces capacity without backlog', async () => {
    const harness = await createHarness();

    harness.system.update(30_000);
    expect(harness.enemies).toHaveLength(12);
    expect(harness.enemyGroup.add).toHaveBeenCalledTimes(12);

    const removed = harness.enemies[0] as { destroy(): void };
    removed.destroy();
    harness.system.update(1_600);

    expect(harness.enemies).toHaveLength(12);
    expect(harness.enemyGroup.add).toHaveBeenCalledTimes(13);
  });

  it('does not advance spawn time while the run is paused', async () => {
    const harness = await createHarness({ status: 'paused' });

    harness.system.update(10_000);
    expect(harness.enemies).toHaveLength(0);
    harness.runState.status = 'active';
    harness.system.update(1_599);
    expect(harness.enemies).toHaveLength(0);
    harness.system.update(1);
    expect(harness.enemies).toHaveLength(1);
  });

  it('applies scaled contact damage only from live contact enemies during active play', async () => {
    const harness = await createHarness();
    harness.system.update(1_600);
    const enemy = harness.enemies[0] as {
      active: boolean;
      state: string;
      sprite: unknown;
      definition: { contactDamage: boolean; damage: number };
    };

    harness.overlap?.(harness.player.sprite, { gameObject: enemy.sprite });
    expect(harness.player.takeDamage).toHaveBeenCalledWith(enemy.definition.damage);
    expect(enemy.definition.damage).toBeGreaterThan(5);

    harness.runState.status = 'paused';
    harness.overlap?.(harness.player.sprite, enemy.sprite);
    expect(harness.player.takeDamage).toHaveBeenCalledTimes(1);

    harness.runState.status = 'active';
    const shell = {
      active: true,
      state: 'pursuing',
      sprite: { kind: 'shell' },
      definition: { contactDamage: false, damage: 999 },
    };
    harness.enemies.push(shell);
    harness.overlap?.(harness.player.sprite, shell.sprite);
    expect(harness.player.takeDamage).toHaveBeenCalledTimes(1);

    enemy.state = 'dead';
    harness.overlap?.(harness.player.sprite, enemy.sprite);
    expect(harness.player.takeDamage).toHaveBeenCalledTimes(1);
  });
});
