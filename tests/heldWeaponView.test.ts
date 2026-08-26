import { describe, expect, it, vi } from 'vitest';
import type { VisualArtBinding } from '../src/systems/types';

vi.mock('phaser', () => ({ default: {} }));

class MockImage {
  active = false;
  visible = false;
  destroyed = false;
  depth = 0;
  rotation = 0;
  flipY = false;
  textureKey = '';
  displayWidth = 0;
  displayHeight = 0;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(depth: number): this { this.depth = depth; return this; }
  setOrigin(): this { return this; }
  setActive(active: boolean): this { this.active = active; return this; }
  setVisible(visible: boolean): this { this.visible = visible; return this; }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setRotation(rotation: number): this { this.rotation = rotation; return this; }
  setFlipY(flipY: boolean): this { this.flipY = flipY; return this; }
  setTexture(textureKey: string): this { this.textureKey = textureKey; return this; }
  setDisplaySize(width: number, height: number): this {
    this.displayWidth = width;
    this.displayHeight = height;
    return this;
  }

  destroy(): void { this.destroyed = true; }
}

const heldBinding = {
  id: 'weapon-held:pistol:t1',
  kind: 'weapon-held',
  textureKey: 'art-weapon-held-pistol-t1',
  url: 'assets/weapons/held/pistol-t1.png',
  required: true,
  sampling: 'nearest',
  load: { type: 'image' },
  display: { width: 28, height: 18 },
} as const satisfies VisualArtBinding;

function createHarness() {
  const image = new MockImage();
  const scene = { add: { image: () => image } };
  return { image, scene };
}

describe('HeldWeaponView', () => {
  it('keeps the raw firing angle and only mirrors the off-hand grip for left-side shots', async () => {
    const { image, scene } = createHarness();
    const { HeldWeaponView } = await import('../src/entities/heldWeaponView');
    const view = new HeldWeaponView(scene as never, 110);

    view.show(heldBinding, 10, 20, 0);
    expect(image.rotation).toBe(0);
    expect(image.flipY).toBe(false);

    // A leftward shot must keep the barrel pointing at the target: the raw
    // angle aims local +X along the firing direction, so no π offset.
    view.show(heldBinding, 10, 20, Math.PI);
    expect(image.rotation).toBe(Math.PI);
    expect(image.flipY).toBe(true);

    view.show(heldBinding, 10, 20, -Math.PI / 2);
    expect(image.rotation).toBe(-Math.PI / 2);
    // Vertical shots sit on the mirror boundary (cos ≈ 0): treated as
    // right-facing, so no off-hand flip applies.
    expect(image.flipY).toBe(false);

    view.show(heldBinding, 10, 20, -Math.PI * 0.75);
    expect(image.rotation).toBe(-Math.PI * 0.75);
    expect(image.flipY).toBe(true);
    view.destroy();
    expect(image.destroyed).toBe(true);
  });

  it('anchors the presentation to the current player position while visible', async () => {
    const { image, scene } = createHarness();
    const { HeldWeaponView } = await import('../src/entities/heldWeaponView');
    const view = new HeldWeaponView(scene as never, 110);

    view.show(heldBinding, 10, 20, 0);
    view.update(50, 24, 32);
    expect([image.x, image.y]).toEqual([24, 32]);
    expect(image.visible).toBe(true);

    view.update(40, 40, 40);
    expect([image.x, image.y]).toEqual([40, 40]);
    expect(image.visible).toBe(true);

    // Crossing the visibility window hides the image at its final position.
    view.update(30, 60, 60);
    expect(image.active).toBe(false);
    expect(image.visible).toBe(false);

    // A hidden presentation ignores further updates.
    view.update(16, 100, 100);
    expect([image.x, image.y]).toEqual([60, 60]);
    view.destroy();
  });

  it('keeps the shot recoil offset while following the moving player', async () => {
    const { image, scene } = createHarness();
    const { HeldWeaponView } = await import('../src/entities/heldWeaponView');
    const view = new HeldWeaponView(scene as never, 110);

    // Firing straight right with 3px recoil pulls the muzzle 3px back.
    view.show(heldBinding, 100, 200, 0, 3);
    expect([image.displayWidth, image.displayHeight]).toEqual([28 * 1.30, 18 * 1.30]);
    expect([image.x, image.y]).toEqual([100 - 3 * 1.30, 200]);

    // The recoil offset stays constant while the player keeps moving.
    view.update(16, 120, 210);
    expect([image.x, image.y]).toEqual([120 - 3 * 1.30, 210]);
    view.destroy();
  });

  it('ignores bindings that are not held weapons', async () => {
    const { image, scene } = createHarness();
    const { HeldWeaponView } = await import('../src/entities/heldWeaponView');
    const view = new HeldWeaponView(scene as never, 110);

    view.show({ ...heldBinding, kind: 'weapon-icon' }, 10, 20, 0);
    expect(image.active).toBe(false);
    expect(image.visible).toBe(false);
    view.destroy();
  });
});
