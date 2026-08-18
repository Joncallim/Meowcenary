import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { visualAnimationKey, DataVisualArtRegistry, ensureVisualAnimations } from '../src/systems/visualArt';
import {
  assertActorAndDropArtReferences,
  assertWeaponArtReferences,
  loadGameData,
  validateGameData,
  validateVisualArtCatalog,
} from '../src/systems/validation';

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

  it('requires complete four-state art for every actor and all runtime pickup kinds', () => {
    const data = loadGameData();
    const withoutActor = structuredClone(data.visualArt) as any;
    withoutActor.bindings = withoutActor.bindings
      .filter((binding: { id: string }) => binding.id !== 'enemy:dust-mite');
    expect(() => validateGameData({ ...data, visualArt: withoutActor }))
      .toThrow(/missing required visual-art id "enemy:dust-mite"/);

    const withoutPickup = structuredClone(data.visualArt) as any;
    withoutPickup.bindings = withoutPickup.bindings
      .filter((binding: { id: string }) => binding.id !== 'drop:weapon');
    expect(() => assertActorAndDropArtReferences(data.characters, data.enemies, withoutPickup))
      .toThrow(/drop:weapon: missing required pickup binding/);

    const loopingDefeat = structuredClone(data.visualArt) as any;
    loopingDefeat.bindings.find((binding: { id: string }) =>
      binding.id === 'character:scrap-tabby').clips.defeat.repeat = -1;
    expect(() => assertActorAndDropArtReferences(data.characters, data.enemies, loopingDefeat))
      .toThrow(/defeat must use frames 12-15 with repeat 0/);

    const futureCharacters = [...data.characters, { ...data.characters[0], id: 'future-cat' }];
    expect(() => assertActorAndDropArtReferences(futureCharacters, data.enemies, data.visualArt))
      .toThrow(/missing required visual-art id "character:future-cat"/);
  });

  it('ships a visually distinct placeholder icon for every upgrade card (Epic 18 D8/§10)', () => {
    // validate-visual-art.mjs only checks dimensions and metadata, never pixel
    // content, so two cards silently rendering the same image passes every
    // other gate. The accent palette must stay at least as large as the
    // biggest category or variants wrap and collide.
    const data = loadGameData();
    const icons = data.visualArt.bindings.filter((binding) => binding.kind === 'upgrade-icon');
    expect(icons).toHaveLength(data.upgrades.length);

    const byHash = new Map<string, string[]>();
    for (const binding of icons) {
      const bytes = readFileSync(resolve('public', binding.url));
      const hash = createHash('sha256').update(bytes).digest('hex');
      byHash.set(hash, [...(byHash.get(hash) ?? []), binding.id]);
    }

    const collisions = [...byHash.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]);
    expect(byHash.size).toBe(icons.length);
  });
});
