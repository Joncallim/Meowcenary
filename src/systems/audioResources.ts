import type Phaser from 'phaser';
import type { AudioAssetCatalog, AudioResourceLifecycle } from './types';
import { performanceProbe } from '../platform/performanceProbe';

export type AudioResource = AudioAssetCatalog['sfx'][number] | AudioAssetCatalog['music'][number];

export interface AudioLoadProgress {
  readonly completed: number;
  readonly total: number;
}

export interface AudioLoadResult {
  readonly loaded: readonly string[];
  readonly failed: readonly string[];
  readonly cancelled: boolean;
}

function uniqueByKey(resources: readonly AudioResource[]): readonly AudioResource[] {
  return [...new Map(resources.map((resource) => [resource.key, resource])).values()];
}

/** The validated audio catalog declares when each file is needed. The key is
 * the physical Phaser cache identity, so duplicate references load once. */
export function resolveAudioResources(
  catalog: Readonly<AudioAssetCatalog>,
  lifecycle: AudioResourceLifecycle,
): readonly AudioResource[] {
  return Object.freeze(uniqueByKey([...catalog.sfx, ...catalog.music].filter(
    (resource) => resource.lifecycle === lifecycle,
  )));
}

/** Boot's preload queue starts automatically; it must not call start(). */
export function queueAudioResources(
  scene: Pick<Phaser.Scene, 'load'>,
  resources: readonly AudioResource[],
): void {
  for (const resource of uniqueByKey(resources)) scene.load.audio(resource.key, resource.url);
}

/** Load optional run audio after scene entry. The caller serializes this whole
 * operation with other Menu loads because Phaser exposes one queue per scene.
 * The Promise settles only on loader-wide complete, when that queue is idle.
 * Phaser's no-audio factory queues nothing; its empty start still emits complete. */
export function loadAudioResources(
  scene: Pick<Phaser.Scene, 'load' | 'cache' | 'events' | 'sys'>,
  resources: readonly AudioResource[],
  onProgress?: (progress: AudioLoadProgress) => void,
): Promise<AudioLoadResult> {
  const started = performanceProbe?.now();
  const unique = uniqueByKey(resources);
  const loaded: string[] = [];
  const failed: string[] = [];
  const pending = unique.filter((resource) => {
    if (!scene.cache.audio.exists(resource.key)) return true;
    loaded.push(resource.key);
    return false;
  });
  const total = unique.length;
  const cached = loaded.length;
  const record = (cancelled: boolean): void => {
    if (started !== undefined) performanceProbe!.record('resource.audio', started, {
      scene: scene.sys?.settings?.key ?? 'headless', total, cached,
      requested: pending.length, resourceIds: pending.map(resource => resource.key),
      urls: pending.map(resource => resource.url), loaded: loaded.length, failed: failed.length, cancelled,
    });
  };
  const progress = (): void => onProgress?.({ completed: loaded.length + failed.length, total });
  progress();
  if (pending.length === 0) {
    record(false);
    return Promise.resolve({ loaded, failed, cancelled: false });
  }

  return new Promise<AudioLoadResult>((resolve) => {
    let finished = false;
    const outstanding = new Set(pending.map((resource) => resource.key));
    const keyed = pending.map((resource) => ({
      event: `filecomplete-audio-${resource.key}`,
      listener: (): void => settle(resource.key, true),
    }));
    const cleanup = (): void => {
      scene.load.off('loaderror', onError);
      scene.load.off('complete', onComplete);
      for (const handler of keyed) scene.load.off(handler.event, handler.listener);
      scene.events.off('shutdown', onCancelled);
      scene.events.off('destroy', onCancelled);
    };
    const finish = (cancelled: boolean): void => {
      if (finished) return;
      finished = true;
      cleanup();
      record(cancelled);
      resolve({ loaded, failed, cancelled });
    };
    const settle = (key: string, success: boolean): void => {
      if (finished || !outstanding.delete(key)) return;
      (success ? loaded : failed).push(key);
      progress();
    };
    const onError = (file: { readonly key?: string }): void => {
      if (file.key !== undefined) settle(file.key, false);
    };
    const onComplete = (): void => {
      // NoAudio and other silent skips may emit no keyed file events. Treat
      // absent cache entries as optional failures so run preparation advances.
      for (const resource of pending) {
        if (outstanding.has(resource.key)) settle(resource.key, scene.cache.audio.exists(resource.key));
      }
      finish(false);
    };
    const onCancelled = (): void => finish(true);

    scene.load.on('loaderror', onError);
    scene.load.once('complete', onComplete);
    for (const handler of keyed) scene.load.once(handler.event, handler.listener);
    scene.events.once('shutdown', onCancelled);
    scene.events.once('destroy', onCancelled);
    try {
      queueAudioResources(scene, pending);
      scene.load.start();
    } catch {
      for (const resource of pending) settle(resource.key, false);
      finish(false);
    }
  });
}
