import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameContext, type GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import type { RunState } from '../src/gameplay/runState';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { loadGameData } from '../src/systems/validation';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { isSpawnableEnemyDefinition } from '../src/systems/types';
import type { SpawnableEnemyDefinition } from '../src/systems/types';

class MockGameObject {
  active = true;
  visible = true;
  destroyed = false;
  body?: MockBody;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(): this {
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  destroy(): void {
    this.active = false;
    this.destroyed = true;
  }
}

class MockBody {
  enable = true;
  velocity = { x: 0, y: 0 };

  constructor(readonly gameObject: MockGameObject) {}

  setCircle(): void {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: { GameObject: MockGameObject },
    Physics: { Arcade: { Body: MockBody, StaticBody: MockBody } },
  },
}));

interface TestHarness {
  runState: RunState;
  ctx: GameContext;
  enemy: {
    active: boolean;
    id: number;
    instanceId: number;
    x: number;
    y: number;
    sprite: MockGameObject;
    defId: string;
    xpValue: number;
    definition: { id: string; xpValue: number };
    takeDamage: ReturnType<typeof vi.fn>;
  };
  overlap?: (projectileObject: unknown, enemyObject: unknown) => void;
  projectileGroup: { added: MockGameObject[]; add: (sprite: MockGameObject) => void };
  createXpDrop: ReturnType<typeof vi.fn>;
}

describe('WeaponSystem', () => {
  async function createHarness(): Promise<TestHarness & { system: { update(dtMs: number): void } }> {
    const { WeaponSystem } = await import('../src/systems/WeaponSystem');
    const data = loadGameData();
    const dustMite = data.enemies.find(
      (enemy): enemy is SpawnableEnemyDefinition =>
        enemy.id === 'dust-mite' && isSpawnableEnemyDefinition(enemy),
    );
    if (!dustMite) {
      throw new Error('missing validated dust-mite');
    }
    const registry = new DataWeaponRegistry(data);
    const pistol = registry.weaponById('scrap-pistol-t1');
    if (!pistol) {
      throw new Error('missing pistol');
    }

    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    runState.equipped = [registry.createWeaponInstance(pistol)];

    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const ctx = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      metaUpgrades,
      save: new SaveManager(new MemoryStorageAdapter(), 'weapon-system-test', metaUpgrades.maxLevels()),
    });

    const enemySprite = new MockGameObject(60, 0);
    const enemy = {
      active: true,
      id: 1,
      instanceId: 1,
      x: 60,
      y: 0,
      sprite: enemySprite,
      defId: dustMite.id,
      xpValue: dustMite.xpValue,
      definition: { id: dustMite.id, xpValue: dustMite.xpValue },
      takeDamage: vi.fn((amount: number) => {
        ctx.bus.emit('enemy:damaged', {
          instanceId: enemy.instanceId,
          amount,
          x: enemy.x,
          y: enemy.y,
        });
        enemy.active = false;
        enemySprite.active = false;
        return true;
      }),
    };
    const projectileGroup = {
      added: [] as MockGameObject[],
      add(sprite: MockGameObject): void {
        // Faithful to Phaser's PhysicsGroup.add, which re-applies body defaults
        // (including velocity 0) to every added child. Spawning must therefore set
        // velocity AFTER the sprite joins the group.
        sprite.body?.setVelocity(0, 0);
        this.added.push(sprite);
      },
    };
    let overlap: TestHarness['overlap'];
    const scene = {
      add: {
        circle(x: number, y: number): MockGameObject {
          return new MockGameObject(x, y);
        },
      },
      physics: {
        add: {
          existing(sprite: MockGameObject): void {
            sprite.body = new MockBody(sprite);
          },
          overlap(
            _projectileGroup: unknown,
            _enemyGroup: unknown,
            callback: TestHarness['overlap'],
            _processCallback: unknown,
            context: unknown,
          ): void {
            overlap = callback ? callback.bind(context) : undefined;
          },
        },
      },
    };
    const player = { active: true, x: 0, y: 0, sprite: new MockGameObject(0, 0) };
    const createXpDrop = vi.fn();
    const system = new WeaponSystem(
      scene as never,
      ctx,
      runState,
      player as never,
      [enemy] as never,
      projectileGroup as never,
      {} as never,
      registry,
      createXpDrop,
      4,
    );

    return {
      system,
      runState,
      ctx,
      enemy,
      overlap,
      projectileGroup,
      createXpDrop,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires data-driven projectile counts and emits weapon:fired', async () => {
    const harness = await createHarness();
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);
    harness.runState.stats.add({
      stat: 'projectileCount',
      op: 'add',
      value: 2,
      sourceId: 'test-multishot',
    });

    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(3);
    expect(fired).toHaveBeenCalledWith({ weaponId: 'scrap-pistol-t1', x: 0, y: 0 });
  });

  it('spawns projectiles with a live velocity toward the target after group add', async () => {
    const harness = await createHarness();

    harness.system.update(650);

    const projectile = harness.projectileGroup.added[0];
    expect(projectile).toBeDefined();
    // Enemy sits at (60, 0) and the player at (0, 0), so the shot travels +x.
    // If spawn() ran before projectileGroup.add(), the group's default-reset would
    // leave this at (0, 0) and projectiles would never move.
    expect(projectile.body?.velocity.x).toBeGreaterThan(0);
    expect(projectile.body?.velocity.y).toBe(0);
  });

  it('does not fire projectiles with unusable resolved combat stats', async () => {
    const harness = await createHarness();
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);
    harness.runState.stats.add({
      stat: 'projectileSpeed',
      op: 'add',
      value: -1_000,
      sourceId: 'invalid-speed',
    });

    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(0);
    expect(fired).not.toHaveBeenCalled();
  });

  it('applies hit, kill, and XP-drop side effects once per projectile/enemy pair', async () => {
    const harness = await createHarness();
    const damaged = vi.fn();
    const hit = vi.fn();
    const killed = vi.fn();
    harness.ctx.bus.on('enemy:damaged', damaged);
    harness.ctx.bus.on('projectile:hit', hit);
    harness.ctx.bus.on('enemy:killed', killed);

    harness.system.update(650);
    expect(harness.enemy.definition.xpValue).toBeGreaterThan(0);
    harness.enemy.definition.id = 'mutated-enemy';
    harness.enemy.definition.xpValue = 999;
    const projectile = harness.projectileGroup.added[0];
    harness.overlap?.(projectile, harness.enemy.sprite);
    harness.enemy.active = true;
    harness.enemy.sprite.active = true;
    harness.overlap?.(projectile, harness.enemy.sprite);

    expect(harness.enemy.takeDamage).toHaveBeenCalledTimes(1);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(killed).toHaveBeenCalledWith({
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      x: 60,
      y: 0,
    });
    expect(killed).toHaveBeenCalledTimes(1);
    expect(damaged.mock.invocationCallOrder[0]).toBeLessThan(hit.mock.invocationCallOrder[0]);
    expect(hit.mock.invocationCallOrder[0]).toBeLessThan(killed.mock.invocationCallOrder[0]);
    expect(harness.runState.kills).toBe(1);
    expect(harness.createXpDrop).toHaveBeenCalledWith(60, 0, 1);
  });

  it('does not classify synchronous cleanup during damage as a combat kill', async () => {
    const harness = await createHarness();
    const damaged = vi.fn();
    const hit = vi.fn();
    const killed = vi.fn();
    harness.ctx.bus.on('enemy:damaged', damaged);
    harness.ctx.bus.on('projectile:hit', hit);
    harness.ctx.bus.on('enemy:killed', killed);
    harness.enemy.takeDamage.mockImplementationOnce((amount: number) => {
      harness.ctx.bus.emit('enemy:damaged', {
        instanceId: harness.enemy.instanceId,
        amount,
        x: harness.enemy.x,
        y: harness.enemy.y,
      });
      harness.enemy.active = false;
      harness.enemy.sprite.active = false;
      return false;
    });

    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    harness.overlap?.(projectile, harness.enemy.sprite);

    expect(harness.enemy.takeDamage).toHaveBeenCalledTimes(1);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith({ x: 60, y: 0, damage: 8, killed: false });
    expect(damaged.mock.invocationCallOrder[0]).toBeLessThan(hit.mock.invocationCallOrder[0]);
    expect(killed).not.toHaveBeenCalled();
    expect(harness.runState.kills).toBe(0);
    expect(harness.createXpDrop).not.toHaveBeenCalled();
  });

  it('does not advance cadence, projectiles, or overlap damage while paused', async () => {
    const harness = await createHarness();

    harness.runState.status = 'paused';
    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(0);

    harness.runState.status = 'active';
    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    const velocityBeforePause = { ...projectile.body?.velocity };

    harness.runState.status = 'paused';
    harness.system.update(10_000);
    harness.overlap?.(projectile, harness.enemy.sprite);

    expect(projectile.active).toBe(true);
    expect(projectile.body?.velocity).toEqual(velocityBeforePause);
    expect(harness.enemy.takeDamage).not.toHaveBeenCalled();
  });

  it('fails closed when equipped state disagrees with its weapon definition', async () => {
    const harness = await createHarness();
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);
    harness.runState.equipped[0] = {
      ...harness.runState.equipped[0],
      family: 'shotgun',
      tier: 3,
    };

    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(0);
    expect(fired).not.toHaveBeenCalled();
  });

  it('drops stale cadence progress when a weapon is unequipped', async () => {
    const harness = await createHarness();
    const [weapon] = harness.runState.equipped;

    harness.system.update(600);
    harness.runState.equipped = [];
    harness.system.update(1);
    harness.runState.equipped = [weapon];
    harness.system.update(50);

    expect(harness.projectileGroup.added).toHaveLength(0);

    harness.system.update(600);
    expect(harness.projectileGroup.added).toHaveLength(1);
  });

  it('fails closed when equipped weapons repeat an instance id', async () => {
    const harness = await createHarness();
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);
    const [weapon] = harness.runState.equipped;
    harness.runState.equipped = [weapon, { ...weapon }];

    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(0);
    expect(fired).not.toHaveBeenCalled();
  });

  it('ignores invalid projectile delta without poisoning later range expiry', async () => {
    const harness = await createHarness();

    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    harness.system.update(Number.NaN);
    harness.system.update(1_000);

    expect(projectile.destroyed).toBe(true);
  });
});
