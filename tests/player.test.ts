import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import type { VisualArtBinding } from '../src/systems/types';

class MockBody {
  velocity = { x: 0, y: 0 };
  setCircle = vi.fn();
  setCollideWorldBounds = vi.fn();
  setPosition = vi.fn();
  setSize = vi.fn();

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

class MockArc {
  active = true;
  alpha = 1;
  body = new MockBody();
  destroyCount = 0;
  flipX = false;
  visible = true;
  scale = [1, 1] as [number, number];
  plays: string[] = [];
  tint: number | undefined;
  listeners = new Map<string, (...args: any[]) => void>();

  constructor(
    public x: number,
    public y: number,
    public readonly radius = 0,
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

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setOrigin(): this {
    return this;
  }

  setScale(x: number, y = x): this {
    this.scale = [x, y];
    return this;
  }

  setFlipX(flipX: boolean): this {
    this.flipX = flipX;
    return this;
  }

  setTint(color: number): this {
    this.tint = color;
    return this;
  }

  clearTint(): this {
    this.tint = undefined;
    return this;
  }

  setActive(): this {
    return this;
  }

  setFillStyle(): this {
    return this;
  }

  play(key: string): this {
    this.plays.push(key);
    return this;
  }

  on(event: string, listener: (...args: any[]) => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
    return this;
  }

  destroy(): void {
    this.active = false;
    this.destroyCount += 1;
  }
}

vi.mock('phaser', () => ({ default: {} }));

async function createHarness(
  invulnerabilityMs = 650,
  moveVector: { x: number; y: number } = { x: 0, y: 0 },
  art?: Readonly<VisualArtBinding>,
  minPlayableY?: number,
) {
  const { Player } = await import('../src/entities/Player');
  const circles: MockArc[] = [];
  const artSprites: MockArc[] = [];
  const scene = {
    scale: { width: 200, height: 200 },
    add: {
      circle: (x: number, y: number, radius: number) => {
        const arc = new MockArc(x, y, radius);
        circles.push(arc);
        return arc;
      },
      sprite: (x: number, y: number) => {
        const sprite = new MockArc(x, y);
        artSprites.push(sprite);
        return sprite;
      },
    },
    anims: { exists: () => true },
    textures: { exists: () => true },
    physics: { add: { existing: () => undefined } },
  };
  const input = { getMoveVector: () => ({ ...moveVector }) };
  const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  runState.status = 'active';
  const bus = createEventBus();
  const player = new Player(scene as never, input as never, runState, bus, {
    baseMaxHealth: 100,
    baseMoveSpeed: 200,
    invulnerabilityMs,
    spawnX: 400,
    spawnY: 300,
    minPlayableY,
  }, art);

  return { player, runState, sprite: circles[0], circles, artSprites, bus };
}

const playerArt = {
  id: 'character:scrap-tabby', kind: 'character', textureKey: 'tabby',
  url: 'assets/characters/scrap-tabby/scrap-tabby.png', required: true,
  sampling: 'nearest',
  load: { type: 'spritesheet', frame: { width: 48, height: 48 } },
  display: { width: 28, height: 28 },
  clips: {
    idle: { start: 0, end: 3, frameRate: 6, repeat: -1 },
    run: { start: 4, end: 9, frameRate: 10, repeat: -1 },
    hurt: { start: 10, end: 11, frameRate: 12, repeat: 0 },
    defeat: { start: 12, end: 15, frameRate: 8, repeat: 0 },
  },
} as const satisfies VisualArtBinding;

describe('Player', () => {
  it('keeps upward movement out of the persistent HUD exclusion', async () => {
    const { player, sprite } = await createHarness(650, { x: 0, y: -1 }, undefined, 180);
    sprite.y = 180;

    player.update(16);

    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('keeps the damage indicator and invulnerability countdown paused with the run', async () => {
    const { player, runState, sprite } = await createHarness();

    player.takeDamage(10);
    expect(sprite.alpha).toBe(0.45);

    runState.status = 'paused';
    player.update(1_000);
    expect(sprite.alpha).toBe(0.45);

    runState.status = 'active';
    player.update(649);
    expect(sprite.alpha).toBe(0.45);
    player.update(1);
    expect(sprite.alpha).toBe(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not leave the damage tint stuck for invalid or disabled invulnerability %s',
    async (invulnerabilityMs) => {
      const { player, sprite } = await createHarness(invulnerabilityMs);

      // With no usable i-frame window, update() never runs the tint-restore branch,
      // so takeDamage() must not leave the sprite dimmed.
      player.takeDamage(10);
      player.update(16);
      expect(sprite.alpha).toBe(1);
    },
  );

  it('ignores non-finite damage without corrupting health or feedback', async () => {
    const { player, sprite } = await createHarness();

    player.takeDamage(Number.NaN);
    player.takeDamage(Number.POSITIVE_INFINITY);

    expect(player.health).toBe(100);
    expect(sprite.alpha).toBe(1);
  });

  it('clamps invalid resolved movement and max-health domains', async () => {
    const { player, runState, sprite } = await createHarness(650, { x: 1, y: 0 });
    runState.stats.add({ stat: 'moveSpeed', op: 'add', value: -500, sourceId: 'slow' });
    runState.stats.add({ stat: 'maxHealth', op: 'add', value: -500, sourceId: 'frail' });

    player.update(16);

    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
    expect(player.maxHealth).toBe(1);
    expect(player.health).toBe(1);
  });

  it('takeEnvironmentalDamage applies continuous damage without i-frames', async () => {
    const { player, sprite, bus } = await createHarness();
    const damaged = vi.fn();
    bus.on('player:damaged', damaged);

    player.takeEnvironmentalDamage(15);
    expect(player.health).toBe(85);
    expect(damaged).toHaveBeenCalledWith({ amount: 15, healthRemaining: 85 });

    // No invulnerability window — second hit lands immediately
    player.takeEnvironmentalDamage(10);
    expect(player.health).toBe(75);
    expect(damaged).toHaveBeenCalledTimes(2);

    // No tint change (alpha stays at 1)
    expect(sprite.alpha).toBe(1);
  });

  it('takeEnvironmentalDamage lethal hit emits player:died and ends the run', async () => {
    const { player, runState, sprite, bus } = await createHarness();
    const died = vi.fn();
    const lost = vi.fn();
    bus.on('player:died', died);
    bus.on('run:lost', lost);

    player.takeEnvironmentalDamage(200);
    expect(player.health).toBe(0);
    expect(died).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(runState.status).toBe('lost');

    // Body velocity zeroed
    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('plays hurt before damage emission and makes lethal defeat fully visible', async () => {
    const hurtHarness = await createHarness(650, { x: 0, y: 0 }, playerArt);
    const playedAtDamage: string[] = [];
    hurtHarness.bus.on('player:damaged', () => {
      playedAtDamage.push(hurtHarness.artSprites[0]?.plays.at(-1) ?? 'none');
    });
    hurtHarness.player.takeDamage(10);
    expect(playedAtDamage).toEqual(['art:character:scrap-tabby:hurt']);

    const defeatHarness = await createHarness(650, { x: 0, y: 0 }, playerArt);
    defeatHarness.player.takeDamage(200);
    expect(defeatHarness.artSprites[0]?.plays.at(-1)).toBe('art:character:scrap-tabby:defeat');
    expect(defeatHarness.artSprites[0]?.alpha).toBe(1);

    const environmentalHarness = await createHarness(650, { x: 0, y: 0 }, playerArt);
    environmentalHarness.player.takeEnvironmentalDamage(10);
    expect(environmentalHarness.artSprites[0]?.plays.at(-1))
      .toBe('art:character:scrap-tabby:hurt');
    environmentalHarness.player.takeEnvironmentalDamage(100);
    expect(environmentalHarness.artSprites[0]?.plays.at(-1))
      .toBe('art:character:scrap-tabby:defeat');
    expect(environmentalHarness.artSprites[0]?.alpha).toBe(1);
  });

  it('does not restart an in-progress hurt clip on continuous environmental damage', async () => {
    // Regression: hazard damage applies every frame with no throttle, and
    // Phaser's sprite.play() restarts an already-playing animation by
    // default, so re-triggering 'hurt' every frame would loop it at frame 0
    // forever and permanently block movement animation from resuming.
    const { player, artSprites } = await createHarness(650, { x: 0, y: 0 }, playerArt);

    player.takeEnvironmentalDamage(1);
    player.takeEnvironmentalDamage(1);
    player.takeEnvironmentalDamage(1);

    expect(artSprites[0]?.plays.filter((key) => key === 'art:character:scrap-tabby:hurt'))
      .toHaveLength(1);
  });

  it('takeEnvironmentalDamage is no-op when run is not active', async () => {
    const { player, runState } = await createHarness();
    runState.status = 'won';
    player.takeEnvironmentalDamage(50);
    expect(player.health).toBe(100);
  });

  it('pins the exported body radius with exactly one construction-time setCircle', async () => {
    const { PLAYER_BODY_RADIUS } = await import('../src/entities/Player');
    expect(PLAYER_BODY_RADIUS).toBe(14);
    const { sprite } = await createHarness();
    expect(sprite.body.setCircle).toHaveBeenCalledTimes(1);
    expect(sprite.body.setCircle).toHaveBeenCalledWith(PLAYER_BODY_RADIUS);
    expect(sprite.body.setCollideWorldBounds).toHaveBeenCalledTimes(1);
  });

  it('enlarges only fallback presentation layers while leaving the player physics body exact', async () => {
    const { player, sprite, circles } = await createHarness();
    player.update(16);

    expect(sprite.body.setCircle).toHaveBeenCalledWith(14);
    expect(sprite.visible).toBe(false);
    expect(circles.map((circle) => circle.radius)).toEqual([14, 13 * 1.30, 14 * 1.30, 4.5 * 1.30, 4.5 * 1.30]);
    const fallbackBody = circles.find((circle) => circle.radius === 14 * 1.30);
    expect([fallbackBody?.x, fallbackBody?.y]).toEqual([400, 300]);
  });

  it('constructs fallback body/ears only when animated art is unavailable', async () => {
    const fallback = await createHarness();
    const loaded = await createHarness(650, { x: 0, y: 0 }, playerArt);

    // Fallback: physics proxy, display body, two ears, and display shadow.
    expect(fallback.circles).toHaveLength(5);
    // Loaded art: only the physics proxy and its shared display shadow; no
    // construct-then-destroy fallback circles may be allocated.
    expect(loaded.circles.map((circle) => circle.radius)).toEqual([14, 13 * 1.30]);
    expect(loaded.artSprites).toHaveLength(1);
  });

  it('keeps the loaded actor art and its shadow at the same 1.30 presentation factor', async () => {
    const { player, artSprites, circles } = await createHarness(650, { x: 0, y: 0 }, playerArt);
    const shadow = circles.find((circle) => circle.radius === 13 * 1.30);

    expect(artSprites[0]?.scale).toEqual([28 / 48 * 1.30, 28 / 48 * 1.30]);
    player.update(16);
    // Sabotage: passing the unscaled 15px offset to SpriteView makes this 315,
    // leaving real art and fallback shadows visually out of parity.
    expect([shadow?.x, shadow?.y]).toEqual([400, 300 + 15 * 1.30]);
  });

  it('never lets presentation poses touch the body size or position APIs', async () => {
    const { player, sprite } = await createHarness(650, { x: 1, y: 0 });

    // Flips, movement toggles, and hurt-flash alpha changes across updates.
    player.takeDamage(10);
    player.update(16);
    player.update(16);
    player.takeDamage(10);
    player.update(700);
    player.update(16);

    expect(sprite.body.setCircle).toHaveBeenCalledTimes(1);
    expect(sprite.body.setPosition).not.toHaveBeenCalled();
    expect(sprite.body.setSize).not.toHaveBeenCalled();
    expect(sprite.alpha).toBe(1);
  });

  it('destroys view-owned layers and the body proxy exactly once', async () => {
    const { player, circles } = await createHarness();
    player.update(16);
    player.takeDamage(10);

    player.destroy();

    // circles order: physics body, fallback body, left ear, right ear, shadow.
    expect(circles).toHaveLength(5);
    for (const circle of circles) {
      expect(circle.destroyCount).toBe(1);
    }
    expect(circles[0].active).toBe(false);
  });
});
