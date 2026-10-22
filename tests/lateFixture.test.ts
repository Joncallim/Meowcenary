import { expect, it } from 'vitest';
import { commitLateFixture, createLateFixtureProfile, lateFullRangeMetres, resolveLateBarrelVector } from '../src/gameplay/lateFixture';

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

it('merges only distinct unassigned T2 donors once, then fits its unassigned output for free', () => {
  const p = createLateFixtureProfile();
  const rejected = commitLateFixture(p, { commandId: 'bad', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-TAB-B-B', 'INT-LATE-DONOR-B3-T2'] });
  expect(rejected).toMatchObject({ applied: false, reason: 'ineligible-merge', profile: p });
  const merged = commitLateFixture(p, { commandId: 'merge', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] });
  expect(merged.applied).toBe(true);
  expect(merged.profile.parts).toHaveLength(28);
  const output = merged.profile.parts.find(part => part.kind === 'B-HM')!;
  expect(output).toMatchObject({ tier: 3, refinement: 'Balanced50' });
  expect(output.assignedTo).toBeUndefined();
  const fitted = commitLateFixture(merged.profile, { commandId: 'fit', expectedRevision: merged.profile.revision, action: 'fit', inputIds: [output.id], targetGun: 'TAB-A' });
  expect(fitted).toMatchObject({ applied: true });
  expect(fitted.profile.parts.find(part => part.id === output.id)?.assignedTo).toBe('TAB-A');
  expect(commitLateFixture(fitted.profile, { commandId: 'merge', expectedRevision: fitted.profile.revision, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] })).toMatchObject({ applied: false, reason: 'duplicate-command' });
});

it('uses the supplied persisted vectors and one capped additive range lane', () => {
  expect(resolveLateBarrelVector('B-HM', 'Balanced50')).toEqual({ range: .975, setup: 1.125, cone: 1.125, contactWidthMetres: .13 });
  expect(resolveLateBarrelVector('B2', 'LeanA25')).toEqual({ range: 1.2625, setup: 1.25, cone: .65, contactWidthMetres: .0198 });
  expect(lateFullRangeMetres(.975, 2)).toEqual({ full: 12.402, max: 24.804 });
  expect(lateFullRangeMetres(1.25, 2)).toEqual({ full: 15.9, max: 31.8 });
});
