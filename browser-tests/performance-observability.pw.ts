import { expect, test, type Page } from '@playwright/test';

type Timing = { name?: string; sampleCount: number; averageMs: number; p50Ms: number; p95Ms: number;
  p99Ms: number; worstMs: number; overBudgetSamples: number; overBudgetRatio: number };
type PerformanceEvent = { owner: string; durationMs: number;
  facts: Record<string, string | number | boolean | readonly string[]> };
type Measurement = { frame: Timing; owners: Timing[]; events: PerformanceEvent[]; droppedEvents: number;
  gameplay?: { frame: Timing; owners: Timing[] }; menu?: { panel: string; committed: boolean; settled: boolean } };
type Presentation = { active: boolean; committedPanel?: string; committedDisplay: boolean;
  menuTextureLoadPending: number; pendingPanelArtIds: number; pendingPanelArtRepaints: number; pendingGunsmithArtIds: number };
type Button = { text: string; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } };
type VisualSeam = { waitForMenuPresentation(): Promise<boolean>; isMenuInputNeutral(): boolean;
  menuPresentationDiagnostics(): Presentation; menuLoadoutDiagnostics(): { panel: string; buttons: Button[] } };
type BrowserSeams = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  __MEOWCENARY_PERFORMANCE__?: { snapshot(): Measurement; resetMeasurement(): void };
};

async function measurement(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const probe = (globalThis as BrowserSeams).__MEOWCENARY_PERFORMANCE__;
    if (!probe) throw new Error('Explicit performance probe was not installed');
    return probe.snapshot();
  });
}
async function presentation(page: Page): Promise<Presentation | undefined> {
  return page.evaluate(() => (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__?.menuPresentationDiagnostics());
}
async function expectPanel(page: Page, panel: string): Promise<void> {
  await expect.poll(() => presentation(page)).toMatchObject({ active: true, committedPanel: panel, committedDisplay: true });
}
async function settle(page: Page, panel: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  await expectPanel(page, panel);
  await expect.poll(async () => (await measurement(page)).menu).toMatchObject({ panel, committed: true, settled: true });
}
async function press(page: Page, key: string): Promise<void> {
  // Match the existing responsive keyboard journey: hold until the logical
  // input owner samples the edge, then wait for its neutral release.
  await page.keyboard.down(key);
  try {
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__;
      return seam !== undefined && !seam.isMenuInputNeutral();
    }), { intervals: [16, 32, 50] }).toBe(true);
  } finally { await page.keyboard.up(key); }
  await expect.poll(() => page.evaluate(() => (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__?.isMenuInputNeutral()),
    { intervals: [16, 32, 50] }).toBe(true);
}
async function clickMenuButton(page: Page, text: string, touch: boolean): Promise<void> {
  const target = await page.evaluate(label => (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__!
    .menuLoadoutDiagnostics().buttons.find(button => button.text === label), text);
  expect(target, `Visible production menu action ${text}`).toBeDefined();
  expect(target!.visible).toBe(true);
  expect(target!.interactive).toBe(true);
  const { x, y, width, height } = target!.bounds;
  if (touch) await page.touchscreen.tap(x + width / 2, y + height / 2);
  else await page.mouse.click(x + width / 2, y + height / 2);
}
function expectBounded(snapshot: Measurement): void {
  expect(snapshot.events.length).toBeLessThanOrEqual(256);
  expect(snapshot.droppedEvents).toBeGreaterThanOrEqual(0);
  const windows = [snapshot.frame, ...snapshot.owners,
    ...(snapshot.gameplay ? [snapshot.gameplay.frame, ...snapshot.gameplay.owners] : [])];
  for (const window of windows) {
    expect(window.sampleCount).toBeGreaterThanOrEqual(0);
    expect(window.sampleCount).toBeLessThanOrEqual(600);
    expect(window.overBudgetSamples).toBeLessThanOrEqual(window.sampleCount);
    expect(window.overBudgetRatio).toBeGreaterThanOrEqual(0);
    expect(window.overBudgetRatio).toBeLessThanOrEqual(1);
    for (const duration of [window.averageMs, window.p50Ms, window.p95Ms, window.p99Ms, window.worstMs]) {
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(0);
    }
    expect(window.p50Ms).toBeLessThanOrEqual(window.p95Ms);
    expect(window.p95Ms).toBeLessThanOrEqual(window.p99Ms);
    expect(window.p99Ms).toBeLessThanOrEqual(window.worstMs);
  }
}

test('performance telemetry requires explicit opt-in and its reads/reset preserve saves', async ({ page }) => {
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserSeams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => '__MEOWCENARY_PERFORMANCE__' in globalThis)).toBe(false);

  await page.goto('/?visual-test=1&perf-test=1');
  await settle(page, 'home');
  await expect.poll(async () => (await measurement(page)).frame.sampleCount).toBeGreaterThan(0);
  const snapshot = await measurement(page);
  expectBounded(snapshot);
  expect(snapshot.owners.map(owner => owner.name)).toEqual([
    'menu.snapshot', 'menu.render', 'resource.load', 'boot.fonts', 'boot.font-weight', 'boot.preload',
    'boot.load', 'boot.audio', 'boot.visual', 'boot.create', 'run.prepare', 'game.create', 'frame.cpu', 'frame.render',
  ]);
  const events = (owner: string) => snapshot.events.filter(event => event.owner === owner);
  expect(events('boot.font-weight').map(event => event.facts.weight).sort()).toEqual([400, 600, 700, 800]);
  expect(events('boot.fonts')).toHaveLength(1);
  expect(events('boot.fonts')[0].facts).toMatchObject({ weights: 4 });
  // Current validated Boot closure: six physical visual resources and 21 WAVs.
  expect(events('boot.preload')).toHaveLength(1);
  expect(events('boot.preload')[0].facts).toMatchObject({ physicalResources: 6, audioFiles: 21 });
  expect(events('boot.load')).toHaveLength(1);
  expect(events('boot.load')[0].facts).toMatchObject({ physicalResources: 6, audioFiles: 21,
    incompleteAudio: 0, incompleteVisual: 0, failures: [] });
  expect(events('boot.audio')[0].facts).toMatchObject({ failed: 0 });
  expect(events('boot.visual')[0].facts).toMatchObject({ failed: 0 });

  const saved = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  await page.evaluate(() => {
    const probe = (globalThis as BrowserSeams).__MEOWCENARY_PERFORMANCE__!;
    probe.snapshot();
    probe.resetMeasurement();
    probe.snapshot();
  });
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saved);
  const reset = await measurement(page);
  expect(reset.events).toEqual([]);
  expectBounded(reset);
  expect(reset.menu).toMatchObject({ panel: 'home', committed: true, settled: true });
});

test('real navigation and resize stay authoritative while old panel art completes late', async ({ page }, testInfo) => {
  let releaseArt!: () => void;
  let signalArt!: () => void;
  const requested = new Promise<void>(resolve => { signalArt = resolve; });
  const released = new Promise<void>(resolve => { releaseArt = resolve; });
  await page.route('**/assets/ui/figma/figma-menu-chrome.png', async route => {
    signalArt();
    await released;
    await route.continue();
  });
  let afterNavigation = 0;
  try {
    await page.goto('/?visual-test=1&perf-test=1');
    await settle(page, 'home');
    await clickMenuButton(page, 'Loadout', Boolean(testInfo.project.use.hasTouch));
    await requested;
    await expectPanel(page, 'loadout');
    expect((await measurement(page)).menu).toMatchObject({ panel: 'loadout', committed: true, settled: false });

    // Do not force showMenu or wait for art: Escape and the visible Home
    // action navigate while the original physical atlas is still withheld.
    await press(page, 'Escape');
    await expectPanel(page, 'home');
    await clickMenuButton(page, 'Settings', Boolean(testInfo.project.use.hasTouch));
    await expectPanel(page, 'settings');
    expect((await measurement(page)).menu?.settled).toBe(false);
    const original = page.viewportSize()!;
    if (testInfo.project.use.hasTouch) {
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
      await expectPanel(page, 'settings');
      await page.setViewportSize(original);
      await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
    } else {
      await page.setViewportSize({ width: 360, height: 640 });
      await expectPanel(page, 'settings');
      await page.setViewportSize(original);
    }
    await expectPanel(page, 'settings');
    afterNavigation = (await measurement(page)).events.length;
  } finally { releaseArt(); }

  await settle(page, 'settings');
  expect(await presentation(page)).toMatchObject({ committedPanel: 'settings', committedDisplay: true,
    menuTextureLoadPending: 0, pendingPanelArtIds: 0, pendingPanelArtRepaints: 0, pendingGunsmithArtIds: 0 });
  const snapshot = await measurement(page);
  expectBounded(snapshot);
  const renders = snapshot.events.filter(event => event.owner === 'menu.render');
  expect(renders).toEqual(expect.arrayContaining([
    expect.objectContaining({ facts: expect.objectContaining({ panel: 'loadout', reason: 'panel-transition', committed: true }) }),
    expect.objectContaining({ facts: expect.objectContaining({ panel: 'settings', reason: 'panel-transition', committed: true }) }),
    expect.objectContaining({ facts: expect.objectContaining({ panel: 'settings', reason: 'viewport-resize', committed: true }) }),
  ]));
  const reasons = new Set(['initial-mount', 'panel-transition', 'same-panel-state-mutation', 'viewport-resize', 'lazy-art-hydration']);
  expect(renders.every(event => reasons.has(String(event.facts.reason)))).toBe(true);
  expect(snapshot.events.slice(afterNavigation).some(event => event.owner === 'menu.render'
    && event.facts.panel === 'loadout')).toBe(false);
  expect(snapshot.events.some(event => event.owner === 'resource.load'
    && (event.facts.resourceIds as readonly string[]).includes('resource:figma-menu-chrome')
    && event.facts.failed === 0)).toBe(true);
});
