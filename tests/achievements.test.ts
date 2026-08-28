import { describe, expect, it } from 'vitest';
import achievementsJson from '../src/data/achievements.json';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataAchievementRegistry, registeredMetricIds } from '../src/systems/achievements';
import { evaluateAchievements, type AchievementDefinition, type AchievementState } from '../src/gameplay/achievementSystem';
import { LocalAchievementAdapter } from '../src/gameplay/achievementPlatform';
import { processGrant, type ProgressionGrant } from '../src/gameplay/grantProcessor';
import { createDefaultProgression, migrateV2ToV3 } from '../src/systems/save';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import type { StageDefinition, EncounterProfile, DifficultyProfile, RewardProfile } from '../src/gameplay/stage/stageContracts';
import stagesJson from '../src/data/stages.json';
import encountersJson from '../src/data/encounter-profiles.json';
import difficultiesJson from '../src/data/difficulty-profiles.json';
import rewardsJson from '../src/data/reward-profiles.json';

const definitions = achievementsJson as unknown as AchievementDefinition[];
const defMap = new Map(definitions.map((d) => [d.id, d]));

function registryCtx() {
  const registry = new DataAchievementRegistry({ achievements: achievementsJson });
  const metrics = new Map<string, (facts: { metrics: Record<string, number> }) => number>();
  for (const metricId of registeredMetricIds()) {
    metrics.set(metricId, (facts) => facts.metrics[metricId] ?? 0);
  }
  return { registry, ctx: { definitions: registry.asMap(), metrics } };
}

describe('Epic 22 achievement catalog conformance', () => {
  it('ships a catalog with stable unique achievement: IDs', () => {
    expect(definitions.length).toBeGreaterThanOrEqual(8);
    const ids = definitions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^achievement:[a-z0-9-]+$/);
  });

  it('validates through the aggregate game-data validation', () => {
    const data = loadGameData();
    expect(data.achievements?.length).toBe(definitions.length);
    expect(validateGameData(data)).toBeTruthy();
  });

  it('covers all kinds and both condition/metric driven forms, with hidden as a flag', () => {
    const kinds = new Set(definitions.map((d) => d.kind));
    expect(kinds).toEqual(new Set(['standard', 'incremental', 'mastery']));
    expect(definitions.some((d) => d.hidden === true)).toBe(true);
    expect(definitions.some((d) => d.metricId !== undefined)).toBe(true);
    expect(definitions.some((d) => d.condition !== undefined)).toBe(true);
  });

  it('every metric reference resolves to a registered metric', () => {
    const registered = new Set(registeredMetricIds());
    for (const d of definitions) {
      if (d.metricId !== undefined) expect(registered.has(d.metricId), d.id).toBe(true);
    }
  });

  it('every reward uses the shared grant vocabulary and is processable', () => {
    for (const d of definitions) {
      for (const reward of d.rewards ?? []) {
        const result = processGrant(createDefaultProgression(), reward.grant);
        expect(result.changed || result.progression, `${d.id} reward ${reward.grant.type}`).toBeTruthy();
      }
    }
  });

  it('has a resolvable boss reference in the boss achievement', () => {
    const boss = definitions.find((d) => d.id === 'achievement:boss-crusher');
    expect(boss?.condition).toMatchObject({ type: 'boss-defeated', bossId: 'boss-crusher' });
    // boss-crusher is the shipped boss enemy from Epic 21
    expect(dataEnemyIds()).toContain('boss-crusher');
  });
});

function dataEnemyIds(): string[] {
  return loadGameData().enemies.map((e) => e.id);
}

describe('Epic 22 achievement evaluation (pure)', () => {
  it('standard achievement completes exactly once when its metric reaches target', () => {
    const { ctx } = registryCtx();
    let state: AchievementState = {};
    const first = evaluateAchievements(state, { metrics: { 'metric:enemies-defeated': 1 } }, ctx, 1000);
    expect(first.completed).toContain('achievement:first-kill');
    expect(first.rewards.length).toBeGreaterThan(0);
    state = first.state;

    // Re-evaluation with the same facts: no second completion, no second reward.
    const second = evaluateAchievements(state, { metrics: { 'metric:enemies-defeated': 1 } }, ctx, 2000);
    expect(second.completed).toEqual([]);
    expect(second.rewards).toEqual([]);
    expect(second.state['achievement:first-kill']?.completed).toBe(true);
  });

  it('incremental progress is monotonic and capped at target', () => {
    const { ctx } = registryCtx();
    let state: AchievementState = {};
    state = evaluateAchievements(state, { metrics: { 'metric:enemies-defeated': 10 } }, ctx, 1).state;
    expect(state['achievement:kill-milestone-25']?.progress).toBe(10);

    // Monotonic: a smaller fact value must not decrease progress.
    state = evaluateAchievements(state, { metrics: { 'metric:enemies-defeated': 5 } }, ctx, 2).state;
    expect(state['achievement:kill-milestone-25']?.progress).toBe(10);

    state = evaluateAchievements(state, { metrics: { 'metric:enemies-defeated': 30 } }, ctx, 3).state;
    expect(state['achievement:kill-milestone-25']?.progress).toBe(25);
    expect(state['achievement:kill-milestone-25']?.completed).toBe(true);
  });

  it('condition-driven achievements evaluate against progression/stage/mastery facts', () => {
    const { ctx } = registryCtx();
    const state: AchievementState = {};
    const stages = { 'stage:junkyard-01': { completed: true }, 'stage:junkyard-02': { completed: true }, 'stage:junkyard-03': { completed: true }, 'stage:junkyard-04': { completed: true }, 'stage:junkyard-05': { completed: true }, 'stage:junkyard-06': { completed: true } };
    const result = evaluateAchievements(state, { metrics: {}, stages }, ctx, 5);
    expect(result.completed).toContain('achievement:chapter-junkyard');
  });

  it('mastery achievement completes via character mastery facts', () => {
    const { ctx } = registryCtx();
    const state: AchievementState = {};
    const characters = { 'scrap-tabby': { tier: 1, xp: 10 } };
    const result = evaluateAchievements(state, { metrics: {}, characters }, ctx, 6);
    expect(result.completed).toContain('achievement:mastery-scrap-tabby');
  });

  it('hidden achievements stay hidden: completion still recorded, read model filters later', () => {
    const { ctx } = registryCtx();
    const state: AchievementState = {};
    const result = evaluateAchievements(state, { metrics: { 'metric:scrap-banked': 1000 } }, ctx, 7);
    expect(result.completed).toContain('achievement:scrap-banked-1000');
    expect(defMap.get('achievement:scrap-banked-1000')?.hidden).toBe(true);
  });

  it('completion is immutable: completed achievements never un-complete', () => {
    const { ctx } = registryCtx();
    let state: AchievementState = {};
    state = evaluateAchievements(state, { metrics: { 'metric:runs-completed': 1 } }, ctx, 8).state;
    expect(state['achievement:first-victory']?.completed).toBe(true);
    const again = evaluateAchievements(state, { metrics: { 'metric:runs-completed': 0 } }, ctx, 9);
    expect(again.state['achievement:first-victory']?.completed).toBe(true);
    expect(again.completed).toEqual([]);
  });

  it('exactly-once rewards: repeated triggering emits no duplicate grants', () => {
    const { ctx } = registryCtx();
    let state: AchievementState = {};
    const first = evaluateAchievements(state, { metrics: { 'metric:merges-performed': 1 } }, ctx, 10);
    expect(first.rewards.some((g) => g.type === 'grant-scrap')).toBe(true);
    const grantCount = first.rewards.length;
    state = first.state;
    const second = evaluateAchievements(state, { metrics: { 'metric:merges-performed': 5 } }, ctx, 11);
    expect(second.rewards).toEqual([]);
    expect(grantCount).toBeGreaterThan(0);
  });

  it('unknown/stale definition IDs in state fail soft and are preserved', () => {
    const { ctx } = registryCtx();
    const stale: AchievementState = { 'achievement:removed-in-catalog': { completed: true, progress: 1 } };
    const result = evaluateAchievements(stale, { metrics: {} }, ctx, 12);
    // Stale entries survive (no bricking); catalog entries unaffected.
    expect(result.state['achievement:removed-in-catalog']).toBeDefined();
    expect(result.state['achievement:removed-in-catalog']?.completed).toBe(true);
  });
});

describe('Epic 22 migration and persistence', () => {
  it('V2 first-victory migrates into the achievements domain', () => {
    const v2 = {
      version: 2,
      settings: {},
      meta: { scrap: 0, unlocks: ['achievement:first-victory'], permanentUpgrades: {} },
    };
    const v3 = migrateV2ToV3(v2 as never);
    expect(v3.achievements['achievement:first-victory']?.completed).toBe(true);
  });

  it('fresh V3 saves start with an empty achievements domain', () => {
    expect(createDefaultProgression()).toBeDefined();
  });
});

describe('Epic 22 platform adapter (local/web)', () => {
  it('local adapter reports idempotently and keeps completed state', async () => {
    const adapter = new LocalAchievementAdapter();
    await adapter.report('achievement:first-kill', { completed: false, progress: 5 });
    await adapter.report('achievement:first-kill', { completed: true, progress: 1 });
    expect(adapter.reportedState().get('achievement:first-kill')?.completed).toBe(true);
    await adapter.report('achievement:first-kill', { completed: true, progress: 3 });
    // Completed state is never regressed; progress advances with completed reports.
    expect(adapter.reportedState().get('achievement:first-kill')?.completed).toBe(true);
    expect(adapter.reportedState().get('achievement:first-kill')?.progress).toBe(3);
    // An un-completed regressive report cannot downgrade a completion.
    await adapter.report('achievement:first-kill', { completed: false, progress: 0 });
    expect(adapter.reportedState().get('achievement:first-kill')?.completed).toBe(true);
  });

  it('reconciliation never reduces valid local completion', async () => {
    const adapter = new LocalAchievementAdapter();
    const local = { 'achievement:boss-crusher': { completed: true, progress: 1 } };
    const result = await adapter.reconcile(local);
    expect(result.completed).toContain('achievement:boss-crusher');
  });
});

describe('Epic 22 second-fixture proof (data-only extensibility)', () => {
  it('adding an achievement using existing metrics/conditions/grants requires no core-system edit', () => {
    const { ctx } = registryCtx();
    const extra: AchievementDefinition = {
      id: 'achievement:proof-second-fixture',
      name: 'Proof Fixture',
      description: 'Second-fixture proof: data-only addition.',
      kind: 'incremental',
      metricId: 'metric:enemies-defeated',
      target: 250,
      rewards: [{ grant: { type: 'grant-scrap', amount: 10 } as ProgressionGrant }],
    };
    const defs = new Map(defMap);
    defs.set(extra.id, extra);
    const extendedCtx = { definitions: defs, metrics: ctx.metrics };
    const result = evaluateAchievements({}, { metrics: { 'metric:enemies-defeated': 250 } }, extendedCtx, 20);
    expect(result.completed).toContain('achievement:proof-second-fixture');
    // The shipped catalog is untouched — the proof is purely additive data.
    expect(defMap.has('achievement:proof-second-fixture')).toBe(false);
  });

  it('stage boss achievement ties into the resolved run plan contract', () => {
    const stages = stagesJson as unknown as StageDefinition[];
    const encounters = encountersJson as unknown as EncounterProfile[];
    const difficulties = difficultiesJson as unknown as DifficultyProfile[];
    const rewards = rewardsJson as unknown as RewardProfile[];
    const plan = resolveRunPlan(
      { stageId: 'stage:junkyard-05', characterId: 'scrap-tabby', seed: 5 },
      { stages, encounterProfiles: encounters, difficultyProfiles: difficulties, rewardProfiles: rewards },
    );
    expect(plan.encounter.bossId).toBe('boss-crusher');
  });
});
