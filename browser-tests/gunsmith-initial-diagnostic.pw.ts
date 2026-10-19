import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

type Diagnostic = {
  panel: string;
  focusedKey?: string;
  copy: string[];
  copyBounds: Array<{ text: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
  scroll?: { top: number; bottom: number; offset: number; contentHeight: number; rectangle?: unknown };
  buttons: Array<{ key?: string; focused: boolean; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
};

type Seam = {
  showMenu(panel: string): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>;
  menuLoadoutDiagnostics(): Diagnostic;
  freeze(): Promise<void>;
  resume(): void;
};

type Event = { owner: string; facts: Record<string, string | number | boolean | readonly string[]> };
type PerformanceSnapshot = {
  events: Event[];
  presentedMenu?: { panel: string; rebuildCount: number; revision: number };
};
type Globals = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__: Seam;
  __MEOWCENARY_PERFORMANCE__: { resetMeasurement(): void; snapshot(): PerformanceSnapshot };
};

const save = {
  version: 4,
  settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
  progression: { scrap: 640, unlocks: [] },
  stages: Object.fromEntries(['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04', 'stage:junkyard-05']
    .map((id) => [id, { completed: true, bestTimeMs: 60_000 }])),
  achievements: {}, achievementMetrics: {}, characters: {},
  gunsmith: {
    builds: [{ id: 'build:pistol', name: 'Junkyard Spark', baseWeaponFamily: 'pistol',
      fitted: { receiver: 'owned:receiver-heavy:1', barrel: 'owned:barrel-piercing:1', optic: 'owned:optic-red-dot:1', trigger: 'owned:trigger-hair:1' },
      traitParts: ['owned:trait-fire:1'] }],
    selectedBuildId: 'build:pistol',
    parts: {
      'owned:receiver-heavy:1': { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
      'owned:barrel-piercing:1': { partId: 'part:barrel-piercing', tier: 2, infusedTraits: [] },
      'owned:optic-red-dot:1': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
      'owned:trigger-hair:1': { partId: 'part:trigger-hair', tier: 1, infusedTraits: [] },
      'owned:trait-fire:1': { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
      'owned:receiver-compact:1': { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      'owned:receiver-compact:2': { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
    },
    fabricationSerials: { 'part:receiver-compact': 2 },
  },
  equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
  pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
};

function assertPrefix(diagnostic: Diagnostic): void {
  const heading = diagnostic.copyBounds.find((entry) => entry.text === 'ACTIVE BUILD / ENGINEERED FAMILY');
  expect(diagnostic.scroll?.offset).toBe(0);
  expect(heading?.visible).toBe(true);
  expect(heading?.bounds.y).toBeGreaterThanOrEqual(diagnostic.scroll?.top ?? Number.POSITIVE_INFINITY);
  expect((heading?.bounds.y ?? 0) + (heading?.bounds.height ?? 0)).toBeLessThanOrEqual(diagnostic.scroll?.bottom ?? 0);
}

async function checkpoint(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const globals = globalThis as Globals;
    return {
      diagnostic: globals.__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics(),
      perf: globals.__MEOWCENARY_PERFORMANCE__.snapshot(),
    };
  });
}

test('preserves the Gunsmith prefix across held late art hydration and nonzero scroll', async ({ page }, testInfo) => {
  await page.addInitScript((value) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(value)), save);
  let releaseChrome!: () => void;
  const chromeHeld = new Promise<void>(resolve => { releaseChrome = resolve; });
  let chromeRequested = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const output = testInfo.outputDir;
  const capture = async (name: string) => {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/${name}.png`, scale: 'css' });
  };
  try {
    await page.goto('/?visual-test=1&perf-test=1');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    const waitForMenuPresentation = () => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation());
    const showMenu = (panel: string) => page.evaluate((target) => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu(target), panel);
    await expect.poll(waitForMenuPresentation).toBe(true);
    await page.route('**/assets/ui/figma/figma-menu-chrome.png', async route => {
      chromeRequested += 1;
      await chromeHeld;
      await route.continue();
    });
    await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_PERFORMANCE__.resetMeasurement());
    expect(await showMenu('gunsmith')).toBe(true);
    await expect.poll(() => chromeRequested).toBe(1);
    await expect.poll(async () => {
      const snapshot = await checkpoint(page);
      return snapshot.perf.events.some(event => event.owner === 'menu.render'
        && event.facts.reason === 'panel-transition' && event.facts.committed === true);
    }).toBe(true);
    const held = await checkpoint(page);
    assertPrefix(held.diagnostic);
    expect(held.perf.events.filter(event => event.owner === 'menu.render'
      && event.facts.reason === 'lazy-art-hydration')).toHaveLength(0);
    await capture('gunsmith-held-before-hydration');

    releaseChrome();
    await expect.poll(waitForMenuPresentation).toBe(true);
    await expect.poll(async () => {
      const snapshot = await checkpoint(page);
      return snapshot.perf.events.some(event => event.owner === 'menu.render'
        && event.facts.reason === 'lazy-art-hydration' && event.facts.committed === true);
    }).toBe(true);
    const hydrated = await checkpoint(page);
    const hydrationRenders = hydrated.perf.events.filter(event => event.owner === 'menu.render'
      && event.facts.reason === 'lazy-art-hydration');
    expect(hydrationRenders.length).toBeGreaterThanOrEqual(1);
    expect(hydrationRenders.every(event => event.facts.committed === true)).toBe(true);
    const lastHydration = hydrationRenders.at(-1)!;
    expect(hydrated.perf.presentedMenu?.panel).toBe('gunsmith');
    expect(hydrated.perf.presentedMenu?.revision).toBe(lastHydration.facts.revision);
    assertPrefix(hydrated.diagnostic);
    await capture('gunsmith-after-hydration');

    const scroll = hydrated.diagnostic.scroll!;
    await page.mouse.move(page.viewportSize()!.width / 2, (scroll.top + scroll.bottom) / 2);
    // Entering the collection can legitimately admit pointer hover on a
    // focusable row. Wheel ownership begins from that observed focus.
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
    const hovered = await checkpoint(page);
    expect(hovered.diagnostic.focusedKey).toBeDefined();
    await page.mouse.wheel(0, 9000);
    await expect.poll(async () => (await checkpoint(page)).diagnostic.scroll!.offset).toBeGreaterThan(0);
    const scrolled = await checkpoint(page);
    expect(scrolled.diagnostic.focusedKey).toBe(hovered.diagnostic.focusedKey);
    expect(scrolled.diagnostic.scroll!.offset).toBeGreaterThan(0);
    await capture('gunsmith-nonzero-scroll');

    expect(await showMenu('gunsmith')).toBe(true);
    await expect.poll(waitForMenuPresentation).toBe(true);
    const rebuilt = await checkpoint(page);
    expect(rebuilt.diagnostic.focusedKey).toBe(scrolled.diagnostic.focusedKey);
    expect(rebuilt.diagnostic.scroll!.offset).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    console.log(`GUNSMITH_HYDRATION ${JSON.stringify({ project: testInfo.project.name,
      hydrationRenders: hydrationRenders.length, heldOffset: held.diagnostic.scroll?.offset,
      hydratedOffset: hydrated.diagnostic.scroll?.offset, scrolledOffset: scrolled.diagnostic.scroll?.offset,
      rebuiltOffset: rebuilt.diagnostic.scroll?.offset, output })}`);
  } finally {
    releaseChrome();
  }
});
