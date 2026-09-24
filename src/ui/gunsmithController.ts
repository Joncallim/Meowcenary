import type { GameContext, PersistenceUpdate } from '../engine/context';
import {
  assignPartToBuild,
  infuseTrait,
  isSlotCompatible,
  listWorkshopRecipes,
  mergeParts,
  unequipPart,
  MAX_TRAIT_CORES_PER_BUILD,
  PART_SLOTS,
  type BehaviorTrait,
  type OwnedPart,
  type WeaponBuild,
} from '../gameplay/gunsmith';
import { getAllWeaponFamilies, isValidFamily } from '../gameplay/weaponFamilies';
import { DataPartRegistry } from '../systems/parts';
import type { Build, GunsmithState, PartInstance } from '../systems/save';
import { formatGunsmithEffect, gunsmithSlotLabel } from './gunsmithPresentation';
import { createConditionContext } from '../gameplay/conditionEvaluator';
import { resolveAvailabilitySnapshot } from '../gameplay/persistentAvailability';

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
  readonly traitIcons: readonly { readonly trait: string; readonly iconArtId: string }[];
  readonly state: 'fitted-here' | 'owned-unfitted' | 'fitted-elsewhere' | 'incompatible';
  readonly assignedBuildId?: string;
  readonly assignedBuildName?: string;
  readonly effectLines: readonly string[];
  readonly traitLines: readonly string[];
}

export interface GunsmithSlotView {
  readonly slot: string;
  readonly label: string;
  readonly iconArtId: string;
  readonly fitted?: GunsmithPartView;
  /** A persisted fitted reference whose definition is no longer in the
   * catalog. It remains visible so the player can recover the occupied slot. */
  readonly unavailableFitted?: { readonly instanceId: string; readonly label: string };
  readonly candidates: readonly GunsmithPartView[];
}

export interface GunsmithBlueprintView {
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  readonly fabricationCost: number;
  readonly iconArtId: string;
  readonly traitIcons: readonly { readonly trait: string; readonly iconArtId: string }[];
  readonly effectLines: readonly string[];
}

/** Presentation-ready, rule-owned Workshop operation. */
export type GunsmithWorkshopRecipe =
  | { readonly kind: 'merge'; readonly firstInstanceId: string; readonly secondInstanceId: string; readonly label: string }
  | { readonly kind: 'infuse'; readonly targetInstanceId: string; readonly traitInstanceId: string; readonly label: string };

export interface GunsmithBuildPresentation {
  readonly id: string;
  readonly familyId: string;
  readonly title: string;
  readonly status: 'Selected' | 'Configured' | 'Empty';
  readonly activation: 'Active from start' | 'Activates when acquired';
  readonly weaponPreviewIconArtId?: string;
}

export interface GunsmithSnapshot {
  readonly selectedBuildId?: string;
  readonly builds: readonly Build[];
  /** Data-owned chassis choices.  Menu code must not infer families from the
   * builds which happen to exist in a particular save. */
  readonly families: readonly GunsmithFamilyView[];
  readonly parts: readonly GunsmithPartView[];
  readonly selectedBuild?: GunsmithBuildPresentation;
  /** Canonical weapon-first grouping.  The UI never infers slots from IDs. */
  readonly slots: readonly GunsmithSlotView[];
  /** Blueprints are definitions, deliberately distinct from owned instances. */
  readonly blueprints: readonly GunsmithBlueprintView[];
  /** Bounded recipes from the Gunsmith domain; scenes do not reconstruct
   * pair eligibility from save records. */
  readonly workshop: readonly GunsmithWorkshopRecipe[];
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
    const assignments = new Map<string, Build>();
    const traitIconByTrait = new Map<string, string>();
    const slotIconBySlot = new Map<string, string>();
    for (const definition of this.registry.all()) {
      slotIconBySlot.set(definition.slot, definition.presentation.slotIconArtId);
      for (const [trait, iconArtId] of Object.entries(definition.presentation.traitIconArtIds)) {
        if (iconArtId !== undefined) traitIconByTrait.set(trait, iconArtId);
      }
    }
    for (const build of state.builds) {
      for (const instanceId of [...Object.values(build.fitted), ...build.traitParts]) {
        if (instanceId !== undefined && !assignments.has(instanceId)) assignments.set(instanceId, build);
      }
    }
    const parts = Object.freeze(Object.entries(state.parts).flatMap(([instanceId, stored]) => {
      const definition = this.registry.partById(stored.partId);
      if (!definition) return [];
      const assigned = assignments.get(instanceId);
      const fittedHere = selected !== undefined && assigned?.id === selected.id;
      const compatible = selected !== undefined && isSlotCompatible(selected.baseWeaponFamily, definition.slot);
      const capacity = definition.slot !== 'trait' || selected === undefined || selected.traitParts.length < MAX_TRAIT_CORES_PER_BUILD || fittedHere;
      const slotVacant = definition.slot === 'trait' || selected === undefined || selected.fitted[definition.slot] === undefined || fittedHere;
      const traits = Object.freeze([...definition.traits, ...stored.infusedTraits]);
      const view: GunsmithPartView = Object.freeze({
        instanceId, partId: stored.partId, name: definition.name, slot: definition.slot,
        tier: stored.tier, traits,
        iconArtId: definition.presentation.iconArtId,
        traitIcons: Object.freeze(traits.flatMap((trait) => {
          const iconArtId = traitIconByTrait.get(trait);
          return iconArtId === undefined ? [] : [Object.freeze({ trait, iconArtId })];
        })),
        // A cross-build move is only actionable when its destination is
        // genuinely eligible.  Do not advertise "Move from …" for an
        // occupied ordinary slot or full trait capacity: that would promise
        // an operation the domain correctly refuses.
        compatible: selected === undefined || (compatible && capacity && slotVacant),
        fitted: fittedHere,
        state: fittedHere ? 'fitted-here' : !compatible || !capacity || !slotVacant ? 'incompatible' : assigned !== undefined ? 'fitted-elsewhere' : 'owned-unfitted',
        ...(assigned === undefined ? {} : { assignedBuildId: assigned.id, assignedBuildName: assigned.name }),
        effectLines: Object.freeze(definition.effects.map((effect) => formatGunsmithEffect(effect, stored.tier))),
        traitLines: Object.freeze([...definition.traits, ...stored.infusedTraits]),
        comparisonSummary: selected === undefined
          ? 'Choose a build to preview this part.'
          : fittedHere ? `Fitted to ${selected.baseWeaponFamily}; select to unequip.`
            : !compatible ? `Cannot fit ${selected.baseWeaponFamily}.`
              : !capacity ? 'Trait capacity full — unequip a trait first.'
                : !slotVacant ? occupiedSlotMessage(selected, definition.slot, state, this.registry)
                  : assigned !== undefined ? `Move from ${assigned.name}.`
                    : `Fit to ${selected.baseWeaponFamily}.`,
      });
      return [view];
    }));
    const selectedStartFamily = this.selectedStartingFamily();
    const selectedWeaponPreviewIconArtId = selected === undefined ? undefined : this.context.data.weapons
      .find((weapon) => weapon.family === selected.baseWeaponFamily && weapon.mergeTier === 1)?.art.iconId;
    const selectedBuildPresentation = selected === undefined ? undefined : Object.freeze({
      id: selected.id, familyId: selected.baseWeaponFamily, title: `${familyName(selected.baseWeaponFamily)} Build`,
      status: selected.id === state.selectedBuildId ? 'Selected' : (Object.keys(selected.fitted).length + selected.traitParts.length > 0 ? 'Configured' : 'Empty'),
      activation: selected.baseWeaponFamily === selectedStartFamily ? 'Active from start' : 'Activates when acquired',
      ...(selectedWeaponPreviewIconArtId === undefined ? {} : { weaponPreviewIconArtId: selectedWeaponPreviewIconArtId }),
    } satisfies GunsmithBuildPresentation);
    const slots = selected === undefined ? [] : PART_SLOTS
      .filter((slot) => slot === 'trait' || isSlotCompatible(selected.baseWeaponFamily, slot))
      .map((slot) => Object.freeze({
        slot, label: gunsmithSlotLabel(slot), iconArtId: slotIconBySlot.get(slot)!,
        ...(slot === 'trait' ? {} : (() => {
          const instanceId = selected.fitted[slot];
          const fitted = instanceId === undefined ? undefined : parts.find((part) => part.instanceId === instanceId);
          if (fitted !== undefined) return { fitted };
          return instanceId === undefined || state.parts[instanceId] === undefined
            ? {}
            : { unavailableFitted: { instanceId, label: 'Unavailable saved part' } };
        })()),
        candidates: Object.freeze(parts.filter((part) => part.slot === slot)),
      } satisfies GunsmithSlotView));
    const save = this.context.saveData;
    const facts = createConditionContext(save.progression, { stages: save.stages, achievements: save.achievements, characters: save.characters, bosses: save.bosses });
    const availableBlueprints = new Set(resolveAvailabilitySnapshot(
      facts,
      this.context.data.characters,
      this.context.data.equipmentSets ?? [],
      this.registry.all(),
      1,
    ).fabricablePartIds);
    const blueprints = Object.freeze(this.registry.all()
      .filter((part) => availableBlueprints.has(part.id))
      .map((part) => Object.freeze({
        partId: part.id, name: part.name, slot: part.slot, fabricationCost: part.fabricationCost!,
        iconArtId: part.presentation.iconArtId,
        traitIcons: Object.freeze(Object.entries(part.presentation.traitIconArtIds).flatMap(([trait, iconArtId]) => iconArtId === undefined ? [] : [Object.freeze({ trait, iconArtId })])),
        effectLines: Object.freeze(part.effects.map((effect) => formatGunsmithEffect(effect, 1))),
      } satisfies GunsmithBlueprintView)));
    const ownedParts: OwnedPart[] = Object.entries(state.parts).flatMap(([instanceId, stored]) => this.registry.partById(stored.partId) === undefined ? [] : [{
      instanceId, partId: stored.partId, tier: stored.tier, infusedTraits: stored.infusedTraits as readonly BehaviorTrait[],
    }]);
    const partViewsById = new Map(parts.map((part) => [part.instanceId, part] as const));
    const workshopRecipes: GunsmithWorkshopRecipe[] = [];
    for (const recipe of listWorkshopRecipes(ownedParts, this.registry.asMap())) {
      if (recipe.kind === 'merge') {
        const first = partViewsById.get(recipe.firstInstanceId);
        if (!first) continue;
        workshopRecipes.push(Object.freeze({
          kind: 'merge' as const, firstInstanceId: recipe.firstInstanceId, secondInstanceId: recipe.secondInstanceId,
          label: recipe.copies === undefined
            ? `Merge ${first.name} T${first.tier} variants → T${first.tier + 1}`
            : `Merge ${recipe.copies} × ${first.name} T${first.tier} → T${first.tier + 1}`,
        } satisfies GunsmithWorkshopRecipe));
        continue;
      }
      const target = partViewsById.get(recipe.targetInstanceId);
      const trait = partViewsById.get(recipe.traitInstanceId);
      if (!target || !trait) continue;
      workshopRecipes.push(Object.freeze({
        kind: 'infuse' as const, targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId,
        label: `Infuse ${target.name} with ${trait.name}`,
      } satisfies GunsmithWorkshopRecipe));
    }
    const workshop = Object.freeze(workshopRecipes);
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
      parts,
      ...(selectedBuildPresentation === undefined ? {} : { selectedBuild: selectedBuildPresentation }),
      slots: Object.freeze(slots),
      blueprints,
      workshop,
    });
  }

  fabricate(partId: string): GunsmithCommandResult {
    return this.context.fabricatePart(partId) ? { ok: true, persisted: true } : { ok: false, reason: 'fabrication-unavailable' };
  }

  private selectedStartingFamily(): string | undefined {
    const characterId = this.context.selectedCharacterId;
    const character = characterId === undefined ? undefined : this.context.data.characters.find((candidate) => candidate.id === characterId);
    const weaponId = character?.startingWeaponIds[0];
    return weaponId === undefined ? undefined : this.context.data.weapons.find((weapon) => weapon.id === weaponId)?.family;
  }

  createBuild(baseWeaponFamily: string, name = `${familyName(baseWeaponFamily)} Build`): GunsmithCommandResult {
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
    if (!build) return { ok: false, reason: 'no-selected-build' };
    // Persistent fitting is global: the same physical instance moves from an
    // older build only after the target validates.  Do not use equipPart here
    // because it intentionally only knows one build.
    const result = assignPartToBuild(state, build.id, instanceId, this.registry.asMap());
    if (!result.ok) return result;
    const update = this.context.updateGunsmith(() => result.state);
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  unequipPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    if (!build) return { ok: false, reason: 'no-selected-build' };
    const result = unequipPart(build, instanceId);
    if (!result.ok) return result;
    return this.persistBuild(state, result.build);
  }

  removeUnavailableFittedPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    if (!build || state.parts[instanceId] === undefined || this.registry.partById(state.parts[instanceId].partId) !== undefined) {
      return { ok: false, reason: 'not-unavailable-fitted-part' };
    }
    const fitted = Object.fromEntries(Object.entries(build.fitted).filter(([, id]) => id !== instanceId));
    const traitParts = build.traitParts.filter((id) => id !== instanceId);
    if (Object.keys(fitted).length === Object.keys(build.fitted).length && traitParts.length === build.traitParts.length) return { ok: false, reason: 'not-fitted' };
    const next = { ...build, fitted, traitParts };
    return this.persistBuild(state, next);
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

function familyName(id: string): string { return getAllWeaponFamilies().find((family) => family.id === id)?.name ?? id; }

function occupiedSlotMessage(selected: Build, slot: string, state: GunsmithState, registry: DataPartRegistry): string {
  const currentId = selected.fitted[slot];
  const current = currentId === undefined ? undefined : state.parts[currentId];
  const name = current === undefined ? undefined : registry.partById(current.partId)?.name;
  return `${gunsmithSlotLabel(slot as import('../gameplay/gunsmith').PartSlot)} occupied — unequip ${name ?? 'the current part'} first.`;
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
