import { describe, expect, it } from 'vitest';
import { commitLateFixture, createLateFixtureProfile, decodeLateFixtureProfile, LateRangeCombat, lateFullRangeMetres, resolveFittedLateHmRange, resolveLateBarrelVector, sampleLateRefinement, type LateFixtureProfile } from '../src/gameplay/lateFixture';

it('seeds an isolated Chapter-5 sale and keep-loot fixture without touching B1', () => {
  const sale = createLateFixtureProfile();
  const keep = createLateFixtureProfile({ receiptIds: [], paidEventIds: [], h2State: 'kept' });
  expect(sale).toMatchObject({ declaration: 'This is a later workshop test save with Chapter 5 capability already unlocked. Your earlier test save is unchanged.', wallet: { credits: 3000, metal: 100, circuits: 20 }, pinnedEarlierHistory: { h2State: 'unavailable', receiptIds: [], paidEventIds: [] } });
  expect(sale.parts).toHaveLength(29);
  expect(keep.parts).toHaveLength(30);
  expect(sale.parts.filter(part => part.id.startsWith('INT-LATE-DONOR-')).map(part => part.id)).toEqual(['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2']);
  expect(sale.parts.find(part => part.id === 'INT-LATE-TAB-A-B')?.id).not.toBe('INT-LATE-DONOR-B3-T2');
  expect(sale.parts.find(part => part.id === 'INT-LATE-TAB-A-F1-DISPLACED')?.protected).toBe(true);
});

it('rejects fitted donors, then fits an unassigned merged output for free', () => {
  const profile = createLateFixtureProfile();
  expect(commitLateFixture(profile, { commandId: 'bad', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-TAB-B-B', 'INT-LATE-DONOR-B3-T2'] })).toMatchObject({ applied: false, reason: 'ineligible-merge' });
  const merged = commitLateFixture(profile, { commandId: 'merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .3);
  const output = merged.profile.parts.find(part => part.kind === 'B-HM')!;
  const fitted = commitLateFixture(merged.profile, { commandId: 'fit', expectedRevision: merged.profile.revision, action: 'fit', inputIds: [output.id], targetGun: 'TAB-A' });
  expect(fitted.profile.parts.find(part => part.id === output.id)?.assignedTo).toBe('TAB-A');
});

it('uses the supplied persisted vectors and one capped additive range lane', () => {
  expect(resolveLateBarrelVector('B-HM', 'Balanced50')).toEqual({ range: .975, setup: 1.125, cone: 1.125, contactWidthMetres: .13 });
  expect(resolveLateBarrelVector('B2', 'LeanA25')).toEqual({ range: 1.2625, setup: 1.25, cone: .65, contactWidthMetres: .0198 });
  expect(lateFullRangeMetres(.975, 2)).toEqual({ full: 12.402, max: 24.804 });
  expect(lateFullRangeMetres(1.25, 2)).toEqual({ full: 15.9, max: 31.8 });
});

it('resolves late range only from an actually persisted fitted TAB-A HM', () => {
  const merged = commitLateFixture(createLateFixtureProfile(), { commandId: 'range-merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .3).profile;
  const hm = merged.parts.find(part => part.kind === 'B-HM')!;
  expect(resolveFittedLateHmRange(merged)).toBeUndefined();
  const fitted = commitLateFixture(merged, { commandId: 'range-fit', expectedRevision: 1, action: 'fit', inputIds: [hm.id], targetGun: 'TAB-A' }).profile;
  expect(resolveFittedLateHmRange(fitted)).toEqual({ instanceId: hm.id, refinement: 'Balanced50', full: 12.402, max: 24.804 });
});

it('uses the shared contact falloff resolver for independent late range targets', () => {
  const combat = new LateRangeCombat({ full: 12.402, max: 24.804 });
  expect(combat.fire()).toMatchObject({ targetId: 'full', distance: 12, damage: 30, targetHealth: 0, projectileTravelled: 12 });
  expect(combat.fire()).toMatchObject({ targetId: 'falloff', distance: 18, damage: expect.any(Number), projectileTravelled: 18 });
  expect(combat.fire()!.damage).toBeGreaterThan(0);
  expect(combat.fire()).toMatchObject({ targetId: 'outside', distance: 27, damage: 0, targetHealth: 30, projectileTravelled: 27 });
});

describe('late fixture refinement transactions', () => {
  it.each([
    [0, 'LeanA25'], [.25, 'Balanced50'], [.749999, 'Balanced50'], [.75, 'LeanB25'],
  ] as const)('samples the approved 25/50/25 lane exactly (%s)', (roll, expected) => {
    expect(sampleLateRefinement(() => roll)).toBe(expected);
  });

  it('persists a single merge roll in both the output and receipt before acknowledgement', () => {
    const seed = createLateFixtureProfile();
    const result = commitLateFixture(seed, { commandId: 'merge-lean-b', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .9);
    expect(result).toMatchObject({ applied: true, profile: { revision: 1, receipts: [{ commandId: 'merge-lean-b', refinement: 'LeanB25' }] } });
    expect(result.profile.parts.find(part => part.kind === 'B-HM')).toMatchObject({ refinement: 'LeanB25', version: 1 });
    expect(commitLateFixture(result.profile, { commandId: 'merge-lean-b', expectedRevision: 1, action: 'merge', inputIds: [] }, () => 0)).toMatchObject({ applied: false, reason: 'duplicate-command', profile: result.profile });
  });

  it('permits an eligible same-blueprint merge and develops without changing refinement', () => {
    const seed = createLateFixtureProfile();
    const donor = seed.parts.find(part => part.id === 'INT-LATE-DONOR-B2-T2')!;
    const sameBlueprint = { ...seed, parts: [...seed.parts, { ...donor, id: 'INT-LATE-DONOR-B2-T2-SECOND' }] } as LateFixtureProfile;
    const merged = commitLateFixture(sameBlueprint, { commandId: 'same-b2', expectedRevision: 0, action: 'merge', inputIds: [donor.id, 'INT-LATE-DONOR-B2-T2-SECOND'] }, () => 0);
    expect(merged).toMatchObject({ applied: true, profile: { receipts: [{ refinement: 'LeanA25' }] } });
    expect(merged.profile.parts.find(part => part.id === 'INT-LATE-TAB-B2-same-b2')).toMatchObject({ tier: 3, refinement: 'LeanA25', version: 1 });
    const developed = commitLateFixture(seed, { commandId: 'develop', expectedRevision: 0, action: 'develop', inputIds: [donor.id] });
    expect(developed.profile.parts.find(part => part.id === donor.id)).toMatchObject({ tier: 3, refinement: 'Balanced50', version: 2 });
  });

  it('keeps Build explicitly Balanced and preserves the approved vectors', () => {
    const seed = createLateFixtureProfile();
    const merged = commitLateFixture(seed, { commandId: 'discover', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .1);
    const built = commitLateFixture(merged.profile, { commandId: 'build', expectedRevision: 1, action: 'build' }, () => .99);
    expect(built.profile.parts.find(part => part.id === 'INT-LATE-TAB-B-HM-build')).toMatchObject({ refinement: 'Balanced50', version: 1 });
    expect(resolveLateBarrelVector('B-HM', 'Balanced50')).toEqual({ range: .975, setup: 1.125, cone: 1.125, contactWidthMetres: .13 });
  });

  it('round-trips a modern zero-input Build receipt and permits the next command', () => {
    const merged = commitLateFixture(createLateFixtureProfile(), { commandId: 'discover-for-build', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .3).profile;
    const built = commitLateFixture(merged, { commandId: 'modern-build', expectedRevision: 1, action: 'build' }).profile;
    expect(built.receipts.at(-1)).toMatchObject({ action: 'build', inputIds: [], inputVersions: [], workshopStamp: 'INT-FB-SERVICE-01' });
    const decoded = decodeLateFixtureProfile(JSON.stringify(built));
    expect(decoded.state).toBe('valid');
    if (decoded.state !== 'valid') throw new Error('modern Build profile should decode');
    const output = decoded.profile.parts.find(part => part.id === 'INT-LATE-TAB-B-HM-modern-build')!;
    expect(commitLateFixture(decoded.profile, { commandId: 'fit-after-build', expectedRevision: 2, action: 'fit', inputIds: [output.id], targetGun: 'TAB-A' })).toMatchObject({ applied: true });
    const writtenBy94ce = JSON.parse(JSON.stringify(built));
    delete writtenBy94ce.receipts.at(-1).inputIds;
    delete writtenBy94ce.receipts.at(-1).inputVersions;
    expect(decodeLateFixtureProfile(JSON.stringify(writtenBy94ce)).state).toBe('valid');
  });

  it('does not draw refinement for rejected capability/schematic commands', () => {
    const seed = createLateFixtureProfile(); let draws = 0;
    const rng = () => { draws += 1; return .1; };
    const missingMergeCapability = { ...seed, capabilities: [] } as LateFixtureProfile;
    expect(commitLateFixture(missingMergeCapability, { commandId: 'blocked-merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, rng)).toMatchObject({ applied: false, reason: 'ineligible-merge' });
    expect(draws).toBe(0);
    const discovered = commitLateFixture(seed, { commandId: 'discover', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, rng).profile;
    const missingSchematic = { ...discovered, knownSchematics: ['TAB-B2'] } as LateFixtureProfile;
    expect(commitLateFixture(missingSchematic, { commandId: 'blocked-build', expectedRevision: 1, action: 'build' }, rng)).toMatchObject({ applied: false, reason: 'ineligible-build' });
    expect(draws).toBe(1);
  });

  it('requires T3, matching barrel schematics, and TAB barrel donors before mutation', () => {
    const seed = createLateFixtureProfile();
    const merge = { commandId: 'gate-merge', expectedRevision: 0, action: 'merge' as const, inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] };
    expect(commitLateFixture({ ...seed, capabilities: ['CHAPTER-5-MERGE'] } as LateFixtureProfile, merge)).toMatchObject({ applied: false, reason: 'ineligible-merge' });
    const incompatible = { ...seed, parts: seed.parts.map(part => part.id === 'INT-LATE-DONOR-B3-T2' ? { ...part, family: 'HOU' as const } : part) } as LateFixtureProfile;
    expect(commitLateFixture(incompatible, merge)).toMatchObject({ applied: false, reason: 'ineligible-merge' });
    const develop = { commandId: 'gate-develop', expectedRevision: 0, action: 'develop' as const, inputIds: ['INT-LATE-DONOR-B2-T2'] };
    expect(commitLateFixture({ ...seed, capabilities: ['CHAPTER-5-MERGE'] } as LateFixtureProfile, develop)).toMatchObject({ applied: false, reason: 'ineligible-develop' });
    expect(commitLateFixture({ ...seed, knownSchematics: ['TAB-B3'] } as LateFixtureProfile, develop)).toMatchObject({ applied: false, reason: 'ineligible-develop' });
  });

  it('accepts a consumed historical refinement output but rejects a present mismatch', () => {
    const merged = commitLateFixture(createLateFixtureProfile(), { commandId: 'recorded-merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => 0).profile;
    const outputId = merged.receipts[0]!.outputIds[0]!;
    const consumed = { ...merged, parts: merged.parts.filter(part => part.id !== outputId) };
    expect(decodeLateFixtureProfile(JSON.stringify(consumed)).state).toBe('valid');
    const mismatched = { ...merged, parts: merged.parts.map(part => part.id === outputId ? { ...part, refinement: 'LeanB25' as const } : part) };
    expect(decodeLateFixtureProfile(JSON.stringify(mismatched)).state).toBe('invalid');
  });

  it('persists immutable manufacturer, source-version, and workshop lineage for new work', () => {
    const seed = createLateFixtureProfile();
    expect(seed.parts.find(part => part.id === 'INT-LATE-TAB-B-B')).toMatchObject({ originalMaker: 'Needlebank Instruments', version: 1 });
    expect(seed.parts.find(part => part.id === 'INT-LATE-TAB-A-B')).toMatchObject({ originalMaker: 'Oddlot Cooperative', version: 1 });
    const merged = commitLateFixture(seed, { commandId: 'lineage-merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }, () => .3).profile;
    const output = merged.parts.find(part => part.id === 'INT-LATE-TAB-B-HM-lineage-merge')!;
    expect(output).toMatchObject({ workshopStamp: 'INT-FB-SERVICE-01', sourceInstanceIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'], sourceVersions: [1, 1], version: 1 });
    expect(merged.receipts[0]).toMatchObject({ inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'], inputVersions: [1, 1], workshopStamp: 'INT-FB-SERVICE-01' });
    const developed = commitLateFixture(createLateFixtureProfile(), { commandId: 'lineage-develop', expectedRevision: 0, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }).profile;
    expect(developed.parts.find(part => part.id === 'INT-LATE-DONOR-B2-T2')).toMatchObject({ version: 2, workshopStamp: 'INT-FB-SERVICE-01', originalMaker: 'Needlebank Instruments' });
    expect(developed.receipts[0]).toMatchObject({ inputIds: ['INT-LATE-DONOR-B2-T2'], inputVersions: [1], workshopStamp: 'INT-FB-SERVICE-01' });
    expect(decodeLateFixtureProfile(JSON.stringify(merged)).state).toBe('valid');
    const legacy = JSON.parse(JSON.stringify(seed));
    for (const part of legacy.parts) delete part.originalMaker;
    expect(decodeLateFixtureProfile(JSON.stringify(legacy)).state).toBe('valid');
    const orphaned = JSON.parse(JSON.stringify(merged)); orphaned.parts.find((part: { id: string }) => part.id === output.id).sourceVersions = [1];
    expect(decodeLateFixtureProfile(JSON.stringify(orphaned)).state).toBe('invalid');
    const receiptMismatch = JSON.parse(JSON.stringify(merged)); receiptMismatch.receipts[0].inputVersions = [2, 1];
    expect(decodeLateFixtureProfile(JSON.stringify(receiptMismatch)).state).toBe('invalid');
  });
});
