import Phaser from 'phaser';
import type { GameContext } from '../engine/context';
import type { GameEventListener } from '../engine/eventBus';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import { Drop } from '../entities/Drop';
import type { Player } from '../entities/Player';
import { resolveKillLoot } from '../gameplay/loot';
import type { LootGrant } from '../gameplay/loot';
import type { RunState } from '../gameplay/runState';
import { applyXp } from '../gameplay/xp';
import type { LootTableLookup } from './lootTables';

export interface DropSystemOptions {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  readonly runState: RunState;
  readonly player: Player;
  readonly dropGroup: Phaser.Physics.Arcade.Group;
  readonly lootTables: LootTableLookup;
  readonly rng: Pick<Rng, 'next'>;
  readonly dropRadius: number;
  readonly magnetSpeed: number;
  readonly basePickupRadius: number;
}

export class DropSystem implements System {
  private readonly scene: Phaser.Scene;
  private readonly ctx: GameContext;
  private readonly runState: RunState;
  private readonly player: Player;
  private readonly dropGroup: Phaser.Physics.Arcade.Group;
  private readonly lootTables: LootTableLookup;
  private readonly rng: Pick<Rng, 'next'>;
  private readonly dropRadius: number;
  private readonly magnetSpeed: number;
  private readonly basePickupRadius: number;
  private readonly drops: Drop[] = [];
  private readonly unsubscribeEnemyKilled: () => void;

  constructor(options: DropSystemOptions) {
    this.scene = options.scene;
    this.ctx = options.ctx;
    this.runState = options.runState;
    this.player = options.player;
    this.dropGroup = options.dropGroup;
    this.lootTables = options.lootTables;
    this.rng = options.rng;
    this.dropRadius = options.dropRadius;
    this.magnetSpeed = options.magnetSpeed;
    this.basePickupRadius = options.basePickupRadius;

    this.scene.physics.add.overlap(
      this.player.sprite,
      this.dropGroup,
      this.handlePlayerDropOverlap,
      undefined,
      this,
    );

    this.unsubscribeEnemyKilled = this.ctx.bus.on('enemy:killed', this.handleEnemyKilled);
  }

  /**
   * Spawns a drop at the given position. In production this is called from the
   * `enemy:killed` handler so that loot tables and RNG are respected; tests may
   * call it directly to bypass loot resolution and exercise collection logic.
   */
  spawnDrop(x: number, y: number, grant: LootGrant): Drop {
    const drop = new Drop(this.scene, this.dropRadius);
    this.drops.push(drop);
    // PhysicsGroup.add reapplies body defaults. Insert first so spawn owns the
    // final position, body shape, enablement, and velocity, like Projectile.
    this.dropGroup.add(drop.sprite);
    drop.spawn(x, y, grant.kind, grant.amount, grant.kind === 'chest' ? grant.tableId : undefined);
    return drop;
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      return;
    }

    const pickupRadius = Math.max(0, this.runState.stats.resolve('pickupRadius', this.basePickupRadius));
    const playerPos = { x: this.player.x, y: this.player.y };
    for (const drop of this.drops) {
      drop.update(dtMs, playerPos, pickupRadius, this.magnetSpeed);
    }
    compactActive(this.drops);
  }

  destroy(): void {
    this.unsubscribeEnemyKilled();
    this.drops.forEach((drop) => {
      drop.destroy();
    });
    this.drops.length = 0;
  }

  private readonly handleEnemyKilled: GameEventListener<'enemy:killed'> = (payload) => {
    if (this.runState.status !== 'active') {
      return;
    }

    const grants = resolveKillLoot(payload, this.lootTables, this.rng);
    for (const grant of grants) {
      this.spawnDrop(payload.x, payload.y, grant);
    }
  };

  /**
   * Physics overlap callback. A drop is collected whenever the player's physics
   * body physically intersects it; `pickupRadius` only governs the magnet range
   * that pulls drops toward the player before contact.
   */
  private handlePlayerDropOverlap(
    _playerObject: unknown,
    dropObject: unknown,
  ): void {
    const dropGameObject = arcadeGameObject(dropObject);
    const drop = this.drops.find((candidate) => candidate.sprite === dropGameObject);
    if (!drop?.active) {
      return;
    }

    this.collect(drop);
  }

  private collect(drop: Drop): void {
    if (this.runState.status !== 'active' || !drop.active) {
      return;
    }

    const { kind, amount } = drop;
    switch (kind) {
      case 'xp': {
        applyXp(this.runState, amount, this.ctx.bus);
        break;
      }
      case 'scrap': {
        const gained = amount * this.runState.stats.resolve('currencyGain', 1);
        if (Number.isFinite(gained) && gained > 0) {
          this.runState.currency += gained;
          this.ctx.bus.emit('currency:changed', { runTotal: this.runState.currency });
        }
        break;
      }
      case 'chest': {
        // Chest collection is Slice 5. The chest is destroyed with no grant.
        drop.destroy();
        return;
      }
    }

    this.ctx.bus.emit('drop:collected', {
      kind,
      amount,
      x: drop.x,
      y: drop.y,
    });
    drop.destroy();
  }
}

function arcadeGameObject(value: unknown): Phaser.GameObjects.GameObject | undefined {
  if (value instanceof Phaser.GameObjects.GameObject) {
    return value;
  }

  if (
    value instanceof Phaser.Physics.Arcade.Body ||
    value instanceof Phaser.Physics.Arcade.StaticBody
  ) {
    return value.gameObject;
  }

  return undefined;
}

function compactActive<T extends { active: boolean }>(items: T[]): void {
  let writeIndex = 0;
  for (const item of items) {
    if (item.active) {
      items[writeIndex] = item;
      writeIndex += 1;
    }
  }
  items.length = writeIndex;
}
