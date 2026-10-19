import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { pressMenuKey } from './menuInputReceipt';

type Diagnostic = { focusedKey?: string; copy: string[];
  copyBounds: Array<{ text: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
  scroll?: { top: number; bottom: number; offset: number; rectangle?: { x: number; y: number; width: number; height: number } };
  buttons: Array<{ key?: string; text: string; focused: boolean; visible: boolean;
  bounds: { x: number; y: number; width: number; height: number } }> };
type Seam = { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>; menuLoadoutDiagnostics(): Diagnostic;
  freeze(): Promise<void>; resume(): void };
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam; partsWritesBlocked: boolean };
const saveKey = 'meowcenary.save.v2';

async function settle(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
}
const diagnostic = (page: Page) => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
const saved = (page: Page) => page.evaluate(key => localStorage.getItem(key), saveKey);
async function focus(page: Page, key: string): Promise<void> {
  for (let step = 0; step < 100; step++) {
    const state = await diagnostic(page);
    if (state.focusedKey === key) return;
    const current = state.buttons.findIndex(button => button.focused);
    const target = state.buttons.findIndex(button => button.key === key);
    expect(target, `Missing focus target ${key}`).toBeGreaterThanOrEqual(0);
    expect(current).toBeGreaterThanOrEqual(0);
    const count = state.buttons.length;
    await pressMenuKey(page, (target - current + count) % count <= (current - target + count) % count ? 'ArrowRight' : 'ArrowLeft');
    await settle(page);
  }
  throw new Error(`Could not focus ${key}`);
}
async function activate(page: Page, key: string): Promise<void> {
  await focus(page, key);
  await pressMenuKey(page, 'Enter');
  await settle(page);
}
async function activatePrefix(page: Page, prefix: string): Promise<void> {
  const key = (await diagnostic(page)).buttons.find(button => button.key?.startsWith(prefix))?.key;
  expect(key, `Missing ${prefix}`).toBeDefined();
  await activate(page, key!);
}
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path, scale: 'css' }); }
  finally { await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.resume()); }
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
async function scrollReviewToTop(page: Page, visibleText: string): Promise<void> {
  const rectangle = (await diagnostic(page)).scroll?.rectangle;
  expect(rectangle, 'Review must expose a scroll rectangle').toBeDefined();
  await page.mouse.move(rectangle!.x + rectangle!.width / 2, rectangle!.y + rectangle!.height / 2);
  await page.mouse.wheel(0, -9000);
  await settle(page);
  const review = await diagnostic(page);
  expect(review.scroll?.offset).toBe(0);
  expect(review.copyBounds.some(entry => entry.text.includes(visibleText) && entry.visible)).toBe(true);
}
async function setup(page: Page, gunsmith: object): Promise<void> {
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify({ version: 4, settings: { muted: true, reducedMotion: true },
      progression: { scrap: 300, unlocks: [] }, stages: {}, achievements: {}, characters: {},
      equipment: {}, equipmentLoadout: {}, gunsmith: state }));
    const original = Storage.prototype.setItem;
    (globalThis as Globals).partsWritesBlocked = false;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key && (globalThis as Globals).partsWritesBlocked) throw new DOMException('Injected save failure', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, { key: saveKey, state: gunsmith });
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('gunsmith'))).toBe(true);
  await settle(page);
}
async function failThenRetry(page: Page, confirmKey: string, expectedCopy: string, testInfo: TestInfo, name: string): Promise<void> {
  await focus(page, confirmKey);
  const before = await saved(page);
  await page.evaluate(() => { (globalThis as Globals).partsWritesBlocked = true; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  expect(await saved(page)).toBe(before);
  const failed = await diagnostic(page);
  expect(failed.focusedKey).toBe(confirmKey);
  expect(failed.copy.join('\n')).toContain(expectedCopy);
  await capture(page, testInfo, name);
  await page.evaluate(() => { (globalThis as Globals).partsWritesBlocked = false; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  expect(await saved(page)).not.toBe(before);
}

test('Parts shows the fitted rank-three FIRE example and new rank-one output honestly through failed save and retry', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, { selectedBuildId: 'build:pistol', fabricationSerials: {},
    parts: { receiver: { partId: 'part:receiver-compact', tier: 3, infusedTraits: ['FIRE'] } },
    builds: [{ id: 'build:pistol', name: 'Main Pistol', baseWeaponFamily: 'pistol', fitted: { receiver: 'receiver' }, traitParts: [] }] });
  await activate(page, 'gunsmith-surface:parts');
  await activate(page, 'gunsmith-catalog:part:receiver-compact');
  const detail = (await diagnostic(page)).copy.join('\n');
  expect(detail).toContain('OWNED EXAMPLE • EQUIPPED in Main Pistol • Common • Upgrade Rank 3 • FIRE');
  expect(detail).toContain('FABRICATION OUTPUT • Common • Upgrade Rank 1 • no infusion • STORED until fitted');
  expect(detail).toContain('Already fitted to Pistol: no change.');
  expect(detail).not.toContain('Fire interval 524.2ms to 650ms');
  expect(detail).not.toContain('FIRE\nACTIVE to REMOVED');
  await capture(page, testInfo, 'parts-ranked-fitted-truth.png');
  await activate(page, 'gunsmith-fabricate-request:part:receiver-compact');
  await failThenRetry(page, 'gunsmith-fabricate-confirm:part:receiver-compact', 'Output destination: STORED inventory', testInfo, 'parts-failed-save.png');
  const committed = JSON.parse((await saved(page))!);
  expect(committed.gunsmith.parts.receiver).toEqual({ partId: 'part:receiver-compact', tier: 3, infusedTraits: ['FIRE'] });
  expect(Object.entries(committed.gunsmith.parts).filter(([id]) => id !== 'receiver').map(([, part]) => part))
    .toEqual([{ partId: 'part:receiver-compact', tier: 1, infusedTraits: [] }]);
  expect(committed.gunsmith.builds[0].fitted.receiver).toBe('receiver');
  expect(committed.progression.scrap).toBe(240);
});

test('nonselected SMG infusion shows the retained target and gained FIRE through failed save and retry', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, { selectedBuildId: 'build:pistol', fabricationSerials: {},
    parts: { target: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      core: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] } },
    builds: [
      { id: 'build:pistol', name: 'Pistol', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] },
      { id: 'build:smg', name: 'Infusion SMG', baseWeaponFamily: 'smg', fitted: { receiver: 'target' }, traitParts: [] },
    ] });
  await activate(page, 'gunsmith-surface:workshop');
  await activate(page, 'gunsmith-workshop-kind:infuse');
  await activate(page, 'gunsmith-workshop:infuse:target:core');
  const copy = (await diagnostic(page)).copy.join('\n');
  expect(copy).toContain('AFFECTED BUILD • Infusion SMG • SMG • RECEIVER');
  expect(copy).toContain('UPDATES FITTED Compact Receiver Common • Upgrade Rank 1');
  expect(copy).toContain('Gains SMG • FIRE');
  expect(copy).toContain('Affected build/slot: Infusion SMG • RECEIVER');
  await capture(page, testInfo, 'infusion-retained-target-truth.png');
  await scrollReviewToTop(page, 'AFFECTED BUILD');
  await capture(page, testInfo, 'infusion-retained-target-overview.png');
  const before = JSON.parse((await saved(page))!);
  await failThenRetry(page, 'gunsmith-confirm', 'Affected build/slot: Infusion SMG • RECEIVER', testInfo, 'infusion-failed-save.png');
  const committed = JSON.parse((await saved(page))!);
  expect(committed.gunsmith.selectedBuildId).toBe('build:pistol');
  expect(committed.gunsmith.builds[0]).toEqual(before.gunsmith.builds[0]);
  expect(committed.gunsmith.parts.target.infusedTraits).toEqual(['FIRE']);
  expect(committed.gunsmith.parts.core).toBeUndefined();
  expect(committed.gunsmith.builds[1].fitted.receiver).toBe('target');
});

test('merge and fit keep their review and focus through failed saves, then commit once', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, { selectedBuildId: 'build:pistol', fabricationSerials: {},
    parts: { first: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      second: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } },
    builds: [{ id: 'build:pistol', name: 'Pistol', baseWeaponFamily: 'pistol', fitted: { barrel: 'first' }, traitParts: [] }] });
  await activate(page, 'gunsmith-surface:workshop');
  await activatePrefix(page, 'gunsmith-workshop:merge:');
  await activate(page, 'gunsmith-merge-input:first');
  await activate(page, 'gunsmith-merge-input:second');
  expect((await diagnostic(page)).copy.join('\n')).toContain('Affected build/slot: Pistol • BARREL');
  await failThenRetry(page, 'gunsmith-confirm', 'Affected build/slot: Pistol • BARREL', testInfo, 'merge-failed-save.png');
  let committed = JSON.parse((await saved(page))!);
  expect(committed.gunsmith.parts.first).toBeUndefined();
  expect(committed.gunsmith.parts.second).toBeUndefined();
  expect(Object.values(committed.gunsmith.parts).filter((part: any) => part.partId === 'part:barrel-standard'))
    .toEqual([{ partId: 'part:barrel-standard', tier: 2, infusedTraits: [] }]);
  expect(committed.gunsmith.builds[0].fitted.barrel).toBeUndefined();
  await activate(page, 'gunsmith-surface:build');
  await activate(page, 'gunsmith-slot:receiver');
  await activate(page, 'gunsmith-part:compact');
  expect((await diagnostic(page)).copy.join('\n')).toContain('DECISION SUMMARY');
  await failThenRetry(page, 'gunsmith-commit', 'DECISION SUMMARY', testInfo, 'fit-failed-save.png');
  committed = JSON.parse((await saved(page))!);
  expect(committed.gunsmith.builds[0].fitted.receiver).toBe('compact');
});
