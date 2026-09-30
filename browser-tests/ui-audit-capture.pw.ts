import { expect, test } from '@playwright/test';

type VisualTestSeam = {
  showMenu(panel: string): boolean;
  isMenuPresentationSettled(): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  freeze(): Promise<void>;
  resume(): void;
};

const allPanels = [
  'home', 'stage', 'character', 'loadout', 'equipment', 'gunsmith',
  'career', 'next-goals', 'achievements', 'compendium', 'training', 'settings',
] as const;
test('locks every player-facing menu surface after the polish audit', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!['phone-390x844', 'foldable-1114x720', 'desktop-1280x720'].includes(testInfo.project.name));
  await page.goto('/?visual-test=1');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  for (const panel of allPanels) {
    await expect.poll(() => page.evaluate((target) => {
      const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.showMenu(target) ?? false;
    }, panel), { timeout: 20_000 }).toBe(true);
    const settled = await page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.waitForMenuPresentation() ?? false;
    });
    expect(settled).toBe(true);
    await page.waitForTimeout(200);
    await page.evaluate(async () => {
      const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam }).__MEOWCENARY_VISUAL_TEST__;
      await seam?.freeze();
    });
    await expect(page).toHaveScreenshot(`menu-${panel}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
      timeout: 20_000,
    });
    await page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam }).__MEOWCENARY_VISUAL_TEST__;
      seam?.resume();
    });
  }
});
