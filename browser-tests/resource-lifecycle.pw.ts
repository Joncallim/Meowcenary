import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { completeRunStartIntro } from './run-start-helpers';

type Button = { text: string; visible: boolean; interactive: boolean; bounds: { x: number; y: number; width: number; height: number } };
type EventFact = { owner: string; facts: Record<string, string | number | boolean | readonly string[]> };
type Seam = {
  waitForMenuPresentation(): Promise<boolean>;
  waitForPreparedGame(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>;
  isSceneActive(key: string): boolean;
  showRunSummary(outcome: 'won' | 'lost'): boolean;
  summaryMenuTarget(): { x: number; y: number } | undefined;
  menuLoadoutDiagnostics(): { buttons: Button[] };
};
type BrowserGlobals = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: Seam;
  __MEOWCENARY_PERFORMANCE__?: { snapshot(): { events: EventFact[] }; resetMeasurement(): void };
};

async function launchByRealInput(page: Page, testInfo: TestInfo): Promise<void> {
  const target = await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!
    .menuLoadoutDiagnostics().buttons.find(button => button.text === 'Play Contract'));
  expect(target, 'Home Play Contract action').toBeDefined();
  expect(target!.visible).toBe(true);
  expect(target!.interactive).toBe(true);
  const { x, y, width, height } = target!.bounds;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x + width / 2, y + height / 2);
  else await page.mouse.click(x + width / 2, y + height / 2);
}

async function launch(page: Page, testInfo: TestInfo): Promise<void> {
  await launchByRealInput(page, testInfo);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  await completeRunStartIntro(page, testInfo.project.use.hasTouch ? 'touch' : 'mouse');
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
}

async function waitForHome(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
}

function audioPaths(events: EventFact[]): string[] {
  return events.filter(event => event.owner === 'resource.audio').map(event => String(event.facts.requested));
}

test('cold Home publishes one hydration after its overlapping lazy-art closure drains', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto('/?visual-test=1&perf-test=1');
  await waitForHome(page);
  const events = await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_PERFORMANCE__!.snapshot().events);
  const homeRenders = events.filter(event => event.owner === 'menu.render' && event.facts.panel === 'home');
  expect(homeRenders.filter(event => event.facts.reason === 'initial-mount')).toHaveLength(1);
  expect(homeRenders.filter(event => event.facts.reason === 'lazy-art-hydration')).toHaveLength(1);
  expect(homeRenders.every(event => event.facts.committed === true)).toBe(true);
  expect(errors).toEqual([]);
});

test('Home loads only menu audio; real Play Contract waits for run audio without rerendering Menu', async ({ page }, testInfo) => {
  let releaseMusic!: () => void;
  let signalMusic!: () => void;
  const musicRequested = new Promise<void>(resolve => { signalMusic = resolve; });
  const held = new Promise<void>(resolve => { releaseMusic = resolve; });
  const requests: string[] = [];
  await page.route('**/assets/audio/*.wav', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path.endsWith('/music-run.wav')) {
      signalMusic();
      await held;
    }
    await route.continue();
  });
  try {
    await page.goto('/?visual-test=1&perf-test=1');
    await waitForHome(page);
    const probe = await page.evaluate(() => {
      const value = (globalThis as BrowserGlobals).__MEOWCENARY_PERFORMANCE__;
      if (!value) throw new Error('Performance probe is unavailable');
      value.resetMeasurement();
      return value.snapshot();
    });
    expect(probe.events).toEqual([]);
    const menuRequests = requests.filter(path => path.endsWith('.wav'));
    expect(menuRequests).toHaveLength(4);
    expect(menuRequests).toEqual(expect.arrayContaining([
      expect.stringMatching(/music-menu\.wav$/),
      expect.stringMatching(/sfx-ui-navigate\.wav$/),
      expect.stringMatching(/sfx-ui-confirm\.wav$/),
      expect.stringMatching(/sfx-ui-back\.wav$/),
    ]));
    expect(menuRequests.some(path => !/music-menu|sfx-ui-(navigate|confirm|back)\.wav$/.test(path))).toBe(false);

    await launchByRealInput(page, testInfo);
    await musicRequested;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const waiting = await page.evaluate(() => ({
      menu: (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'),
      game: (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'),
      events: (globalThis as BrowserGlobals).__MEOWCENARY_PERFORMANCE__!.snapshot().events,
    }));
    expect(waiting.menu).toBe(true);
    expect(waiting.game).toBe(false);
    // A launch owns one progress-modal rebuild. Audio progress mutates its
    // existing text and must not rebuild the full Menu on each file event.
    expect(waiting.events.filter(event => event.owner === 'menu.render')).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('delayed-run-audio.png') });
    releaseMusic();
    expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
    await completeRunStartIntro(page, testInfo.project.use.hasTouch ? 'touch' : 'mouse');
    expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
  } finally { releaseMusic(); }
});

test('optional audio failure remains playable and cached return/retry does not reload completed audio', async ({ page }, testInfo) => {
  let failOptionalRun = true;
  const requests = new Map<string, number>();
  await page.route('**/assets/audio/*.wav', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.set(path, (requests.get(path) ?? 0) + 1);
    if (failOptionalRun && path.endsWith('/sfx-weapon-fired.wav')) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.goto('/?visual-test=1&perf-test=1');
  await waitForHome(page);
  await launch(page, testInfo);
  const firstCounts = new Map(requests);
  // Phaser 3.90 retries a failed file twice by default; all three attempts fail
  // during this launch so we exercise actual optional-failure settlement.
  expect(firstCounts.get('/assets/audio/sfx-weapon-fired.wav')).toBe(3);
  failOptionalRun = false;
  expect([...firstCounts.keys()].filter(path => /\/(music-run|sfx-(?!ui-)[^/]+)\.wav$/.test(path)).length).toBe(17);

  const events = await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_PERFORMANCE__!.snapshot().events);
  expect(audioPaths(events)).toContain('17');
  expect(events.filter(event => event.owner === 'resource.audio').some(event => Number(event.facts.failed) > 0)).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
  const target = await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.summaryMenuTarget());
  expect(target).toBeDefined();
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(target!.x, target!.y);
  else await page.mouse.click(target!.x, target!.y);
  await waitForHome(page);
  await launch(page, testInfo);

  for (const [path, count] of firstCounts) {
    if (path.endsWith('/sfx-weapon-fired.wav')) continue; // The failed optional file was absent from Phaser's cache.
    expect(requests.get(path), `cached audio request count for ${path}`).toBe(count);
  }
  expect(requests.get('/assets/audio/sfx-weapon-fired.wav')).toBe(4);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
});
