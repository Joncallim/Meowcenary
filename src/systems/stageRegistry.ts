/**
 * Stage registry — validated-clone/deep-freeze lookup for stage definitions,
 * encounter profiles, difficulty profiles, and reward profiles.
 * Follows the DataWeaponRegistry pattern.
 */
import { deepFreeze } from '../engine/freeze';
import type {
  StageDefinition,
  EncounterProfile,
  DifficultyProfile,
  RewardProfile,
  ObjectiveType,
} from '../gameplay/stage/stageContracts';
import type { AssetBundleDefinition } from './types';

/** Return stage contracts which must be cleared before an unlock can become
 * true. Conditions are validated data but deliberately remain structural here
 * so a future condition form does not require a StageRegistry ID branch. */
function prerequisiteStageIds(
  condition: unknown,
  stageForBoss: ReadonlyMap<string, string>,
): readonly string[] {
  if (!condition || typeof condition !== 'object') return [];
  const value = condition as Record<string, unknown>;
  if (value.type === 'stage-cleared' && typeof value.stageId === 'string') return [value.stageId];
  if (value.type === 'boss-defeated' && typeof value.bossId === 'string') {
    const stageId = stageForBoss.get(value.bossId);
    return stageId === undefined ? [] : [stageId];
  }
  if ((value.type === 'all' || value.type === 'any') && Array.isArray(value.conditions)) {
    return value.conditions.flatMap((child) => prerequisiteStageIds(child, stageForBoss));
  }
  // `not` may be satisfied before any stage; treating it as a prerequisite
  // would make a menu order depend on a contract the player must avoid.
  return [];
}

export class StageRegistry {
  private readonly stagesById = new Map<string, Readonly<StageDefinition>>();
  private readonly stagesByChapter = new Map<string, Readonly<StageDefinition>[]>();
  private readonly encounterProfilesById = new Map<string, Readonly<EncounterProfile>>();
  private readonly difficultyProfilesById = new Map<string, Readonly<DifficultyProfile>>();
  private readonly rewardProfilesById = new Map<string, Readonly<RewardProfile>>();
  private readonly assetBundlesById = new Map<string, Readonly<AssetBundleDefinition>>();
  private readonly stageIds: readonly string[];

  constructor(data: { stages?: readonly StageDefinition[]; encounterProfiles?: readonly EncounterProfile[]; difficultyProfiles?: readonly DifficultyProfile[]; rewardProfiles?: readonly RewardProfile[]; assetBundles?: readonly AssetBundleDefinition[] }) {
    // Deep-clone and freeze stages
    const stages = data.stages ?? [];
    const canonicalStages = stages.map((stage) => deepFreeze(structuredClone(stage)));
    for (const stage of canonicalStages) {
      this.stagesById.set(stage.id, stage);
      const chapterStages = this.stagesByChapter.get(stage.chapterId) ?? [];
      chapterStages.push(stage);
      this.stagesByChapter.set(stage.chapterId, chapterStages);
    }
    // Sort chapter stages by displayOrder
    for (const [, stages] of this.stagesByChapter) {
      stages.sort((a, b) => a.displayOrder - b.displayOrder);
    }

    // A chapter-local display order alone is ambiguous once a catalog has
    // multiple chapters.  Derive the menu order from the authored unlock
    // chain instead: this keeps Stage N after the stage that unlocks it,
    // independent of JSON ordering, without turning display numbers into
    // persistent/global identities.
    const progressionDepth = new Map<string, number>();
    const resolving = new Set<string>();
    const stageForBoss = new Map<string, string>();
    for (const stage of canonicalStages) {
      if (stage.bossId !== undefined) stageForBoss.set(stage.bossId, stage.id);
    }
    const depthFor = (stage: Readonly<StageDefinition>): number => {
      const cached = progressionDepth.get(stage.id);
      if (cached !== undefined) return cached;
      if (resolving.has(stage.id)) return 0;
      resolving.add(stage.id);
      const parents = prerequisiteStageIds(stage.unlock, stageForBoss)
        .map((parentId) => this.stagesById.get(parentId))
        .filter((parent): parent is Readonly<StageDefinition> => parent !== undefined);
      // Keep a composite/unlock-gated stage after every named prerequisite.
      // This is conservative for `any`, but never presents a later locked
      // contract ahead of the playable ladder.
      const depth = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => depthFor(parent) + 1));
      resolving.delete(stage.id);
      progressionDepth.set(stage.id, depth);
      return depth;
    };
    this.stageIds = Object.freeze([...canonicalStages]
      .sort((a, b) => depthFor(a) - depthFor(b) || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
      .map((stage) => stage.id));

    // Deep-clone and freeze encounter profiles
    for (const ep of data.encounterProfiles ?? []) {
      this.encounterProfilesById.set(ep.id, deepFreeze(structuredClone(ep)));
    }

    // Deep-clone and freeze difficulty profiles
    for (const dp of data.difficultyProfiles ?? []) {
      this.difficultyProfilesById.set(dp.id, deepFreeze(structuredClone(dp)));
    }

    // Deep-clone and freeze reward profiles
    for (const rp of data.rewardProfiles ?? []) {
      this.rewardProfilesById.set(rp.id, deepFreeze(structuredClone(rp)));
    }

    // Bundle resolution lives beside the stage registry, so a future loader
    // can request exactly the selected stage's declared assets without
    // introducing a parallel ID table or stage-specific branch.
    for (const bundle of data.assetBundles ?? []) {
      this.assetBundlesById.set(bundle.id, deepFreeze(structuredClone(bundle)));
    }
  }

  /** Returns all stage IDs in display order within each chapter. */
  allStageIds(): readonly string[] {
    return this.stageIds;
  }

  /** Returns all stage definitions in display order. */
  allStages(): readonly StageDefinition[] {
    return this.stageIds.map((id) => this.stagesById.get(id)!);
  }

  /** Look up a stage by its stable ID. */
  stageById(id: string): StageDefinition | undefined {
    return this.stagesById.get(id);
  }

  /** Returns all stages for a given chapter, ordered by displayOrder. */
  stagesByChapterId(chapterId: string): readonly StageDefinition[] {
    return [...(this.stagesByChapter.get(chapterId) ?? [])];
  }

  /** Returns the default stage ID (first in display order). */
  defaultStageId(): string {
    const all = this.allStages();
    return all.length > 0 ? all[0].id : '';
  }

  /** Look up an encounter profile by its stable ID. */
  encounterProfileById(id: string): EncounterProfile | undefined {
    return this.encounterProfilesById.get(id);
  }

  /** Look up a difficulty profile by its stable ID. */
  difficultyProfileById(id: string): DifficultyProfile | undefined {
    return this.difficultyProfilesById.get(id);
  }

  /** Look up a reward profile by its stable ID. */
  rewardProfileById(id: string): RewardProfile | undefined {
    return this.rewardProfilesById.get(id);
  }

  /** The validated/frozen catalog boundary consumed by run-plan resolution. */
  runPlanCatalog(): Readonly<{
    stages: readonly StageDefinition[];
    encounterProfiles: readonly EncounterProfile[];
    difficultyProfiles: readonly DifficultyProfile[];
    rewardProfiles: readonly RewardProfile[];
  }> {
    return Object.freeze({
      stages: this.allStages(),
      encounterProfiles: Object.freeze([...this.encounterProfilesById.values()]),
      difficultyProfiles: Object.freeze([...this.difficultyProfilesById.values()]),
      rewardProfiles: Object.freeze([...this.rewardProfilesById.values()]),
    });
  }

  /** Returns the objective type for a stage. */
  objectiveForStage(stageId: string): ObjectiveType | undefined {
    return this.stagesById.get(stageId)?.objective;
  }

  /** Returns the arena ID for a stage. */
  arenaIdForStage(stageId: string): string | undefined {
    return this.stagesById.get(stageId)?.arenaId;
  }

  /** Look up a declared content bundle by its canonical bundle ID. */
  assetBundleById(id: string): AssetBundleDefinition | undefined {
    return this.assetBundlesById.get(id);
  }

  /** Resolve the declared asset group for a stage without reconstructing IDs. */
  assetBundleForStage(stageId: string): AssetBundleDefinition | undefined {
    const stage = this.stagesById.get(stageId);
    return stage ? this.assetBundlesById.get(stage.assetBundleId) : undefined;
  }
}
