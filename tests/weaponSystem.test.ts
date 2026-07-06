import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import type { RunState } from '../src/gameplay/runState';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import { DEFAULT_SETTINGS, MemoryStorageAdapter, SaveManager } from '../src/systems/save';

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
    const registry = new DataWeaponRegistry(data);
    const pistol = registry.weaponById('scrap-pistol-t1');
    if (!pistol) {
      throw new Error('missing pistol');
    }

    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    runState.equipped = [registry.createWeaponInstance(pistol)];

    const settings = { ...DEFAULT_SETTINGS };
    const ctx: GameContext = {
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      save: new SaveManager(new MemoryStorageAdapter(), 'weapon-system-test'),
      settings,
      updateSettings(patch) {
        Object.assign(settings, patch);
        return settings;
      },
    };

    const enemySprite = new MockGameObject(60, 0);
    const enemy = {
      active: true,
      id: 1,
      instanceId: 1,
      x: 60,
      y: 0,
      sprite: enemySprite,
      definition: { id: 'dust-mite', xpValue: 1 },
      takeDamage: vi.fn(() => {
        enemy.active = false;
        enemySprite.active = false;
        return true;
      }),
    };
    const projectileGroup = {
      added: [] as MockGameObject[],
      add(sprite: MockGameObject): void {
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

  it('applies hit, kill, and XP-drop side effects once per projectile/enemy pair', async () => {
    const harness = await createHarness();
    const hit = vi.fn();
    const killed = vi.fn();
    harness.ctx.bus.on('projectile:hit', hit);
    harness.ctx.bus.on('enemy:killed', killed);

    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    harness.overlap?.(projectile, harness.enemy.sprite);
    harness.enemy.active = true;
    harness.enemy.sprite.active = true;
    harness.overlap?.(projectile, harness.enemy.sprite);

    expect(harness.enemy.takeDamage).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(killed).toHaveBeenCalledWith({
      instanceId: 1,
      enemyId: 'dust-mite',
      x: 60,
      y: 0,
    });
    expect(harness.runState.kills).toBe(1);
    expect(harness.createXpDrop).toHaveBeenCalledWith(60, 0, 1);
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
});
