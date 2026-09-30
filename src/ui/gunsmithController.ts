import type { GameContext } from '../engine/context';
import {
  replacePartInBuild,
  equipPart,
  infuseTrait,
  isSlotCompatible,
  listWorkshopInfusions,
  listWorkshopMergeFirstInputs,
  listWorkshopMergeGroups,
  listWorkshopMergeSecondInputs,
  mergeParts,
  resolveBuildModifiers,
  resolveBuildTraitModifiers,
  TRAIT_BEHAVIORS,
  unequipPart,
  MAX_TRAIT_CORES_PER_BUILD,
  PART_SLOTS,
  type BehaviorTrait,
  type OwnedPart,
  type PartDefinition,
  type WeaponBuild,
  type PartSlot,
} from '../gameplay/gunsmith';
import { getAllWeaponFamilies, isValidFamily } from '../gameplay/weaponFamilies';
import { DataPartRegistry } from '../systems/parts';
import type { Build, GunsmithState, PartInstance } from '../systems/save';
import { formatGunsmithEffect, gunsmithSlotLabel } from './gunsmithPresentation';
import { createConditionContext } from '../gameplay/conditionEvaluator';
import type { ProgressionCondition } from '../gameplay/conditionEvaluator';
import { resolveAvailabilitySnapshot } from '../gameplay/persistentAvailability';
import { createRunState } from '../gameplay/runState';
import { resolveWeaponStats, type EffectiveWeaponStats } from '../gameplay/weaponStats';
import type { WeaponDefinition } from '../systems/types';
import { deepFreeze } from '../engine/freeze';
import { GUNSMITH_CHASSIS, resolveGunsmithVisualAssembly } from './gunsmithVisualAssembly';
import { resolveEquipmentLoadoutPresentation, type EquipmentLoadoutPresentation } from './equipmentPresentation';

export type GunsmithSurface = 'build' | 'workshop' | 'parts';

export interface GunsmithPartView {
  readonly instanceId: string;
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  readonly tier: number;
  readonly traits: readonly string[];
  readonly compatible: boolean;
  readonly fitted: boolean;
  readonly stateLabel: 'EQUIPPED' | 'STORED';
  readonly effectScope: string;
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

export interface GunsmithCatalogPartView {
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  readonly rarity: string;
  readonly iconArtId: string;
  readonly traitIcons: readonly { readonly trait: string; readonly iconArtId: string }[];
  readonly state: 'fitted' | 'owned' | 'fabricable' | 'locked' | 'reward-only';
  readonly stateLabel: string;
  readonly ownedCount: number;
  readonly effectLines: readonly string[];
  readonly comparisonSummary: string;
  readonly sourceLabel: string;
  readonly fabricationCost?: number;
  readonly affordable?: boolean;
  /** Availability and current funds are distinct from ownership: repeatable
   * fabrication remains the route to a second merge input. */
  readonly canFabricate: boolean;
  readonly fabricationActionLabel?: string;
  readonly lockReason?: string;
}

/** Presentation-ready, rule-owned Workshop operation. */
export type GunsmithWorkshopRecipe =
  | { readonly kind: 'merge'; readonly groupId: string; readonly ownedCount: number; readonly label: string }
  | { readonly kind: 'infuse'; readonly targetInstanceId: string; readonly traitInstanceId: string; readonly label: string };

export interface GunsmithMergeSelection {
  readonly groupId: string;
  readonly step: 'first' | 'second';
  readonly title: string;
  readonly firstInstanceId?: string;
  readonly choices: readonly {
    readonly instanceId: string;
    readonly label: string;
    readonly recommended: boolean;
  }[];
}

export type GunsmithWorkshopRequest =
  | { readonly kind: 'merge'; readonly firstInstanceId: string; readonly secondInstanceId: string }
  | { readonly kind: 'infuse'; readonly targetInstanceId: string; readonly traitInstanceId: string };

export interface GunsmithWorkshopConfirmation {
  readonly kind: 'merge' | 'infuse';
  readonly title: string;
  readonly confirmLabel: string;
  readonly inputLines: readonly string[];
  readonly outputLine: string;
  readonly mechanicalDelta: readonly string[];
}

export interface GunsmithBuildPresentation {
  readonly id: string;
  readonly familyId: string;
  readonly title: string;
  readonly status: 'Selected' | 'Configured' | 'Empty';
  readonly activation: 'Active from start' | 'Activates when acquired';
  readonly preview?: GunsmithAssembledPreview;
  readonly summary: string;
}

export interface GunsmithAssembledPreview {
  readonly baseArtId: string;
  readonly layers: readonly {
    readonly instanceId: string;
    readonly slot: string;
    readonly artId: string;
    readonly tier: number;
  }[];
  readonly traitCores: readonly {
    readonly instanceId: string;
    readonly iconArtId: string;
    readonly tier: number;
  }[];
  readonly traitEmblems: readonly { readonly trait: string; readonly iconArtId: string }[];
}

export interface GunsmithSnapshot {
  readonly surface: GunsmithSurface;
  readonly selectedSlot: PartSlot;
  readonly selectedCandidateInstanceId?: string;
  readonly candidatePreview?: GunsmithAssembledPreview;
  readonly candidateComparison?: {
    readonly lines: readonly string[];
    readonly displacedInstanceId?: string;
    readonly movedFromBuildId?: string;
    readonly before: EquipmentLoadoutPresentation['runTruth'];
    readonly after: EquipmentLoadoutPresentation['runTruth'];
  };
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
  /** Complete definition catalog with acquisition truth. */
  readonly catalog: readonly GunsmithCatalogPartView[];
  /** Bounded recipes from the Gunsmith domain; scenes do not reconstruct
   * pair eligibility from save records. */
  readonly workshop: readonly GunsmithWorkshopRecipe[];
  readonly mergeSelection?: GunsmithMergeSelection;
  readonly confirmation?: GunsmithWorkshopConfirmation;
}

export interface GunsmithFamilyView {
  readonly id: string;
  readonly name: string;
  readonly iconArtId: string;
  /** Rich assembled chassis art used by the live Gunsmith family card. */
  readonly previewBaseArtId?: string;
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
  private surface: GunsmithSurface = 'build';
  private selectedSlot: PartSlot = 'receiver';
  private pendingPart?: {
    readonly buildId: string;
    readonly slot: PartSlot;
    readonly instanceId: string;
    readonly signature: string;
    readonly preview?: GunsmithAssembledPreview;
    readonly comparison: NonNullable<GunsmithSnapshot['candidateComparison']>;
  };
  private readonly registry: DataPartRegistry;
  private pendingWorkshop?: Readonly<{ request: GunsmithWorkshopRequest; confirmation: GunsmithWorkshopConfirmation }>;
  private pendingMergeSelection?: { groupId: string; firstInstanceId?: string };
  private presentationRevision = 0;
  private cachedSnapshot?: Readonly<{
    save: GameContext['saveData'];
    selectionRevision: number;
    presentationRevision: number;
    value: GunsmithSnapshot;
  }>;

  constructor(private readonly context: GameContext) {
    this.registry = new DataPartRegistry({ gunParts: context.data.gunParts ?? [] });
  }

  snapshot(): GunsmithSnapshot {
    const cached = this.cachedSnapshot;
    if (cached
      && cached.save === this.context.saveData
      && cached.selectionRevision === this.context.selectionRevision
      && cached.presentationRevision === this.presentationRevision) return cached.value;
    const state = this.context.saveData.gunsmith;
    const selected = state.builds.find((build) => build.id === state.selectedBuildId);
    const representativeWeapon = selected === undefined ? undefined : this.context.data.weapons
      .find((weapon) => weapon.family === selected.baseWeaponFamily && weapon.mergeTier === 1);
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
      const traits = Object.freeze([...definition.traits, ...stored.infusedTraits]);
      const view: GunsmithPartView = Object.freeze({
        instanceId, partId: stored.partId, name: definition.name, slot: definition.slot,
        tier: stored.tier, traits,
        iconArtId: definition.presentation.iconArtId,
        traitIcons: Object.freeze(traits.flatMap((trait) => {
          const iconArtId = traitIconByTrait.get(trait);
          return iconArtId === undefined ? [] : [Object.freeze({ trait, iconArtId })];
        })),
        // Occupied ordinary slots replace atomically; full trait sockets
        // require an explicitly selected displaced instance.
        compatible: selected === undefined || (compatible && capacity),
        fitted: fittedHere,
        stateLabel: fittedHere || assigned !== undefined ? 'EQUIPPED' : 'STORED',
        effectScope: selected ? familyName(selected.baseWeaponFamily) : 'Compatible Weapon Family',
        state: fittedHere ? 'fitted-here' : !compatible || !capacity ? 'incompatible' : assigned !== undefined ? 'fitted-elsewhere' : 'owned-unfitted',
        ...(assigned === undefined ? {} : { assignedBuildId: assigned.id, assignedBuildName: assigned.name }),
        effectLines: Object.freeze(definition.effects.map((effect) => formatGunsmithEffect(effect, stored.tier))),
        traitLines: Object.freeze([...definition.traits, ...stored.infusedTraits]),
        comparisonSummary: selected === undefined
          ? 'Choose a build to preview this part.'
          : fittedHere ? selectedBuildComparison(selected, instanceId, state, this.registry, representativeWeapon)
            : !compatible ? `Cannot fit ${selected.baseWeaponFamily}.`
              : !capacity ? 'Trait capacity full — unequip a trait first.'
                  : assigned !== undefined ? `Move from ${assigned.name}.`
                    : selectedBuildComparison(selected, instanceId, state, this.registry, representativeWeapon),
      });
      return [view];
    }));
    const selectedStartFamily = this.selectedStartingFamily();
    const assembly = selected === undefined ? undefined : resolveGunsmithVisualAssembly(selected, state, this.registry.asMap());
    const previewLayers = assembly?.layers ?? [];
    const traitCores = assembly?.traitCores ?? [];
    const traitEmblems = assembly?.traitEmblems ?? [];
    const fittedNames = selected === undefined ? [] : [...previewLayers, ...traitCores].flatMap((layer) => {
      const stored = state.parts[layer.instanceId];
      const definition = stored && this.registry.partById(stored.partId);
      return definition ? [definition.name] : [];
    });
    const selectedBuildPresentation = selected === undefined ? undefined : Object.freeze({
      id: selected.id, familyId: selected.baseWeaponFamily, title: selected.name,
      status: selected.id === state.selectedBuildId ? 'Selected' : (Object.keys(selected.fitted).length + selected.traitParts.length > 0 ? 'Configured' : 'Empty'),
      activation: selected.baseWeaponFamily === selectedStartFamily ? 'Active from start' : 'Activates when acquired',
      summary: fittedNames.length === 0
        ? `Stock ${familyName(selected.baseWeaponFamily)} chassis`
        : `${traitEmblems.map((entry) => entry.trait).join(' / ') || 'Engineered'} ${familyName(selected.baseWeaponFamily)} • ${fittedNames.join(' • ')}`,
      ...(assembly === undefined ? {} : { preview: assembly }),
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
        candidates: Object.freeze(parts.filter((part) => part.slot === slot && part.compatible)),
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
    const catalog = Object.freeze(this.registry.all().map((definition) => {
      const owned = parts.filter((part) => part.partId === definition.id);
      const fittedParts = owned.filter((part) => part.state === 'fitted-here' || part.state === 'fitted-elsewhere');
      const fittedCount = fittedParts.length;
      const bestTier = owned.reduce((highest, part) => Math.max(highest, part.tier), 1);
      const representativePool = fittedCount > 0 ? fittedParts : owned;
      const representative = representativePool.reduce<GunsmithPartView | undefined>(
        (best, part) => best === undefined || part.tier > best.tier ? part : best,
        undefined,
      );
      const displayTier = representative?.tier ?? bestTier;
      const fabricationCost = definition.fabricationCost;
      const fabricable = availableBlueprints.has(definition.id);
      const catalogState: GunsmithCatalogPartView['state'] = fittedCount > 0 ? 'fitted'
        : owned.length > 0 ? 'owned'
          : fabricationCost === undefined ? 'reward-only'
            : fabricable ? 'fabricable' : 'locked';
      const sourceLabel = acquisitionSourceLabel(definition.id, fabricationCost, this.context);
      const affordable = fabricationCost !== undefined && save.progression.scrap >= fabricationCost;
      const canFabricate = fabricationCost !== undefined && fabricable && affordable;
      const stateLabel = catalogState === 'fitted' ? `EQUIPPED • T${displayTier}`
        : catalogState === 'owned' ? `STORED ×${owned.length} • best T${displayTier}`
          : catalogState === 'fabricable' ? `FABRICABLE • ${fabricationCost} Scrap`
            : catalogState === 'locked' ? 'LOCKED' : 'REWARD ONLY';
      return Object.freeze({
        partId: definition.id, name: definition.name, slot: definition.slot, rarity: definition.rarity,
        iconArtId: definition.presentation.iconArtId,
        traitIcons: Object.freeze(Object.entries(definition.presentation.traitIconArtIds).flatMap(([trait, iconArtId]) => iconArtId === undefined ? [] : [Object.freeze({ trait, iconArtId })])),
        state: catalogState, stateLabel, ownedCount: owned.length,
        effectLines: Object.freeze(formatPartEffects(definition, displayTier)),
        comparisonSummary: representative?.comparisonSummary ?? catalogCandidateComparison(selected, definition, catalogState, bestTier, state, this.registry, representativeWeapon),
        sourceLabel,
        canFabricate,
        ...(fabricationCost === undefined ? {} : {
          fabricationCost, affordable,
          ...(fabricable ? { fabricationActionLabel: `${owned.length > 0 ? 'Fabricate another' : 'Fabricate'} — ${fabricationCost} Scrap` } : {}),
        }),
        ...(catalogState !== 'locked' ? {} : { lockReason: definition.unlock === undefined ? 'Blueprint is not currently available.' : describeCondition(definition.unlock, this.context) }),
      } satisfies GunsmithCatalogPartView);
    }));
    const ownedParts: OwnedPart[] = Object.entries(state.parts).flatMap(([instanceId, stored]) => this.registry.partById(stored.partId) === undefined ? [] : [{
      instanceId, partId: stored.partId, tier: stored.tier, infusedTraits: stored.infusedTraits as readonly BehaviorTrait[],
    }]);
    const partViewsById = new Map(parts.map((part) => [part.instanceId, part] as const));
    const assignedIds = new Set(assignments.keys());
    const workshopRecipes: GunsmithWorkshopRecipe[] = listWorkshopMergeGroups(ownedParts, this.registry.asMap()).flatMap((group) => {
      const definition = this.registry.partById(group.partId);
      return definition === undefined ? [] : [Object.freeze({
        kind: 'merge' as const, groupId: group.id, ownedCount: group.ownedCount,
        label: `Merge 2 of ${group.ownedCount} owned ${definition.name} T${group.tier} → T${group.tier + 1}`,
      })];
    });
    for (const recipe of listWorkshopInfusions(ownedParts, this.registry.asMap(), assignedIds)) {
      const target = partViewsById.get(recipe.targetInstanceId);
      const trait = partViewsById.get(recipe.traitInstanceId);
      if (!target || !trait) continue;
      workshopRecipes.push(Object.freeze({
        kind: 'infuse' as const, targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId,
        label: `Infuse ${target.name} with ${trait.name}${workshopLocationSuffix([
          partLocation(recipe.targetInstanceId, state), partLocation(recipe.traitInstanceId, state),
        ], ['Target', 'Core'])}`,
      } satisfies GunsmithWorkshopRecipe));
    }
    const workshop = Object.freeze(workshopRecipes);
    const mergeSelection = this.buildMergeSelection(ownedParts, assignedIds, state);
    const normalizedSlot = this.resolvedSelectedSlot(selected);
    const pendingPart = this.pendingPart && state.parts[this.pendingPart.instanceId]
      && selected?.id === this.pendingPart.buildId ? this.pendingPart : undefined;
    const value = Object.freeze({
      surface: this.surface,
      selectedSlot: normalizedSlot,
      ...(pendingPart === undefined ? {} : {
        selectedCandidateInstanceId: pendingPart.instanceId,
        candidatePreview: pendingPart.preview,
        candidateComparison: pendingPart.comparison,
      }),
      selectedBuildId: selected?.id,
      builds: Object.freeze([...state.builds]),
      families: Object.freeze(getAllWeaponFamilies().map((family) => {
        const build = buildsByFamily.get(family.id);
        const chassis = GUNSMITH_CHASSIS.find((entry) => entry.familyId === family.id);
        return Object.freeze({
          id: family.id,
          name: family.name,
          iconArtId: chassis?.iconArtId ?? '',
          ...(chassis === undefined ? {} : { previewBaseArtId: chassis.baseArtId }),
          selected: build !== undefined && build.id === selected?.id,
          existingBuildId: build?.id,
        });
      })),
      parts,
      ...(selectedBuildPresentation === undefined ? {} : { selectedBuild: selectedBuildPresentation }),
      slots: Object.freeze(slots),
      blueprints,
      catalog,
      workshop,
      ...(mergeSelection === undefined ? {} : { mergeSelection }),
      ...(this.pendingWorkshop === undefined ? {} : { confirmation: this.pendingWorkshop.confirmation }),
    });
    this.cachedSnapshot = Object.freeze({
      save: this.context.saveData,
      selectionRevision: this.context.selectionRevision,
      presentationRevision: this.presentationRevision,
      value,
    });
    return value;
  }

  beginMerge(groupId: string): GunsmithCommandResult {
    const group = this.snapshot().workshop.find((entry) => entry.kind === 'merge' && entry.groupId === groupId);
    if (group === undefined) return { ok: false, reason: 'workshop-operation-unavailable' };
    this.pendingWorkshop = undefined;
    this.pendingMergeSelection = { groupId };
    this.presentationRevision += 1;
    return { ok: true, persisted: false };
  }

  selectMergeInput(instanceId: string): GunsmithCommandResult {
    const selection = this.snapshot().mergeSelection;
    if (selection === undefined || !selection.choices.some((choice) => choice.instanceId === instanceId)) {
      return { ok: false, reason: 'workshop-operation-unavailable' };
    }
    if (selection.step === 'first') {
      this.pendingMergeSelection = { groupId: selection.groupId, firstInstanceId: instanceId };
      this.presentationRevision += 1;
      return { ok: true, persisted: false };
    }
    return this.requestWorkshop({ kind: 'merge', firstInstanceId: selection.firstInstanceId!, secondInstanceId: instanceId });
  }

  backMergeSelection(): GunsmithCommandResult {
    const selection = this.pendingMergeSelection;
    if (selection === undefined) return { ok: false, reason: 'no-pending-confirmation' };
    this.pendingMergeSelection = selection.firstInstanceId === undefined ? undefined : { groupId: selection.groupId };
    this.presentationRevision += 1;
    return { ok: true, persisted: false };
  }

  hasMergeSelection(): boolean {
    return this.pendingMergeSelection !== undefined;
  }

  requestWorkshop(request: GunsmithWorkshopRequest): GunsmithCommandResult {
    if (request.kind === 'infuse' && !this.snapshot().workshop.some((candidate) => sameWorkshopRequest(candidate, request))) {
      return { ok: false, reason: 'workshop-operation-unavailable' };
    }
    const confirmation = this.buildWorkshopConfirmation(request);
    if (confirmation === undefined) return { ok: false, reason: 'workshop-operation-unavailable' };
    this.pendingWorkshop = Object.freeze({ request: Object.freeze({ ...request }), confirmation });
    this.presentationRevision += 1;
    return { ok: true, persisted: false };
  }

  cancelWorkshop(): GunsmithCommandResult {
    if (this.pendingWorkshop === undefined) return { ok: false, reason: 'no-pending-confirmation' };
    this.pendingWorkshop = undefined;
    this.presentationRevision += 1;
    return { ok: true, persisted: false };
  }

  confirmWorkshop(): GunsmithCommandResult {
    const pending = this.pendingWorkshop;
    if (pending === undefined) return { ok: false, reason: 'no-pending-confirmation' };
    const currentConfirmation = this.buildWorkshopConfirmation(pending.request);
    const stillAvailable = pending.request.kind === 'merge'
      ? currentConfirmation !== undefined
      : this.snapshot().workshop.some((candidate) => sameWorkshopRequest(candidate, pending.request));
    if (!stillAvailable || currentConfirmation === undefined
      || JSON.stringify(currentConfirmation) !== JSON.stringify(pending.confirmation)) {
      this.pendingWorkshop = undefined;
      this.presentationRevision += 1;
      return { ok: false, reason: 'workshop-operation-unavailable' };
    }
    const result = pending.request.kind === 'merge'
      ? this.merge(pending.request.firstInstanceId, pending.request.secondInstanceId)
      : this.infuse(pending.request.targetInstanceId, pending.request.traitInstanceId);
    if (result.ok || result.reason !== 'save-failed') {
      this.pendingWorkshop = undefined;
      this.presentationRevision += 1;
    }
    if (result.ok) this.pendingMergeSelection = undefined;
    return result;
  }

  private buildMergeSelection(
    ownedParts: readonly OwnedPart[],
    assignedIds: ReadonlySet<string>,
    state: GunsmithState,
  ): GunsmithMergeSelection | undefined {
    const pending = this.pendingMergeSelection;
    if (pending === undefined) return undefined;
    const inputs = pending.firstInstanceId === undefined
      ? listWorkshopMergeFirstInputs(pending.groupId, ownedParts, this.registry.asMap(), assignedIds)
      : listWorkshopMergeSecondInputs(pending.groupId, pending.firstInstanceId, ownedParts, this.registry.asMap(), assignedIds);
    if (inputs.length === 0) return undefined;
    const choices = inputs.map((part, index) => {
      const definition = this.registry.partById(part.partId)!;
      const location = partLocation(part.instanceId, state);
      return Object.freeze({
        instanceId: part.instanceId,
        label: `${pending.firstInstanceId === undefined ? 'First input' : 'Second input'} • ${partSummaryLine(part, definition)}\n${location === undefined ? 'Inventory spare' : `Fitted: ${location}`}`,
        recommended: index === 0 && location === undefined,
      });
    });
    return Object.freeze({
      groupId: pending.groupId,
      step: pending.firstInstanceId === undefined ? 'first' : 'second',
      title: pending.firstInstanceId === undefined ? 'Choose first merge input' : 'Choose compatible second input',
      ...(pending.firstInstanceId === undefined ? {} : { firstInstanceId: pending.firstInstanceId }),
      choices: Object.freeze(choices),
    });
  }

  private buildWorkshopConfirmation(request: GunsmithWorkshopRequest): GunsmithWorkshopConfirmation | undefined {
    const state = this.context.saveData.gunsmith;
    const definitions = this.registry.asMap();
    if (request.kind === 'merge') {
      const first = ownedPart(state, request.firstInstanceId);
      const second = ownedPart(state, request.secondInstanceId);
      if (!first || !second) return undefined;
      const result = mergeParts(first, second, definitions);
      const definition = definitions.get(first.partId);
      if (!result.ok || !definition) return undefined;
      const before = formatPartEffects(definition, first.tier);
      const after = formatPartEffects(definition, result.output.tier);
      const firstTraits = [...new Set([...definition.traits, ...first.infusedTraits])];
      const secondTraits = [...new Set([...definition.traits, ...second.infusedTraits])];
      const outputTraits = [...new Set([...definition.traits, ...result.output.infusedTraits])];
      return freezeConfirmation({
        kind: 'merge', title: 'Confirm merge', confirmLabel: 'Merge parts',
        inputLines: [partSummaryLine(first, definition, partLocation(first.instanceId, state)), partSummaryLine(second, definition, partLocation(second.instanceId, state))],
        outputLine: partSummaryLine(result.output, definition),
        mechanicalDelta: [
          ...effectDelta(before, after),
          ...(outputTraits.length === 0 ? [] : [`Traits ${firstTraits.join(' / ') || 'None'} + ${secondTraits.join(' / ') || 'None'} → ${outputTraits.join(' / ')}`]),
        ],
      });
    }
    const target = ownedPart(state, request.targetInstanceId);
    const source = ownedPart(state, request.traitInstanceId);
    if (!target || !source) return undefined;
    const result = infuseTrait(target, source, definitions);
    const targetDefinition = definitions.get(target.partId);
    const sourceDefinition = definitions.get(source.partId);
    if (!result.ok || !targetDefinition || !sourceDefinition) return undefined;
    const beforeTraits = [...targetDefinition.traits, ...target.infusedTraits];
    const afterTraits = [...targetDefinition.traits, ...result.output.infusedTraits];
    const addedTrait = afterTraits.find((trait) => !beforeTraits.includes(trait));
    return freezeConfirmation({
      kind: 'infuse', title: 'Confirm infusion', confirmLabel: 'Infuse part',
      inputLines: [partSummaryLine(target, targetDefinition, partLocation(target.instanceId, state)), partSummaryLine(source, sourceDefinition, partLocation(source.instanceId, state))],
      outputLine: partSummaryLine(result.output, targetDefinition),
      mechanicalDelta: [
        `Traits ${beforeTraits.join(' / ') || 'None'} → ${afterTraits.join(' / ') || 'None'}`,
        ...(addedTrait === undefined ? [] : [describeTraitBehavior(addedTrait)]),
      ],
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
    const update = this.context.updateGunsmith((state) => {
      const existing = state.builds.find((build) => build.baseWeaponFamily === baseWeaponFamily);
      if (existing) return { ...state, selectedBuildId: existing.id };
      const id = `build:${baseWeaponFamily}`;
      return { ...state, builds: [...state.builds, { id, name, baseWeaponFamily, fitted: {}, traitParts: [] }], selectedBuildId: id };
    });
    if (update.persisted) this.cancelPreview();
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  selectBuild(buildId: string): GunsmithCommandResult {
    let failure: string | undefined;
    const update = this.context.updateGunsmith((state) => {
      if (!state.builds.some((build) => build.id === buildId)) { failure = 'unknown-build'; return undefined; }
      return { ...state, selectedBuildId: buildId };
    });
    if (failure) return { ok: false, reason: failure };
    if (update.persisted) this.cancelPreview();
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  fitPart(instanceId: string): GunsmithCommandResult {
    const buildId = this.context.saveData.gunsmith.selectedBuildId;
    if (!buildId) return { ok: false, reason: 'no-selected-build' };
    let failure: string | undefined;
    let unchanged = false;
    const update = this.context.updateGunsmith((current) => {
      if (current.selectedBuildId !== buildId) { failure = 'stale-target'; return undefined; }
      const stored = current.parts[instanceId];
      const definition = stored && this.registry.partById(stored.partId);
      if (!definition) { failure = 'unknown-part'; return undefined; }
      const result = replacePartInBuild(current, buildId, definition.slot, instanceId, this.registry.asMap());
      if (!result.ok) { failure = result.reason; return undefined; }
      unchanged = result.state === current;
      return unchanged ? undefined : result.state;
    });
    if (failure) return { ok: false, reason: failure };
    this.cancelPreview();
    return update.persisted || unchanged ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  openSurface(surface: GunsmithSurface): void {
    this.surface = surface;
    this.cancelPreview();
  }

  selectSlot(slot: PartSlot): void {
    const build = selectedBuild(this.context.saveData.gunsmith);
    if (!PART_SLOTS.includes(slot) || (build && !isSlotCompatible(build.baseWeaponFamily, slot))) return;
    this.selectedSlot = slot;
    this.surface = 'build';
    this.cancelPreview();
  }

  cancelPreview(): void {
    this.pendingPart = undefined;
    this.presentationRevision += 1;
  }

  previewPart(instanceId: string, displacedInstanceId?: string): GunsmithCommandResult {
    const save = this.context.saveData;
    const build = selectedBuild(save.gunsmith);
    if (!build) return { ok: false, reason: 'no-selected-build' };
    const slot = this.resolvedSelectedSlot(build);
    const result = replacePartInBuild(save.gunsmith, build.id, slot, instanceId, this.registry.asMap(), displacedInstanceId);
    if (!result.ok) return result;
    const candidate = deepFreeze({ ...save, gunsmith: result.state });
    const candidateBuild = result.state.builds.find((row) => row.id === build.id)!;
    const before = resolveEquipmentLoadoutPresentation(save, this.context.data).runTruth;
    const after = resolveEquipmentLoadoutPresentation(candidate, this.context.data).runTruth;
    const weapon = this.context.data.weapons.find((row) => row.family === build.baseWeaponFamily && row.mergeTier === 1);
    const lines = persistentComparisonLines(before, after, weapon);
    if (result.displacedInstanceId) lines.unshift(`Stored: ${this.partLabel(result.displacedInstanceId, save.gunsmith)}`);
    if (result.movedFromBuildId && result.movedFromBuildId !== build.id) lines.unshift(`Move from ${save.gunsmith.builds.find((row) => row.id === result.movedFromBuildId)?.name ?? result.movedFromBuildId}`);
    this.pendingPart = deepFreeze({ buildId: build.id, slot, instanceId,
      signature: loadoutSignature(save), preview: resolveGunsmithVisualAssembly(candidateBuild, result.state, this.registry.asMap()),
      comparison: { lines, before, after, displacedInstanceId: result.displacedInstanceId, movedFromBuildId: result.movedFromBuildId } });
    this.presentationRevision += 1;
    return { ok: true, persisted: false };
  }

  commitPreview(): GunsmithCommandResult {
    const pending = this.pendingPart;
    if (!pending) return { ok: false, reason: 'no-candidate' };
    let failure: string | undefined;
    let unchanged = false;
    const update = this.context.updateGunsmith((current) => {
      if (loadoutSignature({ ...this.context.saveData, gunsmith: current }) !== pending.signature) {
        failure = 'stale-target'; return undefined;
      }
      const result = replacePartInBuild(current, pending.buildId, pending.slot, pending.instanceId, this.registry.asMap(), pending.comparison.displacedInstanceId);
      if (!result.ok) { failure = result.reason; return undefined; }
      unchanged = result.state === current;
      return unchanged ? undefined : result.state;
    });
    if (failure) { this.cancelPreview(); return { ok: false, reason: failure }; }
    if (!update.persisted && !unchanged) return { ok: false, reason: 'save-failed' };
    this.cancelPreview();
    return { ok: true, persisted: true };
  }

  private partLabel(instanceId: string, state: GunsmithState): string {
    const part = state.parts[instanceId];
    return part ? `${this.registry.partById(part.partId)?.name ?? part.partId} T${part.tier}` : instanceId;
  }

  unequipPart(instanceId: string): GunsmithCommandResult {
    return this.mutateSelectedBuild((build) => unequipPart(build, instanceId));
  }

  removeUnavailableFittedPart(instanceId: string): GunsmithCommandResult {
    return this.mutateSelectedBuild((build, current) => {
      if (current.parts[instanceId] === undefined || this.registry.partById(current.parts[instanceId].partId) !== undefined) {
        return { ok: false, reason: 'not-unavailable-fitted-part' };
      }
      const result = unequipPart(build, instanceId);
      return result.ok ? result : { ok: false, reason: 'not-fitted' };
    });
  }

  private resolvedSelectedSlot(build: WeaponBuild | undefined): PartSlot {
    return build && !isSlotCompatible(build.baseWeaponFamily, this.selectedSlot)
      ? PART_SLOTS.find((slot) => isSlotCompatible(build.baseWeaponFamily, slot)) ?? 'receiver' : this.selectedSlot;
  }

  private mutateSelectedBuild(transform: (build: WeaponBuild, current: GunsmithState) =>
    { readonly ok: true; readonly build: WeaponBuild } | { readonly ok: false; readonly reason: string }): GunsmithCommandResult {
    const buildId = this.context.saveData.gunsmith.selectedBuildId;
    if (!buildId) return { ok: false, reason: 'no-selected-build' };
    let failure: string | undefined;
    const update = this.context.updateGunsmith((current) => {
      if (current.selectedBuildId !== buildId) { failure = 'stale-target'; return undefined; }
      const build = current.builds.find((row) => row.id === buildId);
      if (!build) { failure = 'unknown-build'; return undefined; }
      const result = transform(build, current);
      if (!result.ok) { failure = result.reason; return undefined; }
      return { ...current, builds: current.builds.map((row) => row.id === buildId ? result.build : row) };
    });
    if (failure) return { ok: false, reason: failure };
    if (update.persisted) this.cancelPreview();
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  merge(firstInstanceId: string, secondInstanceId: string): GunsmithCommandResult {
    let failure: string | undefined;
    let collision = false;
    const update = this.context.updateGunsmith((current) => {
      // GameContext re-resolves current state immediately before the one save.
      // Inputs are stable IDs, so stale/consumed state cannot be overwritten.
        const first = ownedPart(current, firstInstanceId);
        const second = ownedPart(current, secondInstanceId);
        if (!first || !second) { failure = 'missing-parts'; return undefined; }
        const result = mergeParts(first, second, this.registry.asMap());
        if (!result.ok) { failure = result.reason; return undefined; }
        // A deterministic output collision is an explicit no-op, never a suffix.
        if (Object.hasOwn(current.parts, result.output.instanceId)) { collision = true; return undefined; }
        return {
      ...current,
      parts: Object.fromEntries([
        ...Object.entries(current.parts).filter(([id]) => !result.consumed.includes(id)),
        [result.output.instanceId, { partId: result.output.partId, tier: result.output.tier, infusedTraits: result.output.infusedTraits }],
      ]),
      builds: removePartReferences(current.builds, result.consumed),
        };
    });
    if (failure) return { ok: false, reason: failure };
    if (collision) return { ok: false, reason: 'output-collision' };
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  infuse(targetInstanceId: string, traitInstanceId: string): GunsmithCommandResult {
    let failure: string | undefined;
    const update = this.context.updateGunsmith((current) => {
        const target = ownedPart(current, targetInstanceId);
        const trait = ownedPart(current, traitInstanceId);
        if (!target || !trait || targetInstanceId === traitInstanceId) { failure = 'unknown-part'; return undefined; }
        const result = infuseTrait(target, trait, this.registry.asMap());
        if (!result.ok) { failure = result.reason; return undefined; }
        return {
      ...current,
      parts: Object.fromEntries(Object.entries(current.parts)
        .filter(([id]) => id !== traitInstanceId)
        .map(([id, part]) => [id, id === targetInstanceId
          ? { ...part, infusedTraits: result.output.infusedTraits }
          : part])),
      builds: removePartReferences(current.builds, [traitInstanceId]),
        };
    });
    if (failure) return { ok: false, reason: failure };
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }


}

function familyName(id: string): string { return getAllWeaponFamilies().find((family) => family.id === id)?.name ?? id; }

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

function sameWorkshopRequest(recipe: GunsmithWorkshopRecipe, request: GunsmithWorkshopRequest): boolean {
  return recipe.kind === 'infuse' && request.kind === 'infuse'
    && recipe.targetInstanceId === request.targetInstanceId && recipe.traitInstanceId === request.traitInstanceId;
}

function freezeConfirmation(input: GunsmithWorkshopConfirmation): GunsmithWorkshopConfirmation {
  return Object.freeze({
    ...input,
    inputLines: Object.freeze([...input.inputLines]),
    mechanicalDelta: Object.freeze([...input.mechanicalDelta]),
  });
}

function formatPartEffects(definition: PartDefinition, tier: number): string[] {
  return definition.effects.map((effect) => formatGunsmithEffect(effect, tier));
}

function partSummaryLine(part: OwnedPart, definition: PartDefinition, location?: string): string {
  const summary = [
    `${definition.name} T${part.tier}`,
    ...formatPartEffects(definition, part.tier),
    ...[...new Set([...definition.traits, ...part.infusedTraits])],
  ].join(' • ');
  return location === undefined ? summary : `${summary} — fitted to ${location}`;
}

function partLocation(instanceId: string, state: GunsmithState): string | undefined {
  for (const build of state.builds) {
    const physical = Object.entries(build.fitted).find(([, fittedId]) => fittedId === instanceId);
    if (physical) return `${build.name} • ${gunsmithSlotLabel(physical[0] as import('../gameplay/gunsmith').PartSlot)}`;
    if (build.traitParts.includes(instanceId)) return `${build.name} • Traits`;
  }
  return undefined;
}

function workshopLocationSuffix(locations: readonly (string | undefined)[], prefixes?: readonly string[]): string {
  const visible = locations.flatMap((location, index) => location === undefined
    ? []
    : [`${prefixes?.[index] === undefined ? '' : `${prefixes[index]} `}${location}`]);
  return visible.length === 0 ? '' : `\nUses: ${visible.join(' + ')}`;
}

function effectDelta(before: readonly string[], after: readonly string[]): string[] {
  return after.map((line, index) => `${before[index] ?? 'None'} → ${line}`);
}

function describeTraitBehavior(trait: BehaviorTrait): string {
  const behavior = TRAIT_BEHAVIORS[trait];
  const contributions: string[] = [];
  if (behavior.modifier) contributions.push(formatGunsmithEffect(behavior.modifier, 1));
  if (behavior.projectileEffect?.kind === 'burn') contributions.push('burning hits');
  if (behavior.projectileEffect?.kind === 'explosive') contributions.push('impact blast');
  return `${trait} adds ${contributions.join(' and ') || 'weapon behaviour'}`;
}

function selectedBuildComparison(
  selected: Build,
  instanceId: string,
  state: GunsmithState,
  registry: DataPartRegistry,
  weapon: WeaponDefinition | undefined,
): string {
  const stored = state.parts[instanceId];
  const definition = stored === undefined ? undefined : registry.partById(stored.partId);
  if (!stored || !definition) return 'Unavailable saved part.';
  const fitted = Object.values(selected.fitted).includes(instanceId) || selected.traitParts.includes(instanceId);
  let after: WeaponBuild | undefined;
  if (fitted) {
    const result = unequipPart(selected, instanceId);
    after = result.ok ? result.build : undefined;
  } else {
    const result = replacePartInBuild(state, selected.id, definition.slot, instanceId, registry.asMap());
    after = result.ok ? result.state.builds.find((build) => build.id === selected.id) : undefined;
  }
  if (!after) return `Candidate: ${formatPartEffects(definition, stored.tier).join(' • ') || 'Trait only'}`;
  return buildComparison(selected, after, state, registry, weapon);
}

function loadoutSignature(save: GameContext['saveData']): string {
  return JSON.stringify([save.gunsmith, save.equipment, save.equipmentLoadout]);
}

function persistentComparisonLines(before: EquipmentLoadoutPresentation['runTruth'],
  after: EquipmentLoadoutPresentation['runTruth'], weapon: WeaponDefinition | undefined): string[] {
  const lines: string[] = [];
  if (weapon) {
    const resolve = (truth: EquipmentLoadoutPresentation['runTruth']) => {
      const run = createRunState({ seed: 0, characterId: 'gunsmith-preview', arenaId: 'gunsmith-preview' });
      for (const modifier of truth.modifiers) run.stats.add(modifier);
      return resolveWeaponStats(run, weapon);
    };
    const old = resolve(before);
    const next = resolve(after);
    for (const key of Object.keys(WEAPON_STAT_LABELS) as (keyof EffectiveWeaponStats)[]) {
      if (Math.abs(old[key] - next[key]) >= 1e-9) lines.push(`${familyName(weapon.family)} ${WEAPON_STAT_LABELS[key]} ${formatResolvedStat(key, old[key])} → ${formatResolvedStat(key, next[key])}`);
    }
  }
  for (const next of after.families) {
    const old = before.families.find((row) => row.familyId === next.familyId);
    const traits = (row: typeof next | undefined) => row?.traits.map((trait) => `${trait.trait}${trait.deduplicated ? ' (shared; applied once)' : ''}`).join(' / ') || 'None';
    if (traits(old) !== traits(next)) lines.push(`${familyName(next.familyId)} traits ${traits(old)} → ${traits(next)}`);
  }
  return lines.length ? lines : ['No mechanical change'];
}

function buildComparison(
  beforeBuild: WeaponBuild,
  afterBuild: WeaponBuild,
  state: GunsmithState,
  registry: DataPartRegistry,
  weapon: WeaponDefinition | undefined,
): string {
  if (weapon === undefined) return 'Current build comparison unavailable.';
  const owned = new Map<string, OwnedPart>(Object.entries(state.parts).map(([instanceId, part]) => [instanceId, {
    instanceId, partId: part.partId, tier: part.tier, infusedTraits: part.infusedTraits as readonly BehaviorTrait[],
  }]));
  const before = resolveBuildWeaponStats(beforeBuild, registry.asMap(), owned, weapon);
  const after = resolveBuildWeaponStats(afterBuild, registry.asMap(), owned, weapon);
  const changed = (Object.keys(WEAPON_STAT_LABELS) as Array<keyof EffectiveWeaponStats>).flatMap((key) =>
    Math.abs(before[key] - after[key]) < 1e-9 ? [] : [`${WEAPON_STAT_LABELS[key]} ${formatResolvedStat(key, before[key])} → ${formatResolvedStat(key, after[key])}`]);
  return `Current build: ${changed.join(' • ') || 'No mechanical change'}`;
}

const WEAPON_STAT_LABELS: Readonly<Record<keyof EffectiveWeaponStats, string>> = Object.freeze({
  intervalMs: 'Fire interval',
  damage: 'Damage',
  projectileSpeed: 'Projectile speed',
  range: 'Range',
  pierce: 'Pierce',
  projectileCount: 'Projectiles',
  spreadDeg: 'Spread',
});

function resolveBuildWeaponStats(
  build: WeaponBuild,
  definitions: ReadonlyMap<string, PartDefinition>,
  owned: ReadonlyMap<string, OwnedPart>,
  weapon: WeaponDefinition,
): EffectiveWeaponStats {
  const run = createRunState({ seed: 0, characterId: 'gunsmith-preview', arenaId: 'gunsmith-preview' });
  for (const modifier of [...resolveBuildModifiers(build, definitions, owned), ...resolveBuildTraitModifiers(build, definitions, owned)]) {
    run.stats.add(modifier);
  }
  return resolveWeaponStats(run, weapon);
}

function formatResolvedStat(key: keyof EffectiveWeaponStats, value: number): string {
  const rounded = Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
  return key === 'intervalMs' ? `${rounded}ms` : key === 'spreadDeg' ? `${rounded}°` : rounded;
}

function catalogCandidateComparison(
  selected: Build | undefined,
  definition: PartDefinition,
  catalogState: GunsmithCatalogPartView['state'],
  tier: number,
  gunsmith: GunsmithState,
  registry: DataPartRegistry,
  weapon: WeaponDefinition | undefined,
): string {
  if (selected === undefined) return 'Choose a build to compare.';
  if (!isSlotCompatible(selected.baseWeaponFamily, definition.slot)) return `Does not fit ${familyName(selected.baseWeaponFamily)}.`;
  const occupied = definition.slot === 'trait'
    ? selected.traitParts.length >= MAX_TRAIT_CORES_PER_BUILD
    : selected.fitted[definition.slot] !== undefined;
  const effects = formatPartEffects(definition, tier).join(' • ') || [...definition.traits].join(' / ') || 'No mechanical change';
  return occupied ? `${gunsmithSlotLabel(definition.slot)} occupied. Candidate: ${effects}`
    : (() => {
      const previewId = '__catalog-preview__';
      const previewState: GunsmithState = {
        ...gunsmith,
        parts: { ...gunsmith.parts, [previewId]: { partId: definition.id, tier, infusedTraits: [] } },
      };
      const fitted = equipPart(selected, { instanceId: previewId, partId: definition.id, tier, infusedTraits: [] }, registry.asMap());
      if (!fitted.ok) return `${catalogState === 'locked' || catalogState === 'reward-only' ? 'When acquired' : 'Candidate'}: ${effects}`;
      return buildComparison(selected, fitted.build, previewState, registry, weapon);
    })();
}

function acquisitionSourceLabel(partId: string, fabricationCost: number | undefined, context: GameContext): string {
  const labels: string[] = [];
  if (fabricationCost !== undefined) labels.push(`Fabricate for ${fabricationCost} Scrap`);
  const rewardProfiles = new Map((context.data.rewardProfiles ?? []).map((reward) => [reward.id, reward] as const));
  for (const stage of context.data.stages ?? []) {
    const reward = rewardProfiles.get(stage.rewardProfileId);
    if (reward?.grants?.some((grant) => ('partId' in grant && grant.partId === partId))) labels.push(`First clear: ${stage.name}`);
  }
  for (const achievement of context.data.achievements ?? []) {
    if (achievement.rewards?.some(({ grant }) => ('partId' in grant && grant.partId === partId))) labels.push(`Achievement: ${achievement.name}`);
  }
  return labels.join(' • ') || 'Earn from rewards';
}

function describeCondition(condition: ProgressionCondition, context: GameContext): string {
  const stageName = (id: string): string => context.data.stages?.find((stage) => stage.id === id)?.name ?? id;
  const achievementName = (id: string): string => context.data.achievements?.find((achievement) => achievement.id === id)?.name ?? id;
  switch (condition.type) {
    case 'always': return 'Available from the start.';
    case 'stage-cleared': return `Clear ${stageName(condition.stageId)}.`;
    case 'boss-defeated': return `Defeat ${context.data.enemies.find((enemy) => enemy.id === condition.bossId)?.name ?? condition.bossId.replace(/^enemy:/, '').replaceAll('-', ' ')}.`;
    case 'achievement-completed': return `Complete ${achievementName(condition.achievementId)}.`;
    case 'mastery-reached': return `Reach mastery tier ${condition.tier}.`;
    case 'owns-content': return `Acquire ${condition.contentId.replace(/^[^:]+:/, '').replaceAll('-', ' ')}.`;
    case 'scrap-total': return `Bank ${condition.threshold} Scrap.`;
    case 'permanent-level': return `Reach permanent upgrade level ${condition.minLevel}.`;
    case 'unlock-count': return `Unlock ${condition.minCount} items.`;
    case 'all': return condition.conditions.map((child) => describeCondition(child, context)).join(' ');
    case 'any': return condition.conditions.map((child) => describeCondition(child, context)).join(' Or ');
    case 'not': return `Not: ${describeCondition(condition.condition, context)}`;
  }
}
