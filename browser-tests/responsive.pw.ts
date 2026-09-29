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
  test.setTimeout(60_000);
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
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-portraits-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mercenary.png') });

  await openHome();
  for (let index = 0; index < 3; index += 1) await press('ArrowDown');
  await press('Enter');
  await press('ArrowDown');
  await press('Enter');
  await page.waitForTimeout(500);
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/achievement-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('achievements.png') });

  await openHome();
  await press('Enter');
  await page.waitForTimeout(1_500);
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-identity-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gameplay.png') });
  await expect(canvas).toBeVisible();
});

test('phone touch starts a run, moves, and activates the graphical ability control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390x844');
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  // Home deliberately rejects actions while its cold art closure owns the
  // Phaser loader. The illustrated Home redesign moved the first action card
  // below the richer Contract hero, so tap its current safe center and prove
  // the touch reached GameScene rather than inferring launch from an art file
  // that Home itself now legitimately loads.
  await expect.poll(async () => {
    await page.touchscreen.tap(195, 282);
    return page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isSceneActive(key: string): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isSceneActive('GameScene') ?? false;
    });
  }, { intervals: [150, 250, 400], timeout: 8_000 }).toBe(true);
  expect(requestedAssets.some((path) => path.includes('/assets/'))).toBe(true);
  await page.waitForTimeout(1_000);

  // Sample static arena floor away from the animated player/effects. The
  // fixed-follow gameplay camera moves this texture only when the player
  // actually moves, so idle animation cannot satisfy the assertion.
  const floorClip = { x: 20, y: 180, width: 80, height: 80 };
  const idleFloorA = await page.screenshot({ clip: floorClip });
  await page.waitForTimeout(250);
  const idleFloorB = await page.screenshot({ clip: floorClip });
  expect(idleFloorB.equals(idleFloorA)).toBe(true);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: 40, y: 620, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: 120, y: 620, id: 1 }],
  });
  await page.waitForTimeout(250);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const movedFloor = await page.screenshot({ clip: floorClip });
  expect(movedFloor.equals(idleFloorB)).toBe(false);

  const abilityBefore = await page.screenshot({ clip: { x: 240, y: 750, width: 140, height: 84 } });
  await page.touchscreen.tap(320, 800);
  await page.waitForTimeout(100);
  const abilityAfter = await page.screenshot({ clip: { x: 240, y: 750, width: 140, height: 84 } });
  expect(abilityAfter.equals(abilityBefore)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('touch-gameplay.png') });
});

test('compact phone landscape is quarantined until portrait returns', async ({ browser }) => {
  const compact = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await compact.newPage();
  await page.goto('/');
  await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  await compact.close();
});

test('fine-pointer compact landscape keeps every sparse menu action visible', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  const compact = await browser.newContext({ viewport: { width: 844, height: 390 }, colorScheme: 'dark' });
  const page = await compact.newPage();
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: unknown;
  }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  const settled = async () => {
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isMenuPresentationSettled(): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isMenuPresentationSettled() ?? false;
    })).toBe(true);
    await page.waitForTimeout(150);
  };
  const show = async (panel: string) => {
    await expect.poll(() => page.evaluate((target) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { showMenu(panel: string): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.showMenu(target) ?? false;
    }, panel)).toBe(true);
    await settled();
  };

  await settled();
  await expect(page).toHaveScreenshot('compact-home.png', { animations: 'disabled' });
  await show('loadout');
  await expect(page).toHaveScreenshot('compact-loadout.png', { animations: 'disabled' });

  await show('career');
  await expect(page).toHaveScreenshot('compact-career.png', { animations: 'disabled' });
  await show('next-goals');
  await expect(page).toHaveScreenshot('compact-next-goals.png', { animations: 'disabled' });

  await show('settings');
  await expect(page).toHaveScreenshot('compact-settings.png', { animations: 'disabled' });
  await compact.close();
});

test('the production pause control makes the responsive root fullscreen', async ({ page }, testInfo) => {
  // Browsers expose fullscreen as a process-global presentation surface. Run
  // this production-path assertion in one representative project so parallel
  // viewport workers cannot steal fullscreen from one another.
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await page.waitForTimeout(500);
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!supported, 'Headless browser does not expose the Fullscreen API');
  const viewport = page.viewportSize()!;
  // Launch through the selected logical action instead of a stale canvas
  // coordinate: the production home card moved when its artwork grew.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(60);
  await page.keyboard.up('Enter');
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-identity-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
  // The launch pointer is intentionally quarantined until a neutral sample.
  // The first post-launch click supplies that neutral/release boundary; the
  // second is the production Pause edge.
  await page.mouse.click(viewport.width - 28, 30);
  await page.waitForTimeout(250);
  await page.mouse.click(viewport.width - 28, 30);
  await page.waitForTimeout(250);
  for (let index = 0; index < 2; index += 1) {
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(60);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-root');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});
