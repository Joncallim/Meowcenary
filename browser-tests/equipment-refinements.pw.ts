import { expect, test, type Page } from '@playwright/test';
import { pressMenuKey } from './menuInputReceipt';

type Button = { key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; buttons: Button[]; copy: string[];
  equipment?: { selectedSlot: string; selectedInstanceId?: string; equipped: Record<string, string> } };
type Seam = { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
  menuLoadoutDiagnostics(): Diagnostic; freeze(): Promise<void>; resume(): void };
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam };

function isCard(key: string | undefined): boolean {
  return key?.startsWith('equipment-candidate:') === true || key?.startsWith('equipment-blueprint:') === true;
}

function cardRows(state: Diagnostic): Button[][] {
  const rows: Button[][] = [];
  for (const button of state.buttons.filter((candidate) => isCard(candidate.key))
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x)) {
    const row = rows.at(-1);
    if (!row || Math.abs(row[0]!.bounds.y - button.bounds.y) > 2) rows.push([button]);
    else row.push(button);
  }
  return rows;
}

async function focusButton(page: Page, targetKey: string): Promise<void> {
  for (let step = 0; step < 96; step += 1) {
    const state = await diagnostic(page);
    if (state.focusedKey === targetKey) return;
    const current = state.buttons.find((button) => button.key === state.focusedKey);
    const target = state.buttons.find((button) => button.key === targetKey);
    expect(current, `Missing current focus while targeting ${targetKey}`).toBeDefined();
    expect(target, `Missing focus target ${targetKey}`).toBeDefined();
    if (!current || !target) return;
    let direction: string;
    if (current.key?.startsWith('equipment-slot:') && isCard(targetKey)) direction = 'ArrowDown';
    else if (isCard(current.key) && isCard(targetKey)) {
      const rows = cardRows(state);
      const currentRow = rows.findIndex((row) => row.some((button) => button.key === current.key));
      const targetRow = rows.findIndex((row) => row.some((button) => button.key === targetKey));
      direction = currentRow === targetRow
        ? target.bounds.x < current.bounds.x ? 'ArrowLeft' : 'ArrowRight'
        : targetRow < currentRow ? 'ArrowUp' : 'ArrowDown';
    } else {
      const currentIndex = state.buttons.indexOf(current);
      const targetIndex = state.buttons.indexOf(target);
      direction = targetIndex >= currentIndex ? 'ArrowDown' : 'ArrowUp';
    }
    await pressMenuKey(page, direction);
    await settle(page);
  }
  throw new Error(`Could not focus Equipment control ${targetKey}`);
}

async function diagnostic(page: Page): Promise<Diagnostic> {
  return page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
}

async function settle(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
}

async function clickButton(page: Page, matcher: string): Promise<void> {
  if (matcher.startsWith('equipment-candidate:') || matcher.startsWith('equipment-blueprint:')) {
    await focusButton(page, matcher);
    await pressMenuKey(page, 'Enter');
    await settle(page);
    return;
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const state = await diagnostic(page);
    const button = state.buttons.find((candidate) => candidate.key === matcher || candidate.text === matcher);
    expect(button, `Missing Equipment control ${matcher}; panel=${state.panel} keys=${state.buttons.map((candidate) => candidate.key ?? candidate.text).join(' | ')}`).toBeDefined();
    if (!button) return;
    const viewport = page.viewportSize()!;
    const inViewport = button.bounds.y >= 0 && button.bounds.y + button.bounds.height <= viewport.height;
    if (!inViewport) {
      await page.mouse.move(Math.min(viewport.width / 2, 120), Math.max(120, viewport.height - 80));
      await page.mouse.wheel(0, button.bounds.y < 0 ? 700 : -700);
      await settle(page);
      continue;
    }
    const x = button.bounds.x + button.bounds.width / 2;
    const y = button.bounds.y + button.bounds.height / 2;
    if (page.viewportSize()!.width < 600) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await settle(page);
    return;
  }
  throw new Error(`Could not bring Equipment control ${matcher} into view`);
}

async function capture(page: Page, path: string): Promise<void> {
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path }); }
  finally { await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.resume()); }
}

function seed() {
  const owned = (equipmentId: string) => [`owned:${equipmentId}`, { equipmentId, tier: 1 }];
  return {
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 100, unlocks: ['capability:equipment-tier-2'] },
    stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
    gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
    equipment: Object.fromEntries([
      owned('equipment:commando-helmet'), owned('equipment:commando-armour'),
      owned('equipment:recon-helmet'), owned('equipment:recon-gloves'),
    ]),
    equipmentLoadout: {
      helmet: 'owned:equipment:commando-helmet',
      armour: 'owned:equipment:commando-armour',
      gloves: 'owned:equipment:recon-gloves',
    },
    items: {}, bosses: {}, compendium: {}, pendingAchievementReports: [],
    appliedGrantTransactions: {}, grantTransactionFingerprints: {},
  };
}

function storedUpgradeSeed() {
  const save = seed();
  return { ...save, equipmentLoadout: {
    armour: 'owned:equipment:commando-armour',
    gloves: 'owned:equipment:recon-gloves',
  } };
}

test('Equipment review keeps equip non-mutating and surfaces committed feedback', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed());
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);

  await clickButton(page, 'equipment-candidate:owned:equipment:recon-helmet');
  await clickButton(page, 'View details');
  let state = await diagnostic(page);
  expect(state.copy.join('\n')).toContain('SET LOSS');
  expect(state.copy.join('\n')).toContain('NEW RECON BONUS');
  expect(state.copy.join('\n')).toContain('ITEM GAIN');
  expect(state.copy.join('\n')).toContain('ITEM LOSS');
  await capture(page, testInfo.outputPath('equipment-set-loss-replacement.png'));

  const reviewPage = await page.context().newPage();
  await reviewPage.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), storedUpgradeSeed());
  await reviewPage.goto('/?visual-test=1');
  await expect.poll(() => reviewPage.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(reviewPage);
  await expect.poll(() => reviewPage.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(reviewPage);
  await clickButton(reviewPage, 'equipment-candidate:owned:equipment:commando-helmet');
  await clickButton(reviewPage, 'View details');
  const beforeReview = await reviewPage.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  await clickButton(reviewPage, 'Review upgrade');
  state = await diagnostic(reviewPage);
  const reviewCopy = state.copy.join('\n');
  expect(reviewCopy).toContain('COST: 100 Scrap');
  expect(reviewCopy).toContain('BALANCE AFTER: 0 Scrap');
  expect(reviewCopy).toContain('ACTIVATION: STORED output becomes');
  expect(state.buttons.some((button) => button.text === 'Cancel review to equip')).toBe(true);
  expect(state.buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(true);
  expect(await reviewPage.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(beforeReview);
  await capture(reviewPage, testInfo.outputPath('equipment-upgrade-review.png'));

  await clickButton(reviewPage, 'Cancel review to equip');
  expect(await reviewPage.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(beforeReview);
  expect((await diagnostic(reviewPage)).buttons.some((button) => button.text === 'Equip Commando Helmet')).toBe(true);

  await clickButton(reviewPage, 'Review upgrade');
  await clickButton(reviewPage, 'Confirm Upgrade • 100 Scrap');
  state = await diagnostic(reviewPage);
  const saved = await reviewPage.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipment['owned:equipment:commando-helmet'].tier).toBe(2);
  expect(saved.progression.scrap).toBe(0);
  expect(state.copy.join('\n')).toContain('Equipment upgraded');
  expect(state.copy.join('\n')).toContain('LOCKED • Defeat Scrap Crusher');
  await capture(reviewPage, testInfo.outputPath('equipment-upgrade-committed.png'));

  // The review gate is cleared after commit, so a second confirmation cannot
  // remain available while the authoritative after-state is shown.
  expect((await diagnostic(reviewPage)).buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(false);
  expect((await reviewPage.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!))).progression.scrap).toBe(0);
});
