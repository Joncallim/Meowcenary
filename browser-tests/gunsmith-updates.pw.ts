import { expect, test, type Page } from '@playwright/test';

type Diagnostic = { panel: string; focusedKey?: string; buttons: Array<{ key?: string;
  text: string; focused: boolean; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } }> };
type PerformanceState = { events: Array<{ owner: string; facts: Record<string, unknown> }>;
  presentedMenu?: { revision: number } };
type Seams = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__: { showMenu(panel: string): boolean;
    waitForMenuPresentation(): Promise<boolean>; isMenuInputNeutral(): boolean;
    menuFocusedKey(): string | undefined; menuLoadoutDiagnostics(): Diagnostic };
  __MEOWCENARY_PERFORMANCE__: { snapshot(): PerformanceState; resetMeasurement(): void };
};
const diagnostic = (page: Page) => page.evaluate(() =>
  (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
const measurement = (page: Page) => page.evaluate(() =>
  (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.snapshot());
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  try { await expect.poll(() => page.evaluate(() =>
    (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.isMenuInputNeutral())).toBe(false); }
  finally { await page.keyboard.up(key); }
  await expect.poll(() => page.evaluate(() =>
    (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.isMenuInputNeutral())).toBe(true);
}
async function focus(page: Page, key: string): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    if (await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuFocusedKey()) === key) return;
    await press(page, 'ArrowDown');
  }
  throw new Error(`Missing semantic focus ${key}: ${JSON.stringify(await diagnostic(page))}`);
}
async function reset(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.resetMeasurement());
}
async function assertLocalCommit(page: Page, rebuildCount: unknown): Promise<void> {
  await expect.poll(async () => (await measurement(page)).events.some(event =>
    event.owner === 'menu.update' && event.facts.committed === true)).toBe(true);
  const state = await measurement(page);
  expect(state.events.filter(event => event.owner === 'menu.render')).toHaveLength(0);
  const updates = state.events.filter(event => event.owner === 'menu.update');
  expect(updates).toHaveLength(1);
  expect(updates[0]!.facts).toMatchObject({ section: 'gunsmith-body', rebuildCount,
    reason: 'same-panel-state-mutation', committed: true });
  await expect.poll(async () => (await measurement(page)).presentedMenu?.revision).toBe(updates[0]!.facts.revision);
}

test('Gunsmith build switching and replacement retain menu ownership and semantic focus through resize', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 640, unlocks: [] }, stages: {}, achievements: {}, characters: {},
    gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] }],
      parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
    equipment: {}, equipmentLoadout: {},
  })));
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Seams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.showMenu('gunsmith'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  const mounted = (await measurement(page)).events.filter(event => event.owner === 'menu.render').at(-1)!;
  const rebuildCount = mounted.facts.rebuildCount;
  for (const family of ['smg', 'pistol']) {
    await focus(page, `gunsmith-family:${family}`);
    await reset(page);
    await press(page, 'Enter');
    await assertLocalCommit(page, rebuildCount);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!).gunsmith.selectedBuildId)).toBe(`build:${family}`);
    expect((await diagnostic(page)).focusedKey).toBe(`gunsmith-family:${family}`);
  }
  await focus(page, 'gunsmith-part:compact');
  const target = (await diagnostic(page)).buttons.find(row => row.key === 'gunsmith-part:compact')!;
  expect(target.text).toContain('REPLACE HEAVY RECEIVER T2');
  expect(target.visible && target.interactive).toBe(true);
  await reset(page);
  const { x, y, width, height } = target.bounds;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x + width / 2, y + height / 2);
  else await page.mouse.click(x + width / 2, y + height / 2);
  await assertLocalCommit(page, rebuildCount);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.gunsmith.builds[0].fitted.receiver).toBe('compact');
  expect(saved.gunsmith.parts.heavy).toMatchObject({ partId: 'part:receiver-heavy', tier: 2 });
  expect((await diagnostic(page)).focusedKey).toBe('gunsmith-part:compact');
  expect((await diagnostic(page)).buttons.find(row => row.key === 'gunsmith-part:compact')!.text).toContain('FITTED');
  await page.screenshot({ path: testInfo.outputPath('gunsmith-replacement-committed.png'), scale: 'css' });

  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width + 20, height: viewport.height });
  await expect.poll(async () => (await measurement(page)).events.some(event =>
    event.owner === 'menu.render' && event.facts.reason === 'viewport-resize')).toBe(true);
  await expect.poll(async () => (await diagnostic(page)).focusedKey).toBe('gunsmith-part:compact');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!).gunsmith)).toEqual(saved.gunsmith);
  const resized = (await measurement(page)).events.filter(event => event.owner === 'menu.render').at(-1)!;
  await reset(page);
  await press(page, 'Enter');
  await assertLocalCommit(page, resized.facts.rebuildCount);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!).gunsmith.builds[0].fitted.receiver)).toBeUndefined();
  expect((await diagnostic(page)).focusedKey).toBe('gunsmith-part:compact');
  expect(errors).toEqual([]);
});
