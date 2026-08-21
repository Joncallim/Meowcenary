import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, getGameContext, type GameContext } from '../src/engine/context';
import { AUDIO_MANAGER_REGISTRY_KEY, getAudioManager } from '../src/systems/audio';
import type { AudioManager } from '../src/systems/audio';

function createScene(entries: Record<string, unknown>): Phaser.Scene {
  return {
    registry: {
      get: (key: string) => entries[key],
    },
  } as unknown as Phaser.Scene;
}

describe('getGameContext (Epic 19 P2-5)', () => {
  it('returns the registry-published context when present', () => {
    const ctx = { bus: { on: vi.fn() } } as unknown as GameContext;
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
});

describe('getAudioManager (Epic 19 P2-5)', () => {
  it('returns the registry-published manager when present', () => {
    const manager = {
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
});
