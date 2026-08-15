import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';
import { distanceSq, towards } from '../engine/vector';
import type { LootGrant } from '../gameplay/loot';
import type { VisualArtBinding } from '../systems/types';
import { createStaticArtSprite } from './actorView';
import { visualAnimationKey } from '../systems/visualArt';

export type DropKind = LootGrant['kind'];
export type DropArtBindings = Readonly<Partial<Record<DropKind, Readonly<VisualArtBinding>>>>;

const DROP_COLORS: Record<DropKind, number> = {
  xp: 0x7dd3fc,
  scrap: 0xd1d5db,
  chest: 0xf472b6,
  // Epic 14 §D7: distinct placeholder geometric color only — no weapon sprite
  // assets, visual-art rows, or animations (Epic 16 owns final pickup art).
  weapon: 0xfbbf24,
};

const GLINT_OFFSET_X = 3;
const GLINT_OFFSET_Y = 3;
const GLINT_RADIUS = 2.5;
const GLINT_ALPHA = 0.9;

export class Drop {
  readonly sprite: Phaser.GameObjects.Arc;
  active = false;
  private grantValue?: LootGrant;
  private blocked = false;
  private readonly glint: Phaser.GameObjects.Arc;
  private readonly artSprites = new Map<DropKind, Phaser.GameObjects.Sprite>();
  private activeArt?: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number,
    private readonly artByKind: DropArtBindings = Object.freeze({}),
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
    for (const kind of ['xp', 'scrap', 'chest', 'weapon'] as const) {
      const sprite = createStaticArtSprite(scene, artByKind[kind], 3);
      if (sprite) this.artSprites.set(kind, sprite);
    }
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

  /** The authoritative pickup payload (Epic 14 §D7). Undefined while pooled. */
  get grant(): LootGrant | undefined {
    return this.grantValue;
  }

  /** True while the drop is deliberately left in the world (full rack). A
   *  blocked drop must not magnetize or be collected. */
  get pickupBlocked(): boolean {
    return this.blocked;
  }

  /** Blocks/unblocks pickup. Blocking zeroes velocity so the drop stays put. */
  setPickupBlocked(blocked: boolean): void {
    this.blocked = blocked;
    if (blocked) {
      this.body.setVelocity(0, 0);
    }
  }

  spawn(x: number, y: number, grant: LootGrant): void {
    this.active = true;
    this.grantValue = { ...grant };
    this.blocked = false;

    const kind = grant.kind;
    for (const sprite of this.artSprites.values()) {
      sprite.stop().setFrame(0).setActive(false).setVisible(false);
    }
    this.activeArt = this.artSprites.get(kind);
    const useArt = this.activeArt !== undefined;
    this.sprite.setPosition(x, y).setFillStyle(DROP_COLORS[kind]).setActive(true).setVisible(!useArt);
    this.glint.setPosition(x - GLINT_OFFSET_X, y - GLINT_OFFSET_Y).setActive(true).setVisible(!useArt);
    this.activeArt?.setPosition(x, y).setActive(true).setVisible(true);
    const binding = this.artByKind[kind];
    if (this.activeArt && binding?.clips?.idle) {
      this.activeArt.play(visualAnimationKey(binding.id, 'idle'));
    }
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
    this.activeArt?.setPosition(this.sprite.x, this.sprite.y);

    if (this.blocked) {
      this.body.setVelocity(0, 0);
      return;
    }

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
    this.grantValue = undefined;
    this.blocked = false;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }
    this.sprite.setActive(false).setVisible(false);
    this.glint.setActive(false).setVisible(false);
    for (const sprite of this.artSprites.values()) {
      sprite.stop().setFrame(0).setActive(false).setVisible(false);
    }
    this.activeArt = undefined;
  }

  destroy(): void {
    this.active = false;
    this.glint.destroy();
    for (const sprite of this.artSprites.values()) sprite.destroy();
    this.artSprites.clear();
    this.activeArt = undefined;
    this.sprite.destroy();
  }
}
