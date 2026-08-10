import { describe, expect, it, vi } from 'vitest';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../src/engine/context';
import { SceneKey } from '../src/engine/sceneKeys';
import audioAssetsJson from '../src/data/audio-assets.json';
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
  const start = vi.fn();
  const scene = {
    load: { audio: loadAudio },
    registry: { set: (key: string, value: unknown) => registryValues.set(key, value) },
    scene: { start },
    sound: {
      on: vi.fn(),
      off: vi.fn(),
    },
  };
  return { scene, loadAudio, start, registryValues };
}

function createBoot() {
  const fake = createFakeScene();
  const boot = new BootScene();
  Object.assign(boot, fake.scene);
  return { boot, ...fake };
}

describe('BootScene audio wiring', () => {
  it('preloads every audio catalog row in [...sfx, ...music] order with exact key/url', () => {
    const { boot, loadAudio } = createBoot();

    boot.preload();

    const expected = [...audioAssetsJson.sfx, ...audioAssetsJson.music].map((asset) => [
      asset.key,
      asset.url,
    ]);
    expect(loadAudio).toHaveBeenCalledTimes(expected.length);
    expect(loadAudio.mock.calls).toEqual(expected);
  });

  it('publishes the context first, then one initialized manager, then starts Menu', () => {
    const { boot, registryValues, start } = createBoot();

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
    expect(bootState.instanceCount).toBe(1);
    expect(bootState.initCalls).toHaveLength(1);
    expect(bootState.initCalls[0]!.instance).toBe(manager);
  });

  it('inits the manager with the exact context bus, settings, and audio data references', () => {
    const { boot, registryValues } = createBoot();

    boot.create();

    const ctx = registryValues.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext;
    // initCalls accumulate across tests in this file, so take the last one —
    // the create() this test just ran.
    const args = bootState.initCalls.at(-1)!.args;
    // "Exact references": identity, not value equality (the bus is a closure
    // object whose functions never compare equal under toEqual).
    expect(args[0]).toBe(ctx.bus);
    expect(args[1]).toBe(ctx.settings);
    expect(args[2]).toBe(ctx.data.audio);
  });
});
