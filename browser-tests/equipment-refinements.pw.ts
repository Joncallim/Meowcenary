import { expect, test, type Page } from '@playwright/test';
import { pressMenuKey } from './menuInputReceipt';
import equipmentCatalog from '../src/data/equipment.json' with { type: 'json' };

type Button = { key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
  textInsets: { top: number; bottom: number };
  bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; buttons: Button[]; copy: string[];
  scroll?: { top: number; bottom: number; offset: number; contentHeight: number };
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
      await page.mouse.wheel(0, button.bounds.y < 0 ? -700 : 700);
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

async function activateButton(page: Page, targetKey: string): Promise<void> {
  await focusButton(page, targetKey);
  await pressMenuKey(page, 'Enter');
  await settle(page);
}

async function activateButtonText(page: Page, text: string): Promise<void> {
  const button = (await diagnostic(page)).buttons.find((candidate) => candidate.text === text);
  expect(button?.key, `Missing keyed Equipment control ${text}`).toBeDefined();
  if (!button) return;
  const x = button.bounds.x + button.bounds.width / 2;
  const y = button.bounds.y + button.bounds.height / 2;
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await settle(page);
}

async function capture(page: Page, path: string): Promise<void> {
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path }); }
  finally { await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.resume()); }
}

async function installLongNameFixture(page: Page, longName: string): Promise<void> {
  await page.route('**/*.js', async (route) => {
    const response = await page.request.fetch(route.request());
    const source = (await response.body()).toString();
    await route.fulfill({ response, body: source.replaceAll('Commando Helmet', longName) });
  });
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

function filteredBrowseSeed() {
  const save = seed();
  return { ...save,
    equipment: Object.fromEntries(equipmentCatalog.map((piece) => [`owned:${piece.id}`, { equipmentId: piece.id, tier: 1 }])),
    equipmentLoadout: {
      helmet: 'owned:equipment:commando-helmet',
      armour: 'owned:equipment:commando-armour',
      gloves: 'owned:equipment:recon-gloves',
    },
  };
}

function pyroThresholdSeed() {
  const save = filteredBrowseSeed();
  return { ...save,
    equipmentLoadout: {
      helmet: 'owned:equipment:pyro-helmet',
      armour: 'owned:equipment:commando-armour',
      gloves: 'owned:equipment:commando-gloves',
    },
  };
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
  const longName = 'Commando Helmet With A Deliberately Long Engineering Upgrade Review Name';
  await installLongNameFixture(reviewPage, longName);
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
  expect(reviewCopy).toContain(`UPGRADE REVIEW • ${longName}`);
  expect(reviewCopy).toContain('COST: 100 Scrap');
  expect(reviewCopy).toContain('BALANCE AFTER: 0 Scrap');
  expect(reviewCopy).toContain('ACTIVATION: STORED output becomes');
  expect(state.buttons.some((button) => button.text === 'Cancel review to equip')).toBe(false);
  expect(state.buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(true);
  expect(state.buttons.some((button) => button.text === 'Cancel Upgrade')).toBe(true);
  expect(await reviewPage.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(beforeReview);
  await capture(reviewPage, testInfo.outputPath('equipment-upgrade-review-long-name.png'));

  await clickButton(reviewPage, 'Cancel Upgrade');
  expect(await reviewPage.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(beforeReview);
  expect((await diagnostic(reviewPage)).buttons.some((button) => button.text === `Equip ${longName}`)).toBe(true);

  await clickButton(reviewPage, 'Review upgrade');
  await clickButton(reviewPage, 'Confirm Upgrade • 100 Scrap');
  state = await diagnostic(reviewPage);
  const saved = await reviewPage.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipment['owned:equipment:commando-helmet'].tier).toBe(2);
  expect(saved.progression.scrap).toBe(0);
  expect(state.copy.join('\n')).toContain('Equipment upgraded');
  expect(state.copy.join('\n')).toContain('LOCKED • Defeat Scrap Crusher');
  expect(state.copy.join('\n')).toContain(longName);
  expect((await diagnostic(reviewPage)).buttons.some((button) => button.text === `Equip ${longName}`)).toBe(true);
  const committedActions = (await diagnostic(reviewPage)).buttons
    .filter((button) => button.key?.startsWith('equipment-equip:') || button.key?.startsWith('equipment-upgrade:'))
    .sort((left, right) => left.bounds.y - right.bounds.y);
  for (let index = 1; index < committedActions.length; index += 1) {
    const previous = committedActions[index - 1]!;
    const current = committedActions[index]!;
    expect(current.bounds.y).toBeGreaterThanOrEqual(previous.bounds.y + previous.bounds.height);
  }
  const committedEquip = committedActions.find((button) => button.text === `Equip ${longName}`);
  expect(committedEquip).toBeDefined();
  expect(committedEquip!.textInsets.top).toBeGreaterThanOrEqual(6);
  expect(committedEquip!.textInsets.bottom).toBeGreaterThanOrEqual(6);
  await capture(reviewPage, testInfo.outputPath('equipment-upgrade-committed.png'));

  // The review gate is cleared after commit, so a second confirmation cannot
  // remain available while the authoritative after-state is shown.
  expect((await diagnostic(reviewPage)).buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(false);
  expect((await reviewPage.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!))).progression.scrap).toBe(0);
});

test('Upgrade review remains reachable across measured short-height layouts', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 360, height: 640 },
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), storedUpgradeSeed());
    await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);
  const instanceId = 'owned:equipment:commando-helmet';
  await activateButton(page, `equipment-candidate:${instanceId}`);
  await activateButtonText(page, 'View details');
  await activateButtonText(page, 'Review upgrade');
  const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  for (const viewport of [{ width: 844, height: 390 }, { width: 844, height: 481 }, { width: 360, height: 500 }]) {
    await page.setViewportSize(viewport);
    await settle(page);
    const state = await diagnostic(page);
    const copy = state.copy.join('\n');
    expect(copy).toContain('UPGRADE REVIEW');
    expect(copy).toContain('GRADE: Standard › → Reinforced ››');
    expect(copy).toContain('STATS: +5% Fire Rate [All Weapons] → +10% Fire Rate [All Weapons]');
    expect(state.buttons.some((button) => button.text === 'Cancel review to equip')).toBe(false);
    expect(state.buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(true);
    expect(state.buttons.some((button) => button.text === 'Cancel Upgrade')).toBe(true);
    const actions = state.buttons.filter((button) => button.key?.startsWith('equipment-equip:') || button.key?.startsWith('equipment-upgrade-'));
    expect(actions.length).toBe(2);
    for (const action of actions) {
      expect(action.visible && action.interactive).toBe(true);
      expect(action.bounds.y).toBeGreaterThanOrEqual(0);
      expect(action.bounds.y + action.bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    for (let index = 1; index < actions.length; index += 1) {
      expect(actions[index]!.bounds.y).toBeGreaterThanOrEqual(actions[index - 1]!.bounds.y + actions[index - 1]!.bounds.height);
    }
    expect(state.scroll?.bottom).toBeLessThanOrEqual(actions[0]!.bounds.y - 8);
  }
  await activateButtonText(page, 'Cancel Upgrade');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  expect((await diagnostic(page)).copy.join('\n')).not.toContain('UPGRADE REVIEW');
  expect((await diagnostic(page)).buttons.some((button) => button.text === 'Equip Commando Helmet')).toBe(true);
  await activateButtonText(page, 'Review upgrade');
  await activateButtonText(page, 'Cancel Upgrade');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  expect((await diagnostic(page)).buttons.some((button) => button.text === 'Equip Commando Helmet')).toBe(true);
  } finally {
    await context.close();
  }
});

test('filtered Equipment browse returns from detail with query, filter, and scroll intact', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), filteredBrowseSeed());
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);

  await clickButton(page, 'equipment-filters');
  await clickButton(page, 'equipment-filter:slot:helmet');
  await focusButton(page, 'equipment-search');
  await pressMenuKey(page, 'Enter');
  await settle(page);
  const search = page.locator('input[aria-label="Search equipment names, sets, or effects"]');
  await expect(search).toBeVisible();
  await search.dispatchEvent('compositionstart');
  await search.fill('helmet');
  await search.press('Escape');
  await expect(search).toBeVisible();
  await search.dispatchEvent('compositionend');
  await settle(page);
  await search.press('Escape');
  await expect(search).toBeHidden();
  let searchState = await diagnostic(page);
  expect(searchState.copy.join('\n')).not.toContain('SEARCHING');
  expect(searchState.copy.join('\n')).toContain('SEARCH NAMES, SETS, OR EFFECTS');
  await focusButton(page, 'equipment-search');
  await pressMenuKey(page, 'Enter');
  await settle(page);
  const reopenedSearch = page.locator('input[aria-label="Search equipment names, sets, or effects"]');
  await expect(reopenedSearch).toBeVisible();
  await reopenedSearch.evaluate((input) => input.blur());
  await settle(page);
  await expect(reopenedSearch).toBeHidden();
  searchState = await diagnostic(page);
  expect(searchState.copy.join('\n')).not.toContain('SEARCHING');
  await focusButton(page, 'equipment-search');
  await pressMenuKey(page, 'Enter');
  await settle(page);
  const activeSearch = page.locator('input[aria-label="Search equipment names, sets, or effects"]');
  await expect(activeSearch).toBeVisible();
  await activeSearch.fill('helmet');
  await activeSearch.press('Enter');
  await settle(page);

  const candidate = 'equipment-candidate:owned:equipment:recon-helmet';
  await clickButton(page, candidate);
  const beforeDetail = await diagnostic(page);
  expect(beforeDetail.copy.join('\n')).toContain('SEARCH • helmet');
  expect(beforeDetail.copy.join('\n')).toContain('FILTERS • 2 ACTIVE');
  expect(beforeDetail.copy.join('\n')).toContain('× Search “helmet”');
  expect(beforeDetail.copy.join('\n')).toContain('× Slot: helmet');
  expect(beforeDetail.equipment?.selectedInstanceId).toBe('owned:equipment:recon-helmet');
  expect(beforeDetail.scroll?.offset).toBeGreaterThan(0);
  const browseOffset = beforeDetail.scroll!.offset;

  await clickButton(page, 'View details');
  expect((await diagnostic(page)).focusedKey).toBe('equipment-detail:owned:equipment:recon-helmet');
  await capture(page, testInfo.outputPath('equipment-filtered-detail.png'));
  await clickButton(page, 'Back to candidates');
  const returned = await diagnostic(page);
  expect(returned.copy.join('\n')).toContain('SEARCH • helmet');
  expect(returned.copy.join('\n')).toContain('FILTERS • 2 ACTIVE');
  expect(returned.copy.join('\n')).toContain('× Search “helmet”');
  expect(returned.copy.join('\n')).toContain('× Slot: helmet');
  expect(returned.equipment?.selectedInstanceId).toBe('owned:equipment:recon-helmet');
  expect(returned.scroll?.offset).toBe(browseOffset);
  await capture(page, testInfo.outputPath('equipment-filtered-return.png'));
});

test('Pyro threshold comparison attributes trait and projectile effects to the Set', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), pyroThresholdSeed());
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);

  await clickButton(page, 'equipment-slot:armour');
  await clickButton(page, 'equipment-candidate:owned:equipment:pyro-armour');
  await clickButton(page, 'View details');
  const state = await diagnostic(page);
  const copy = state.copy.join('\n');
  const setGain = copy.indexOf('SET BONUS GAIN');
  const itemGain = copy.indexOf('ITEM GAIN');
  expect(setGain).toBeGreaterThan(itemGain);
  expect(copy).toContain('Source: Pyro 2-piece bonus');
  expect(copy).toContain('FIRE');
  expect(copy).toContain('burn');
  const fireSource = copy.indexOf('FIRE', setGain);
  const burnSource = copy.indexOf('burn', setGain);
  expect(fireSource).toBeGreaterThan(setGain);
  expect(burnSource).toBeGreaterThan(setGain);
  await page.mouse.wheel(0, 900);
  await settle(page);
  await capture(page, testInfo.outputPath('equipment-pyro-threshold.png'));
});
