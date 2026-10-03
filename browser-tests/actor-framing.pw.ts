import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type Rect = { x: number; y: number; width: number; height: number };
type Diagnostic = {
  loop: { frame: number; actualFps: number };
  rootRect: Rect;
  canvas: { width: number; height: number; rect: Rect };
  scale: { width: number; height: number };
  camera: { viewport: Rect; zoom: number; scroll: { x: number; y: number }; bounds: Rect; roundPixels: boolean };
  arena: { width: number; height: number };
  physicsBounds: Rect;
  overscanBounds: Rect;
  overscanResource: { width: number; height: number; canvasWidth: number; canvasHeight: number };
  player: { x: number; y: number; bodyRadius: number; presentationBounds: Rect; screenBounds: Rect;
    layers: Array<{ type: string; worldBounds: Rect; screenBounds: Rect }> };
};
type VisualSeam = {
  useAuthoredArenaArtReference(): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  waitForPreparedGame(): Promise<boolean>;
  placePlayerForArenaFraming(x: number, y: number): boolean;
  arenaFramingDiagnostics(): Diagnostic | undefined;
};

// Keep this seam local to avoid merging incompatible visual-test declarations
// from the other browser specs into globalThis.
const getSeam = (page: Page) => page.evaluate(() => (globalThis as typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
}).__MEOWCENARY_VISUAL_TEST__);

async function enterPreparedGame(page: Page): Promise<void> {
  await page.goto('/?visual-test=1');
  await expect.poll(async () => Boolean(await getSeam(page))).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  await page.keyboard.down('Enter');
  try {
    expect(await page.evaluate(() => (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
    }).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  } finally {
    await page.keyboard.up('Enter');
  }
}

function expectedScroll(target: number, viewportSize: number, start: number, extent: number, zoom: number): number {
  const visible = viewportSize / zoom;
  const min = start + (visible - viewportSize) / 2;
  const max = Math.max(min, min + extent - visible);
  return Math.min(Math.max(target - viewportSize / 2, min), max);
}

async function placeAndSettle(page: Page, x: number, y: number): Promise<Diagnostic> {
  expect(await page.evaluate(({ x, y }) => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.placePlayerForArenaFraming(x, y), { x, y })).toBe(true);
  const observations: unknown[] = [];
  try {
    await expect.poll(async () => {
    const state = await page.evaluate(() => (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
    }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
    if (!state) return false;
    const wantX = expectedScroll(x, state.camera.viewport.width, state.camera.bounds.x, state.camera.bounds.width, state.camera.zoom);
    const wantY = expectedScroll(y, state.camera.viewport.height, state.camera.bounds.y, state.camera.bounds.height, state.camera.zoom);
    observations.push({ loop: state.loop, player: { x: state.player.x, y: state.player.y }, scroll: state.camera.scroll, wantX, wantY });
    const edgeX = x === state.player.bodyRadius || x === state.arena.width - state.player.bodyRadius;
    const edgeY = y === state.player.bodyRadius || y === state.arena.height - state.player.bodyRadius;
    const bounds = state.player.screenBounds;
    // Verify the physical edge's clamp. On the orthogonal axis, observe the
    // full actor entering the view, rather than requiring its smooth follow
    // to converge to the centre after an artificial cross-arena teleport.
    const readyX = edgeX ? Math.abs(state.camera.scroll.x - wantX) < 0.5
      : bounds.x >= -0.5 && bounds.x + bounds.width <= state.canvas.rect.width + 0.5;
    const readyY = edgeY ? Math.abs(state.camera.scroll.y - wantY) < 0.5
      : bounds.y >= -0.5 && bounds.y + bounds.height <= state.canvas.rect.height + 0.5;
    return readyX && readyY;
    }).toBe(true);
  } catch (error) {
    await saveFacts(test.info(), 'failed-follow-observations.json', { requested: { x, y }, observations });
    throw error;
  }
  const diagnostic = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
  expect(diagnostic).toBeDefined();
  return diagnostic!;
}

function assertAuthoredBounds(diagnostic: Diagnostic): void {
  expect(diagnostic.player.bodyRadius).toBe(14);
  expect(diagnostic.camera.roundPixels).toBe(false);
  expect(diagnostic.physicsBounds).toEqual({ x: 0, y: 0, ...diagnostic.arena });
  const floor = diagnostic.overscanBounds;
  const camera = diagnostic.camera.bounds;
  expect(floor.x).toBeLessThanOrEqual(camera.x);
  expect(floor.y).toBeLessThanOrEqual(camera.y);
  expect(floor.x + floor.width).toBeGreaterThanOrEqual(camera.x + camera.width);
  expect(floor.y + floor.height).toBeGreaterThanOrEqual(camera.y + camera.height);
  expect(Number.isInteger(diagnostic.overscanResource.width)).toBe(true);
  expect(Number.isInteger(diagnostic.overscanResource.height)).toBe(true);
  expect(diagnostic.overscanResource.canvasWidth).toBe(diagnostic.overscanResource.width);
  expect(diagnostic.overscanResource.canvasHeight).toBe(diagnostic.overscanResource.height);
  expect(diagnostic.rootRect).toEqual({ x: 0, y: 0, width: diagnostic.canvas.rect.width, height: diagnostic.canvas.rect.height });
  expect(diagnostic.canvas.rect).toEqual(diagnostic.rootRect);
}

function expectWholeActorContained(diagnostic: Diagnostic, label: string): void {
  expect(diagnostic.player.layers.map((layer) => layer.type)).toEqual(['Sprite', 'Arc']);
  for (const bounds of [diagnostic.player.screenBounds, ...diagnostic.player.layers.map((layer) => layer.screenBounds)]) {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const width = diagnostic.canvas.rect.width;
    const height = diagnostic.canvas.rect.height;
    // The actual camera matrix is used by the seam; allow only half a CSS pixel
    // for fractional rasterization at the canvas edge.
    expect(bounds.x, `${label}: actor left`).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.y, `${label}: actor top`).toBeGreaterThanOrEqual(-0.5);
    expect(right, `${label}: actor right`).toBeLessThanOrEqual(width + 0.5);
    expect(bottom, `${label}: actor bottom`).toBeLessThanOrEqual(height + 0.5);
  }
}

async function saveFacts(testInfo: TestInfo, filename: string, facts: unknown): Promise<void> {
  const path = testInfo.outputPath(filename);
  await writeFile(path, JSON.stringify(facts, null, 2));
  await testInfo.attach(filename, { path, contentType: 'application/json' });
}

test('the complete actor presentation bounds fit at every arena perimeter position', async ({ page }, testInfo) => {
  await enterPreparedGame(page);
  const initial = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
  expect(initial).toBeDefined();
  // Fixed art-reference normalization must reject a live gameplay scene and
  // preserve its actual runtime camera; these edge tests never pose art.
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.useAuthoredArenaArtReference())).toBe(false);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics()?.camera.bounds)).toEqual(initial!.camera.bounds);
  const { width, height } = initial!.arena;
  const edge = initial!.player.bodyRadius;
  const positions = [
    ['top-centre', width / 2, edge],
    ['top-left', edge, edge],
    ['top-right', width - edge, edge],
    ['left-centre', edge, height / 2],
    ['right-centre', width - edge, height / 2],
    ['bottom-centre', width / 2, height - edge],
    ['bottom-left', edge, height - edge],
    ['bottom-right', width - edge, height - edge],
  ] as const;
  const facts: Array<{ position: string; diagnostic: Diagnostic }> = [];
  for (const [position, x, y] of positions) {
    const diagnostic = await placeAndSettle(page, x, y);
    assertAuthoredBounds(diagnostic);
    facts.push({ position, diagnostic });
    if (position === 'top-centre') {
      await page.screenshot({ path: testInfo.outputPath('actor-framing-top-centre.png') });
      await testInfo.attach('actor-framing-top-centre', {
        path: testInfo.outputPath('actor-framing-top-centre.png'), contentType: 'image/png',
      });
    }
  }
  await saveFacts(testInfo, 'actor-framing-perimeter.json', facts);
  for (const { position, diagnostic } of facts) expectWholeActorContained(diagnostic, position);
});

test('actor bounds remain stable after a viewport resize and restoration', async ({ page }, testInfo) => {
  await enterPreparedGame(page);
  const originalViewport = page.viewportSize()!;
  const initial = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
  expect(initial).toBeDefined();
  const x = initial!.arena.width / 2;
  const y = initial!.player.bodyRadius;
  const created = await placeAndSettle(page, x, y);
  assertAuthoredBounds(created);

  // Exercise the landscape lifecycle boundary, then restore the original
  // viewport before comparing the same pose and presentation bounds.
  await page.setViewportSize({ width: 844, height: 390 });
  if (testInfo.project.use.hasTouch) await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
  else await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  await expect.poll(async () => (await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics()))?.scale).toEqual({ width: 844, height: 390 });
  const landscape = await placeAndSettle(page, x, y);
  assertAuthoredBounds(landscape);
  await page.setViewportSize(originalViewport);
  await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  await expect.poll(async () => (await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: VisualSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics()))?.scale).toEqual(originalViewport);
  const restored = await placeAndSettle(page, x, y);
  assertAuthoredBounds(restored);
  await saveFacts(testInfo, 'actor-framing-resize.json', { created, landscape, restored });
  expectWholeActorContained(created, 'created');
  expectWholeActorContained(landscape, 'landscape resize');
  expectWholeActorContained(restored, 'restored viewport');
  expect(restored.player.screenBounds).toEqual(created.player.screenBounds);
  expect(restored.player.presentationBounds).toEqual(created.player.presentationBounds);
});
