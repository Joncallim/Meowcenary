import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { createEventBus } from '../src/engine/eventBus';
import type { GameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { createRunState, endRun, pauseRun, startRun } from '../src/gameplay/runState';
import { xpToNext } from '../src/gameplay/xp';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';
import type { ResolvedRunPlan } from '../src/gameplay/stage/stageContracts';
import type { Player } from '../src/entities/Player';
import type { Drop } from '../src/entities/Drop';
import { UpgradeSystem } from '../src/systems/UpgradeSystem';
import type { UpgradeDefinition } from '../src/systems/types';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import type { LootTableLookup } from '../src/systems/lootTables';
import { MockArc, MockBody, MockGameObject } from './__mocks__/phaser';

const upgrade: UpgradeDefinition = {
  id: 'pulse-proof-upgrade', name: 'Pulse Proof Upgrade', rarity: 'common', target: 'player',
  description: 'One reproducible chooser option.', maxStacks: 10,
  effects: [{ stat: 'moveSpeed', op: 'add', value: 1 }],
  presentation: { category: 'mobility', iconArtId: 'upgrade-icon:pulse-proof-upgrade' },
};
const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); });

async function setup(lootTables: LootTableLookup = { lootTableById: () => undefined }) {
  const { DropSystem } = await import('../src/systems/DropSystem');
  const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  startRun(runState);
  const bus = createEventBus();
  const upgrades = new UpgradeSystem({ runState, bus, definitions: [upgrade], rng: createRng(1) });
  const player = { x: 0, y: 0, sprite: new MockArc(0, 0) };
  let overlap!: (player: unknown, drop: unknown) => void;
  const scene = {
    add: { circle: () => new MockArc(0, 0) },
    physics: { add: {
      existing: (sprite: MockGameObject) => { sprite.body = new MockBody(sprite); },
      overlap: (_player: unknown, _group: unknown, callback: typeof overlap,
        _process: unknown, context: unknown) => {
        overlap = callback.bind(context);
        return { destroy: () => undefined };
      },
    } },
  };
  const lootRng = { next: vi.fn(() => 0.3) };
  const weapons = new DataWeaponRegistry(loadGameData());
  const system = new DropSystem({
    scene: scene as unknown as Phaser.Scene, ctx: { bus } as unknown as GameContext,
    runState, player: player as unknown as Player,
    dropGroup: { add: () => undefined } as unknown as Phaser.Physics.Arcade.Group,
    lootTables, weaponRegistry: weapons, rng: lootRng,
    dropRadius: 4, magnetSpeed: 450, basePickupRadius: 10,
  });
  cleanup.push(() => { system.destroy(); upgrades.destroy(); });
  const collected = vi.fn(), gained = vi.fn(), levels = vi.fn(), paused = vi.fn(), resumed = vi.fn();
  bus.on('drop:collected', collected); bus.on('xp:gained', gained); bus.on('level:up', levels);
  bus.on('run:paused', paused); bus.on('run:resumed', resumed);
  return { system, runState, bus, upgrades, player, overlap, lootRng, weapons,
    collected, gained, levels, paused, resumed };
}

describe('Scavenge Pulse consumable collection boundary', () => {
  it('finishes XP then Scrap after the real chooser takes its level-up pause', async () => {
    const t = await setup();
    const xp = t.system.spawnDrop(1, 0, { kind: 'xp', amount: t.runState.xpToNext });
    const scrap = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 7 });
    const events: string[] = [];
    t.bus.on('xp:gained', () => events.push('xp:gained'));
    t.bus.on('level:up', () => events.push('level:up'));
    t.bus.on('drop:collected', ({ kind }) => events.push(`drop:${kind}`));
    const reported = t.system.collectNearbyConsumables(10);
    expect(t.runState.status).toBe('paused');
    expect(t.runState.pauseReason).toBe('levelUp');
    expect(t.upgrades.pendingLevel).toBe(2);
    expect(t.upgrades.currentOfferId).toBeDefined();
    expect(t.paused).toHaveBeenCalledOnce();
    expect(t.resumed).not.toHaveBeenCalled();
    expect(xp.active).toBe(false);
    expect(scrap.active).toBe(false);
    expect(t.runState.currency).toBe(7);
    expect(t.collected).toHaveBeenCalledTimes(2);
    expect(reported).toBe(2);
    expect(reported).toBe(t.collected.mock.calls.length);
    expect(events).toEqual(['xp:gained', 'level:up', 'drop:xp', 'drop:scrap']);
    expect(t.lootRng.next).not.toHaveBeenCalled();
  });

  it('preserves subsequent XP, queues its level and leaves the chooser pause owned', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'xp', amount: xpToNext(1) });
    const later = t.system.spawnDrop(2, 0, { kind: 'xp', amount: xpToNext(2) + 1 });
    expect(t.system.collectNearbyConsumables(10)).toBe(2);
    expect(later.active).toBe(false);
    expect(t.runState.level).toBe(3);
    expect(t.runState.xp).toBe(1);
    expect(t.gained.mock.calls.map(([event]) => event.amount)).toEqual([5, 8]);
    expect(t.levels.mock.calls.map(([event]) => event.level)).toEqual([2, 3]);
    expect(t.upgrades.pendingCount).toBe(2);
    expect(t.upgrades.pendingLevel).toBe(2);
    expect(t.runState.status).toBe('paused');
    expect(t.runState.pauseReason).toBe('levelUp');
    expect(t.paused).toHaveBeenCalledOnce();
    expect(t.resumed).not.toHaveBeenCalled();
    expect(t.upgrades.chooseCard(t.upgrades.currentOfferId!, upgrade.id)).toBe(true);
    expect(t.upgrades.pendingLevel).toBe(3);
    expect(t.runState.status).toBe('paused');
    expect(t.upgrades.chooseCard(t.upgrades.currentOfferId!, upgrade.id)).toBe(true);
    expect(t.upgrades.pendingCount).toBe(0);
    expect(t.runState.status).toBe('active');
  });

  it('awards later non-leveling XP under the pause with normal gain and face-value events', async () => {
    const t = await setup();
    t.runState.stats.add({ stat: 'xpGain', op: 'mult', value: 2, sourceId: 'pulse-proof' });
    t.system.spawnDrop(1, 0, { kind: 'xp', amount: 3 });
    t.system.spawnDrop(2, 0, { kind: 'xp', amount: 1 });
    expect(t.system.collectNearbyConsumables(10)).toBe(2);
    expect(t.runState.level).toBe(2);
    expect(t.runState.xp).toBe(3);
    expect(t.gained.mock.calls.map(([event]) => event.amount)).toEqual([6, 2]);
    expect(t.collected.mock.calls.map(([event]) => event.amount)).toEqual([3, 1]);
    expect(t.upgrades.pendingCount).toBe(1);
    expect(t.resumed).not.toHaveBeenCalled();
  });

  it('rejects a later pulse and ordinary overlaps while the real chooser still owns the pause', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'xp', amount: xpToNext(1) });
    expect(t.system.collectNearbyConsumables(10)).toBe(1);
    expect(t.runState.pauseReason).toBe('levelUp');
    expect(t.upgrades.currentOfferId).toBeDefined();
    const xp = t.system.spawnDrop(1, 0, { kind: 'xp', amount: 2 });
    const scrap = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 7 });
    expect(t.system.collectNearbyConsumables(10)).toBe(0);
    t.overlap(null, xp.sprite); t.overlap(null, scrap.sprite);
    expect(xp.active).toBe(true);
    expect(scrap.active).toBe(true);
    expect(t.runState.xp).toBe(0);
    expect(t.runState.currency).toBe(0);
    expect(t.collected).toHaveBeenCalledOnce();
    expect(t.upgrades.pendingCount).toBe(1);
    expect(t.paused).toHaveBeenCalledOnce();
    expect(t.resumed).not.toHaveBeenCalled();
  });

  it.each(['manual', 'levelUp', 'intro', 'won', 'lost'] as const)(
    'rejects a pulse that starts in %s', async (state) => {
      const t = await setup();
      if (state === 'manual' || state === 'levelUp') pauseRun(t.runState, t.bus, state);
      else t.runState.status = state;
      const xp = t.system.spawnDrop(1, 0, { kind: 'xp', amount: 5 });
      const scrap = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 7 });
      expect(t.system.collectNearbyConsumables(10)).toBe(0);
      expect(xp.active).toBe(true);
      expect(scrap.active).toBe(true);
      expect(t.runState.xp).toBe(0);
      expect(t.runState.currency).toBe(0);
      expect(t.collected).not.toHaveBeenCalled();
      expect(t.upgrades.pendingCount).toBe(0);
      expect(t.resumed).not.toHaveBeenCalled();
    },
  );

  it.each(['manual', 'won', 'lost'] as const)(
    'stops after a listener changes the active run to %s and counts only consumption', async (state) => {
      const t = await setup();
      t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
      const later = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 7 });
      t.bus.on('drop:collected', () => {
        if (state === 'manual') pauseRun(t.runState, t.bus, 'manual');
        else endRun(t.runState, state, t.bus);
      });
      expect(t.system.collectNearbyConsumables(10)).toBe(1);
      expect(t.collected).toHaveBeenCalledOnce();
      expect(t.runState.currency).toBe(1);
      expect(later.active).toBe(true);
      expect(t.runState.status).toBe(state === 'manual' ? 'paused' : state);
      expect(t.resumed).not.toHaveBeenCalled();
    },
  );

  it('excludes outside, chest, weapon and blocked drops even with a full rack', async () => {
    const lookup = vi.fn(() => undefined);
    const t = await setup({ lootTableById: lookup });
    const definition = t.weapons.weaponById('scrap-pistol-t1')!;
    t.runState.equipped = Array.from({ length: 6 }, () => t.weapons.createWeaponInstance(definition));
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 3 });
    t.system.spawnDrop(2, 0, { kind: 'xp', amount: 1 });
    const outside = t.system.spawnDrop(11, 0, { kind: 'scrap', amount: 99 });
    const chest = t.system.spawnDrop(1, 0, { kind: 'chest', amount: 0, tableId: 'pulse-cache' });
    const weapon = t.system.spawnDrop(1, 0, { kind: 'weapon', definitionId: definition.id });
    t.overlap(null, weapon.sprite);
    const blocked = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 99 });
    blocked.setPickupBlocked(true);
    expect(t.system.collectNearbyConsumables(10)).toBe(2);
    expect(t.collected).toHaveBeenCalledTimes(2);
    expect(t.runState.currency).toBe(3);
    expect(t.runState.xp).toBe(1);
    expect([outside, chest, weapon, blocked].every((drop) => drop.active)).toBe(true);
    expect(weapon.pickupBlocked).toBe(true);
    expect(t.runState.equipped).toHaveLength(6);
    expect(lookup).not.toHaveBeenCalled();
    expect(t.lootRng.next).not.toHaveBeenCalled();
  });

  it('keeps the activation center when a listener moves the player', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    const admitted = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 2 });
    const outside = t.system.spawnDrop(50, 0, { kind: 'scrap', amount: 99 });
    t.bus.on('drop:collected', () => { t.player.x = 50; });
    expect(t.system.collectNearbyConsumables(10)).toBe(2);
    expect(t.runState.currency).toBe(3);
    expect(admitted.active).toBe(false);
    expect(outside.active).toBe(true);
  });

  it('keeps its admitted range snapshot when a listener moves a later drop', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    const admitted = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 2 });
    t.bus.on('drop:collected', () => { admitted.sprite.setPosition(50, 0); });
    expect(t.system.collectNearbyConsumables(10)).toBe(2);
    expect(t.runState.currency).toBe(3);
    expect(admitted.active).toBe(false);
  });

  it('does not chase a new nearby drop spawned by a collection listener', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    let spawned!: Drop;
    t.bus.on('drop:collected', () => { spawned = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 99 }); });
    expect(t.system.collectNearbyConsumables(10)).toBe(1);
    expect(t.runState.currency).toBe(1);
    expect(spawned.active).toBe(true);
    expect(t.collected).toHaveBeenCalledOnce();
  });

  it('skips an admitted object whose original lifetime was collected and reused by a listener', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    const later = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 2 });
    let replacement!: Drop;
    const unsubscribe = t.bus.on('drop:collected', () => {
      unsubscribe();
      t.overlap(null, later.sprite);
      replacement = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 99 });
    });
    expect(t.system.collectNearbyConsumables(10)).toBe(1);
    expect(replacement).toBe(later);
    expect(replacement.active).toBe(true);
    expect(t.runState.currency).toBe(3);
    expect(t.collected).toHaveBeenCalledTimes(2);
  });

  it('cannot recursively collect its current lifetime or release a listener-spawned replacement', async () => {
    const t = await setup();
    const original = t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    let replacement!: Drop;
    const unsubscribe = t.bus.on('drop:collected', () => {
      unsubscribe();
      t.overlap(null, original.sprite);
      replacement = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 99 });
    });
    expect(t.system.collectNearbyConsumables(10)).toBe(1);
    expect(t.collected).toHaveBeenCalledOnce();
    expect(t.runState.currency).toBe(1);
    expect(replacement.active).toBe(true);
    expect(replacement.grant).toMatchObject({ kind: 'scrap', amount: 99 });
  });

  it('counts the consumed drop honestly when a listener destroys the system', async () => {
    const t = await setup();
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 2 });
    t.bus.on('drop:collected', () => t.system.destroy());
    expect(t.system.collectNearbyConsumables(10)).toBe(1);
    expect(t.runState.currency).toBe(1);
    expect(t.collected).toHaveBeenCalledOnce();
  });

  it('finishes the admitted pulse when a collection fact completes the objective', async () => {
    const t = await setup();
    const runtime = createStageRuntime({
      stageId: 'stage:pulse-proof', objective: { definition: { type: 'collect', itemId: 'drop:scrap', count: 1 } },
      encounter: {}, reward: { firstClearScrap: 0, grants: [] },
    } as unknown as ResolvedRunPlan);
    runtime.tick(0, 0);
    t.bus.on('drop:collected', ({ kind, amount }) => runtime.recordCollection(`drop:${kind}`, amount));
    t.system.spawnDrop(1, 0, { kind: 'scrap', amount: 1 });
    t.system.spawnDrop(2, 0, { kind: 'xp', amount: xpToNext(1) });
    const last = t.system.spawnDrop(3, 0, { kind: 'scrap', amount: 2 });
    expect(t.system.collectNearbyConsumables(10)).toBe(3);
    expect(runtime.state.status).toBe('objective-complete');
    expect(t.runState.currency).toBe(3);
    expect(last.active).toBe(false);
    expect(t.runState.status).toBe('paused');
    expect(t.runState.pauseReason).toBe('levelUp');
    expect(t.resumed).not.toHaveBeenCalled();
  });

  it.each(['manual', 'levelUp'] as const)('keeps ordinary overlap pickups blocked during %s pause', async (reason) => {
    const t = await setup();
    pauseRun(t.runState, t.bus, reason);
    const xp = t.system.spawnDrop(1, 0, { kind: 'xp', amount: 5 });
    const scrap = t.system.spawnDrop(2, 0, { kind: 'scrap', amount: 7 });
    t.overlap(null, xp.sprite); t.overlap(null, scrap.sprite);
    expect(t.collected).not.toHaveBeenCalled();
    expect(t.runState.currency).toBe(0);
    expect(t.runState.xp).toBe(0);
    expect(xp.active).toBe(true);
    expect(scrap.active).toBe(true);
    expect(t.resumed).not.toHaveBeenCalled();
  });

  it('keeps terminal-clear settlement global, suppresses level-up events and leaves a full-rack weapon', async () => {
    const t = await setup({ lootTableById: (id) => id === 'clear-cache'
      ? { id, entries: [{ kind: 'scrap', amount: 11, weight: 1 }] } : undefined });
    const definition = t.weapons.weaponById('scrap-pistol-t1')!;
    t.runState.equipped = Array.from({ length: 6 }, () => t.weapons.createWeaponInstance(definition));
    t.system.spawnDrop(500, 0, { kind: 'xp', amount: xpToNext(1) });
    t.system.spawnDrop(500, 0, { kind: 'scrap', amount: 7 });
    t.system.spawnDrop(500, 0, { kind: 'chest', amount: 0, tableId: 'clear-cache' });
    const weapon = t.system.spawnDrop(500, 0, { kind: 'weapon', definitionId: definition.id });
    expect(t.system.settlePendingClearLoot()).toBe(3);
    expect(t.runState.level).toBe(2);
    expect(t.runState.currency).toBe(18);
    expect(t.gained).not.toHaveBeenCalled();
    expect(t.levels).not.toHaveBeenCalled();
    expect(t.upgrades.pendingCount).toBe(0);
    expect(t.runState.status).toBe('active');
    expect(weapon.active).toBe(true);
    expect(weapon.pickupBlocked).toBe(true);
    expect(t.collected.mock.calls.map(([event]) => [event.kind, event.amount])).toEqual([
      ['xp', 5], ['scrap', 7], ['scrap', 11],
    ]);
    expect(t.paused).not.toHaveBeenCalled();
    expect(t.resumed).not.toHaveBeenCalled();
    expect(t.system.settlePendingClearLoot()).toBe(0);
  });
});
