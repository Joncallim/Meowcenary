import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { createDefaultSaveV4, LocalStorageAdapter, MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import type { AchievementPlatformAdapter } from '../src/gameplay/achievementPlatform';

const data = loadGameData();
const key = 'achievement-ack-regression';
const first = 'achievement:first-kill';
const second = 'achievement:kill-milestone-25';
const create = (save: SaveManager, platform: AchievementPlatformAdapter) => createGameContext({
  save, data, achievementPlatform: platform, bus: createEventBus(), menuRng: createRng(201),
  arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function queued(ids = [first]) {
  return { ...createDefaultSaveV4(),
    achievements: Object.fromEntries(ids.map((id) => [id, { completed: true, progress: id === first ? 1 : 25, completedAt: 1 }])),
    pendingAchievementReports: ids,
  };
}
class CountingStorage extends MemoryStorageAdapter {
  writes = 0;
  reads = 0;
  succeed = true;
  override getItem(key: string) { this.reads++; return super.getItem(key); }
  override setItem(key: string, value: string) {
    this.writes++;
    return this.succeed && super.setItem(key, value);
  }
}

describe('Achievement mirror acknowledgement ownership', () => {
  for (const sharedManager of [false, true]) for (const source of ['retry', 'terminal'] as const) {
    it(`rejects an obsolete ${source} ACK (${sharedManager ? 'shared' : 'separate'} SaveManager)`, async () => {
      const storage = new CountingStorage();
      storage.setItem(key, JSON.stringify(source === 'retry' ? queued() : createDefaultSaveV4()));
      const save = new SaveManager(storage, key);
      const held = deferred();
      const old = create(save, { report: () => held.promise });
      if (source === 'terminal') expect(old.settleRunTerminal({
        terminalStatus: 'loss', runScrap: 0, characterId: 'scrap-tabby', runDurationMs: 1000,
        metricIncrements: { 'metric:enemies-defeated': 1 },
      }).ok).toBe(true);
      await flush();
      const current = create(sharedManager ? save : new SaveManager(storage, key), { report: async () => {} });
      await flush();
      expect(current.saveData.pendingAchievementReports).toEqual([]);
      expect(current.commitProgression((p) => ({ ...p, scrap: 500 })).persisted).toBe(true);
      expect(current.updateSettings({ muted: true }).persisted).toBe(true);
      expect(current.completeStage('stage:junkyard-01', 60_000)).toBe(true);
      await flush();
      const before = storage.getItem(key);
      const snapshot = current.saveData;
      const writes = storage.writes;
      held.resolve(); await flush();
      expect(storage.getItem(key)).toBe(before);
      expect(storage.writes).toBe(writes);
      expect(current.saveData).toBe(snapshot);
      expect(old.saveData.pendingAchievementReports).toContain(first);
    });
  }

  it('revokes the old ACK before the replacement context makes any write', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const a = deferred(), b = deferred();
    create(new SaveManager(storage, key), { report: () => a.promise }); await flush();
    const current = create(new SaveManager(storage, key), { report: () => b.promise }); await flush();
    const before = storage.getItem(key), writes = storage.writes;
    a.resolve(); await flush();
    expect(storage.getItem(key)).toBe(before);
    expect(storage.writes).toBe(writes);
    b.resolve(); await flush();
    expect(current.saveData.pendingAchievementReports).toEqual([]);
    expect(JSON.parse(storage.getItem(key)!).pendingAchievementReports).toEqual([]);
  });

  it('shares ownership across browser adapter wrappers over the same Storage', async () => {
    const values = new Map<string, string>([[key, JSON.stringify(queued())]]);
    const backing: Storage = {
      get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
      clear: () => values.clear(), getItem: (id) => values.get(id) ?? null,
      setItem: (id, value) => { values.set(id, value); }, removeItem: (id) => { values.delete(id); },
    };
    const held = deferred();
    create(new SaveManager(new LocalStorageAdapter(backing), key), { report: () => held.promise }); await flush();
    const current = create(new SaveManager(new LocalStorageAdapter(backing), key), { report: async () => {} }); await flush();
    expect(current.commitProgression((p) => ({ ...p, scrap: 500 })).persisted).toBe(true);
    const before = backing.getItem(key);
    held.resolve(); await flush();
    expect(backing.getItem(key)).toBe(before);
  });

  it('preserves active-context mutations and clears only the successful report, without storage reads', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued([first, second])));
    const a = deferred(), b = deferred();
    const context = create(new SaveManager(storage, key), { report: (id) => id === first ? a.promise : b.promise });
    await flush();
    expect(context.commitProgression((p) => ({ ...p, scrap: 700 })).persisted).toBe(true);
    const reads = storage.reads;
    b.resolve(); await flush();
    expect(context.saveData.pendingAchievementReports).toEqual([first]);
    expect(context.saveData.progression.scrap).toBe(700);
    a.resolve(); await flush();
    expect(context.saveData.pendingAchievementReports).toEqual([]);
    expect(storage.reads).toBe(reads);
    expect(JSON.parse(storage.getItem(key)!).progression.scrap).toBe(700);
  });

  it('keeps a failed ACK durable and private, then retries successfully in the next context', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const held = deferred();
    const context = create(new SaveManager(storage, key), { report: () => held.promise }); await flush();
    const before = storage.getItem(key), snapshot = context.saveData;
    storage.succeed = false; held.resolve(); await flush();
    expect(context.saveData).toBe(snapshot);
    expect(storage.getItem(key)).toBe(before);
    storage.succeed = true;
    const next = create(new SaveManager(storage, key), { report: async () => {} }); await flush();
    expect(next.saveData.pendingAchievementReports).toEqual([]);
    expect(JSON.parse(storage.getItem(key)!).pendingAchievementReports).toEqual([]);
  });

  it('does not repaint or rewrite an active reset when its old report completes', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const held = deferred();
    const context = create(new SaveManager(storage, key), { report: () => held.promise }); await flush();
    expect(context.resetProgression().persisted).toBe(true);
    const before = storage.getItem(key), snapshot = context.saveData, writes = storage.writes;
    held.resolve(); await flush();
    expect(context.saveData).toBe(snapshot);
    expect(storage.getItem(key)).toBe(before);
    expect(storage.writes).toBe(writes);
  });

  it('rejects a stale ACK without attempting a failing write, then the current owner retries', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const a = deferred(), b = deferred();
    create(new SaveManager(storage, key), { report: () => a.promise }); await flush();
    const current = create(new SaveManager(storage, key), { report: () => b.promise }); await flush();
    storage.succeed = false;
    const writes = storage.writes;
    a.resolve(); await flush();
    expect(storage.writes).toBe(writes);
    expect(current.saveData.pendingAchievementReports).toEqual([first]);
    storage.succeed = true; b.resolve(); await flush();
    expect(current.saveData.pendingAchievementReports).toEqual([]);
    expect(JSON.parse(storage.getItem(key)!).pendingAchievementReports).toEqual([]);
  });

  it.each(['throw', 'reject'] as const)('retains the outbox after a platform %s', async (mode) => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const context = create(new SaveManager(storage, key), { report: () => {
      if (mode === 'throw') throw new Error('offline');
      return Promise.reject(new Error('offline'));
    } });
    const writes = storage.writes;
    await flush();
    expect(context.saveData.pendingAchievementReports).toEqual([first]);
    expect(storage.writes).toBe(writes);
  });

  it.each(['key', 'store'] as const)('does not revoke unrelated ownership across a different %s', async (mode) => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const held = deferred();
    const active = create(new SaveManager(storage, key), { report: () => held.promise }); await flush();
    const otherStore = mode === 'store' ? new CountingStorage() : storage;
    const otherKey = mode === 'key' ? `${key}-other` : key;
    otherStore.setItem(otherKey, JSON.stringify(queued()));
    create(new SaveManager(otherStore, otherKey), { report: () => new Promise<void>(() => {}) }); await flush();
    held.resolve(); await flush();
    expect(active.saveData.pendingAchievementReports).toEqual([]);
    expect(JSON.parse(storage.getItem(key)!).pendingAchievementReports).toEqual([]);
  });

  it('rejects reported save success without a canonical durable write', async () => {
    const storage = new CountingStorage(); storage.setItem(key, JSON.stringify(queued()));
    const save = new SaveManager(storage, key), held = deferred();
    const context = create(save, { report: () => held.promise }); await flush();
    vi.spyOn(save, 'save').mockReturnValue(true);
    held.resolve(); await flush();
    expect(context.saveData.pendingAchievementReports).toEqual([first]);
    expect(JSON.parse(storage.getItem(key)!).pendingAchievementReports).toEqual([first]);
  });
});
