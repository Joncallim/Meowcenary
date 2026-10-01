import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import visuals from '../src/data/gunsmith-part-visuals.json';
import art from '../src/data/visual-art.json';
import { loadGameData, validateGameData, collectGameDataErrors } from '../src/systems/validation';
import { GUNSMITH_CHASSIS, resolveGunsmithPartVisual, resolveGunsmithVisualAssembly, validateGunsmithPartVisuals } from '../src/ui/gunsmithVisualAssembly';
import type { Build, GunsmithState } from '../src/systems/save';
const data = loadGameData();
const parts = data.gunParts!;
const definitions = new Map(parts.map((part) => [part.id, part]));

describe('exact owned Part tier presentation', () => {
  it('production content validation rejects a missing high-tier Part binding before menu launch', () => {
    const source = loadGameData();
    const missing = resolveGunsmithPartVisual(parts[0]!, 5).assemblyArtId!;
    const broken = { ...source, visualArt: { ...source.visualArt,
      bindings: source.visualArt.bindings.filter((binding) => binding.id !== missing) } };
    expect(() => validateGameData(broken)).toThrow(/Unregistered Gunsmith Part visual tier/);
    expect(collectGameDataErrors(broken).some((issue) => issue.message.includes('Unregistered Gunsmith Part visual tier'))).toBe(true);
  });

  it('covers all physical tiers with distinct icon and assembly IDs in two physical resources', () => {
    validateGunsmithPartVisuals(parts, visuals.parts, new Set(art.bindings.map((row) => row.id)));
    const physical = parts.filter((part) => part.slot !== 'trait');
    const tiers = physical.flatMap((part) => [1, 2, 3, 4, 5].map((tier) => resolveGunsmithPartVisual(part, tier)));
    expect(physical).toHaveLength(10);
    expect(new Set(tiers.map((row) => row.iconArtId)).size).toBe(50);
    expect(new Set(tiers.map((row) => row.assemblyArtId)).size).toBe(50);
    const bindings = art.bindings.filter((row) => row.resourceId.startsWith('resource:gunsmith-tier-'));
    expect(bindings).toHaveLength(106);
    expect(new Set(bindings.map((row) => row.resourceId)).size).toBe(2);
  });

  it('resolves each exact fitted instance tier and one explicit chassis in current and candidate composition', () => {
    for (const chassis of GUNSMITH_CHASSIS) for (const definition of parts) for (const tier of [1, 2, 3, 4, 5]) {
      const instanceId = 'owned:part';
      const build: Build = { id: 'build:test', name: 'Test', baseWeaponFamily: chassis.familyId,
        fitted: definition.slot === 'trait' ? {} : { [definition.slot]: instanceId },
        traitParts: definition.slot === 'trait' ? [instanceId] : [] };
      const state: GunsmithState = { builds: [build], parts: { [instanceId]: { partId: definition.id, tier, infusedTraits: [] } } };
      const current = resolveGunsmithVisualAssembly(build, state, definitions)!;
      const candidate = resolveGunsmithVisualAssembly(structuredClone(build), structuredClone(state), definitions)!;
      expect(current).toEqual(candidate);
      expect(current.baseArtId).toBe(chassis.baseArtId);
      const expected = resolveGunsmithPartVisual(definition, tier);
      if (definition.slot === 'trait') expect(current.traitCores[0]?.iconArtId).toBe(expected.iconArtId);
      else expect(current.layers).toEqual([{ instanceId, slot: definition.slot, tier, artId: expected.assemblyArtId }]);
      expect(Object.isFrozen(current)).toBe(true);
    }
    expect(new Set(GUNSMITH_CHASSIS.map((row) => row.baseArtId)).size).toBe(3);
    expect(GUNSMITH_CHASSIS.every((row) => !row.iconArtId.startsWith('weapon-icon:'))).toBe(true);
  });

  it('rejects missing, stale, aliased, duplicate and unregistered tier families without fallback', () => {
    const missing = structuredClone(visuals.parts); missing[0]!.tiers.pop();
    expect(() => validateGunsmithPartVisuals(parts, missing)).toThrow(/Missing or stale/);
    const stale = structuredClone(visuals.parts); stale[0]!.tiers[4]!.tier = 6;
    expect(() => validateGunsmithPartVisuals(parts, stale)).toThrow(/Missing or stale/);
    const invariant = structuredClone(visuals.parts); invariant.find((row) => row.tierInvariant)!.tiers[1]!.iconArtId = 'trait-icon:other';
    expect(() => validateGunsmithPartVisuals(parts, invariant)).toThrow(/Tier-invariant/);
    const alias = structuredClone(visuals.parts); alias[0]!.tiers[1]!.iconArtId = alias[0]!.tiers[0]!.iconArtId;
    expect(() => validateGunsmithPartVisuals(parts, alias)).toThrow(/Aliased/);
    expect(() => validateGunsmithPartVisuals(parts, [...visuals.parts, visuals.parts[0]!])).toThrow(/exactly once/);
    expect(() => validateGunsmithPartVisuals(parts, visuals.parts, new Set())).toThrow(/Unregistered/);
    expect(() => resolveGunsmithPartVisual(parts[0]!, 6)).toThrow(/Missing/);
    expect(() => resolveGunsmithPartVisual({ id: 'part:unknown' }, 1)).toThrow(/Missing/);
  });

  it('accepts an N+1 physical Part via presentation data without a resolver branch', () => {
    const definition = { ...parts[0]!, id: 'part:future-receiver' };
    const family = { partId: definition.id, tierInvariant: false, tiers: [1, 2, 3, 4, 5].map((tier) => ({ tier,
      iconArtId: `gun-part-icon:future-receiver:t${tier}`, assemblyArtId: `gun-build-part:future-receiver:t${tier}` })) };
    const catalog = [...visuals.parts, family];
    expect(() => validateGunsmithPartVisuals([...parts, definition], catalog)).not.toThrow();
    expect(resolveGunsmithPartVisual(definition, 4, catalog)).toEqual(family.tiers[3]);
  });

  it('verifies pinned native masters, every PNG/PXO frame, full source coverage and deterministic parity', () => {
    expect(() => execFileSync('python3', ['docs/art/scripts/build-gunsmith-tier-art.py', '--check'])).not.toThrow();
    expect(() => execFileSync('python3', ['docs/art/scripts/build-gunsmith-tier-art.test.py'])).not.toThrow();
  }, 60_000);
});
