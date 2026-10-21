import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Bounds = { x: number; y: number; width: number; height: number };
type Diagnostics = {
  scene: string; x: number; y: number; controlledActor: 'tabby' | 'hound'; controlledGun: string; jobId?: string; phase: string; completedInteractionIds: string[]; canExtract: boolean; extracted: boolean;
  combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; hostiles: number; workshopCredits: number; workshopParts: number;
  workshopMaterials: { metal: number; circuits: number; cloth: number }; worldEventId?: string; activeAttemptId?: string; attemptTerminal?: string;
  workshopOpen: boolean; recoveryMode: 'none' | 'writing' | 'write-failed' | 'recovered'; recoveryFee: number; receiptIds: string[]; paidEventIds: string[]; takeoverControl?: Bounds; recoveryControl?: Bounds; retryControl?: Bounds;
};
type FixtureSeam = { diagnostics(): Diagnostics; surrender(): void; forceSquadDefeat(): boolean; forceTabbyDown(): boolean; prepareF01(): boolean; failNextStorageWrite(): void };
type Globals = { __MEOWCENARY_INT_FB__?: FixtureSeam };

function selectedProject(info: TestInfo): boolean { return info.project.name === 'desktop-1280x720' || info.project.name === 'phone-390x844'; }
async function ready(page: Page): Promise<void> {
  await page.goto('/?fixture=int-fb');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.diagnostics().scene), { timeout: 15_000 }).toBe('IntegratedFixtureScene');
}
async function state(page: Page): Promise<Diagnostics> { return page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.diagnostics()); }
async function moveTo(page: Page, x: number, y: number): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) < 800 || x > (page.viewportSize()?.width ?? 0) || y > (page.viewportSize()?.height ?? 0)) {
    await moveAxis(page, 'x', x);
    await moveAxis(page, 'y', y);
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    await expect.poll(async () => {
      const current = await state(page);
      return Math.hypot(current.x - x, current.y - y) < 9;
    }, { timeout: 15_000, intervals: [50, 100, 200] }).toBe(true);
  } finally { await page.mouse.up(); }
}
async function moveAxis(page: Page, axis: 'x' | 'y', target: number): Promise<void> {
  const before = await state(page);
  const key = axis === 'x' ? (target > before.x ? 'd' : 'a') : (target > before.y ? 's' : 'w');
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => {
      const current = await state(page);
      return Math.abs(current[axis] - target) < 9;
    }, { timeout: 15_000, intervals: [50, 100, 200] }).toBe(true);
  } finally { await page.keyboard.up(key); }
}
async function tap(page: Page, info: TestInfo, bounds: Bounds): Promise<void> {
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  const image = info.outputPath(`${name}.png`);
  await page.screenshot({ path: image });
  await info.attach(name, { path: image, contentType: 'image/png' });
}
async function activate(page: Page, job: '1' | '2', spawn: { x: number; y: number }): Promise<Diagnostics> {
  await page.keyboard.press(job);
  await expect.poll(async () => (await state(page)).jobId).toBe(job === '1' ? 'MC-OPT-R01-01' : 'MC-OPT-F01-01');
  await moveTo(page, 130, 80);
  await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).phase).toBe('accepted');
  await moveTo(page, spawn.x, spawn.y);
  await page.keyboard.press('e');
  await expect.poll(async () => {
    const value = await state(page);
    return Boolean(value.worldEventId && value.activeAttemptId && value.combatActive && value.phase === 'active');
  }, { timeout: 15_000 }).toBe(true);
  return state(page);
}

test('F01 recovery/retry/extraction is persisted by the live Phaser scene', async ({ page }, info) => {
  test.setTimeout(60_000);
  test.skip(!selectedProject(info), 'Focused scene evidence is captured on one desktop and one touch viewport.');
  await ready(page);
  const phoneViewport = info.project.name === 'phone-390x844';
  if (phoneViewport) {
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
    await expect.poll(async () => {
      const value = await state(page);
      return Boolean(value.worldEventId && value.activeAttemptId && value.combatActive && value.phase === 'active');
    }, { timeout: 15_000 }).toBe(true);
  }
  const activated = phoneViewport ? await state(page) : await activate(page, '2', { x: 670, y: 390 });
  const startingWallet = { credits: activated.workshopCredits, parts: activated.workshopParts, materials: activated.workshopMaterials };
  expect(activated.worldEventId).toBeDefined();
  expect(activated.activeAttemptId).toBeDefined();

  // The surviving Hound owns the same scene controls after touch/keyboard takeover.
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).takeoverControl).toBeDefined();
  const takeover = await state(page);
  await tap(page, info, takeover.takeoverControl!);
  await expect.poll(async () => (await state(page)).controlledActor).toBe('hound');
  const houndBeforeSwap = (await state(page)).controlledGun;
  if (phoneViewport) await page.touchscreen.tap(76, (page.viewportSize()?.height ?? 844) - 48);
  else await page.keyboard.press('q');
  await expect.poll(async () => (await state(page)).controlledGun).not.toBe(houndBeforeSwap);
  if (!phoneViewport) await moveTo(page, 80, 110);
  if (phoneViewport) await page.touchscreen.tap((page.viewportSize()?.width ?? 390) / 2, (page.viewportSize()?.height ?? 844) - 48);
  else await page.keyboard.press('b');
  await expect.poll(async () => (await state(page)).workshopOpen).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).workshopOpen).toBe(false);

  const failedWrite = await page.evaluate(() => {
    const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!;
    seam.failNextStorageWrite();
    return seam.forceSquadDefeat();
  });
  expect(failedWrite).toBe(true);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('write-failed');
  const afterFailedWrite = await state(page);
  expect(afterFailedWrite.workshopCredits).toBe(startingWallet.credits);
  expect(afterFailedWrite.workshopParts).toBe(startingWallet.parts);
  expect(afterFailedWrite.workshopMaterials).toEqual(startingWallet.materials);
  expect(afterFailedWrite.attemptTerminal).toBe('active');
  expect(afterFailedWrite.recoveryControl).toBeDefined();
  await tap(page, info, afterFailedWrite.recoveryControl!);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('recovered');
  const recovered = await state(page);
  expect(recovered.attemptTerminal).toBe('failure');
  expect(recovered.workshopCredits).toBe(startingWallet.credits - 250);
  expect(recovered.workshopParts).toBe(startingWallet.parts);
  expect(recovered.workshopMaterials).toEqual(startingWallet.materials);
  expect(recovered.recoveryFee).toBe(250);
  expect(recovered.worldEventId).toBe(activated.worldEventId);
  expect(recovered.activeAttemptId).toBe(activated.activeAttemptId);
  await capture(page, info, 'f01-recovery-safe-service');

  // Repeated surrender/recovery callbacks are inert after the one durable claim.
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.surrender());
  expect(await state(page)).toMatchObject({ workshopCredits: recovered.workshopCredits, activeAttemptId: recovered.activeAttemptId, recoveryMode: 'recovered' });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('recovered');
  const reloaded = await state(page);
  expect(reloaded).toMatchObject({ worldEventId: activated.worldEventId, activeAttemptId: activated.activeAttemptId, workshopCredits: recovered.workshopCredits, attemptTerminal: 'failure' });
  expect(reloaded.retryControl).toBeDefined();
  await tap(page, info, reloaded.retryControl!);
  await expect.poll(async () => {
    const value = await state(page);
    return value.recoveryMode === 'none' && value.combatActive && value.activeAttemptId !== activated.activeAttemptId && value.worldEventId === activated.worldEventId;
  }, { timeout: 15_000 }).toBe(true);
  const retried = await state(page);
  expect(retried.attemptTerminal).toBe('active');
  if (phoneViewport) { await capture(page, info, 'f01-touch-takeover-and-retry'); return; }

  await moveTo(page, 550, 410);
  await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
  await moveTo(page, 690, 490);
  await expect.poll(async () => (await state(page)).canExtract).toBe(true);
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.failNextStorageWrite());
  await page.keyboard.press('e');
  await expect.poll(async () => {
    const value = await state(page);
    return !value.extracted && value.attemptTerminal === 'active' && value.canExtract;
  }, { timeout: 15_000 }).toBe(true);
  expect((await state(page)).workshopCredits).toBe(recovered.workshopCredits);
  await page.keyboard.press('e');
  // A KO arriving after a valid extraction request cannot replace committed victory.
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat())).toBe(true);
  await expect.poll(async () => (await state(page)).extracted, { timeout: 15_000 }).toBe(true);
  const complete = await state(page);
  expect(complete.workshopCredits).toBe(startingWallet.credits - 250 + 1000);
  expect(complete.paidEventIds).toContain(activated.worldEventId!);
  expect(complete.receiptIds).toHaveLength(1);
  await capture(page, info, 'f01-event-delivered');
  await page.keyboard.press('e');
  expect(await state(page)).toMatchObject({ workshopCredits: complete.workshopCredits, receiptIds: complete.receiptIds, paidEventIds: complete.paidEventIds });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  expect(await state(page)).toMatchObject({ receiptIds: complete.receiptIds, paidEventIds: complete.paidEventIds, workshopCredits: complete.workshopCredits });
});

test('R01 browser route requires both markers, collection, finite clear, and extraction', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'The longer R01 route is captured once at the reference desktop viewport.');
  await ready(page);
  const activated = await activate(page, '1', { x: 370, y: 380 });
  await expect.poll(async () => (await state(page)).groupCleared, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => {
    const value = await state(page);
    return value.groupCleared && value.hostiles === 0 && value.worldEventId === activated.worldEventId && value.activeAttemptId === activated.activeAttemptId;
  }, { timeout: 15_000 }).toBe(true);
  for (const point of [
    { x: 230, y: 390, id: 'INT-FB-R01-MARKER-A' },
    { x: 340, y: 460, id: 'INT-FB-R01-MARKER-B' },
    { x: 290, y: 480, id: 'INT-FB-R01-COLLECTION' },
  ]) {
    await moveTo(page, point.x, point.y);
    await page.keyboard.press('e');
    await expect.poll(async () => (await state(page)).completedInteractionIds).toContain(point.id);
  }
  await moveTo(page, 200, 490);
  await expect.poll(async () => (await state(page)).canExtract).toBe(true);
  await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).extracted, { timeout: 15_000 }).toBe(true);
  const complete = await state(page);
  expect(complete.receiptIds).toHaveLength(1);
  expect(complete.paidEventIds).toHaveLength(1);
  await capture(page, info, 'r01-markers-clear-extraction');
});
