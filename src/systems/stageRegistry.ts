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

export class StageRegistry {
  private readonly stagesById = new Map<string, Readonly<StageDefinition>>();
  private readonly stagesByChapter = new Map<string, Readonly<StageDefinition>[]>();
  private readonly encounterProfilesById = new Map<string, Readonly<EncounterProfile>>();
  private readonly difficultyProfilesById = new Map<string, Readonly<DifficultyProfile>>();
  private readonly rewardProfilesById = new Map<string, Readonly<RewardProfile>>();
  private readonly stageIds: readonly string[];

  constructor(data: { stages?: readonly StageDefinition[]; encounterProfiles?: readonly EncounterProfile[]; difficultyProfiles?: readonly DifficultyProfile[]; rewardProfiles?: readonly RewardProfile[] }) {
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

    this.stageIds = Object.freeze([...canonicalStages.map((s) => s.id)]);

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
  }

  /** Returns all stage IDs in display order within each chapter. */
  allStageIds(): readonly string[] {
    return this.stageIds;
  }

  /** Returns all stage definitions in display order. */
  allStages(): readonly StageDefinition[] {
    return [...this.stagesById.values()].sort((a, b) => a.displayOrder - b.displayOrder);
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

  /** Returns the objective type for a stage. */
  objectiveForStage(stageId: string): ObjectiveType | undefined {
    return this.stagesById.get(stageId)?.objective;
  }

  /** Returns the arena ID for a stage. */
  arenaIdForStage(stageId: string): string | undefined {
    return this.stagesById.get(stageId)?.arenaId;
  }
}
