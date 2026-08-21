import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, createGameContext, getGameContext, type GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { AUDIO_MANAGER_REGISTRY_KEY, getAudioManager } from '../src/systems/audio';
import type { AudioManager } from '../src/systems/audio';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

function createScene(entries: Record<string, unknown>): Phaser.Scene {
  return {
    registry: {
      get: (key: string) => entries[key],
    },
  } as unknown as Phaser.Scene;
}

/** A real factory-created context — the only kind the brand accepts (same
 *  construction pattern as tests/menuScene.test.ts). */
function createBrandedContext(): GameContext {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  return createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    metaUpgrades,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'registry-accessors-test', metaUpgrades.maxLevels()),
  });
}

describe('getGameContext (Epic 19 P2-5)', () => {
  it('returns the registry-published context when present', () => {
    const ctx = createBrandedContext();
    const scene = createScene({ [GAME_CONTEXT_REGISTRY_KEY]: ctx });

    expect(getGameContext(scene)).toBe(ctx);
  });

  it('throws a descriptive error when the registry entry is missing', () => {
    const scene = createScene({});

    expect(() => getGameContext(scene)).toThrow(
      /GameContext missing from Phaser registry/,
    );
  });

  it('throws when the stored value is not a GameContext (wrong type)', () => {
    const scene = createScene({ [GAME_CONTEXT_REGISTRY_KEY]: 'not-a-context' });

    expect(() => getGameContext(scene)).toThrow(
      /GameContext missing from Phaser registry/,
    );
  });

  it('throws when the stored value only looks like a context (bus-shaped impostor)', () => {
    // The old structural check accepted any `{ bus: { on() {} } }`; the
    // factory brand must reject it at the accessor instead of crashing
    // later at scene creation when menuRng/arenas/data are touched.
    const scene = createScene({
      [GAME_CONTEXT_REGISTRY_KEY]: { bus: { on() {} } },
    });

    expect(() => getGameContext(scene)).toThrow(
      /GameContext missing from Phaser registry/,
    );
  });
});

describe('getAudioManager (Epic 19 P2-5)', () => {
  it('returns the registry-published manager when present', () => {
    const manager = {
      playMusic: vi.fn(),
      unlock: vi.fn(),
      destroy: vi.fn(),
      update: vi.fn(),
    } as unknown as AudioManager;
    const scene = createScene({ [AUDIO_MANAGER_REGISTRY_KEY]: manager });

    expect(getAudioManager(scene)).toBe(manager);
  });

  it('returns undefined when the registry entry is missing (tolerated)', () => {
    const scene = createScene({});

    expect(getAudioManager(scene)).toBeUndefined();
  });

  it('returns undefined when the stored value is not an AudioManager', () => {
    const scene = createScene({ [AUDIO_MANAGER_REGISTRY_KEY]: 'not-a-manager' });

    expect(getAudioManager(scene)).toBeUndefined();
  });

  it('returns undefined when the stored value lacks the AudioManager surface', () => {
    const scene = createScene({ [AUDIO_MANAGER_REGISTRY_KEY]: { playMusic: () => {} } });

    expect(getAudioManager(scene)).toBeUndefined();
  });

  it('returns undefined when the stored value omits playMusic', () => {
    // Scenes call playMusic immediately on create; an entry shaped like the
    // old test fake would pass the brand then crash with 'playMusic is not
    // a function'. It must degrade to silence (undefined) instead.
    const scene = createScene({
      [AUDIO_MANAGER_REGISTRY_KEY]: { unlock: vi.fn(), destroy: vi.fn(), update: vi.fn() },
    });

    expect(getAudioManager(scene)).toBeUndefined();
  });
});
