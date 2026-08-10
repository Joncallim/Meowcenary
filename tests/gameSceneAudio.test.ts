import { describe, expect, it, vi } from 'vitest';
import { GAME_CONTEXT_REGISTRY_KEY } from '../src/engine/context';
import { GameScene } from '../src/scenes/GameScene';
import {
  AudioManager,
  AUDIO_MANAGER_REGISTRY_KEY,
} from '../src/systems/audio';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
      },
    },
    Scenes: {
      Events: {
        SHUTDOWN: 'shutdown',
        DESTROY: 'destroy',
      },
    },
    Scene: class Scene {
      constructor(public key: string) {}
    },
  },
}));

// Direct construction of the full GameScene.create composition would be a
// brittle duplicate of the entire game; these tests exercise the audio
// lifecycle seams in isolation through a typed test cast (per
// docs/architecture/epic-10-audio-remainder.md §6.6).
interface AudioSeams {
  audioManager: AudioManager | undefined;
  installAudioUnlockListeners: () => void;
  removeAudioUnlockListeners: () => void;
  getAudioManager: () => AudioManager | undefined;
  handleShutdown: () => void;
}

function createFakeEnvironment(audioFake?: { unlock: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }) {
  const keyboardListeners = new Map<
    string,
    Array<{ handler: () => void; context: unknown; once: boolean }>
  >();
  const keyboard = {
    once(event: string, handler: () => void, context?: unknown): void {
      const list = keyboardListeners.get(event) ?? [];
      list.push({ handler, context, once: true });
      keyboardListeners.set(event, list);
    },
    off(event: string, handler: () => void): void {
      keyboardListeners.set(
        event,
        (keyboardListeners.get(event) ?? []).filter((entry) => entry.handler !== handler),
      );
    },
    listenerCount(event: string): number {
      return keyboardListeners.get(event)?.length ?? 0;
    },
    keydown(): void {
      const list = keyboardListeners.get('keydown') ?? [];
      keyboardListeners.set('keydown', list.filter((entry) => !entry.once));
      [...list].forEach((entry) => entry.handler.call(entry.context));
    },
  };

  const inputListeners = new Map<
    string,
    Array<{ handler: () => void; context: unknown; once: boolean }>
  >();
  const input = {
    once(event: string, handler: () => void, context?: unknown): void {
      const list = inputListeners.get(event) ?? [];
      list.push({ handler, context, once: true });
      inputListeners.set(event, list);
    },
    off(event: string, handler: () => void): void {
      inputListeners.set(
        event,
        (inputListeners.get(event) ?? []).filter((entry) => entry.handler !== handler),
      );
    },
    listenerCount(event: string): number {
      return inputListeners.get(event)?.length ?? 0;
    },
    pointerDown(): void {
      const list = inputListeners.get('pointerdown') ?? [];
      inputListeners.set('pointerdown', list.filter((entry) => !entry.once));
      [...list].forEach((entry) => entry.handler.call(entry.context));
    },
  };

  const lifecycleListeners = new Map<
    string,
    Array<{ handler: () => void; context: unknown; once: boolean }>
  >();
  const lifecycle = {
    once(event: string, handler: () => void, context?: unknown): void {
      const list = lifecycleListeners.get(event) ?? [];
      list.push({ handler, context, once: true });
      lifecycleListeners.set(event, list);
    },
    off(event: string, handler: () => void): void {
      lifecycleListeners.set(
        event,
        (lifecycleListeners.get(event) ?? []).filter((entry) => entry.handler !== handler),
      );
    },
    emit(event: string): void {
      const list = lifecycleListeners.get(event) ?? [];
      lifecycleListeners.set(event, list.filter((entry) => !entry.once));
      [...list].forEach((entry) => entry.handler.call(entry.context));
    },
  };

  const scene = new GameScene();
  Object.assign(scene, {
    registry: {
      get: (key: string) => {
        if (key === GAME_CONTEXT_REGISTRY_KEY) return undefined;
        if (key === AUDIO_MANAGER_REGISTRY_KEY) return audioFake;
        return undefined;
      },
    },
    input: { keyboard, ...input },
    events: lifecycle,
  });

  const seams = scene as unknown as AudioSeams;
  return { scene, seams, input, keyboard, lifecycle };
}

function createAudioFake() {
  return { unlock: vi.fn(), destroy: vi.fn() };
}

describe('GameScene audio lifecycle seams', () => {
  it('fetches the audio manager tolerantly, returning undefined when missing', () => {
    const { seams } = createFakeEnvironment();

    expect(seams.getAudioManager()).toBeUndefined();
  });

  it('returns the registry-published manager when present', () => {
    const audioFake = createAudioFake();
    const { seams } = createFakeEnvironment(audioFake);

    expect(seams.getAudioManager()).toBe(audioFake);
  });

  it('installs one unlock pair; the first pointer gesture unlocks once and cross-removes the keyboard listener', () => {
    const audioFake = createAudioFake();
    const { seams, input, keyboard } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    expect(input.listenerCount('pointerdown')).toBe(1);
    expect(keyboard.listenerCount('keydown')).toBe(1);

    input.pointerDown();

    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(keyboard.listenerCount('keydown')).toBe(0);

    input.pointerDown();
    keyboard.keydown();
    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks once on the first key gesture and cross-removes the pointer listener', () => {
    const audioFake = createAudioFake();
    const { seams, input, keyboard } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    keyboard.keydown();

    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(keyboard.listenerCount('keydown')).toBe(0);
  });

  it('keeps exactly one unlock pair across repeated installs', () => {
    const audioFake = createAudioFake();
    const { seams, input, keyboard } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    seams.installAudioUnlockListeners();

    expect(input.listenerCount('pointerdown')).toBe(1);
    expect(keyboard.listenerCount('keydown')).toBe(1);
  });

  it('shutdown removes the unlock pair and clears the field without destroying the manager', () => {
    const audioFake = createAudioFake();
    const { scene, seams, input, keyboard, lifecycle } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    // Mirror GameScene.create: the shutdown listener is registered once per
    // create visit and fired on scene shutdown.
    lifecycle.once('shutdown', seams.handleShutdown, scene);
    lifecycle.emit('shutdown');

    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(keyboard.listenerCount('keydown')).toBe(0);
    expect(seams.audioManager).toBeUndefined();
    expect(audioFake.destroy).not.toHaveBeenCalled();
    expect((scene as unknown as { audioManager: unknown }).audioManager).toBeUndefined();
  });

  it('removeAudioUnlockListeners alone never unlocks', () => {
    const audioFake = createAudioFake();
    const { seams, input, keyboard } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    seams.removeAudioUnlockListeners();

    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(keyboard.listenerCount('keydown')).toBe(0);
    expect(audioFake.unlock).not.toHaveBeenCalled();
  });
});
