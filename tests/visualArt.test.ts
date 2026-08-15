import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { visualAnimationKey, DataVisualArtRegistry, ensureVisualAnimations } from '../src/systems/visualArt';
import { assertWeaponArtReferences, loadGameData, validateVisualArtCatalog } from '../src/systems/validation';

describe('visual art', () => {
  it('loads immutable required bindings whose shipped PNGs exist', () => {
    const registry = new DataVisualArtRegistry(loadGameData());
    expect(registry.all()).toHaveLength(loadGameData().visualArt.bindings.length);
    const tabby = registry.bindingById('character:scrap-tabby');
    expect(tabby?.display).toEqual({ width: 28, height: 28 });
    expect(tabby?.load).toEqual({
      type: 'spritesheet',
      frame: { width: 48, height: 48 },
    });
    expect(registry.all().every((binding) => binding.required)).toBe(true);
    expect(registry.all().every((binding) => existsSync(resolve('public', binding.url)))).toBe(true);
    expect(Object.isFrozen(tabby)).toBe(true);
    expect(Object.isFrozen(tabby?.load)).toBe(true);
    expect(Object.isFrozen(tabby?.display)).toBe(true);
    expect(Object.isFrozen(tabby?.clips)).toBe(true);
  });

  it('accepts generalized kinds, multi-segment ids, and static images', () => {
    const catalog = {
      bindings: [{
        id: 'world:junkyard-floor:base',
        kind: 'world',
        textureKey: 'art-world-junkyard-floor-base',
        url: 'assets/world/junkyard-floor/base.png',
        required: false,
        load: { type: 'image' },
        display: { width: 512, height: 512 },
      }],
    };

    expect(validateVisualArtCatalog(catalog)).toBe(catalog);
  });

  it('rejects invalid ids, kind drift, duplicate textures, and broken clips', () => {
    const invalid = structuredClone(loadGameData().visualArt) as any;
    invalid.bindings[0].id = 'bad id';
    invalid.bindings[1].textureKey = invalid.bindings[0].textureKey;
    invalid.bindings[2].kind = 'character';
    invalid.bindings[3].clips.run.end = -1;
    expect(() => validateVisualArtCatalog(invalid)).toThrow(/invalid visual-art id/);
    expect(() => validateVisualArtCatalog(invalid)).toThrow(/duplicate first seen/);
    expect(() => validateVisualArtCatalog(invalid)).toThrow(/must match id prefix/);
    expect(() => validateVisualArtCatalog(invalid)).toThrow(/required integer from 0 through 255/);
  });

  it('keeps image and spritesheet shapes mutually exclusive and repeat explicit', () => {
    const imageWithClips = structuredClone(loadGameData().visualArt) as any;
    imageWithClips.bindings[6].load = { type: 'image' };
    expect(() => validateVisualArtCatalog(imageWithClips)).toThrow(/clips: allowed only for spritesheet loads/);

    const missingFrame = structuredClone(loadGameData().visualArt) as any;
    missingFrame.bindings[0].load = { type: 'spritesheet' };
    expect(() => validateVisualArtCatalog(missingFrame)).toThrow(/load\.frame: required object/);

    const missingRequired = structuredClone(loadGameData().visualArt) as any;
    Reflect.deleteProperty(missingRequired.bindings[0], 'required');
    expect(() => validateVisualArtCatalog(missingRequired)).toThrow(/required: required boolean/);

    const missingRepeat = structuredClone(loadGameData().visualArt) as any;
    Reflect.deleteProperty(missingRepeat.bindings[0].clips.idle, 'repeat');
    expect(() => validateVisualArtCatalog(missingRepeat)).toThrow(/repeat: must be -1 or 0/);
  });

  it('registers declared animations once, honors repeat, and skips missing textures', () => {
    const registry = new DataVisualArtRegistry(loadGameData());
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
    ensureVisualAnimations(scene as never, registry);
    ensureVisualAnimations(scene as never, registry);
    const expectedAnimationCount = registry.all()
      .filter((binding) => binding.load.type === 'spritesheet' && !binding.textureKey.includes('bolt-hound'))
      .reduce((count, binding) => count + Object.keys(binding.clips ?? {}).length, 0);
    const expectedRepeats = registry.all()
      .filter((binding) => binding.load.type === 'spritesheet' && !binding.textureKey.includes('bolt-hound'))
      .flatMap((binding) => Object.values(binding.clips ?? {}).map((clip) => clip.repeat))
      .sort((left, right) => left - right);
    expect(create).toHaveBeenCalledTimes(expectedAnimationCount);
    expect(create.mock.calls.map(([config]) => config.repeat).sort((left, right) => left - right))
      .toEqual(expectedRepeats);
    expect(expectedRepeats).toContain(-1);
    expect(expectedRepeats).toContain(0);
    expect(keys.has(visualAnimationKey('character:scrap-tabby', 'run'))).toBe(true);
    expect([...keys].some((key) => key.includes('bolt-hound'))).toBe(false);
  });

  it('rejects missing, wrong-kind, duplicate, and cross-tier weapon art drift', () => {
    const data = loadGameData();
    const weapons = structuredClone(data.weapons) as any[];
    weapons[0].art.iconId = 'missing:icon';
    weapons[1].art.heldId = 'drop:xp';
    weapons[2].art.iconId = weapons[1].art.iconId;
    weapons[4].art.projectileId = 'projectile:pistol';

    expect(() => assertWeaponArtReferences(weapons, data.visualArt)).toThrow(/unknown visual-art id/);
    expect(() => assertWeaponArtReferences(weapons, data.visualArt)).toThrow(/expected weapon-held binding/);
    expect(() => assertWeaponArtReferences(weapons, data.visualArt)).toThrow(/duplicate first seen/);
    expect(() => assertWeaponArtReferences(weapons, data.visualArt)).toThrow(/family "smg" must share/);
  });
});
