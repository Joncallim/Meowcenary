import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameContext, type GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import type { RunState } from '../src/gameplay/runState';
import { createWeaponInstance } from '../src/gameplay/weapons';
import type { WeaponSystem } from '../src/systems/WeaponSystem';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { loadGameData } from '../src/systems/validation';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { isSpawnableEnemyDefinition } from '../src/systems/types';
import type { SpawnableEnemyDefinition } from '../src/systems/types';
import type { HeldWeaponPresentation } from '../src/entities/heldWeaponView';
import type { VisualArtLookup } from '../src/systems/visualArt';

class MockGameObject {
  active = true;
  visible = true;
  destroyed = false;
  alpha = 1;
  rotation = 0;
  body?: MockBody;
  played: string[] = [];

  constructor(
    public x = 0,
    public y = 0,
  ) {}

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

  setOrigin(): this {
    return this;
  }

  setScale(): this {
    return this;
  }

  setRotation(rotation: number): this {
    this.rotation = rotation;
    return this;
  }

  stop(): this {
    return this;
  }

  setFrame(): this {
    return this;
  }

  play(key: string): this {
    this.played.push(key);
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
    health: number;
    xpValue: number;
    scrapValue: number;
    definition: { id: string; xpValue: number; scrapValue: number; lootTableId?: string };
    takeDamage: ReturnType<typeof vi.fn>;
  };
  overlap?: (projectileObject: unknown, enemyObject: unknown) => void;
  projectileGroup: { added: MockGameObject[]; add: (sprite: MockGameObject) => void };
  player: { x: number; y: number };
  system: WeaponSystem;
}

// Forward declaration so the harness can be typed against the real class.
let WeaponSystemCtor: typeof WeaponSystem;

describe('WeaponSystem', () => {
  async function createHarness(options: {
    visualArt?: VisualArtLookup;
    heldWeapon?: HeldWeaponPresentation;
    weaponId?: string;
  } = {}): Promise<TestHarness> {
    const module = await import('../src/systems/WeaponSystem');
    WeaponSystemCtor = module.WeaponSystem;
    const data = loadGameData();
    const dustMite = data.enemies.find(
      (enemy): enemy is SpawnableEnemyDefinition =>
        enemy.id === 'dust-mite' && isSpawnableEnemyDefinition(enemy),
    );
    if (!dustMite) {
      throw new Error('missing validated dust-mite');
    }
    const registry = new DataWeaponRegistry(data);
    const weapon = registry.weaponById(options.weaponId ?? 'scrap-pistol-t1');
    if (!weapon) {
      throw new Error(`missing weapon ${options.weaponId ?? 'scrap-pistol-t1'}`);
    }

    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    runState.equipped = [registry.createWeaponInstance(weapon)];

    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const arenas = new DataArenaRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const ctx = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      arenas,
      metaUpgrades,
      characters,
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
      scrapValue: dustMite.scrapValue,
      definition: {
        id: dustMite.id,
        xpValue: dustMite.xpValue,
        scrapValue: dustMite.scrapValue,
        lootTableId: dustMite.lootTableId,
      },
      health: dustMite.health,
      takeDamage: vi.fn((amount: number) => {
        // Faithful to Enemy.takeDamage (Epic 11 §7): the payload reports the
        // health actually removed — capped at the enemy's remaining health —
        // so the mock's enemy:damaged events match the real enemy.
        const applied = Math.min(amount, enemy.health);
        enemy.health -= applied;
        ctx.bus.emit('enemy:damaged', {
          instanceId: enemy.instanceId,
          amount: applied,
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
    const system = new WeaponSystemCtor(
      scene as never,
      ctx,
      runState,
      player as never,
      [enemy] as never,
      projectileGroup as never,
      {} as never,
      registry,
      4,
      options.visualArt,
      options.heldWeapon,
    );

    return {
      system,
      runState,
      ctx,
      enemy,
      overlap,
      projectileGroup,
      player,
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
    expect(fired).toHaveBeenCalledWith({ weaponId: 'scrap-pistol-t1', family: 'pistol', tier: 1, x: 0, y: 0 });
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

  it('applies hit, kill, and enemy:killed side effects once per projectile/enemy pair', async () => {
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
      scrapValue: 1,
      x: 60,
      y: 0,
    });
    expect(killed).toHaveBeenCalledTimes(1);
    expect(damaged.mock.invocationCallOrder[0]).toBeLessThan(hit.mock.invocationCallOrder[0]);
    expect(hit.mock.invocationCallOrder[0]).toBeLessThan(killed.mock.invocationCallOrder[0]);
    expect(harness.runState.kills).toBe(1);
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
      // Same effective-damage cap as the default mock (Epic 11 §7).
      const applied = Math.min(amount, harness.enemy.health);
      harness.enemy.health -= applied;
      harness.ctx.bus.emit('enemy:damaged', {
        instanceId: harness.enemy.instanceId,
        amount: applied,
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
    expect(hit).toHaveBeenCalledWith({
      weaponId: 'scrap-pistol-t1', family: 'pistol', tier: 1, x: 60, y: 0, damage: 8, killed: false,
    });
    expect(damaged.mock.invocationCallOrder[0]).toBeLessThan(hit.mock.invocationCallOrder[0]);
    expect(killed).not.toHaveBeenCalled();
    expect(harness.runState.kills).toBe(0);
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
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);

    harness.system.update(600);
    harness.runState.equipped = [];
    harness.system.update(1);
    harness.runState.equipped = [weapon];
    harness.system.update(50);

    expect(fired).not.toHaveBeenCalled();

    harness.system.update(600);
    expect(fired).toHaveBeenCalledTimes(1);
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

  it('releases projectiles on range expiry and reuses the same sprite on later fire', async () => {
    const harness = await createHarness();
    const weapon = harness.runState.equipped[0];

    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    const sprite = projectile;
    expect(harness.system.activeProjectileCount).toBe(1);
    expect(harness.system.allocatedProjectileCount).toBe(1);

    // Prevent a second fire so we can age the projectile to expiry in isolation.
    harness.runState.equipped = [];
    harness.system.update(Number.NaN);
    harness.system.update(1_000);

    expect(projectile.active).toBe(false);
    expect(harness.system.activeProjectileCount).toBe(0);
    expect(harness.system.allocatedProjectileCount).toBe(1);

    harness.runState.equipped = [weapon];
    harness.system.update(650);
    const reused = harness.projectileGroup.added[1] ?? projectile;
    expect(reused).toBe(sprite);
    expect(harness.system.activeProjectileCount).toBe(1);
    expect(harness.system.allocatedProjectileCount).toBe(1);
  });

  it('reuses projectiles after a piercing kill and keeps fresh hit/damage state', async () => {
    const harness = await createHarness();

    harness.system.update(650);
    const firstSprite = harness.projectileGroup.added[0];
    harness.overlap?.(firstSprite, harness.enemy.sprite);

    harness.enemy.active = true;
    harness.enemy.sprite.active = true;
    harness.enemy.health = harness.enemy.definition.scrapValue + 100;
    harness.system.update(650);
    const secondSprite = harness.projectileGroup.added[1] ?? firstSprite;

    expect(harness.system.activeProjectileCount).toBe(1);
    expect(secondSprite).toBe(firstSprite);
    expect(secondSprite.body?.velocity.x).toBeGreaterThan(0);
  });

  it('ignores repeated overlap with a released projectile', async () => {
    const harness = await createHarness();
    const hit = vi.fn();
    harness.ctx.bus.on('projectile:hit', hit);

    harness.system.update(650);
    const projectile = harness.projectileGroup.added[0];
    harness.overlap?.(projectile, harness.enemy.sprite);
    hit.mockClear();

    harness.enemy.active = true;
    harness.enemy.sprite.active = true;
    harness.overlap?.(projectile, harness.enemy.sprite);

    expect(hit).not.toHaveBeenCalled();
  });

  it('destroys every owned projectile exactly once on system teardown', async () => {
    // R3 shortens pistol range below one pistol firing interval, so a second
    // pistol shot correctly reuses the released projectile. Use the rapid SMG
    // to exercise two simultaneously-owned projectiles instead.
    const harness = await createHarness({ weaponId: 'can-smg-t1' });

    harness.system.update(145);
    harness.system.update(145);
    const destroyed = harness.projectileGroup.added.map((sprite) => sprite.destroyed);
    expect(destroyed.every((flag) => !flag)).toBe(true);
    expect(harness.system.allocatedProjectileCount).toBe(2);

    harness.system.destroy();

    harness.projectileGroup.added.forEach((sprite) => {
      expect(sprite.destroyed).toBe(true);
    });
    expect(harness.system.allocatedProjectileCount).toBe(0);
  });

  it('releases each projectile to its creation pool even after the rack family changes', async () => {
    const harness = await createHarness();
    const registry = new DataWeaponRegistry(loadGameData());
    const pistol = registry.weaponById('scrap-pistol-t1');
    const smg = registry.weaponById('can-smg-t1');
    if (!pistol || !smg) throw new Error('missing test weapons');

    harness.runState.equipped = [createWeaponInstance(pistol, 'pistol')];
    harness.system.update(650);
    harness.runState.equipped = [];
    harness.system.update(1_000);

    harness.runState.equipped = [createWeaponInstance(smg, 'smg')];
    harness.system.update(145);
    harness.runState.equipped = [];
    harness.system.update(1_000);

    harness.runState.equipped = [createWeaponInstance(pistol, 'pistol-again')];
    harness.system.update(650);

    expect(harness.projectileGroup.added).toHaveLength(2);
    expect(harness.system.allocatedProjectileCount).toBe(2);
    expect(harness.system.activeProjectileCount).toBe(1);
  });

  it('presents the definition-owned held silhouette without changing fire events', async () => {
    const heldBinding = {
      id: 'weapon-held:pistol:t1', kind: 'weapon-held', textureKey: 'held',
      url: 'assets/held.png', required: true, sampling: 'nearest', load: { type: 'image' },
      display: { width: 28, height: 18 },
    } as const;
    const heldWeapon = {
      show: vi.fn(), update: vi.fn(), destroy: vi.fn(),
    } satisfies HeldWeaponPresentation;
    const visualArt: VisualArtLookup = {
      bindingById: (id) => id === heldBinding.id ? heldBinding : undefined,
      all: () => [heldBinding],
    };
    const harness = await createHarness({ visualArt, heldWeapon });
    const fired = vi.fn();
    harness.ctx.bus.on('weapon:fired', fired);

    harness.system.update(650);

    expect(heldWeapon.show).toHaveBeenCalledWith(heldBinding, 0, 0, 0, 3);
    expect(heldWeapon.update).toHaveBeenCalledWith(650, 0, 0);
    expect(fired).toHaveBeenCalledWith({ weaponId: 'scrap-pistol-t1', family: 'pistol', tier: 1, x: 0, y: 0 });

    // The presentation must track the player's live position on every update.
    harness.player.x = 24;
    harness.player.y = 48;
    harness.system.update(16);
    expect(heldWeapon.update).toHaveBeenCalledWith(16, 24, 48);

    harness.system.destroy();
    expect(heldWeapon.destroy).toHaveBeenCalledTimes(1);
  });

  describe('rack acquisition through existing behavior (Epic 14 §8.5)', () => {
    it('keeps cadence for all six valid rack instances', async () => {
      const harness = await createHarness();
      const fired = vi.fn();
      harness.ctx.bus.on('weapon:fired', fired);
      const weaponRegistry = new DataWeaponRegistry(loadGameData());
      const pistol = weaponRegistry.weaponById('scrap-pistol-t1');
      if (!pistol) throw new Error('missing pistol');

      harness.runState.equipped = Array.from({ length: 6 }, () => weaponRegistry.createWeaponInstance(pistol));
      harness.system.update(650);

      expect(fired).toHaveBeenCalledTimes(6);
      fired.mock.calls.forEach(([payload]) => {
        expect(payload.weaponId).toBe('scrap-pistol-t1');
      });
    });

    it('appends an acquired instance that fires on the normal next update', async () => {
      const harness = await createHarness();
      const fired = vi.fn();
      harness.ctx.bus.on('weapon:fired', fired);
      const pistol = new DataWeaponRegistry(loadGameData()).weaponById('scrap-pistol-t1');
      if (!pistol) throw new Error('missing pistol');

      harness.system.update(600);
      expect(fired).not.toHaveBeenCalled();

      // Distinct instance id: the harness already holds weapon-1, and a fresh
      // registry would mint a colliding id (WeaponSystem fails closed on
      // duplicate instance ids by design).
      harness.runState.equipped = [...harness.runState.equipped, createWeaponInstance(pistol, 'acquired-1')];
      harness.system.update(650);

      // First instance completes its 650ms interval; the fresh instance fires
      // once on its first interval too — no acquisition code poked cadences.
      expect(fired).toHaveBeenCalledTimes(2);
    });

    it('merge replacement prunes source cadences and fires the fresh result', async () => {
      const harness = await createHarness();
      const fired = vi.fn();
      harness.ctx.bus.on('weapon:fired', fired);
      const data = loadGameData();
      const weaponRegistry = new DataWeaponRegistry(data);
      const pistol = weaponRegistry.weaponById('scrap-pistol-t1');
      const pistolT2 = weaponRegistry.weaponById('scrap-pistol-t2');
      if (!pistol || !pistolT2) throw new Error('missing pistols');

      harness.runState.equipped = [
        weaponRegistry.createWeaponInstance(pistol),
        weaponRegistry.createWeaponInstance(pistol),
      ];
      harness.system.update(650);
      expect(fired).toHaveBeenCalledTimes(2);

      fired.mockClear();
      harness.runState.equipped = [weaponRegistry.createWeaponInstance(pistolT2)];
      harness.system.update(650);

      expect(fired).toHaveBeenCalledTimes(1);
      expect(fired.mock.calls[0][0].weaponId).toBe('scrap-pistol-t2');
    });
  });

  describe('projectile art binding (Epic 13 §9.4)', () => {
    const shotBinding = {
      id: 'projectile:default',
      kind: 'projectile',
      textureKey: 'art-projectile-scrap-shot',
      url: 'assets/projectiles/scrap-shot/scrap-shot.png',
      required: true,
             sampling: 'nearest',
             load: { type: 'spritesheet', frame: { width: 16, height: 16 } },
      display: { width: 8, height: 8 },
      clips: { fly: { start: 0, end: 1, frameRate: 12, repeat: -1 } },
    } as const;

    async function createArtProjectile() {
      const { Projectile } = await import('../src/entities/Projectile');
      const sprites: MockGameObject[] = [];
      const scene = {
        add: {
          circle: (x: number, y: number) => {
            const circle = new MockGameObject(x, y);
            sprites.push(circle);
            return circle;
          },
          sprite: () => {
            const sprite = new MockGameObject();
            sprites.push(sprite);
            return sprite;
          },
        },
        textures: { exists: (key: string) => key === shotBinding.textureKey },
        anims: { exists: (key: string) => key === 'art:projectile:default:fly' },
        physics: { add: { existing: (sprite: MockGameObject) => { sprite.body = new MockBody(sprite); } } },
      };
      const projectile = new Projectile(scene as never, 4, shotBinding);
      const [circle, glow, artSprite] = sprites;
      return { projectile, circle, glow, artSprite };
    }

    it('hides the circle and halo once and tracks the sprite with rotation', async () => {
      const { projectile, circle, glow, artSprite } = await createArtProjectile();
      expect(artSprite).toBeDefined();
      expect(circle.visible).toBe(false);
      expect(glow.visible).toBe(false);
      expect(artSprite.visible).toBe(false);
      expect(artSprite.played).toEqual([]);

      projectile.spawn(10, 20, { x: 0, y: -1 }, { speed: 300, damage: 5, range: 100, pierce: 0, weaponId: 'w', family: 'pistol', tier: 1 });
      expect(circle.visible).toBe(false);
      expect(glow.visible).toBe(false);
      expect(artSprite.active).toBe(true);
      expect(artSprite.visible).toBe(true);
      expect(artSprite.played).toEqual(['art:projectile:default:fly']);
      expect([artSprite.x, artSprite.y]).toEqual([10, 20]);
      expect(artSprite.rotation).toBeCloseTo(-Math.PI / 2);
      expect(circle.body?.velocity.y).toBeLessThan(0);

      projectile.update(16);
      expect([artSprite.x, artSprite.y]).toEqual([circle.x, circle.y]);
    });

    it('resets pooled art visibility and re-aims rotation on reuse', async () => {
      const { projectile, artSprite } = await createArtProjectile();
      projectile.spawn(10, 20, { x: 1, y: 0 }, { speed: 300, damage: 5, range: 100, pierce: 0, weaponId: 'w', family: 'pistol', tier: 1 });
      expect(artSprite.visible).toBe(true);

      projectile.reset();
      expect(artSprite.active).toBe(false);
      expect(artSprite.visible).toBe(false);

      projectile.spawn(30, 40, { x: 0, y: 1 }, { speed: 300, damage: 5, range: 100, pierce: 0, weaponId: 'w', family: 'pistol', tier: 1 });
      expect(artSprite.visible).toBe(true);
      expect([artSprite.x, artSprite.y]).toEqual([30, 40]);
      expect(artSprite.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('keeps the geometric circle and halo when no binding is present', async () => {
      const { Projectile } = await import('../src/entities/Projectile');
      const circles: MockGameObject[] = [];
      const scene = {
        add: {
          circle: (x: number, y: number) => {
            const circle = new MockGameObject(x, y);
            circles.push(circle);
            return circle;
          },
          sprite: () => {
            throw new Error('no sprite should be created without a binding');
          },
        },
        textures: { exists: () => false },
        anims: { exists: () => false },
        physics: { add: { existing: (sprite: MockGameObject) => { sprite.body = new MockBody(sprite); } } },
      };
      const projectile = new Projectile(scene as never, 4, undefined);
      expect(circles).toHaveLength(2);
      projectile.spawn(0, 0, { x: 1, y: 0 }, { speed: 300, damage: 5, range: 100, pierce: 0, weaponId: 'w', family: 'pistol', tier: 1 });
      expect(circles[0].visible).toBe(true);
      expect(circles[1].visible).toBe(true);
    });
  });
});
