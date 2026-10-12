import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { dismissRunStartBrief } from './run-start-helpers';

type Footprint = { id: string; x: number; y: number; w: number; h: number };
type Node = { role: string; artId: string; x: number; y: number; visible: boolean; active: boolean };
type Facts = {
  layout: { arenaId: string; seed: number; layoutSeed: number; hash: string; contentVersion: string; generationVersion: number;
    diagnostic: { mode: string; attempts: number }; start: { x: number; y: number };
    obstacles: Array<{ instanceId: string; footprint: Footprint; skin: { artId: string; offsetX?: number; offsetY?: number } }>;
    arena: { size: { width: number; height: number }; hazards: Footprint[] }; floorPlan: string[] };
  status: string; timeMs: number; player: { x: number; y: number; health: number;
    presentationBounds: { x: number; y: number; width: number; height: number } }; bodies: Footprint[];
  presentation: { nodes: Node[]; floorNodeCount: number; obstacleSkinNodeCount: number; decorationNodeCount: number };
  enemyProjectiles: number;
  projectileSimulation: { loopRunning: boolean; physicsPaused: boolean; visibility: string;
    active: Array<{ index: number; x: number; y: number; traveled: number; centerX: number; centerY: number;
      velocityX: number; velocityY: number }> };
  hazard: { elapsedMs: number; nodes: Array<{ id: string; x: number; y: number; width: number; height: number; alpha: number; tint: number }> };
  camera: { zoom: number; worldView: { x: number; y: number; width: number; height: number } };
};
type Seam = {
  waitForMenuPresentation(): Promise<boolean>; waitForPreparedGame(): Promise<boolean>; waitForInputFrame(): Promise<boolean>;
  startArenaTestRun(arenaId: string, seed: number): Promise<boolean>; arenaLayoutDiagnostics(): Facts | undefined;
  freeze(): Promise<void>; resume(): void; showArenaTestOverview(): boolean;
  stepArenaHazardTest(dtMs: number, x: number, y: number): boolean;
  fireArenaTestShot(x: number, y: number, targetX: number, targetY: number): boolean;
  showRunSummary(outcome: 'won' | 'lost'): boolean; isSceneActive(key: string): boolean;
};
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam };
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));
async function read(page: Page): Promise<Facts> {
  const facts = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.arenaLayoutDiagnostics());
  expect(facts).toBeDefined(); return facts!;
}
async function frame(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
}
async function pulse(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key); try { await frame(page); } finally { await page.keyboard.up(key); }
  await frame(page);
}
async function open(page: Page, reducedMotion = false): Promise<void> {
  if (reducedMotion) await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({ version: 4,
    settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true }, progression: { scrap: 0, unlocks: [] },
    selectedCharacterId: 'scrap-tabby', stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
    gunsmith: { builds: [], parts: {}, fabricationSerials: {} }, equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
    pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
  })));
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
}
async function launch(page: Page, arenaId: string, seed: number): Promise<Facts> {
  expect(await page.evaluate(({ arenaId, seed }) => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.startArenaTestRun(arenaId, seed), { arenaId, seed })).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  const facts = await read(page); expect(facts.status).toBe('intro'); expect(facts.timeMs).toBe(0);
  expect(facts.layout.arenaId).toBe(arenaId); expect(facts.layout.seed).toBe(seed);
  return facts;
}
async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  const facts = info.outputPath(`${name}.json`);
  await writeFile(facts, JSON.stringify({ ...(await read(page)), viewport: page.viewportSize(), profile: info.project.name }, null, 2));
  await info.attach(`${name}-facts`, { path: facts, contentType: 'application/json' });
  const path = info.outputPath(`${name}.png`); await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}
function assertPlayerPresentationAt(facts: Facts, x: number, y: number): void {
  expect(facts.player).toMatchObject({ x, y });
  const bounds = facts.player.presentationBounds;
  expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.x).toBeLessThanOrEqual(x); expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(x);
  expect(bounds.y).toBeLessThanOrEqual(y); expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(y);
}
function assertPairing(facts: Facts): void {
  expect(facts.layout.diagnostic.mode).toBe('generated');
  expect(facts.layout.obstacles.length).toBeGreaterThanOrEqual(4); expect(facts.layout.obstacles.length).toBeLessThanOrEqual(5);
  expect(facts.layout.diagnostic.attempts).toBeLessThanOrEqual(8);
  expect(facts.bodies).toHaveLength(facts.layout.obstacles.length);
  expect(facts.presentation.obstacleSkinNodeCount).toBe(facts.bodies.length);
  expect(facts.presentation.decorationNodeCount).toBeGreaterThanOrEqual(26); expect(facts.presentation.decorationNodeCount).toBeLessThanOrEqual(34);
  for (const [index, pair] of facts.layout.obstacles.entries()) {
    const { x, y, w, h } = pair.footprint;
    expect(facts.bodies[index]).toEqual({ x, y, w, h });
    expect(facts.presentation.nodes).toContainEqual(expect.objectContaining({ role: 'obstacle-skin', artId: pair.skin.artId,
      x: x + w / 2 + (pair.skin.offsetX ?? 0), y: y + h / 2 + (pair.skin.offsetY ?? 0), visible: true, active: true }));
  }
  const floors = facts.presentation.nodes.filter(node => node.role === 'floor');
  expect(floors.map(node => node.artId)).toEqual(facts.layout.floorPlan);
  expect(floors.every(node => node.active && node.visible)).toBe(true);
}

for (const arenaId of ['junkyard-lot', 'forge-foundry']) for (const seed of [1, 42]) {
  test(`${arenaId} seed ${seed}: prepared geometry matches live collision and art`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await open(page); const initial = await launch(page, arenaId, seed); assertPairing(initial);
    await dismissRunStartBrief(page, info.project.use.hasTouch ? 'touch' : 'keyboard');
    await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.freeze());
    expect((await read(page)).layout).toEqual(initial.layout);
    await capture(page, info, `${arenaId}-${seed}-actual-scale`);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showArenaTestOverview())).toBe(true);
    const overview = await read(page);
    expect(overview.camera.zoom).toBeCloseTo(Math.min(page.viewportSize()!.width / initial.layout.arena.size.width,
      page.viewportSize()!.height / initial.layout.arena.size.height));
    expect(overview.camera.worldView.x).toBeLessThanOrEqual(0.01);
    expect(overview.camera.worldView.y).toBeLessThanOrEqual(0.01);
    expect(overview.camera.worldView.x + overview.camera.worldView.width).toBeGreaterThanOrEqual(initial.layout.arena.size.width - 0.01);
    expect(overview.camera.worldView.y + overview.camera.worldView.height).toBeGreaterThanOrEqual(initial.layout.arena.size.height - 0.01);
    await capture(page, info, `${arenaId}-${seed}-overview`);
    expect(errors).toEqual([]);
  });
}

test('recorded seed is exact; terminal Replay is fresh; Main Menu revokes old Replay', async ({ page }, info) => {
  await open(page); const first = await launch(page, 'junkyard-lot', 42);
  await dismissRunStartBrief(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
  await pulse(page, 'r');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  const replay = await read(page); expect(replay.status).toBe('intro'); expect(replay.layout.arenaId).toBe(first.layout.arenaId);
  expect(replay.layout.seed).not.toBe(first.layout.seed); expect(replay.layout.hash).not.toBe(first.layout.hash);
  await dismissRunStartBrief(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
  // Logical focus moves from Replay through Adjust Loadout to Main Menu.
  await pulse(page, 'ArrowDown'); await pulse(page, 'ArrowDown'); await pulse(page, 'Enter');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
  const reproduced = await launch(page, 'junkyard-lot', 42);
  expect(reproduced.layout).toEqual(first.layout); await capture(page, info, 'recorded-seed-exact');
});

test('Forge crossing window matches actual damage, pause and reduced-motion presentation', async ({ page }, info) => {
  await open(page, true); await launch(page, 'forge-foundry', 1); await dismissRunStartBrief(page);
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.freeze());
  let facts = await read(page); const grate = facts.layout.arena.hazards[0]!;
  const x = grate.x + grate.w / 2, y = grate.y + grate.h / 2;
  const before = facts.player.health;
  expect(facts.hazard.elapsedMs).toBeLessThan(2400);
  expect(await page.evaluate(({ x, y, dt }) => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.stepArenaHazardTest(dt, x, y),
    { x, y, dt: 2450 - facts.hazard.elapsedMs })).toBe(true);
  facts = await read(page); expect(facts.player.health).toBe(before);
  assertPlayerPresentationAt(facts, x, y);
  expect(facts.hazard.nodes[0]).toMatchObject({ x, y, width: grate.w, height: grate.h, alpha: 0.75, tint: 0xffd65c });
  await capture(page, info, 'forge-warning-reduced-motion');
  expect(await page.evaluate(({ x, y }) => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.stepArenaHazardTest(950, x, y), { x, y })).toBe(true);
  facts = await read(page); expect(facts.player.health).toBeCloseTo(before - 1);
  assertPlayerPresentationAt(facts, x, y);
  expect(facts.hazard.nodes[0]).toMatchObject({ alpha: 1, tint: 0xff7156 });
  await capture(page, info, 'forge-active-damage');
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.resume()); await pulse(page, 'p');
  expect((await read(page)).status).toBe('paused');
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.freeze());
  const paused = await read(page);
  expect(await page.evaluate(({ x, y }) => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.stepArenaHazardTest(10000, x, y), { x, y })).toBe(true);
  expect(await read(page)).toEqual(paused);
});

test('raised cover consumes a real hostile shot; uncovered player is hit after pooled reuse', async ({ page }, info) => {
  await open(page); const initial = await launch(page, 'junkyard-lot', 1); await dismissRunStartBrief(page);
  const cover = initial.layout.obstacles[0]!.footprint;
  // Keep the hostile origin inside the authored world. A 64px approach still
  // travels into the raised footprint; the exposed control starts 24px away
  // from the player, beyond their combined 20px contact radius.
  const y = cover.y + cover.h / 2, originX = cover.x - 64, targetX = cover.x + cover.w + 80;
  expect(originX).toBeGreaterThan(6); expect(originX).toBeLessThan(initial.layout.arena.size.width - 6);
  const before = (await read(page)).player.health;
  const firstShot = await page.evaluate(({ x, y, targetX }) => {
    const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!;
    const fired = seam.fireArenaTestShot(x, y, targetX, y);
    return { fired, facts: seam.arenaLayoutDiagnostics() };
  }, { x: originX, y, targetX });
  expect(firstShot.fired).toBe(true); expect(firstShot.facts).toBeDefined();
  const samples: Array<{ status: string; timeMs: number; player: Facts['player']; simulation: Facts['projectileSimulation'] }> = [];
  const fired = firstShot.facts!;
  expect(fired.projectileSimulation.active).toHaveLength(1);
  const pooledIndex = fired.projectileSimulation.active[0]!.index;
  try {
    // Join actual simulation frames. Large software-rendered canvases can
    // advance less than one second of gameplay during a five-second wall poll.
    // Keep the wall timeout and cover assertions, without treating render rate
    // as projectile travel or advancing a second synthetic physics owner.
    for (let frames = 0; frames < 40; frames++) {
      const facts = await read(page);
      samples.push({ status: facts.status, timeMs: facts.timeMs, player: facts.player, simulation: facts.projectileSimulation });
      if (facts.enemyProjectiles === 0) break;
      await frame(page);
    }
    await expect.poll(async () => {
      const facts = await read(page);
      samples.push({ status: facts.status, timeMs: facts.timeMs, player: facts.player, simulation: facts.projectileSimulation });
      return facts.enemyProjectiles;
    }).toBe(0);
  } finally {
    const path = info.outputPath('cover-projectile-samples.json');
    await writeFile(path, JSON.stringify(samples, null, 2));
    await info.attach('cover-projectile-samples', { path, contentType: 'application/json' });
  }
  const consumed = await read(page);
  expect(consumed.timeMs - fired.timeMs).toBeLessThan(750);
  expect((consumed.timeMs - fired.timeMs) * 210 / 1000).toBeLessThan(330);
  expect((await read(page)).player.health).toBe(before);
  const reusedShot = await page.evaluate(({ x, y, targetX }) => {
    const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!;
    const fired = seam.fireArenaTestShot(x, y, targetX, y);
    return { fired, index: seam.arenaLayoutDiagnostics()!.projectileSimulation.active[0]?.index };
  }, { x: originX, y, targetX: cover.x - 40 });
  expect(reusedShot.fired).toBe(true); expect(reusedShot.index).toBe(pooledIndex);
  for (let frames = 0; frames < 24 && (await read(page)).enemyProjectiles > 0; frames++) await frame(page);
  await expect.poll(async () => (await read(page)).player.health).toBeCloseTo(before - 6);
  expect((await read(page)).enemyProjectiles).toBe(0);
});

test('intro resize and orientation return preserve the captured layout', async ({ page }, info) => {
  await open(page); const initial = await launch(page, 'forge-foundry', 42);
  const original = page.viewportSize()!;
  const resized = info.project.name.startsWith('phone') ? { width: 844, height: 390 } : { width: 768, height: 1024 };
  await page.setViewportSize(resized); await frame(page); await frame(page);
  expect((await read(page)).layout).toEqual(initial.layout);
  expect((await read(page)).status).toBe('intro'); expect((await read(page)).timeMs).toBe(0);
  await capture(page, info, 'intro-resize-captured-layout');
  await page.setViewportSize(original); await frame(page); await frame(page);
  await dismissRunStartBrief(page, info.project.use.hasTouch ? 'touch' : 'keyboard');
  expect((await read(page)).layout).toEqual(initial.layout);
  expect((await read(page)).status).toBe('active');
});
