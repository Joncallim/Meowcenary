import { describe, expect, it } from 'vitest';
import { commitLateFixture, createLateFixtureProfile, lateFullRangeMetres, resolveLateBarrelVector, sampleLateRefinement, type LateFixtureProfile } from '../src/gameplay/lateFixture';

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
});
