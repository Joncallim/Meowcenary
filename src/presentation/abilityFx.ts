/** Nonshipping pure FX foundation. Production recipes and accepted art cut over together. */
import { deepFreeze } from '../engine/freeze';
import { isPersistentAbilityEffect } from '../gameplay/abilities';
import { resolveAbilityEffectPresentation } from './abilityEffectPresentation';
import type { AbilityDefinition, AbilityEffect, AbilityPresentationCue } from '../gameplay/abilities';
import type { ResolvedVisualArtBinding, VisualTextureResource } from '../systems/types';
import type { AbilityEffectPresentation } from './abilityEffectPresentation';

export interface AbilityFxSequence {
  readonly frameArtIds: readonly string[];
  readonly frameMs: number;
  readonly reducedMotionFrame: number;
}
export interface AbilityFxRecipe {
  readonly activation: AbilityFxSequence;
  readonly sustained?: AbilityFxSequence;
}
/** Required only at this new boundary; the existing shipping catalog is unchanged. */
export type AbilityFxDefinition = AbilityDefinition & {
  readonly presentation: AbilityDefinition['presentation'] & { readonly fx: AbilityFxRecipe };
};
/** Temporary narrow contract until the generic art kind gains effect at complete cutover. */
export type AbilityFxArtBinding = Omit<ResolvedVisualArtBinding, 'kind'> & {
  readonly kind: ResolvedVisualArtBinding['kind'] | 'effect';
};
export interface AbilityFxAtlasFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly sourceSize: { readonly w: number; readonly h: number };
  readonly spriteSourceSize: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly rotated: boolean;
  readonly trimmed: boolean;
  readonly pivot: { readonly x: number; readonly y: number };
}
/** Actual physical metadata, not the binding's intended display dimensions. */
export interface AbilityFxAtlas {
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, AbilityFxAtlasFrame>>;
}
export interface AbilityFxArtLookup {
  bindingById(id: string): Readonly<AbilityFxArtBinding> | undefined;
  resourceById(id: string): Readonly<VisualTextureResource> | undefined;
  atlasByResourceId(id: string): Readonly<AbilityFxAtlas> | undefined;
}
export interface ResolvedAbilityFxFrame {
  readonly artId: string;
  readonly binding: Readonly<AbilityFxArtBinding>;
  readonly width: number;
  readonly height: number;
}
export interface ResolvedAbilityFxSequence {
  readonly frames: readonly Readonly<ResolvedAbilityFxFrame>[];
  readonly frameMs: number;
  readonly reducedMotionFrame: number;
  readonly cycleMs: number;
}
export interface AbilityFxPlan {
  readonly mechanicKind: AbilityEffect['kind'];
  readonly cue: AbilityPresentationCue;
  readonly color: string;
  readonly persistent: boolean;
  readonly explanation: Readonly<AbilityEffectPresentation>;
  readonly geometry: AbilityEffectPresentation['targetKind'];
  /** Authoritative mechanical radius for area effects only. */
  readonly radius?: number;
  /** Decorative self footprint; never an area mechanic's radius. */
  readonly selfDiameter?: number;
  readonly activation: Readonly<ResolvedAbilityFxSequence>;
  readonly sustained?: Readonly<ResolvedAbilityFxSequence>;
  readonly pages: readonly Readonly<{ resourceId: string; textureKey: string; width: number; height: number; rgbaBytes: number }>[];
  readonly textureBytes: number;
}
const EFFECT_ART_ID = /^effect:[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?::[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;
function fail(message: string): never { throw new Error(`Ability FX: ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}
function fields(row: Record<string, unknown>, allowed: readonly string[], required: readonly string[], label: string): void {
  for (const key of Reflect.ownKeys(row)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${label} has an unknown field`);
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(row, key)!, 'value')) fail(`${label} fields must be data`);
  }
  if (required.some(key => !Object.hasOwn(row, key))) fail(`${label} is missing a required field`);
}
function positive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${label} must be positive and finite`);
  return value;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return value;
}
function sequence(value: unknown, phase: 'activation' | 'sustained'): Readonly<AbilityFxSequence> {
  const row = object(value, phase);
  fields(row, ['frameArtIds', 'frameMs', 'reducedMotionFrame'], ['frameArtIds', 'frameMs', 'reducedMotionFrame'], phase);
  if (!Array.isArray(row.frameArtIds) || row.frameArtIds.length < 1 || row.frameArtIds.length > 8) fail(`${phase} requires 1–8 frame references`);
  const frameArtIds: string[] = [];
  for (const id of row.frameArtIds) {
    if (typeof id !== 'string' || !EFFECT_ART_ID.test(id)) fail(`${phase} needs valid effect frame IDs`);
    frameArtIds.push(id);
  }
  const frameMs = integer(row.frameMs, 1, 1000, `${phase}.frameMs`);
  const cycleMs = frameMs * frameArtIds.length, minimum = phase === 'activation' ? 300 : 50;
  if (cycleMs < minimum || cycleMs > 1000) fail(`${phase} traversal must take ${minimum}–1000ms`);
  return deepFreeze({ frameArtIds, frameMs, reducedMotionFrame: integer(row.reducedMotionFrame, 0, frameArtIds.length - 1, `${phase}.reducedMotionFrame`) });
}
function recipe(definition: AbilityFxDefinition): Readonly<AbilityFxRecipe> {
  if (!definition.presentation || !Object.hasOwn(definition.presentation, 'fx')) fail('presentation.fx is required');
  const row = object(definition.presentation.fx, 'fx');
  fields(row, ['activation', 'sustained'], ['activation'], 'fx');
  const persistent = isPersistentAbilityEffect(definition.effect);
  if (Object.hasOwn(row, 'sustained') !== persistent) fail('sustained must exist exactly for persistent mechanics');
  const activation = sequence(row.activation, 'activation');
  const sustained = persistent ? sequence(row.sustained, 'sustained') : undefined;
  if (activation.frameArtIds.length + (sustained?.frameArtIds.length ?? 0) > 16) fail('recipe exceeds 16 frame references');
  return deepFreeze({ activation, ...(sustained ? { sustained } : {}) });
}
export function collectAbilityFxArtIds(definition: AbilityFxDefinition): readonly string[] {
  const fx = recipe(definition);
  return Object.freeze([...new Set([...fx.activation.frameArtIds, ...(fx.sustained?.frameArtIds ?? [])])]);
}

function nativeFrame(atlas: AbilityFxAtlas, id: string): Readonly<{ width: number; height: number }> {
  if (!atlas.frames || !Object.hasOwn(atlas.frames, id)) fail(`missing named frame ${id}`);
  const row = object(atlas.frames[id], `${id} frame`);
  const source = object(row.sourceSize, `${id} source size`), rect = object(row.frame, `${id} rectangle`);
  const sprite = object(row.spriteSourceSize, `${id} sprite source`), pivot = object(row.pivot, `${id} pivot`);
  const width = integer(source.w, 1, 128, `${id} native width`), height = integer(source.h, 1, 128, `${id} native height`);
  if (row.rotated !== false || row.trimmed !== false || pivot.x !== .5 || pivot.y !== .5
    || rect.w !== width || rect.h !== height || sprite.x !== 0 || sprite.y !== 0 || sprite.w !== width || sprite.h !== height) {
    fail(`${id} must be untrimmed, unrotated and centered`);
  }
  const x = integer(rect.x, 0, atlas.width, `${id} x`), y = integer(rect.y, 0, atlas.height, `${id} y`);
  if (x + width > atlas.width || y + height > atlas.height) fail(`${id} lies outside its page`);
  return { width, height };
}

export function resolveAbilityFxPlan(definition: AbilityFxDefinition, art: AbilityFxArtLookup): Readonly<AbilityFxPlan> {
  const fx = recipe(definition), explanation = resolveAbilityEffectPresentation(definition);
  const self = explanation.targetKind === 'self', styleRadius = definition.presentation.visualRadius;
  if (!self && styleRadius !== undefined) fail('area effects cannot have decorative visualRadius');
  const radius = self ? undefined : positive(explanation.radius, 'mechanical radius');
  const selfDiameter = self && styleRadius !== undefined ? 2 * positive(styleRadius, 'visualRadius') : undefined;
  if (selfDiameter !== undefined && !Number.isFinite(selfDiameter)) fail('self diameter must be finite');
  const pages = new Map<string, AbilityFxPlan['pages'][number]>(), frames = new Map<string, Readonly<ResolvedAbilityFxFrame>>();
  const resolveFrame = (id: string): Readonly<ResolvedAbilityFxFrame> => {
    const cached = frames.get(id); if (cached) return cached;
    const binding = art.bindingById(id);
    if (!binding || binding.id !== id || binding.kind !== 'effect' || binding.required !== true || binding.load?.type !== 'atlas'
      || binding.frameKey !== id || binding.sampling !== 'nearest' || Object.hasOwn(binding, 'clips')) fail(`${id} needs a required named effect atlas binding without clips`);
    const resourceId = binding.resourceId;
    if (typeof resourceId !== 'string' || !resourceId) fail(`${id} needs a physical resource`);
    const resource = art.resourceById(resourceId), atlas = art.atlasByResourceId(resourceId);
    if (!resource || resource.id !== resourceId || resource.load.type !== 'atlas' || resource.sampling !== 'nearest'
      || !resource.load.dataUrl || !resource.load.imageUrl || !resource.textureKey || binding.textureKey !== resource.textureKey || binding.url !== resource.load.imageUrl) {
      fail(`${id} physical atlas identity or sampling is invalid`);
    }
    if (!atlas) fail(`${id} is missing physical atlas metadata`);
    const width = integer(atlas.width, 1, 1024, `${resourceId} page width`), height = integer(atlas.height, 1, 1024, `${resourceId} page height`);
    if (!pages.has(resourceId)) {
      if (pages.size === 2) fail('selected ability cannot load more than two atlas pages');
      if ([...pages.values()].some(page => page.textureKey === resource.textureKey)) fail('different resources cannot alias one texture key');
      pages.set(resourceId, { resourceId, textureKey: resource.textureKey, width, height, rgbaBytes: width * height * 4 });
    }
    const native = nativeFrame(atlas, id);
    const resolved = deepFreeze({ artId: id, ...native, binding: {
      id, kind: 'effect' as const, resourceId, frameKey: id, required: true, textureKey: resource.textureKey, url: resource.load.imageUrl,
      sampling: 'nearest' as const, load: { type: 'atlas' as const },
      display: { width: positive(binding.display?.width, `${id} display width`), height: positive(binding.display?.height, `${id} display height`) },
    } });
    frames.set(id, resolved); return resolved;
  };
  const resolveSequence = (value: AbilityFxSequence): Readonly<ResolvedAbilityFxSequence> => {
    const resolved = value.frameArtIds.map(resolveFrame), first = resolved[0]!;
    if (resolved.some(frame => frame.width !== first.width || frame.height !== first.height)) fail('frames within one sequence need equal native dimensions');
    return deepFreeze({ frames: resolved, frameMs: value.frameMs, reducedMotionFrame: value.reducedMotionFrame, cycleMs: value.frameMs * resolved.length });
  };
  const activation = resolveSequence(fx.activation), sustained = fx.sustained ? resolveSequence(fx.sustained) : undefined;
  const textureBytes = [...pages.values()].reduce((total, page) => total + page.rgbaBytes, 0);
  if (textureBytes > 8 * 1024 * 1024) fail('selected FX textures exceed the 8 MiB RGBA budget');
  return deepFreeze({ mechanicKind: definition.effect.kind, cue: definition.presentation.cue, color: definition.presentation.color,
    persistent: isPersistentAbilityEffect(definition.effect), explanation, geometry: explanation.targetKind,
    ...(radius === undefined ? {} : { radius }), ...(selfDiameter === undefined ? {} : { selfDiameter }),
    activation, ...(sustained ? { sustained } : {}), pages: [...pages.values()], textureBytes });
}

/** A looping sequence never owns buff expiry; the renderer must gate it by authoritative state. */
export function selectAbilityFxFrame(sequence: ResolvedAbilityFxSequence, cosmeticAgeMs: number,
  options: Readonly<{ reducedMotion?: boolean; loop?: boolean }> = {}): Readonly<ResolvedAbilityFxFrame> | undefined {
  if (!Number.isFinite(cosmeticAgeMs) || cosmeticAgeMs < 0) fail('cosmetic age must be finite and nonnegative');
  if (!options.loop && cosmeticAgeMs >= sequence.cycleMs) return undefined;
  const index = options.reducedMotion ? sequence.reducedMotionFrame : Math.floor((cosmeticAgeMs % sequence.cycleMs) / sequence.frameMs);
  return sequence.frames[index];
}
