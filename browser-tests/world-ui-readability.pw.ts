import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { completeRunStartIntro, type IntroDiagnostics } from './run-start-helpers';

type Rect = { x: number; y: number; width: number; height: number };
type Framing = {
  arena: { width: number; height: number };
  player: { x: number; y: number; bodyRadius: number };
  camera: { bounds: Rect; viewport: Rect; scroll: { x: number; y: number }; zoom: number; worldView: Rect; roundPixels: boolean };
  rootRect: Rect;
  canvas: { rect: Rect };
};
type Readability = {
  timings: Record<string, number>;
  actorAlpha: number;
  actorPixels: number;
  referenceEnergy: number;
  actualEnergy: number;
  retainedContribution: number;
  reference: string;
  actual: string;
};
type Seam = {
  waitForMenuPresentation(): Promise<boolean>;
  isSceneActive(key: string): boolean;
  waitForPreparedGame(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>;
  isMenuInputNeutral(): boolean;
  stopPreparingMenu(): boolean;
  placePlayerForArenaFraming(x: number, y: number): boolean;
  arenaFramingDiagnostics(): Framing | undefined;
  captureArenaReadability(): Promise<Readability | undefined>;
  summaryMenuTarget(): Readonly<{ x: number; y: number }> | undefined;
  showRunSummary(outcome: 'won' | 'lost'): boolean;
  runStartIntroDiagnostics(): IntroDiagnostics | undefined;
};
declare global { var __MEOWCENARY_VISUAL_TEST__: Seam | undefined; }

type PositionObservation = {
  accepted: boolean;
  settled: boolean;
  framing?: Framing;
};

async function observeArenaPosition(page: Page, x: number, y: number, place: boolean): Promise<PositionObservation> {
  return page.evaluate(({ x, y, place }): PositionObservation => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    if (!seam || (place && seam.placePlayerForArenaFraming(x, y) !== true)) {
      return { accepted: false, settled: false };
    }
    const framing = seam.arenaFramingDiagnostics();
    if (!framing) return { accepted: false, settled: false };

    // Keep the original floating-scroll predicate. Phaser 3.90 rounds
    // worldView even when render roundPixels=false, so settle on real scroll.
    const sx = (framing.player.x - framing.camera.worldView.x) * framing.camera.zoom;
    const sy = (framing.player.y - framing.camera.worldView.y) * framing.camera.zoom;
    const expectedScroll = (target: number, size: number, start: number, extent: number) => {
      const visible = size / framing.camera.zoom;
      const min = start + (visible - size) / 2;
      const max = Math.max(min, min + extent - visible);
      return Math.min(Math.max(target - size / 2, min), max);
    };
    const targetX = expectedScroll(x, framing.camera.viewport.width, framing.camera.bounds.x, framing.camera.bounds.width);
    const targetY = expectedScroll(y, framing.camera.viewport.height, framing.camera.bounds.y, framing.camera.bounds.height);
    const settled = Math.abs(framing.camera.scroll.x - targetX) < 0.5
      && Math.abs(framing.camera.scroll.y - targetY) < 0.5 && sx >= 0 && sy >= 0;
    return { accepted: true, settled, framing };
  }, { x, y, place });
}

async function captureArenaPosition(page: Page): Promise<{ framing?: Framing; readability?: Readability; encodes: number }> {
  return page.evaluate(async (): Promise<{ framing?: Framing; readability?: Readability; encodes: number }> => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    const framing = seam?.arenaFramingDiagnostics();
    if (!seam || !framing) return { encodes: 0 };
    // Keep all four contrast readbacks in one evaluation after the original
    // camera-settle poll. Only the two oracle artifacts need PNG encoding.
    const original = HTMLCanvasElement.prototype.toDataURL;
    let encodes = 0;
    HTMLCanvasElement.prototype.toDataURL = function (...args) { encodes++; return original.apply(this, args); };
    try {
      return { framing, readability: await seam.captureArenaReadability(), encodes };
    } finally {
      HTMLCanvasElement.prototype.toDataURL = original;
    }
  });
}

async function observeMenuReady(page: Page): Promise<{ ready: boolean; neutral: boolean }> {
  return page.evaluate(async () => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    if (!seam) return { ready: false, neutral: false };
    const ready = await seam.waitForMenuPresentation();
    return { ready, neutral: ready && seam.isMenuInputNeutral() };
  });
}

async function observeInputFrameAndIntro(page: Page): Promise<{ frame: boolean; intro?: IntroDiagnostics }> {
  return page.evaluate(async () => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    if (!seam || await seam.waitForInputFrame() !== true) return { frame: false };
    return { frame: true, intro: seam.runStartIntroDiagnostics() };
  });
}

async function observeSummaryTarget(page: Page, outcome: 'won' | 'lost'): Promise<{ accepted: boolean; target?: { x: number; y: number } }> {
  return page.evaluate(async (outcome) => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    if (!seam || seam.showRunSummary(outcome) !== true || await seam.waitForInputFrame() !== true) return { accepted: false };
    const target = seam.summaryMenuTarget();
    return target ? { accepted: true, target } : { accepted: false };
  }, outcome);
}

async function observeMenuStorage(page: Page): Promise<{ ready: boolean; storage?: string }> {
  return page.evaluate(async () => {
    const seam = globalThis.__MEOWCENARY_VISUAL_TEST__;
    if (!seam || await seam.waitForMenuPresentation() !== true) return { ready: false };
    return { ready: true, storage: JSON.stringify(Object.entries(localStorage).sort()) };
  });
}

async function observeTwoFramesAndStorage(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(JSON.stringify(Object.entries(localStorage).sort()))))));
}

test.afterEach(async ({}, testInfo) => { console.log(`[world-ui] afterEach entered: ${testInfo.title} (${testInfo.duration}ms, ${testInfo.status})`); });

test('world actor remains distinguishable beneath HUD meters and corner controls', async ({ page }, testInfo) => {
  const started = performance.now();
  const mark = (phase: string) => console.log(`[world-ui] ${phase}: ${Math.round(performance.now() - started)}ms`);
  mark('start');
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  await page.keyboard.down('Enter');
  try {
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  } finally {
    await page.keyboard.up('Enter');
  }
  await completeRunStartIntro(page, 'keyboard');
  mark('prepared game');
  const initial = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
  expect(initial).toBeDefined();
  const { width, height } = initial!.arena;
  const radius = initial!.player.bodyRadius;
  const positions = [
    ['top-centre', width / 2, radius],
    ['top-left', radius, radius],
    ['top-right', width - radius, radius],
    ['bottom-left', radius, height - radius],
    ['bottom-right', width - radius, height - radius],
  ] as const;
  const observations: Array<{ position: string; framing: Framing; readability: Omit<Readability, 'reference' | 'actual'> }> = [];
  for (const [position, x, y] of positions) {
    let sample = await observeArenaPosition(page, x, y, true);
    expect(sample.accepted).toBe(true);
    if (!sample.settled) {
      await expect.poll(async () => {
        sample = await observeArenaPosition(page, x, y, false);
        return sample.settled;
      }).toBe(true);
    }
    mark(`${position} settled`);
    const capture = await captureArenaPosition(page);
    const { readability, framing } = capture;
    mark(`${position} captured ${JSON.stringify(readability?.timings)}`);
    // Only the two returned artifacts need PNG encoding. Four complete pixel
    // readbacks still define the oracle; unused full-HD exports are waste.
    expect(capture.encodes).toBe(2);
    expect(readability).toBeDefined();
    const { reference, actual, ...numbers } = readability!;
    for (const [label, image] of [['reference', reference], ['actual', actual]]) {
      const path = testInfo.outputPath(`${position}-${label}.png`);
      await writeFile(path, Buffer.from(image.split(',')[1], 'base64'));
      await testInfo.attach(`${position}-${label}`, { path, contentType: 'image/png' });
    }
    mark(`${position} artifacts attached`);
    observations.push({ position, framing: framing!, readability: numbers });
    expect(framing!.canvas.rect).toEqual(framing!.rootRect);
    expect(framing!.camera.bounds).toEqual(initial!.camera.bounds);
    expect(framing!.camera.zoom).toBe(initial!.camera.zoom);
    expect(framing!.camera.roundPixels).toBe(false);
    for (const axis of ['x', 'y'] as const) {
      const size = axis === 'x' ? framing!.camera.viewport.width : framing!.camera.viewport.height;
      const displaySize = Math.floor(size / framing!.camera.zoom + 0.5);
      expect(framing!.camera.worldView[axis]).toBe(Math.floor(framing!.camera.scroll[axis] + size / 2 - displaySize / 2 + 0.5));
    }
    expect(framing!.arena).toEqual(initial!.arena);
    expect(framing!.player.bodyRadius).toBe(radius);
  }
  const factsPath = testInfo.outputPath('world-readability-facts.json');
  await writeFile(factsPath, JSON.stringify(observations, null, 2));
  await testInfo.attach('world-readability-facts', { path: factsPath, contentType: 'application/json' });
  mark('facts attached');
  for (const observation of observations) {
    expect(observation.readability.actorPixels, `${observation.position}: nonempty identical-pose actor reference`).toBeGreaterThan(20);
    // At least the majority of the actor's rendered contrast must survive UI
    // paint. This catches opaque meters/controls and compounded translucent
    // plates; it is a regression bound, not subjective visual approval.
    expect(observation.readability.retainedContribution, `${observation.position}: actor contrast retained under UI`).toBeGreaterThanOrEqual(0.6);
  }
  mark('all contrast assertions passed');
});

test('a stopped GameScene cannot repaint an old HUD during Menu resize', async ({ page }) => {
  const inputFrame = async () => expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
  const plateCount = () => page.evaluate(() => {
    const state = globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics() as
      (Framing & { hudLayers: Array<{ type: string }> }) | undefined;
    return state?.hudLayers.filter((layer) => layer.type === 'Rectangle' || layer.type === 'NineSlice').length;
  });
  let mark = (_phase: string): void => {};
  const launch = async (begin = true) => {
    mark('launch start');
    const menu = await observeMenuReady(page);
    expect(menu.ready).toBe(true);
    expect(menu.neutral).toBe(true);
    await page.keyboard.down('Enter');
    try {
      expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
    } finally {
      await page.keyboard.up('Enter');
    }
    if (begin) {
      await inputFrame();
      await completeRunStartIntro(page, 'keyboard');
    } else {
      const observation = await observeInputFrameAndIntro(page);
      expect(observation.frame).toBe(true);
      expect(observation.intro).toMatchObject({ visible: true, status: 'intro', timeMs: 0 });
    }
    mark('launch complete');
  };
  const started = performance.now();
  mark = (phase: string) => console.log(`[world-ui] ${phase}: ${Math.round(performance.now() - started)}ms`);
  mark('start');
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  const viewport = page.viewportSize()!;
  await launch();
  expect(await plateCount()).toBe(2);
  for (let visit = 0; visit < 2; visit++) {
    // Only terminal content is a fixture. Activate the rendered Main Menu
    // action through real touch/pointer input. Focus-arrow traversal is covered
    // by the Summary input tests; this regression owns HUD lifetime/resize.
    const summary = await observeSummaryTarget(page, 'lost');
    expect(summary.accepted).toBe(true);
    const target = summary.target;
    expect(target).toBeDefined();
    const size = page.viewportSize()!;
    expect(target!.x).toBeGreaterThan(0); expect(target!.x).toBeLessThan(size.width);
    expect(target!.y).toBeGreaterThan(0); expect(target!.y).toBeLessThan(size.height);
    if (test.info().project.use.hasTouch) await page.touchscreen.tap(target!.x, target!.y);
    else await page.mouse.click(target!.x, target!.y);
    await expect.poll(() => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
    const menu = await observeMenuStorage(page);
    expect(menu.ready).toBe(true);
    mark(`return ${visit} ready`);
    const savedBeforeResize = menu.storage;
    // One real Menu resize per return is sufficient to expose the stale
    // inactive HUD subscription. Balance the viewport across the two visits
    // rather than rebuilding every Menu twice before each warm launch.
    await page.setViewportSize(visit === 0
      ? { width: viewport.width + 8, height: viewport.height + 8 }
      : viewport);
    expect(await observeTwoFramesAndStorage(page)).toBe(savedBeforeResize);
    mark(`resize ${visit} complete`);
    // Both earlier runs still use real Start and both Menu returns/resizes run.
    await launch(visit === 0);
    // A leaked PhaserHudView resize subscription creates extra plates in the
    // inactive scene, so check after every fresh launch and its real input.
    expect(await plateCount()).toBe(2);
  }
});

test('prepared-game observation joins held run art before the real scene handoff', async ({ page }) => {
  let blockRun = false;
  let held = false;
  let release!: () => void;
  let requested!: (url: string) => void;
  const requestedAsset = new Promise<string>((resolve) => { requested = resolve; });
  const releaseAsset = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/assets/**', async (route) => {
    if (blockRun && !held) {
      held = true;
      requested(route.request().url());
      await releaseAsset;
    }
    await route.continue();
  });
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  blockRun = true;
  await page.keyboard.down('Enter');
  try {
    expect(new URL(await requestedAsset).pathname).toMatch(/^\/assets\//);
    const preparation = page.evaluate(async () => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame());
    let observed = false;
    const observation = preparation.then((value) => { observed = true; return value; });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(observed).toBe(false);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
    release();
    expect(await observation).toBe(true);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
  } finally {
    release();
    await page.keyboard.up('Enter');
  }
});

test('prepared-game observation cancels during held art without a late scene resurrection', async ({ page }) => {
  let blockRun = false;
  let held = false;
  let release!: () => void;
  let requested!: (url: string) => void;
  const requestedAsset = new Promise<string>((resolve) => { requested = resolve; });
  const releaseAsset = new Promise<void>((resolve) => { release = resolve; });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/assets/**', async (route) => {
    if (blockRun && !held) {
      held = true;
      requested(route.request().url());
      await releaseAsset;
    }
    await route.continue();
  });
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  blockRun = true;
  await page.keyboard.down('Enter');
  try {
    const heldUrl = await requestedAsset;
    const observation = page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame());
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.stopPreparingMenu())).toBe(true);
    // Cancellation must resolve while the old loader request is still held.
    // Joining only that promise would hang until the unchanged test budget.
    expect(await observation).toBe(false);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(false);
    const resumedResponse = page.waitForResponse((response) => response.url() === heldUrl);
    release();
    await resumedResponse;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.keyboard.up('Enter');
  }
});
