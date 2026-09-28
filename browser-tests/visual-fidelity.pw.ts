import { expect, test } from '@playwright/test';

type VisualTestSeam = {
  freeze(): void;
  resume(): void;
  isSceneActive(key: string): boolean;
  focusFirstEnemy(): boolean;
  showMenu(panel: string): boolean;
};

const representativeProjects = new Set([
  'phone-390x844',
  'foldable-1114x720',
  'desktop-1280x720',
]);

async function press(page: import('@playwright/test').Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function freezeAtStableFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    if (!seam) throw new Error('visual-test loop seam was not installed');
    seam.freeze();
  });
}

async function resumeLoop(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    if (!seam) throw new Error('visual-test loop seam was not installed');
    seam.resume();
  });
}

async function showMenu(page: import('@playwright/test').Page, panel: string): Promise<void> {
  await expect.poll(() => page.evaluate((targetPanel) => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.showMenu(targetPanel) ?? false;
  }, panel)).toBe(true);
  await page.waitForTimeout(250);
}

async function expectScene(page: import('@playwright/test').Page, key: string): Promise<void> {
  await expect.poll(() => page.evaluate((sceneKey) => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.isSceneActive(sceneKey) ?? false;
  }, key)).toBe(true);
}

test('approved reachable surfaces retain the Meowcenary visual system', async ({ page }, testInfo) => {
  test.skip(!representativeProjects.has(testInfo.project.name));
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));

  await page.goto('/?visual-test=1');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/ui-atlas.png'))).toBe(true);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('home.png', { animations: 'disabled' });

  await page.reload();
  await showMenu(page, 'character');
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/mercenary-portraits-atlas.png'))).toBe(true);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('mercenary.png', { animations: 'disabled' });
  await resumeLoop(page);
  for (let index = 0; index < 7; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('mercenary-lower.png', { animations: 'disabled' });

  await page.reload();
  await showMenu(page, 'stage');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('contract-selection.png', { animations: 'disabled' });

  await page.reload();
  await showMenu(page, 'achievements');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('achievements.png', { animations: 'disabled' });

  await page.reload();
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await resumeLoop(page);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/scrap-tabby.png'))).toBe(true);
  await page.waitForTimeout(2_200);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('gameplay.png', { animations: 'disabled' });
});

test('boss gameplay keeps the approved boss-scale visual hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => {
    const completed = Object.fromEntries(
      ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04']
        .map((id) => [id, { completed: true, bestTimeMs: 60_000 }]),
    );
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] },
      stages: completed,
      achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await resumeLoop(page);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/boss-crusher.png'))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusFirstEnemy() ?? false;
  })).toBe(true);
  await page.waitForTimeout(250);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('boss-gameplay.png', { animations: 'disabled' });
});

test('compendium exposes the complete runtime enemy art roster', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => {
    const enemyIds = [
      'dust-mite', 'junk-rusher', 'trash-brute', 'scrap-sniper',
      'scrap-skitter', 'bastion-beetle', 'junk-nester', 'shard-bot',
      'boss-crusher', 'boss-forge',
    ];
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] },
      stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {},
      compendium: Object.fromEntries(enemyIds.map((id) => [id, 'defeated'])),
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  await page.goto('/?visual-test=1');
  await showMenu(page, 'compendium');
  await page.waitForTimeout(750);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium.png', { animations: 'disabled' });
  await resumeLoop(page);
  for (let index = 0; index < 5; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium-middle.png', { animations: 'disabled' });
  await resumeLoop(page);
  for (let index = 0; index < 4; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium-lower.png', { animations: 'disabled' });
});
