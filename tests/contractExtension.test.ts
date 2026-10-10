import { describe, expect, it } from 'vitest';
import { resolveStageCompletion } from '../src/gameplay/stage/stageCompletion';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { collectGameDataErrors, loadGameData, validateGameData } from '../src/systems/validation';

const data = loadGameData();
const stages = data.stages!;
const optionalIds = ['stage:junkyard-nest-breaker', 'stage:junkyard-crossfire-salvage', 'stage:forge-shatterline', 'stage:forge-pressure-test'];
describe('optional post-Warden contracts', () => {
  it('preserves the ten-clear campaign on an old save and excludes unknown tombstones', () => {
    const progress = Object.fromEntries(stages.filter(stage => stage.campaignRole !== 'optional').map(stage => [stage.id, { completed: true }]));
    progress['stage:retired-fixture'] = { completed: true };
    expect(resolveStageCompletion(stages, progress)).toEqual({ mainCompleted: 10, mainTotal: 10, campaignComplete: true, optionalCompleted: 0, optionalTotal: 4, optionalComplete: false });
    optionalIds.forEach(id => { progress[id] = { completed: true }; });
    expect(resolveStageCompletion(stages, progress)).toMatchObject({ campaignComplete: true, optionalCompleted: 4, optionalComplete: true });
  });
  it('opens a sequential currency-only extension with four different combat goals', () => {
    const optional = stages.filter(stage => stage.campaignRole === 'optional');
    expect(optional.map(stage => stage.id)).toEqual(optionalIds);
    optional.forEach((stage, index) => {
      expect(stage.unlock).toEqual({ type: 'stage-cleared', stageId: index === 0 ? 'stage:junkyard-06' : optionalIds[index - 1] });
      const plan = resolveRunPlan({ stageId: stage.id, characterId: 'scrap-tabby', seed: 91 }, data as any);
      expect(plan.reward.grants ?? []).toEqual([]);
      expect(plan.reward.firstClearScrap).toBeGreaterThan(0);
      expect(plan.encounter.enemyIds.length).toBeGreaterThanOrEqual(5);
    });
    expect(new Set(optional.map(stage => JSON.stringify(stage.objective))).size).toBe(4);
    expect(optional.at(-1)?.objective).toEqual({ type: 'survive', seconds: 120 });
  });
});

describe('bounded boss opening data', () => {
  it('freezes authored dialogue in the resolved plan', () => {
    const plan = resolveRunPlan({ stageId: 'stage:junkyard-06', characterId: 'scrap-tabby', seed: 4 }, data as any);
    expect(plan.openingDialogue?.speakerEnemyId).toBe('boss-forge');
    expect(Object.isFrozen(plan.openingDialogue?.lines)).toBe(true);
  });
  it.each([
    { speakerEnemyId: 'boss-crusher', lines: ['Wrong speaker'] },
    { speakerEnemyId: 'boss-forge', lines: [] },
    { speakerEnemyId: 'boss-forge', lines: ['a', 'b', 'c'] },
    { speakerEnemyId: 'boss-forge', lines: ['x'.repeat(101)] },
    { speakerEnemyId: 'boss-forge', lines: ['x'.repeat(90), 'y'.repeat(90)] },
    { speakerEnemyId: 'boss-forge', lines: ['<script>'] },
    { speakerEnemyId: 'boss-forge', lines: ['  '] },
    { speakerEnemyId: 'boss-forge', lines: ['hello'], unknownCommand: 'spawn' },
  ])('rejects malformed dialogue before launch: %j', openingDialogue => {
    const malformed = structuredClone(data);
    const stage = malformed.stages!.find(row => row.id === 'stage:junkyard-06')!;
    Object.assign(stage, { openingDialogue });
    expect(collectGameDataErrors(malformed).length).toBeGreaterThan(0);
    expect(() => validateGameData(malformed)).toThrow();
  });
  it('requires the speaker actor art for both boot and authoring validation', () => {
    const malformed = structuredClone(data);
    const binding = malformed.visualArt.bindings.find(row => row.id === 'enemy:boss-forge')!;
    Object.assign(binding, { required: false });
    expect(collectGameDataErrors(malformed).some(issue => issue.message.includes('opening requires'))).toBe(true);
    expect(() => validateGameData(malformed)).toThrow();
  });
});
