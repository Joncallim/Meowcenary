import { describe, expect, it, vi } from 'vitest';
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

function setup(configure?: (data: ReturnType<typeof loadGameData>) => void) {
  const data = structuredClone(loadGameData());
  configure?.(data);
  const storage = new MemoryStorageAdapter();
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'gunsmith', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data),
  });
  return { context, storage, controller: new GunsmithController(context) };
}

describe('GunsmithController durable commands', () => {
  it('exposes every registered chassis even when no build exists, then preserves each family selection', () => {
    const { context, controller } = setup();
    expect(controller.snapshot().families).toEqual([
      { id: 'pistol', name: 'Pistol', iconArtId: 'gun-chassis-icon:pistol', previewBaseArtId: 'gun-build-base:pistol', selected: false, existingBuildId: undefined },
      { id: 'smg', name: 'SMG', iconArtId: 'gun-chassis-icon:smg', previewBaseArtId: 'gun-build-base:smg', selected: false, existingBuildId: undefined },
      { id: 'shotgun', name: 'Shotgun', iconArtId: 'gun-chassis-icon:shotgun', previewBaseArtId: 'gun-build-base:shotgun', selected: false, existingBuildId: undefined },
    ]);

    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(controller.createBuild('smg')).toMatchObject({ ok: true });
    expect(controller.selectBuild('build:pistol')).toMatchObject({ ok: true });
    expect(controller.snapshot().families).toEqual([
      { id: 'pistol', name: 'Pistol', iconArtId: 'gun-chassis-icon:pistol', previewBaseArtId: 'gun-build-base:pistol', selected: true, existingBuildId: 'build:pistol' },
      { id: 'smg', name: 'SMG', iconArtId: 'gun-chassis-icon:smg', previewBaseArtId: 'gun-build-base:smg', selected: false, existingBuildId: 'build:smg' },
      { id: 'shotgun', name: 'Shotgun', iconArtId: 'gun-chassis-icon:shotgun', previewBaseArtId: 'gun-build-base:shotgun', selected: false, existingBuildId: undefined },
    ]);
    expect(context.saveData.gunsmith.builds.map((build) => build.id)).toEqual(['build:pistol', 'build:smg']);
  });

  it('previews the real stock starting family without creating an active build', () => {
    const { context, storage, controller } = setup();
    const write = vi.spyOn(storage, 'setItem');
    const before = context.saveData;
    const snapshot = controller.snapshot();
    expect(snapshot.selectedBuild).toBeUndefined();
    expect(snapshot.unconfiguredBuild).toMatchObject({
      familyId: 'pistol', title: 'Stock Pistol',
      preview: { baseArtId: 'gun-build-base:pistol', layers: [], traitCores: [], traitEmblems: [] },
    });
    expect(Object.isFrozen(snapshot.unconfiguredBuild)).toBe(true);
    expect(Object.isFrozen(snapshot.unconfiguredBuild?.preview)).toBe(true);
    expect(context.saveData).toBe(before);
    expect(context.saveData.gunsmith.selectedBuildId).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(controller.createBuild(snapshot.unconfiguredBuild!.familyId)).toMatchObject({ ok: true, persisted: true });
    expect(controller.snapshot().unconfiguredBuild).toBeUndefined();
    expect(controller.snapshot().selectedBuild?.preview).toEqual(snapshot.unconfiguredBuild?.preview);
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
      layers: [{ instanceId: 'owned:barrel', slot: 'barrel', artId: 'gun-build-part:barrel-standard:t1', tier: 1 }],
      traitCores: [],
      traitEmblems: [],
    });
    expect(controller.snapshot().parts[0]).toMatchObject({
      name: 'Standard Barrel', compatible: true,
      iconArtId: 'gun-part-icon:barrel-standard:t1', traitIcons: [],
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
        { instanceId: 'receiver', slot: 'receiver', artId: 'gun-build-part:receiver-heavy:t3', tier: 3 },
        { instanceId: 'trigger', slot: 'trigger', artId: 'gun-build-part:trigger-hair:t2', tier: 2 },
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

  it('replaces the target occupant while atomically moving a physical part from another build', () => {
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
      state: 'fitted-elsewhere', compatible: true,
      comparisonSummary: expect.stringContaining('Move from SMG Build. Current build:'),
    });
    expect(controller.fitPart('long')).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:smg')?.fitted.barrel).toBeUndefined();
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:pistol')?.fitted.barrel).toBe('long');
    expect(context.saveData.gunsmith.parts.standard).toBeDefined();
  });

  it('describes stored and moved occupied-slot replacements with the same displacement and stats as one committed operation', () => {
    for (const moved of [false, true]) {
      const { context, storage, controller } = setup();
      context.updateGunsmith((state) => ({ ...state,
        parts: {
          standard: { partId: 'part:barrel-standard', tier: 2, infusedTraits: [] },
          long: { partId: 'part:barrel-long', tier: 3, infusedTraits: [] },
        },
        builds: [
          { id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { barrel: 'standard' }, traitParts: [] },
          { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: moved ? { barrel: 'long' } : {}, traitParts: [] },
        ], selectedBuildId: 'build:pistol',
      }));
      controller.selectSlot('barrel');
      const before = context.saveData;
      const writes = vi.spyOn(storage, 'setItem');
      const candidate = controller.snapshot().parts.find((part) => part.instanceId === 'long')!;
      expect(candidate.actionLabel).toBe(moved ? 'MOVE FROM SMG BUILD • REPLACE STANDARD BARREL T2' : 'REPLACE STANDARD BARREL T2');
      expect(candidate.displacedInstanceId).toBe('standard');
      expect(candidate.displacementSummary).toBe('Standard Barrel T2 returns to STORED.');
      expect(candidate.comparisonSummary).toContain('Current build:');
      expect(candidate.comparisonSummary).toContain('Range 220 to 305');
      if (moved) expect(candidate.comparisonSummary).toContain('Move from SMG Build.');
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(controller.previewPart('long')).toMatchObject({ ok: true, persisted: false });
      expect(controller.snapshot().candidateComparison?.displacedInstanceId).toBe(candidate.displacedInstanceId);
      expect(context.saveData).toBe(before);
      expect(writes).not.toHaveBeenCalled();
      controller.cancelPreview();
      expect(controller.fitPart('long')).toMatchObject({ ok: true, persisted: true });
      expect(writes).toHaveBeenCalledTimes(1);
      expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('long');
      expect(context.saveData.gunsmith.builds[1].fitted.barrel).toBeUndefined();
      expect(context.saveData.gunsmith.parts.standard).toEqual(before.gunsmith.parts.standard);
      expect(controller.snapshot().parts.find((part) => part.instanceId === 'standard')).toMatchObject({ state: 'owned-unfitted', stateLabel: 'STORED' });
    }
  });

  it('uses the explicitly selected trait socket for row displacement, preview and legacy fit without ejecting the other core', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        mastered: { partId: 'part:trait-fire-mastered', tier: 3, infusedTraits: [] },
        spare: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: {}, traitParts: ['fire', 'mastered'] }],
      selectedBuildId: 'build:pistol',
    }));
    expect(controller.snapshot().parts.find((part) => part.instanceId === 'spare')).toMatchObject({ compatible: false, actionLabel: 'TRAIT CAPACITY FULL' });
    controller.selectTraitSocket('fire');
    const before = context.saveData;
    const candidate = controller.snapshot().parts.find((part) => part.instanceId === 'spare')!;
    expect(candidate).toMatchObject({ compatible: true, actionLabel: 'REPLACE FIRE TRAIT CORE T1', displacedInstanceId: 'fire', displacementSummary: 'Fire Trait Core T1 returns to STORED.' });
    expect(controller.previewPart('spare')).toMatchObject({ ok: true, persisted: false });
    expect(controller.snapshot().candidateComparison?.displacedInstanceId).toBe('fire');
    expect(context.saveData).toBe(before);
    controller.cancelPreview();
    expect(controller.fitPart('spare')).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.gunsmith.builds[0].traitParts).toEqual(['spare', 'mastered']);
    expect(context.saveData.gunsmith.parts.fire).toEqual(before.gunsmith.parts.fire);
  });

  it('rejects a removed explicitly selected trait target rather than silently filling another socket', () => {
    const { context, storage, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        spare: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: {}, traitParts: ['fire'] }],
      selectedBuildId: 'build:pistol',
    }));
    controller.selectTraitSocket('fire');
    context.updateGunsmith((state) => ({ ...state, builds: state.builds.map((build) => ({ ...build, traitParts: [] })) }));
    const before = context.saveData;
    const writes = vi.spyOn(storage, 'setItem');
    expect(controller.fitPart('spare')).toEqual({ ok: false, reason: 'stale-target' });
    expect(context.saveData).toBe(before);
    expect(writes).not.toHaveBeenCalled();
  });

  it('labels unconfigured and incompatible part rows with their blocking fact rather than a fitting action', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: { stock: { partId: 'part:stock-padded', tier: 1, infusedTraits: [] } } }));
    expect(controller.snapshot().parts[0].actionLabel).toBe('CHOOSE A BUILD');
    controller.createBuild('pistol');
    expect(controller.snapshot().parts[0]).toMatchObject({ compatible: false, actionLabel: 'CANNOT FIT PISTOL' });
    expect(controller.snapshot().parts[0].displacedInstanceId).toBeUndefined();
  });

  it('preserves exact current-build and persistent-run stat and trait transitions using bundled comparison copy', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        standard: { partId: 'part:barrel-standard', tier: 2, infusedTraits: [] },
        long: { partId: 'part:barrel-long', tier: 3, infusedTraits: ['FIRE'] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { barrel: 'standard' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    controller.selectSlot('barrel');
    const before = context.saveData;
    const comparison = controller.snapshot().parts.find((part) => part.instanceId === 'long')!.comparisonSummary;
    expect(comparison).toContain('Range 220 to 305');
    expect(comparison).not.toContain('→');
    expect(controller.previewPart('long')).toMatchObject({ ok: true, persisted: false });
    const facts = controller.snapshot().candidateComparison!;
    expect(facts.lines).toContain('Pistol Range 220 to 305');
    expect(facts.lines).toContain('Pistol traits None to FIRE');
    expect(facts.lines.join(' ')).not.toContain('→');
    expect(facts.before.families.find((family) => family.familyId === 'pistol')!.traits).toHaveLength(0);
    expect(facts.after.families.find((family) => family.familyId === 'pistol')!.traits.map((trait) => trait.trait)).toEqual(['FIRE']);
    expect(context.saveData).toBe(before);
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
      expect.objectContaining({ kind: 'merge', ownedCount: 3, label: 'Merge 2 of 3 owned Compact Receiver T1 → T2' }),
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'target', traitInstanceId: 'zzz-fire' }),
    ]));
    expect(controller.snapshot().workshop).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'infuse', traitInstanceId: 'aaa-mastered' }),
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'capped' }),
    ]));
  });

  it('prefers unfitted merge and infusion inputs across every build while staying grouped', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        'a-fitted': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'b-fitted': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'z-spare': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'zz-spare': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'a-fire-fitted': { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        'z-fire-spare': { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        'a-target-fitted': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
        'z-target-spare': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
      },
      builds: [
        { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: { barrel: 'a-fitted', optic: 'a-target-fitted' }, traitParts: ['a-fire-fitted'] },
        { id: 'build:smg', name: 'Sprayer', baseWeaponFamily: 'smg', fitted: { barrel: 'b-fitted' }, traitParts: [] },
      ],
      selectedBuildId: 'build:pistol',
    }));

    const workshop = controller.snapshot().workshop;
    expect(workshop).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'merge', ownedCount: 4 }),
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'z-target-spare', traitInstanceId: 'z-fire-spare' }),
    ]));
    expect(workshop).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'infuse', targetInstanceId: 'a-target-fitted', traitInstanceId: 'z-fire-spare' }),
    ]));
    const merge = workshop.find((recipe) => recipe.kind === 'merge' && recipe.ownedCount === 4)!;
    if (merge.kind !== 'merge') throw new Error('expected merge group');
    expect(controller.beginMerge(merge.groupId)).toMatchObject({ ok: true });
    expect(controller.snapshot().mergeSelection?.choices[0]).toMatchObject({ instanceId: 'z-spare', recommended: true });
    expect(controller.selectMergeInput('z-spare')).toMatchObject({ ok: true });
    expect(controller.snapshot().mergeSelection?.choices[0]).toMatchObject({ instanceId: 'zz-spare', recommended: true });
    expect(controller.selectMergeInput('zz-spare')).toMatchObject({ ok: true });
    expect(controller.confirmWorkshop()).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:pistol')?.fitted.barrel).toBe('a-fitted');
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:smg')?.fitted.barrel).toBe('b-fitted');
  });

  it('keeps identical fitted infusion targets selectable by their build identity', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        'pistol-optic': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
        'smg-optic': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
        fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
      },
      builds: [
        { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: { optic: 'pistol-optic' }, traitParts: [] },
        { id: 'build:smg', name: 'Sprayer', baseWeaponFamily: 'smg', fitted: { optic: 'smg-optic' }, traitParts: [] },
      ], selectedBuildId: 'build:pistol',
    }));

    const infusions = controller.snapshot().workshop.filter((recipe) => recipe.kind === 'infuse');
    expect(infusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetInstanceId: 'pistol-optic', traitInstanceId: 'fire', label: expect.stringContaining('Target Sidearm • Optic') }),
      expect.objectContaining({ targetInstanceId: 'smg-optic', traitInstanceId: 'fire', label: expect.stringContaining('Target Sprayer • Optic') }),
    ]));
  });

  it('offers one-spare merge choices for each fitted copy and preserves the unchosen build', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        spare: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'pistol-barrel': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'smg-barrel': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [
        { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: { barrel: 'pistol-barrel' }, traitParts: [] },
        { id: 'build:smg', name: 'Sprayer', baseWeaponFamily: 'smg', fitted: { barrel: 'smg-barrel' }, traitParts: [] },
      ], selectedBuildId: 'build:pistol',
    }));

    const merge = controller.snapshot().workshop.find((recipe) => recipe.kind === 'merge')!;
    controller.beginMerge(merge.groupId);
    expect(controller.snapshot().mergeSelection?.choices[0]).toMatchObject({ instanceId: 'spare', recommended: true });
    controller.selectMergeInput('spare');
    expect(controller.snapshot().mergeSelection?.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ instanceId: 'pistol-barrel', label: expect.stringContaining('Sidearm • Barrel') }),
      expect.objectContaining({ instanceId: 'smg-barrel', label: expect.stringContaining('Sprayer • Barrel') }),
    ]));
    controller.selectMergeInput('pistol-barrel');
    expect(controller.confirmWorkshop()).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:smg')?.fitted.barrel).toBe('smg-barrel');
    expect(context.saveData.gunsmith.parts['smg-barrel']).toBeDefined();
  });

  it('makes every exact pair reachable for four fitted identical copies without rendering pairs', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }])),
      builds: ['a', 'b', 'c', 'd'].map((id, index) => ({
        id: `build:${index}`, name: `Build ${id.toUpperCase()}`, baseWeaponFamily: index % 2 === 0 ? 'pistol' : 'smg',
        fitted: { barrel: id }, traitParts: [],
      })), selectedBuildId: 'build:0',
    }));
    const group = controller.snapshot().workshop.find((entry) => entry.kind === 'merge')!;
    controller.beginMerge(group.groupId);
    expect(controller.snapshot().mergeSelection?.choices).toHaveLength(4);
    controller.selectMergeInput('a');
    expect(controller.snapshot().mergeSelection?.choices.map((choice) => choice.instanceId)).toEqual(['b', 'c', 'd']);
    controller.selectMergeInput('d');
    expect(controller.snapshot().confirmation?.inputLines).toEqual([
      'Standard Barrel T1 • +10 Range — fitted to Build A • Barrel',
      'Standard Barrel T1 • +10 Range — fitted to Build D • Barrel',
    ]);
  });

  it('keeps every legal cross-variant fitted pair reachable after choosing the first input', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        'fire-a': { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['FIRE'] },
        'fire-b': { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['FIRE'] },
        'explosive-c': { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['EXPLOSIVE'] },
        'explosive-d': { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['EXPLOSIVE'] },
      },
      builds: [
        { id: 'build:a', name: 'A', baseWeaponFamily: 'pistol', fitted: { barrel: 'fire-a' }, traitParts: [] },
        { id: 'build:b', name: 'B', baseWeaponFamily: 'smg', fitted: { barrel: 'fire-b' }, traitParts: [] },
        { id: 'build:c', name: 'C', baseWeaponFamily: 'pistol', fitted: { barrel: 'explosive-c' }, traitParts: [] },
        { id: 'build:d', name: 'D', baseWeaponFamily: 'smg', fitted: { barrel: 'explosive-d' }, traitParts: [] },
      ], selectedBuildId: 'build:a',
    }));
    const group = controller.snapshot().workshop.find((entry) => entry.kind === 'merge')!;
    controller.beginMerge(group.groupId);
    controller.selectMergeInput('fire-a');
    expect(controller.snapshot().mergeSelection?.choices.map((choice) => choice.instanceId)).toEqual([
      'explosive-c', 'explosive-d', 'fire-b',
    ]);
    controller.selectMergeInput('explosive-d');
    expect(controller.snapshot().confirmation?.outputLine).toContain('EXPLOSIVE • FIRE');
  });

  it('names the affected build and slot when a fitted Workshop input must be consumed', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [
        { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: { barrel: 'a' }, traitParts: [] },
        { id: 'build:smg', name: 'Sprayer', baseWeaponFamily: 'smg', fitted: { barrel: 'b' }, traitParts: [] },
      ], selectedBuildId: 'build:pistol',
    }));
    const recipe = controller.snapshot().workshop.find((candidate) => candidate.kind === 'merge')!;
    controller.beginMerge(recipe.groupId);
    controller.selectMergeInput('a');
    controller.selectMergeInput('b');
    expect(controller.snapshot().confirmation?.inputLines).toEqual([
      'Standard Barrel T1 • +10 Range — fitted to Sidearm • Barrel',
      'Standard Barrel T1 • +10 Range — fitted to Sprayer • Barrel',
    ]);
  });

  it('owns an immutable two-step merge confirmation with exact inputs, output and tier-scaled delta', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } }));

    expect(controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'a', secondInstanceId: 'b' })).toMatchObject({ ok: true });
    expect(controller.snapshot().confirmation).toMatchObject({
      kind: 'merge', title: 'Confirm merge', confirmLabel: 'Merge parts',
      inputLines: ['Standard Barrel T1 • +10 Range', 'Standard Barrel T1 • +10 Range'],
      outputLine: 'Standard Barrel T2 • +20 Range',
      mechanicalDelta: ['+10 Range → +20 Range'],
    });
    expect(Object.isFrozen(controller.snapshot().confirmation)).toBe(true);
    expect(context.saveData.gunsmith.parts).toHaveProperty('a');

    expect(controller.confirmWorkshop()).toMatchObject({ ok: true, persisted: true });
    expect(controller.snapshot().confirmation).toBeUndefined();
    expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'no-pending-confirmation' });
    expect(Object.values(context.saveData.gunsmith.parts)).toHaveLength(1);
  });

  it('shows the lossless trait union before confirming a variant merge', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      fire: { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['FIRE'] },
      explosive: { partId: 'part:barrel-standard', tier: 1, infusedTraits: ['EXPLOSIVE'] },
    } }));

    expect(controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'explosive', secondInstanceId: 'fire' })).toMatchObject({ ok: true });
    expect(controller.snapshot().confirmation).toMatchObject({
      inputLines: [
        'Standard Barrel T1 • +10 Range • EXPLOSIVE',
        'Standard Barrel T1 • +10 Range • FIRE',
      ],
      outputLine: 'Standard Barrel T2 • +20 Range • EXPLOSIVE • FIRE',
      mechanicalDelta: ['+10 Range → +20 Range', 'Traits EXPLOSIVE + FIRE → EXPLOSIVE / FIRE'],
    });
  });

  it('owns an exact infusion confirmation and cancel never consumes either input', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      target: { partId: 'part:barrel-standard', tier: 2, infusedTraits: [] },
      fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
    } }));

    expect(controller.requestWorkshop({ kind: 'infuse', targetInstanceId: 'target', traitInstanceId: 'fire' })).toMatchObject({ ok: true });
    expect(controller.snapshot().confirmation).toMatchObject({
      kind: 'infuse', title: 'Confirm infusion', confirmLabel: 'Infuse part',
      inputLines: ['Standard Barrel T2 • +20 Range', 'Fire Trait Core T1 • +2% Damage • FIRE'],
      outputLine: 'Standard Barrel T2 • +20 Range • FIRE',
      mechanicalDelta: ['Traits None → FIRE', 'FIRE adds +15% Damage and burning hits'],
    });
    expect(controller.cancelWorkshop()).toMatchObject({ ok: true });
    expect(controller.snapshot().confirmation).toBeUndefined();
    expect(context.saveData.gunsmith.parts).toHaveProperty('target');
    expect(context.saveData.gunsmith.parts).toHaveProperty('fire');
  });

  it('refuses a confirmation whose stable inputs now imply a different output', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } }));
    controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'a', secondInstanceId: 'b' });
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { ...state.parts.a!, tier: 2 },
      b: { ...state.parts.b!, tier: 2 },
    } }));

    expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'workshop-operation-unavailable' });
    expect(controller.snapshot().confirmation).toBeUndefined();
    expect(context.saveData.gunsmith.parts.a.tier).toBe(2);
    expect(context.saveData.gunsmith.parts.b.tier).toBe(2);
  });

  it('presents every Part definition with authoritative owned, fabricable and reward-only acquisition cues', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: { barrel: { partId: 'part:barrel-standard', tier: 2, infusedTraits: [] } },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { barrel: 'barrel' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    const catalog = controller.snapshot().catalog;
    expect(catalog).toHaveLength(context.data.gunParts!.length);
    expect(catalog.find((part) => part.partId === 'part:barrel-standard')).toMatchObject({
      state: 'fitted', stateLabel: 'EQUIPPED • T2', ownedCount: 1, fabricationCost: 60,
      effectLines: ['+20 Range'], comparisonSummary: 'Current build: Range 220 to 200',
    });
    expect(catalog.find((part) => part.partId === 'part:receiver-compact')).toMatchObject({
      state: 'fabricable', stateLabel: 'FABRICABLE • 60 Scrap', fabricationCost: 60,
      affordable: false, canFabricate: false, fabricationActionLabel: 'Fabricate — 60 Scrap', sourceLabel: 'Fabricate for 60 Scrap',
    });
    expect(catalog.find((part) => part.partId === 'part:underbarrel-grenade')).toMatchObject({
      state: 'reward-only', stateLabel: 'REWARD ONLY', sourceLabel: 'First clear: Cut the Feed',
    });
    expect(catalog.find((part) => part.partId === 'part:trait-fire-mastered')).toMatchObject({
      state: 'reward-only', sourceLabel: 'First clear: Forge Warden',
    });
  });

  it('describes one exact highest-tier instance when a catalog definition has mixed owned tiers', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        weaker: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        strongest: { partId: 'part:barrel-standard', tier: 5, infusedTraits: [] },
      },
      builds: [
        { id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] },
        { id: 'build:smg', name: 'Sidearm', baseWeaponFamily: 'smg', fitted: { barrel: 'weaker' }, traitParts: [] },
        { id: 'build:shotgun', name: 'Scattergun', baseWeaponFamily: 'shotgun', fitted: { barrel: 'strongest' }, traitParts: [] },
      ],
      selectedBuildId: 'build:pistol',
    }));

    expect(controller.snapshot().catalog.find((part) => part.partId === 'part:barrel-standard')).toMatchObject({
      state: 'fitted', stateLabel: 'EQUIPPED • T5', ownedCount: 2,
      effectLines: ['+50 Range'], comparisonSummary: 'Move from Scattergun. Current build: Range 200 to 250',
    });
  });

  it('keeps repeatable fabrication actionable when a fabricable Part is already fitted', () => {
    const { context, controller } = setup();
    context.commitProgression((progression) => ({ ...progression, scrap: 120 }));
    context.updateGunsmith((state) => ({ ...state,
      parts: { existing: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { receiver: 'existing' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    expect(controller.snapshot().catalog.find((part) => part.partId === 'part:receiver-compact')).toMatchObject({
      state: 'fitted', stateLabel: 'EQUIPPED • T1', ownedCount: 1,
      canFabricate: true, fabricationActionLabel: 'Fabricate another — 60 Scrap',
    });
    expect(controller.fabricate('part:receiver-compact')).toMatchObject({ ok: true, persisted: true });
    expect(Object.values(context.saveData.gunsmith.parts).filter((part) => part.partId === 'part:receiver-compact')).toHaveLength(2);
  });

  it('keeps an unmet data-owned fabrication condition visible with player-facing lock copy', () => {
    const { controller } = setup((data) => {
      const definition = data.gunParts!.find((part) => part.id === 'part:receiver-compact')!;
      Object.assign(definition, { unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-02' } });
    });

    expect(controller.snapshot().catalog.find((part) => part.partId === 'part:receiver-compact')).toMatchObject({
      state: 'locked', stateLabel: 'LOCKED', fabricationCost: 60,
      affordable: false, sourceLabel: 'Fabricate for 60 Scrap', lockReason: 'Clear Scrap Run.',
    });
  });

  it('derives actual selected-build before/after summaries from tier-scaled runtime modifiers', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 3, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 2, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    expect(controller.snapshot().parts.find((part) => part.instanceId === 'heavy')?.comparisonSummary)
      .toBe('Current build: Fire interval 792.7ms to 650ms • Damage 10.9 to 8');
    expect(controller.snapshot().parts.find((part) => part.instanceId === 'compact')?.comparisonSummary)
      .toBe('Current build: Fire interval 792.7ms to 560.3ms • Damage 10.9 to 8');
  });

  it('uses production weapon-stat clamps so a zero-spread Pistol never promises fake accuracy', () => {
    const { context, controller } = setup((data) => {
      const optic = data.gunParts!.find((part) => part.id === 'part:optic-red-dot')!;
      Object.assign(optic, { effects: [{ stat: 'spreadDeg', op: 'add', value: -2 }] });
    });
    context.updateGunsmith((state) => ({ ...state,
      parts: { optic: { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] } },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    expect(controller.snapshot().parts.find((part) => part.instanceId === 'optic')?.comparisonSummary)
      .toBe('Current build: No mechanical change');
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
