/**
 * Achievement registry — validated-clone + deepFreeze of the achievement
 * catalog, following the established registry pattern (#94 P1-1). Also hosts
 * the registered metric extractors: stable metric IDs → pure extractors over
 * AchievementFacts. Adding an achievement that uses existing metrics is
 * data-only; a genuinely new metric registers one extractor here.
 */
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
]);

export function registeredMetricIds(): readonly string[] {
  return [...METRIC_EXTRACTORS.keys()];
}

export function metricExtractor(metricId: string): MetricExtractor | undefined {
  return METRIC_EXTRACTORS.get(metricId);
}
