import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  loadAudioResources,
  queueAudioResources,
  resolveAudioResources,
} from '../src/systems/audioResources';

const menuMusic = { key: 'music-menu', url: 'assets/audio/music-menu.wav', lifecycle: 'menu-common' } as const;
const menuConfirm = { key: 'sfx-ui-confirm', url: 'assets/audio/sfx-ui-confirm.wav', lifecycle: 'menu-common' } as const;
const runMusic = { key: 'music-run', url: 'assets/audio/music-run.wav', lifecycle: 'run-common' } as const;
const runHit = { key: 'sfx-projectile-hit', url: 'assets/audio/sfx-projectile-hit.wav', lifecycle: 'run-common' } as const;

function sceneHarness(start: (load: EventEmitter, cache: Set<string>) => void = () => undefined) {
  const load = new EventEmitter() as EventEmitter & {
    audio: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
  const events = new EventEmitter();
  const cache = new Set<string>();
  load.audio = vi.fn();
  load.start = vi.fn(() => start(load, cache));
  const scene = {
    load,
    events,
    cache: { audio: { exists: (key: string) => cache.has(key) } },
    sys: { settings: { key: 'MenuScene' } },
  };
  return { scene, load, events, cache };
}

describe('audio resource lifecycle', () => {
  it('resolves validated lifecycle rows without duplicating a physical key', () => {
    const catalog = {
      sfx: [menuConfirm, runHit, menuConfirm],
      music: [menuMusic, runMusic],
    } as const;
    const menu = resolveAudioResources(catalog, 'menu-common');
    const run = resolveAudioResources(catalog, 'run-common');
    expect(menu.map((resource) => resource.key)).toEqual(['sfx-ui-confirm', 'music-menu']);
    expect(run.map((resource) => resource.key)).toEqual(['sfx-projectile-hit', 'music-run']);
    expect(Object.isFrozen(menu)).toBe(true);
    expect(catalog.sfx).toHaveLength(3);
  });

  it('queues a deduplicated Boot preload without starting the loader', () => {
    const { scene, load } = sceneHarness();
    queueAudioResources(scene as never, [menuMusic, menuMusic, menuConfirm]);
    expect(load.audio.mock.calls).toEqual([
      ['music-menu', menuMusic.url], ['sfx-ui-confirm', menuConfirm.url],
    ]);
    expect(load.start).not.toHaveBeenCalled();
  });

  it('reports cached and loaded keys once, and waits for loader-wide completion', async () => {
    const { scene, load, cache } = sceneHarness();
    cache.add(menuConfirm.key);
    const progress = vi.fn();
    const operation = loadAudioResources(scene as never, [menuConfirm, menuConfirm, runMusic], progress);
    expect(load.audio.mock.calls).toEqual([['music-run', runMusic.url]]);
    expect(progress.mock.calls).toEqual([[{ completed: 1, total: 2 }]]);
    let resolved = false;
    void operation.then(() => { resolved = true; });
    cache.add(runMusic.key);
    load.emit(`filecomplete-audio-${runMusic.key}`);
    load.emit(`filecomplete-audio-${runMusic.key}`);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(progress.mock.calls).toEqual([[{ completed: 1, total: 2 }], [{ completed: 2, total: 2 }]]);
    load.emit('complete');
    expect(await operation).toEqual({ loaded: [menuConfirm.key, runMusic.key], failed: [], cancelled: false });
    expect(load.listenerCount('loaderror')).toBe(0);
    expect(load.listenerCount('complete')).toBe(0);
    expect(load.listenerCount(`filecomplete-audio-${runMusic.key}`)).toBe(0);
  });

  it('treats a failed key as optional and retries it on the next load', async () => {
    const { scene, load, cache } = sceneHarness();
    const first = loadAudioResources(scene as never, [runMusic, runHit]);
    load.emit('loaderror', { key: 'unrelated-key' });
    load.emit('loaderror', { key: runMusic.key });
    cache.add(runHit.key);
    load.emit(`filecomplete-audio-${runHit.key}`);
    load.emit('complete');
    expect(await first).toEqual({ loaded: [runHit.key], failed: [runMusic.key], cancelled: false });

    const retry = loadAudioResources(scene as never, [runMusic, runHit]);
    expect(load.audio.mock.calls.filter(([key]) => key === runMusic.key)).toHaveLength(2);
    expect(load.audio.mock.calls.filter(([key]) => key === runHit.key)).toHaveLength(1);
    cache.add(runMusic.key);
    load.emit(`filecomplete-audio-${runMusic.key}`);
    load.emit('complete');
    expect(await retry).toEqual({ loaded: [runHit.key, runMusic.key], failed: [], cancelled: false });
  });

  it('settles Phaser no-audio mode when its empty loader completes without keyed events', async () => {
    // Phaser AudioFile skips queueing in noAudio mode; LoaderPlugin.start then
    // emits complete synchronously for an empty queue.
    const { scene, load } = sceneHarness((loader) => { loader.emit('complete'); });
    const result = await Promise.race([
      loadAudioResources(scene as never, [runMusic]),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 30)),
    ]);
    expect(result).toEqual({ loaded: [], failed: [runMusic.key], cancelled: false });
    expect(load.listenerCount('complete')).toBe(0);
  });

  it.each(['shutdown', 'destroy'])('cancels on %s and ignores late loader events', async (terminal) => {
    const { scene, load, events, cache } = sceneHarness();
    const progress = vi.fn();
    const operation = loadAudioResources(scene as never, [runMusic], progress);
    events.emit(terminal);
    expect(await operation).toEqual({ loaded: [], failed: [], cancelled: true });
    expect(load.listenerCount('complete')).toBe(0);
    expect(load.listenerCount('loaderror')).toBe(0);
    expect(events.listenerCount('shutdown')).toBe(0);
    expect(events.listenerCount('destroy')).toBe(0);
    cache.add(runMusic.key);
    load.emit(`filecomplete-audio-${runMusic.key}`);
    load.emit('complete');
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('does not start the loader when every requested key is cached', async () => {
    const { scene, load, cache } = sceneHarness();
    cache.add(menuConfirm.key);
    const result = await loadAudioResources(scene as never, [menuConfirm, menuConfirm]);
    expect(result).toEqual({ loaded: [menuConfirm.key], failed: [], cancelled: false });
    expect(load.audio).not.toHaveBeenCalled();
    expect(load.start).not.toHaveBeenCalled();
  });
});
