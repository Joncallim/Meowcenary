import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Bounds = { x: number; y: number; width: number; height: number };
type Diagnostics = {
  scene: string; x: number; y: number; controlledActor: 'tabby' | 'hound'; layer: 'ground' | 'elevated'; tabbyLayer: 'ground' | 'elevated'; houndLayer: 'ground' | 'elevated'; combatEventSequence: number; cameraX: number; cameraY: number; controlledGun: string; jobId?: string; phase: string; completedInteractionIds: string[]; canExtract: boolean; extracted: boolean;
  combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: { x: number; y: number }; houndPosition: { x: number; y: number }; hostiles: number;
  replay?: { x: number; y: number; controlledActor: 'tabby' | 'hound'; cameraActor?: 'tabby' | 'hound'; layer: 'ground' | 'elevated'; tabbyLayer: 'ground' | 'elevated'; houndLayer: 'ground' | 'elevated'; tabbyPosition: { x: number; y: number }; houndPosition: { x: number; y: number }; trailLength: number; completedInteractionIds: string[]; groupCleared: boolean; canExtract: boolean; hostiles: number; takeoverControl?: Bounds };
  checkpoint?: { revision: number; controlledActor: 'tabby' | 'hound'; tabbyHealth: number; houndHealth: number; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: { x: number; y: number }; houndPosition: { x: number; y: number }; hostileHealths: number[] }; workshopCredits: number; workshopParts: number;
  workshopMaterials: { metal: number; circuits: number; cloth: number }; standing: { rcc: number; fre: number }; houDossier: number; fluxQualificationRemainder: number; historicalReplayActive: boolean; historicalReplayOutcome?: 'success' | 'death' | 'exit'; worldEventId?: string; activeAttemptId?: string; attemptTerminal?: string;
  workshopOpen: boolean; workshopPreview?: string; settlementPending: boolean; recoveryMode: 'none' | 'writing' | 'write-failed' | 'recovered'; recoveryFee?: number; receiptIds: string[]; paidEventIds: string[]; loadBlocked: boolean; recoveryMessage: string; takeoverControl?: Bounds; recoveryControl?: Bounds; retryControl?: Bounds;
};
type FixtureSeam = { diagnostics(): Diagnostics; surrender(): void; forceSquadDefeat(): boolean; forceTabbyDown(): boolean; prolongCombat(): boolean; queueRequiredObjective(): boolean; queueGroupClear(): boolean; queueExtraction(): boolean; queueDiscovery(): boolean; queueWorkshopConflict(): boolean; queueWorkshopConfirmation(): boolean; queueRetry(): boolean; openHistoricalReplay(): boolean; finishHistoricalReplay(outcome: 'success' | 'death' | 'exit'): boolean; forceReplayTerminal(outcome: 'success' | 'death'): boolean; forceReplayHostileClear(): boolean; forceReplayTabbyDown(): boolean; forceReplayHoundDown(): boolean; replayActiveGun(): { instanceId: string; supply: number } | undefined; prepareF01(): boolean; failNextStorageWrite(): void; failNextRecoveryWrite(): void; rejectNextWriterLock(): void; pauseSimulation(): void; setTestMoveTarget(x: number, y: number): void; advanceTestFrame(delta: number): void; hasLiveTouchTarget(): boolean };
type Globals = { __MEOWCENARY_INT_FB__?: FixtureSeam };
type LateSeam = { diagnostics(): { scene: string; revision: number; parts: number; wallet: { credits: number; metal: number; circuits: number }; receipts: readonly { commandId: string }[]; discoveries: readonly string[]; declaration: string }; commit(command: { commandId: string; expectedRevision: number; action: 'merge' | 'build'; inputIds?: readonly string[] }): boolean };

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
  const before = await state(page);
  // Phaser pointer coordinates are screen-relative while test destinations
  // are authored world coordinates. Account for follow-camera scroll exactly
  // as the touch route below does.
  const screen = { x: x - before.cameraX, y: y - before.cameraY };
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  try {
    let last = before;
    await expect.poll(async () => {
      last = await state(page);
      return Math.hypot(last.x - x, last.y - y) < 9;
    }, { timeout: 15_000, intervals: [50, 100, 200] }).toBe(true);
  } catch (error) {
    const current = await state(page);
    throw new Error(`moveTo stalled: worldTarget=${x},${y}; screenTarget=${screen.x},${screen.y}; before=${before.x},${before.y},layer=${before.layer},camera=${before.cameraX},${before.cameraY}; current=${current.x},${current.y},layer=${current.layer},phase=${current.phase},camera=${current.cameraX},${current.cameraY}; ${error instanceof Error ? error.message : String(error)}`);
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
async function moveReplayTo(page: Page, x: number, y: number): Promise<void> {
  const before = await state(page);
  if (!before.replay) throw new Error('archived replay is not active');
  const screen = { x: x - before.cameraX, y: y - before.cameraY };
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  try {
    await expect.poll(async () => {
      const replay = (await state(page)).replay;
      return !!replay && Math.hypot(replay.x - x, replay.y - y) < 9;
    }, { timeout: 30_000, intervals: [50, 100, 200] }).toBe(true);
  } catch (error) {
    const current = await state(page);
    throw new Error(`moveReplayTo stalled: target=${x},${y}; screen=${screen.x},${screen.y}; before=${before.replay?.x},${before.replay?.y},layer=${before.replay?.layer},camera=${before.cameraX},${before.cameraY}; current=${current.replay?.x},${current.replay?.y},layer=${current.replay?.layer},tabby=${current.replay?.tabbyLayer},hound=${current.replay?.houndLayer},camera=${current.cameraX},${current.cameraY}; ${error instanceof Error ? error.message : String(error)}`);
  } finally { await page.mouse.up(); }
}
async function moveReplayAlong(page: Page, points: readonly { x: number; y: number }[]): Promise<void> {
  for (const point of points) await moveReplayTo(page, point.x, point.y);
}
async function settleReplayFollower(page: Page): Promise<void> {
  try {
    await expect.poll(async () => {
      const replay = (await state(page)).replay;
      return !!replay && Math.hypot(replay.tabbyPosition.x - replay.houndPosition.x, replay.tabbyPosition.y - replay.houndPosition.y) < 26;
    }, { timeout: 30_000, intervals: [50, 100, 200] }).toBe(true);
  } catch (error) {
    const replay = (await state(page)).replay;
    throw new Error(`replay follower did not settle: tabby=${replay?.tabbyPosition.x},${replay?.tabbyPosition.y},${replay?.tabbyLayer}; hound=${replay?.houndPosition.x},${replay?.houndPosition.y},${replay?.houndLayer}; ${error instanceof Error ? error.message : String(error)}`);
  }
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
async function touchReplayTo(page: Page, target: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page); let active = false;
  try {
    for (let tick = 0; tick < 180; tick += 1) {
      const current = await state(page); const replay = current.replay;
      if (replay && Math.hypot(replay.x - target.x, replay.y - target.y) < 9) return;
      await cdp.send('Input.dispatchTouchEvent', { type: active ? 'touchMove' : 'touchStart', touchPoints: [{ x: Math.max(8, Math.min(382, target.x - current.cameraX)), y: Math.max(8, Math.min(836, target.y - current.cameraY)), id: 1 }] }); active = true;
      await page.waitForTimeout(40);
    }
    const current = await state(page);
    throw new Error(`touch replay route did not reach ${target.x},${target.y}; replay=${current.replay?.x.toFixed(1)},${current.replay?.y.toFixed(1)} layer=${current.replay?.layer}; active=${current.historicalReplayActive}; outcome=${current.historicalReplayOutcome}; camera=${current.cameraX.toFixed(1)},${current.cameraY.toFixed(1)}`);
  } finally { if (active) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
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
async function holdFixtureWriter(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    const target = globalThis as typeof globalThis & { __releaseFixtureWriter?: () => void };
    navigator.locks.request('meowcenary:int-fb:v1:writer', { mode: 'exclusive' }, async () => {
      resolve();
      await new Promise<void>(release => { target.__releaseFixtureWriter = release; });
    });
  }));
}
async function releaseFixtureWriter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as typeof globalThis & { __releaseFixtureWriter?: () => void };
    target.__releaseFixtureWriter?.();
    delete target.__releaseFixtureWriter;
  });
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

test('archived movement matches live world-unit displacement for an equal frame', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Reference desktop frame-parity evidence.');
  await ready(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(async () => (await state(page)).activeAttemptId).toBeTruthy();
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.pauseSimulation());
  const liveBefore = await state(page);
  await page.evaluate(() => { const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!; seam.setTestMoveTarget(200, 110); seam.advanceTestFrame(100); });
  const liveAfter = await state(page);
  const liveDistance = Math.hypot(liveAfter.x - liveBefore.x, liveAfter.y - liveBefore.y);
  expect(liveDistance).toBeGreaterThan(10);
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); const replayRecord = raw.liveMission?.replayRecord; if (!replayRecord) throw new Error('activation record missing'); raw.mission.receipts.push({ id: 'int-fb:test:rate', jobId: 'MC-OPT-F01-01', worldEventId: 'rate-event', attemptId: 'rate-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord }); delete raw.liveMission; localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw)); });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  await page.evaluate(() => { const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!; seam.pauseSimulation(); if (!seam.openHistoricalReplay()) throw new Error('replay unavailable'); seam.setTestMoveTarget(200, 110); seam.advanceTestFrame(100); });
  const replay = (await state(page)).replay!;
  const replayDistance = Math.hypot(replay.x - 80, replay.y - 110);
  expect(replayDistance).toBeGreaterThan(10);
  expect(replayDistance).toBeCloseTo(liveDistance, 5);
  expect(Math.hypot(replay.tabbyPosition.x - replay.houndPosition.x, replay.tabbyPosition.y - replay.houndPosition.y)).toBeLessThanOrEqual(27);
});

test('invalid persisted B1 envelopes are visibly blocked and remain byte-identical after ordinary actions', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'One desktop recovery proof covers malformed, future, and incomplete persisted B1 envelopes.');
  const cases = [
    '{malformed-json',
    JSON.stringify({ version: 'int-fb-envelope-future' }),
    JSON.stringify({ version: 'int-fb-envelope-v3', mission: { version: 'int-fb-v2', seed: 'int-fb-post-chapter-2', receipts: [] }, workshop: { version: 'int-fb-profile-v2' } }),
  ];
  for (const raw of cases) {
    await page.goto('/?fixture=int-fb');
    await page.evaluate(value => localStorage.setItem('meowcenary:int-fb:v1:profile', value), raw);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await state(page)).loadBlocked, { timeout: 15_000 }).toBe(true);
    expect((await state(page)).recoveryMessage).toContain('preserved unchanged');
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(raw);
  }
});

test('absent B1 storage persists its first activation and rejects corruption without reseeding', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated first-write and corruption evidence runs once on desktop.');
  await page.goto('/?fixture=int-fb');
  await page.evaluate(() => localStorage.removeItem('meowcenary:int-fb:v1:profile'));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')), { timeout: 15_000 }).not.toBeNull();
  const first = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).activeAttemptId, { timeout: 15_000 }).toBeDefined();
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    raw.workshop.standing.rcc = -1;
    localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw));
  });
  const corrupt = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await state(page)).loadBlocked, { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(corrupt);
  expect(corrupt).not.toBe(first);
});

test('fresh B1 purchase, fit, and reload conserve the displaced barrel', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated desktop workshop persistence evidence.');
  await ready(page); await page.evaluate(() => localStorage.removeItem('meowcenary:int-fb:v1:profile')); await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  expect(await state(page)).toMatchObject({ loadBlocked: false, workshopCredits: 3000, workshopParts: 25 });
  await page.keyboard.press('b'); await expect.poll(async () => (await state(page)).workshopOpen).toBe(true);
  const canvas = page.locator('canvas'); const box = await canvas.boundingBox(); if (!box) throw new Error('canvas unavailable');
  await page.mouse.click(box.x + 550 * box.width / 1280, box.y + 295 * box.height / 720);
  await expect.poll(async () => (await state(page)).workshopPreview).toBe('buy-f2'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).workshopCredits).toBe(1350);
  const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!)); const f2 = bought.workshop.parts.find((part: any) => part.kind === 'F2'); const ids = bought.workshop.parts.map((part: any) => part.instanceId);
  expect(bought.workshop.parts).toHaveLength(26); expect(f2).toBeDefined();
  await page.keyboard.press('f'); await expect.poll(async () => (await state(page)).workshopPreview).toBe('fit-f2-a'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  const raw = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!); const fitted = JSON.parse(raw); const slots = fitted.workshop.gunSlots;
  expect(slots['TAB-A'].F).toBe(f2.instanceId); expect(fitted.workshop.parts.map((part: any) => part.instanceId)).toEqual(ids); expect(fitted.workshop.parts.some((part: any) => part.instanceId === 'INT-B1-TAB-A-F-BASE')).toBe(true);
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  expect(await state(page)).toMatchObject({ workshopCredits: 1350, workshopParts: 26 }); expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(raw);
});

test('queued workshop confirmation aborts when replay opens before writer acquisition', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated desktop replay writer evidence.');
  await ready(page); expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')), { timeout: 15_000 }).not.toBeNull();
  // Test-only settlement uses the activation's real recorded snapshot/loadout;
  // legacy receipt-only history is deliberately replay-unavailable.
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); const replayRecord = raw.liveMission?.replayRecord; if (!replayRecord) throw new Error('activation did not retain replay record'); raw.mission.receipts.push({ id: 'int-fb:test:settlement', jobId: 'MC-OPT-F01-01', worldEventId: 'test-event', attemptId: 'test-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord }); delete raw.liveMission; localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw)); });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  expect(await state(page)).toMatchObject({ loadBlocked: false, historicalReplayActive: false, activeAttemptId: undefined });
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.pauseSimulation());
  expect(await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); const receipt = raw.mission.receipts.at(-1); return { hasRecord: Boolean(receipt?.replayRecord), hasLoadout: Boolean(receipt?.replayRecord?.loadout), contentId: receipt?.replayRecord?.contentId, storyBranch: receipt?.replayRecord?.storyBranch, jobId: receipt?.jobId }; })).toEqual({ hasRecord: true, hasLoadout: true, contentId: 'fixture:MC-OPT-F01-01:v1', storyBranch: 'MC-OPT-F01-01', jobId: 'MC-OPT-F01-01' });
  const before = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  await holdFixtureWriter(page); try {
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueWorkshopConfirmation())).toBe(true);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true); await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
    const liveBefore = await state(page); await page.keyboard.press('q'); await page.keyboard.press('e'); await page.keyboard.press('b'); await page.keyboard.press('t');
    expect(await state(page)).toMatchObject({ controlledGun: liveBefore.controlledGun, controlledActor: liveBefore.controlledActor, phase: liveBefore.phase, workshopOpen: liveBefore.workshopOpen, tabbyPosition: liveBefore.tabbyPosition, houndPosition: liveBefore.houndPosition });
    await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(false);
  } finally { await releaseFixtureWriter(page); }
  await page.evaluate(() => navigator.locks.request('meowcenary:int-fb:v1:writer', { mode: 'exclusive' }, async () => undefined));
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(before);
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(false);
});

test('recordless historical receipt refuses replay without changing the decoded live profile', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated desktop legacy-receipt refusal evidence.');
  await ready(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')), { timeout: 15_000 }).not.toBeNull();
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    raw.mission.receipts.push({ id: 'int-fb:legacy:receipt', jobId: 'MC-OPT-F01-01', worldEventId: 'legacy-event', attemptId: 'legacy-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6 });
    delete raw.liveMission;
    localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw));
  });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const before = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  const sessionBefore = await state(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(false);
  expect(await state(page)).toMatchObject({ historicalReplayActive: false, workshopCredits: sessionBefore.workshopCredits, receiptIds: sessionBefore.receiptIds, paidEventIds: sessionBefore.paidEventIds });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(before);
});

test('archived replay requires objectives and extraction without mutating the live envelope', async ({ page }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated desktop archived mission lifecycle evidence.');
  await ready(page);
  await activate(page, '2', { x: 670, y: 390 });
  // Retain the production activation record as a settled receipt solely to
  // enter archived playback; the replay actions below are normal inputs.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    const replayRecord = raw.liveMission?.replayRecord;
    if (!replayRecord) throw new Error('real activation did not capture replay record');
    raw.mission.receipts.push({ id: 'int-fb:test:archived-f01', jobId: 'MC-OPT-F01-01', worldEventId: 'archived-event', attemptId: 'archived-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord });
    delete raw.liveMission;
    localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw));
  });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const before = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  const liveBefore = await state(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
  // A downed archived Tabby cannot be moved. The visible takeover button is
  // pointer/touch-routed, then moves the archived camera to Hound.
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.takeoverControl).toBeTruthy();
  const downed = (await state(page)).replay!;
  await page.mouse.move(900, 500); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
  expect((await state(page)).replay).toMatchObject({ x: downed.x, y: downed.y, controlledActor: 'tabby' });
  await page.keyboard.press('t');
  await expect.poll(async () => (await state(page)).replay?.controlledActor).toBe('hound');
  expect((await state(page)).replay).toMatchObject({ cameraActor: 'hound' });
  // Re-entering the same immutable record exercises the on-screen
  // pointer/touch route independently of the keyboard shortcut.
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(false);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.takeoverControl).toBeTruthy();
  await tap(page, info, (await state(page)).replay!.takeoverControl!);
  await expect.poll(async () => (await state(page)).replay?.controlledActor).toBe('hound');
  expect((await state(page)).replay).toMatchObject({ cameraActor: 'hound' });
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHostileClear())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.groupCleared).toBe(true);
  expect((await state(page)).replay).toMatchObject({ canExtract: false, completedInteractionIds: [] });
  // Clear alone cannot complete the archived contract or settle the live one.
  await moveReplayTo(page, 690, 490); await page.keyboard.press('e');
  expect(await state(page)).toMatchObject({ historicalReplayActive: true, replay: { canExtract: false, completedInteractionIds: [] } });
  // This retry snapshot begins at safe service. Follow the authored road,
  // ramp/bridge approach into F01 rather than cutting a diagonal through
  // unsupported terrain.
  // This record starts at F01 spawn, so the objective is in the same pocket.
  await moveReplayTo(page, 550, 410); await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).replay?.completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
  await expect.poll(async () => (await state(page)).replay?.canExtract).toBe(true);
  await moveReplayTo(page, 690, 490); await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).historicalReplayOutcome).toBe('success');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(before);
  expect(await state(page)).toMatchObject({ workshopCredits: liveBefore.workshopCredits, receiptIds: liveBefore.receiptIds, paidEventIds: liveBefore.paidEventIds, historicalReplayActive: false });
});

test('phone replay completes through touch controls without mutating live state', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-390x844', 'Dedicated phone touch-only replay evidence.');
  test.setTimeout(120_000);
  await ready(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(async () => (await state(page)).activeAttemptId).toBeTruthy();
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); const replayRecord = raw.liveMission?.replayRecord; if (!replayRecord) throw new Error('record missing'); raw.mission.receipts.push({ id: 'int-fb:test:phone', jobId: 'MC-OPT-F01-01', worldEventId: 'phone-event', attemptId: 'phone-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord }); delete raw.liveMission; localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw)); });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const before = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  await page.touchscreen.tap((page.viewportSize()?.width ?? 390) / 2, (page.viewportSize()?.height ?? 844) - 116);
  await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.takeoverControl).toBeTruthy();
  const takeover = (await state(page)).replay!;
  await page.touchscreen.tap(takeover.takeoverControl!.x + takeover.takeoverControl!.width / 2, takeover.takeoverControl!.y + takeover.takeoverControl!.height / 2);
  await expect.poll(async () => (await state(page)).replay?.controlledActor).toBe('hound');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHostileClear())).toBe(true);
  // Hound reaches the actual objective through phone touch movement. Freeze
  // automatic frames only after downing it so INTERACT is tested in-range.
  await touchReplayTo(page, { x: 300, y: 150 }); await touchReplayTo(page, { x: 350, y: 200 }); await touchReplayTo(page, { x: 530, y: 220 }); await touchReplayTo(page, { x: 650, y: 220 }); await touchReplayTo(page, { x: 670, y: 390 }); await touchReplayTo(page, { x: 550, y: 410 });
  expect(await page.evaluate(() => { const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!; const changed = seam.forceReplayHoundDown(); seam.pauseSimulation(); return changed; })).toBe(true);
  const downed = (await state(page)).replay!;
  await page.touchscreen.tap((page.viewportSize()?.width ?? 390) - 76, (page.viewportSize()?.height ?? 844) - 48);
  expect((await state(page)).replay).toMatchObject({ x: downed.x, y: downed.y, controlledActor: 'hound', completedInteractionIds: [] });
  // Reload for an independent living-touch completion session. The actual
  // gameplay path below remains touch-only; this reset avoids relying on a
  // Phaser panel handler as evidence for a gameplay control.
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  await page.touchscreen.tap((page.viewportSize()?.width ?? 390) / 2, (page.viewportSize()?.height ?? 844) - 116);
  await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.takeoverControl).toBeTruthy();
  const completionTakeover = (await state(page)).replay!;
  await page.touchscreen.tap(completionTakeover.takeoverControl!.x + completionTakeover.takeoverControl!.width / 2, completionTakeover.takeoverControl!.y + completionTakeover.takeoverControl!.height / 2);
  await expect.poll(async () => (await state(page)).replay?.controlledActor).toBe('hound');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHostileClear())).toBe(true);
  const beforeSwap = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.replayActiveGun()!.instanceId);
  await page.touchscreen.tap(76, (page.viewportSize()?.height ?? 844) - 48);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.replayActiveGun()!.instanceId)).not.toBe(beforeSwap);
  // Avoid the fixed archived EXIT panel (top y<132) while following the
  // authored safe-service approach entirely through touch contacts.
  await touchReplayTo(page, { x: 300, y: 150 }); await touchReplayTo(page, { x: 350, y: 200 }); await touchReplayTo(page, { x: 530, y: 220 }); await touchReplayTo(page, { x: 650, y: 220 }); await touchReplayTo(page, { x: 670, y: 390 }); await touchReplayTo(page, { x: 550, y: 410 });
  expect((await state(page)).cameraX).toBeGreaterThan(0);
  await page.touchscreen.tap((page.viewportSize()?.width ?? 390) - 76, (page.viewportSize()?.height ?? 844) - 48);
  await expect.poll(async () => (await state(page)).replay?.completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
  await touchReplayTo(page, { x: 690, y: 490 }); await page.touchscreen.tap((page.viewportSize()?.width ?? 390) - 76, (page.viewportSize()?.height ?? 844) - 48);
  await expect.poll(async () => (await state(page)).historicalReplayOutcome).toBe('success');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(before);
});

test('History hold-drag-release cannot leak a live target through replay entry and exit', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-390x844', 'Dedicated phone History gesture isolation evidence.');
  await ready(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prepareF01())).toBe(true);
  await expect.poll(async () => (await state(page)).activeAttemptId).toBeTruthy();
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); raw.mission.receipts.push({ id: 'int-fb:test:held-history', jobId: 'MC-OPT-F01-01', worldEventId: 'held-event', attemptId: 'held-attempt', recipientId: 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord: raw.liveMission.replayRecord }); delete raw.liveMission; localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw)); });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const before = await state(page); const raw = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!); const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 728, id: 1 }] });
    await page.waitForTimeout(250);
    // A dragged press remains owned by the History control until release; it
    // must not become a live movement target midway through the gesture.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 42, y: 410, id: 1 }] });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.hasLiveTouchTarget())).toBe(false);
    expect(await state(page)).toMatchObject({ x: before.x, y: before.y, tabbyPosition: before.tabbyPosition, houndPosition: before.houndPosition });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
  await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.finishHistoricalReplay('exit'))).toBe(true);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.hasLiveTouchTarget())).toBe(false);
  expect(await state(page)).toMatchObject({ x: before.x, y: before.y, tabbyPosition: before.tabbyPosition, houndPosition: before.houndPosition, historicalReplayActive: false });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(raw);
});

test('archived R01 preserves terrain layers, collision, camera, and living-actor rules', async ({ page }, info) => {
  // Two living actors traverse the same slow world-unit ramp in both
  // directions; this is an integration budget, not a relaxed assertion.
  test.setTimeout(180_000);
  test.skip(info.project.name !== 'desktop-1280x720', 'Reference desktop establishes archived terrain traversal; phone is reported separately.');
  await ready(page);
  await activate(page, '1', { x: 370, y: 380 });
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    const replayRecord = raw.liveMission?.replayRecord;
    if (!replayRecord) throw new Error('real R01 activation did not capture replay record');
    raw.mission.receipts.push({ id: 'int-fb:test:archived-r01', jobId: 'MC-OPT-R01-01', worldEventId: 'archived-r01-event', attemptId: 'archived-r01-attempt', recipientId: 'rcc-dispatch', credits: 1000, metal: 20, circuits: 4, cloth: 6, replayRecord });
    delete raw.liveMission;
    localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw));
  });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const before = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.cameraActor).toBe('tabby');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHostileClear())).toBe(true);
  // The ramp owns its transition at z=16: approach from the road at z=8,
  // then cross its authored boundary rather than trying to climb from the
  // ground underpass at z=20.
  for (const point of [{ x: 370, y: 100 }, { x: 400, y: 80 }, { x: 400, y: 210 }, { x: 530, y: 220 }]) {
    await moveReplayTo(page, point.x, point.y);
  }
  const ascentSamples: string[] = [];
  try {
    await expect.poll(async () => {
      const replay = (await state(page)).replay;
      if (replay) ascentSamples.push(`trail=${replay.trailLength};tabby=${replay.tabbyPosition.x.toFixed(1)},${replay.tabbyPosition.y.toFixed(1)},${replay.tabbyLayer};hound=${replay.houndPosition.x.toFixed(1)},${replay.houndPosition.y.toFixed(1)},${replay.houndLayer}`);
      return replay?.tabbyLayer === 'elevated' && replay.houndLayer === 'elevated';
    }, { timeout: 30_000 }).toBe(true);
  } catch (error) {
    throw new Error(`archived ascent did not elevate both actors: ${ascentSamples.join(' | ')}; ${error instanceof Error ? error.message : String(error)}`);
  }
  // The bridge edge is authored collision: neither living archived actor can
  // enter the unsupported gap below it.
  await page.mouse.move(530 - (await state(page)).cameraX, 320 - (await state(page)).cameraY); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  const blocked = (await state(page)).replay!;
  expect(blocked.tabbyPosition.y).toBeLessThan(260); expect(blocked.houndPosition.y).toBeLessThan(260);
  for (const point of [{ x: 530, y: 220 }, { x: 400, y: 210 }, { x: 400, y: 80 }, { x: 370, y: 100 }, { x: 370, y: 380 }]) {
    await moveReplayTo(page, point.x, point.y);
  }
  await expect.poll(async () => {
    const replay = (await state(page)).replay;
    return replay?.tabbyLayer === 'ground' && replay.houndLayer === 'ground';
  }, { timeout: 15_000 }).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHoundDown())).toBe(true);
  const downed = (await state(page)).replay!;
  await moveReplayTo(page, downed.x - 20, downed.y - 20);
  expect((await state(page)).replay).toMatchObject({ cameraActor: 'tabby', houndPosition: downed.houndPosition });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(before);
});

test('held writer rejects corruption after a non-live workshop preview', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Dedicated desktop held-lock corruption evidence.');
  await ready(page); await page.keyboard.press('b'); const canvas = page.locator('canvas'); const box = await canvas.boundingBox(); if (!box) throw new Error('canvas unavailable');
  await page.mouse.click(box.x + 550 * box.width / 1280, box.y + 295 * box.height / 720); await expect.poll(async () => (await state(page)).workshopPreview).toBe('buy-f2'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopCredits).toBe(1350);
  await page.keyboard.press('f'); await expect.poll(async () => (await state(page)).workshopPreview).toBe('fit-f2-a'); await holdFixtureWriter(page);
  try {
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.some(lock => lock.name === 'meowcenary:int-fb:v1:writer') ?? false)).toBe(true);
    const corrupt = await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); raw.workshop.standing.rcc = -1; const text = JSON.stringify(raw); localStorage.setItem('meowcenary:int-fb:v1:profile', text); return text; });
    await releaseFixtureWriter(page);
    await page.evaluate(() => navigator.locks.request('meowcenary:int-fb:v1:writer', { mode: 'exclusive' }, async () => undefined));
    expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(corrupt);
    expect(await state(page)).toMatchObject({ workshopCredits: 1350, workshopParts: 26 });
    await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true); await expect.poll(async () => (await state(page)).loadBlocked).toBe(true);
    expect((await state(page)).recoveryMessage).toContain('preserved unchanged'); expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(corrupt);
  } finally { await releaseFixtureWriter(page); }
});

test('F01 recovery/retry/extraction is persisted by the live Phaser scene', async ({ page }, info) => {
  // Recovery, retry, post-settlement return travel, live workshop mutation,
  // and three replay terminal paths are one integration flow. With archived
  // movement now rate-matched to live movement, 120 seconds is sufficient.
  test.setTimeout(120_000);
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
  // Queue two real retry callbacks against one recovered attempt. The owner
  // gets the lock first; the stale tab must freeze rather than turning the
  // freshly created attempt into a second retry.
  const staleRetryTab = await page.context().newPage();
  await ready(staleRetryTab);
  await expect.poll(async () => (await state(staleRetryTab)).recoveryMode).toBe('recovered');
  await holdFixtureWriter(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueRetry())).toBe(true);
  expect(await staleRetryTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueRetry())).toBe(true);
  await releaseFixtureWriter(page);
  await expect.poll(async () => {
    const value = await state(page);
    return value.recoveryMode === 'none' && value.combatActive && value.activeAttemptId !== activated.activeAttemptId;
  }, { timeout: 15_000 }).toBe(true);
  const ownerRetry = await state(page);
  await expect.poll(async () => !(await state(staleRetryTab)).combatActive).toBe(true);
  expect(await state(staleRetryTab)).toMatchObject({ workshopCredits: recovered.workshopCredits, receiptIds: recovered.receiptIds });
  expect(ownerRetry.workshopCredits).toBe(recovered.workshopCredits);
  await staleRetryTab.close();
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
  // Hold the real named writer lock so the queued extraction has a durable,
  // observable boundary before the competing KO is injected.
  await holdFixtureWriter(page);
  await page.keyboard.press('e');
  // Establish that the actual extraction transaction is queued before
  // injecting the KO; key dispatch alone is not a transaction boundary.
  await expect.poll(async () => (await state(page)).settlementPending).toBe(true);
  // A KO arriving after a valid extraction request cannot replace committed victory.
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat())).toBe(true);
  await releaseFixtureWriter(page);
  await expect.poll(async () => {
    const value = await state(page);
    return value.extracted ? 'extracted' : `pending=${value.settlementPending}; recovery=${value.recoveryMode}; terminal=${value.attemptTerminal}; credits=${value.workshopCredits}; receipts=${value.receiptIds.length}; paid=${value.paidEventIds.length}`;
  }, { timeout: 15_000 }).toBe('extracted');
  const complete = await state(page);
  expect(complete.workshopCredits).toBe(startingWallet.credits - 250 + 1000);
  expect(complete.paidEventIds).toContain(activated.worldEventId!);
  expect(complete.receiptIds).toHaveLength(1);
  expect(complete).toMatchObject({ standing: { rcc: 0, fre: 10 }, houDossier: 1, fluxQualificationRemainder: 1.25 });
  const retryReceipt = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!);
    const receipt = raw.mission.receipts.at(-1);
    return { receipt, attempts: raw.workshop.attempts, paid: raw.workshop.paidEventIds };
  });
  expect(retryReceipt.receipt).toMatchObject({ worldEventId: activated.worldEventId, credits: 1000, replayRecord: { version: 'int-fb-replay-v1', contentId: 'fixture:MC-OPT-F01-01:v1', storyBranch: 'MC-OPT-F01-01' } });
  expect(retryReceipt.receipt.replayRecord.startSnapshot.actors).toHaveLength(4);
  expect(retryReceipt.receipt.replayRecord.loadout.parts).toHaveLength(25);
  expect(retryReceipt.attempts.filter((attempt: any) => attempt.worldEventId === activated.worldEventId && attempt.terminal === 'victory')).toHaveLength(1);
  expect(retryReceipt.paid).toEqual([activated.worldEventId]);
  // Change the live loadout through the normal safe-service workshop UI after
  // settlement. The archived record must continue to resolve its original F1.
  expect(await state(page)).toMatchObject({ tabbyHealth: 100, houndHealth: 100, tabbyPosition: { x: 80, y: 110 }, houndPosition: { x: 65, y: 110 }, recoveryMode: 'none' });
  await page.keyboard.press('b'); await expect.poll(async () => (await state(page)).workshopOpen).toBe(true);
  const workshopCanvas = page.locator('canvas'); const workshopBox = await workshopCanvas.boundingBox(); if (!workshopBox) throw new Error('canvas unavailable');
  await page.mouse.click(workshopBox.x + 550 * workshopBox.width / 1280, workshopBox.y + 295 * workshopBox.height / 720); await expect.poll(async () => (await state(page)).workshopPreview).toBe('buy-f2'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopCredits).toBe(complete.workshopCredits - 1650);
  await page.keyboard.press('f'); await expect.poll(async () => (await state(page)).workshopPreview).toBe('fit-f2-a'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!).workshop.gunSlots['TAB-A'].F)).toMatch(/TAB-F2/);
  const postWorkshop = await state(page);
  // Historical replay is entered through its visible H control and may only
  // observe a pinned receipt. Every terminal route leaves the complete live
  // envelope byte-identical; unavailable pinned content refuses entry.
  const durableBeforeReplay = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'));
  await page.keyboard.press('h');
  await expect.poll(async () => (await state(page)).historicalReplayActive).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.replayActiveGun())).toMatchObject({ supply: 12 });
  await page.keyboard.press('g'); await page.keyboard.press('Enter'); await page.keyboard.press('1');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(durableBeforeReplay);
  // Clear is deliberately not a terminal shortcut: archived E must record
  // the pinned objective and then extract through the replay operation.
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayHostileClear())).toBe(true);
  await expect.poll(async () => (await state(page)).replay?.groupCleared).toBe(true);
  // This retry record starts at safe service, requiring the authored tunnel
  // and spawn approach before entering the F01 pocket.
  await moveReplayAlong(page, [{ x: 300, y: 80 }, { x: 350, y: 200 }, { x: 530, y: 220 }, { x: 650, y: 220 }, { x: 670, y: 390 }, { x: 550, y: 410 }]); await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).replay?.completedInteractionIds).toContain('INT-FB-F01-DISPUTED-LOT');
  await moveReplayTo(page, 690, 490); await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).historicalReplayOutcome).toBe('success');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(durableBeforeReplay);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceReplayTerminal('death'))).toBe(true);
  expect(await state(page)).toMatchObject({ historicalReplayActive: false, historicalReplayOutcome: 'death' });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(durableBeforeReplay);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(true);
  await page.keyboard.press('Escape');
  expect(await state(page)).toMatchObject({ historicalReplayActive: false, historicalReplayOutcome: 'exit' });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(durableBeforeReplay);
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!); raw.mission.receipts.at(-1).replayRecord.contentId = 'fixture:MC-OPT-F01-01:v9'; localStorage.setItem('meowcenary:int-fb:v1:profile', JSON.stringify(raw)); });
  const unsupportedRecord = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile')!);
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.openHistoricalReplay())).toBe(false);
  expect(await state(page)).toMatchObject({ historicalReplayActive: false });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(unsupportedRecord);
  await capture(page, info, 'f01-event-delivered');
  await page.keyboard.press('e');
  expect(await state(page)).toMatchObject({ workshopCredits: postWorkshop.workshopCredits, receiptIds: postWorkshop.receiptIds, paidEventIds: postWorkshop.paidEventIds });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__)), { timeout: 15_000 }).toBe(true);
  expect(await state(page)).toMatchObject({ receiptIds: postWorkshop.receiptIds, paidEventIds: postWorkshop.paidEventIds, workshopCredits: postWorkshop.workshopCredits });
  // The separate Chapter-5 screen starts only from its own key. A visible
  // merge confirmation persists before refresh; stale, duplicate, and fitted
  // donor attempts cannot mutate it or the retained B1 envelope.
  const b1BeforeLate = await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'));
  await page.goto('/?fixture=int-late');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__)), { timeout: 15_000 }).toBe(true);
  const late = () => page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.diagnostics());
  expect(await late()).toMatchObject({ scene: 'LateFixtureScene', revision: 0, parts: 29, declaration: 'This is a later workshop test save with Chapter 5 capability already unlocked. Your earlier test save is unchanged.' });
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'bad-fitted', expectedRevision: 0, action: 'merge', inputIds: ['INT-LATE-TAB-B-B', 'INT-LATE-DONOR-B3-T2'] }))).toBe(false);
  await page.keyboard.press('m'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await late()).revision).toBe(1);
  expect((await late()).receipts).toMatchObject([{ commandId: 'late:merge:0', action: 'merge', outputIds: ['INT-LATE-TAB-B-HM-late:merge:0'] }]);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'late:merge:0', expectedRevision: 1, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }))).toBe(false);
  expect(await page.evaluate(() => (globalThis as { __MEOWCENARY_LATE_FIXTURE__: LateSeam }).__MEOWCENARY_LATE_FIXTURE__.commit({ commandId: 'stale-build', expectedRevision: 0, action: 'build' }))).toBe(false);
  await page.keyboard.press('u'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await late()).revision).toBe(2);
  expect(await late()).toMatchObject({ parts: 29, wallet: { credits: 1000, metal: 20, circuits: 4 }, discoveries: ['TAB-B-HM'] });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as { __MEOWCENARY_LATE_FIXTURE__?: LateSeam }).__MEOWCENARY_LATE_FIXTURE__)), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await late()).revision).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary:int-fb:v1:profile'))).toBe(b1BeforeLate);
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

  // A checkpoint queued before a takeover must capture after lock ownership,
  // not restore Tabby's stale control snapshot once the lock is released.
  await holdFixtureWriter(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prolongCombat())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceTabbyDown())).toBe(true);
  await expect.poll(async () => (await state(page)).takeoverControl).toBeDefined();
  const takeover = await state(page);
  await tap(page, info, takeover.takeoverControl!);
  await releaseFixtureWriter(page);
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
  // A stale second tab may read the active attempt, but its old checkpoint
  // revision must not overwrite the fresh owner snapshot.
  // Take the baseline only after the test lock is acquired: an ordinary
  // periodic checkpoint may already have been queued by the last reload.
  // Queue the current owner's checkpoint before the second tab can request
  // one. The held writer makes the durable winner/order explicit.
  await holdFixtureWriter(page);
  const staleRevision = (await state(page)).checkpoint!.revision;
  await page.keyboard.press('q');
  const staleTab = await page.context().newPage();
  await ready(staleTab);
  expect((await state(staleTab)).checkpoint!.revision).toBe(staleRevision);
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prolongCombat())).toBe(true);
  // Queue every live-attempt writer while the stale checkpoint is still
  // pending. The winning checkpoint must freeze this tab before any can use
  // the winner's counters or mutate wallet, objective, or settlement state.
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat())).toBe(true);
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueRequiredObjective())).toBe(true);
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueGroupClear())).toBe(true);
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueExtraction())).toBe(true);
  const walletBeforeStaleQueue = (await state(page)).workshopCredits;
  const receiptsBeforeStaleQueue = (await state(page)).receiptIds;
  await releaseFixtureWriter(page);
  await expect.poll(async () => (await state(page)).checkpoint?.revision).toBeGreaterThan(staleRevision);
  const ownerRevision = (await state(page)).checkpoint!.revision;
  await expect.poll(async () => !(await state(staleTab)).combatActive).toBe(true);
  expect(await staleTab.evaluate(() => JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!).liveMission.checkpointRevision)).toBe(ownerRevision);
  const frozenWallet = (await state(staleTab)).workshopCredits;
  expect(frozenWallet).toBe(walletBeforeStaleQueue);
  expect(await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat())).toBe(false);
  await staleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.surrender());
  expect(await state(staleTab)).toMatchObject({ workshopCredits: frozenWallet, receiptIds: receiptsBeforeStaleQueue, completedInteractionIds: [], groupCleared: false });
  await staleTab.close();
  // Rejected writer acquisition must release the checkpoint flag so the next
  // control mutation can publish normally.
  const gunBeforeReject = (await state(page)).controlledGun;
  await holdFixtureWriter(page);
  // A periodic checkpoint can legally finish while this test is acquiring the
  // lock. Capture only once the lock is owned, so the injected rejection is
  // measured against the latest durable state rather than a stale observation.
  const revisionBeforeReject = (await state(page)).checkpoint!.revision;
  await page.evaluate(() => {
    const seam = (globalThis as Globals).__MEOWCENARY_INT_FB__!;
    seam.rejectNextWriterLock();
    seam.prolongCombat();
  });
  await page.waitForTimeout(50);
  expect((await state(page)).checkpoint!.revision).toBe(revisionBeforeReject);
  await page.keyboard.press('q');
  await releaseFixtureWriter(page);
  await expect.poll(async () => {
    const value = await state(page);
    return value.checkpoint!.revision > revisionBeforeReject && value.controlledGun !== gunBeforeReject;
  }).toBe(true);
  // A profile-only discovery refresh may observe a newer durable envelope,
  // but it must retain this stale tab's old live revision. Its following
  // combat checkpoint therefore freezes instead of borrowing new counters.
  const profileStaleTab = await page.context().newPage();
  await ready(profileStaleTab);
  // Stage service access through the ordinary movement route while this tab
  // is current. Its checkpoint can settle, then the owner reloads that
  // durable state before creating the revision that makes this tab stale.
  await moveAlong(profileStaleTab, [{ x: 650, y: 220 }, { x: 530, y: 220 }, { x: 350, y: 200 }, { x: 300, y: 80 }, { x: 80, y: 110 }]);
  await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.pauseSimulation());
  await page.reload();
  await ready(page);
  await holdFixtureWriter(page);
  const profileBaseline = (await state(page)).checkpoint!.revision;
  const walletBeforeProfileRefresh = (await state(page)).workshopCredits;
  expect((await state(profileStaleTab)).checkpoint!.revision).toBe(profileBaseline);
  // Establish a definite owner write before admitting stale-tab callbacks.
  // The old arrangement queued both tabs behind one lock and allowed lock
  // scheduling—not the live-attempt fence—to decide which write won.
  await page.keyboard.press('q');
  await releaseFixtureWriter(page);
  await expect.poll(async () => (await state(page)).checkpoint!.revision).toBeGreaterThan(profileBaseline);
  const profileOwnerRevision = (await state(page)).checkpoint!.revision;
  // This seam only invokes confirmation; service access was established by
  // the ordinary route before ownership became stale.
  expect(await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueWorkshopConfirmation())).toBe(true);
  expect(await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueWorkshopConflict())).toBe(true);
  expect(await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.queueDiscovery())).toBe(true);
  expect(await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.prolongCombat())).toBe(true);
  await expect.poll(async () => !(await state(profileStaleTab)).combatActive).toBe(true);
  expect((await state(profileStaleTab)).checkpoint!.revision).toBe(profileBaseline);
  expect((await state(profileStaleTab)).workshopCredits).toBe(walletBeforeProfileRefresh);
  expect(await profileStaleTab.evaluate(() => JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!).liveMission.checkpointRevision)).toBe(profileOwnerRevision);
  expect(await profileStaleTab.evaluate(() => (globalThis as Globals).__MEOWCENARY_INT_FB__!.forceSquadDefeat())).toBe(false);
  await profileStaleTab.close();
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

test('ordinary B1 controls join two jobs with the directed safe-service workshop ledger', async ({ page }, info) => {
  test.setTimeout(180_000);
  test.skip(info.project.name !== 'desktop-1280x720', 'Joined B1 ledger evidence is captured once at the desktop reference viewport.');
  await ready(page);
  // Public-spur discovery is a normal world interaction, before either job.
  await moveAlong(page, [{ x: 300, y: 80 }, { x: 350, y: 200 }, { x: 530, y: 220 }]); await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).workshopParts).toBe(25);
  await moveAlong(page, [{ x: 350, y: 200 }, { x: 300, y: 80 }, { x: 80, y: 80 }]);
  const r01 = await activate(page, '1', { x: 370, y: 380 });
  await expect.poll(async () => (await state(page)).groupCleared).toBe(true);
  for (const point of [
    { x: 230, y: 390, route: [{ x: 350, y: 350 }, { x: 230, y: 390 }] },
    { x: 340, y: 460, route: [{ x: 280, y: 480 }, { x: 340, y: 460 }] },
    { x: 290, y: 480, route: [{ x: 290, y: 480 }] },
  ]) { await moveAlong(page, point.route); await page.keyboard.press('e'); }
  await moveTo(page, 200, 490); await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).extracted).toBe(true);
  const f01 = await activate(page, '2', { x: 670, y: 390 });
  await expect.poll(async () => (await state(page)).groupCleared).toBe(true);
  await moveAlong(page, [{ x: 550, y: 410 }]); await page.keyboard.press('e');
  await moveTo(page, 690, 490); await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).extracted).toBe(true);
  // All following actions use player shortcuts/menu selections plus Enter
  // confirmation; no direct workshop transaction or storage call is used.
  const chooseMenu = async (x: number, y: number) => { await page.keyboard.press('b'); await expect.poll(async () => (await state(page)).workshopOpen).toBe(true); await page.mouse.click(x, y); await expect.poll(async () => (await state(page)).workshopPreview).toBeDefined(); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined(); };
  await chooseMenu(550, 295); // BUY F2
  await page.keyboard.press('f'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  await page.keyboard.press('l'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  await page.keyboard.press('s'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  await page.keyboard.press('g'); await page.keyboard.press('Enter'); await expect.poll(async () => (await state(page)).workshopPreview).toBeUndefined();
  await chooseMenu(730, 411); // FIT B3
  await chooseMenu(550, 469); // DEVELOP B2
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_INT_FB__))).toBe(true);
  const final = await state(page);
  expect(final).toMatchObject({ workshopCredits: 2390, workshopMaterials: { metal: 60, circuits: 12 }, receiptIds: expect.any(Array) });
  expect(final.receiptIds).toHaveLength(2); expect(final.paidEventIds).toEqual([r01.worldEventId, f01.worldEventId]);
  const reloadedWorkshop = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary:int-fb:v1:profile')!).workshop);
  expect(reloadedWorkshop.gunSlots['TAB-A'].F).toMatch(/^INT-B1-TAB-F2-/);
  expect(reloadedWorkshop.gunSlots['TAB-A'].B).toMatch(/^INT-B1-TAB-B3-/);
  expect(reloadedWorkshop.parts.find((part: { instanceId: string }) => part.instanceId === 'INT-B1-TAB-B2-GIFT')).toMatchObject({ tier: 2, version: 2 });
});
