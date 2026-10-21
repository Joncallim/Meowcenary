import { describe, expect, it } from 'vitest';
import {
  INTEGRATED_FIXTURE_ENVELOPE,
  INTEGRATED_FIXTURE_JOBS,
  INTEGRATED_FIXTURE_SURFACES,
  operationCanSettle,
  selectHumanAutoTarget,
  validateIntegratedFixture,
  fixtureRangeDamage,
  hasFixtureBallisticLineOfSight,
  IntegratedFixtureCombat,
} from '../src/gameplay/integratedFixture';

describe('INT-FB integrated browser-slice fixture', () => {
  it('pins the 80 by 64 metre authored test envelope and validates every reference', () => {
    expect(INTEGRATED_FIXTURE_ENVELOPE).toEqual({ widthMetres: 80, heightMetres: 64 });
    expect(validateIntegratedFixture()).toEqual([]);
    expect(INTEGRATED_FIXTURE_SURFACES.find(surface => surface.kind === 'bridge')!.elevation)
      .not.toBe(INTEGRATED_FIXTURE_SURFACES.find(surface => surface.kind === 'underpass')!.elevation);
  });

  it('requires R01 markers, finite exit group and collection before extraction settles', () => {
    const base = { jobId: 'MC-OPT-R01-01' as const, completedInteractionIds: ['INT-FB-R01-MARKER-A', 'INT-FB-R01-MARKER-B', 'INT-FB-R01-COLLECTION'], finiteEnemyGroupCleared: true, extractionConfirmed: true };
    expect(operationCanSettle(base)).toBe(true);
    expect(operationCanSettle({ ...base, finiteEnemyGroupCleared: false })).toBe(false);
    expect(operationCanSettle({ ...base, completedInteractionIds: ['INT-FB-R01-MARKER-A'] })).toBe(false);
  });

  it('allows F01 extraction after its disputed-lot interaction without a compulsory total clear', () => {
    expect(INTEGRATED_FIXTURE_JOBS.find(job => job.id === 'MC-OPT-F01-01')!.requiresFiniteGroupClear).toBe(false);
    expect(operationCanSettle({ jobId: 'MC-OPT-F01-01', completedInteractionIds: ['INT-FB-F01-DISPUTED-LOT'], finiteEnemyGroupCleared: false, extractionConfirmed: true })).toBe(true);
  });

  it('uses revealed ballistic LOS and stable body-anchor priority for human auto-targeting', () => {
    const candidates = [
      { actorId: 'enemy-b', revealed: true, ballisticLineOfSight: true, inRange: true, muzzleToBodyAnchorMetres: 4, muzzleToFirstContactMetres: 2 },
      { actorId: 'enemy-a', revealed: true, ballisticLineOfSight: true, inRange: true, muzzleToBodyAnchorMetres: 4, muzzleToFirstContactMetres: 3 },
      { actorId: 'hidden-near', revealed: false, ballisticLineOfSight: true, inRange: true, muzzleToBodyAnchorMetres: 1, muzzleToFirstContactMetres: 1 },
      { actorId: 'blocked', revealed: true, ballisticLineOfSight: false, inRange: true, muzzleToBodyAnchorMetres: 1, muzzleToFirstContactMetres: 1 },
    ] as const;
    expect(selectHumanAutoTarget({ candidates })?.actorId).toBe('enemy-a');
    expect(selectHumanAutoTarget({ candidates, retainedTargetId: 'enemy-b' })?.actorId).toBe('enemy-b');
    expect(selectHumanAutoTarget({ candidates, ownedDesignationId: 'hidden-near', retainedTargetId: 'enemy-b' })?.actorId).toBe('enemy-b');
    expect(selectHumanAutoTarget({ candidates, ownedDesignationId: 'enemy-b', retainedTargetId: 'enemy-a' })?.actorId).toBe('enemy-b');
  });
});

it('deals no fixture damage outside the pinned TAB maximum range', () => {
  expect(fixtureRangeDamage(12, 30)).toBe(30);
  expect(fixtureRangeDamage(24, 30)).toBe(15);
  expect(fixtureRangeDamage(24.01, 30)).toBe(0);
});

it('uses an occluder for ballistic LOS even though the fixture remains traversable around it', () => {
  expect(hasFixtureBallisticLineOfSight({ x: 29, z: 40 }, { x: 35, z: 40 })).toBe(false);
  expect(hasFixtureBallisticLineOfSight({ x: 29, z: 34 }, { x: 35, z: 34 })).toBe(true);
});

it('fires TAB and HOU from their own positions, records actual combat events, and retains lawful targets', () => {
  const combat = new IntegratedFixtureCombat();
  combat.beginJob('MC-OPT-R01-01');
  combat.setSquadPositions({ x: 34, z: 38 }, { x: 34, z: 42 });
  const events = combat.advance(0.2);
  expect(events.some(event => event.type === 'weapon-fired' && event.sourceId === 'tabby')).toBe(true);
  expect(events.some(event => event.type === 'weapon-fired' && event.sourceId === 'hound')).toBe(true);
  expect(combat.hostileStates().some(hostile => hostile.health < 90)).toBe(true);
});

it('does not clear combat through a blind timer or out-of-range companion support', () => {
  const combat = new IntegratedFixtureCombat();
  combat.beginJob('MC-OPT-R01-01');
  combat.setSquadPositions({ x: 8, z: 11 }, { x: 6.5, z: 11 });
  combat.advance(30);
  expect(combat.isGroupCleared()).toBe(false);
  expect(combat.hostileStates().every(hostile => hostile.health === 90)).toBe(true);
});
