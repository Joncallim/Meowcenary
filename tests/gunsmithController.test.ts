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
  it('creates, selects and fits an owned instance through the Save V3 boundary', () => {
    const { context, controller } = setup();
    expect(context.updateGunsmith((state) => ({ ...state, parts: {
      'owned:barrel': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } })).persisted).toBe(true);
    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(controller.fitPart('owned:barrel')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('owned:barrel');
    expect(controller.snapshot().parts[0]).toMatchObject({ name: 'Standard Barrel', compatible: true, iconArtId: 'upgrade-icon:long-barrel' });
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
});
