import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockInputPlugin } from './__mocks__/phaser';
import { createEventBus } from '../src/engine/eventBus';
import { GAME_CONTEXT_REGISTRY_KEY, createGameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { GameScene } from '../src/scenes/GameScene';
import { InputController } from '../src/systems/input';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import {
  AudioManager,
  AUDIO_MANAGER_REGISTRY_KEY,
} from '../src/systems/audio';

// Direct construction of the full GameScene.create composition would be a
// brittle duplicate of the entire game; these tests exercise the audio
// lifecycle seams in isolation through a typed test cast (per
// docs/architecture/epic-10-audio-remainder.md §6.6).
interface AudioSeams {
  audioManager: AudioManager | undefined;
  inputController?: InputController;
  installAudioUnlockListeners: () => void;
  removeAudioUnlockListeners: () => void;
  getAudioManager: () => AudioManager | undefined;
  handleShutdown: () => void;
  routeAction: (action: 'pause' | 'back' | 'inventory') => void;
  pauseController:
    | {
        snapshot: () => { panel: 'closed' | 'pause' | 'inventory'; inventory: unknown };
        pause: () => boolean;
        resume: () => boolean;
        back: () => boolean;
        openInventory: () => boolean;
        openInventoryFromRun: () => boolean;
      }
    | undefined;
  pauseView: { render: (snapshot: unknown) => void } | undefined;
}

/** A real factory-created context — the only kind the brand accepts (same
 *  construction pattern as tests/menuScene.test.ts). The published bus is
 *  the caller's bus, preserving listener identity for event assertions. */
function createBrandedContext(bus: ReturnType<typeof createEventBus>) {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  return createGameContext({
    bus,
    menuRng: createRng(1),
    data,
    metaUpgrades,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'game-scene-audio-test', metaUpgrades.maxLevels()),
  });
}

function createFakeEnvironment(
  audioFake?: {
    unlock: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  },
  context?: { bus: ReturnType<typeof createEventBus> },
) {
  const input = new MockInputPlugin({ keyboard: true });

  // The registry accessor is branded: only factory-created contexts pass
  // isGameContext (Epic 19 round-1 adversarial fix). routeAction fetches
  // the context through getGameContext, so the fixture must publish a real
  // one — built around the same bus the test listens on, so bus identity
  // and event assertions are unchanged.
  const brandedContext = context ? createBrandedContext(context.bus) : undefined;

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
      [...list].forEach((entry) => {
        entry.handler.call(entry.context);
      });
    },
  };

  const scene = new GameScene();
  Object.assign(scene, {
    registry: {
      get: (key: string) => {
        if (key === GAME_CONTEXT_REGISTRY_KEY) return brandedContext;
        if (key === AUDIO_MANAGER_REGISTRY_KEY) return audioFake;
        return undefined;
      },
    },
    input,
    events: lifecycle,
  });

  const inputController = new InputController(scene as never);
  const seams = scene as unknown as AudioSeams;
  seams.inputController = inputController;

  return { scene, seams, input, keyboard: input.keyboard!, lifecycle, inputController };
}

function createAudioFake() {
  // playMusic is part of the branded surface (scenes call it on create).
  return { playMusic: vi.fn(), unlock: vi.fn(), destroy: vi.fn(), update: vi.fn() };
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

  it('installs one unlock pair; the first pointer gesture unlocks once and cross-removes the action subscription', () => {
    const audioFake = createAudioFake();
    const { seams, input } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    // PointerAdapter registers a persistent pointerdown listener plus the
    // one-off unlock listener.
    expect(input.listenerCount('pointerdown')).toBe(2);

    input.pointerDown(10, 10);

    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(1);

    // Subsequent logical or pointer actions must never unlock again.
    input.keyboard!.keydown('i');
    seams.inputController!.update(16);
    input.pointerDown(20, 20);
    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks once on the first logical action and cross-removes the pointer listener', () => {
    const audioFake = createAudioFake();
    const { seams, input, keyboard } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    expect(input.listenerCount('pointerdown')).toBe(2);

    keyboard.keydown('i');
    seams.inputController!.update(16);

    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(1);

    keyboard.keydown('i');
    seams.inputController!.update(16);
    input.pointerDown(10, 10);
    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
  });

  it('keeps exactly one unlock pair across repeated installs', () => {
    const audioFake = createAudioFake();
    const { seams, input } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    seams.installAudioUnlockListeners();

    expect(input.listenerCount('pointerdown')).toBe(2);

    input.pointerDown(10, 10);
    expect(audioFake.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(1);
  });

  it('shutdown removes the unlock pair and clears the field without destroying the manager', () => {
    const audioFake = createAudioFake();
    const { scene, seams, input, lifecycle } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    // Mirror GameScene.create: the shutdown listener is registered once per
    // create visit and fired on scene shutdown.
    lifecycle.once('shutdown', seams.handleShutdown, scene);
    lifecycle.emit('shutdown');

    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(seams.audioManager).toBeUndefined();
    expect(audioFake.destroy).not.toHaveBeenCalled();
    expect((scene as unknown as { audioManager: unknown }).audioManager).toBeUndefined();
  });

  it('removeAudioUnlockListeners alone never unlocks', () => {
    const audioFake = createAudioFake();
    const { seams, input } = createFakeEnvironment(audioFake);

    seams.audioManager = audioFake as unknown as AudioManager;
    seams.installAudioUnlockListeners();
    seams.removeAudioUnlockListeners();

    expect(input.listenerCount('pointerdown')).toBe(1);
    expect(audioFake.unlock).not.toHaveBeenCalled();
  });
});

describe('GameScene routeAction (§5 routing matrix)', () => {
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
      openInventory: vi.fn(() => accepted),
      openInventoryFromRun: vi.fn(() => accepted),
    };
    const render = vi.fn();
    const { seams } = createFakeEnvironment(undefined, { bus });
    seams.pauseController = controller;
    seams.pauseView = { render };
    return { seams, controller, render, events };
  }

  it('closed panel: back and pause both pause; inventory opens the rack from the run', () => {
    const { seams, controller, events } = createPauseFixture('closed', true);

    seams.routeAction('back');
    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);
    events.length = 0;

    seams.routeAction('pause');
    expect(controller.pause).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['ui:confirm']);
    events.length = 0;

    seams.routeAction('inventory');
    expect(controller.openInventoryFromRun).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);
  });

  it('pause panel: back and pause resume; inventory opens the rack', () => {
    const { seams, controller, events } = createPauseFixture('pause', true);

    seams.routeAction('back');
    seams.routeAction('pause');
    expect(controller.resume).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['ui:back', 'ui:back']);
    events.length = 0;

    seams.routeAction('inventory');
    expect(controller.openInventory).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);
  });

  it('inventory panel: only back walks back; pause and inventory edges are discarded (§5)', () => {
    const { seams, controller, events } = createPauseFixture('inventory', true);

    seams.routeAction('pause');
    seams.routeAction('inventory');
    expect(controller.back).not.toHaveBeenCalled();
    expect(controller.pause).not.toHaveBeenCalled();
    expect(controller.openInventory).not.toHaveBeenCalled();
    expect(events).toEqual([]);

    seams.routeAction('back');
    expect(controller.back).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:back']);
  });

  it('emits nothing when the controller rejects the command, but still re-renders', () => {
    const { seams, controller, render, events } = createPauseFixture('closed', false);

    seams.routeAction('pause');

    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(render).toHaveBeenCalledTimes(1); // the panel still re-renders
  });

  it('does nothing without a pause controller', () => {
    const { seams } = createFakeEnvironment();

    expect(() => seams.routeAction('pause')).not.toThrow();
  });

  it('routes the real I-key logical action edge through the matrix', () => {
    const bus = createEventBus();
    const events: string[] = [];
    bus.on('ui:confirm', () => events.push('ui:confirm'));
    bus.on('ui:back', () => events.push('ui:back'));
    const controller = {
      snapshot: vi.fn(() => ({ panel: 'closed' as const, inventory: {} })),
      pause: vi.fn(() => true),
      resume: vi.fn(() => true),
      back: vi.fn(() => true),
      openInventory: vi.fn(() => true),
      openInventoryFromRun: vi.fn(() => true),
    };
    const render = vi.fn();
    const { seams, input } = createFakeEnvironment(undefined, { bus });
    seams.pauseController = controller;
    seams.pauseView = { render };
    // Mirrors the real wiring in GameScene.create().
    seams.inputController!.onAction('inventory', () => seams.routeAction('inventory'));

    input.keyboard!.keydown('i');
    seams.inputController!.update(16);

    expect(controller.openInventoryFromRun).toHaveBeenCalledTimes(1);
    expect(controller.openInventory).not.toHaveBeenCalled();
    expect(controller.back).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);

    // A repeat event must not re-trigger the handler.
    input.keyboard!.keydown('i', true);
    seams.inputController!.update(16);

    expect(controller.openInventoryFromRun).toHaveBeenCalledTimes(1);
    expect(controller.openInventory).not.toHaveBeenCalled();
    expect(controller.back).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['ui:confirm']);
  });
});
