import { describe, expect, it, vi } from 'vitest';
import { MountedStaticArt, type StaticArtSlot } from '../src/ui/menuSurfaces/mountedStaticArt';

const slot: StaticArtSlot = { textureKey: 'equipment-atlas', frame: 'recon-helmet', width: 44, height: 38, alpha: 0.35 };
function node() {
  return {
    scene: {} as object | undefined,
    // Position/visibility represent the Scene's current masked scroll state.
    x: 73, y: -21, visible: true, parentContainer: {},
    setTexture: vi.fn(), setDisplaySize: vi.fn(), setAlpha: vi.fn(),
  };
}

describe('mounted static Loadout art', () => {
  it('hydrates only available bindings without taking scroll or visibility ownership', () => {
    const art = new MountedStaticArt();
    const image = node();
    const parent = image.parentContainer;
    art.register(image, slot, false);
    expect(art.hydrate(() => false)).toBe(0);
    expect(image.setTexture).not.toHaveBeenCalled();
    expect(art.hydrate(key => key === slot.textureKey)).toBe(1);
    expect(image.setTexture).toHaveBeenCalledExactlyOnceWith('equipment-atlas', 'recon-helmet');
    expect(image.setDisplaySize).toHaveBeenCalledExactlyOnceWith(44, 38);
    expect(image.setAlpha).toHaveBeenCalledExactlyOnceWith(0.35);
    expect({ x: image.x, y: image.y, visible: image.visible, parent: image.parentContainer })
      .toEqual({ x: 73, y: -21, visible: true, parent });
    expect(art.hydrate(() => true)).toBe(0);
    expect(image.setTexture).toHaveBeenCalledTimes(1);
  });

  it('retains failed bindings while successful weapon layers keep their declared order', () => {
    const art = new MountedStaticArt();
    const base = node(), layer = node(), equipment = node();
    const calls: string[] = [];
    base.setTexture.mockImplementation(() => { calls.push('base'); });
    layer.setTexture.mockImplementation(() => { calls.push('layer'); });
    art.register(base, { ...slot, textureKey: 'weapon-base', frame: 'pistol' }, false);
    art.register(layer, { ...slot, textureKey: 'weapon-layer', frame: 'receiver' }, false);
    art.register(equipment, slot, false);
    expect(art.hydrate(key => key.startsWith('weapon-'))).toBe(2);
    expect(calls).toEqual(['base', 'layer']);
    expect(equipment.setTexture).not.toHaveBeenCalled();
    expect(art.hydrate(() => true)).toBe(1);
    expect(calls).toEqual(['base', 'layer']);
    expect(equipment.setTexture).toHaveBeenCalledTimes(1);
  });

  it('never touches destroyed nodes or slots revoked by unmount/restart', () => {
    const art = new MountedStaticArt();
    const destroyed = node(), live = node();
    art.register(destroyed, slot, false);
    destroyed.scene = undefined;
    expect(art.hydrate(() => true)).toBe(0);
    expect(destroyed.setTexture).not.toHaveBeenCalled();
    art.register(live, slot, false);
    art.clear();
    expect(art.canHydrate).toBe(false);
    expect(art.hydrate(() => true)).toBe(0);
    art.register(live, slot, false);
    expect(art.hydrate(() => true)).toBe(0);
    expect(live.setTexture).not.toHaveBeenCalled();
  });

  it('leaves warm art untouched and rejects displays that cannot rebind textures', () => {
    const art = new MountedStaticArt();
    const warm = node();
    art.register(warm, slot, true);
    expect(art.hydrate(() => true)).toBe(0);
    expect(warm.setAlpha).not.toHaveBeenCalled();
    art.register({ scene: {}, setAlpha: vi.fn(), setDisplaySize: vi.fn() }, slot, false);
    expect(art.canHydrate).toBe(false);
    expect(art.hydrate(() => true)).toBe(0);
  });

  it('propagates a rebinding failure so the Scene can recover without publishing success', () => {
    const art = new MountedStaticArt();
    const broken = node();
    broken.setTexture.mockImplementation(() => { throw new Error('texture failure'); });
    art.register(broken, slot, false);
    expect(() => art.hydrate(() => true)).toThrow('texture failure');
    expect(broken.setAlpha).not.toHaveBeenCalled();
    art.clear();
    expect(art.hydrate(() => true)).toBe(0);
  });
});
