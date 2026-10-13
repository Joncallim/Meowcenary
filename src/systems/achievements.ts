import { resolveBuildTraits, type OwnedPart, type BehaviorTrait } from '../gameplay/gunsmith';
/**
 * Achievement registry — validated-clone + deepFreeze of the achievement
 * catalog, following the established registry pattern (#94 P1-1). Also hosts
 * the registered metric extractors: stable metric IDs → pure extractors over
 * AchievementFacts. Adding an achievement that uses existing metrics is
 * data-only; a genuinely new metric registers one extractor here.
 */
import { getFamilySlots } from '../gameplay/weaponFamilies';
import { deepFreeze } from '../engine/freeze';
import type { AchievementDefinition } from '../gameplay/achievementSystem';
import type { MetricExtractor } from '../gameplay/achievementSystem';
import { validateAchievementCatalog } from './validation';

export class DataAchievementRegistry {
  private readonly byId = new Map<string, AchievementDefinition>();
  private readonly snapshot: readonly AchievementDefinition[];

  constructor(data: { achievements: unknown }) {
    const validated = validateAchievementCatalog(data.achievements);
    const canonical = validated.map((a) => deepFreeze(structuredClone(a)));

    for (const achievement of canonical) {
      if (this.byId.has(achievement.id)) {
        throw new Error(`Duplicate achievement id "${achievement.id}"`);
      }
      this.byId.set(achievement.id, achievement);
    }
    this.snapshot = Object.freeze([...canonical]);
  }

  achievementById(id: string): AchievementDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly AchievementDefinition[] {
    return this.snapshot;
  }

  asMap(): ReadonlyMap<string, AchievementDefinition> {
    return this.byId;
  }
}

/** Registered metric extractors over AchievementFacts (pure, Phaser-free). */
const METRIC_EXTRACTORS: ReadonlyMap<string, MetricExtractor> = new Map<string, MetricExtractor>([
  ['metric:enemies-defeated', (facts) => facts.metrics['metric:enemies-defeated'] ?? 0],
  ['metric:merges-performed', (facts) => facts.metrics['metric:merges-performed'] ?? 0],
  ['metric:runs-completed', (facts) => facts.metrics['metric:runs-completed'] ?? 0],
  ['metric:scrap-banked', (facts) => facts.metrics['metric:scrap-banked'] ?? 0],
  ['metric:contracts-cleared-under-180s', (facts) => (facts.catalog?.stages ?? []).filter((stage) => {
    // Fixed-duration survival cannot demonstrate faster completion.
    if (stage.objective.type === 'survive') return false;
    const progress = facts.stages?.[stage.id];
    return progress?.completed === true && progress.bestTimeMs !== undefined && progress.bestTimeMs > 0 && progress.bestTimeMs <= 180_000;
  }).length],
  ['metric:engineered-families', (facts) => {
    const definitions = new Map((facts.catalog?.gunParts ?? []).map((part) => [part.id, part]));
    return new Set((facts.gunsmith?.builds ?? []).filter((build) => {
      const distinctParts = new Set<string>();
      for (const slot of getFamilySlots(build.baseWeaponFamily)) {
        const instanceId = build.fitted[slot];
        const instance = instanceId ? facts.gunsmith?.parts[instanceId] : undefined;
        const definition = instance ? definitions.get(instance.partId) : undefined;
        if (definition?.slot === slot) distinctParts.add(definition.id);
      }
      return distinctParts.size >= 3;
    }).map((build) => build.baseWeaponFamily)).size;
  }],
  ['metric:engineered-traits', (facts) => {
    const definitions = new Map((facts.catalog?.gunParts ?? []).map((part) => [part.id, part]));
    const parts = new Map<string, OwnedPart>(Object.entries(facts.gunsmith?.parts ?? {}).map(([instanceId, part]) => [instanceId, { instanceId, ...part, infusedTraits: part.infusedTraits as readonly BehaviorTrait[] }]));
    return Math.max(0, ...(facts.gunsmith?.builds ?? []).map((build) => resolveBuildTraits(build, definitions, parts).length));
  }],
  ['metric:equipment-tier-4', (facts) => {
    const known = new Set((facts.catalog?.equipment ?? []).map((piece) => piece.id));
    return new Set(Object.values(facts.equipment ?? {}).filter((piece) => known.has(piece.equipmentId) && piece.tier >= 4).map((piece) => piece.equipmentId)).size;
  }],
]);

export function registeredMetricIds(): readonly string[] {
  return [...METRIC_EXTRACTORS.keys()];
}

export function metricExtractor(metricId: string): MetricExtractor | undefined {
  return METRIC_EXTRACTORS.get(metricId);
}

/** These goals describe a simultaneous loadout, so unfinished UI shows current facts. */
export function isSnapshotAchievementMetric(id: string): boolean {
  return ['metric:engineered-families', 'metric:engineered-traits', 'metric:equipment-tier-4'].includes(id);
}
