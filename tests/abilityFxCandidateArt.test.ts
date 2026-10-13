import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalog from '../src/data/abilities.json';
import { isPersistentAbilityEffect, type AbilityDefinition } from '../src/gameplay/abilities';
import { resolveAbilityEffectPresentation } from '../src/presentation/abilityEffectPresentation';
import { resolveAbilityFxPlan, selectAbilityFxFrame, type AbilityFxArtBinding, type AbilityFxArtLookup,
  type AbilityFxAtlas, type AbilityFxDefinition, type AbilityFxRecipe } from '../src/presentation/abilityFx';
import type { VisualTextureResource } from '../src/systems/types';

// Candidate source integration only. These resources are not registered or shipped.
const candidateRoot = join(import.meta.dirname, '../assets-src/ability-effects/candidates');
const json = <T>(name: string): T => JSON.parse(readFileSync(join(candidateRoot, name), 'utf8')) as T;
type RecipeRow = { abilityId: string; candidateStatus: string; cue: string; fx: AbilityFxRecipe };
type FrameIndex = { candidateStatus: string; frames: Record<string, AbilityFxAtlas['frames'][string] & { page: number }> };
type PageExport = { frames: AbilityFxAtlas['frames']; meta: { image: string; size: { w: number; h: number } } };

function sourceFixture() {
  const recipes = json<RecipeRow[]>('recipes.json');
  const index = json<FrameIndex>('atlas.json');
  const resources = new Map<string, VisualTextureResource>();
  const atlases = new Map<string, AbilityFxAtlas>();
  const bindings = new Map<string, AbilityFxArtBinding>();
  for (const page of new Set(Object.values(index.frames).map(frame => frame.page))) {
    const exported = json<PageExport>(`atlas-${page}.json`);
    const png = readFileSync(join(candidateRoot, exported.meta.image));
    expect(exported.meta.image).toBe(`atlas-${page}.png`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(exported.meta.size).toEqual({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
    const resourceId = `resource:candidate-ability-fx-${page}`, textureKey = `candidate-ability-fx-${page}`;
    const imageUrl = `/nonshipping-candidates/atlas-${page}.png`, dataUrl = `/nonshipping-candidates/atlas-${page}.json`;
    resources.set(resourceId, { id: resourceId, textureKey, sampling: 'nearest', load: { type: 'atlas', imageUrl, dataUrl } });
    atlases.set(resourceId, { width: exported.meta.size.w, height: exported.meta.size.h, frames: exported.frames });
    const pageIds = Object.entries(index.frames).filter(([, frame]) => frame.page === page).map(([id]) => id);
    expect(Object.keys(exported.frames).sort()).toEqual(pageIds.sort());
    for (const id of pageIds) bindings.set(id, { id, kind: 'effect', resourceId, textureKey, url: imageUrl,
      frameKey: id, required: true, sampling: 'nearest', load: { type: 'atlas' }, display: { width: 128, height: 128 } });
  }
  const lookup: AbilityFxArtLookup = { bindingById: id => bindings.get(id), resourceById: id => resources.get(id),
    atlasByResourceId: id => atlases.get(id) };
  return { recipes, index, lookup, atlases };
}

describe('authored candidate exports consume the accepted pure FX contract', () => {
  it('covers the entire current catalog, with no invented mechanical fields', () => {
    const rows = json<RecipeRow[]>('recipes.json');
    expect(rows.map(row => row.abilityId).sort()).toEqual(catalog.map(row => row.id).sort());
    for (const row of rows) {
      expect(row.candidateStatus).toBe('unapproved');
      expect(Object.keys(row).sort()).toEqual(['abilityId', 'candidateStatus', 'cue', 'fx']);
    }
  });

  it('exports explicit centered registration rather than relying on an undocumented adapter default', () => {
    const index = json<FrameIndex>('atlas.json');
    for (const frame of Object.values(index.frames)) expect(frame.pivot).toEqual({ x: .5, y: .5 });
  });

  it('keeps the entire authored package within two physical pages and the texel budget', () => {
    const { atlases } = sourceFixture();
    expect(atlases.size).toBeGreaterThan(0);
    expect(atlases.size).toBeLessThanOrEqual(2);
    expect([...atlases.values()].reduce((sum, page) => sum + page.width * page.height * 4, 0))
      .toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('accepts an additional signed/scoped mechanic with the same prepared art contract', () => {
    const f = sourceFixture();
    const original = (catalog as AbilityDefinition[]).find(row => row.effect.kind === 'stat-burst')!;
    const recipe = f.recipes.find(row => row.abilityId === original.id)!;
    const fixture: AbilityFxDefinition = { ...original, id: 'ability:fixture-source-tradeoff', name: 'Source Tradeoff',
      durationMs: 1750, effect: { kind: 'stat-burst', modifiers: [
        { stat: 'moveSpeed', op: 'mult', value: .8, sourceId: 'ability:fixture-source-tradeoff' },
        { stat: 'damage', op: 'mult', value: 1.2, sourceId: 'ability:fixture-source-tradeoff',
          scope: { kind: 'weapon-family', family: 'shotgun' } },
      ] }, presentation: { ...original.presentation, fx: recipe.fx } };
    const plan = resolveAbilityFxPlan(fixture, f.lookup);
    expect(plan.explanation).toEqual(resolveAbilityEffectPresentation(fixture));
    expect(plan.explanation).not.toEqual(resolveAbilityEffectPresentation(original));
    expect(plan.activation.frames.map(frame => frame.artId)).toEqual(recipe.fx.activation.frameArtIds);
    expect(plan.persistent).toBe(true);
    expect(plan.sustained).toBeDefined();
  });

  for (const original of catalog as AbilityDefinition[]) it(`resolves actual native exports for ${original.id}`, () => {
    const f = sourceFixture(), row = f.recipes.find(candidate => candidate.abilityId === original.id);
    expect(row, 'every shipped mechanic needs a candidate recipe').toBeDefined();
    expect(row!.cue).toBe(original.presentation.cue);
    const definition: AbilityFxDefinition = { ...original, presentation: { ...original.presentation, fx: row!.fx } };
    const before = JSON.stringify(original), plan = resolveAbilityFxPlan(definition, f.lookup);
    expect(JSON.stringify(original)).toBe(before);
    expect(plan.explanation).toEqual(resolveAbilityEffectPresentation(original));
    expect(plan.persistent).toBe(isPersistentAbilityEffect(original.effect));
    expect(plan.pages.length).toBeGreaterThan(0);
    expect(plan.pages.length).toBeLessThanOrEqual(2);
    expect(plan.textureBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    if ('radius' in original.effect) {
      expect(plan.radius).toBe(original.effect.radius);
      expect(plan.selfDiameter).toBeUndefined();
    } else {
      expect(plan.radius).toBeUndefined();
      expect(plan.selfDiameter).toBe(2 * original.presentation.visualRadius!);
    }
    for (const sequence of [plan.activation, ...(plan.sustained ? [plan.sustained] : [])]) {
      expect(selectAbilityFxFrame(sequence, 0)?.artId).toBe(sequence.frames[0].artId);
      expect(selectAbilityFxFrame(sequence, 150, { reducedMotion: true })?.artId)
        .toBe(sequence.frames[sequence.reducedMotionFrame].artId);
      expect(sequence.frames.every(frame => frame.width === 128 && frame.height === 128)).toBe(true);
    }
  });
});
