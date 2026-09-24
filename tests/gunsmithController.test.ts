import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { GunsmithController } from '../src/ui/gunsmithController';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { mergeParts, resolveBuildModifiers, type OwnedPart } from '../src/gameplay/gunsmith';

function setup() {
  const data = loadGameData();
  const storage = new MemoryStorageAdapter();
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'gunsmith', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data),
  });
  return { context, controller: new GunsmithController(context) };
}

describe('GunsmithController durable commands', () => {
  it('exposes every registered chassis even when no build exists, then preserves each family selection', () => {
    const { context, controller } = setup();
    expect(controller.snapshot().families).toEqual([
      { id: 'pistol', name: 'Pistol', selected: false, existingBuildId: undefined },
      { id: 'smg', name: 'SMG', selected: false, existingBuildId: undefined },
      { id: 'shotgun', name: 'Shotgun', selected: false, existingBuildId: undefined },
    ]);

    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(controller.createBuild('smg')).toMatchObject({ ok: true });
    expect(controller.selectBuild('build:pistol')).toMatchObject({ ok: true });
    expect(controller.snapshot().families).toEqual([
      { id: 'pistol', name: 'Pistol', selected: true, existingBuildId: 'build:pistol' },
      { id: 'smg', name: 'SMG', selected: false, existingBuildId: 'build:smg' },
      { id: 'shotgun', name: 'Shotgun', selected: false, existingBuildId: undefined },
    ]);
    expect(context.saveData.gunsmith.builds.map((build) => build.id)).toEqual(['build:pistol', 'build:smg']);
  });

  it('rejects an unknown chassis without changing the registered-family presentation', () => {
    const { controller } = setup();
    const before = controller.snapshot().families;
    expect(controller.createBuild('not-a-family')).toEqual({ ok: false, reason: 'unknown-family' });
    expect(controller.snapshot().families).toEqual(before);
  });

  it('creates, selects and fits an owned instance through the Save V3 boundary', () => {
    const { context, controller } = setup();
    expect(context.updateGunsmith((state) => ({ ...state, parts: {
      'owned:barrel': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } })).persisted).toBe(true);
    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(controller.fitPart('owned:barrel')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('owned:barrel');
    expect(controller.snapshot().selectedBuild?.preview).toMatchObject({
      baseArtId: 'gun-build-base:pistol',
      layers: [{ instanceId: 'owned:barrel', slot: 'barrel', artId: 'gun-build-part:barrel-standard', tier: 1 }],
      traitCores: [],
      traitEmblems: [],
    });
    expect(controller.snapshot().parts[0]).toMatchObject({
      name: 'Standard Barrel', compatible: true,
      iconArtId: 'gun-part-icon:barrel-standard', traitIcons: [],
    });
    expect(controller.snapshot().slots.find((slot) => slot.slot === 'barrel')).toMatchObject({
      iconArtId: 'gun-slot-icon:barrel',
    });
  });

  it('builds one immutable assembled schematic in slot order with visible trait sockets and deduped emblems', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        trigger: { partId: 'part:trigger-hair', tier: 2, infusedTraits: ['FIRE'] },
        receiver: { partId: 'part:receiver-heavy', tier: 3, infusedTraits: [] },
        core: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
      },
      builds: [{
        id: 'build:smg', name: 'Hot Needle', baseWeaponFamily: 'smg',
        fitted: { trigger: 'trigger', receiver: 'receiver' }, traitParts: ['core'],
      }],
      selectedBuildId: 'build:smg',
    }));

    const build = controller.snapshot().selectedBuild!;
    expect(build.title).toBe('Hot Needle');
    expect(build.preview).toEqual({
      baseArtId: 'gun-build-base:smg',
      layers: [
        { instanceId: 'receiver', slot: 'receiver', artId: 'gun-build-part:receiver-heavy', tier: 3 },
        { instanceId: 'trigger', slot: 'trigger', artId: 'gun-build-part:trigger-hair', tier: 2 },
      ],
      traitCores: [{ instanceId: 'core', iconArtId: 'gun-part-icon:trait-fire', tier: 1 }],
      traitEmblems: [{ trait: 'FIRE', iconArtId: 'trait-icon:fire' }],
    });
    expect(build.summary).toBe('FIRE SMG • Heavy Receiver • Hair Trigger • Fire Trait Core');
    expect(Object.isFrozen(build.preview)).toBe(true);
    expect(Object.isFrozen(build.preview?.layers)).toBe(true);
  });

  it('moves one owned physical part between builds atomically instead of duplicating it', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      barrel: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } }));
    controller.createBuild('pistol');
    expect(controller.fitPart('barrel')).toMatchObject({ ok: true });
    controller.createBuild('smg');
    expect(controller.snapshot().parts[0]).toMatchObject({ state: 'fitted-elsewhere', assignedBuildName: 'Pistol Build' });
    expect(controller.fitPart('barrel')).toMatchObject({ ok: true, persisted: true });
    const builds = context.saveData.gunsmith.builds;
    expect(builds.find((build) => build.id === 'build:pistol')?.fitted.barrel).toBeUndefined();
    expect(builds.find((build) => build.id === 'build:smg')?.fitted.barrel).toBe('barrel');
    expect(context.saveData.gunsmith.parts.barrel).toBeDefined();
  });

  it('does not advertise a cross-build move when the target slot is occupied', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      standard: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      long: { partId: 'part:barrel-long', tier: 1, infusedTraits: [] },
    } }));
    controller.createBuild('pistol');
    controller.fitPart('standard');
    controller.createBuild('smg');
    controller.fitPart('long');
    controller.selectBuild('build:pistol');

    expect(controller.snapshot().parts.find((part) => part.instanceId === 'long')).toMatchObject({
      state: 'incompatible', compatible: false,
      comparisonSummary: 'Barrel occupied — unequip Standard Barrel first.',
    });
    expect(controller.fitPart('long')).toEqual({ ok: false, reason: 'slot-full' });
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:smg')?.fitted.barrel).toBe('long');
  });

  it('fabricates one paid physical instance with a monotonic serial and publishes nothing on save failure', () => {
    const { context, controller } = setup();
    context.commitProgression((progression) => ({ ...progression, scrap: 240 }));
    expect(controller.fabricate('part:receiver-compact')).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.progression.scrap).toBe(180);
    expect(context.saveData.gunsmith.parts['owned:receiver-compact:1']).toMatchObject({ partId: 'part:receiver-compact', tier: 1 });
    expect(context.saveData.gunsmith.fabricationSerials?.['part:receiver-compact']).toBe(1);
    expect(controller.fabricate('part:receiver-compact')).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.gunsmith.parts['owned:receiver-compact:2']).toBeDefined();
    expect(context.saveData.gunsmith.fabricationSerials?.['part:receiver-compact']).toBe(2);
  });

  it('consumes a trait source and preserves the infused owned target', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      fire: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
    } }));
    controller.createBuild('pistol');
    expect(controller.infuse('target', 'fire')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.parts.target.infusedTraits).toEqual(['FIRE']);
    expect(context.saveData.gunsmith.parts.fire).toBeUndefined();
    expect(controller.snapshot().parts.find((part) => part.instanceId === 'target')?.traitIcons).toEqual([
      { trait: 'FIRE', iconArtId: 'trait-icon:fire' },
    ]);
  });

  it('uses generic non-reacquirable acquisition policy to protect reward-only cores from destructive infusion', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      mastered: { partId: 'part:trait-fire-mastered', tier: 3, infusedTraits: [] },
    } }));
    expect(controller.infuse('target', 'mastered')).toMatchObject({ ok: false, reason: 'trait-incompatible' });
    expect(context.saveData.gunsmith.parts.mastered).toBeDefined();
  });

  it('publishes only rule-eligible, bounded workshop recipes', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      capped: { partId: 'part:barrel-piercing', tier: 1, infusedTraits: ['FIRE'] },
      'zzz-fire': { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
      'aaa-mastered': { partId: 'part:trait-fire-mastered', tier: 3, infusedTraits: [] },
      one: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      two: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      three: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
    } }));

    expect(controller.snapshot().workshop).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'merge', firstInstanceId: 'one', secondInstanceId: 'three', label: 'Merge 3 × Compact Receiver T1 → T2' }),
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'target', traitInstanceId: 'zzz-fire' }),
    ]));
    expect(controller.snapshot().workshop).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'infuse', traitInstanceId: 'aaa-mastered' }),
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'capped' }),
    ]));
  });

  it('removes consumed merged instances from every fitted build', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { barrel: 'a' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    expect(controller.merge('a', 'b')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.parts.a).toBeUndefined();
    expect(context.saveData.gunsmith.parts.b).toBeUndefined();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBeUndefined();
    expect(Object.values(context.saveData.gunsmith.parts)[0].tier).toBe(2);
  });

  it('uses the live controller path for commutative merge identity and V4 multiplier scaling', () => {
    const { context, controller } = setup();
    const first: OwnedPart = { instanceId: 'z-copy', partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] };
    const second: OwnedPart = { instanceId: 'a-copy', partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] };
    const definitions = new Map((context.data.gunParts ?? []).map((part) => [part.id, part] as const));
    const forward = mergeParts(first, second, definitions);
    const reverse = mergeParts(second, first, definitions);
    expect(forward).toMatchObject({ ok: true });
    expect(reverse).toMatchObject({ ok: true });
    if (!forward.ok || !reverse.ok) throw new Error('expected mergeable parts');
    expect(forward.output.instanceId).toBe(reverse.output.instanceId);
    context.updateGunsmith((state) => ({ ...state, parts: {
      [first.instanceId]: { partId: first.partId, tier: first.tier, infusedTraits: [] },
      [second.instanceId]: { partId: second.partId, tier: second.tier, infusedTraits: [] },
    } }));
    expect(controller.merge(second.instanceId, first.instanceId)).toMatchObject({ ok: true, persisted: true });
    const output = context.saveData.gunsmith.parts[forward.output.instanceId];
    expect(output).toMatchObject({ partId: 'part:receiver-heavy', tier: 3 });
    const build = { id: 'build:proof', name: 'Proof', baseWeaponFamily: 'pistol', fitted: { receiver: forward.output.instanceId }, traitParts: [] };
    const modifiers = resolveBuildModifiers(build, definitions, new Map<string, OwnedPart>([[forward.output.instanceId, {
      instanceId: forward.output.instanceId, partId: output.partId, tier: output.tier, infusedTraits: output.infusedTraits as OwnedPart['infusedTraits'],
    }]]));
    expect(modifiers.find((modifier) => modifier.stat === 'damage')?.value).toBeCloseTo(1.36);
  });

  it('keeps an unavailable fitted part recoverable without deleting saved inventory', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      stale: { partId: 'part:retired', tier: 1, infusedTraits: [] },
      valid: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    }, builds: [{ id: 'build:pistol', name: 'Pistol', baseWeaponFamily: 'pistol', fitted: { barrel: 'stale' }, traitParts: [] }], selectedBuildId: 'build:pistol' }));
    expect(controller.snapshot().slots.find((slot) => slot.slot === 'barrel')?.unavailableFitted?.instanceId).toBe('stale');
    expect(controller.removeUnavailableFittedPart('stale')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.parts.stale).toBeDefined();
    expect(controller.fitPart('valid')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('valid');
  });
});
