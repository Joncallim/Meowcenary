import { expect, test } from '@playwright/test';

test('canvas fills the available viewport and survives a live resize', async ({ page }, testInfo) => {
  await page.goto('/');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  const viewport = page.viewportSize()!;
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  await page.setViewportSize({ width: Math.max(360, viewport.height), height: Math.max(640, viewport.width) });
  const resized = page.viewportSize()!;
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: resized.width, height: resized.height });
  await page.reload();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: resized.width, height: resized.height });
  await page.screenshot({ path: testInfo.outputPath('home-resized.png') });
});

test('keyboard player journey reaches Mercenary, Career and gameplay on the real canvas', async ({ page }, testInfo) => {
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  const press = async (key: string) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(60);
    await page.keyboard.up(key);
    await page.waitForTimeout(250);
  };
  const openHome = async () => {
    await page.goto('/');
    await page.waitForTimeout(500);
  };

  await openHome();
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();

  await press('ArrowDown');
  await press('ArrowDown');
  await press('Enter');
  await page.waitForTimeout(500);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/mercenary-portraits-atlas.png'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mercenary.png') });

  await openHome();
  for (let index = 0; index < 4; index += 1) await press('ArrowDown');
  await press('Enter');
  await press('ArrowDown');
  await press('Enter');
  await page.waitForTimeout(500);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/achievement-icons-atlas.png'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('achievements.png') });

  await openHome();
  await press('Enter');
  await page.waitForTimeout(1_500);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/mercenary-identity-icons-atlas.png'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gameplay.png') });
  await expect(canvas).toBeVisible();
});
