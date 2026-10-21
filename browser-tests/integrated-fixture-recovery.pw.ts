import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Bounds = { x: number; y: number; width: number; height: number };
type Diagnostics = {
  scene: string; x: number; y: number; controlledActor: 'tabby' | 'hound'; layer: 'ground' | 'elevated'; tabbyLayer: 'ground' | 'elevated'; houndLayer: 'ground' | 'elevated'; combatEventSequence: number; cameraX: number; cameraY: number; controlledGun: string; jobId?: string; phase: string; completedInteractionIds: string[]; canExtract: boolean; extracted: boolean;
  combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: { x: number; y: number }; houndPosition: { x: number; y: number }; hostiles: number;
  checkpoint?: { controlledActor: 'tabby' | 'hound'; tabbyHealth: number; houndHealth: number; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: { x: number; y: number }; houndPosition: { x: number; y: number }; hostileHealths: number[] }; workshopCredits: number; workshopParts: number;
  workshopMaterials: { metal: number; circuits: number; cloth: number }; worldEventId?: string; activeAttemptId?: string; attemptTerminal?: string;
  workshopOpen: boolean; recoveryMode: 'none' | 'writing' | 'write-failed' | 'recovered'; recoveryFee?: number; receiptIds: string[]; paidEventIds: string[]; takeoverControl?: Bounds; recoveryControl?: Bounds; retryControl?: Bounds;
};
type FixtureSeam = { diagnostics(): Diagnostics; surrender(): void; forceSquadDefeat(): boolean; forceTabbyDown(): boolean; prolongCombat(): boolean; prepareF01(): boolean; failNextStorageWrite(): void; failNextRecoveryWrite(): void };
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
async function moveAlong(page: Page, points: readonly { x: number; y: number }[]): Promise<void> {
  for (const point of points) await moveTo(page, point.x, point.y);
}
/** Sends actual Chromium touch contacts through the same pointer-hold route a
 * phone uses. This is browser evidence only, not a physical-device verdict. */
async function touchMoveTo(page: Page, target: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const viewport = page.viewportSize()!;
  let active = false;
  try {
    for (let tick = 0; tick < 180; tick += 1) {
      const current = await state(page);
      if (Math.hypot(current.x - target.x, current.y - target.y) < 9) return;
      const x = Math.max(8, Math.min(viewport.width - 8, target.x - current.cameraX));
      const y = Math.max(8, Math.min(viewport.height - 8, target.y - current.cameraY));
      await cdp.send('Input.dispatchTouchEvent', { type: active ? 'touchMove' : 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      active = true;
      await page.waitForTimeout(40);
    }
    throw new Error(`touch route did not reach ${target.x},${target.y}`);
  } finally {
    if (active) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}
async function touchMoveAlong(page: Page, points: readonly { x: number; y: number }[]): Promise<void> {
  for (const point of points) await touchMoveTo(page, point);
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
  await moveAlong(page, job === '1'
    ? [{ x: 300, y: 80 }, { x: 350, y: 200 }, spawn]
    : [{ x: 300, y: 80 }, { x: 350, y: 200 }, { x: 530, y: 220 }, { x: 650, y: 220 }, spawn]);
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
  if (!phoneViewport) await moveAlong(page, [{ x: 650, y: 220 }, { x: 530, y: 220 }, { x: 350, y: 200 }, { x: 300, y: 80 }, { x: 80, y: 110 }]);
  if (phoneViewport) await page.touchscreen.tap((page.viewportSize()?.width ?? 390) / 2, (page.viewportSize()?.height ?? 844) - 48);
  else await page.keyboard.press('b');
  await expect.poll(async () => (await state(page)).workshopOpen).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).workshopOpen).toBe(false);

  const failedWrite = await page.evaluate(() => {
    const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!;
    seam.failNextRecoveryWrite();
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
  expect(reloaded).toMatchObject({ worldEventId: activated.worldEventId, activeAttemptId: activated.activeAttemptId, workshopCredits: recovered.workshopCredits, attemptTerminal: 'failure', recoveryFee: 250 });
  expect(reloaded.retryControl).toBeDefined();
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.failNextStorageWrite());
  await tap(page, info, reloaded.retryControl!);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('recovered');
  expect(await state(page)).toMatchObject({ activeAttemptId: activated.activeAttemptId, workshopCredits: recovered.workshopCredits, recoveryFee: 250 });
  const retryAfterFailure = await state(page);
  expect(retryAfterFailure.retryControl).toBeDefined();
  await tap(page, info, retryAfterFailure.retryControl!);
  await expect.poll(async () => {
    const value = await state(page);
    return value.recoveryMode === 'none' && value.combatActive && value.activeAttemptId !== activated.activeAttemptId && value.worldEventId === activated.worldEventId;
  }, { timeout: 15_000 }).toBe(true);
  const retried = await state(page);
  expect(retried.attemptTerminal).toBe('active');
  if (phoneViewport) {
    await touchMoveAlong(page, [{ x: 130, y: 80 }, { x: 300, y: 80 }, { x: 350, y: 200 }, { x: 530, y: 220 }, { x: 650, y: 220 }, { x: 550, y: 410 }]);
    await page.touchscreen.tap((page.viewportSize()?.width ?? 390) - 76, (page.viewportSize()?.height ?? 844) - 48);
    await expect.poll(async () => (await state(page)).completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
    await touchMoveAlong(page, [{ x: 550, y: 470 }, { x: 690, y: 490 }]);
    await page.touchscreen.tap((page.viewportSize()?.width ?? 390) - 76, (page.viewportSize()?.height ?? 844) - 48);
    await expect.poll(async () => (await state(page)).extracted, { timeout: 15_000 }).toBe(true);
    expect((await state(page)).paidEventIds).toContain(activated.worldEventId!);
    await capture(page, info, 'f01-touch-traversal-extraction');
    return;
  }

  await moveAlong(page, [{ x: 300, y: 80 }, { x: 350, y: 200 }, { x: 530, y: 220 }, { x: 650, y: 220 }, { x: 550, y: 410 }]);
  await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
  await moveAlong(page, [{ x: 550, y: 470 }, { x: 690, y: 490 }]);
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

test('recovery reload displays the persisted non-capped fee', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'The canonical fee receipt is exercised once on the desktop fixture route.');
  await ready(page);
  await activate(page, '2', { x: 670, y: 390 });
  expect(await page.evaluate(() => {
    const key = 'meowcenary:int-fb:v1:profile';
    const envelope = JSON.parse(localStorage.getItem(key)!);
    envelope.workshop.wallet.credits = 1390;
    localStorage.setItem(key, JSON.stringify(envelope));
    return (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat();
  })).toBe(true);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('recovered');
  expect(await state(page)).toMatchObject({ workshopCredits: 1251, recoveryFee: 139 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).recoveryMode, { timeout: 15_000 }).toBe('recovered');
  expect(await state(page)).toMatchObject({ workshopCredits: 1251, recoveryFee: 139 });
});

test('active reload retains partial combat and a Hound takeover without reviving Tabby', async ({ page }, info) => {
  test.setTimeout(60_000);
  test.skip(info.project.name !== 'desktop-1280x720', 'The durable combat checkpoint is exercised once on the desktop fixture route.');
  await ready(page);
  await activate(page, '2', { x: 670, y: 390 });
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prolongCombat())).toBe(true);

  await expect.poll(async () => {
    const value = await state(page);
    return Boolean(value.checkpoint && value.tabbyHealth < 100 && value.houndHealth > 0 && value.checkpoint.tabbyHealth < 100 && value.checkpoint.houndHealth > 0 && value.checkpoint.hostileHealths.some(health => health < 10_000));
  }, { timeout: 15_000, intervals: [50, 100, 200] }).toBe(true);
  const partial = await state(page);
  expect(partial.hostiles).toBe(2);
  expect(partial.checkpoint).toBeDefined();
  const savedPartial = partial.checkpoint!;
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => {
    const value = await state(page);
    return value.combatActive && value.tabbyHealth < 100 && value.houndHealth > 0 && value.hostiles === 2;
  }, { timeout: 15_000 }).toBe(true);
  const resumed = await state(page);
  expect(resumed.tabbyPosition).toEqual(savedPartial.tabbyPosition);
  expect(resumed.tabbyGunSupply).not.toBe(12);
  expect(resumed.checkpoint?.hostileHealths.some(health => health < 10_000)).toBe(true);

  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).takeoverControl).toBeDefined();
  const takeover = await state(page);
  await tap(page, info, takeover.takeoverControl!);
  await expect.poll(async () => (await state(page)).checkpoint?.controlledActor).toBe('hound');
  const savedTakeover = (await state(page)).checkpoint!;
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => {
    const value = await state(page);
    return value.combatActive && value.controlledActor === 'hound' && value.tabbyHealth === 0;
  }, { timeout: 15_000 }).toBe(true);
  const resumedTakeover = await state(page);
  expect(resumedTakeover.tabbyHealth).toBe(0);
  expect(resumedTakeover.houndPosition).toEqual(savedTakeover.houndPosition);
  expect(resumedTakeover.checkpoint?.controlledActor).toBe('hound');
  await capture(page, info, 'f01-hound-takeover-reloaded');
});

test('scene terrain blocks solids, transitions the ramp, and separates bridge combat from the underpass', async ({ page }, info) => {
  test.setTimeout(60_000);
  test.skip(info.project.name !== 'desktop-1280x720', 'The terrain contract is exercised on the reference desktop viewport.');
  await ready(page);

  await moveAlong(page, [{ x: 130, y: 80 }, { x: 400, y: 80 }, { x: 400, y: 210 }, { x: 530, y: 220 }]);
  await expect.poll(async () => (await state(page)).layer).toBe('elevated');
  // The public spur sits at these same coordinates below the bridge. It is
  // not an interaction target from the elevated deck.
  const aboveSpur = await state(page);
  await page.keyboard.press('e');
  expect(await state(page)).toMatchObject({ jobId: aboveSpur.jobId, phase: aboveSpur.phase, completedInteractionIds: aboveSpur.completedInteractionIds });
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(async () => (await state(page)).combatActive).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prolongCombat())).toBe(true);
  const bridge = await state(page);
  await page.waitForTimeout(750);
  expect((await state(page)).combatEventSequence).toBe(bridge.combatEventSequence);
  await capture(page, info, 'terrain-layered-bridge-underpass');

  await moveAlong(page, [{ x: 400, y: 200 }, { x: 400, y: 150 }, { x: 370, y: 150 }, { x: 350, y: 200 }, { x: 290, y: 400 }]);
  await expect.poll(async () => (await state(page)).layer).toBe('ground');
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => {
      const value = await state(page);
      return value.x > 295 && value.x < 310;
    }, { timeout: 15_000, intervals: [50, 100, 200] }).toBe(true);
  } finally { await page.keyboard.up('d'); }
  expect((await state(page)).x).toBeLessThan(310);
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
    { x: 230, y: 390, id: 'INT-FB-R01-MARKER-A', route: [{ x: 350, y: 350 }, { x: 230, y: 390 }] },
    { x: 340, y: 460, id: 'INT-FB-R01-MARKER-B', route: [{ x: 280, y: 480 }, { x: 340, y: 460 }] },
    { x: 290, y: 480, id: 'INT-FB-R01-COLLECTION' },
  ]) {
    await moveAlong(page, point.route ?? [{ x: point.x, y: point.y }]);
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
