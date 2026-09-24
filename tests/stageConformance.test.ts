import { describe, expect, it } from 'vitest';
import stagesJson from '../src/data/stages.json';
import encountersJson from '../src/data/encounter-profiles.json';
import difficultiesJson from '../src/data/difficulty-profiles.json';
import rewardsJson from '../src/data/reward-profiles.json';
import spawnCurvesJson from '../src/data/spawn-curves.json';
import { collectGameDataErrors, loadGameData, validateGameData } from '../src/systems/validation';
import { DataArenaRegistry } from '../src/systems/arenas';
import { StageRegistry } from '../src/systems/stageRegistry';
import { DataEnemyRegistry } from '../src/systems/enemies';
import type { StageDefinition, EncounterProfile, DifficultyProfile, RewardProfile } from '../src/gameplay/stage/stageContracts';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { composeStageSpawnCurve } from '../src/gameplay/stage/spawnComposition';

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

  const reviewedContractMatrix = [
    ['stage:junkyard-01', 'First Scavenge', { type: 'kill', count: 25 }, 'encounter:junkyard-first-scavenge', 'difficulty:chapter-1-easy'],
    ['stage:junkyard-02', 'Scrap Run', { type: 'collect', itemId: 'drop:scrap', count: 14 }, 'encounter:junkyard-scrap-run', 'difficulty:chapter-1-easy'],
    ['stage:junkyard-03', 'Rusher Ambush', { type: 'survive', seconds: 120 }, 'encounter:junkyard-rusher-ambush', 'difficulty:chapter-1-medium'],
    ['stage:junkyard-04', 'Brute Force', { type: 'kill', count: 8, enemyTag: 'tank' }, 'encounter:junkyard-brute-force', 'difficulty:chapter-1-hard'],
    ['stage:junkyard-05', 'Scrap Crusher', { type: 'defeat', enemyId: 'boss-crusher' }, 'encounter:junkyard-crusher-boss', 'difficulty:boss-crusher'],
    ['stage:forge-01', 'Hot Salvage', { type: 'collect', itemId: 'drop:scrap', count: 18 }, 'encounter:forge-hot-salvage', 'difficulty:forge-medium'],
    ['stage:forge-02', 'Smelter Rush', { type: 'survive', seconds: 120 }, 'encounter:forge-smelter-rush', 'difficulty:forge-medium'],
    ['stage:forge-03', 'Steel Wall', { type: 'kill', count: 10, enemyTag: 'shielded' }, 'encounter:forge-steel-wall', 'difficulty:forge-hard'],
    ['stage:forge-04', 'Cut the Feed', { type: 'kill', count: 12, enemyTag: 'ranged' }, 'encounter:forge-cut-the-feed', 'difficulty:forge-hard'],
    ['stage:junkyard-06', 'Forge Warden', { type: 'defeat', enemyId: 'boss-forge' }, 'encounter:forge-warden-boss', 'difficulty:boss-forge'],
  ] as const;

  it('ships two five-contract chapters in display order', () => {
    expect(stages).toHaveLength(10);
    for (const chapterId of ['chapter:junkyard', 'chapter:forge']) {
      const orders = stages.filter((stage) => stage.chapterId === chapterId).map((stage) => stage.displayOrder).sort((a, b) => a - b);
      expect(orders, chapterId).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('matches the reviewed ten-Contract objective, encounter, and difficulty matrix exactly', () => {
    expect(stages.map((stage) => [
      stage.id,
      stage.name,
      stage.objective,
      stage.encounterProfileId,
      stage.difficultyProfileId,
    ])).toEqual(reviewedContractMatrix);
  });

  it('ships the seven reviewed difficulty identities and tuning candidates', () => {
    expect(difficulties).toEqual([
      { id: 'difficulty:chapter-1-easy', healthMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1, spawnPressure: 0.2 },
      { id: 'difficulty:chapter-1-medium', healthMultiplier: 1.15, damageMultiplier: 1.08, speedMultiplier: 1.02, spawnPressure: 0.35 },
      { id: 'difficulty:chapter-1-hard', healthMultiplier: 1.3, damageMultiplier: 1.15, speedMultiplier: 1.04, spawnPressure: 0.5 },
      { id: 'difficulty:forge-medium', healthMultiplier: 1.35, damageMultiplier: 1.18, speedMultiplier: 1.05, spawnPressure: 0.45 },
      { id: 'difficulty:forge-hard', healthMultiplier: 1.55, damageMultiplier: 1.28, speedMultiplier: 1.08, spawnPressure: 0.6 },
      { id: 'difficulty:boss-crusher', healthMultiplier: 1.6, damageMultiplier: 1.25, speedMultiplier: 0.95, spawnPressure: 0.4 },
      { id: 'difficulty:boss-forge', healthMultiplier: 1.9, damageMultiplier: 1.4, speedMultiplier: 1, spawnPressure: 0.55 },
    ]);
  });

  it('preserves every reviewed encounter roster in authored pressure-layer order', () => {
    expect(encounters).toEqual([
      { id: 'encounter:junkyard-first-scavenge', enemyIds: ['dust-mite', 'scrap-skitter', 'junk-rusher', 'scrap-sniper'], compositionWeights: { 'dust-mite': 2, 'scrap-skitter': 1, 'junk-rusher': 1, 'scrap-sniper': 1 } },
      { id: 'encounter:junkyard-scrap-run', enemyIds: ['dust-mite', 'scrap-skitter', 'scrap-sniper', 'junk-nester', 'bastion-beetle'], compositionWeights: { 'dust-mite': 2, 'scrap-skitter': 2, 'scrap-sniper': 1, 'junk-nester': 1, 'bastion-beetle': 1 } },
      { id: 'encounter:junkyard-rusher-ambush', enemyIds: ['dust-mite', 'junk-rusher', 'scrap-skitter', 'shard-bot', 'bastion-beetle'], compositionWeights: { 'dust-mite': 2, 'junk-rusher': 2, 'scrap-skitter': 2, 'shard-bot': 1, 'bastion-beetle': 1 } },
      { id: 'encounter:junkyard-brute-force', enemyIds: ['dust-mite', 'trash-brute', 'bastion-beetle', 'shard-bot', 'junk-nester'], compositionWeights: { 'dust-mite': 2, 'trash-brute': 2, 'bastion-beetle': 1, 'shard-bot': 1, 'junk-nester': 1 } },
      { id: 'encounter:junkyard-crusher-boss', enemyIds: ['dust-mite', 'junk-rusher', 'bastion-beetle', 'scrap-sniper'], compositionWeights: { 'dust-mite': 2, 'junk-rusher': 1, 'bastion-beetle': 1, 'scrap-sniper': 1 }, bossId: 'boss-crusher' },
      { id: 'encounter:forge-hot-salvage', enemyIds: ['dust-mite', 'shard-bot', 'junk-nester', 'scrap-sniper', 'bastion-beetle'], compositionWeights: { 'dust-mite': 2, 'shard-bot': 2, 'junk-nester': 1, 'scrap-sniper': 1, 'bastion-beetle': 1 } },
      { id: 'encounter:forge-smelter-rush', enemyIds: ['dust-mite', 'junk-rusher', 'shard-bot', 'scrap-skitter', 'bastion-beetle'], compositionWeights: { 'dust-mite': 2, 'junk-rusher': 2, 'shard-bot': 2, 'scrap-skitter': 1, 'bastion-beetle': 1 } },
      { id: 'encounter:forge-steel-wall', enemyIds: ['dust-mite', 'bastion-beetle', 'junk-nester', 'trash-brute', 'scrap-sniper'], compositionWeights: { 'dust-mite': 2, 'bastion-beetle': 1, 'junk-nester': 1, 'trash-brute': 1, 'scrap-sniper': 1 } },
      { id: 'encounter:forge-cut-the-feed', enemyIds: ['dust-mite', 'scrap-sniper', 'junk-nester', 'junk-rusher', 'shard-bot', 'bastion-beetle'], compositionWeights: { 'dust-mite': 2, 'scrap-sniper': 1, 'junk-nester': 1, 'junk-rusher': 1, 'shard-bot': 1, 'bastion-beetle': 1 } },
      { id: 'encounter:forge-warden-boss', enemyIds: ['dust-mite', 'junk-rusher', 'shard-bot', 'junk-nester'], compositionWeights: { 'dust-mite': 2, 'junk-rusher': 1, 'shard-bot': 1, 'junk-nester': 1 }, bossId: 'boss-forge' },
    ]);
  });

  it('uses stable namespaced unique stage IDs (never display numbers as save keys)', () => {
    const ids = stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^stage:[a-z0-9-]+$/);
  });

  it('covers the required objective variety: kill, collect, survive, elite, boss', () => {
    const types = stages.map((s) => s.objective.type).sort();
    expect(types).toEqual(['collect', 'collect', 'defeat', 'defeat', 'kill', 'kill', 'kill', 'kill', 'survive', 'survive']);
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

  it('resolves each stage bundle and every bundled asset through the validated manifest', () => {
    const data = loadGameData();
    const stageRegistry = new StageRegistry(data);
    for (const stage of stages) {
      const bundle = data.assetBundles?.find((candidate) => candidate.id === stage.assetBundleId);
      expect(bundle, `bundle ${stage.assetBundleId}`).toBeDefined();
      expect(stageRegistry.assetBundleForStage(stage.id)?.id).toBe(stage.assetBundleId);
      expect(bundle?.resourceIds.length).toBeGreaterThan(0);
      for (const resourceId of bundle?.resourceIds ?? []) {
        expect(data.visualResources.some((resource) => resource.id === resourceId), `${stage.assetBundleId}/${resourceId}`).toBe(true);
      }
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

  it('places boss milestones every fifth contract within their chapter', () => {
    for (const stage of stages) {
      const isBoss = stage.bossId !== undefined;
      expect(isBoss, `${stage.id} at ${stage.chapterId}/${stage.displayOrder}`).toBe(stage.displayOrder % 5 === 0);
    }
  });

  it('has valid firstClearScrap for every reward profile', () => {
    for (const rp of rewards) {
      expect(rp.firstClearScrap, `firstClearScrap on ${rp.id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('has a strictly ordered unlock chain across chapters', () => {
    const first = stages.find((stage) => stage.id === 'stage:junkyard-01')!;
    expect(first.unlock).toEqual({ type: 'always' });
    for (const stage of stages.filter((candidate) => candidate.id !== first.id)) {
      expect(stage.unlock).toMatchObject({ type: 'stage-cleared' });
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
      expect(Number.isFinite(plan.reward.firstClearScrap)).toBe(true);
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

  it('keeps release encounter breadth and target-tag objectives physically producible', () => {
    const data = loadGameData();
    const enemiesById = new Map(data.enemies.map((enemy) => [enemy.id, enemy]));
    for (const stage of stages) {
      const encounter = encounters.find((candidate) => candidate.id === stage.encounterProfileId)!;
      if (stage.bossId === undefined) {
        expect(encounter.enemyIds.length, `${stage.id} non-boss roster`).toBeGreaterThanOrEqual(4);
      }
      if (stage.objective.type === 'survive' && stage.objective.seconds === 120) {
        expect(encounter.enemyIds.length, `${stage.id} survival roster`).toBeGreaterThanOrEqual(5);
      }
      if (stage.objective.type !== 'kill' || stage.objective.enemyTag === undefined) continue;
      const targetTag = stage.objective.enemyTag;
      const targetIds = encounter.enemyIds.filter((id) => enemiesById.get(id)?.archetype === targetTag);
      expect(targetIds.length, `${stage.id} target archetype`).toBeGreaterThan(0);
      const plan = resolveRunPlan(
        { stageId: stage.id, characterId: 'scrap-tabby', seed: 1 },
        { stages, encounterProfiles: encounters, difficultyProfiles: difficulties, rewardProfiles: rewards },
      );
      const legacy = spawnCurvesJson.find((curve) => curve.id === data.arenas.find((arena) => arena.id === stage.arenaId)?.spawnCurveId)!;
      const composed = composeStageSpawnCurve(legacy, plan);
      const targetWaves = composed.waves.filter((wave) => targetIds.includes(wave.enemyId));
      expect(targetWaves.length, `${stage.id} target wave`).toBeGreaterThan(0);
      const spawnOpportunities = targetWaves.reduce((total, wave) =>
        total + Math.floor(Math.max(0, composed.durationSeconds - wave.startSecond) * 1000 / wave.spawnEveryMs), 0);
      expect(spawnOpportunities, `${stage.id} target capacity`).toBeGreaterThanOrEqual(stage.objective.count);
    }
  });

  it('Contract-25 proof: existing primitives scale through data without scene/schema/validator registration', () => {
    const proofStages: StageDefinition[] = Array.from({ length: 15 }, (_, index) => ({
      id: `stage:proof-${String(index + 11).padStart(2, '0')}`,
      name: `Proof Contract ${index + 11}`,
      chapterId: 'chapter:proof',
      displayOrder: index + 1,
      arenaId: stages[0].arenaId,
      assetBundleId: stages[0].assetBundleId,
      objective: { type: 'kill', count: 5 },
      encounterProfileId: encounters[0].id,
      difficultyProfileId: difficulties[0].id,
      rewardProfileId: rewards[0].id,
      unlock: { type: 'stage-cleared', stageId: index === 0 ? stages.at(-1)!.id : `stage:proof-${String(index + 10).padStart(2, '0')}` },
    }));
    const validated = validateGameData({
      ...structuredClone(loadGameData()),
      stages: [...stages, ...proofStages],
    });
    expect(validated.stages).toHaveLength(25);
    const catalog = {
      stages: validated.stages!,
      encounterProfiles: validated.encounterProfiles!,
      difficultyProfiles: validated.difficultyProfiles!,
      rewardProfiles: validated.rewardProfiles!,
    };
    for (const stage of proofStages) {
      const plan = resolveRunPlan({ stageId: stage.id, characterId: 'scrap-tabby', seed: 7 }, catalog);
      expect(plan.objective.definition.type).toBe('kill');
      const legacy = spawnCurvesJson.find((curve) => curve.id === validated.arenas.find((arena) => arena.id === stage.arenaId)?.spawnCurveId)!;
      expect(composeStageSpawnCurve(legacy, plan).waves.map((wave) => wave.enemyId)).toEqual(encounters[0].enemyIds);
    }
  });

  it('rejects a stage bundle or bundle member that is absent from the real manifest', () => {
    const source = structuredClone(loadGameData());
    expect(() => validateGameData({
      ...source,
      stages: [{ ...source.stages![0], assetBundleId: 'bundle:missing' }, ...source.stages!.slice(1)],
    })).toThrow('"bundle:missing" not found');
    expect(() => validateGameData({
      ...source,
      assetBundles: source.assetBundles.map((bundle) => bundle.id === source.stages![0].assetBundleId ? { ...bundle, resourceIds: ['resource:not-real'] } : bundle),
    })).toThrow('"resource:not-real" not found in visual-resources catalog');
    expect(() => validateGameData({
      ...source,
      assetBundles: source.assetBundles.map((bundle) => bundle.id === source.stages![0].assetBundleId ? { ...bundle, resourceIds: [bundle.resourceIds[0]!] } : bundle),
    })).toThrow('is missing arena asset');
    expect(() => validateGameData({
      ...source,
      assetBundles: source.assetBundles.map((bundle) => bundle.id === 'bundle:core-forge'
        ? { ...bundle, resourceIds: [...bundle.resourceIds, 'resource:world-junkyard-floor-base'] }
        : bundle),
    })).toThrow('must contain exactly the arena visual assets');
    expect(() => validateGameData({
      ...source,
      visualArt: {
        bindings: [...source.visualArt.bindings, {
          id: 'world:unbundled-proof',
          kind: 'world', textureKey: 'art-world-unbundled-proof', url: 'assets/world/unbundled-proof.png',
          required: true, sampling: 'nearest', load: { type: 'image' }, display: { width: 16, height: 16 },
        }],
      },
    })).toThrow(`visual-art.json.bindings[${source.visualArt.bindings.length}].textureKey: unknown field`);
    expect(collectGameDataErrors({
      ...source,
      stages: [{ ...source.stages![0], assetBundleId: 'bundle:missing' }, ...source.stages!.slice(1)],
    })[0]).toMatchObject({ file: 'stages.json', index: 0, field: 'assetBundleId' });
  });
});
