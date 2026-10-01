import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootScene, BOOT_RESOURCE_BUNDLE_ID } from '../src/scenes/BootScene';
import { DataAssetBundleRegistry } from '../src/systems/assetBundles';
import { loadGameData } from '../src/systems/validation';
import audioAssets from '../src/data/audio-assets.json';
import type { VisualTextureResource } from '../src/systems/types';

vi.mock('phaser', () => ({ default: { Scene: class { constructor(public key: string) {} }, Textures: { FilterMode: { NEAREST: 1 } } } }));
const probe = vi.hoisted(() => ({ now: vi.fn(() => 100), record: vi.fn() }));
vi.mock('../src/platform/performanceProbe', () => ({ performanceProbe: probe }));

// Same on/once/off contract as bootScene.test.ts, with live listener counts so
// shutdown and completion checks verify removal rather than merely off calls.
function emitter() {
  type Listener = (...args: any[]) => void;
  const handlers = new Map<string, Set<Listener>>();
  const onceHandlers = new Map<string, Set<Listener>>();
  const add = (map: Map<string, Set<Listener>>, event: string, listener: Listener) => {
    const listeners = map.get(event) ?? new Set();
    listeners.add(listener);
    map.set(event, listeners);
  };
  return {
    on: (event: string, listener: Listener) => add(handlers, event, listener),
    once: (event: string, listener: Listener) => add(onceHandlers, event, listener),
    off: (event: string, listener: Listener) => { handlers.get(event)?.delete(listener); onceHandlers.get(event)?.delete(listener); },
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(handlers.get(event) ?? [])]) listener(...args);
      const once = [...(onceHandlers.get(event) ?? [])];
      onceHandlers.delete(event);
      for (const listener of once) listener(...args);
    },
    listenerCount: () => [...handlers.values(), ...onceHandlers.values()].reduce((count, listeners) => count + listeners.size, 0),
  };
}

function createBoot() {
  const load = { ...emitter(), audio: vi.fn(), image: vi.fn(), spritesheet: vi.fn(), atlas: vi.fn() };
  const events = emitter();
  const boot = new BootScene();
  Object.assign(boot, { load, events, textures: { exists: () => false } });
  return { boot, load, events };
}

const data = loadGameData();
const registry = new DataAssetBundleRegistry(data);
const bootResources = registry.resourcesForBundle(BOOT_RESOURCE_BUNDLE_ID)!;
const audioKeys = [...audioAssets.sfx, ...audioAssets.music].map(asset => asset.key);
function finishVisual(load: ReturnType<typeof createBoot>['load'], resources = bootResources, except?: string) {
  for (const resource of resources) {
    if (resource.textureKey === except) continue;
    const type = resource.load.type === 'atlas' ? 'atlasjson' : resource.load.type;
    load.emit(`filecomplete-${type}-${resource.textureKey}`);
  }
}
function finishAudio(load: ReturnType<typeof createBoot>['load'], except?: string) {
  for (const key of audioKeys) if (key !== except) load.emit('filecomplete', key, 'audio');
}
const records = (owner: string) => probe.record.mock.calls.filter(call => call[0] === owner);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('Boot performance ownership', () => {
  it('waits for owning keyed atlas completion after image/json children finish', () => {
    // Exercise the real validated atlas resource through Boot's normal queue.
    // Boot currently uses other formats; no production bundle is broadened.
    const atlas = registry.resourcesForBundle('bundle:core-forge')!.find(resource => resource.load.type === 'atlas')!;
    expect(atlas).toBeDefined();
    const original = DataAssetBundleRegistry.prototype.resourcesForBundle;
    vi.spyOn(DataAssetBundleRegistry.prototype, 'resourcesForBundle').mockImplementation(function (this: DataAssetBundleRegistry, id) {
      const resources = original.call(this, id);
      return id === BOOT_RESOURCE_BUNDLE_ID ? [...resources!, atlas] : resources;
    });
    const { boot, load } = createBoot();
    boot.preload();
    expect(load.atlas).toHaveBeenCalledWith(atlas.textureKey, atlas.load.imageUrl,
      (atlas.load as Extract<VisualTextureResource['load'], { type: 'atlas' }>).dataUrl);
    load.emit('start');
    finishVisual(load);
    load.emit('filecomplete', atlas.textureKey, 'image');
    load.emit(`filecomplete-image-${atlas.textureKey}`);
    expect(records('boot.visual')).toHaveLength(0);
    load.emit('filecomplete', atlas.textureKey, 'json');
    load.emit(`filecomplete-json-${atlas.textureKey}`);
    expect(records('boot.visual')).toHaveLength(0);
    load.emit(`filecomplete-atlasjson-${atlas.textureKey}`);
    expect(records('boot.visual')).toEqual([['boot.visual', 100, { failed: 0 }]]);
    load.emit(`filecomplete-atlasjson-${atlas.textureKey}`);
    expect(records('boot.visual')).toHaveLength(1);
  });

  it.each(['audio', 'visual'] as const)('keeps %s failure counts out of the other closure', failedOwner => {
    const { boot, load } = createBoot();
    boot.preload();
    load.emit('start');
    const failedKey = failedOwner === 'audio' ? audioKeys[0] : bootResources[0].textureKey;
    load.emit('loaderror', { key: failedKey });
    finishAudio(load, failedOwner === 'audio' ? failedKey : undefined);
    finishVisual(load, bootResources, failedOwner === 'visual' ? failedKey : undefined);
    expect(records('boot.audio')).toEqual([['boot.audio', 100, { failed: failedOwner === 'audio' ? 1 : 0 }]]);
    expect(records('boot.visual')).toEqual([['boot.visual', 100, { failed: failedOwner === 'visual' ? 1 : 0 }]]);
    load.emit('complete');
    expect(records('boot.load')[0][2]).toMatchObject({ incompleteAudio: 0, incompleteVisual: 0, failures: [failedKey] });
  });

  it.each(['complete', 'shutdown', 'destroy'] as const)('removes all timing listeners at %s and ignores late events', terminal => {
    const { boot, load, events } = createBoot();
    boot.preload();
    expect(load.listenerCount()).toBeGreaterThan(0);
    expect(events.listenerCount()).toBeGreaterThan(0);
    if (terminal === 'complete') load.emit(terminal);
    else events.emit(terminal);
    expect(load.listenerCount()).toBe(0);
    expect(events.listenerCount()).toBe(0);
    expect(records('boot.load')).toHaveLength(terminal === 'complete' ? 1 : 0);
    const recorded = probe.record.mock.calls.length;
    load.emit('start');
    finishAudio(load);
    finishVisual(load);
    load.emit('loaderror', { key: audioKeys[0] });
    load.emit('complete');
    events.emit('shutdown');
    events.emit('destroy');
    expect(probe.record).toHaveBeenCalledTimes(recorded);
  });
});
