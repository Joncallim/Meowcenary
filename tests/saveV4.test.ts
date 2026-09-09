import { describe, expect, it } from 'vitest';
import {
  migrateV3ToV4Full,
  reconcileV4Achievements,
  settleRunTerminal,
  SaveManagerV4,
  type RunTerminalInput,
  type AchievementDefinition,
} from '../src/systems/saveV4';
import {
  createDefaultSaveV4,
  MemoryStorageAdapter,
  DEFAULT_SETTINGS,
  freezeSaveV4,
  type SaveDataV3,
} from '../src/systems/save';

// ── Helpers ──────────────────────────────────────────────────────────

function createV3Fixture(overrides?: Partial<SaveDataV3>): SaveDataV3 {
  return {
    version: 3,
    settings: DEFAULT_SETTINGS,
    progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
    stages: {},
    achievements: {},
    achievementMetrics: {},
    characters: {},
    gunsmith: { builds: [], parts: {} },
    equipment: {},
    equipmentLoadout: {},
    items: {},
    bosses: {},
    pendingAchievementReports: [],
    appliedGrantTransactions: {},
    grantTransactionFingerprints: {},
    ...overrides,
  };
}

// ── V4 Migration Tests ───────────────────────────────────────────────

describe('V3 → V4 migration', () => {
  it('migrates a minimal V3 save', () => {
    const v3 = createV3Fixture();
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.version).toBe(4);
    expect(v4.progression.scrap).toBe(0);
    expect(v4.progression.unlocks).toEqual(['character:scrap-tabby']);
    expect(v4.compendium).toEqual({});
  });

  it('preserves scrap and basic progression', () => {
    const v3 = createV3Fixture({
      progression: { scrap: 500, unlocks: ['stage:junkyard-01'], permanentUpgrades: {} },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.progression.scrap).toBe(500);
    expect(v4.progression.unlocks).toContain('stage:junkyard-01');
    // Achievement shadow tokens should be removed
    expect(v4.progression.unlocks).not.toContain('achievement:first-victory');
  });

  it('removes achievement shadow tokens from unlocks', () => {
    const v3 = createV3Fixture({
      progression: {
        scrap: 0,
        unlocks: ['achievement:first-victory', 'achievement:first-blood', 'stage:junkyard-01'],
        permanentUpgrades: {},
      },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.progression.unlocks).not.toContain('achievement:first-victory');
    expect(v4.progression.unlocks).not.toContain('achievement:first-blood');
    expect(v4.progression.unlocks).toContain('stage:junkyard-01');
  });

  it('preserves stages and achievements', () => {
    const v3 = createV3Fixture({
      stages: { 'stage:junkyard-01': { completed: true, bestTimeMs: 60000 } },
      achievements: { 'achievement:first-victory': { completed: true } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.stages['stage:junkyard-01']?.completed).toBe(true);
    // bestTimeMs should be cleared for current ten stages
    expect(v4.stages['stage:junkyard-01']?.bestTimeMs).toBeUndefined();
    expect(v4.achievements['achievement:first-victory']?.completed).toBe(true);
  });

  it('settles First Victory token-only gap', () => {
    const v3 = createV3Fixture({
      progression: {
        scrap: 100,
        unlocks: ['achievement:first-victory'],
        permanentUpgrades: {},
      },
      // No achievement completion for first-victory
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:first-victory']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(125); // 100 + 25
  });

  it('does not add 25 Scrap if First Victory already completed', () => {
    const v3 = createV3Fixture({
      progression: { scrap: 100, unlocks: ['achievement:first-victory'], permanentUpgrades: {} },
      achievements: { 'achievement:first-victory': { completed: true } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:first-victory']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(100); // No extra 25
  });

  it('adds character entitlements for historically selectable mercenaries', () => {
    const v3 = createV3Fixture({
      achievements: {
        'achievement:first-victory': { completed: true },
        'achievement:kill-milestone-100': { completed: true },
      },
      bosses: { 'boss-crusher': { defeated: true } },
      achievementMetrics: { 'metric:kills': 100 },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    // bolt-hound should be entitled (First Victory completed)
    expect(v4.progression.unlocks).toContain('character:bolt-hound');
    // brass-boar should be entitled (Crusher defeated)
    expect(v4.progression.unlocks).toContain('character:brass-boar');
    // scrap-weasel should be entitled (100 kills achievement)
    expect(v4.progression.unlocks).toContain('character:scrap-weasel');
  });

  it('adds Crusher Down achievement when boss defeated and achievement missing', () => {
    const v3 = createV3Fixture({
      bosses: { 'boss-crusher': { defeated: true } },
      stages: { 'stage:junkyard-05': { completed: true } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:boss-crusher']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(100);
    expect(v4.progression.unlocks).toContain('equipment:commando-helmet');
    expect(v4.equipment['reward:crusher-commando-helmet']).toBeDefined();
  });

  it('adds Junkyard Champion when all J1-J5 completed', () => {
    const v3 = createV3Fixture({
      stages: {
        'stage:junkyard-01': { completed: true },
        'stage:junkyard-02': { completed: true },
        'stage:junkyard-03': { completed: true },
        'stage:junkyard-04': { completed: true },
        'stage:junkyard-05': { completed: true },
      },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:chapter-junkyard']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(200);
  });

  it('adds Tabby Mastery when scrap-tabby mastery >= 1', () => {
    const v3 = createV3Fixture({
      characters: { 'scrap-tabby': { tier: 1, xp: 0 } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:mastery-scrap-tabby']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(75);
  });

  it('adds Well Protected when reinforced vest >= 3', () => {
    const v3 = createV3Fixture({
      progression: {
        scrap: 0,
        unlocks: [],
        permanentUpgrades: { 'reinforced-vest': 3 },
      },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.achievements['achievement:permanent-reinforced-coat-3']?.completed).toBe(true);
    expect(v4.progression.scrap).toBe(150);
  });

  it('repairs historical Boss facts from Stage completion', () => {
    const v3 = createV3Fixture({
      stages: {
        'stage:junkyard-05': { completed: true },
        'stage:junkyard-06': { completed: true },
      },
      // Bosses not defeated in V3
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.bosses['boss-crusher']?.defeated).toBe(true);
    expect(v4.bosses['boss-forge']?.defeated).toBe(true);
  });

  it('provides Mastered Fire bridge when Forge Warden defeated', () => {
    const v3 = createV3Fixture({
      bosses: { 'boss-forge': { defeated: true } },
      stages: { 'stage:junkyard-06': { completed: true } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.gunsmith.parts['reward:stage-06-mastered-fire-trait']).toBeDefined();
    expect(v4.gunsmith.parts['reward:stage-06-mastered-fire-trait']?.partId).toBe('part:trait-fire-mastered');
    expect(v4.gunsmith.parts['reward:stage-06-mastered-fire-trait']?.tier).toBe(3);
    expect(v4.achievements['achievement:boss-forge']?.completed).toBe(true);
  });

  it('clears bestTimeMs for current ten stages', () => {
    const v3 = createV3Fixture({
      stages: {
        'stage:junkyard-01': { completed: true, bestTimeMs: 45000 },
        'stage:forge-04': { completed: true, bestTimeMs: 120000 },
      },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.stages['stage:junkyard-01']?.completed).toBe(true);
    expect(v4.stages['stage:junkyard-01']?.bestTimeMs).toBeUndefined();
    expect(v4.stages['stage:forge-04']?.completed).toBe(true);
    expect(v4.stages['stage:forge-04']?.bestTimeMs).toBeUndefined();
  });

  it('removes firstDefeatedAt from Boss progress', () => {
    const v3 = createV3Fixture({
      bosses: { 'boss-crusher': { defeated: true, firstDefeatedAt: 123456789 } },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.bosses['boss-crusher']?.defeated).toBe(true);
    expect((v4.bosses['boss-crusher'] as any)?.firstDefeatedAt).toBeUndefined();
  });

  it('derives Equipment tier capability floor from historical facts', () => {
    // RC1: T2 -> J2 complete
    const v3 = createV3Fixture({
      stages: { 'stage:junkyard-02': { completed: true } },
    });
    const { save: v4, capabilityFloors } = migrateV3ToV4Full(v3);
    expect(capabilityFloors).toContain('capability:equipment-tier-2');
    expect(v4.progression.unlocks).toContain('capability:equipment-tier-2');
  });

  it('derives T3 capability floor from boss-crusher defeated (achievement already completed)', () => {
    // Crusher achievement already exists, so gap settlement skips it
    // Step 8 then sees boss-crusher defeated but no T4 evidence from achievement
    const v3 = createV3Fixture({
      bosses: { 'boss-crusher': { defeated: true } },
      stages: { 'stage:junkyard-02': { completed: true } },
      achievements: { 'achievement:boss-crusher': { completed: true } },
    });
    const { capabilityFloors } = migrateV3ToV4Full(v3);
    expect(capabilityFloors).toContain('capability:equipment-tier-4');
  });

  it('collapses legitimate duplicate Commando Helmet and refunds upgrade spend', () => {
    const v3 = createV3Fixture({
      equipment: {
        'reward:stage-01-commando-helmet': { equipmentId: 'equipment:commando-helmet', tier: 4 },
        'reward:crusher-commando-helmet': { equipmentId: 'equipment:commando-helmet', tier: 2 },
      },
      equipmentLoadout: { helmet: 'reward:stage-01-commando-helmet' },
    });
    const { save: v4 } = migrateV3ToV4Full(v3);
    // Only one helmet should survive
    const helmetInstances = Object.entries(v4.equipment)
      .filter(([, inst]) => inst.equipmentId === 'equipment:commando-helmet');
    expect(helmetInstances.length).toBe(1);
    // The T4 survivor should be kept
    expect(helmetInstances[0][1].tier).toBe(4);
    // Refund for removed T2 copy: 100 Scrap
    expect(v4.progression.scrap).toBe(100);
  });

  it('sets fabricationSerials to empty object', () => {
    const v3 = createV3Fixture();
    const { save: v4 } = migrateV3ToV4Full(v3);
    expect(v4.gunsmith.fabricationSerials).toEqual({});
  });
});

// ── SaveManagerV4 Tests ──────────────────────────────────────────────

describe('SaveManagerV4', () => {
  it('loads and returns default V4 save when no data exists', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManagerV4(storage);
    const save = manager.load();
    expect(save.version).toBe(4);
    expect(save.progression.scrap).toBe(0);
  });

  it('saves and loads V4 data round-trip', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManagerV4(storage);
    const save = createDefaultSaveV4();
    expect(manager.save(save)).toBe(true);
    const loaded = manager.load();
    expect(loaded.version).toBe(4);
  });

  it('clears data', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManagerV4(storage);
    const save = createDefaultSaveV4();
    manager.save(save);
    expect(manager.clear()).toBe(true);
    const loaded = manager.load();
    expect(loaded.progression.scrap).toBe(0);
  });
});

// ── V4 Achievement Reconciliation Tests ──────────────────────────────

describe('V4 Achievement reconciliation', () => {
  it('completes First Victory when runs-completed >= 1', () => {
    const save = createDefaultSaveV4();
    const result = reconcileV4Achievements(save, {
      stages: {},
      bosses: {},
      metrics: { 'metric:runs-completed': 1 },
      characters: {},
      achievements: {},
    });
    expect(result.completions.some((c) => c.achievementId === 'achievement:first-victory')).toBe(true);
    expect(result.scrapAwarded).toBe(25);
  });

  it('completes First Blood when kills >= 1', () => {
    const save = createDefaultSaveV4();
    const result = reconcileV4Achievements(save, {
      stages: {},
      bosses: {},
      metrics: { 'metric:kills': 1 },
      characters: {},
      achievements: {},
    });
    expect(result.completions.some((c) => c.achievementId === 'achievement:first-blood')).toBe(true);
  });

  it('completes Crusher Down when boss-crusher defeated', () => {
    const save = createDefaultSaveV4();
    const result = reconcileV4Achievements(save, {
      stages: {},
      bosses: { 'boss-crusher': { defeated: true } },
      metrics: {},
      characters: {},
      achievements: {},
    });
    expect(result.completions.some((c) => c.achievementId === 'achievement:boss-crusher')).toBe(true);
    expect(result.scrapAwarded).toBe(100);
  });

  it('skips already-completed achievements', () => {
    const save = createDefaultSaveV4();
    const result = reconcileV4Achievements(save, {
      stages: {},
      bosses: {},
      metrics: { 'metric:kills': 100 },
      characters: {},
      achievements: { 'achievement:first-blood': { completed: true } },
    });
    expect(result.completions.some((c) => c.achievementId === 'achievement:first-blood')).toBe(false);
  });
});

// ── Run Terminal Settlement Tests ────────────────────────────────────

describe('Run terminal settlement', () => {
  const noReward = () => null;
  const noMastery = () => ({ tier: 0, xp: 0, tierAwarded: 0 });
  const emptyAchievements: readonly AchievementDefinition[] = [];

  it('banks run Scrap on win', () => {
    const save = createDefaultSaveV4();
    const input: RunTerminalInput = {
      terminalStatus: 'win',
      runScrap: 100,
      characterId: 'scrap-tabby',
      runDurationMs: 60000,
      stageId: 'stage:junkyard-01',
    };
    const { result, candidate } = settleRunTerminal(save, input, noReward, noMastery, emptyAchievements);
    expect(result.ok).toBe(true);
    expect(result.runScrapBanked).toBe(100);
    expect(candidate.progression.scrap).toBe(100);
    expect(candidate.achievementMetrics['metric:scrap-banked']).toBe(100);
  });

  it('banks run Scrap on loss', () => {
    const save = createDefaultSaveV4();
    const input: RunTerminalInput = {
      terminalStatus: 'loss',
      runScrap: 50,
      characterId: 'scrap-tabby',
      runDurationMs: 30000,
    };
    const { result, candidate } = settleRunTerminal(save, input, noReward, noMastery, emptyAchievements);
    expect(result.ok).toBe(true);
    expect(result.runScrapBanked).toBe(50);
    expect(candidate.progression.scrap).toBe(50);
    // scrap-banked metric should be updated even on loss
    expect(candidate.achievementMetrics['metric:scrap-banked']).toBe(50);
    // runs-completed should NOT be updated on loss
    expect(candidate.achievementMetrics['metric:runs-completed']).toBeUndefined();
  });

  it('marks first clear and applies reward', () => {
    const save = createDefaultSaveV4();
    const input: RunTerminalInput = {
      terminalStatus: 'win',
      runScrap: 50,
      characterId: 'scrap-tabby',
      runDurationMs: 45000,
      stageId: 'stage:junkyard-01',
    };
    const rewardResolver = (stageId: string) => {
      if (stageId === 'stage:junkyard-01') {
        return { scrap: 35, grants: [{ type: 'grant-part-instance' as const, instanceId: 'reward:stage-01-standard-barrel', partId: 'part:barrel-standard', tier: 1 }] };
      }
      return null;
    };
    const { result, candidate } = settleRunTerminal(save, input, rewardResolver, noMastery, emptyAchievements);
    expect(result.firstClear).toBe(true);
    expect(result.firstClearScrap).toBe(35);
    expect(candidate.stages['stage:junkyard-01']?.completed).toBe(true);
    expect(candidate.progression.scrap).toBe(85); // 50 run + 35 first-clear
  });

  it('does not replay first-clear reward on replay', () => {
    const save = freezeSaveV4({
      ...createDefaultSaveV4(),
      stages: { 'stage:junkyard-01': { completed: true, bestTimeMs: 50000 } },
    });
    const input: RunTerminalInput = {
      terminalStatus: 'win',
      runScrap: 60,
      characterId: 'scrap-tabby',
      runDurationMs: 40000,
      stageId: 'stage:junkyard-01',
    };
    const rewardResolver = () => ({ scrap: 35, grants: [] });
    const { result, candidate } = settleRunTerminal(save, input, rewardResolver, noMastery, emptyAchievements);
    expect(result.firstClear).toBe(false);
    expect(result.firstClearScrap).toBe(0);
    // Stage still completed, no extra first-clear reward
    expect(candidate.stages['stage:junkyard-01']?.completed).toBe(true);
    // Best time should improve
    expect(result.bestTimeImproved).toBe(true);
    expect(candidate.stages['stage:junkyard-01']?.bestTimeMs).toBe(40000);
    // Only run Scrap banked, not first-clear reward
    expect(candidate.progression.scrap).toBe(60);
  });

  it('updates runs-completed metric on win', () => {
    const save = createDefaultSaveV4();
    const input: RunTerminalInput = {
      terminalStatus: 'win',
      runScrap: 50,
      characterId: 'scrap-tabby',
      runDurationMs: 60000,
      stageId: 'stage:junkyard-01',
    };
    const { candidate } = settleRunTerminal(save, input, noReward, noMastery, emptyAchievements);
    expect(candidate.achievementMetrics['metric:runs-completed']).toBe(1);
  });

  it('evaluates achievements against terminal facts', () => {
    const save = createDefaultSaveV4();
    const input: RunTerminalInput = {
      terminalStatus: 'win',
      runScrap: 1000,
      characterId: 'scrap-tabby',
      runDurationMs: 60000,
      stageId: 'stage:junkyard-01',
      bossId: 'boss-crusher',
    };
    const achievements: readonly AchievementDefinition[] = [
      {
        id: 'achievement:first-victory',
        condition: () => true, // Always completes in this test
        scrapReward: 25,
      },
      {
        id: 'achievement:boss-crusher',
        condition: (_save, _stageId, bossId) => bossId === 'boss-crusher',
        scrapReward: 100,
      },
    ];
    const { result, candidate } = settleRunTerminal(save, input, noReward, noMastery, achievements);
    expect(result.achievementIdsCompleted).toContain('achievement:first-victory');
    expect(result.achievementIdsCompleted).toContain('achievement:boss-crusher');
    expect(result.scrapAwardedFromAchievements).toBe(125);
    expect(candidate.achievements['achievement:first-victory']?.completed).toBe(true);
  });
});
