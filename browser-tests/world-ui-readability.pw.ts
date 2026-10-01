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
  placePlayerForArenaFraming(x: number, y: number): boolean;
  arenaFramingDiagnostics(): Framing | undefined;
  captureArenaReadability(): Promise<Readability | undefined>;
  showRunSummary(outcome: 'won' | 'lost'): boolean;
};
declare global { var __MEOWCENARY_VISUAL_TEST__: Seam | undefined; }

test('world actor remains distinguishable beneath HUD meters and corner controls', async ({ page }, testInfo) => {
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  await page.keyboard.down('Enter');
  await expect.poll(() => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
  await page.keyboard.up('Enter');
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
    const framing = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
    const readability = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.captureArenaReadability());
    expect(readability).toBeDefined();
    const { reference, actual, ...numbers } = readability!;
    for (const [label, image] of [['reference', reference], ['actual', actual]]) {
      const path = testInfo.outputPath(`${position}-${label}.png`);
      await writeFile(path, Buffer.from(image.split(',')[1], 'base64'));
      await testInfo.attach(`${position}-${label}`, { path, contentType: 'image/png' });
    }
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
  for (const observation of observations) {
    expect(observation.readability.actorPixels, `${observation.position}: nonempty identical-pose actor reference`).toBeGreaterThan(20);
    // At least the majority of the actor's rendered contrast must survive UI
    // paint. This catches opaque meters/controls and compounded translucent
    // plates; it is a regression bound, not subjective visual approval.
    expect(observation.readability.retainedContribution, `${observation.position}: actor contrast retained under UI`).toBeGreaterThanOrEqual(0.6);
  }
});

test('a stopped GameScene cannot repaint an old HUD during Menu resize', async ({ page }) => {
  const frames = () => page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const press = async (key: string) => {
    await page.keyboard.down(key);
    await frames();
    await page.keyboard.up(key);
    await frames();
  };
  const launch = async () => {
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    await page.keyboard.down('Enter');
    await expect.poll(() => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(true);
    await page.keyboard.up('Enter');
    await frames();
  };
  const plateCount = () => page.evaluate(() => {
    const state = globalThis.__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics() as
      (Framing & { hudLayers: Array<{ type: string }> }) | undefined;
    return state?.hudLayers.filter((layer) => layer.type === 'Rectangle' || layer.type === 'NineSlice').length;
  });
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  const viewport = page.viewportSize()!;
  await launch();
  expect(await plateCount()).toBe(2);
  for (let visit = 0; visit < 2; visit++) {
    // Only terminal content is a fixture. The shared Summary focus command,
    // Menu transition, shutdown, resize and second launch use production owners.
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
    await frames();
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');
    await expect.poll(() => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
    expect(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    const savedBeforeResize = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    await page.setViewportSize({ width: viewport.width + 8, height: viewport.height + 8 });
    await frames();
    await page.setViewportSize(viewport);
    await frames();
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(savedBeforeResize);
    await launch();
    // A leaked PhaserHudView resize subscription creates two extra plates in
    // the inactive scene, which then coexist with the next live HUD.
    expect(await plateCount()).toBe(2);
  }
});
