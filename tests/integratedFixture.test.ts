import { describe, expect, it } from 'vitest';
import {
  INTEGRATED_FIXTURE_ENVELOPE,
  INTEGRATED_FIXTURE_JOBS,
  INTEGRATED_FIXTURE_SURFACES,
  operationCanSettle,
  isFixtureTerrainPositionWalkable,
  moveFixtureTerrainPosition,
  fixturePositionsShareLayer,
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
  settleIntegratedFixtureEvent,
  historicalFixtureMissionReplay,
  resolveFixtureTakeover,
  createIntegratedFixtureWorkshopProfile,
  commitFixtureWorkshop,
  commitAndPersistFixtureWorkshop,
  deserializeIntegratedFixtureWorkshopProfile,
  settleFixtureWorkshopMission,
  resolveFixtureGunProfile,
  beginFixtureAttempt, terminalFixtureAttempt, recoverFixtureFailure,
  beginFixtureProfileAttempt, failFixtureProfileAttempt, retryFixtureProfileAttempt, settleFixtureProfileAttempt,
  createIntegratedFixtureEnvelope, deserializeIntegratedFixtureEnvelope, nextFixtureAttemptId, nextFixtureWorldEventId,
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

it('uses the named ground route, solid cover, and the ramp to resolve traversal instead of envelope clamps', () => {
  let position = { x: 8, z: 8, layer: 'ground' as const };
  position = moveFixtureTerrainPosition(position, { x: 30, z: 8 }).position as typeof position;
  position = moveFixtureTerrainPosition(position, { x: 35, z: 20 }).position as typeof position;
  position = moveFixtureTerrainPosition(position, { x: 53, z: 22 }).position as typeof position;
  position = moveFixtureTerrainPosition(position, { x: 65, z: 22 }).position as typeof position;
  position = moveFixtureTerrainPosition(position, { x: 65, z: 39 }).position as typeof position;
  expect(position).toMatchObject({ x: 65, z: 39, layer: 'ground' });
  expect(isFixtureTerrainPositionWalkable(position)).toBe(true);

  const blocked = moveFixtureTerrainPosition({ x: 29, z: 40, layer: 'ground' }, { x: 35, z: 40, layer: 'ground' });
  expect(blocked.blocked).toBe(true);
  expect(blocked.position.x).toBeLessThanOrEqual(30.6);

  const transitioned = moveFixtureTerrainPosition({ x: 40, z: 8, layer: 'ground' }, { x: 40, z: 21, layer: 'ground' });
  expect(transitioned).toMatchObject({ transitioned: true, position: { x: 40, z: 21, layer: 'elevated' } });
  expect(isFixtureTerrainPositionWalkable({ x: 53, z: 22, layer: 'elevated' })).toBe(true);
  expect(isFixtureTerrainPositionWalkable({ x: 53, z: 22, layer: 'ground' })).toBe(true);
});

it('keeps same-position bridge and underpass combat/interactions layer-separated', () => {
  const underpass = { x: 53, z: 22, layer: 'ground' as const };
  const bridge = { x: 53, z: 22, layer: 'elevated' as const };
  expect(fixturePositionsShareLayer(underpass, bridge)).toBe(false);
  expect(hasFixtureBallisticLineOfSight(underpass, bridge)).toBe(false);
  const combat = new IntegratedFixtureCombat();
  combat.beginJob('MC-OPT-F01-01');
  combat.setSquadPositions({ x: 67, z: 39, layer: 'elevated' }, { x: 67, z: 39, layer: 'elevated' });
  expect(combat.advance(.2)).toHaveLength(0);
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

it('resolves baseline and F2 capacities/refill timing from exact fitted instances', () => {
  let profile = createIntegratedFixtureWorkshopProfile();
  expect(resolveFixtureGunProfile(profile, 'TAB-A')).toMatchObject({ store: 12, refillSeconds: 1.5 });
  profile = settleFixtureWorkshopMission(profile, 'fund').profile;
  profile = commitFixtureWorkshop(profile, { commandId: 'buy', expectedRevision: profile.revision, action: 'buy-f2' }).profile;
  profile = commitFixtureWorkshop(profile, { commandId: 'fit', expectedRevision: profile.revision, action: 'fit-f2-a', partInstanceId: 'INT-B1-TAB-F2-buy' }).profile;
  expect(resolveFixtureGunProfile(profile, 'TAB-A')).toMatchObject({ store: 18, refillSeconds: 2.7 });
  expect(resolveFixtureGunProfile(profile, 'TAB-B')).toMatchObject({ store: 12, refillSeconds: 1.5, fullRangeMetres: 15 });
});

it('uses F2’s real 18-shot store and blocks fire until its 2.7s per-instance refill completes', () => {
  let profile = settleFixtureWorkshopMission(createIntegratedFixtureWorkshopProfile(), 'fund').profile;
  profile = commitFixtureWorkshop(profile, { commandId: 'buy', expectedRevision: profile.revision, action: 'buy-f2' }).profile;
  profile = commitFixtureWorkshop(profile, { commandId: 'fit', expectedRevision: profile.revision, action: 'fit-f2-a', partInstanceId: 'INT-B1-TAB-F2-buy' }).profile;
  const combat = new IntegratedFixtureCombat(profile); combat.beginJob('MC-OPT-R01-01'); combat.setFixtureHostileHealth('r01-a', 10000); combat.setSquadPositions({ x: 34, z: 38 }, { x: 0, z: 0 });
  const fired = combat.advance(4.6).filter(event => event.type === 'weapon-fired' && event.sourceId === 'tabby');
  expect(fired).toHaveLength(18); expect(combat.activeGun('tabby').supply).toBe(0);
  expect(combat.advance(2.69).filter(event => event.type === 'weapon-fired' && event.sourceId === 'tabby')).toHaveLength(0);
  combat.advance(.02); expect(combat.activeGun('tabby').supply).toBe(18);
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

it('keeps an extraction active until its persistence adapter explicitly publishes settlement', () => {
  const operation = new IntegratedFixtureOperation();
  operation.inspect('MC-OPT-F01-01'); operation.accept(); operation.activate(); operation.interact('INT-FB-F01-DISPUTED-LOT');
  expect(operation.canExtract()).toBe(true);
  // A failed durable write deliberately does not call extract().
  expect(operation.snapshot().phase).toBe('active');
  expect(operation.canExtract()).toBe(true);
  expect(operation.extract()).toBe(true);
  expect(operation.snapshot().phase).toBe('settled');
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

it('normalizes wipe and surrender recovery to one fee per failed attempt', () => {
  const active = beginFixtureAttempt('event-repeat' as any, 'attempt-1' as any);
  const failed = terminalFixtureAttempt(active, 'failure');
  const first = recoverFixtureFailure(failed, 1390);
  expect(first).toMatchObject({ applied: true, fee: 139 });
  expect(1390 - first.fee).toBe(1251);
  expect(recoverFixtureFailure(first.attempt, 1390)).toMatchObject({ applied: false, fee: 0 });
  expect(terminalFixtureAttempt(terminalFixtureAttempt(active, 'victory'), 'failure').terminal).toBe('victory');
});

it('persists one recovery fee then rewards a fresh retry once', () => {
  let p = createIntegratedFixtureWorkshopProfile();
  p = { ...p, wallet: { ...p.wallet, credits: 1390 }, attempts: [beginFixtureAttempt('event-1' as any, 'attempt-1' as any)] };
  p = failFixtureProfileAttempt(p, 'attempt-1' as any).profile; expect(p.wallet.credits).toBe(1251);
  expect(failFixtureProfileAttempt(p, 'attempt-1' as any).applied).toBe(false);
  p = retryFixtureProfileAttempt(p, 'event-1' as any, 'attempt-2' as any).profile;
  p = settleFixtureProfileAttempt(p, 'attempt-2' as any).profile; expect(p.wallet.credits).toBe(2251);
  expect(settleFixtureProfileAttempt(p, 'attempt-2' as any).applied).toBe(false);
});

it('keeps resources and parts through recovery and applies both requested recovery examples', () => {
  const initial = createIntegratedFixtureWorkshopProfile();
  const parts = JSON.stringify(initial.parts);
  const materials = initial.wallet;
  let profile = initial;
  profile = { ...initial, wallet: { ...initial.wallet, credits: 850 }, attempts: [beginFixtureAttempt('event-keep' as any, 'attempt-keep-1' as any)] };
  const failed = failFixtureProfileAttempt(profile, 'attempt-keep-1' as any);
  expect(failed).toMatchObject({ applied: true, fee: 85 });
  expect(failed.profile.wallet).toMatchObject({ credits: 765, metal: materials.metal, circuits: materials.circuits, cloth: materials.cloth, flux: materials.flux });
  expect(JSON.stringify(failed.profile.parts)).toBe(parts);
  profile = retryFixtureProfileAttempt(failed.profile, 'event-keep' as any, 'attempt-keep-2' as any).profile;
  const won = settleFixtureProfileAttempt(profile, 'attempt-keep-2' as any);
  expect(won.profile.wallet.credits).toBe(1765);
  expect(JSON.stringify(won.profile.parts)).toBe(parts);
});

it('allocates durable distinct events, reuses an event only for recovery retry, and keeps repeated callbacks inert', () => {
  let profile = createIntegratedFixtureWorkshopProfile();
  const firstEvent = nextFixtureWorldEventId(profile, 'MC-OPT-F01-01');
  const firstAttempt = nextFixtureAttemptId(profile, firstEvent);
  profile = beginFixtureProfileAttempt(profile, firstEvent, firstAttempt).profile;
  expect(beginFixtureProfileAttempt(profile, firstEvent, firstAttempt).applied).toBe(false);
  profile = failFixtureProfileAttempt(profile, firstAttempt).profile;
  expect(failFixtureProfileAttempt(profile, firstAttempt).applied).toBe(false);
  const retry = nextFixtureAttemptId(profile, firstEvent);
  profile = retryFixtureProfileAttempt(profile, firstEvent, retry).profile;
  expect(retry).not.toBe(firstAttempt);
  profile = settleFixtureProfileAttempt(profile, retry).profile;
  expect(settleFixtureProfileAttempt(profile, retry).applied).toBe(false);
  expect(failFixtureProfileAttempt(profile, retry).applied).toBe(false);
  const secondEvent = nextFixtureWorldEventId(profile, 'MC-OPT-F01-01');
  expect(secondEvent).not.toBe(firstEvent);
  const receiptOne = settleIntegratedFixtureEvent(createIntegratedFixtureSave(), 'MC-OPT-F01-01', firstEvent, retry);
  expect(settleIntegratedFixtureEvent(receiptOne.save, 'MC-OPT-F01-01', firstEvent, retry).applied).toBe(false);
  expect(settleIntegratedFixtureEvent(receiptOne.save, 'MC-OPT-F01-01', secondEvent, 'attempt-new' as any).applied).toBe(true);
});

it('round-trips the one live envelope without granting a historical receipt a mutation path', () => {
  const envelope = createIntegratedFixtureEnvelope();
  const event = nextFixtureWorldEventId(envelope.workshop, 'MC-OPT-R01-01');
  const attempt = nextFixtureAttemptId(envelope.workshop, event);
  const begun = beginFixtureProfileAttempt(envelope.workshop, event, attempt).profile;
  const stored = { ...envelope, workshop: begun, liveMission: { jobId: 'MC-OPT-R01-01' as const, worldEventId: event, attemptId: attempt, completedInteractionIds: ['INT-FB-R01-MARKER-A'], finiteEnemyGroupCleared: false, recoveryRequired: false, checkpointRevision: 0, ownerEpoch: 0 } };
  const restored = deserializeIntegratedFixtureEnvelope(JSON.stringify(stored));
  expect(restored.liveMission).toEqual(stored.liveMission);
  expect(restored.workshop.attempts).toEqual(begun.attempts);
  const receipt = settleIntegratedFixtureEvent(restored.mission, 'MC-OPT-R01-01', event, attempt).save;
  const before = JSON.stringify(receipt);
  expect(historicalFixtureMissionReplay(receipt, receipt.receipts[0]!.id)).toBeDefined();
  expect(JSON.stringify(receipt)).toBe(before);
});

it('round-trips the exact active combat survivors instead of rebuilding a fresh squad', () => {
  const envelope = createIntegratedFixtureEnvelope();
  const event = nextFixtureWorldEventId(envelope.workshop, 'MC-OPT-F01-01');
  const attempt = nextFixtureAttemptId(envelope.workshop, event);
  const workshop = beginFixtureProfileAttempt(envelope.workshop, event, attempt).profile;
  const combat = new IntegratedFixtureCombat(workshop);
  combat.beginJob('MC-OPT-F01-01');
  combat.setSquadPositions({ x: 62, z: 38 }, { x: 60.5, z: 38 });
  combat.swapActiveGun('hound');
  combat.advance(.35);
  combat.setFixtureSquadHealth('tabby', 41);
  const snapshot = combat.snapshot('hound');
  const stored = {
    ...envelope,
    workshop,
    liveMission: {
      jobId: 'MC-OPT-F01-01' as const,
      worldEventId: event,
      attemptId: attempt,
      completedInteractionIds: [],
      finiteEnemyGroupCleared: false,
      recoveryRequired: false,
      checkpointRevision: 0,
      ownerEpoch: 0,
      combatSnapshot: snapshot,
    },
  };
  const restored = deserializeIntegratedFixtureEnvelope(JSON.stringify(stored));
  expect(restored.liveMission?.combatSnapshot).toEqual(snapshot);
  const resumed = new IntegratedFixtureCombat(restored.workshop);
  resumed.restoreJob('MC-OPT-F01-01', false);
  expect(resumed.restore(restored.liveMission!.combatSnapshot!, 'MC-OPT-F01-01', false)).toBe(true);
  expect(resumed.snapshot('hound')).toEqual(snapshot);
});

it('migrates an active pre-fence envelope to zero checkpoint revision and owner epoch', () => {
  const envelope = createIntegratedFixtureEnvelope();
  const event = nextFixtureWorldEventId(envelope.workshop, 'MC-OPT-F01-01');
  const attempt = nextFixtureAttemptId(envelope.workshop, event);
  const workshop = beginFixtureProfileAttempt(envelope.workshop, event, attempt).profile;
  const restored = deserializeIntegratedFixtureEnvelope(JSON.stringify({
    ...envelope, workshop, liveMission: { jobId: 'MC-OPT-F01-01', worldEventId: event, attemptId: attempt, completedInteractionIds: [], finiteEnemyGroupCleared: false, recoveryRequired: false },
  }));
  expect(restored.liveMission?.checkpointRevision).toBe(0);
  expect(restored.liveMission?.ownerEpoch).toBe(0);
});

it('assigns the z16 ramp boundary to elevated traffic in both directions', () => {
  expect(isFixtureTerrainPositionWalkable({ x: 40, z: 16, layer: 'ground' })).toBe(false);
  expect(isFixtureTerrainPositionWalkable({ x: 40, z: 16, layer: 'elevated' })).toBe(true);
  expect(moveFixtureTerrainPosition({ x: 40, z: 15.9, layer: 'ground' }, { x: 40, z: 16, layer: 'ground' }).position).toEqual({ x: 40, z: 16, layer: 'elevated' });
  expect(moveFixtureTerrainPosition({ x: 40, z: 16, layer: 'elevated' }, { x: 40, z: 15.9, layer: 'elevated' }).position).toEqual({ x: 40, z: 15.9, layer: 'ground' });
});

it('keeps a prior isolated receipt readable without importing a normal game save', () => {
  const oldFixtureSave = JSON.stringify({ version: 'int-fb-v1', seed: 'int-fb-post-chapter-2', receipts: [{ id: 'int-fb:MC-OPT-F01-01:settlement', jobId: 'MC-OPT-F01-01', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6 }] });
  const restored = deserializeIntegratedFixtureSave(oldFixtureSave);
  expect(restored.receipts[0]).toMatchObject({ id: 'int-fb:MC-OPT-F01-01:settlement', worldEventId: 'MC-OPT-F01-01', attemptId: 'legacy-attempt:MC-OPT-F01-01' });
  expect(historicalFixtureMissionReplay(restored, 'int-fb:MC-OPT-F01-01:settlement')?.text).toContain('Historical receipt');
});

it('commits the directed B1 workshop ledger as unique, full-slot transactions', () => {
  let p = createIntegratedFixtureWorkshopProfile();
  expect(p.parts).toHaveLength(25);
  expect(p.parts.filter(part => part.instanceId.includes('-BASE'))).toHaveLength(24);
  expect(Object.values(p.gunSlots).flatMap(gun => Object.values(gun))).toHaveLength(24);
  expect(p.gunSlots['TAB-B'].B).toBe('INT-B1-TAB-B2-GIFT');
  p = settleFixtureWorkshopMission(p, 'job-1').profile;
  expect(p.wallet.credits).toBe(4000);
  p = commitFixtureWorkshop(p, { commandId: 'buy-1', expectedRevision: p.revision, action: 'buy-f2' }).profile;
  expect(p.wallet.credits).toBe(2350);
  p = commitFixtureWorkshop(p, { commandId: 'fit-1', expectedRevision: p.revision, action: 'fit-f2-a', partInstanceId: 'INT-B1-TAB-F2-buy-1' }).profile;
  expect(p.gunSlots['TAB-A'].F).toBe('INT-B1-TAB-F2-buy-1');
  expect(commitFixtureWorkshop(p, { commandId: 'claim-before-discovery', expectedRevision: p.revision, action: 'claim-h2' })).toMatchObject({ applied: false, reason: 'undiscovered-loot' });
  p = commitFixtureWorkshop(p, { commandId: 'discover-1', expectedRevision: p.revision, action: 'discover-h2' }).profile;
  p = commitFixtureWorkshop(p, { commandId: 'claim-1', expectedRevision: p.revision, action: 'claim-h2' }).profile;
  p = commitFixtureWorkshop(p, { commandId: 'sell-1', expectedRevision: p.revision, action: 'sell-h2' }).profile;
  expect(p.wallet.credits).toBe(2890);
  p = commitFixtureWorkshop(p, { commandId: 'build-1', expectedRevision: p.revision, action: 'build-b3' }).profile;
  p = commitFixtureWorkshop(p, { commandId: 'fit-b3', expectedRevision: p.revision, action: 'fit-b3-a', partInstanceId: 'INT-B1-TAB-B3-build-1' }).profile;
  p = commitFixtureWorkshop(p, { commandId: 'develop-1', expectedRevision: p.revision, action: 'develop-b2' }).profile;
  expect(p.wallet).toEqual({ credits: 1390, metal: 40, circuits: 8, cloth: 18, flux: 3 });
  expect(p.parts).toHaveLength(27);
  expect(p.gunSlots['TAB-A']).toMatchObject({ B: 'INT-B1-TAB-B3-build-1', F: 'INT-B1-TAB-F2-buy-1' });
  expect(p.gunSlots['TAB-B'].B).toBe('INT-B1-TAB-B2-GIFT');
  expect(p.parts.find(part => part.instanceId === 'INT-B1-TAB-B2-GIFT')).toMatchObject({ tier: 2, version: 2, provenance: 'C01.2 first-barrel fixture grant' });
  expect(Object.values(p.gunSlots).flatMap(gun => Object.values(gun))).toHaveLength(24);
  expect(new Set(Object.values(p.gunSlots).flatMap(gun => Object.values(gun))).size).toBe(24);
  expect(p.parts.some(part => part.instanceId === 'INT-B1-TAB-A-B-BASE')).toBe(true);
  expect(p.parts.some(part => part.instanceId === 'INT-B1-TAB-A-F-BASE')).toBe(true);
  expect(commitFixtureWorkshop(p, { commandId: 'develop-1', expectedRevision: p.revision, action: 'develop-b2' })).toMatchObject({ applied: false, reason: 'duplicate-command' });
});

it('rejects stale commands without changing the snapshot and replays the original receipt', () => {
  const p = createIntegratedFixtureWorkshopProfile();
  expect(commitFixtureWorkshop(p, { profileId: 'other-profile', commandId: 'wrong-profile', expectedRevision: 0, action: 'buy-f2' })).toMatchObject({ applied: false, reason: 'wrong-profile' });
  const first = commitFixtureWorkshop(p, { commandId: 'buy-once', expectedRevision: 0, action: 'buy-f2' });
  expect(first.applied).toBe(true);
  const replay = commitFixtureWorkshop(first.profile, { commandId: 'buy-once', expectedRevision: 1, action: 'buy-f2' });
  expect(replay).toMatchObject({ applied: false, reason: 'duplicate-command', receipt: { commandId: 'buy-once', outputIds: ['INT-B1-TAB-F2-buy-once'] } });
  const before = JSON.stringify(first.profile);
  expect(commitFixtureWorkshop(first.profile, { commandId: 'stale', expectedRevision: 0, action: 'build-b3' })).toMatchObject({ applied: false, reason: 'stale-revision' });
  expect(JSON.stringify(first.profile)).toBe(before);
});

it('keeps separate paid outputs distinct and rejects malformed persisted workshop snapshots', () => {
  let p = createIntegratedFixtureWorkshopProfile();
  p = settleFixtureWorkshopMission(p, 'mission-funding').profile;
  const one = commitFixtureWorkshop(p, { commandId: 'buy-one', expectedRevision: p.revision, action: 'buy-f2' }); p = one.profile;
  const two = commitFixtureWorkshop(p, { commandId: 'buy-two', expectedRevision: p.revision, action: 'buy-f2' });
  expect(two.receipt!.outputIds[0]).not.toBe(one.receipt!.outputIds[0]);
  expect(two.profile.parts.filter(part => part.kind === 'F2')).toHaveLength(2);
  expect(deserializeIntegratedFixtureWorkshopProfile({ version: 'int-fb-profile-v2', revision: 1, wallet: { credits: 1 }, parts: [], gunSlots: {}, claims: [], receipts: [] }).revision).toBe(0);
});

it('does not publish a paid workshop mutation when the single snapshot write fails', () => {
  const p = createIntegratedFixtureWorkshopProfile();
  const before = JSON.stringify(p);
  const result = commitAndPersistFixtureWorkshop(p, { commandId: 'write-fails', expectedRevision: p.revision, action: 'buy-f2' }, () => { throw new Error('quota'); });
  expect(result).toMatchObject({ applied: false, reason: 'storage-failed', profile: p });
  expect(JSON.stringify(p)).toBe(before);
});
