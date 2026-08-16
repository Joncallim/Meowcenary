import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import type { ResolvedEnemyDefinition } from '../src/systems/types';

class MockBody {
  velocity = { x: 0, y: 0 };
  setCircle = vi.fn();
  setPosition = vi.fn();
  setSize = vi.fn();

  constructor(private readonly owner: MockArc) {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }

  reset(x: number, y: number): void {
    this.owner.x = x;
    this.owner.y = y;
    this.velocity = { x: 0, y: 0 };
  }
}

class MockArc {
  active = true;
  alpha = 1;
  body: MockBody | undefined;

  constructor(
    public x: number,
    public y: number,
  ) {
    this.body = new MockBody(this);
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
  }
}

vi.mock('phaser', () => ({ default: {} }));

function enemyDefinition(): ResolvedEnemyDefinition {
  return {
    id: 'test-enemy',
    name: 'Test Enemy',
    archetype: 'chaser',
    health: 10,
    damage: 1,
    speed: 1,
    xpValue: 1,
    scrapValue: 1,
    contactDamage: true,
  };
}

  describe('Enemy', () => {
  async function createEnemy(
    bus = createEventBus(),
    definition = enemyDefinition(),
  ): Promise<{
    enemy: InstanceType<typeof import('../src/entities/Enemy').Enemy>;
    sprite: MockArc;
  }> {
    const { Enemy } = await import('../src/entities/Enemy');
    const circles: MockArc[] = [];
    const scene = {
      add: {
        circle: (x: number, y: number) => {
          const arc = new MockArc(x, y);
          circles.push(arc);
          return arc;
        },
      },
      physics: { add: { existing: () => undefined } },
    };
    return {
      enemy: new Enemy(
        scene as never,
        definition,
        10,
        20,
        bus,
      ),
      sprite: circles[0],
    };
  }

  it('ignores non-finite damage without corrupting health', async () => {
    const { enemy } = await createEnemy();

    expect(enemy.takeDamage(Number.NaN)).toBe(false);
    expect(enemy.takeDamage(Number.POSITIVE_INFINITY)).toBe(false);
    expect(enemy.health).toBe(10);
    expect(enemy.active).toBe(true);
  });

  it('exposes stable runtime identity and a live position snapshot', async () => {
    const { enemy, sprite } = await createEnemy();

    expect(enemy.instanceId).toBeGreaterThan(0);
    expect(enemy.id).toBe(enemy.instanceId);
    expect(enemy.defId).toBe('test-enemy');
    expect(enemy.archetype).toBe('chaser');
    expect(enemy.health).toBe(10);
    expect(enemy.maxHealth).toBe(10);
    expect(enemy.state).toBe('pursuing');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.xpValue).toBe(1);
    expect(enemy.scrapValue).toBe(1);
    expect(enemy.pos).toEqual({ x: 10, y: 20 });

    sprite.x = 30;
    sprite.y = 40;
    expect(enemy.pos).toEqual({ x: 30, y: 40 });
  });

  it('owns immutable definition values independently of its caller and siblings', async () => {
    const source = enemyDefinition();
    const first = await createEnemy(createEventBus(), source);
    const sibling = await createEnemy(createEventBus(), source);

    source.id = 'mutated-enemy';
    source.archetype = 'tank';
    source.speed = 99;
    source.xpValue = 99;

    first.enemy.update({ active: true, x: 20, y: 20 } as never, 1_000);

    expect(first.enemy.defId).toBe('test-enemy');
    expect(first.enemy.archetype).toBe('chaser');
    expect(first.enemy.xpValue).toBe(1);
    expect(first.enemy.scrapValue).toBe(1);
    // Velocity-based movement: position unchanged until physics step
    expect(first.enemy.pos).toEqual({ x: 10, y: 20 });
    // Velocity set toward target
    const v = first.sprite.body?.velocity;
    expect(v?.x).toBeCloseTo(1, 0);
    expect(v?.y).toBeCloseTo(0, 0);
    expect(sibling.enemy.defId).toBe('test-enemy');
    expect(sibling.enemy.archetype).toBe('chaser');
    expect(sibling.enemy.xpValue).toBe(1);
    expect(sibling.enemy.scrapValue).toBe(1);
    expect(Object.isFrozen(first.enemy.definition)).toBe(true);
    expect(Reflect.set(first.enemy.definition, 'xpValue', 500)).toBe(false);
    expect(sibling.enemy.xpValue).toBe(1);
  });

  it('runs charger windup, dash, and cooldown state through the pure movement helper', async () => {
    const definition: ResolvedEnemyDefinition = {
      id: 'test-charger',
      name: 'Test Charger',
      archetype: 'charger',
      health: 10,
      damage: 1,
      speed: 100,
      xpValue: 1,
      scrapValue: 1,
      contactDamage: true,
      attack: {
        triggerRange: 150,
        telegraphMs: 650,
        dashSpeed: 260,
        dashDurationMs: 700,
        cooldownMs: 1_200,
      },
    };
    const { enemy, sprite } = await createEnemy(createEventBus(), definition);
    const player = { active: true, x: 100, y: 20 } as never;

    enemy.update(player, 1);
    expect(enemy.state).toBe('winding');
    expect(enemy.stateTimerMs).toBe(649);
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });

    enemy.update(player, 649);
    expect(enemy.state).toBe('attacking');
    expect(enemy.stateTimerMs).toBe(700);

    enemy.update(player, 100);
    expect(enemy.state).toBe('attacking');
    expect(enemy.stateTimerMs).toBe(600);
    expect(enemy.pos).toEqual({ x: 36, y: 20 });
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });

    enemy.update(player, 600);
    expect(enemy.state).toBe('idle');
    expect(enemy.stateTimerMs).toBe(1_200);
    expect(enemy.pos).toEqual({ x: 192, y: 20 });
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });

    enemy.update(player, 1_200);
    expect(enemy.state).toBe('pursuing');
    expect(enemy.stateTimerMs).toBe(0);
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });
  });

  it('keeps Phaser-order charger position and phases identical across frame chunks', async () => {
    const definition: ResolvedEnemyDefinition = {
      id: 'frame-charger',
      name: 'Frame Charger',
      archetype: 'charger',
      health: 10,
      damage: 1,
      speed: 100,
      xpValue: 1,
      scrapValue: 1,
      contactDamage: true,
      attack: {
        triggerRange: 150,
        telegraphMs: 650,
        dashSpeed: 260,
        dashDurationMs: 700,
        cooldownMs: 1_200,
      },
    };
    const coarse = await createEnemy(createEventBus(), definition);
    const fine = await createEnemy(createEventBus(), definition);
    const player = { active: true, x: 100, y: 20 } as never;

    function advance(
      enemy: typeof coarse.enemy,
      sprite: MockArc,
      dtMs: number,
      frames: number,
    ): void {
      for (let frame = 0; frame < frames; frame += 1) {
        // Mirrors Phaser Arcade ordering: consume prior velocity before scene update.
        const velocity = sprite.body?.velocity ?? { x: 0, y: 0 };
        sprite.x += velocity.x * (dtMs / 1_000);
        sprite.y += velocity.y * (dtMs / 1_000);
        enemy.update(player, dtMs);
      }
    }

    advance(coarse.enemy, coarse.sprite, 50, 28);
    advance(fine.enemy, fine.sprite, 10, 140);

    expect(coarse.enemy.pos.x).toBeCloseTo(192);
    expect(coarse.enemy.pos).toEqual(fine.enemy.pos);
    expect(coarse.enemy.state).toBe('idle');
    expect(coarse.enemy.state).toBe(fine.enemy.state);
    expect(coarse.enemy.stateTimerMs).toBe(1_150);
    expect(coarse.enemy.stateTimerMs).toBe(fine.enemy.stateTimerMs);
    expect(coarse.sprite.body?.velocity).toEqual({ x: 0, y: 0 });
    expect(fine.sprite.body?.velocity).toEqual({ x: 0, y: 0 });
  });

  describe('presentation wiring (Epic 13 §7.5)', () => {
    class SpriteNode {
      flipX = false;
      plays: string[] = [];

      constructor(
        public x: number,
        public y: number,
      ) {}

      setDepth(): this {
        return this;
      }

      setOrigin(): this {
        return this;
      }

      setScale(): this {
        return this;
      }

      setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
      }

      setFlipX(value: boolean): this {
        this.flipX = value;
        return this;
      }

      setAlpha(): this {
        return this;
      }

      play(key: string): this {
        this.plays.push(key);
        return this;
      }

      on(): this { return this; }
      off(): this { return this; }

      destroy(): void {}
    }

    const artBinding = {
      id: 'enemy:test-charger',
      kind: 'enemy',
      textureKey: 'sheet',
      url: 'assets/x.png',
      required: true,
      load: { type: 'spritesheet', frame: { width: 48, height: 48 } },
      display: { width: 26, height: 26 },
      clips: {
        idle: { start: 0, end: 3, frameRate: 6, repeat: -1 },
        run: { start: 4, end: 9, frameRate: 10, repeat: -1 },
        hurt: { start: 10, end: 11, frameRate: 12, repeat: 0 },
        defeat: { start: 12, end: 15, frameRate: 8, repeat: 0 },
      },
    } as const;

    async function createArtEnemy(
      definition: ResolvedEnemyDefinition,
      spawnX: number,
      bus = createEventBus(),
    ): Promise<{ enemy: InstanceType<typeof import('../src/entities/Enemy').Enemy>; sprite: SpriteNode }> {
      const { Enemy } = await import('../src/entities/Enemy');
      const sprites: SpriteNode[] = [];
      const scene = {
        add: {
          circle: (x: number, y: number) => new MockArc(x, y),
          sprite: (x: number, y: number) => {
            const sprite = new SpriteNode(x, y);
            sprites.push(sprite);
            return sprite;
          },
        },
        textures: { exists: () => true },
        anims: { exists: () => true },
        physics: { add: { existing: () => undefined } },
      };
      return {
        enemy: new Enemy(scene as never, definition, spawnX, 20, bus, artBinding),
        sprite: sprites[0],
      };
    }

    it('shows the run clip while a charger pursues and the idle clip once stopped', async () => {
      const definition: ResolvedEnemyDefinition = {
        id: 'test-charger',
        name: 'Test Charger',
        archetype: 'charger',
        health: 10,
        damage: 1,
        speed: 100,
        xpValue: 1,
        scrapValue: 1,
        contactDamage: true,
        attack: {
          triggerRange: 150,
          telegraphMs: 650,
          dashSpeed: 260,
          dashDurationMs: 700,
          cooldownMs: 1_200,
        },
      };
      const { enemy, sprite } = await createArtEnemy(definition, 10);
      expect(sprite.plays).toEqual(['art:enemy:test-charger:idle']);

      // Far target: pursuit moves the charger each tick despite zeroed velocity.
      enemy.update({ active: true, x: 400, y: 20 } as never, 16);
      expect(enemy.state).toBe('pursuing');
      expect(sprite.plays).toContain('art:enemy:test-charger:run');

      // Winding is stationary: the clip returns to idle.
      enemy.update({ active: true, x: 100, y: 20 } as never, 16);
      expect(enemy.state).toBe('winding');
      const playsAfterWinding = sprite.plays.filter(
        (key) => key === 'art:enemy:test-charger:idle',
      ).length;
      expect(playsAfterWinding).toBe(2);
    });

    it('plays hurt before nonlethal damage emission and skips it on lethal destroy', async () => {
      const definition: ResolvedEnemyDefinition = {
        id: 'test-charger', name: 'Test Charger', archetype: 'charger',
        health: 10, damage: 1, speed: 100, xpValue: 1, scrapValue: 1, contactDamage: true,
        attack: {
          triggerRange: 150, telegraphMs: 650, dashSpeed: 260,
          dashDurationMs: 700, cooldownMs: 1_200,
        },
      };
      const bus = createEventBus();
      const { enemy, sprite } = await createArtEnemy(definition, 10, bus);
      const presentationsAtDamage: string[] = [];
      bus.on('enemy:damaged', () => presentationsAtDamage.push(sprite.plays.at(-1) ?? 'none'));

      expect(enemy.takeDamage(2)).toBe(false);
      expect(presentationsAtDamage).toEqual(['art:enemy:test-charger:hurt']);
      const hurtCount = sprite.plays.filter((key) => key.endsWith(':hurt')).length;
      expect(enemy.takeDamage(99)).toBe(true);
      expect(sprite.plays.filter((key) => key.endsWith(':hurt'))).toHaveLength(hurtCount);
    });

    it('faces the target while winding and the dash direction while attacking', async () => {
      const definition: ResolvedEnemyDefinition = {
        id: 'test-charger',
        name: 'Test Charger',
        archetype: 'charger',
        health: 10,
        damage: 1,
        speed: 100,
        xpValue: 1,
        scrapValue: 1,
        contactDamage: true,
        attack: {
          triggerRange: 150,
          telegraphMs: 650,
          dashSpeed: 260,
          dashDurationMs: 700,
          cooldownMs: 1_200,
        },
      };
      // Target left of the spawn point: winding faces left (flipX true).
      const leftFacing = await createArtEnemy(definition, 10);
      leftFacing.enemy.update({ active: true, x: -60, y: 20 } as never, 16);
      expect(leftFacing.enemy.state).toBe('winding');
      expect(leftFacing.sprite.flipX).toBe(true);

      // Target right of the spawn point: winding faces right (flipX false).
      const rightFacing = await createArtEnemy(definition, 10);
      rightFacing.enemy.update({ active: true, x: 60, y: 20 } as never, 16);
      expect(rightFacing.enemy.state).toBe('winding');
      expect(rightFacing.sprite.flipX).toBe(false);

      // Complete the telegraph: attacking adopts the locked dash direction.
      rightFacing.enemy.update({ active: true, x: 60, y: 20 } as never, 650);
      expect(rightFacing.enemy.state).toBe('attacking');
      expect(rightFacing.sprite.flipX).toBe(false);

      leftFacing.enemy.update({ active: true, x: -60, y: 20 } as never, 650);
      expect(leftFacing.enemy.state).toBe('attacking');
      expect(leftFacing.sprite.flipX).toBe(true);
    });
  });

  describe('Epic 17 (D7): telegraph and weight presentation', () => {
    const chargerDefinition: ResolvedEnemyDefinition = {
      id: 'test-charger',
      name: 'Test Charger',
      archetype: 'charger',
      health: 10,
      damage: 1,
      speed: 100,
      xpValue: 1,
      scrapValue: 1,
      contactDamage: true,
      attack: {
        triggerRange: 150,
        telegraphMs: 650,
        dashSpeed: 260,
        dashDurationMs: 700,
        cooldownMs: 1_200,
      },
    };

    it('pulses the code-drawn accent node through the winding telegraph and rests at full alpha elsewhere', async () => {
      const { telegraphPulseAlpha } = await import('../src/entities/actorView');
      const bus = createEventBus();
      const circles: MockArc[] = [];
      const scene = {
        add: {
          circle: (x: number, y: number) => {
            const arc = new MockArc(x, y);
            circles.push(arc);
            return arc;
          },
        },
        physics: { add: { existing: () => undefined } },
      };
      const { Enemy } = await import('../src/entities/Enemy');
      const enemy = new Enemy(scene as never, chargerDefinition, 10, 20, bus);
      const accent = circles[1]!;
      const player = { active: true, x: 100, y: 20 } as never;

      expect(accent.alpha).toBe(1);

      enemy.update(player, 1);
      expect(enemy.state).toBe('winding');
      const progress = 1 - enemy.stateTimerMs / chargerDefinition.attack.telegraphMs;
      expect(accent.alpha).toBeCloseTo(telegraphPulseAlpha(progress));

      enemy.update(player, 649);
      expect(enemy.state).toBe('attacking');
      expect(accent.alpha).toBe(1);
    });

    it('emits enemy:dashed exactly once at the winding-to-attacking edge with the locked dash direction', async () => {
      const bus = createEventBus();
      const dashed = vi.fn();
      bus.on('enemy:dashed', dashed);
      const { enemy } = await createEnemy(bus, chargerDefinition);
      const player = { active: true, x: 100, y: 20 } as never;

      enemy.update(player, 1);
      expect(enemy.state).toBe('winding');
      expect(dashed).not.toHaveBeenCalled();

      enemy.update(player, 649);
      expect(enemy.state).toBe('attacking');
      expect(dashed).toHaveBeenCalledTimes(1);
      const [call] = dashed.mock.calls[0]!;
      expect(call.x).toBeCloseTo(enemy.pos.x);
      expect(call.y).toBeCloseTo(enemy.pos.y);
      expect(call.dirX).toBeCloseTo(1);
      expect(call.dirY).toBeCloseTo(0);

      enemy.update(player, 100);
      expect(enemy.state).toBe('attacking');
      expect(dashed).toHaveBeenCalledTimes(1);
    });

    it('emits enemy:heavyStep on a fixed-distance cadence for the tank archetype only', async () => {
      const tankDefinition: ResolvedEnemyDefinition = {
        id: 'test-tank',
        name: 'Test Tank',
        archetype: 'tank',
        health: 72,
        damage: 14,
        speed: 480,
        xpValue: 6,
        scrapValue: 5,
        contactDamage: true,
      };
      const bus = createEventBus();
      const heavyStep = vi.fn();
      bus.on('enemy:heavyStep', heavyStep);
      const { enemy } = await createEnemy(bus, tankDefinition);
      const player = { active: true, x: 10_000, y: 20 } as never;

      // 480px/s * 100ms = 48px per tick, matching the interval exactly.
      enemy.update(player, 100);
      expect(heavyStep).toHaveBeenCalledTimes(1);
      enemy.update(player, 100);
      expect(heavyStep).toHaveBeenCalledTimes(2);
    });

    it('never emits enemy:heavyStep for a chaser covering the same distance', async () => {
      const fastChaser: ResolvedEnemyDefinition = {
        id: 'test-fast-chaser',
        name: 'Test Fast Chaser',
        archetype: 'chaser',
        health: 10,
        damage: 1,
        speed: 480,
        xpValue: 1,
        scrapValue: 1,
        contactDamage: true,
      };
      const bus = createEventBus();
      const heavyStep = vi.fn();
      bus.on('enemy:heavyStep', heavyStep);
      const { enemy } = await createEnemy(bus, fastChaser);
      const player = { active: true, x: 10_000, y: 20 } as never;

      enemy.update(player, 100);
      enemy.update(player, 100);
      expect(heavyStep).not.toHaveBeenCalled();
    });
  });

  it('fails closed for a subnormal runtime delta without writing non-finite velocity', async () => {
    const { enemy, sprite } = await createEnemy();
    sprite.body?.setVelocity(20, 20);

    expect(() =>
      enemy.update({ active: true, x: 100, y: 20 } as never, Number.MIN_VALUE),
    ).not.toThrow();
    expect(enemy.pos).toEqual({ x: 10, y: 20 });
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });
    expect(Number.isFinite(sprite.body?.velocity.x)).toBe(true);
    expect(Number.isFinite(sprite.body?.velocity.y)).toBe(true);
    expect(enemy.state).toBe('pursuing');
  });

  it('keeps deferred shell behavior and invalid frame deltas stopped', async () => {
    const boss: ResolvedEnemyDefinition = {
      id: 'test-boss',
      name: 'Test Boss',
      archetype: 'boss',
      health: 100,
      damage: 10,
      speed: 50,
      xpValue: 10,
      scrapValue: 10,
      contactDamage: false,
    };
    const { enemy: bossEnemy, sprite: bossSprite } = await createEnemy(createEventBus(), boss);
    bossSprite.body?.setVelocity(20, 20);

    bossEnemy.update({ active: true, x: 100, y: 20 } as never, 16);
    expect(bossSprite.body?.velocity).toEqual({ x: 0, y: 0 });

    const { enemy: chaser, sprite: chaserSprite } = await createEnemy();
    chaserSprite.body?.setVelocity(20, 20);
    chaser.update({ active: true, x: 100, y: 20 } as never, Number.NaN);
    expect(chaserSprite.body?.velocity).toEqual({ x: 0, y: 0 });
  });

  it('emits accepted damage and transitions lethal damage to dead exactly once', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy } = await createEnemy(bus);

    expect(enemy.takeDamage(4)).toBe(false);
    expect(enemy.health).toBe(6);
    expect(enemy.state).toBe('pursuing');
    expect(damaged).toHaveBeenLastCalledWith({
      instanceId: enemy.instanceId,
      amount: 4,
      x: 10,
      y: 20,
    });

    expect(enemy.takeDamage(99)).toBe(true);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.active).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(2);
    // Overkill is reported as the health actually removed — the 99-damage
    // hit on 6 remaining health emits amount: 6, never more than the
    // pre-hit health (Epic 11 §7).
    expect(damaged).toHaveBeenLastCalledWith({
      instanceId: enemy.instanceId,
      amount: 6,
      x: 10,
      y: 20,
    });
    expect(enemy.takeDamage(1)).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(killed).not.toHaveBeenCalled();
  });

  it('makes cleanup removal idempotent without emitting combat lifecycle events', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy, sprite } = await createEnemy(bus);

    enemy.destroy();
    enemy.destroy();

    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });
    expect(damaged).not.toHaveBeenCalled();
    expect(killed).not.toHaveBeenCalled();
  });

  it('normalizes repeated cleanup after Phaser has already removed the body', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy, sprite } = await createEnemy(bus);
    enemy.stateTimerMs = 250;
    sprite.destroy();
    sprite.body = undefined;

    expect(() => {
      enemy.destroy();
      enemy.destroy();
    }).not.toThrow();

    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.active).toBe(false);
    expect(damaged).not.toHaveBeenCalled();
    expect(killed).not.toHaveBeenCalled();
  });

  it('pins the exported body radius with exactly one construction-time setCircle', async () => {
    const { ENEMY_BODY_RADIUS } = await import('../src/entities/Enemy');
    expect(ENEMY_BODY_RADIUS).toBe(13);
    const { sprite } = await createEnemy();
    expect(sprite.body?.setCircle).toHaveBeenCalledTimes(1);
    expect(sprite.body?.setCircle).toHaveBeenCalledWith(ENEMY_BODY_RADIUS);
  });

  it('never lets presentation poses touch the body size or position APIs', async () => {
    const definition: ResolvedEnemyDefinition = {
      id: 'test-charger',
      name: 'Test Charger',
      archetype: 'charger',
      health: 10,
      damage: 1,
      speed: 100,
      xpValue: 1,
      scrapValue: 1,
      contactDamage: true,
      attack: {
        triggerRange: 150,
        telegraphMs: 650,
        dashSpeed: 260,
        dashDurationMs: 700,
        cooldownMs: 1_200,
      },
    };
    const { enemy, sprite } = await createEnemy(createEventBus(), definition);
    const player = { active: true, x: 100, y: 20 } as never;

    // Pursue, wind, dash, idle, and damage-tint transitions across updates.
    enemy.update(player, 16);
    enemy.update(player, 16);
    enemy.update(player, 700);
    enemy.update(player, 100);
    enemy.update(player, 600);
    enemy.update(player, 1_200);

    expect(sprite.body?.setCircle).toHaveBeenCalledTimes(1);
    expect(sprite.body?.setPosition).not.toHaveBeenCalled();
    expect(sprite.body?.setSize).not.toHaveBeenCalled();
  });

  it('returns the committed nonlethal outcome when a damage listener performs cleanup', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const { enemy } = await createEnemy(bus);
    bus.on('enemy:damaged', (event) => {
      damaged(event);
      enemy.destroy();
    });

    expect(enemy.takeDamage(1)).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
  });

  it('commits lethal state before notification and rejects reentrant damage', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const reentrantOutcomes: boolean[] = [];
    const { enemy } = await createEnemy(bus);
    bus.on('enemy:damaged', (event) => {
      damaged(event);
      reentrantOutcomes.push(enemy.takeDamage(1));
    });

    expect(enemy.takeDamage(10)).toBe(true);
    expect(reentrantOutcomes).toEqual([false]);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
  });
});
