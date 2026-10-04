import { expect, test } from '@playwright/test';

type Seams = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: {
    showMenu(panel: string): boolean;
    waitForMenuPresentation(): Promise<boolean>;
    isMenuPresentationSettled(): boolean;
    waitForInputFrame(): Promise<boolean>;
    isMenuInputNeutral(): boolean;
    menuLoadoutDiagnostics(): { panel: string; focusedKey?: string; buttons: { text: string; interactive: boolean; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }[] };
  };
};

test('overlapping Loadout and Equipment art share one failed physical attempt and allow a later retry', async ({ page }, testInfo) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const firstRequest = new Promise<void>(resolve => { requested = resolve; });
  let requests = 0;
  let fail = true;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/ui/figma/figma-menu-chrome.png', async route => {
    requests += 1;
    if (requests === 1) { requested(); await held; }
    if (fail) await route.abort('failed');
    else await route.continue();
  });
  try {
    await page.goto('/?visual-test=1');
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.showMenu('loadout'))).toBe(true);
    await firstRequest;
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
    // Focus uses the real shared scrolling owner to expose the router above
    // the fixed footer even on the short phone, before touch/pointer activation.
    for (let index = 0; index < 12; index += 1) {
      if (await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().focusedKey === 'loadout:equipment')) break;
      await page.keyboard.down('ArrowDown');
      try {
        await expect.poll(() => page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(false);
      } finally { await page.keyboard.up('ArrowDown'); }
      await expect.poll(() => page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(true);
    }
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().focusedKey)).toBe('loadout:equipment');
    const equipment = await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().buttons.find(button => button.text === 'Equipment'));
    expect(equipment?.interactive && equipment.visible).toBe(true);
    const { x, y, width, height } = equipment!.bounds;
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x + width / 2, y + height / 2);
    else await page.mouse.click(x + width / 2, y + height / 2);
    await expect.poll(() => page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().panel)).toBe('equipment');
    release();
    await expect.poll(async () => requests > 3 || await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.isMenuPresentationSettled())).toBe(true);
    expect(requests, 'one physical attempt plus Phaser\'s two existing retries').toBe(3);
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.isMenuPresentationSettled())).toBe(true);
    const state = await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics());
    expect(state.panel).toBe('equipment');
    expect(state.buttons.some(button => button.interactive && button.visible)).toBe(true);
    const saveBeforeRetry = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
    fail = false;
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.showMenu('home'))).toBe(true);
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.showMenu('loadout'))).toBe(true);
    expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    expect(requests).toBe(4);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBeforeRetry);
    expect(errors).toEqual([]);
  } finally {
    release();
    await testInfo.attach('physical-load-evidence', { body: JSON.stringify({ requests, errors }), contentType: 'application/json' });
  }
});
