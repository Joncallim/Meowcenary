import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
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
  handlePauseKey: () => void;
  pauseController:
    | {
        snapshot: () => { panel: 'closed' | 'pause' | 'inventory'; inventory: unknown };
        pause: () => boolean;
        resume: () => boolean;
        back: () => boolean;
      }
    | undefined;
  pauseView: { render: (snapshot: unknown) => void } | undefined;
}

function createFakeEnvironment(
  audioFake?: { unlock: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> },
  context?: { bus: ReturnType<typeof createEventBus> },
) {
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
        if (key === GAME_CONTEXT_REGISTRY_KEY) return context;
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

describe('GameScene handlePauseKey command events', () => {
  function createPauseFixture(panel: 'closed' | 'pause' | 'inventory', accepted: boolean) {
    const bus = createEventBus();
    const events: string[] = [];
    bus.on('ui:confirm', () => events.push('ui:confirm'));
    bus.on('ui:back', () => events.push('ui:back'));
    const snapshot = { panel, inventory: {} };
    const controller = {
      snapshot: vi.fn(() => snapshot),
      pause: vi.fn(() => accepted),
      resume: vi.fn(() => accepted),
      back: vi.fn(() => accepted),
    };
    const render = vi.fn();
    const { seams } = createFakeEnvironment(undefined, { bus });
    seams.pauseController = controller;
    seams.pauseView = { render };
    return { seams, controller, render, events };
  }

  it('emits ui:confirm exactly once when a closed panel accepts pause', () => {
    const { seams, controller, render, events } = createPauseFixture('closed', true);

    seams.handlePauseKey();

    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);
    expect(render).toHaveBeenCalledWith(controller.snapshot());
  });

  it('emits ui:back exactly once when the inventory panel accepts back', () => {
    const { seams, controller, events } = createPauseFixture('inventory', true);

    seams.handlePauseKey();

    expect(controller.back).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:back']);
  });

  it('emits ui:back exactly once when the pause panel accepts resume', () => {
    const { seams, controller, events } = createPauseFixture('pause', true);

    seams.handlePauseKey();

    expect(controller.resume).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:back']);
  });

  it('emits nothing when the controller rejects the command', () => {
    const { seams, controller, render, events } = createPauseFixture('closed', false);

    seams.handlePauseKey();

    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(render).toHaveBeenCalledTimes(1); // the panel still re-renders
  });

  it('does nothing without a pause controller', () => {
    const { seams } = createFakeEnvironment();

    expect(() => seams.handlePauseKey()).not.toThrow();
  });
});
