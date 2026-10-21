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
  IntegratedFixtureOperation,
  createIntegratedFixtureSave,
  deserializeIntegratedFixtureSave,
  fixtureDialogue,
  settleIntegratedFixtureJob,
  historicalFixtureMissionReplay,
  resolveFixtureTakeover,
  createIntegratedFixtureWorkshopProfile,
  commitFixtureWorkshop,
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

it('keeps two gun instances distinct and never emits both during a swap', () => {
  const combat = new IntegratedFixtureCombat();
  combat.beginJob('MC-OPT-R01-01');
  combat.setSquadPositions({ x: 34, z: 38 }, { x: 6.5, z: 11 });
  const first = combat.activeGun('tabby');
  expect(combat.swapActiveGun('tabby')).toBe(true);
  const second = combat.activeGun('tabby');
  expect(second.instanceId).not.toBe(first.instanceId);
  expect(combat.advance(0.29).filter(event => event.type === 'weapon-fired' && event.sourceId === 'tabby')).toHaveLength(0);
  const shots = combat.advance(0.02).filter(event => event.type === 'weapon-fired' && event.sourceId === 'tabby');
  expect(shots).toHaveLength(1);
  expect(combat.activeGun('tabby').supply).toBe(second.supply - 1);
  expect(first.supply).toBe(12);
});

it('requires R01 inspection, acceptance, activation, both markers, collection, finite group and extraction', () => {
  const operation = new IntegratedFixtureOperation();
  expect(operation.activate()).toBe(false);
  operation.inspect('MC-OPT-R01-01');
  expect(operation.accept()).toBe(true);
  expect(operation.activate()).toBe(true);
  expect(operation.interact('INT-FB-R01-MARKER-A')).toBe(true);
  expect(operation.interact('INT-FB-R01-MARKER-B')).toBe(true);
  expect(operation.interact('INT-FB-R01-COLLECTION')).toBe(true);
  expect(operation.extract()).toBe(false);
  operation.setFiniteGroupCleared();
  expect(operation.extract()).toBe(true);
  expect(operation.snapshot().phase).toBe('settled');
});

it('settles F01 after the disputed-lot interaction without a total clear', () => {
  const operation = new IntegratedFixtureOperation();
  operation.inspect('MC-OPT-F01-01');
  operation.accept();
  operation.activate();
  expect(operation.interact('INT-FB-F01-DISPUTED-LOT')).toBe(true);
  expect(operation.extract()).toBe(true);
});

it('persists an isolated, idempotent settlement receipt without accepting malformed state', () => {
  const first = settleIntegratedFixtureJob(createIntegratedFixtureSave(), 'MC-OPT-F01-01');
  expect(first.applied).toBe(true);
  expect(first.receipt).toMatchObject({ recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6 });
  const replay = settleIntegratedFixtureJob(first.save, 'MC-OPT-F01-01');
  expect(replay.applied).toBe(false);
  expect(replay.save.receipts).toHaveLength(1);
  expect(deserializeIntegratedFixtureSave(JSON.stringify(first.save))).toEqual(first.save);
  expect(deserializeIntegratedFixtureSave('{"version":"wrong"}')).toEqual(createIntegratedFixtureSave());
  expect(fixtureDialogue('MC-OPT-R01-01', 'offer')).toContain('both authorized shipment markers');
});

it('projects historical receipts without changing live fixture state and requires takeover consent', () => {
  const settled = settleIntegratedFixtureJob(createIntegratedFixtureSave(), 'MC-OPT-R01-01').save;
  const before = JSON.stringify(settled);
  expect(historicalFixtureMissionReplay(settled, 'int-fb:MC-OPT-R01-01:settlement')?.text).toContain('Historical receipt');
  expect(JSON.stringify(settled)).toBe(before);
  expect(resolveFixtureTakeover(0, 80, false)).toBe('takeover-required');
  expect(resolveFixtureTakeover(0, 80, true)).toBe('recovered');
  expect(resolveFixtureTakeover(0, 0, true)).toBe('lost');
});

it('commits the directed B1 workshop ledger once per command', () => {
  let p = createIntegratedFixtureWorkshopProfile();
  expect(p.owned).toHaveLength(25);
  expect(p.owned.filter(id => id.includes('-BASE'))).toHaveLength(24);
  p = commitFixtureWorkshop(p, 'buy-1', 'buy-f2').profile;
  expect(p.wallet.credits).toBe(1350);
  p = commitFixtureWorkshop(p, 'fit-1', 'fit-f2-a').profile;
  expect(p.assigned['TAB-A']).toBe('TAB-F2');
  p = commitFixtureWorkshop(p, 'claim-1', 'claim-h2').profile;
  p = commitFixtureWorkshop(p, 'sell-1', 'sell-h2').profile;
  expect(p.wallet.credits).toBe(1890);
  p = commitFixtureWorkshop(p, 'build-1', 'build-b3').profile;
  p = commitFixtureWorkshop(p, 'develop-1', 'develop-b2').profile;
  expect(p.wallet).toEqual({ credits: 390, metal: 20, circuits: 4, cloth: 12, flux: 3 });
  expect(commitFixtureWorkshop(p, 'develop-1', 'develop-b2').applied).toBe(false);
});
