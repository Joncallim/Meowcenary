import { describe, expect, it } from 'vitest';
import { collectGameDataErrors, loadGameData, mapValidationErrorLines, validateGameData } from '../src/systems/validation';
import { assertStageOpeningReferences, checkStage } from '../src/systems/validation/stages';

const source = loadGameData();
const bossId = 'stage:junkyard-06';
const validOpening = { speakerEnemyId: 'boss-forge', lines: ['Keep moving.'] };

function withOpening(openingDialogue: unknown) {
  const data = structuredClone(source);
  Object.assign(data.stages!.find(stage => stage.id === bossId)!, { openingDialogue });
  return data;
}

function expectBootAndCollectingFailure(data: unknown, message: RegExp) {
  expect(() => validateGameData(data)).toThrow(message);
  let firstBoot;
  try { validateGameData(data); } catch (error) { firstBoot = mapValidationErrorLines(error)[0]; }
  const issues = collectGameDataErrors(data);
  expect(issues[0]).toEqual(firstBoot);
  expect(issues.some(issue => message.test(`${issue.field}: ${issue.message}`))).toBe(true);
}

describe('bounded opening validation and Stage diagnostic composition', () => {
  it.each([
    null, [], 'dialogue', {},
    { lines: ['Hello'] },
    { speakerEnemyId: 42, lines: ['Hello'] },
    { speakerEnemyId: 'enemy:boss-forge', lines: ['Hello'] },
    { speakerEnemyId: 'boss-forge' },
    { ...validOpening, lines: [] },
    { ...validOpening, lines: ['a', 'b', 'c'] },
    { ...validOpening, lines: [42] },
    { ...validOpening, lines: [''] },
    { ...validOpening, lines: ['  '] },
    { ...validOpening, lines: [' leading'] },
    { ...validOpening, lines: ['trailing '] },
    { ...validOpening, lines: ['x'.repeat(101)] },
    { ...validOpening, lines: ['x'.repeat(81), 'y'.repeat(80)] },
    { ...validOpening, lines: ['<script>'] },
    { ...validOpening, command: 'spawn' },
    ...['\u0000', '\u0009', '\u000a', '\u000d', '\u001f', '\u007f', '\u0085', '\u009f', '\u2028', '\u2029'].map(control => ({ ...validOpening, lines: [`before${control}after`] })),
  ].map(opening => [opening]))('rejects malformed bounded dialogue in both paths: %j', opening => {
    expectBootAndCollectingFailure(withOpening(opening), /openingDialogue/);
  });

  it.each([
    ['plain'], ['x'.repeat(100), 'y'.repeat(60)], ['🐈'.repeat(80), '🐈'.repeat(80)],
  ])('accepts valid text within Unicode code-point bounds: %j', (...lines) => {
    // Vitest spreads array table rows; retain the authored line array.
    const data = withOpening({ ...validOpening, lines });
    expect(() => validateGameData(data)).not.toThrow();
    expect(collectGameDataErrors(data)).toEqual([]);
  });

  it('allows absent dialogue on a boss or ordinary stage', () => {
    const data = structuredClone(source);
    for (const stage of data.stages!) delete (stage as unknown as Record<string, unknown>).openingDialogue;
    expect(() => validateGameData(data)).not.toThrow();
    expect(collectGameDataErrors(data)).toEqual([]);
  });

  it.each([null, 'bonus', 1, true])('rejects unsupported campaignRole %j', campaignRole => {
    const data = structuredClone(source);
    Object.assign(data.stages![0]!, { campaignRole });
    expectBootAndCollectingFailure(data, /campaignRole/);
  });

  it.each(['main', 'optional'])('accepts campaignRole %s', campaignRole => {
    const data = structuredClone(source);
    Object.assign(data.stages![0]!, { campaignRole });
    expect(() => validateGameData(data)).not.toThrow();
    expect(collectGameDataErrors(data)).toEqual([]);
  });

  it('keeps speaker identity semantic checks out of the row-shape phase', () => {
    const stage = { ...source.stages!.find(stage => stage.id === bossId)!, openingDialogue: validOpening };
    delete stage.bossId;
    expect(checkStage(stage, 0)).toEqual([]);
    expectBootAndCollectingFailure({ ...source, stages: source.stages!.map(row => row.id === bossId ? stage : row) }, /bossId, defeat objective and encounter bossId must match/);
  });

  it('preserves the unknown defeat target diagnostic before opening identity', () => {
    const data = withOpening(validOpening);
    Object.assign(data.stages!.find(stage => stage.id === bossId)!, { objective: { type: 'defeat', enemyId: 'boss-not-real' } });
    expectBootAndCollectingFailure(data, /defeat objective enemyId "boss-not-real" not found/);
    expect(collectGameDataErrors(data).some(issue => issue.message.includes('openingDialogue'))).toBe(false);
  });

  it('keeps both independent chapter-art and bundle diagnostics from main', () => {
    const data = structuredClone(source);
    Object.assign(data.stages![0]!, { chapterIconArtId: 'chapter-icon:missing', assetBundleId: 'bundle:missing' });
    expectBootAndCollectingFailure(data, /unknown required chapter icon "chapter-icon:missing"/);
    expect(collectGameDataErrors(data).map(issue => issue.message)).toEqual(expect.arrayContaining([
      'stage.stage:junkyard-01: unknown required chapter icon "chapter-icon:missing"',
      expect.stringContaining('"bundle:missing" not found'),
    ]));
  });

  it('preserves encounter boss ownership before opening identity', () => {
    const data = withOpening(validOpening);
    Object.assign(data.encounterProfiles!.find(row => row.id === 'encounter:forge-warden-boss')!, { bossId: 'boss-crusher' });
    expectBootAndCollectingFailure(data, /bossId, defeat objective and encounter bossId must match/);
  });

  it.each(['boss-crusher', 'junk-rusher', 'boss-not-real'])('rejects semantic speaker mismatch %s after existing joins', speakerEnemyId => {
    expectBootAndCollectingFailure(withOpening({ ...validOpening, speakerEnemyId }), /openingDialogue.speakerEnemyId: must match the defeat objective and boss/);
  });

  it('rejects opening on an ordinary objective', () => {
    const data = structuredClone(source);
    Object.assign(data.stages![0]!, { openingDialogue: validOpening });
    expectBootAndCollectingFailure(data, /openingDialogue.speakerEnemyId: must match the defeat objective and boss/);
  });

  it('requires a required logical enemy actor binding', () => {
    const data = withOpening(validOpening);
    Object.assign(data.visualArt.bindings.find(row => row.id === 'enemy:boss-forge')!, { required: false });
    expect(() => assertStageOpeningReferences(data.stages!, data.enemies, data.visualArt))
      .toThrow(/opening requires a boss and required enemy art/);
    // The existing generic actor gate owns this earlier diagnostic.
    expectBootAndCollectingFailure(data, /actor art must be required/);
  });

  it.each([
    ['arenaId', 'missing-arena', /arenaId "missing-arena" not found/],
    ['encounterProfileId', 'encounter:missing', /encounterProfileId "encounter:missing" not found/],
    ['difficultyProfileId', 'difficulty:missing', /difficultyProfileId "difficulty:missing" not found/],
    ['rewardProfileId', 'reward:missing', /rewardProfileId "reward:missing" not found/],
  ] as const)('preserves Stage reference order ahead of opening: %s', (field, value, expected) => {
    const data = withOpening({ ...validOpening, speakerEnemyId: 'boss-crusher' });
    Object.assign(data.stages!.find(stage => stage.id === bossId)!, { [field]: value });
    expectBootAndCollectingFailure(data, expected);
  });

  it('checks Stage unlock references in both validation paths', () => {
    const data = withOpening(validOpening);
    Object.assign(data.stages!.find(stage => stage.id === bossId)!, { unlock: { type: 'stage-cleared', stageId: 'stage:missing' } });
    expectBootAndCollectingFailure(data, /unlock references unknown stage "stage:missing"/);
  });
});
