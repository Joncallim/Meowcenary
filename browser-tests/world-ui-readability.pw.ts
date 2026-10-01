import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type Rect = { x: number; y: number; width: number; height: number };
type Framing = {
  arena: { width: number; height: number };
  player: { x: number; y: number; bodyRadius: number };
  camera: { bounds: Rect; zoom: number; worldView: Rect; roundPixels: boolean };
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
      const targetX = Math.min(Math.max(x - state.camera.worldView.width / 2, state.camera.bounds.x), state.camera.bounds.x + state.camera.bounds.width - state.camera.worldView.width);
      const targetY = Math.min(Math.max(y - state.camera.worldView.height / 2, state.camera.bounds.y), state.camera.bounds.y + state.camera.bounds.height - state.camera.worldView.height);
      return Math.abs(state.camera.worldView.x - targetX) < 0.5 && Math.abs(state.camera.worldView.y - targetY) < 0.5 && sx >= 0 && sy >= 0;
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
