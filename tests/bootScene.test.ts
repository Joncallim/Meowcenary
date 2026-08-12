import { describe, expect, it, vi } from 'vitest';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../src/engine/context';
import { SceneKey } from '../src/engine/sceneKeys';
import audioAssetsJson from '../src/data/audio-assets.json';
import actorArtJson from '../src/data/actor-art.json';
import { BootScene } from '../src/scenes/BootScene';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../src/systems/audio';

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {
      constructor(public key: string) {}
    },
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
  const loadSpritesheet = vi.fn();
  const start = vi.fn();
  const scene = {
    load: { audio: loadAudio, spritesheet: loadSpritesheet },
    registry: { set: (key: string, value: unknown) => registryValues.set(key, value) },
    scene: { start },
    sound: {
      on: vi.fn(),
      off: vi.fn(),
    },
    textures: { exists: vi.fn(() => false) },
    anims: { exists: vi.fn(() => false), create: vi.fn(), generateFrameNumbers: vi.fn(), remove: vi.fn() },
  };
  return { scene, loadAudio, loadSpritesheet, start, registryValues };
}

function createBoot() {
  const fake = createFakeScene();
  const boot = new BootScene();
  Object.assign(boot, fake.scene);
  return { boot, ...fake };
}

describe('BootScene audio wiring', () => {
  it('preloads every audio catalog row in [...sfx, ...music] order with exact key/url', () => {
    const { boot, loadAudio, loadSpritesheet } = createBoot();

    boot.preload();

    const expected = [...audioAssetsJson.sfx, ...audioAssetsJson.music].map((asset) => [
      asset.key,
      asset.url,
    ]);
    expect(loadAudio).toHaveBeenCalledTimes(expected.length);
    expect(loadAudio.mock.calls).toEqual(expected);
    expect(loadSpritesheet.mock.calls).toEqual(actorArtJson.bindings.map((binding) => [
      binding.textureKey,
      binding.url,
      { frameWidth: binding.frame.width, frameHeight: binding.frame.height },
    ]));
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
