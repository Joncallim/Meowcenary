import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { TEST_ARENA_VISUAL } from './helpers/arena';
import type { System } from '../src/engine/system';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { StageRegistry } from '../src/systems/stageRegistry';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import type { AchievementPlatformAdapter } from '../src/gameplay/achievementPlatform';

describe('GameContext persistence boundary', () => {
  it('commits stage, boss fact, reward and receipt together or not at all', () => {
    const { context, storage } = setup();
    storage.succeed = false;
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', {
      id: 'stage:junkyard-05:first-clear', grants: [{ type: 'grant-scrap', amount: 75 }],
    })).toBe(false);
    expect(context.saveData.stages['stage:junkyard-05']).toBeUndefined();
    expect(context.saveData.bosses['boss-crusher']).toBeUndefined();
    storage.succeed = true;
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', {
      id: 'stage:junkyard-05:first-clear', grants: [{ type: 'grant-scrap', amount: 75 }],
    })).toBe(true);
    expect(context.saveData.stages['stage:junkyard-05'].completed).toBe(true);
    expect(context.saveData.bosses['boss-crusher'].defeated).toBe(true);
    expect(context.saveData.progression.scrap).toBe(75);
    expect(context.saveData.appliedGrantTransactions['stage:junkyard-05:first-clear']).toBe(true);
  });

  it('rejects malformed stage/boss facts before recording their reward receipt', () => {
    const { context } = setup();
    const transaction = {
      id: 'stage:junkyard-05:malformed', grants: [{ type: 'grant-scrap' as const, amount: 75 }],
    };

    expect(context.completeStageTransaction('stage:missing', 120_000, undefined, transaction)).toBe(false);
    expect(context.completeStageTransaction('stage:junkyard-05', Number.NaN, 'boss-crusher', transaction)).toBe(false);
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss:other', transaction)).toBe(false);
    expect(context.saveData.appliedGrantTransactions[transaction.id]).toBeUndefined();
    expect(context.saveData.progression.scrap).toBe(0);
  });

  it('rejects malformed durable grants at every context transaction boundary', () => {
    const { context } = setup();
    const malformed = { id: 'stage:junkyard-01:bad', grants: [{ type: 'grant-scrap', amount: 0 }] as any };

    expect(context.applyGrantTransaction(malformed)).toBe(false);
    expect(context.completeStageTransaction('stage:junkyard-01', 1, undefined, malformed)).toBe(false);
    expect(context.commitAchievementTransaction({}, {}, malformed)).toBe(false);
    expect(context.saveData.appliedGrantTransactions[malformed.id]).toBeUndefined();
    expect(context.saveData.stages['stage:junkyard-01']).toBeUndefined();
  });

  it('fails closed if a receipt survives but its stage facts do not', () => {
    const { context } = setup();
    const transaction = {
      id: 'stage:junkyard-05:corrupt-receipt', grants: [{ type: 'grant-scrap' as const, amount: 75 }],
    };
    expect(context.applyGrantTransaction(transaction)).toBe(true);
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', transaction)).toBe(false);
    expect(context.saveData.progression.scrap).toBe(75);
    expect(context.saveData.stages['stage:junkyard-05']).toBeUndefined();
  });

  it('fails closed if an achievement receipt survives without its achievement facts', () => {
    const { context } = setup();
    const transaction = {
      id: 'achievement:first-kill:completion',
      grants: [{ type: 'achievement-completed' as const, achievementId: 'achievement:first-kill' }],
    };
    expect(context.applyGrantTransaction(transaction)).toBe(true);
    expect(context.commitAchievementTransaction({
      'achievement:first-kill': { progress: 1, completed: true, completedAt: 1 },
    }, { 'metric:enemies-defeated': 1 }, transaction)).toBe(false);
    expect(context.saveData.achievements['achievement:first-kill']).toBeUndefined();
  });

  it('reports a committed achievement through the injected platform boundary without letting failures escape', async () => {
    const report = vi.fn().mockRejectedValue(new Error('offline'));
    const { context } = setup(undefined, { report });
    context.reportAchievement('achievement:first-kill', { progress: 1, completed: true, completedAt: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith('achievement:first-kill', { progress: 1, completed: true, completedAt: 1 });
  });

  it('rejects a boss completion when an injected stage catalog disagrees with its encounter', () => {
    const data = loadGameData();
    const stages = new StageRegistry({
      ...data,
      encounterProfiles: data.encounterProfiles?.map((profile) => profile.id === 'encounter:junkyard-boss'
        ? { ...profile, bossId: 'boss:wrong' }
        : profile),
    });
    const { context } = setup(stages);
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', {
      id: 'stage:junkyard-05:disagreeing-catalog', grants: [{ type: 'grant-scrap', amount: 75 }],
    })).toBe(false);
    expect(context.saveData.appliedGrantTransactions['stage:junkyard-05:disagreeing-catalog']).toBeUndefined();
  });

  it('loads once and keeps settings/meta in one immutable current snapshot', () => {
    const { context, storage } = setup();
    const original = context.saveData;
    const settingsUpdate = context.updateSettings({ muted: true, sfxVolume: 0.25 });
    expect(settingsUpdate).toMatchObject({ persisted: true, value: { muted: true, sfxVolume: 0.25 } });
    expect(context.settings).toBe(context.saveData.settings);
    expect(context.saveData.progression).toBe(original.progression);
    expect(context.saveData).not.toBe(original);

    const metaUpdate = context.updateMeta((meta) => ({ ...meta, scrap: 42 }));
    expect(metaUpdate.persisted).toBe(true);
    expect(context.saveData.settings).toBe(settingsUpdate.value);
    expect(context.saveData.progression.scrap).toBe(42);
    expect(Object.isFrozen(context.saveData)).toBe(true);
    expect(Reflect.set(context.saveData.progression as object, 'scrap', 999)).toBe(false);
    expect(context.saveData.progression.scrap).toBe(42);
    expect(storage.getCalls).toBe(1);
    expect(storage.setCalls).toBe(2);
  });

  it('reset preserves settings and failed persistence retains the new snapshot', () => {
    const { context, storage } = setup();
    context.updateSettings({ reducedMotion: true });
    context.updateMeta((meta) => ({ ...meta, scrap: 10 }));
    storage.succeed = false;
    const reset = context.resetProgression();
    expect(reset.persisted).toBe(false);
    expect(reset.value.scrap).toBe(0);
    expect(context.settings.reducedMotion).toBe(true);
  });

  it('does not change state or persist when a transform throws', () => {
    const { context, storage } = setup();
    const before = context.saveData;
    const calls = storage.setCalls;
    expect(() => context.updateMeta(() => { throw new Error('programmer error'); })).toThrow('programmer error');
    expect(context.saveData).toBe(before);
    expect(storage.setCalls).toBe(calls);
  });

  it('defines the minimal System lifecycle', () => {
    const calls: number[] = [];
    const system: System = { update: (dt) => calls.push(dt), destroy: () => { calls.push(-1); } };
    system.update(16.67); system.destroy();
    expect(calls).toEqual([16.67, -1]);
  });

  it('emits settings:changed exactly once on a real settings change with the same settings object everywhere', () => {
    const { context } = setup();
    const emitted: unknown[] = [];
    const unsubscribe = context.bus.on('settings:changed', (payload) => {
      emitted.push(payload.settings);
    });
    try {
      const result = context.updateSettings({ muted: true });

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe(result.value);
      expect(emitted[0]).toBe(context.settings);
      expect(emitted[0]).toBe(context.saveData.settings);
      expect(context.settings).toBe(context.saveData.settings);
    } finally {
      unsubscribe();
    }
  });

  it('emits nothing when a no-op/sanitized-to-current patch is applied', () => {
    const { context } = setup();
    const emitSpy = vi.fn();
    const unsubscribe = context.bus.on('settings:changed', emitSpy);
    try {
      const result = context.updateSettings({});
      expect(emitSpy).not.toHaveBeenCalled();
      expect(result.value).toBe(context.settings);

      // Sanitized-to-current: NaN volumes clamp to the current values.
      context.updateSettings({ musicVolume: Number.NaN });
      expect(emitSpy).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('still emits settings:changed once when persistence fails', () => {
    const { context, storage } = setup();
    storage.succeed = false;
    const emitted: unknown[] = [];
    const unsubscribe = context.bus.on('settings:changed', (payload) => {
      emitted.push(payload.settings);
    });
    try {
      const result = context.updateSettings({ sfxVolume: 0.25 });

      expect(result.persisted).toBe(false);
      expect(result.value.sfxVolume).toBe(0.25);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe(result.value);
      expect(context.settings.sfxVolume).toBe(0.25);
    } finally {
      unsubscribe();
    }
  });

  it('defaults selectedCharacterId to the registry default', () => {
    const { context } = setup();
    expect(context.selectedCharacterId).toBe('scrap-tabby');
    expect(context.selectionRevision).toBe(1);
  });

  it('selectCharacter succeeds for a valid unlockable character', () => {
    const { context } = setup();
    const result = context.selectCharacter('scrap-tabby', context.selectionRevision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.characterId).toBe('scrap-tabby');
      // Idempotent re-selection should not bump revision
      expect(result.revision).toBe(context.selectionRevision);
    }
  });

  it('selectCharacter bumps revision on actual change', () => {
    const { context } = setup();
    // Add the unlock for bolt-hound
    context.updateMeta((meta) => {
      const unlocks = [...meta.unlocks, 'achievement:first-victory'];
      return { ...meta, unlocks };
    });
    const revision = context.selectionRevision;
    const result = context.selectCharacter('bolt-hound', revision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.characterId).toBe('bolt-hound');
      expect(result.revision).toBe(revision + 1);
      expect(context.selectedCharacterId).toBe('bolt-hound');
      expect(context.selectionRevision).toBe(revision + 1);
    }
  });

  it('selectCharacter rejects unknown characters', () => {
    const { context } = setup();
    const result = context.selectCharacter('nonexistent', context.selectionRevision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-character');
      expect(result.characterId).toBe('scrap-tabby');
    }
  });

  it('selectCharacter rejects locked characters', () => {
    const { context } = setup();
    const result = context.selectCharacter('bolt-hound', context.selectionRevision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('locked');
      expect(result.characterId).toBe('scrap-tabby');
    }
  });

  it('selectCharacter rejects stale selections', () => {
    const { context } = setup();
    // Add unlock so bolt-hound is selectable, then change selection
    context.updateMeta((meta) => {
      const unlocks = [...meta.unlocks, 'achievement:first-victory'];
      return { ...meta, unlocks };
    });
    context.selectCharacter('bolt-hound', context.selectionRevision);
    // Now try with stale revision
    const result = context.selectCharacter('scrap-tabby', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-selection');
    }
  });

  it('selectCharacter never calls save.save or mutates saveData', () => {
    const { context, storage } = setup();
    const callsBefore = storage.setCalls;
    context.selectCharacter('scrap-tabby', context.selectionRevision);
    expect(storage.setCalls).toBe(callsBefore);
  });

  it('stale check runs before locked check', () => {
    const { context } = setup();
    // bolt-hound is locked AND we use a stale revision
    const result = context.selectCharacter('bolt-hound', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-selection');
    }
  });

  it('revalidates selectedCharacterId to default after resetProgression clears unlocks', () => {
    const { context } = setup();
    // Unlock and select bolt-hound
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    context.selectCharacter('bolt-hound', context.selectionRevision);
    expect(context.selectedCharacterId).toBe('bolt-hound');

    // Reset progression — this calls updateMeta which now revalidates
    context.resetProgression();

    // selectedCharacterId must have been reset to the default
    expect(context.selectedCharacterId).toBe('scrap-tabby');
    // Revision must have bumped once for the select + once for the revalidation
    expect(context.selectionRevision).toBe(3);
  });

  it('updateMeta revalidates selection: locked character resets to default', () => {
    const { context } = setup();
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    context.selectCharacter('bolt-hound', context.selectionRevision);
    expect(context.selectedCharacterId).toBe('bolt-hound');
    const revisionBefore = context.selectionRevision;

    // Remove the unlock via a direct meta transform
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: meta.unlocks.filter((id) => id !== 'achievement:first-victory'),
    }));

    expect(context.selectedCharacterId).toBe('scrap-tabby');
    expect(context.selectionRevision).toBe(revisionBefore + 1);
  });

  it('selectedArenaId defaults to the registry default with arenaSelectionRevision === 1', () => {
    const { context } = setup();
    expect(context.selectedArenaId).toBe('junkyard-lot');
    expect(context.arenaSelectionRevision).toBe(1);
  });

  it('selectArena rejects unknown arenas', () => {
    const { context } = setup();
    const result = context.selectArena('nonexistent', context.arenaSelectionRevision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-arena');
      expect(result.arenaId).toBe('junkyard-lot');
    }
  });

  it('selectArena rejects stale revisions', () => {
    const { context } = setup();
    const result = context.selectArena('junkyard-lot', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-selection');
      expect(result.arenaId).toBe('junkyard-lot');
    }
  });

  it('selectArena rejects locked arenas', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry({
      arenas: [
        ...data.arenas,
        {
          id: 'voltage-alley',
          name: 'Voltage Alley',
          size: { width: 800, height: 600 },
          spawnCurveId: 'junkyard-intro',
          spawnRegions: [{ kind: 'edges', margin: 28 }],
          obstacles: [],
          hazards: [],
          visual: TEST_ARENA_VISUAL,
          unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
        },
      ],
    });
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new CountingStorage(), 'arena-locked', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas, metaUpgrades, save, characters,
    });
    const result = context.selectArena('voltage-alley', context.arenaSelectionRevision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('locked');
      expect(result.arenaId).toBe('junkyard-lot');
    }
  });

  it('selectArena same arena returns ok: true without bumping revision', () => {
    const { context } = setup();
    const result = context.selectArena('junkyard-lot', context.arenaSelectionRevision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.arenaId).toBe('junkyard-lot');
      expect(result.revision).toBe(context.arenaSelectionRevision);
    }
  });

  it('selectArena with valid change bumps arenaSelectionRevision by exactly 1', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry({
      arenas: [
        ...data.arenas,
        {
          id: 'voltage-alley',
          name: 'Voltage Alley',
          size: { width: 800, height: 600 },
          spawnCurveId: 'junkyard-intro',
          spawnRegions: [{ kind: 'edges', margin: 28 }],
          obstacles: [],
          hazards: [],
          visual: TEST_ARENA_VISUAL,
          unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
        },
      ],
    });
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new CountingStorage(), 'arena-change', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas, metaUpgrades, save, characters,
    });
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    const revision = context.arenaSelectionRevision;
    const result = context.selectArena('voltage-alley', revision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.arenaId).toBe('voltage-alley');
      expect(result.revision).toBe(revision + 1);
      expect(context.selectedArenaId).toBe('voltage-alley');
      expect(context.arenaSelectionRevision).toBe(revision + 1);
    }
  });

  it('selectArena never calls save.save', () => {
    const { context, storage } = setup();
    const callsBefore = storage.setCalls;
    context.selectArena('junkyard-lot', context.arenaSelectionRevision);
    expect(storage.setCalls).toBe(callsBefore);
  });

  it('updateMeta that removes an arena unlock resets selection to default and bumps arenaSelectionRevision', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry({
      arenas: [
        ...data.arenas,
        {
          id: 'voltage-alley',
          name: 'Voltage Alley',
          size: { width: 800, height: 600 },
          spawnCurveId: 'junkyard-intro',
          spawnRegions: [{ kind: 'edges', margin: 28 }],
          obstacles: [],
          hazards: [],
          visual: TEST_ARENA_VISUAL,
          unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
        },
      ],
    });
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new CountingStorage(), 'arena-revalidate', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas, metaUpgrades, save, characters,
    });
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    context.selectArena('voltage-alley', context.arenaSelectionRevision);
    expect(context.selectedArenaId).toBe('voltage-alley');
    const revisionBefore = context.arenaSelectionRevision;

    context.updateMeta((meta) => ({
      ...meta,
      unlocks: meta.unlocks.filter((id) => id !== 'achievement:first-victory'),
    }));

    expect(context.selectedArenaId).toBe('junkyard-lot');
    expect(context.arenaSelectionRevision).toBe(revisionBefore + 1);
  });
});

class CountingStorage extends MemoryStorageAdapter {
  getCalls = 0; setCalls = 0; succeed = true;
  override getItem(key: string): string | null { this.getCalls += 1; return super.getItem(key); }
  override setItem(key: string, value: string): boolean {
    this.setCalls += 1;
    return this.succeed && super.setItem(key, value);
  }
}

function setup(stages?: StageRegistry, achievementPlatform?: AchievementPlatformAdapter) {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const registry = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const storage = new CountingStorage();
  const save = new SaveManager(storage, 'context-test', registry.maxLevels());
  return {
    storage,
    context: createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas, metaUpgrades: registry, save, characters, stages, achievementPlatform,
    }),
  };
}
