import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';
import { distanceSq, towards } from '../engine/vector';
import type { LootGrant } from '../gameplay/loot';
import type { VisualArtBinding } from '../systems/types';
import type { DropPresentation } from '../presentation/dropPresentation';
import { visualAnimationKey } from '../systems/visualArt';
import { VisualDepth } from '../systems/visualDepths';
import { trace } from '../engine/diagnostics';
import { ThemeColor } from '../ui/theme';

export type DropKind = LootGrant['kind'];
export type DropArtBindings = Readonly<Partial<Record<DropKind, Readonly<VisualArtBinding>>>>;

const DROP_COLORS: Record<DropKind, number> = {
  xp: 0x7dd3fc,
  scrap: 0xd1d5db,
  chest: 0xf472b6,
  // Retained as an isolated-test fallback; production boot requires art for
  // every drop kind before gameplay can start.
  weapon: ThemeColor.gold,
};

const GLINT_OFFSET_X = 3;
const GLINT_OFFSET_Y = 3;
const GLINT_RADIUS = 2.5;
const GLINT_ALPHA = 0.9;

export class Drop {
  /** Development-only identity for pool trace correlation (#164). */
  readonly debugId: number;
  private static nextDebugId = 1;
  readonly sprite: Phaser.GameObjects.Arc;
  active = false;
  private grantValue?: LootGrant;
  private blocked = false;
  private readonly glint: Phaser.GameObjects.Arc;
  private artSprite?: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly radius: number,
    private readonly artByKind: DropArtBindings = Object.freeze({}),
    authoredPresentation = false,
  ) {
    this.debugId = Drop.nextDebugId++;
    this.sprite = scene.add.circle(0, 0, radius, DROP_COLORS.xp)
      .setDepth(VisualDepth.dropBody)
      .setActive(false)
      .setVisible(false);
    // Display-only white highlight, constructed once per pooled drop and
    // toggled with the body. No physics body.
    this.glint = scene.add.circle(0, 0, GLINT_RADIUS, 0xffffff)
      .setAlpha(GLINT_ALPHA)
      .setDepth(VisualDepth.pickup)
      .setActive(false)
      .setVisible(false);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);
    this.body.enable = false;
    // Fixed view budget, independent of catalog size. No-art harnesses retain
    // their isolated primitive path; production opts in before pool construction.
    if (authoredPresentation || Object.values(artByKind).some(Boolean)) {
      this.artSprite = scene.add.sprite(0, 0, '__DEFAULT')
        .setDepth(VisualDepth.pickup).setOrigin(0.5).setActive(false).setVisible(false);
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
    this.artSprite?.setAlpha(blocked ? 0.65 : 1);
    if (blocked) this.artSprite?.setTint(0xffa94d);
    else this.artSprite?.clearTint();
    this.glint.setFillStyle(blocked ? 0xffa94d : 0xffffff)
      .setVisible(this.active && (blocked || !this.artSprite?.visible));
  }

  spawn(x: number, y: number, grant: LootGrant, presentation?: Readonly<DropPresentation>): void {
    if (presentation && (presentation.kind !== grant.kind
      || (grant.kind === 'weapon' && presentation.weapon?.definitionId !== grant.definitionId))) {
      throw new Error('Pickup presentation does not match the authoritative grant');
    }
    const legacyBinding = this.artByKind[grant.kind];
    const binding = presentation?.binding ?? (legacyBinding && this.scene.textures.exists(legacyBinding.textureKey) ? legacyBinding : undefined);
    if (presentation && !this.artSprite) throw new Error('Pickup presentation needs a constructor-owned sprite');
    this.active = true;
    this.grantValue = { ...grant };
    this.blocked = false;
    this.clearArt();
    const useArt = binding !== undefined && this.artSprite !== undefined;
    this.sprite.setPosition(x, y).setFillStyle(DROP_COLORS[grant.kind]).setActive(true).setVisible(!useArt);
    this.glint.setPosition(x - GLINT_OFFSET_X, y - GLINT_OFFSET_Y)
      .setFillStyle(0xffffff).setActive(true).setVisible(!useArt);
    if (useArt) {
      const display = presentation?.display ?? binding.display;
      this.artSprite!.setTexture(binding.textureKey, binding.load.type === 'spritesheet' ? 0 : binding.frameKey)
        .setDisplaySize(display.width, display.height).setPosition(x, y).setActive(true).setVisible(true);
      if (binding.clips?.idle) this.artSprite!.play(visualAnimationKey(binding.id, 'idle'));
    }
    this.body.enable = true;
    this.body.setCircle(this.radius);
    this.body.setVelocity(0, 0);
    trace('drop:activated', { debugId: this.debugId, kind: grant.kind, artId: binding?.id, textureKey: binding?.textureKey, x: Math.round(x), y: Math.round(y) });
  }

  update(dtMs: number, playerPos: Vec2, pickupRadius: number, magnetSpeed: number): void {
    if (!this.active || !this.sprite.active) {
      return;
    }

    // Arcade physics integrates before the scene update, so the body position
    // is the rendered frame's position — the glint follows exactly.
    this.glint.setPosition(this.sprite.x - GLINT_OFFSET_X, this.sprite.y - GLINT_OFFSET_Y);
    this.artSprite?.setPosition(this.sprite.x, this.sprite.y);

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
    this.glint.setFillStyle(0xffffff);
    this.clearArt();
    trace('drop:deactivated', { debugId: this.debugId });
  }

  private clearArt(): void {
    this.artSprite?.stop().setTexture('__DEFAULT').setDisplaySize(1, 1)
      .clearTint().setAlpha(1).setFlip(false, false).setRotation(0).setOrigin(0.5)
      .setActive(false).setVisible(false);
  }

  destroy(): void {
    this.active = false;
    this.glint.destroy();
    this.artSprite?.destroy();
    this.artSprite = undefined;
    this.sprite.destroy();
  }
}

/** Production readiness belongs before pool acquisition, not at first play(). */
export function assertDropPresentationReady(scene: Pick<Phaser.Scene, 'textures' | 'anims'>,
  presentation: Readonly<DropPresentation>): void {
  const binding = presentation.binding;
  const fail = (detail: string): never => { throw new Error(`Pickup art "${binding.id}" ${detail}`); };
  if (!scene.textures.exists(binding.textureKey)) fail(`requires loaded texture "${binding.textureKey}"`);
  const texture = scene.textures.get(binding.textureKey);
  const frame = binding.load.type === 'spritesheet' ? 0 : binding.frameKey ?? '__BASE';
  if (!texture.has(String(frame))) fail(`requires loaded frame "${frame}"`);
  const clip = binding.clips?.idle;
  if (!clip) return;
  if (binding.load.type !== 'spritesheet') fail('requires a spritesheet for its idle clip');
  const key = visualAnimationKey(binding.id, 'idle');
  if (!scene.anims.exists(key)) fail(`requires idle animation "${key}"`);
  const animation = scene.anims.get(key);
  if (!animation || animation.frameRate !== clip.frameRate || animation.repeat !== clip.repeat
    || animation.frames.length !== clip.end - clip.start + 1) fail(`requires matching idle clip "${key}"`);
  for (let index = clip.start; index <= clip.end; index += 1) {
    const animationFrame = animation.frames[index - clip.start];
    if (!texture.has(String(index)) || animationFrame.textureKey !== binding.textureKey
      || String(animationFrame.textureFrame) !== String(index)) fail(`requires matching idle frame "${index}"`);
  }
}
