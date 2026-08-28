import { describe, expect, it } from 'vitest';
import stagesJson from '../src/data/stages.json';
import encountersJson from '../src/data/encounter-profiles.json';
import difficultiesJson from '../src/data/difficulty-profiles.json';
import rewardsJson from '../src/data/reward-profiles.json';
import { loadGameData } from '../src/systems/validation';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataEnemyRegistry } from '../src/systems/enemies';
import { DataLootTableRegistry } from '../src/systems/lootTables';
import type { StageDefinition, EncounterProfile, DifficultyProfile, RewardProfile } from '../src/gameplay/stage/stageContracts';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';

/**
 * Generic stage conformance (Epic 20 acceptance):
 * every shipped stage must have a stable/unique ID, resolvable arena/objective/
 * encounter/difficulty/reward/unlock references, a legal init→completion path,
 * and required asset/bundle coverage. A new stage added via data only must
 * satisfy this suite without any scene/objective-core/save-schema change.
 */
describe('Epic 20 stage catalog conformance', () => {
  const stages = stagesJson as readonly StageDefinition[];
  const encounters = encountersJson as unknown as readonly EncounterProfile[];
  const difficulties = difficultiesJson as readonly DifficultyProfile[];
  const rewards = rewardsJson as readonly RewardProfile[];

  it('ships the six-stage first chapter in display order', () => {
    expect(stages).toHaveLength(6);
    expect(new Set(stages.map((s) => s.chapterId))).toEqual(new Set(['chapter:junkyard']));
    const orders = stages.map((s) => s.displayOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('uses stable namespaced unique stage IDs (never display numbers as save keys)', () => {
    const ids = stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^stage:[a-z0-9-]+$/);
  });

  it('covers the required objective variety: kill, collect, survive, elite, boss', () => {
    const types = stages.map((s) => s.objective.type).sort();
    expect(types).toEqual(['collect', 'defeat', 'defeat', 'kill', 'kill', 'survive']);
    // Boss milestone is stage 5 (defeat of a named enemy)
    expect(stages[4].objective).toMatchObject({ type: 'defeat' });
  });

  it('resolves every stage to real arenas from the validated arena registry', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    for (const stage of stages) {
      expect(arenas.arenaById(stage.arenaId), `arena ${stage.arenaId}`).toBeDefined();
    }
  });

  it('resolves every encounter profile against real enemy definitions', () => {
    const data = loadGameData();
    const enemies = new DataEnemyRegistry(data);
    for (const ep of encounters) {
      expect(ep.enemyIds.length, `encounter ${ep.id}`).toBeGreaterThan(0);
      for (const enemyId of ep.enemyIds) {
        expect(enemies.enemyById(enemyId), `enemy ${enemyId} in ${ep.id}`).toBeDefined();
      }
    }
  });

  it('maps every shipped boss to one explicit defeat-stage encounter', () => {
    const data = loadGameData();
    const bosses = data.enemies.filter((enemy) => enemy.archetype === 'boss').map((enemy) => enemy.id);
    for (const bossId of bosses) {
      const matches = stages.filter((stage) => stage.bossId === bossId && stage.objective.type === 'defeat' && stage.objective.enemyId === bossId);
      expect(matches, `stage for ${bossId}`).toHaveLength(1);
      const encounter = encounters.find((candidate) => candidate.id === matches[0].encounterProfileId);
      expect(encounter?.bossId, `encounter for ${bossId}`).toBe(bossId);
    }
  });

  it('resolves every reward loot table against the loot registry', () => {
    const data = loadGameData();
    const loot = new DataLootTableRegistry(data);
    for (const rp of rewards) {
      expect(rp.lootTableId, `loot table ref on ${rp.id}`).toBeDefined();
      if (rp.lootTableId !== undefined) {
        expect(loot.lootTableById(rp.lootTableId), `loot table ${rp.lootTableId}`).toBeDefined();
      }
    }
  });

  it('has strictly ordered unlock chain: each stage unlocks the next', () => {
    expect(stages[0].unlock).toMatchObject({ type: 'unlock-count', minCount: 0 });
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].unlock).toMatchObject({ type: 'stage-cleared', stageId: stages[i - 1].id });
    }
  });

  it('resolves every stage into a complete ResolvedRunPlan', () => {
    const data = {
      stages,
      encounterProfiles: encounters,
      difficultyProfiles: difficulties,
      rewardProfiles: rewards,
    };
    for (const stage of stages) {
      const plan = resolveRunPlan(
        { stageId: stage.id, characterId: 'scrap-tabby', seed: 1 },
        data,
      );
      expect(plan.stageId).toBe(stage.id);
      expect(plan.objective.definition.type).toBe(stage.objective.type);
      expect(plan.encounter.enemyIds.length).toBeGreaterThan(0);
      expect(plan.difficulty.healthMultiplier).toBeGreaterThan(0);
      expect(Number.isFinite(plan.reward.scrapBase)).toBe(true);
      expect(Object.isFrozen(plan)).toBe(true);
    }
  });

  it('every stage has a legal init→completion path for its objective type', () => {
    for (const stage of stages) {
      const obj = stage.objective;
      switch (obj.type) {
        case 'kill':
          expect(obj.count).toBeGreaterThan(0);
          break;
        case 'collect':
          expect(obj.count).toBeGreaterThan(0);
          expect(obj.itemId).toMatch(/^(?:item|drop):/);
          break;
        case 'survive':
          expect(obj.seconds).toBeGreaterThan(0);
          break;
        case 'defeat':
          expect(obj.enemyId.length).toBeGreaterThan(0);
          break;
        default:
          expect.unreachable(`unknown objective type ${(obj as { type: string }).type}`);
      }
    }
  });

  it('second-fixture proof: adding a sixth data-only stage requires no scene/schema change', () => {
    const sixth: StageDefinition = {
      id: 'stage:junkyard-06-proof',
      name: 'Proof Stage',
      chapterId: 'chapter:junkyard',
      displayOrder: 6,
      arenaId: stages[0].arenaId,
      assetBundleId: stages[0].assetBundleId,
      objective: { type: 'kill', count: 5 },
      encounterProfileId: encounters[0].id,
      difficultyProfileId: difficulties[0].id,
      rewardProfileId: rewards[0].id,
      unlock: { type: 'stage-cleared', stageId: stages[4].id },
    };
    const data = {
      stages: [...stages, sixth],
      encounterProfiles: encounters,
      difficultyProfiles: difficulties,
      rewardProfiles: rewards,
    };
    // The generic resolver + conformance machinery accepts it without any
    // core-system source change — this is the data-only extensibility proof.
    const plan = resolveRunPlan(
      { stageId: sixth.id, characterId: 'scrap-tabby', seed: 7 },
      data,
    );
    expect(plan.stageId).toBe('stage:junkyard-06-proof');
    expect(plan.objective.definition.type).toBe('kill');
  });
});
