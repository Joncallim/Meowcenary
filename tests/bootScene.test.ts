import { describe, expect, it, vi } from 'vitest';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../src/engine/context';
import { SceneKey } from '../src/engine/sceneKeys';
import audioAssetsJson from '../src/data/audio-assets.json';
import visualArtJson from '../src/data/visual-art.json';
import { BootScene, applyNearestTextureSampling } from '../src/scenes/BootScene';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../src/systems/audio';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {
      constructor(public key: string) {}
    },
    Textures: { FilterMode: { NEAREST: 1 } },
  },
}));

// The mocked AudioManager subclass counts constructions and records every
// init call (instance + exact arguments) so the test can assert Boot owns
// exactly one initialized manager without weakening AudioManager's own tests.
const bootState = vi.hoisted(() => {
  let instances = 0;
  const initCalls: Array<{ instance: AudioManager; args: unknown[] }> = [];
  return {
    countInstance(): void {
      instances += 1;
    },
    get instanceCount(): number {
      return instances;
    },
    recordInit(instance: AudioManager, args: unknown[]): void {
      initCalls.push({ instance, args });
    },
    get initCalls() {
      return initCalls;
    },
  };
});

vi.mock('../src/systems/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/systems/audio')>();
  type AudioScene = ConstructorParameters<typeof actual.AudioManager>[0];
  return {
    ...actual,
    AudioManager: class extends actual.AudioManager {
      constructor(scene: AudioScene) {
        super(scene);
        bootState.countInstance();
      }

      init(...args: Parameters<typeof actual.AudioManager.prototype.init>): void {
        bootState.recordInit(this, args);
        super.init(...args);
      }
    },
  };
});

function createFakeScene() {
  const registryValues = new Map<string, unknown>();
  const loadAudio = vi.fn();
  const loadImage = vi.fn();
  const loadSpritesheet = vi.fn();
  const start = vi.fn();
  const textureGet = vi.fn((_key: string) => ({ setFilter: vi.fn() }));
  const createEmitter = () => {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const onceHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
    });
    const once = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const listeners = onceHandlers.get(event) ?? new Set();
      listeners.add(handler);
      onceHandlers.set(event, listeners);
    });
    const off = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler);
      onceHandlers.get(event)?.delete(handler);
    });
    const emit = (event: string, ...args: unknown[]) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
      const once = [...(onceHandlers.get(event) ?? [])];
      onceHandlers.delete(event);
      for (const handler of once) handler(...args);
    };
    return { on, once, off, emit };
  };
  const loadEvents = createEmitter();
  const sceneEvents = createEmitter();
  const scene = {
    load: { audio: loadAudio, image: loadImage, spritesheet: loadSpritesheet, ...loadEvents },
    events: sceneEvents,
    registry: { set: (key: string, value: unknown) => registryValues.set(key, value) },
    scene: { start },
    sound: {
      on: vi.fn(),
      off: vi.fn(),
    },
    textures: { exists: vi.fn((_key: string) => true), get: textureGet },
    anims: { exists: vi.fn(() => false), create: vi.fn(), generateFrameNumbers: vi.fn(), remove: vi.fn() },
  };
  return {
    scene, loadAudio, loadImage, loadSpritesheet, loadEvents, sceneEvents, start, registryValues, textureGet,
  };
}

function createBoot() {
  const fake = createFakeScene();
  const boot = new BootScene();
  Object.assign(boot, fake.scene);
  return { boot, ...fake };
}

describe('BootScene loading and startup wiring', () => {
  it('dedupes only catalog-nearest textures for NEAREST filtering and leaves linear/text keys untouched', () => {
    const filters = new Map<string, ReturnType<typeof vi.fn>>();
    const get = vi.fn((key: string) => {
      const setFilter = filters.get(key) ?? vi.fn();
      filters.set(key, setFilter);
      return { setFilter };
    });
    const exists = vi.fn(() => true);
    applyNearestTextureSampling(
      { exists, get } as never,
      { all: () => [
        { textureKey: 'actor', sampling: 'nearest' },
        { textureKey: 'actor', sampling: 'nearest' },
        { textureKey: 'world', sampling: 'linear' },
      ] } as never,
    );

    expect(get.mock.calls).toEqual([['actor']]);
    expect(filters.get('actor')).toHaveBeenCalledTimes(1);
    expect(filters.get('actor')).toHaveBeenCalledWith(1);
    expect(filters.has('world')).toBe(false);
    expect(filters.has('text-canvas')).toBe(false);
  });

  it('filters every real nearest registry texture once and never filters a real linear world texture', () => {
    const filters = new Map<string, ReturnType<typeof vi.fn>>();
    const get = vi.fn((key: string) => {
      const setFilter = filters.get(key) ?? vi.fn();
      filters.set(key, setFilter);
      return { setFilter };
    });
    const registry = new DataVisualArtRegistry(loadGameData());
    const nearest = [...new Set(registry.all()
      .filter((binding) => binding.sampling === 'nearest')
      .map((binding) => binding.textureKey))];
    const linear = registry.all()
      .filter((binding) => binding.sampling === 'linear')
      .map((binding) => binding.textureKey);

    const exists = vi.fn(() => true);
    applyNearestTextureSampling({ exists, get } as never, registry);

    expect(get.mock.calls.map(([key]) => key)).toEqual(nearest);
    nearest.forEach((key) => expect(filters.get(key)).toHaveBeenCalledTimes(1));
    linear.forEach((key) => expect(filters.has(key)).toBe(false));
  });

  it('wires real validated nearest catalog bindings through BootScene.create exactly once', () => {
    const { boot, textureGet } = createBoot();
    const registry = new DataVisualArtRegistry(loadGameData());
    const expected = [...new Set(registry.all()
      .filter((binding) => binding.sampling === 'nearest')
      .map((binding) => binding.textureKey))];

    boot.create();

    expect(textureGet.mock.calls.map(([key]) => key)).toEqual(expected);
  });

  it('skips a missing optional nearest texture instead of filtering the manager fallback texture', () => {
    const binding = {
      id: 'world:test-optional-nearest',
      kind: 'world',
      textureKey: 'art-world-test-optional-nearest',
      url: 'assets/world/test-optional-nearest.png',
      required: false,
      sampling: 'nearest',
      load: { type: 'image' },
      display: { width: 16, height: 16 },
    } as const;
    visualArtJson.bindings.push(binding as unknown as (typeof visualArtJson.bindings)[number]);
    try {
      const { boot, scene, textureGet, start } = createBoot();
      const missingFallbackFilter = vi.fn();
      textureGet.mockImplementation((key: string) => key === binding.textureKey
        ? { setFilter: missingFallbackFilter }
        : { setFilter: vi.fn() });
      scene.textures.exists.mockImplementation((key: string) => key !== binding.textureKey);

      expect(() => boot.create()).not.toThrow();
      expect(textureGet.mock.calls.map(([key]) => key)).not.toContain(binding.textureKey);
      expect(missingFallbackFilter).not.toHaveBeenCalled();
      expect(start).toHaveBeenCalledWith(SceneKey.Menu);
    } finally {
      visualArtJson.bindings.pop();
    }
  });

  it('preloads every audio catalog row in [...sfx, ...music] order with exact key/url', () => {
    const { boot, loadAudio, loadImage, loadSpritesheet, loadEvents } = createBoot();

    boot.preload();

    const expected = [...audioAssetsJson.sfx, ...audioAssetsJson.music].map((asset) => [
      asset.key,
      asset.url,
    ]);
    expect(loadAudio).toHaveBeenCalledTimes(expected.length);
    expect(loadAudio.mock.calls).toEqual(expected);
    expect(loadImage.mock.calls).toEqual(visualArtJson.bindings
      .filter((binding) => binding.load.type === 'image')
      .map((binding) => [binding.textureKey, binding.url]));
    expect(loadSpritesheet.mock.calls).toEqual(visualArtJson.bindings
      .filter((binding) => binding.load.type === 'spritesheet')
      .map((binding) => [
        binding.textureKey,
        binding.url,
        {
          frameWidth: (binding.load as { frame: { width: number; height: number } }).frame.width,
          frameHeight: (binding.load as { frame: { width: number; height: number } }).frame.height,
        },
      ]));
    expect(loadEvents.on).toHaveBeenCalledWith('loaderror', expect.any(Function));
    expect(loadEvents.on.mock.invocationCallOrder[0]).toBeLessThan(loadAudio.mock.invocationCallOrder[0]!);
  });

  it('validates the manifest before registering listeners or enqueueing files', () => {
    const binding = visualArtJson.bindings[0] as unknown as { required: unknown };
    const original = binding.required;
    binding.required = 'yes';
    try {
      const { boot, loadAudio, loadImage, loadSpritesheet, loadEvents } = createBoot();
      expect(() => boot.preload()).toThrow(/visual-art\.json.*required: required boolean/s);
      expect(loadEvents.on).not.toHaveBeenCalled();
      expect(loadAudio).not.toHaveBeenCalled();
      expect(loadImage).not.toHaveBeenCalled();
      expect(loadSpritesheet).not.toHaveBeenCalled();
    } finally {
      binding.required = original;
    }
  });

  it('uses image loading for a validated static binding and removes load listeners on completion', () => {
    const binding = visualArtJson.bindings[6] as unknown as Record<string, unknown>;
    const originalLoad = binding.load;
    const originalClips = binding.clips;
    binding.load = { type: 'image' };
    Reflect.deleteProperty(binding, 'clips');
    try {
      const { boot, loadImage, loadSpritesheet, loadEvents } = createBoot();
      boot.preload();
      expect(loadImage).toHaveBeenCalledWith(binding.textureKey, binding.url);
      expect(loadSpritesheet).toHaveBeenCalledTimes(
        visualArtJson.bindings.filter((row) => row.load.type === 'spritesheet').length,
      );
      loadEvents.emit('complete');
      expect(loadEvents.off).toHaveBeenCalledWith('loaderror', expect.any(Function));
    } finally {
      binding.load = originalLoad;
      binding.clips = originalClips;
    }
  });

  it('stops startup when a required texture is missing and identifies its manifest row', () => {
    const { boot, scene } = createBoot();
    scene.textures.exists.mockImplementation((key: string) => key !== 'art-character-scrap-tabby');

    expect(() => boot.create()).toThrow(
      /id="character:scrap-tabby", textureKey="art-character-scrap-tabby", url="assets\/characters\/scrap-tabby\/scrap-tabby\.png"/,
    );
  });

  it('records a loader file error even if a stale texture with the same key exists', () => {
    const { boot, loadEvents } = createBoot();
    boot.preload();
    loadEvents.emit('loaderror', { key: 'art-character-scrap-tabby' });

    expect(() => boot.create()).toThrow(/Required visual art failed to load.*character:scrap-tabby/);
  });

  it('allows a missing texture only when that manifest row is explicitly optional', () => {
    const binding = {
      id: 'world:test-optional',
      kind: 'world',
      textureKey: 'art-world-test-optional',
      url: 'assets/world/test-optional.png',
      required: false,
      sampling: 'linear',
      load: { type: 'image' },
      display: { width: 16, height: 16 },
    } as const;
    visualArtJson.bindings.push(binding as unknown as (typeof visualArtJson.bindings)[number]);
    try {
      const { boot, scene, start } = createBoot();
      scene.textures.exists.mockImplementation((key: string) => key !== binding.textureKey);
      expect(() => boot.create()).not.toThrow();
      expect(start).toHaveBeenCalledWith(SceneKey.Menu);
    } finally {
      visualArtJson.bindings.pop();
    }
  });

  it('publishes the context first, then one initialized manager, then starts Menu', () => {
    const { boot, registryValues, start } = createBoot();

    // The shared hoisted counters accumulate across tests and repeats, so
    // snapshot them and assert the delta this create() contributes instead
    // of assuming this test runs first.
    const instanceStart = bootState.instanceCount;
    const callsStart = bootState.initCalls.length;

    boot.create();

    const ctx = registryValues.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
    expect(ctx).toBeDefined();
    const manager = registryValues.get(AUDIO_MANAGER_REGISTRY_KEY);
    expect(manager).toBeInstanceOf(AudioManager);
    expect(registryValues.size).toBe(2);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(SceneKey.Menu);

    // Exactly one manager constructed and inited per Boot create, and the
    // inited instance is the published one.
    expect(bootState.instanceCount).toBe(instanceStart + 1);
    expect(bootState.initCalls).toHaveLength(callsStart + 1);
    expect(bootState.initCalls[callsStart]!.instance).toBe(manager);
  });

  it('inits the manager with the exact context bus, settings, and audio data references', () => {
    const { boot, registryValues } = createBoot();

    // initCalls accumulate across tests in this file, so capture the index
    // this create() will write before invoking it instead of assuming the
    // call is the last one.
    const initIndex = bootState.initCalls.length;
    boot.create();

    const ctx = registryValues.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext;
    const args = bootState.initCalls[initIndex]!.args;
    // "Exact references": identity, not value equality (the bus is a closure
    // object whose functions never compare equal under toEqual).
    expect(args[0]).toBe(ctx.bus);
    expect(args[1]).toBe(ctx.settings);
    expect(args[2]).toBe(ctx.data.audio);
  });
});
