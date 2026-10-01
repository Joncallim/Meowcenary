import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

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
};
declare global { var __MEOWCENARY_VISUAL_TEST__: Seam | undefined; }

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
    expect(await page.evaluate(({ x, y }) => globalThis.__MEOWCENARY_VISUAL_TEST__!.placePlayerForArenaFraming(x, y), { x, y })).toBe(true);
    await expect.poll(async () => {
      const state = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
      if (!state) return false;
      const sx = (state.player.x - state.camera.worldView.x) * state.camera.zoom;
      const sy = (state.player.y - state.camera.worldView.y) * state.camera.zoom;
      // Phaser 3.90 rounds worldView even when render roundPixels=false.
      // Settle against the real floating scroll, not its integer descriptor:
      // 1114/1.25=891.2 otherwise yields an impossible half-pixel target.
      const expectedScroll = (target: number, size: number, start: number, extent: number) => {
        const visible = size / state.camera.zoom;
        const min = start + (visible - size) / 2;
        const max = Math.max(min, min + extent - visible);
        return Math.min(Math.max(target - size / 2, min), max);
      };
      const targetX = expectedScroll(x, state.camera.viewport.width, state.camera.bounds.x, state.camera.bounds.width);
      const targetY = expectedScroll(y, state.camera.viewport.height, state.camera.bounds.y, state.camera.bounds.height);
      return Math.abs(state.camera.scroll.x - targetX) < 0.5 && Math.abs(state.camera.scroll.y - targetY) < 0.5 && sx >= 0 && sy >= 0;
    }).toBe(true);
    mark(`${position} settled`);
    const capture = await page.evaluate(async () => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      let encodes = 0;
      HTMLCanvasElement.prototype.toDataURL = function (...args) { encodes++; return original.apply(this, args); };
      try {
        const framing = globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics();
        return { framing, readability: await globalThis.__MEOWCENARY_VISUAL_TEST__!.captureArenaReadability(), encodes };
      }
      finally { HTMLCanvasElement.prototype.toDataURL = original; }
    });
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
  const renderFrames = () => page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const inputFrame = async () => expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
  let mark = (_phase: string): void => {};
  const launch = async () => {
    mark('launch start');
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(true);
    await page.keyboard.down('Enter');
    try {
      expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
    } finally {
      await page.keyboard.up('Enter');
    }
    await inputFrame();
    mark('launch complete');
  };
  const plateCount = () => page.evaluate(() => {
    const state = globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics() as
      (Framing & { hudLayers: Array<{ type: string }> }) | undefined;
    return state?.hudLayers.filter((layer) => layer.type === 'Rectangle' || layer.type === 'NineSlice').length;
  });
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
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
    await inputFrame();
    const target = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.summaryMenuTarget());
    expect(target).toBeDefined();
    const size = page.viewportSize()!;
    expect(target!.x).toBeGreaterThan(0); expect(target!.x).toBeLessThan(size.width);
    expect(target!.y).toBeGreaterThan(0); expect(target!.y).toBeLessThan(size.height);
    if (test.info().project.use.hasTouch) await page.touchscreen.tap(target!.x, target!.y);
    else await page.mouse.click(target!.x, target!.y);
    await expect.poll(() => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    mark(`return ${visit} ready`);
    const savedBeforeResize = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    // One real Menu resize per return is sufficient to expose the stale
    // inactive HUD subscription. Balance the viewport across the two visits
    // rather than rebuilding every Menu twice before each warm launch.
    await page.setViewportSize(visit === 0
      ? { width: viewport.width + 8, height: viewport.height + 8 }
      : viewport);
    await renderFrames();
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(savedBeforeResize);
    mark(`resize ${visit} complete`);
    await launch();
    // A leaked PhaserHudView resize subscription creates two extra plates in
    // the inactive scene, which then coexist with the next live HUD.
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
