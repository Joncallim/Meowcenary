import { expect, test, type Page } from '@playwright/test';
import { FocusStroke } from '../src/ui/theme';
import { pressMenuKey } from './menuInputReceipt';

type Diagnostic = {
  panel: string;
  copy: string[];
  copyBounds: Array<{ text: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
  buttons: Array<{ key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
    textInsets: { top: number; bottom: number };
    bounds: { x: number; y: number; width: number; height: number } }>;
  scroll: { top: number; bottom: number };
};
type Seam = { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
  isMenuInputNeutral(): boolean; menuLoadoutDiagnostics(): Diagnostic;
  freeze(): Promise<void>; resume(): void };
const diagnostic = (page: Page) => page.evaluate(() =>
  (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
const candidate = (state: Diagnostic) => state.buttons.find((button) => button.key === 'gunsmith-part:compact')!;
const replacement = (state: Diagnostic) => state.buttons.find((button) => button.key === 'gunsmith-commit')!;
const cancel = (state: Diagnostic) => state.buttons.find((button) => button.key === 'gunsmith-preview-cancel')!;

function assertDecisionBlockVisible(state: Diagnostic): void {
  const summary = state.copyBounds.find((row) => row.text.startsWith('DECISION SUMMARY'))!;
  const commit = replacement(state);
  const cancelRow = cancel(state);
  expect(summary, 'decision summary diagnostic').toBeDefined();
  expect(commit, 'commit diagnostic').toBeDefined();
  expect(cancelRow, 'cancel diagnostic').toBeDefined();
  for (const [label, bounds] of [['summary', summary.bounds], ['commit', commit.bounds], ['cancel', cancelRow.bounds]] as const) {
    expect(bounds.y, `${label} top`).toBeGreaterThanOrEqual(state.scroll.top);
    expect(bounds.y + bounds.height, `${label} bottom`).toBeLessThanOrEqual(state.scroll.bottom);
  }
}

async function press(page: Page, key: string) {
  await pressMenuKey(page, key);
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
  for (let step = 0; step < 64; step++) {
    const state = await diagnostic(page);
    if (candidate(state).focused) break;
    const current = state.buttons.findIndex(button => button.focused);
    const target = state.buttons.findIndex(button => button.key === 'gunsmith-part:compact');
    expect(current).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    const count = state.buttons.length;
    // The shared linear navigator wraps. Keep native keyboard coverage without
    // walking the long way around before the actual focus/resize assertions.
    await press(page, (target - current + count) % count <= (current - target + count) % count
      ? 'ArrowRight' : 'ArrowLeft');
  }
  expect(candidate(await diagnostic(page)).focused).toBe(true);
  expect(candidate(await diagnostic(page)).text).toContain('Compact Receiver Common • Upgrade Rank 1');
  expect(candidate(await diagnostic(page)).text).toContain('STORED');
  expect(candidate(await diagnostic(page)).text).toContain('Preview change');
  await press(page, 'Enter');
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(replacement(await diagnostic(page)).focused).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);

  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(async () => replacement(await diagnostic(page)).focused).toBe(true);
    const state = await diagnostic(page);
    const row = replacement(state);
    const capturePath = testInfo.outputPath(`focused-replacement-${viewport.width}x${viewport.height}.png`);
    await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
      .__MEOWCENARY_VISUAL_TEST__.freeze());
    try { await page.screenshot({ path: capturePath, scale: 'css' }); }
    finally {
      await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
        .__MEOWCENARY_VISUAL_TEST__.resume());
    }
    await testInfo.attach(`focused-replacement-${viewport.width}x${viewport.height}`, {
      path: capturePath, contentType: 'image/png',
    });
    expect(row.text).toContain('REPLACE HEAVY RECEIVER Uncommon • Upgrade Rank 2');
    expect(state.copy.join('\n')).toContain('DECISION SUMMARY');
    expect(state.copy.join('\n')).toContain('Incoming: Compact Receiver Common • Upgrade Rank 1');
    expect(state.copy.join('\n')).toContain('Destination: Pistol Build • Receiver');
    expect(state.copy.join('\n')).toContain('Outgoing: Heavy Receiver Uncommon • Upgrade Rank 2 to STORED');
    assertDecisionBlockVisible(state);
    expect(row.interactive && row.visible).toBe(true);
    expect(row.bounds.y).toBeGreaterThanOrEqual(state.scroll.top);
    expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(state.scroll.bottom);
    // A geometric row inside the viewport can still clip its final glyphs.
    // Leave clearance around actual native Text content for the focus border.
    expect(row.textInsets.top).toBeGreaterThanOrEqual(FocusStroke.width * 2);
    expect(row.textInsets.bottom).toBeGreaterThanOrEqual(FocusStroke.width * 2);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  }
  await press(page, 'Escape');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
});

test('cross-build Gunsmith move discloses the donor slot before commit and cancel preserves the save', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({
    version: 4, progression: { scrap: 640, unlocks: [] }, stages: {}, achievements: {}, characters: {},
    gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
      builds: [
        { id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: { receiver: 'compact' }, traitParts: [] },
      ],
      parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
    equipment: {}, equipmentLoadout: {},
  })));
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean(
    (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.showMenu('gunsmith'))).toBe(true);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  for (let step = 0; step < 64; step += 1) {
    const state = await diagnostic(page);
    const target = state.buttons.findIndex(button => button.key === 'gunsmith-part:compact');
    const current = state.buttons.findIndex(button => button.focused);
    if (target >= 0 && state.buttons[target]!.focused) break;
    expect(current).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    const count = state.buttons.length;
    await press(page, (target - current + count) % count <= (current - target + count) % count ? 'ArrowRight' : 'ArrowLeft');
  }
  const candidateRow = candidate(await diagnostic(page));
  expect(candidateRow.text).toContain('EQUIPPED • SMG Build');
  await press(page, 'Enter');
  await expect.poll(async () => replacement(await diagnostic(page)).focused).toBe(true);
  let state = await diagnostic(page);
  const copy = state.copy.join('\n');
  expect(replacement(state).text).toContain('REPLACE HEAVY RECEIVER Uncommon • Upgrade Rank 2');
  expect(copy).toContain('Incoming: Compact Receiver Common • Upgrade Rank 1');
  expect(copy).toContain('Destination: Pistol Build • Receiver');
  expect(copy).toContain('Outgoing: Heavy Receiver Uncommon • Upgrade Rank 2 to STORED');
  expect(copy).toContain('Donor: SMG Build • Receiver to EMPTY');
  assertDecisionBlockVisible(state);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  const capturePath = testInfo.outputPath('cross-build-move-preview.png');
  await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path: capturePath, scale: 'css' }); }
  finally { await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam })
    .__MEOWCENARY_VISUAL_TEST__.resume()); }
  await press(page, 'Escape');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  state = await diagnostic(page);
  expect(state.buttons.some(button => button.key === 'gunsmith-part:compact' && button.text.includes('EQUIPPED • SMG Build'))).toBe(true);
  for (let step = 0; step < 64; step += 1) {
    state = await diagnostic(page);
    const target = state.buttons.findIndex(button => button.key === 'gunsmith-part:compact');
    const current = state.buttons.findIndex(button => button.focused);
    if (target >= 0 && state.buttons[target]!.focused) break;
    expect(current).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    const count = state.buttons.length;
    await press(page, (target - current + count) % count <= (current - target + count) % count ? 'ArrowRight' : 'ArrowLeft');
  }
  expect(candidate(await diagnostic(page)).focused).toBe(true);
  await press(page, 'Enter');
  await expect.poll(async () => replacement(await diagnostic(page))?.focused ?? false).toBe(true);
  await press(page, 'Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!).gunsmith.builds
    .find((build: { id: string }) => build.id === 'build:pistol').fitted.receiver)).toBe('compact');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.gunsmith.builds.find((build: { id: string }) => build.id === 'build:smg').fitted.receiver).toBeUndefined();
});
