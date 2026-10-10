import { expect, type Page } from '@playwright/test';

type Rect = { x: number; y: number; width: number; height: number };
type RunStartDiagnostics = {
  visible: boolean;
  status: string;
  timeMs: number;
  buttons: Rect[];
};
type Seam = {
  runStartBriefDiagnostics(): RunStartDiagnostics | undefined;
  waitForInputFrame(): Promise<boolean>;
};
type BrowserGlobals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam };

async function readBrief(page: Page): Promise<RunStartDiagnostics | undefined> {
  return page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__
    ?.runStartBriefDiagnostics());
}

async function inputFrame(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__
    ?.waitForInputFrame() ?? false)).toBe(true);
}

/**
 * Wait for the real run-start brief, then dismiss it through the selected
 * logical input. Diagnostics only locate the rendered button; activation
 * still goes through the owning keyboard/mouse/touch input route.
 */
export async function dismissRunStartBrief(
  page: Page,
  input: 'keyboard' | 'mouse' | 'touch' = 'keyboard',
): Promise<void> {
  await expect.poll(async () => {
    const state = await readBrief(page);
    return state?.visible === true || state?.status === 'active';
  }).toBe(true);

  const state = await readBrief(page);
  if (state?.visible !== true) return;
  expect(state.status).toBe('intro');
  expect(state.timeMs).toBe(0);
  expect(state.buttons).toHaveLength(2);
  const start = state.buttons[0]!;
  expect(start.width).toBeGreaterThan(0);
  expect(start.height).toBeGreaterThan(0);

  // The menu launch key/tap has ended. Let the gameplay adapter sample that
  // neutral boundary before sending the distinct Start command.
  await inputFrame(page);

  if (input === 'keyboard') {
    await page.keyboard.down('Enter');
    try {
      await expect.poll(async () => (await readBrief(page))?.status).toBe('active');
    } finally {
      await page.keyboard.up('Enter');
    }
    await inputFrame(page);
  } else if (input === 'mouse') {
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await inputFrame(page);
    await page.mouse.up();
    await expect.poll(async () => (await readBrief(page))?.status).toBe('active');
    await inputFrame(page);
  } else {
    const session = await page.context().newCDPSession(page);
    try {
      const x = start.x + start.width / 2;
      const y = start.y + start.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x, y, id: 1 }],
      });
      await inputFrame(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => (await readBrief(page))?.status).toBe('active');
      await inputFrame(page);
    } finally {
      await session.detach();
    }
  }
}
