import Phaser from 'phaser';
import type { GameContext } from '../engine/context';
import type { System } from '../engine/system';
import { distanceSq } from '../engine/vector';
import { XpDrop } from '../entities/XpDrop';
import type { Player } from '../entities/Player';
import type { RunState } from '../gameplay/runState';
import { applyXp } from '../gameplay/xp';

export class DropSystem implements System {
  private readonly drops: XpDrop[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly runState: RunState,
    private readonly player: Player,
    private readonly dropGroup: Phaser.Physics.Arcade.Group,
    private readonly dropRadius: number,
    private readonly basePickupRadius: number,
  ) {
    this.scene.physics.add.overlap(
      this.player.sprite,
      this.dropGroup,
      this.handlePlayerDropOverlap,
      undefined,
      this,
    );
  }

  createXpDrop(x: number, y: number, amount: number): XpDrop {
    const drop = new XpDrop(this.scene, x, y, amount, this.dropRadius);
    this.drops.push(drop);
    this.dropGroup.add(drop.sprite);
    return drop;
  }

  update(): void {
    if (this.runState.status !== 'active') {
      return;
    }

    const pickupRadius = this.runState.stats.resolve('pickupRadius', this.basePickupRadius);
    const pickupRadiusSq = pickupRadius * pickupRadius;
    for (const drop of this.drops) {
      if (drop.active && distanceSq(this.player, drop) <= pickupRadiusSq) {
        this.collect(drop);
      }
    }
    compactActive(this.drops);
  }

  destroy(): void {
    this.drops.forEach((drop) => {
      drop.destroy();
    });
    this.drops.length = 0;
  }

  private handlePlayerDropOverlap(
    _playerObject: unknown,
    dropObject: unknown,
  ): void {
    const dropGameObject = arcadeGameObject(dropObject);
    const drop = this.drops.find((candidate) => candidate.sprite === dropGameObject);
    if (drop?.active) {
      this.collect(drop);
    }
  }

  private collect(drop: XpDrop): void {
    if (this.runState.status !== 'active' || !drop.active) {
      return;
    }

    applyXp(this.runState, drop.amount, this.ctx.bus);
    this.ctx.bus.emit('drop:collected', {
      kind: 'xp',
      amount: drop.amount,
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
