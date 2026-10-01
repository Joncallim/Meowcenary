import { expect, test, type Page } from '@playwright/test';
import { FocusStroke } from '../src/ui/theme';

type Diagnostic = {
  panel: string;
  buttons: Array<{ text: string; focused: boolean; visible: boolean; interactive: boolean;
    textInsets: { top: number; bottom: number };
    bounds: { x: number; y: number; width: number; height: number } }>;
  scroll: { top: number; bottom: number };
};
type Seam = { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
  isMenuInputNeutral(): boolean; menuLoadoutDiagnostics(): Diagnostic };
const diagnostic = (page: Page) => page.evaluate(() =>
  (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
const candidate = (state: Diagnostic) => state.buttons.find((button) => button.text.startsWith('Compact Receiver T1 • OWNED'))!;

async function press(page: Page, key: string) {
  await page.keyboard.down(key);
  try {
    await expect.poll(() => page.evaluate(() =>
      (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
        .__MEOWCENARY_VISUAL_TEST__.isMenuInputNeutral())).toBe(false);
  } finally { await page.keyboard.up(key); }
  await expect.poll(() => page.evaluate(() =>
    (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
      .__MEOWCENARY_VISUAL_TEST__.isMenuInputNeutral())).toBe(true);
}

test('focused Gunsmith replacement keeps the entire action clear of its card border across resize', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({
    version: 4, progression: { scrap: 640, unlocks: [] }, stages: {}, achievements: {}, characters: {},
    gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
    equipment: {}, equipmentLoadout: {},
  })));
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(
    (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.showMenu('gunsmith'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  for (let step = 0; step < 64 && !candidate(await diagnostic(page)).focused; step++) await press(page, 'ArrowDown');
  expect(candidate(await diagnostic(page)).focused).toBe(true);

  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(async () => candidate(await diagnostic(page)).focused).toBe(true);
    const state = await diagnostic(page);
    const row = candidate(state);
    const capturePath = testInfo.outputPath(`focused-replacement-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: capturePath, scale: 'css' });
    await testInfo.attach(`focused-replacement-${viewport.width}x${viewport.height}`, {
      path: capturePath, contentType: 'image/png',
    });
    expect(row.text).toContain('REPLACE HEAVY RECEIVER T2');
    expect(row.text).toContain('Heavy Receiver T2 returns to STORED.');
    expect(row.interactive && row.visible).toBe(true);
    expect(row.bounds.y).toBeGreaterThanOrEqual(state.scroll.top);
    expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(state.scroll.bottom);
    // A geometric row inside the viewport can still clip its final glyphs.
    // Leave clearance around actual native Text content for the focus border.
    expect(row.textInsets.top).toBeGreaterThanOrEqual(FocusStroke.width * 2);
    expect(row.textInsets.bottom).toBeGreaterThanOrEqual(FocusStroke.width * 2);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  }
});
