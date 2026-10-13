import { expect, type Page } from '@playwright/test';

/** A native key flag is not evidence that Menu consumed an input sample.
 * Observe the actual owner frame and state together, including quarantine. */
export async function waitForMenuInput(page: Page, neutral: boolean): Promise<void> {
  await expect.poll(async () => {
    const receipt = await page.evaluate(async () => {
      const seam = (globalThis as unknown as { __MEOWCENARY_VISUAL_TEST__: {
        waitForInputFrame(): Promise<boolean>; isSceneActive(key: string): boolean; isMenuInputNeutral(): boolean;
      } }).__MEOWCENARY_VISUAL_TEST__;
      const completed = await seam.waitForInputFrame();
      return { completed, menuActive: seam.isSceneActive('MenuScene'), neutral: seam.isMenuInputNeutral() };
    });
    expect(receipt.completed, 'real input owner frame must complete').toBe(true);
    expect(receipt.menuActive, 'inactive Menu cannot certify neutral input').toBe(true);
    return receipt.neutral;
  }).toBe(neutral);
}

/** Keep the physical key down through its owning frame; never inject an action. */
export async function pressMenuKey(page: Page, key: string): Promise<void> {
  await waitForMenuInput(page, true);
  await page.keyboard.down(key);
  try { await waitForMenuInput(page, false); }
  finally { await page.keyboard.up(key); }
  await waitForMenuInput(page, true);
}
