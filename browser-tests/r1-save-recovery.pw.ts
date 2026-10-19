import { expect, test, type Page } from '@playwright/test';
import { pressMenuKey } from './menuInputReceipt';

type Diagnostic = {
  focusedKey?: string;
  copy: string[];
  buttons: Array<{ key?: string; text: string; focused: boolean; visible: boolean;
    bounds: { x: number; y: number; width: number; height: number } }>;
};
type Seam = {
  showMenu(panel: string): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  menuLoadoutDiagnostics(): Diagnostic;
};
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam; recoveryWritesBlocked: boolean };
const storageKey = 'meowcenary.save.v2';
const instanceId = 'owned:equipment:commando-helmet';
const partId = 'part:receiver-compact';

async function settle(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
}
async function diagnostic(page: Page): Promise<Diagnostic> {
  return page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
}
async function focus(page: Page, key: string): Promise<void> {
  for (let step = 0; step < 80; step++) {
    const state = await diagnostic(page);
    if (state.focusedKey === key) return;
    const current = state.buttons.findIndex(button => button.focused);
    const target = state.buttons.findIndex(button => button.key === key);
    expect(target, `Missing focus target ${key}`).toBeGreaterThanOrEqual(0);
    await pressMenuKey(page, target < current ? 'ArrowUp' : 'ArrowDown');
    await settle(page);
  }
  throw new Error(`Could not reach ${key} with keyboard focus`);
}
async function activate(page: Page, key: string): Promise<void> {
  await focus(page, key);
  await pressMenuKey(page, 'Enter');
  await settle(page);
}
async function setup(page: Page, panel: string): Promise<void> {
  await page.addInitScript(({ key, equipmentInstance }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 4, settings: { muted: true, reducedMotion: true },
      progression: { scrap: 300, unlocks: ['capability:equipment-tier-2'] },
      stages: {}, achievements: {}, characters: {},
      equipment: { [equipmentInstance]: { equipmentId: 'equipment:commando-helmet', tier: 1 } },
      equipmentLoadout: {},
      gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {}, parts: {},
        builds: [{ id: 'build:pistol', name: 'Recovery Pistol', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }] },
    }));
    const original = Storage.prototype.setItem;
    (globalThis as Globals).recoveryWritesBlocked = false;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key && (globalThis as Globals).recoveryWritesBlocked) throw new DOMException('Injected save failure', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, { key: storageKey, equipmentInstance: instanceId });
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  expect(await page.evaluate(target => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu(target), panel)).toBe(true);
  await settle(page);
}
async function saved(page: Page): Promise<string | null> {
  return page.evaluate(key => localStorage.getItem(key), storageKey);
}

test('failed Equipment save retains the visible confirmation and a fresh keyboard retry spends once', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, 'equipment');
  await activate(page, `equipment-candidate:${instanceId}`);
  const detail = (await diagnostic(page)).buttons.find(button => button.text === 'View details');
  if (page.viewportSize()!.width < 600) expect(detail?.key).toBeDefined();
  if (detail) await activate(page, detail.key!);
  await activate(page, `equipment-upgrade:${instanceId}`);
  const confirmKey = `equipment-upgrade-confirm:${instanceId}`;
  await focus(page, confirmKey);
  const before = await saved(page);
  await page.evaluate(() => { (globalThis as Globals).recoveryWritesBlocked = true; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  expect(await saved(page)).toBe(before);
  const failed = await diagnostic(page);
  expect(failed.focusedKey).toBe(confirmKey);
  expect(failed.copy.join('\n')).toContain('UPGRADE REVIEW');
  expect(failed.copy.join('\n')).toContain('Equipment upgrade did not complete • No Scrap was spent');
  const confirm = failed.buttons.find(button => button.key === confirmKey)!;
  expect(confirm.visible).toBe(true);
  expect(confirm.bounds.y).toBeGreaterThanOrEqual(0);
  expect(confirm.bounds.y + confirm.bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: testInfo.outputPath('equipment-failed-save-review.png') });
  await page.evaluate(() => { (globalThis as Globals).recoveryWritesBlocked = false; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  const committed = JSON.parse((await saved(page))!);
  expect(committed.equipment[instanceId].tier).toBe(2);
  expect(committed.progression.scrap).toBe(200);
  expect((await diagnostic(page)).buttons.some(button => button.key === confirmKey)).toBe(false);
});

test('failed Parts fabrication retains confirmation and retry creates exactly one stored part', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await setup(page, 'gunsmith');
  await activate(page, 'gunsmith-surface:parts');
  await activate(page, `gunsmith-catalog:${partId}`);
  await activate(page, `gunsmith-fabricate-request:${partId}`);
  const confirmKey = `gunsmith-fabricate-confirm:${partId}`;
  await focus(page, confirmKey);
  const before = await saved(page);
  await page.evaluate(() => { (globalThis as Globals).recoveryWritesBlocked = true; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  expect(await saved(page)).toBe(before);
  const failed = await diagnostic(page);
  expect(failed.focusedKey).toBe(confirmKey);
  expect(failed.copy.join('\n')).toContain('Output destination: STORED inventory');
  expect(failed.copy.join('\n')).toContain('Part fabrication did not complete • No Scrap was spent');
  const confirm = failed.buttons.find(button => button.key === confirmKey)!;
  expect(confirm.visible).toBe(true);
  expect(confirm.bounds.y).toBeGreaterThanOrEqual(0);
  expect(confirm.bounds.y + confirm.bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: testInfo.outputPath('parts-failed-save-review.png') });
  await page.evaluate(() => { (globalThis as Globals).recoveryWritesBlocked = false; });
  await pressMenuKey(page, 'Enter');
  await settle(page);
  const committed = JSON.parse((await saved(page))!);
  expect(Object.values(committed.gunsmith.parts)).toEqual([{ partId, tier: 1, infusedTraits: [] }]);
  expect(committed.progression.scrap).toBe(240);
  expect(committed.gunsmith.builds).toEqual(JSON.parse(before!).gunsmith.builds);
  expect((await diagnostic(page)).buttons.some(button => button.key === confirmKey)).toBe(false);
});
