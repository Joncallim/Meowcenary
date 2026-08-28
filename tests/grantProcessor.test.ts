import { describe, expect, it } from 'vitest';
import {
  applyDurableGrantTransaction,
  processGrant,
  processGrants,
  type ProgressionGrant,
} from '../src/gameplay/grantProcessor';
import { createDefaultSaveV3 } from '../src/systems/save';
import { createDefaultProgression } from '../src/systems/save';
import type { ProgressionState } from '../src/systems/save';

function makeProgression(overrides?: Partial<ProgressionState>): ProgressionState {
  const base = createDefaultProgression();
  if (!overrides) return base;
  return Object.freeze({ ...base, ...overrides });
}

describe('grantProcessor — individual grants', () => {
  it('grant-scrap adds scrap', () => {
    const p = makeProgression({ scrap: 100 });
    const result = processGrant(p, { type: 'grant-scrap', amount: 50 });
    expect(result.changed).toBe(true);
    expect(result.progression.scrap).toBe(150);
    expect(result.progression).not.toBe(p);
  });

  it('grant-scrap is idempotent for same grant applied twice', () => {
    const p = makeProgression({ scrap: 100 });
    const r1 = processGrant(p, { type: 'grant-scrap', amount: 50 });
    expect(r1.changed).toBe(true);
    expect(r1.progression.scrap).toBe(150);

    // Apply the same grant again to the original — different instance, same effect
    const r2 = processGrant(p, { type: 'grant-scrap', amount: 50 });
    expect(r2.progression.scrap).toBe(150);
    // Not same instance (fresh freeze), but changed from original
    expect(r2.changed).toBe(true);
  });

  it('grant-scrap with zero amount is no-op', () => {
    const p = makeProgression({ scrap: 100 });
    const result = processGrant(p, { type: 'grant-scrap', amount: 0 });
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('grant-scrap with negative amount is no-op', () => {
    const p = makeProgression({ scrap: 100 });
    const result = processGrant(p, { type: 'grant-scrap', amount: -10 });
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('grant-scrap clamps to MAX_SAFE_INTEGER', () => {
    const p = makeProgression({ scrap: Number.MAX_SAFE_INTEGER - 10 });
    const result = processGrant(p, { type: 'grant-scrap', amount: 100 });
    expect(result.progression.scrap).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('unlock-character adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'unlock-character', characterId: 'character:bolt-hound' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('character:bolt-hound');
  });

  it('unlock-character is idempotent', () => {
    const p = makeProgression({ unlocks: ['character:bolt-hound'] });
    const result = processGrant(p, { type: 'unlock-character', characterId: 'bolt-hound' });
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('unlock-stage adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'unlock-stage', stageId: 'stage:junkyard-02' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('stage:junkyard-02');
  });

  it('unlock-equipment adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'unlock-equipment', equipmentId: 'equipment:commando-helmet' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('equipment:commando-helmet');
  });

  it('unlock-part adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'unlock-part', partId: 'part:incendiary-barrel' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('part:incendiary-barrel');
  });

  it('unlock-trait adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'unlock-trait', traitId: 'trait:fire' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('trait:fire');
  });

  it('grant-item adds unlock ID', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'grant-item', itemId: 'item:scrap-shot' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('item:scrap-shot');
  });

  it('achievement-completed adds achievement unlock', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'achievement-completed', achievementId: 'achievement:kill-100' });
    expect(result.changed).toBe(true);
    expect(result.progression.unlocks).toContain('achievement:kill-100');
  });

  it('permanent-upgrade-level increments level', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: 2 });
    expect(result.changed).toBe(true);
    expect(result.progression.permanentUpgrades['reinforced-vest']).toBe(2);
  });

  it('permanent-upgrade-level accumulates', () => {
    const p = makeProgression({ permanentUpgrades: { 'reinforced-vest': 3 } });
    const result = processGrant(p, { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: 2 });
    expect(result.progression.permanentUpgrades['reinforced-vest']).toBe(5);
  });

  it('permanent-upgrade-level with zero levels is no-op', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: 0 });
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('permanent-upgrade-level with negative levels is no-op', () => {
    const p = makeProgression({ permanentUpgrades: { 'reinforced-vest': 5 } });
    const result = processGrant(p, { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: -2 });
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });
});

describe('durable grant transactions', () => {
  it('replays a mixed transaction exactly once', () => {
    const transaction = {
      id: 'achievement:boss-crusher:completion',
      grants: [
        { type: 'grant-scrap' as const, amount: 100 },
        { type: 'permanent-upgrade-level' as const, upgradeId: 'reinforced-vest', levels: 1 },
        { type: 'achievement-completed' as const, achievementId: 'achievement:boss-crusher' },
      ],
    };
    const once = applyDurableGrantTransaction(createDefaultSaveV3(), transaction);
    const replay = applyDurableGrantTransaction(once.save, transaction);
    expect(once.save.progression.scrap).toBe(100);
    expect(once.save.progression.permanentUpgrades['reinforced-vest']).toBe(1);
    expect(once.save.progression.unlocks).toContain('achievement:boss-crusher');
    expect(replay.changed).toBe(false);
    expect(replay.save).toBe(once.save);
  });
});

describe('grantProcessor — batch grants', () => {
  it('applies multiple grants in sequence', () => {
    const p = makeProgression({ scrap: 0 });
    const grants: readonly ProgressionGrant[] = [
      { type: 'grant-scrap', amount: 100 },
      { type: 'unlock-character', characterId: 'character:bolt-hound' },
      { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: 1 },
    ];
    const result = processGrants(p, grants);
    expect(result.changed).toBe(true);
    expect(result.progression.scrap).toBe(100);
    expect(result.progression.unlocks).toContain('character:bolt-hound');
    expect(result.progression.permanentUpgrades['reinforced-vest']).toBe(1);
  });

  it('reports unchanged when all grants are already applied', () => {
    const p = makeProgression({
      scrap: 100,
      unlocks: ['character:bolt-hound'],
      permanentUpgrades: { 'reinforced-vest': 1 },
    });
    const grants: readonly ProgressionGrant[] = [
      { type: 'grant-scrap', amount: 0 },
      { type: 'unlock-character', characterId: 'bolt-hound' },
      { type: 'permanent-upgrade-level', upgradeId: 'reinforced-vest', levels: 0 },
    ];
    const result = processGrants(p, grants);
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('empty grants array is no-op', () => {
    const p = makeProgression();
    const result = processGrants(p, []);
    expect(result.changed).toBe(false);
    expect(result.progression).toBe(p);
  });

  it('each grant is independent — one failure does not roll back', () => {
    const p = makeProgression({ scrap: 100 });
    const grants: readonly ProgressionGrant[] = [
      { type: 'grant-scrap', amount: 50 },
      { type: 'grant-scrap', amount: -10 }, // no-op
      { type: 'grant-scrap', amount: 25 },
    ];
    const result = processGrants(p, grants);
    expect(result.progression.scrap).toBe(175); // 100 + 50 + 25
  });
});

describe('grantProcessor — purity', () => {
  it('does not mutate input progression', () => {
    const p = makeProgression({ scrap: 100 });
    const pScrap = p.scrap;
    const pUnlocks = p.unlocks;

    processGrant(p, { type: 'grant-scrap', amount: 50 });
    processGrant(p, { type: 'unlock-character', characterId: 'test' });

    expect(p.scrap).toBe(pScrap);
    expect(p.unlocks).toBe(pUnlocks);
  });

  it('result is deeply frozen', () => {
    const p = makeProgression();
    const result = processGrant(p, { type: 'grant-scrap', amount: 50 });
    expect(Object.isFrozen(result.progression)).toBe(true);
    expect(Object.isFrozen(result.progression.unlocks)).toBe(true);
    expect(Object.isFrozen(result.progression.permanentUpgrades)).toBe(true);
  });

  it('deterministic — same inputs, same outputs', () => {
    const p = makeProgression({ scrap: 0 });
    const grants: readonly ProgressionGrant[] = [
      { type: 'grant-scrap', amount: 42 },
      { type: 'unlock-character', characterId: 'bolt-hound' },
    ];

    const r1 = processGrants(p, grants);
    const r2 = processGrants(p, grants);
    expect(r1.progression).toEqual(r2.progression);
  });
});
