import { describe, expect, it } from 'vitest';
import catalog from '../src/data/abilities.json';
import { isPersistentAbilityEffect, type AbilityDefinition } from '../src/gameplay/abilities';
import { resolveAbilityEffectPresentation } from '../src/presentation/abilityEffectPresentation';
import { collectAbilityFxArtIds, resolveAbilityFxPlan, selectAbilityFxFrame,
  type AbilityFxDefinition, type AbilityFxArtBinding, type AbilityFxArtLookup, type AbilityFxAtlas,
  type AbilityFxAtlasFrame, type AbilityFxRecipe } from '../src/presentation/abilityFx';
import type { VisualTextureResource } from '../src/systems/types';

// Synthetic metadata only: no production art, runtime catalog, or visual-quality claim.
function withFixtureRecipe(original: AbilityDefinition): AbilityFxDefinition {
  const definition = structuredClone(original);
  const slug = definition.id.replace(/^ability:/, '');
  const sequence = (phase: string) => ({ frameArtIds: [0, 1].map(index => `effect:${slug}:${phase}-${index}`), frameMs: 200, reducedMotionFrame: 1 });
  return { ...definition, presentation: { ...definition.presentation, fx: {
    activation: sequence('activation'), ...(isPersistentAbilityEffect(definition.effect) ? { sustained: sequence('sustained') } : {}),
  } } };
}
const definitions = (catalog as AbilityDefinition[]).map(withFixtureRecipe);
const ninth: AbilityFxDefinition = withFixtureRecipe({ ...(catalog as AbilityDefinition[])[1], id: 'ability:fixture-tradeoff', name: 'Fixture Tradeoff',
  durationMs: 1750, effect: { kind: 'stat-burst', modifiers: [
    { stat: 'damage', op: 'mult', value: 1.2, sourceId: 'ability:fixture-tradeoff', scope: { kind: 'weapon-family', family: 'shotgun' } },
    { stat: 'moveSpeed', op: 'mult', value: .8, sourceId: 'ability:fixture-tradeoff' },
  ] }, presentation: { cue: 'speed-trail', color: '#ffffff', visualRadius: 31, iconArtId: 'ability-icon:fixture-tradeoff' } });
function frame(x = 0): AbilityFxAtlasFrame {
  return { frame: { x, y: 0, w: 64, h: 64 }, sourceSize: { w: 64, h: 64 }, spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
    trimmed: false, rotated: false, pivot: { x: .5, y: .5 } };
}
function fixture(rows: readonly AbilityFxDefinition[] = definitions) {
  const bindings = new Map<string, AbilityFxArtBinding>(), resources = new Map<string, VisualTextureResource>(), atlases = new Map<string, AbilityFxAtlas>();
  for (const suffix of ['a', 'b']) {
    const id = `resource:fixture-fx-${suffix}`, textureKey = `fixture-fx-${suffix}`;
    resources.set(id, { id, textureKey, sampling: 'nearest', load: { type: 'atlas', imageUrl: `/${textureKey}.png`, dataUrl: `/${textureKey}.json` } });
    atlases.set(id, { width: 1024, height: 1024, frames: {} });
  }
  for (const row of rows) for (const phase of ['activation', 'sustained'] as const) {
    for (const id of row.presentation.fx[phase]?.frameArtIds ?? []) {
      const resourceId = `resource:fixture-fx-${phase === 'activation' ? 'a' : 'b'}`, resource = resources.get(resourceId)!;
      bindings.set(id, { id, kind: 'effect', resourceId, frameKey: id, required: true, textureKey: resource.textureKey, url: resource.load.imageUrl,
        sampling: 'nearest', load: { type: 'atlas' }, display: { width: 64, height: 64 } });
      const atlas = atlases.get(resourceId)!;
      atlases.set(resourceId, { ...atlas, frames: { ...atlas.frames, [id]: frame() } });
    }
  }
  const lookup: AbilityFxArtLookup = { bindingById: id => bindings.get(id), resourceById: id => resources.get(id), atlasByResourceId: id => atlases.get(id) };
  return { bindings, resources, atlases, lookup };
}
function recipe(definition: AbilityFxDefinition, fx: unknown): AbilityFxDefinition {
  return { ...definition, presentation: { ...definition.presentation, fx: fx as AbilityFxRecipe } };
}
const instant = definitions[0], sustained = definitions[1];

for (const definition of [...definitions, ninth]) it(`resolves nonshipping ${definition.id} through generic mechanic and art lookup`, () => {
  const f = fixture([...definitions, ninth]), before = JSON.stringify(definition), plan = resolveAbilityFxPlan(definition, f.lookup);
  expect(plan.mechanicKind).toBe(definition.effect.kind); expect(plan.cue).toBe(definition.presentation.cue);
  expect(plan.explanation).toEqual(resolveAbilityEffectPresentation(definition));
  expect(plan.persistent).toBe(isPersistentAbilityEffect(definition.effect));
  expect(plan.activation.frames.map(row => row.artId)).toEqual(definition.presentation.fx.activation.frameArtIds);
  expect(plan.sustained?.frames.map(row => row.artId)).toEqual(definition.presentation.fx.sustained?.frameArtIds);
  expect(plan.pages).toHaveLength(plan.persistent ? 2 : 1);
  expect(plan.textureBytes).toBe((plan.persistent ? 2 : 1) * 1024 * 1024 * 4);
  expect(JSON.stringify(definition)).toBe(before);
  expect(plan).not.toHaveProperty('definition'); expect(plan).not.toHaveProperty('entities');
});

describe('strict recipe grammar and cosmetic timing', () => {
  it('rejects the unchanged production catalog at this new required-FX boundary', () => {
    const legacy = (catalog as AbilityDefinition[])[0];
    // @ts-expect-error FX is required at this boundary; shipping definitions remain unchanged.
    expect(() => resolveAbilityFxPlan(legacy, fixture().lookup)).toThrow(/fx/);
  });
  const bad: Array<[string, unknown]> = [
    ['missing activation', {}], ['unknown recipe field', { ...instant.presentation.fx, radius: 900 }],
    ['inherited activation', Object.create(instant.presentation.fx)],
    ['symbol recipe field', { ...instant.presentation.fx, [Symbol('unknown')]: 1 }],
    ['sparse frames', { activation: { ...instant.presentation.fx.activation, frameArtIds: Array(2) } }],
    ['unknown sequence field', { activation: { ...instant.presentation.fx.activation, cooldownMs: 1 } }],
    ['empty sequence', { activation: { ...instant.presentation.fx.activation, frameArtIds: [] } }],
    ['nine frames', { activation: { ...instant.presentation.fx.activation, frameArtIds: Array(9).fill('effect:fixture:activation-0') } }],
    ['invalid ID', { activation: { ...instant.presentation.fx.activation, frameArtIds: ['ability-icon:fixture'] } }],
    ['blank ID', { activation: { ...instant.presentation.fx.activation, frameArtIds: [' '] } }],
    ['fractional frame time', { activation: { ...instant.presentation.fx.activation, frameMs: 200.5 } }],
    ['nonfinite frame time', { activation: { ...instant.presentation.fx.activation, frameMs: Infinity } }],
    ['activation below 300ms', { activation: { ...instant.presentation.fx.activation, frameMs: 149 } }],
    ['activation above 1000ms', { activation: { ...instant.presentation.fx.activation, frameMs: 501 } }],
    ['negative reduced index', { activation: { ...instant.presentation.fx.activation, reducedMotionFrame: -1 } }],
    ['fractional reduced index', { activation: { ...instant.presentation.fx.activation, reducedMotionFrame: .5 } }],
    ['out of range reduced index', { activation: { ...instant.presentation.fx.activation, reducedMotionFrame: 2 } }],
    ['instant sustained recipe', { ...instant.presentation.fx, sustained: instant.presentation.fx.activation }],
  ];
  for (const [name, value] of bad) it(`rejects ${name} before collecting references`, () => {
    expect(() => collectAbilityFxArtIds(recipe(instant, value))).toThrow(/Ability FX/);
  });
  it('requires sustained only for the existing persistent effect kinds', () => {
    for (const row of definitions.filter(d => isPersistentAbilityEffect(d.effect))) {
      expect(() => collectAbilityFxArtIds(recipe(row, { activation: row.presentation.fx.activation }))).toThrow(/sustained/);
    }
    for (const frameMs of [24, 501]) expect(() => collectAbilityFxArtIds(recipe(sustained, {
      ...sustained.presentation.fx, sustained: { ...sustained.presentation.fx.sustained!, frameMs },
    }))).toThrow(/sustained/);
  });
  it('accepts exact timing boundaries and static frames; deduplicates without changing sequence order', () => {
    const id = instant.presentation.fx.activation.frameArtIds[0];
    for (const frameMs of [300, 1000]) expect(collectAbilityFxArtIds(recipe(instant, {
      activation: { frameArtIds: [id], frameMs, reducedMotionFrame: 0 },
    }))).toEqual([id]);
    for (const frameMs of [50, 1000]) expect(collectAbilityFxArtIds(recipe(sustained, {
      activation: { frameArtIds: [id], frameMs: 300, reducedMotionFrame: 0 },
      sustained: { frameArtIds: [id], frameMs, reducedMotionFrame: 0 },
    }))).toEqual([id]);
    const refs = collectAbilityFxArtIds(recipe(sustained, {
      activation: { frameArtIds: [id, id], frameMs: 200, reducedMotionFrame: 1 },
      sustained: { frameArtIds: [sustained.presentation.fx.sustained!.frameArtIds[0], id], frameMs: 50, reducedMotionFrame: 1 },
    }));
    expect(refs).toEqual([id, sustained.presentation.fx.sustained!.frameArtIds[0]]); expect(Object.isFrozen(refs)).toBe(true);
  });
});

describe('required physical frame and bounded page closure', () => {
  const badBindings: Array<[string, Partial<AbilityFxArtBinding>]> = [
    ['wrong kind', { kind: 'icon' }], ['optional binding', { required: false }], ['unnamed frame', { frameKey: undefined }],
    ['mismatched frame', { frameKey: 'effect:other:activation-0' }], ['linear sampling', { sampling: 'linear' }],
    ['image instead of atlas', { load: { type: 'image' } }], ['autoplay clips', { clips: { idle: { start: 0, end: 1, frameRate: 10, repeat: -1 } } }],
    ['wrong physical texture', { textureKey: 'other-texture' }], ['wrong image URL', { url: '/other.png' }],
  ];
  for (const [name, patch] of badBindings) it(`rejects ${name}`, () => {
    const f = fixture(), id = instant.presentation.fx.activation.frameArtIds[0]; f.bindings.set(id, { ...f.bindings.get(id)!, ...patch });
    expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/Ability FX/);
  });
  for (const missing of ['binding', 'resource', 'atlas', 'named frame'] as const) it(`rejects missing ${missing}`, () => {
    const f = fixture(), id = instant.presentation.fx.activation.frameArtIds[0], binding = f.bindings.get(id)!;
    if (missing === 'binding') f.bindings.delete(id);
    else if (missing === 'resource') f.resources.delete(binding.resourceId!);
    else if (missing === 'atlas') f.atlases.delete(binding.resourceId!);
    else f.atlases.set(binding.resourceId!, { ...f.atlases.get(binding.resourceId!)!, frames: {} });
    expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/Ability FX/);
  });
  const badFrames: Array<[string, Partial<AbilityFxAtlasFrame>]> = [
    ['rotation', { rotated: true }], ['trimming', { trimmed: true }], ['off-center pivot', { pivot: { x: 0, y: .5 } }],
    ['oversized native frame', { sourceSize: { w: 129, h: 64 } }], ['unequal native dimensions', { sourceSize: { w: 63, h: 64 } }],
    ['trimmed source rectangle', { spriteSourceSize: { x: 1, y: 0, w: 64, h: 64 } }], ['out of page frame', { frame: { x: 1000, y: 0, w: 64, h: 64 } }],
  ];
  for (const [name, patch] of badFrames) it(`rejects ${name}`, () => {
    const f = fixture(), id = instant.presentation.fx.activation.frameArtIds[0], resourceId = f.bindings.get(id)!.resourceId!, atlas = f.atlases.get(resourceId)!;
    f.atlases.set(resourceId, { ...atlas, frames: { ...atlas.frames, [id]: { ...frame(), ...patch } } });
    expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/Ability FX/);
  });
  it('rejects valid differently sized frames within one sequence', () => {
    const f = fixture(), id = instant.presentation.fx.activation.frameArtIds[1], resourceId = f.bindings.get(id)!.resourceId!, atlas = f.atlases.get(resourceId)!;
    f.atlases.set(resourceId, { ...atlas, frames: { ...atlas.frames, [id]: { ...frame(), frame: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 } } } });
    expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/equal/);
  });
  it('rejects oversized pages and a third selected physical page', () => {
    const f = fixture(), page = f.atlases.get('resource:fixture-fx-a')!;
    f.atlases.set('resource:fixture-fx-a', { ...page, width: 1025 });
    expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/1024/);
    f.atlases.set('resource:fixture-fx-a', page);
    const id = sustained.presentation.fx.sustained!.frameArtIds[1], old = f.bindings.get(id)!, resourceId = 'resource:fixture-fx-c';
    f.resources.set(resourceId, { ...f.resources.get(old.resourceId!)!, id: resourceId, textureKey: 'fixture-fx-c', load: { type: 'atlas', imageUrl: '/fixture-fx-c.png', dataUrl: '/fixture-fx-c.json' } });
    f.atlases.set(resourceId, { ...page, frames: { [id]: frame() } });
    f.bindings.set(id, { ...old, resourceId, textureKey: 'fixture-fx-c', url: '/fixture-fx-c.png' });
    expect(() => resolveAbilityFxPlan(sustained, f.lookup)).toThrow(/two/);
  });
});

describe('copied meaning and pure cosmetic frame selection', () => {
  it('keeps exact area radii and honors the configured self radius as a diameter', () => {
    const f = fixture();
    expect(resolveAbilityFxPlan(definitions[0], f.lookup)).toMatchObject({ geometry: 'self-area', radius: 90 });
    expect(resolveAbilityFxPlan(definitions[5], f.lookup)).toMatchObject({ geometry: 'self-area', radius: 110 });
    expect(resolveAbilityFxPlan(definitions[6], f.lookup)).toMatchObject({ geometry: 'nearby-loot', radius: 160 });
    const heal = resolveAbilityFxPlan(definitions[3], f.lookup);
    expect(heal).toMatchObject({ geometry: 'self', selfDiameter: 84 });
    expect(heal).not.toHaveProperty('radius');
    expect(() => resolveAbilityFxPlan({ ...instant, presentation: { ...instant.presentation, visualRadius: 2 } }, f.lookup)).toThrow(/area/);
  });
  it('freezes independent nested binding copies and signed/scoped explanation without mutating inputs', () => {
    const mutable = structuredClone(ninth), f = fixture([mutable]), plan = resolveAbilityFxPlan(mutable, f.lookup);
    const assertFrozen = (value: unknown): void => { if (value && typeof value === 'object') { expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(assertFrozen); } };
    assertFrozen(plan); expect(Object.isFrozen(mutable)).toBe(false);
    expect(plan.explanation.detail).toBe('Apply +20% damage (shotgun) and -20% movement speed for 1.75s.');
    const binding = f.bindings.get(mutable.presentation.fx.activation.frameArtIds[0])!;
    expect(plan.activation.frames[0].binding).not.toBe(binding); expect(plan.activation.frames[0].binding.display).not.toBe(binding.display);
    (binding.display as { width: number }).width = 999;
    (mutable.presentation as { visualRadius: number }).visualRadius = 999;
    (mutable.presentation.fx.activation.frameArtIds as string[])[0] = 'effect:mutated:activation-0';
    if (mutable.effect.kind !== 'stat-burst') throw new Error('fixture');
    mutable.effect.modifiers[0].value = 10; (mutable.effect.modifiers[0].scope as { family: string }).family = 'smg';
    expect(plan.selfDiameter).toBe(62); expect(plan).not.toHaveProperty('radius');
    expect(plan.activation.frames[0].binding.display.width).toBe(64);
    expect(plan.activation.frames[0].artId).toBe('effect:fixture-tradeoff:activation-0');
    expect(plan.explanation.detail).toContain('+20% damage (shotgun)');
  });
  it('uses cosmetic age only, with exact activation end and independently looping sustain', () => {
    const plan = resolveAbilityFxPlan(sustained, fixture().lookup), sequence = plan.activation;
    expect(sequence.cycleMs).toBe(400); expect(sustained.durationMs).toBe(3500);
    expect(selectAbilityFxFrame(sequence, 0)).toBe(sequence.frames[0]);
    expect(selectAbilityFxFrame(sequence, 199.999)).toBe(sequence.frames[0]);
    expect(selectAbilityFxFrame(sequence, 200)).toBe(sequence.frames[1]);
    expect(selectAbilityFxFrame(sequence, 400)).toBeUndefined();
    expect(selectAbilityFxFrame(sequence, 1, { reducedMotion: true })).toBe(sequence.frames[1]);
    expect(selectAbilityFxFrame(sequence, 400, { reducedMotion: true })).toBeUndefined();
    expect(selectAbilityFxFrame(plan.sustained!, 400, { loop: true })).toBe(plan.sustained!.frames[0]);
    expect(selectAbilityFxFrame(plan.sustained!, 4000, { loop: true, reducedMotion: true })).toBe(plan.sustained!.frames[1]);
    for (const age of [-1, NaN, Infinity]) expect(() => selectAbilityFxFrame(sequence, age)).toThrow(/cosmetic age/);
  });
});


describe('selected-only closure and upper boundaries', () => {
  it('resolves eight frames per phase and sixteen unique references at the 8 MiB cap', () => {
    const many = (phase: string) => ({ frameArtIds: Array.from({ length: 8 }, (_, index) => `effect:fixture-max:${phase}-${index}`), frameMs: 100, reducedMotionFrame: 7 });
    const definition = recipe(sustained, { activation: many('activation'), sustained: many('sustained') });
    expect(collectAbilityFxArtIds(definition)).toHaveLength(16);
    const f = fixture([definition]);
    for (const [resourceId, atlas] of f.atlases) f.atlases.set(resourceId, { ...atlas, frames: Object.fromEntries(Object.keys(atlas.frames).map(id => [id, {
      ...frame(), frame: { x: 0, y: 0, w: 128, h: 128 }, sourceSize: { w: 128, h: 128 }, spriteSourceSize: { x: 0, y: 0, w: 128, h: 128 },
    }])) });
    const plan = resolveAbilityFxPlan(definition, f.lookup);
    expect(plan.textureBytes).toBe(8 * 1024 * 1024); expect(plan.activation.frames).toHaveLength(8);
    expect(plan.sustained!.frames).toHaveLength(8); expect(plan.activation.frames[0]).toMatchObject({ width: 128, height: 128 });
  });
  it('looks up only the selected recipe and deduplicates repeated frame/resource references', () => {
    const id = instant.presentation.fx.activation.frameArtIds[0], definition = recipe(instant, {
      activation: { frameArtIds: [id, id], frameMs: 200, reducedMotionFrame: 1 },
    });
    const f = fixture([...definitions, ninth]), queried: string[] = [];
    f.resources.set('resource:unrelated', { id: 'resource:unrelated', textureKey: 'unrelated', sampling: 'linear', load: { type: 'image', imageUrl: '/unrelated.png' } });
    const plan = resolveAbilityFxPlan(definition, { ...f.lookup, bindingById: key => { queried.push(key); return f.lookup.bindingById(key); } });
    expect(queried).toEqual([id]); expect(plan.pages).toHaveLength(1);
    expect(plan.activation.frames[0]).toBe(plan.activation.frames[1]);
    expect(plan.textureBytes).toBe(4 * 1024 * 1024);
  });
  it('rejects physical resource mismatches and absent atlas URLs', () => {
    for (const patch of [{ sampling: 'linear' as const }, { id: 'resource:wrong' },
      { load: { type: 'atlas' as const, imageUrl: '/fx.png' } }, { load: { type: 'image' as const, imageUrl: '/fx.png' } }]) {
      const f = fixture(), id = 'resource:fixture-fx-a'; f.resources.set(id, { ...f.resources.get(id)!, ...patch });
      expect(() => resolveAbilityFxPlan(instant, f.lookup)).toThrow(/Ability FX/);
    }
  });
  it('copies page facts and rejects nonfinite self diameter without touching mechanical values', () => {
    const f = fixture(), plan = resolveAbilityFxPlan(sustained, f.lookup);
    (f.atlases.get('resource:fixture-fx-a') as { width: number }).width = 1;
    expect(plan.pages[0].width).toBe(1024);
    expect(() => resolveAbilityFxPlan({ ...sustained, presentation: { ...sustained.presentation, visualRadius: Number.MAX_VALUE } }, f.lookup)).toThrow(/diameter/);
  });
});

for (const definition of [...definitions, ninth].filter(row => resolveAbilityEffectPresentation(row).targetKind === 'self')) it(`keeps self styling out of mechanical radius for ${definition.id}`, () => {
  const plan = resolveAbilityFxPlan(definition, fixture([...definitions, ninth]).lookup);
  expect(plan).not.toHaveProperty('radius'); expect(plan.selfDiameter).toBe(2 * definition.presentation.visualRadius!);
});
