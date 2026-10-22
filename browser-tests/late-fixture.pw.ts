import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Part = { id: string; kind: string; tier: number | null; refinement?: string; assignedTo?: string };
type Receipt = { commandId: string; action: string; outputIds: readonly string[]; refinement?: string };
type Diagnostics = { scene: string; revision: number; parts: number; partRecords: readonly Part[]; wallet: { credits: number; metal: number; circuits: number }; receipts: readonly Receipt[]; discoveries: readonly string[]; pinnedEarlierHistory: { receiptIds: readonly string[]; paidEventIds: readonly string[]; h2State: string }; currentH2State: string; declaration: string; message: string };
type LateSeam = { diagnostics(): Diagnostics; commit(command: { commandId: string; expectedRevision: number; action: 'develop' | 'merge' | 'build' | 'fit'; inputIds?: readonly string[]; targetGun?: 'TAB-A' }): Promise<boolean>; failNextStorageWrite(): void; failNextStorageRead(): void; rejectNextWriterLock(): void };
type B1Seam = { prepareF01(): boolean };

const b1Key = 'meowcenary:int-fb:v1:profile';
const lateKey = 'meowcenary:int-late:v1:profile';
const seam = (page: Page) => page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__);
const diagnostics = (page: Page) => page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.diagnostics());

async function openLate(page: Page, info: TestInfo, h2: 'none' | 'kept' | 'sold' = 'none'): Promise<string> {
  test.skip(info.project.name !== 'desktop-1280x720', 'Late fixture has dedicated desktop runtime evidence; other viewport projects are intentionally not executed here.');
  await page.goto('/?fixture=int-fb');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_INT_FB__?: unknown }).__MEOWCENARY_INT_FB__))).toBe(true);
  // Seed through B1's ordinary activation transaction, then retain its exact
  // serialized envelope while entering the separate late route.
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_INT_FB__: B1Seam }).__MEOWCENARY_INT_FB__.prepareF01())).toBe(true);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), b1Key)).not.toBeNull();
  if (h2 !== 'none') await page.evaluate(state => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    raw.workshop.discoveries.push('INT-LOOT-01');
    raw.workshop.claims.push('INT-LOOT-01');
    if (state === 'kept') raw.workshop.parts.push({ instanceId: 'INT-B1-HOU-H2-LOOT', kind: 'H2', family: 'HOU', slot: 'H', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Kestrel Cut Assembly', provenance: 'integration loot fixture', version: 1 });
    else raw.workshop.receipts.push({ commandId: 'chosen-b1-sold-h2', action: 'sell-h2', revision: raw.workshop.revision, outputIds: [] });
    localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw));
  }, h2);
  const b1 = await page.evaluate(key => localStorage.getItem(key)!, b1Key);
  await page.evaluate(key => localStorage.removeItem(key), lateKey);
  await page.goto('/?fixture=int-late');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__))).toBe(true);
  expect(await diagnostics(page)).toMatchObject({ scene: 'LateFixtureScene', revision: 0, parts: h2 === 'kept' ? 30 : 29, declaration: 'This is a later workshop test save with Chapter 5 capability already unlocked. Your earlier test save is unchanged.' });
  return b1;
}
async function expectB1Unchanged(page: Page, before: string): Promise<void> { expect(await page.evaluate(key => localStorage.getItem(key), b1Key)).toBe(before); }
async function waitLateReload(page: Page): Promise<void> { await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__))).toBe(true); }

test('late UI confirms merge before presentation and reloads its single persisted result', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  await page.keyboard.press('m');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  expect(await diagnostics(page)).toMatchObject({ parts: 28, discoveries: ['TAB-B-HM'], message: expect.stringMatching(/^Confirmed merge \((LeanA25|Balanced50|LeanB25)\); receipt persisted before presentation\.$/), receipts: [{ commandId: 'late:merge:0', action: 'merge', outputIds: ['INT-LATE-TAB-B-HM-late:merge:0'], refinement: expect.stringMatching(/^(LeanA25|Balanced50|LeanB25)$/) }] });
  const stored = await page.evaluate(key => localStorage.getItem(key), lateKey);
  await page.reload();
  await waitLateReload(page);
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBe(stored);
  expect((await diagnostics(page)).partRecords.filter(part => part.kind === 'B-HM')).toHaveLength(1);
  await expectB1Unchanged(page, b1);
});

test('late UI rejects duplicate delivery, stale revision, and fitted donor merge without mutation', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  const initial = await diagnostics(page);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'fitted-donor', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-TAB-B-B', 'INT-LATE-DONOR-B3-T2'] }))).toBe(false);
  expect(await diagnostics(page)).toMatchObject({ revision: initial.revision, parts: initial.parts });
  await page.keyboard.press('m');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  const afterMerge = await diagnostics(page);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'late:merge:0', expectedRevision: 1, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }))).toBe(false);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'stale-build', expectedRevision: 0, action: 'build' }))).toBe(false);
  expect(await diagnostics(page)).toMatchObject({ revision: afterMerge.revision, parts: afterMerge.parts, receipts: afterMerge.receipts });
  await expectB1Unchanged(page, b1);
});

test('late UI develops an unassigned donor and persists its exact debit', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  await page.keyboard.press('d');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  expect(await diagnostics(page)).toMatchObject({ wallet: { credits: 2500, metal: 80, circuits: 16 }, receipts: [{ commandId: 'late:develop:0', action: 'develop' }] });
  expect((await diagnostics(page)).partRecords.find(part => part.id === 'INT-LATE-DONOR-B2-T2')).toMatchObject({ kind: 'B2', tier: 3 });
  await page.reload();
  await waitLateReload(page);
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  await expectB1Unchanged(page, b1);
});

test('late UI manufactures a distinct discovered Balanced B-HM after merge', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  await page.keyboard.press('m');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  await page.keyboard.press('u');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(2);
  const result = await diagnostics(page);
  expect(result).toMatchObject({ parts: 29, wallet: { credits: 1000, metal: 20, circuits: 4 }, discoveries: ['TAB-B-HM'] });
  expect(result.partRecords.filter(part => part.kind === 'B-HM').map(part => part.id)).toEqual(['INT-LATE-TAB-B-HM-late:merge:0', 'INT-LATE-TAB-B-HM-late:build:1']);
  expect(result.partRecords.filter(part => part.kind === 'B-HM').every(part => part.tier === 3 && !part.assignedTo)).toBe(true);
  await expectB1Unchanged(page, b1);
});

test('late UI visibly records retaining both donors without consuming either', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  await page.keyboard.press('n');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  const result = await diagnostics(page);
  expect(result).toMatchObject({ parts: 29, receipts: [{ commandId: 'late:retain:0', action: 'retain-donors' }] });
  expect(result.partRecords.map(part => part.id)).toContain('INT-LATE-DONOR-B2-T2');
  expect(result.partRecords.map(part => part.id)).toContain('INT-LATE-DONOR-B3-T2');
  await page.reload(); await waitLateReload(page);
  expect(await diagnostics(page)).toMatchObject({ revision: 1, parts: 29 });
  await expectB1Unchanged(page, b1);
});

test('late UI carries a kept B1 H2 history, then records an isolated late sale without re-claiming', async ({ page }, info) => {
  const b1 = await openLate(page, info, 'kept');
  expect(await diagnostics(page)).toMatchObject({ parts: 30, pinnedEarlierHistory: { h2State: 'kept' }, currentH2State: 'kept' });
  await page.keyboard.press('s');
  await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  expect(await diagnostics(page)).toMatchObject({ parts: 29, wallet: { credits: 3540 }, currentH2State: 'sold', receipts: [{ commandId: 'late:sell-h2:0', action: 'sell-h2' }] });
  await page.reload(); await waitLateReload(page);
  expect(await diagnostics(page)).toMatchObject({ currentH2State: 'sold', pinnedEarlierHistory: { h2State: 'kept' } });
  await expectB1Unchanged(page, b1);
});

test('late UI carries a sold B1 H2 history without restoring or re-claiming loot', async ({ page }, info) => {
  const b1 = await openLate(page, info, 'sold');
  expect(await diagnostics(page)).toMatchObject({ parts: 29, pinnedEarlierHistory: { h2State: 'sold' }, currentH2State: 'sold' });
  await page.keyboard.press('s');
  await expect.poll(async () => (await diagnostics(page)).message).toBe('Confirmation rejected: not-sellable.');
  expect(await diagnostics(page)).toMatchObject({ revision: 0, parts: 29, currentH2State: 'sold' });
  await page.reload(); await waitLateReload(page);
  expect(await diagnostics(page)).toMatchObject({ currentH2State: 'sold', pinnedEarlierHistory: { h2State: 'sold' } });
  await expectB1Unchanged(page, b1);
});

test('late UI fail-closes malformed persisted saves without changing late or B1 bytes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated corruption evidence runs once on desktop.');
  const variants = ['{bad-json', JSON.stringify({ version: 'unsupported' }), JSON.stringify({ version: 'int-late-v1', revision: 0, wallet: { credits: -1, metal: 0, circuits: 0, cloth: 0, flux: 0 }, parts: [], receipts: [], pinnedEarlierHistory: { receiptIds: [], paidEventIds: [], h2State: 'unavailable' } }), JSON.stringify({ version: 'int-late-v1', revision: 0, wallet: { credits: 1, metal: 0, circuits: 0, cloth: 0, flux: 0 }, parts: [{ id: 'x', assignedTo: 'TAB-A', family: 'TAB', slot: 'B' }, { id: 'y', assignedTo: 'TAB-A', family: 'TAB', slot: 'B' }], receipts: [], pinnedEarlierHistory: { receiptIds: [], paidEventIds: [], h2State: 'unavailable' } })];
  for (const raw of variants) {
    await page.goto('/?fixture=int-fb');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_INT_FB__?: unknown }).__MEOWCENARY_INT_FB__))).toBe(true);
    const b1 = await page.evaluate(value => { const b1 = localStorage.getItem('meowcenary:int-fb:v1:profile') ?? 'b1-preserved'; localStorage.setItem('meowcenary:int-fb:v1:profile', b1); localStorage.setItem('meowcenary:int-late:v1:profile', value); return b1; }, raw);
    await page.goto('/?fixture=int-late');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__))).toBe(true);
    expect(await diagnostics(page)).toMatchObject({ blocked: true, message: expect.stringContaining('preserved unchanged') });
    expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'blocked', expectedRevision: 0, action: 'merge', inputIds: [] }))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-late:v1:profile'))).toBe(raw);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(b1);
  }
});

test('invalid B1 history blocks late seeding without inventing empty history', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated strict B1 import evidence runs once on desktop.');
  await page.goto('/?fixture=int-fb'); await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_INT_FB__?: unknown }).__MEOWCENARY_INT_FB__))).toBe(true);
  const b1 = '{invalid-b1'; await page.evaluate(value => { localStorage.setItem('meowcenary:int-fb:v1:profile', value); localStorage.removeItem('meowcenary:int-late:v1:profile'); }, b1);
  await page.goto('/?fixture=int-late'); await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__))).toBe(true);
  expect(await diagnostics(page)).toMatchObject({ blocked: true, message: expect.stringContaining('Earlier B1 history is invalid') }); expect(await page.evaluate(key => localStorage.getItem(key), b1Key)).toBe(b1); expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBeNull();
});

test('late writer fences competing tabs at one durable revision', async ({ page }, info) => {
  const b1 = await openLate(page, info);
  const peer = await page.context().newPage(); await peer.goto('/?fixture=int-late'); await expect.poll(() => peer.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__))).toBe(true);
  const merge = { commandId: 'race-merge', expectedRevision: 0, action: 'merge' as const, inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] };
  const develop = { commandId: 'race-develop', expectedRevision: 0, action: 'develop' as const, inputIds: ['INT-LATE-DONOR-B2-T2'] };
  const [left, right] = await Promise.all([page.evaluate(c => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit(c), merge), peer.evaluate(c => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit(c), develop)]);
  expect([left, right].filter(Boolean)).toHaveLength(1);
  await page.reload(); await waitLateReload(page); const durable = await diagnostics(page); expect(durable).toMatchObject({ revision: 1 }); expect(durable.receipts).toHaveLength(1); if (durable.receipts[0]!.commandId === 'race-merge') expect(durable.partRecords.map(part => part.id)).not.toContain('INT-LATE-DONOR-B2-T2'); else expect(durable.partRecords.find(part => part.id === 'INT-LATE-DONOR-B2-T2')).toMatchObject({ tier: 3 }); await expectB1Unchanged(page, b1); await peer.close();
});

test('late decoder rejects an extra foreign-family assignment', async ({ page }, info) => {
  await openLate(page, info); expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'seed', expectedRevision: 0, action: 'retain-donors' } as any))).toBe(true);
  const corrupt = await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-late:v1:profile')!); raw.parts.push({ ...raw.parts.find((part: any) => part.id === 'INT-LATE-HOU-A-R'), id: 'foreign-extra', assignedTo: 'TAB-A' }); const text = JSON.stringify(raw); localStorage.setItem('meowcenary:int-late:v1:profile', text); return text; });
  await page.reload(); await waitLateReload(page); expect(await diagnostics(page)).toMatchObject({ blocked: true }); expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBe(corrupt);
});

test('late storage failure leaves durable and in-memory state unchanged', async ({ page }, info) => {
  await openLate(page, info); const before = await diagnostics(page); const raw = await page.evaluate(key => localStorage.getItem(key), lateKey);
  await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.failNextStorageWrite());
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'fail-write', expectedRevision: 0, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }))).toBe(false);
  expect(await diagnostics(page)).toMatchObject({ revision: before.revision, wallet: before.wallet, receipts: before.receipts }); expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBe(raw);
});

test('late merge write failure persists exactly one sampled refinement receipt after retry', async ({ page }, info) => {
  await openLate(page, info);
  const command = { commandId: 'retryable-merge', expectedRevision: 0, action: 'merge' as const, inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] };
  await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.failNextStorageWrite());
  expect(await page.evaluate(c => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit(c), command)).toBe(false);
  expect(await diagnostics(page)).toMatchObject({ revision: 0, receipts: [] });
  expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBeNull();
  expect(await page.evaluate(c => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit(c), command)).toBe(true);
  const persisted = await diagnostics(page);
  expect(persisted).toMatchObject({ revision: 1, receipts: [{ commandId: 'retryable-merge', refinement: expect.stringMatching(/^(LeanA25|Balanced50|LeanB25)$/) }] });
  expect(persisted.receipts).toHaveLength(1);
  const output = persisted.partRecords.find(part => part.id === 'INT-LATE-TAB-B-HM-retryable-merge')!;
  expect(output.refinement).toBe(persisted.receipts[0]!.refinement);
  await page.reload(); await waitLateReload(page);
  expect((await diagnostics(page)).receipts).toHaveLength(1);
});

test('late read and lock failures leave state retryable without duplicate receipts', async ({ page }, info) => {
  await openLate(page, info); const before = await diagnostics(page); const raw = await page.evaluate(key => localStorage.getItem(key), lateKey);
  for (const failure of ['failNextStorageRead', 'rejectNextWriterLock'] as const) {
    await page.evaluate(method => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__[method](), failure);
    expect(await page.evaluate(id => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: id, expectedRevision: 0, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }), `failed-${failure}`)).toBe(false);
    expect(await diagnostics(page)).toMatchObject({ revision: before.revision, wallet: before.wallet, receipts: before.receipts }); expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBe(raw);
  }
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'retry-develop', expectedRevision: 0, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }))).toBe(true);
  expect(await diagnostics(page)).toMatchObject({ revision: 1, receipts: [{ commandId: 'retry-develop' }] });
});

test('late writer preserves malformed durable bytes injected while its lock is held', async ({ page }, info) => {
  await openLate(page, info); const before = await diagnostics(page);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'seed-retain', expectedRevision: 0, action: 'retain-donors' } as any))).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => { const target = globalThis as typeof globalThis & { releaseLate?: () => void }; navigator.locks.request('meowcenary:int-late:v1:profile:writer', { mode: 'exclusive' }, async () => { resolve(); await new Promise<void>(release => { target.releaseLate = release; }); }); }));
  const queued = page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'held-develop', expectedRevision: 1, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }));
  const corrupt = await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-late:v1:profile')!); delete raw.discoveries; const text = JSON.stringify(raw); localStorage.setItem('meowcenary:int-late:v1:profile', text); (globalThis as typeof globalThis & { releaseLate?: () => void }).releaseLate?.(); return text; });
  expect(await queued).toBe(false);
  await page.evaluate(() => navigator.locks.request('meowcenary:int-late:v1:profile:writer', { mode: 'exclusive' }, async () => undefined));
  expect(await page.evaluate(key => localStorage.getItem(key), lateKey)).toBe(corrupt);
  expect(await diagnostics(page)).toMatchObject({ blocked: true, revision: 1, wallet: before.wallet });
});

test('late fit displaces the prior barrel and reload retains unique slots', async ({ page }, info) => {
  await openLate(page, info); await page.keyboard.press('m'); await expect.poll(async () => (await diagnostics(page)).revision).toBe(1);
  const hm = (await diagnostics(page)).partRecords.find(part => part.kind === 'B-HM')!.id;
  expect(await page.evaluate(id => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'fit-hm', expectedRevision: 1, action: 'fit', inputIds: [id], targetGun: 'TAB-A' }), hm)).toBe(true);
  await page.reload(); await waitLateReload(page); const parts = (await diagnostics(page)).partRecords; expect(parts.find(part => part.id === hm)?.assignedTo).toBe('TAB-A'); expect(parts.find(part => part.id === 'INT-LATE-TAB-A-B')?.assignedTo).toBeUndefined();
});
