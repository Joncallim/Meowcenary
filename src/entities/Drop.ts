import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';
import { distanceSq, towards } from '../engine/vector';
import type { ActorArtBinding } from '../systems/types';
import { createStaticArtSprite } from './actorView';

export type DropKind = 'xp' | 'scrap' | 'chest';

const DROP_COLORS: Record<DropKind, number> = {
  xp: 0x7dd3fc,
  scrap: 0xd1d5db,
  chest: 0xf472b6,
};

const GLINT_OFFSET_X = 3;
const GLINT_OFFSET_Y = 3;
const GLINT_RADIUS = 2.5;
const GLINT_ALPHA = 0.9;

export class Drop {
  readonly sprite: Phaser.GameObjects.Arc;
  active = false;
  kind: DropKind = 'xp';
  amount = 0;
  tableId?: string;
  private readonly glint: Phaser.GameObjects.Arc;
  private readonly artSprite?: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number,
    art?: Readonly<ActorArtBinding>,
  ) {
    this.sprite = scene.add.circle(0, 0, radius, DROP_COLORS.xp).setDepth(2).setActive(false).setVisible(false);
    // Display-only white highlight, constructed once per pooled drop and
    // toggled with the body. No physics body.
    this.glint = scene.add.circle(0, 0, GLINT_RADIUS, 0xffffff)
      .setAlpha(GLINT_ALPHA)
      .setDepth(3)
      .setActive(false)
      .setVisible(false);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);
    this.body.enable = false;
    this.artSprite = createStaticArtSprite(scene, art, 3);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  spawn(x: number, y: number, kind: DropKind, amount: number, tableId?: string): void {
    this.active = true;
    this.kind = kind;
    this.amount = amount;
    this.tableId = kind === 'chest' ? tableId : undefined;

    const useArt = kind === 'xp' && this.artSprite !== undefined;
    this.sprite.setPosition(x, y).setFillStyle(DROP_COLORS[kind]).setActive(true).setVisible(!useArt);
    this.glint.setPosition(x - GLINT_OFFSET_X, y - GLINT_OFFSET_Y).setActive(true).setVisible(!useArt);
    this.artSprite?.setPosition(x, y).setActive(useArt).setVisible(useArt);
    this.body.enable = true;
    this.body.setCircle(this.radius);
    this.body.setVelocity(0, 0);
  }

  update(dtMs: number, playerPos: Vec2, pickupRadius: number, magnetSpeed: number): void {
    if (!this.active || !this.sprite.active) {
      return;
    }

    // Arcade physics integrates before the scene update, so the body position
    // is the rendered frame's position — the glint follows exactly.
    this.glint.setPosition(this.sprite.x - GLINT_OFFSET_X, this.sprite.y - GLINT_OFFSET_Y);
    this.artSprite?.setPosition(this.sprite.x, this.sprite.y);

    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }

    if (
      !Number.isFinite(this.x) ||
      !Number.isFinite(this.y) ||
      !Number.isFinite(playerPos.x) ||
      !Number.isFinite(playerPos.y) ||
      !Number.isFinite(pickupRadius) ||
      !Number.isFinite(magnetSpeed)
    ) {
      this.body.setVelocity(0, 0);
      return;
    }

    if (pickupRadius <= 0 || magnetSpeed <= 0) {
      this.body.setVelocity(0, 0);
      return;
    }

    if (distanceSq(this, playerPos) > pickupRadius * pickupRadius) {
      this.body.setVelocity(0, 0);
      return;
    }

    const direction = towards(this, playerPos);
    this.body.setVelocity(direction.x * magnetSpeed, direction.y * magnetSpeed);
  }

  reset(): void {
    this.active = false;
    this.kind = 'xp';
    this.amount = 0;
    this.tableId = undefined;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }
    this.sprite.setActive(false).setVisible(false);
    this.glint.setActive(false).setVisible(false);
    this.artSprite?.setActive(false).setVisible(false);
  }

  destroy(): void {
    this.active = false;
    this.glint.destroy();
    this.artSprite?.destroy();
    this.sprite.destroy();
  }
}
