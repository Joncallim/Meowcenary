import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataCharacterRegistry } from '../src/systems/characters';
import {
  MemoryStorageAdapter,
  SaveManager,
  type StorageAdapter,
} from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { cycleVolumeStep, SettingsController } from '../src/ui/settings';
import { MainMenuController } from '../src/ui/menus';

function setup(storage?: StorageAdapter) {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(
    storage ?? new MemoryStorageAdapter(),
    'settings-controller-test',
    metaUpgrades.maxLevels(),
  );
  const context = createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    arenas,
    metaUpgrades,
    characters,
    save,
  });
  return { context, controller: new SettingsController(context) };
}

class FailingStorageAdapter implements StorageAdapter {
  getItem(): string | null { return null; }
  setItem(): boolean { return false; }
  removeItem(): boolean { return false; }
}

describe('SettingsController', () => {
  it('snapshot rereads context and starts with unknown storage availability', () => {
    const { context, controller } = setup();
    const snapshot = controller.snapshot();
    expect(snapshot.muted).toBe(context.settings.muted);
    expect(snapshot.musicVolume).toBe(context.settings.musicVolume);
    expect(snapshot.sfxVolume).toBe(context.settings.sfxVolume);
    expect(snapshot.reducedMotion).toBe(context.settings.reducedMotion);
    // #241 §3.1 requires the enum in the explicit frozen snapshot shape.
    expect(snapshot.abilityButtonSide).toBe('left');
    expect(snapshot.storageAvailable).toBeNull();
  });

  it('publishes one side change and keeps no-op/invalid Right patches at the same identity', () => {
    const { context, controller } = setup();
    const update = vi.spyOn(context, 'updateSettings');
    const changed = vi.fn(({ settings }: { readonly settings: typeof context.settings }) => { expect(context.settings).toBe(settings); });
    const unsubscribe = context.bus.on('settings:changed', changed);
    try {
      const before = controller.snapshot();
      const result = controller.set({ abilityButtonSide: 'right' });
      expect(update).toHaveBeenCalledTimes(1);
      expect(result.changed).toBe(true);
      expect(result.persisted).toBe(true);
      expect(result.settings.abilityButtonSide).toBe('right');
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledWith({ settings: result.settings });
      expect(controller.snapshot().abilityButtonSide).toBe('right');
      expect(before.abilityButtonSide).toBe('left');
      expect(Object.isFrozen(controller.snapshot())).toBe(true);
      for (const patch of [{}, { abilityButtonSide: 'right' }, { abilityButtonSide: 'RIGHT' }]) {
        const noOp = controller.set(patch as Parameters<SettingsController['set']>[0]);
        expect(noOp.settings).toBe(result.settings);
        expect(noOp.changed).toBe(false);
        expect(noOp.persisted).toBe(true);
      }
      expect(changed).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it('keeps failed side writes session-only and preserves the existing menu notice', () => {
    const storage = new FailingStorageAdapter();
    const { context, controller } = setup(storage);
    const changed = vi.fn();
    const unsubscribe = context.bus.on('settings:changed', changed);
    try {
      const result = controller.set({ abilityButtonSide: 'right' });
      expect(result.changed).toBe(true);
      expect(result.persisted).toBe(false);
      expect(context.settings).toBe(result.settings);
      expect(controller.snapshot().abilityButtonSide).toBe('right');
      expect(controller.snapshot().storageAvailable).toBe(false);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(setup(storage).controller.snapshot().abilityButtonSide).toBe('left');
      const menu = new MainMenuController(context);
      menu.open('settings');
      const snapshot = menu.setSettings({ abilityButtonSide: 'right' });
      expect(snapshot.settings.abilityButtonSide).toBe('right');
      expect(snapshot.settings.storageAvailable).toBe(false);
      expect(snapshot.notice).toBe('Saved for this session only');
      expect(changed).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it('calls updateSettings exactly once per set and reports change by identity', () => {
    const { context, controller } = setup();
    const spy = vi.spyOn(context, 'updateSettings');

    const result = controller.set({ muted: true });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.settings.muted).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.changed).toBe(true);
    expect(controller.snapshot().storageAvailable).toBe(true);
  });

  it('delegates clamping and sanitization to GameContext', () => {
    const { controller } = setup();
    const result = controller.set({ musicVolume: 5, sfxVolume: -0.5 });

    expect(result.settings.musicVolume).toBe(1);
    expect(result.settings.sfxVolume).toBe(0);
  });

  it('reports unchanged when the patch produces the same settings reference', () => {
    const { context, controller } = setup();
    const before = context.settings;
    const result = controller.set({ muted: before.muted });

    expect(result.settings).toBe(before);
    expect(result.changed).toBe(false);
    expect(result.persisted).toBe(true);
  });

  it('surfaces persistence failure without retrying or writing storage itself', () => {
    const { context, controller } = setup(new FailingStorageAdapter());
    const spy = vi.spyOn(context, 'updateSettings');

    const result = controller.set({ reducedMotion: true });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.settings.reducedMotion).toBe(true);
    expect(result.persisted).toBe(false);
    expect(controller.snapshot().storageAvailable).toBe(false);
  });

  it('rereads context after an external settings mutation', () => {
    const { context, controller } = setup();
    context.updateSettings({ muted: true });

    const snapshot = controller.snapshot();
    expect(snapshot.muted).toBe(true);
  });

  it('does not leak the controller storageAvailable flag across unrelated snapshots', () => {
    const { controller } = setup();
    expect(controller.snapshot().storageAvailable).toBeNull();
  });

  it('accepts a partial patch with only volume steps', () => {
    const { controller } = setup();
    const result = controller.set({ musicVolume: 0.3 });

    expect(result.settings.musicVolume).toBe(0.3);
    expect(result.changed).toBe(true);
  });

  it('freezes returned snapshots and results', () => {
    const { controller } = setup();
    expect(Object.isFrozen(controller.snapshot())).toBe(true);
    expect(Object.isFrozen(controller.set({ muted: true }))).toBe(true);
  });
});

describe('cycleVolumeStep', () => {
  it('steps the volume up by 0.1', () => {
    expect(cycleVolumeStep(0)).toBe(0.1);
    expect(cycleVolumeStep(0.3)).toBe(0.4);
    expect(cycleVolumeStep(0.9)).toBe(1);
  });

  it('wraps from the top of the range back to 0', () => {
    expect(cycleVolumeStep(1)).toBe(0);
  });

  it('snaps every value below 1 up to exactly 1 instead of wrapping early', () => {
    // Values between grid points (float drift, future adjustments) must not
    // skip 100%: the wrap threshold is symmetric at the top of the range.
    expect(cycleVolumeStep(0.94)).toBe(1);
    expect(cycleVolumeStep(0.95)).toBe(1);
    expect(cycleVolumeStep(0.99)).toBe(1);
  });

  it('cycles a ten-step sweep 0 -> 1 -> 0 -> 0.1', () => {
    let volume = 0;
    for (let step = 0; step < 10; step += 1) {
      volume = cycleVolumeStep(volume);
    }
    expect(volume).toBe(1);

    volume = cycleVolumeStep(volume);
    expect(volume).toBe(0);

    volume = cycleVolumeStep(volume);
    expect(volume).toBe(0.1);
  });
});
