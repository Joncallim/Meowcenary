import { describe, expect, it, vi } from 'vitest';
import { actorAnimationKey, DataActorArtRegistry, ensureActorAnimations } from '../src/systems/actorArt';
import { loadGameData, validateActorArtCatalog } from '../src/systems/validation';

describe('actor art', () => {
  it('loads seven immutable convention-keyed bindings', () => {
    const registry = new DataActorArtRegistry(loadGameData());
    expect(registry.all()).toHaveLength(7);
    const tabby = registry.bindingById('character:scrap-tabby');
    expect(tabby?.displayDiameter).toBe(28);
    expect(Object.isFrozen(tabby)).toBe(true);
    expect(Object.isFrozen(tabby?.clips)).toBe(true);
  });

  it('rejects invalid ids, kind drift, duplicate textures, and broken clips', () => {
    const valid = structuredClone(loadGameData().actorArt) as any;
    valid.bindings[0].id = 'bad id';
    valid.bindings[1].textureKey = valid.bindings[0].textureKey;
    valid.bindings[2].kind = 'character';
    valid.bindings[3].clips.run.end = -1;
    expect(() => validateActorArtCatalog(valid)).toThrow(/invalid actor-art id/);
    expect(() => validateActorArtCatalog(valid)).toThrow(/duplicate first seen/);
    expect(() => validateActorArtCatalog(valid)).toThrow(/must match id prefix/);
    expect(() => validateActorArtCatalog(valid)).toThrow(/required non-negative integer/);
  });

  it('registers animations once and skips missing textures', () => {
    const registry = new DataActorArtRegistry(loadGameData());
    const keys = new Set<string>();
    const create = vi.fn((config: any) => {
      keys.add(config.key);
      return { frames: config.frames };
    });
    const scene = {
      textures: { exists: (key: string) => !key.includes('bolt-hound') },
      anims: {
        exists: (key: string) => keys.has(key),
        generateFrameNumbers: (_key: string, range: { start: number; end: number }) =>
          Array.from({ length: range.end - range.start + 1 }, (_, index) => index),
        create,
        remove: vi.fn(),
      },
    };
    ensureActorAnimations(scene as never, registry);
    ensureActorAnimations(scene as never, registry);
    expect(create).toHaveBeenCalledTimes(10);
    expect(keys.has(actorAnimationKey('character:scrap-tabby', 'run'))).toBe(true);
    expect([...keys].some((key) => key.includes('bolt-hound'))).toBe(false);
  });
});
