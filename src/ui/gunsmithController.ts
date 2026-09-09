import type { GameContext, PersistenceUpdate } from '../engine/context';
import {
  equipPart,
  infuseTrait,
  isSlotCompatible,
  mergeParts,
  unequipPart,
  MAX_TRAIT_CORES_PER_BUILD,
  type OwnedPart,
  type WeaponBuild,
} from '../gameplay/gunsmith';
import { getAllWeaponFamilies, isValidFamily } from '../gameplay/weaponFamilies';
import { scaleModifierByTier, type ModifierSpec } from '../gameplay/stats';
import { DataPartRegistry } from '../systems/parts';
import type { Build, GunsmithState, PartInstance } from '../systems/save';

export interface GunsmithPartView {
  readonly instanceId: string;
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  readonly tier: number;
  readonly traits: readonly string[];
  readonly compatible: boolean;
  readonly fitted: boolean;
  /** Player-facing pre-commit delta for the selected build. */
  readonly comparisonSummary: string;
  readonly iconArtId: string;
}

export interface GunsmithSnapshot {
  readonly selectedBuildId?: string;
  readonly builds: readonly Build[];
  /** Data-owned chassis choices.  Menu code must not infer families from the
   * builds which happen to exist in a particular save. */
  readonly families: readonly GunsmithFamilyView[];
  readonly parts: readonly GunsmithPartView[];
}

export interface GunsmithFamilyView {
  readonly id: string;
  readonly name: string;
  readonly selected: boolean;
  /** An existing build can be selected; an absent value means creating this
   * registered family is the appropriate command. */
  readonly existingBuildId?: string;
}

export type GunsmithCommandResult =
  | { readonly ok: true; readonly persisted: boolean }
  | { readonly ok: false; readonly reason: string };

/** UI boundary for persistent weapon engineering.  It only adapts immutable
 * Save V3 records to pure commands; all eligibility stays in gameplay. */
export class GunsmithController {
  private readonly registry: DataPartRegistry;

  constructor(private readonly context: GameContext) {
    this.registry = new DataPartRegistry({ gunParts: context.data.gunParts ?? [] });
  }

  snapshot(): GunsmithSnapshot {
    const state = this.context.saveData.gunsmith;
    const selected = state.builds.find((build) => build.id === state.selectedBuildId);
    const buildsByFamily = new Map(state.builds.map((build) => [build.baseWeaponFamily, build] as const));
    return Object.freeze({
      selectedBuildId: selected?.id,
      builds: Object.freeze([...state.builds]),
      families: Object.freeze(getAllWeaponFamilies().map((family) => {
        const build = buildsByFamily.get(family.id);
        return Object.freeze({
          id: family.id,
          name: family.name,
          selected: build !== undefined && build.id === selected?.id,
          existingBuildId: build?.id,
        });
      })),
      parts: Object.freeze(Object.entries(state.parts).flatMap(([instanceId, stored]) => {
        const definition = this.registry.partById(stored.partId);
        if (!definition) return [];
        return [Object.freeze({
          instanceId, partId: stored.partId, name: definition.name, slot: definition.slot,
          tier: stored.tier, traits: Object.freeze([...definition.traits, ...stored.infusedTraits]),
          iconArtId: definition.presentation.iconArtId,
          compatible: selected === undefined || (isSlotCompatible(selected.baseWeaponFamily, definition.slot)
            && (definition.slot !== 'trait' || selected.traitParts.length < MAX_TRAIT_CORES_PER_BUILD)),
          fitted: selected !== undefined && (Object.values(selected.fitted).includes(instanceId) || selected.traitParts.includes(instanceId)),
          comparisonSummary: selected === undefined
            ? 'Choose a chassis to preview this part.'
            : (Object.values(selected.fitted).includes(instanceId) || selected.traitParts.includes(instanceId))
              ? `Fitted to ${selected.baseWeaponFamily}; select to unequip.`
            : !isSlotCompatible(selected.baseWeaponFamily, definition.slot)
              ? `Cannot fit ${selected.baseWeaponFamily}.`
              : definition.slot === 'trait' && selected.traitParts.length >= MAX_TRAIT_CORES_PER_BUILD
                ? 'Trait capacity full — unequip a trait first.'
                : (definition.slot !== 'trait' && selected.fitted[definition.slot] !== undefined)
                ? 'Unequip the current part in this slot first.'
                : `Adds ${definition.effects.map((effect) => describePartEffect(effect, stored.tier)).join(', ') || 'its trait behavior'}${stored.infusedTraits.length ? `; infused: ${stored.infusedTraits.join(', ')}` : ''} to ${selected.baseWeaponFamily}.`,
        })];
      })),
    });
  }

  createBuild(baseWeaponFamily: string, name = 'Main Weapon'): GunsmithCommandResult {
    if (!isValidFamily(baseWeaponFamily)) return { ok: false, reason: 'unknown-family' };
    const id = `build:${baseWeaponFamily}`;
    if (this.context.saveData.gunsmith.builds.some((build) => build.id === id)) return this.selectBuild(id);
    const update = this.context.updateGunsmith((state) => ({
      ...state,
      builds: [...state.builds, { id, name, baseWeaponFamily, fitted: {}, traitParts: [] }],
      selectedBuildId: id,
    }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  selectBuild(buildId: string): GunsmithCommandResult {
    if (!this.context.saveData.gunsmith.builds.some((build) => build.id === buildId)) return { ok: false, reason: 'unknown-build' };
    const update = this.context.updateGunsmith((state) => ({ ...state, selectedBuildId: buildId }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  fitPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    const part = ownedPart(state, instanceId);
    if (!build || !part) return { ok: false, reason: build ? 'unknown-part' : 'no-selected-build' };
    const result = equipPart(build, part, this.registry.asMap());
    if (!result.ok) return result;
    return this.persistBuild(state, result.build);
  }

  unequipPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    if (!build) return { ok: false, reason: 'no-selected-build' };
    const result = unequipPart(build, instanceId);
    if (!result.ok) return result;
    return this.persistBuild(state, result.build);
  }

  merge(firstInstanceId: string, secondInstanceId: string): GunsmithCommandResult {
    let failure: string | undefined;
    let collision = false;
    const update = this.context.updateGunsmith((current) => ({
      // GameContext re-resolves current state immediately before the one save.
      // Inputs are stable IDs, so stale/consumed state cannot be overwritten.
      ...((): GunsmithState => {
        const first = ownedPart(current, firstInstanceId);
        const second = ownedPart(current, secondInstanceId);
        if (!first || !second) { failure = 'missing-parts'; return current; }
        const result = mergeParts(first, second, this.registry.asMap());
        if (!result.ok) { failure = result.reason; return current; }
        // A deterministic output collision is an explicit no-op, never a suffix.
        if (Object.hasOwn(current.parts, result.output.instanceId)) { collision = true; return current; }
        return {
      ...current,
      parts: Object.fromEntries([
        ...Object.entries(current.parts).filter(([id]) => !result.consumed.includes(id)),
        [result.output.instanceId, { partId: result.output.partId, tier: result.output.tier, infusedTraits: result.output.infusedTraits }],
      ]),
      builds: removePartReferences(current.builds, result.consumed),
        };
      })(),
    }));
    if (failure) return { ok: false, reason: failure };
    if (collision) return { ok: false, reason: 'output-collision' };
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  infuse(targetInstanceId: string, traitInstanceId: string): GunsmithCommandResult {
    let failure: string | undefined;
    const update = this.context.updateGunsmith((current) => ({
      ...((): GunsmithState => {
        const target = ownedPart(current, targetInstanceId);
        const trait = ownedPart(current, traitInstanceId);
        if (!target || !trait || targetInstanceId === traitInstanceId) { failure = 'unknown-part'; return current; }
        const result = infuseTrait(target, trait, this.registry.asMap());
        if (!result.ok) { failure = result.reason; return current; }
        return {
      ...current,
      parts: Object.fromEntries(Object.entries(current.parts)
        .filter(([id]) => id !== traitInstanceId)
        .map(([id, part]) => [id, id === targetInstanceId
          ? { ...part, infusedTraits: result.output.infusedTraits }
          : part])),
      builds: removePartReferences(current.builds, [traitInstanceId]),
        };
      })(),
    }));
    if (failure) return { ok: false, reason: failure };
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  private persistBuild(state: GunsmithState, build: WeaponBuild): GunsmithCommandResult {
    const update: PersistenceUpdate<GunsmithState> = this.context.updateGunsmith((current) => ({
      ...current,
      builds: current.builds.map((candidate) => candidate.id === build.id ? build : candidate),
    }));
    void state;
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }
}

function describePartEffect(effect: ModifierSpec, tier: number): string {
  const actual = scaleModifierByTier(effect, Math.max(1, tier));
  const value = effect.op === 'mult' ? `${Math.round((actual - 1) * 100)}%` : `${actual >= 0 ? '+' : ''}${actual}`;
  return `${effect.stat} ${value}`;
}

function selectedBuild(state: GunsmithState): WeaponBuild | undefined {
  const build = state.builds.find((candidate) => candidate.id === state.selectedBuildId);
  return build === undefined ? undefined : { ...build, fitted: { ...build.fitted }, traitParts: [...build.traitParts] };
}

function ownedPart(state: GunsmithState, instanceId: string): OwnedPart | undefined {
  const part: PartInstance | undefined = state.parts[instanceId];
  return part === undefined ? undefined : { instanceId, ...part } as OwnedPart;
}

function removePartReferences(builds: readonly Build[], instanceIds: readonly string[]): readonly Build[] {
  const removed = new Set(instanceIds);
  return builds.map((build) => ({
    ...build,
    fitted: Object.fromEntries(Object.entries(build.fitted).filter(([, id]) => id !== undefined && !removed.has(id))),
    traitParts: build.traitParts.filter((id) => !removed.has(id)),
  }));
}
