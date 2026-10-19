import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pressMenuKey, waitForMenuInput } from './menuInputReceipt';
import equipmentCatalog from '../src/data/equipment.json' with { type: 'json' };

type Button = { key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
  textInsets: { top: number; bottom: number };
  bounds: { x: number; y: number; width: number; height: number } };
type CopyBounds = { text: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; buttons: Button[]; copy: string[];
  copyBounds?: CopyBounds[];
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
    if (current.key?.startsWith('equipment-slot:') && targetKey.startsWith('equipment-slot:')) {
      const horizontal = Math.abs(target.bounds.x - current.bounds.x) >= Math.abs(target.bounds.y - current.bounds.y);
      direction = horizontal
        ? target.bounds.x < current.bounds.x ? 'ArrowLeft' : 'ArrowRight'
        : target.bounds.y < current.bounds.y ? 'ArrowUp' : 'ArrowDown';
    } else if (current.key?.startsWith('equipment-slot:') && isCard(targetKey)) direction = 'ArrowDown';
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
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const state = await diagnostic(page);
      const target = state.buttons.find((button) => button.key === matcher);
      expect(target, `Missing Equipment card ${matcher}`).toBeDefined();
      if (!target) return;
      const viewport = page.viewportSize()!;
      const inViewport = target.bounds.y >= 0 && target.bounds.y + target.bounds.height <= viewport.height;
      if (!inViewport || !target.interactive) {
        const scrollLane = state.scroll;
        const touchCapable = await page.evaluate(() => navigator.maxTouchPoints > 0);
        if (scrollLane && touchCapable) {
          const down = target.bounds.y + target.bounds.height > viewport.height;
          const edgeInset = Math.min(12, Math.max(4, (scrollLane.bottom - scrollLane.top) / 8));
          const startY = down ? scrollLane.bottom - edgeInset : scrollLane.top + edgeInset;
          const endY = down ? scrollLane.top + edgeInset : scrollLane.bottom - edgeInset;
          if (viewport.width < 600) {
            await touchDrag(page, { x: viewport.width / 2, y: startY },
              { x: viewport.width / 2, y: endY });
          } else {
            await page.mouse.move(viewport.width / 2, startY);
            await page.mouse.down();
            await page.mouse.move(viewport.width / 2, endY, { steps: 3 });
            await page.mouse.up();
          }
        } else {
          const scrollY = scrollLane
            ? Math.max(scrollLane.top + 8, Math.min(scrollLane.bottom - 8, (scrollLane.top + scrollLane.bottom) / 2))
            : Math.max(120, viewport.height - 80);
          await page.mouse.move(viewport.width / 2, scrollY);
          await page.mouse.wheel(0, target.bounds.y < 0 ? -500 : 500);
        }
        await settle(page);
        continue;
      }
      await focusButton(page, matcher);
      await pressMenuKey(page, 'Enter');
      await settle(page);
      return;
    }
    throw new Error(`Could not bring Equipment card ${matcher} into view`);
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
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y);
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
  if (await page.evaluate(() => navigator.maxTouchPoints > 0) && page.viewportSize()!.width < 600) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await settle(page);
}

async function capture(page: Page, path: string): Promise<void> {
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path }); }
  finally { await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.resume()); }
}

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35, id: 1,
    }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: from.x + (to.x - from.x) * 0.7, y: from.y + (to.y - from.y) * 0.7, id: 1,
    }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function physicalDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await touchDrag(page, from, to);
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
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
  const successNotice = state.copyBounds?.find((copy) => copy.text === 'Equipment upgraded');
  expect(successNotice?.visible).toBe(true);
  expect(successNotice?.bounds.y).toBeGreaterThanOrEqual(0);
  const detailIdentityTop = Math.min(...(state.copyBounds ?? [])
    .filter((copy) => copy.text.includes(longName) && copy.text !== 'Equipment upgraded')
    .map((copy) => copy.bounds.y));
  expect(Number.isFinite(detailIdentityTop)).toBe(true);
  expect(successNotice!.bounds.y + successNotice!.bounds.height).toBeLessThanOrEqual(detailIdentityTop);
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

test('Equipment review requires a fresh keyboard confirm edge and restores semantic focus on Escape', async ({ page }) => {
  test.setTimeout(120_000);
  const instanceId = 'owned:equipment:commando-helmet';
  const summaryKey = `equipment-summary:equipment-candidate:${instanceId}`;
  const detailKeys = [summaryKey, `equipment-inspector:${instanceId}`];
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), storedUpgradeSeed());
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);

  await focusButton(page, `equipment-candidate:${instanceId}`);
  await pressMenuKey(page, 'Enter');
  let state = await diagnostic(page);
  const detail = state.buttons.find((button) => button.text === 'View details');
  expect(detail?.key).toBeDefined();
  expect(detailKeys).toContain(detail!.key);
  await focusButton(page, detail!.key!);
  await pressMenuKey(page, 'Enter');
  state = await diagnostic(page);
  const review = state.buttons.find((button) => button.text === 'Review upgrade');
  expect(review?.key).toBe(`equipment-upgrade:${instanceId}`);
  await focusButton(page, review!.key!);
  const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));

  // Keep the physical Enter down across the detail → review rebuild. The
  // transition may open the review, but the same held edge must not confirm
  // the spend or mutate durable state in the destination panel.
  await waitForMenuInput(page, true);
  await page.keyboard.down('Enter');
  try {
    await waitForMenuInput(page, false);
    await expect.poll(async () => (await diagnostic(page)).copy.join('\n')).toContain('UPGRADE REVIEW');
    state = await diagnostic(page);
    expect(state.buttons.some((button) => button.text === 'Confirm Upgrade • 100 Scrap')).toBe(true);
    expect(state.focusedKey).toBe(`equipment-detail-back:${instanceId}`);
    expect(state.buttons.find((button) => button.key === state.focusedKey)?.text).toBe('Back to candidates');
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
    await waitForMenuInput(page, false);
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  } finally {
    await page.keyboard.up('Enter');
  }
  await waitForMenuInput(page, true);

  await pressMenuKey(page, 'Escape');
  state = await diagnostic(page);
  expect(state.copy.join('\n')).not.toContain('UPGRADE REVIEW');
  expect(state.focusedKey).toBe(`equipment-candidate:${instanceId}`);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);

  // Re-enter through the same keyboard focus contract, then accept exactly
  // one fresh confirm edge in the review destination.
  await pressMenuKey(page, 'Enter');
  state = await diagnostic(page);
  const reopenedDetail = state.buttons.find((button) => button.text === 'View details');
  expect(reopenedDetail?.key).toBeDefined();
  expect(detailKeys).toContain(reopenedDetail!.key);
  await focusButton(page, reopenedDetail!.key!);
  await pressMenuKey(page, 'Enter');
  state = await diagnostic(page);
  const reopenedReview = state.buttons.find((button) => button.text === 'Review upgrade');
  expect(reopenedReview?.key).toBe(`equipment-upgrade:${instanceId}`);
  await focusButton(page, reopenedReview!.key!);
  await pressMenuKey(page, 'Enter');
  state = await diagnostic(page);
  const confirm = state.buttons.find((button) => button.text === 'Confirm Upgrade • 100 Scrap');
  expect(confirm?.key).toBe(`equipment-upgrade-confirm:${instanceId}`);
  await focusButton(page, confirm!.key!);
  await pressMenuKey(page, 'Enter');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipment[instanceId].tier).toBe(2);
  expect(saved.progression.scrap).toBe(0);
  expect((await diagnostic(page)).copy.join('\n')).toContain('Equipment upgraded');
});

test('synthetic touch-device drag released near fixed Equipment actions cannot activate the review', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'requires a touch-capable browser context');
  test.setTimeout(120_000);
  const instanceId = 'owned:equipment:commando-helmet';
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), storedUpgradeSeed());
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);

  await clickButton(page, `equipment-candidate:${instanceId}`);
  await activateButtonText(page, 'View details');
  await activateButtonText(page, 'Review upgrade');
  const before = await diagnostic(page);
  const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  const cancel = before.buttons.find((button) => button.text === 'Cancel Upgrade');
  const confirm = before.buttons.find((button) => button.text === 'Confirm Upgrade • 100 Scrap');
  expect(cancel).toBeDefined();
  expect(confirm).toBeDefined();
  const viewport = page.viewportSize()!;
  const from = {
    x: Math.min(viewport.width - 24, Math.max(24, viewport.width / 2)),
    y: confirm!.bounds.y - 12,
  };
  expect(from.y).toBeLessThan(confirm!.bounds.y);
  expect(before.buttons.some((button) => from.y >= button.bounds.y && from.y <= button.bounds.y + button.bounds.height)).toBe(false);
  const to = { x: cancel!.bounds.x + cancel!.bounds.width / 2, y: cancel!.bounds.y + cancel!.bounds.height / 2 };
  await touchDrag(page, from, to);
  await settle(page);

  const after = await diagnostic(page);
  expect(after.copy.join('\n')).toContain('UPGRADE REVIEW');
  expect(after.buttons.some((button) => button.text === 'Cancel Upgrade')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  await activateButtonText(page, 'Cancel Upgrade');
  expect((await diagnostic(page)).copy.join('\n')).not.toContain('UPGRADE REVIEW');
});

test('synthetic touch-device compact scaled Equipment review keeps the upgrade consequence and Set attribution readable', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 360, height: 500 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), pyroThresholdSeed());
    await page.goto('/?visual-test=1');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    await settle(page);
    await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
    await settle(page);

    await activateButton(page, 'equipment-slot:armour');
    await clickButton(page, 'equipment-candidate:owned:equipment:pyro-armour');
    await activateButtonText(page, 'View details');
    const detailState = await diagnostic(page);
    const detailCopy = detailState.copy.join('\n');
    expect(detailCopy).toContain('SET BONUS GAIN');
    expect(detailCopy).toContain('FIRE');
    expect(detailCopy).toContain('burn');
    await activateButtonText(page, 'Review upgrade');
    for (const viewport of [{ width: 360, height: 500 }, { width: 360, height: 640 },
      { width: 844, height: 390 }, { width: 844, height: 481 }]) {
      await page.setViewportSize(viewport);
      await settle(page);
      if (viewport.width >= 600) await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
      else await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
      const state = await diagnostic(page);
      const copy = state.copy.join('\n');
      expect(copy).toContain('UPGRADE REVIEW');
      expect(copy).toContain('STATS:');
      expect(copy).toContain('COST: 100 Scrap');
      expect(copy).toContain('BALANCE AFTER: 0 Scrap');
      const actions = state.buttons.filter((button) => button.text === 'Confirm Upgrade • 100 Scrap' || button.text === 'Cancel Upgrade');
      expect(actions).toHaveLength(2);
      for (const action of actions) {
        expect(action.visible && action.interactive).toBe(true);
        expect(action.bounds.y).toBeGreaterThanOrEqual(0);
        expect(action.bounds.y + action.bounds.height).toBeLessThanOrEqual(viewport.height);
        expect(action.textInsets.top).toBeGreaterThanOrEqual(6);
        expect(action.textInsets.bottom).toBeGreaterThanOrEqual(6);
      }
      const visibleCopy = (state.copyBounds ?? []).filter((row) => row.visible);
      expect(visibleCopy.length).toBeGreaterThan(0);
      for (const row of visibleCopy) {
        expect(row.bounds.y).toBeGreaterThanOrEqual(0);
        expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(viewport.height);
      }
      await capture(page, testInfo.outputPath(`compact-scaled-pyro-upgrade-review-${viewport.width}x${viewport.height}.png`));
    }
  } finally {
    await context.close();
  }
});

test('fine-pointer landscape Equipment review keeps identity and actions readable without rotate guard', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), pyroThresholdSeed());
    await page.goto('/?visual-test=1');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    await settle(page);
    await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
    await settle(page);

    await activateButton(page, 'equipment-slot:armour');
    await clickButton(page, 'equipment-candidate:owned:equipment:pyro-armour');
    await activateButtonText(page, 'View details');
    await activateButtonText(page, 'Review upgrade');

    await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
    const state = await diagnostic(page);
    const copy = state.copy.join('\n');
    expect(copy).toContain('UPGRADE REVIEW');
    expect(copy).toContain('COST: 100 Scrap');
    expect(copy).toContain('BALANCE AFTER: 0 Scrap');
    const actions = state.buttons.filter((button) => button.text === 'Confirm Upgrade • 100 Scrap' || button.text === 'Cancel Upgrade');
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.visible && action.interactive).toBe(true);
      expect(action.bounds.y).toBeGreaterThanOrEqual(0);
      expect(action.bounds.y + action.bounds.height).toBeLessThanOrEqual(390);
      expect(action.textInsets.top).toBeGreaterThanOrEqual(6);
      expect(action.textInsets.bottom).toBeGreaterThanOrEqual(6);
    }
    const visibleCopy = (state.copyBounds ?? []).filter((row) => row.visible);
    expect(visibleCopy.length).toBeGreaterThan(0);
    for (const row of visibleCopy) {
      expect(row.bounds.y).toBeGreaterThanOrEqual(0);
      expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(390);
    }
    await capture(page, testInfo.outputPath('fine-pointer-landscape-pyro-upgrade-review-844x390.png'));
  } finally {
    await context.close();
  }
});

test('compact Equipment browse keeps header controls and inventory end reachable', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const viewports = [{ width: 360, height: 500 }, { width: 360, height: 640 },
    { width: 844, height: 390 }, { width: 844, height: 481 }];
  for (const viewport of viewports) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport,
      deviceScaleFactor: viewport.width === 360 ? 2 : 1,
      hasTouch: viewport.width === 360,
      isMobile: viewport.width === 360,
    });
    const page = await context.newPage();
    try {
      await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), pyroThresholdSeed());
      await page.goto('/?visual-test=1');
      await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
      await settle(page);
      await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
      await settle(page);
      const initial = await diagnostic(page);
      const headerKeys = ['equipment-slot:helmet', 'equipment-slot:armour', 'equipment-slot:gloves',
        'equipment-slot:boots', 'equipment:browse-sets'];
      for (const key of headerKeys) {
        const button = initial.buttons.find((candidate) => candidate.key === key);
        expect(button, `Missing compact header control ${key}`).toBeDefined();
        expect(button?.visible && button?.interactive).toBe(true);
        expect(button!.bounds.y).toBeGreaterThanOrEqual(0);
        expect(button!.bounds.y + button!.bounds.height).toBeLessThanOrEqual(viewport.height);
      }
      expect(initial.scroll?.bottom).toBeGreaterThan(initial.scroll?.top ?? 0);
      expect(initial.scroll?.contentHeight).toBeGreaterThan(initial.scroll?.bottom ?? 0);

      const browse = initial.buttons.find((button) => button.key === 'equipment:browse-sets')!;
      const saveBeforeDrag = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
      const dragStart = {
        x: Math.min(viewport.width - 18, Math.max(18, viewport.width / 2)),
        y: Math.max(initial.scroll!.top + 12, initial.scroll!.bottom - 12),
      };
      await physicalDrag(page, dragStart, {
        x: browse.bounds.x + browse.bounds.width / 2,
        y: browse.bounds.y + browse.bounds.height / 2,
      });
      await settle(page);
      const afterDrag = await diagnostic(page);
      expect(afterDrag.buttons.find((button) => button.key === 'equipment:browse-sets')?.text).toBe('BROWSE SETS');
      expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBeforeDrag);
      expect(afterDrag.equipment?.selectedInstanceId).toBeUndefined();

      const lastCandidate = 'equipment-candidate:owned:equipment:technician-helmet';
      await clickButton(page, lastCandidate);
      const endState = await diagnostic(page);
      expect(endState.equipment?.selectedInstanceId).toBe('owned:equipment:technician-helmet');
      expect(endState.scroll?.offset).toBeGreaterThan(0);
      expect(endState.scroll?.contentHeight).toBeGreaterThan(endState.scroll?.bottom ?? 0);
      if (viewport.width >= 600) {
        const selectedCard = endState.buttons.find((button) => button.key === lastCandidate);
        expect(selectedCard?.visible && selectedCard?.interactive).toBe(true);
        expect(selectedCard!.bounds.y).toBeGreaterThanOrEqual(endState.scroll!.top);
        expect(selectedCard!.bounds.y + selectedCard!.bounds.height).toBeLessThanOrEqual(endState.scroll!.bottom);
        // The card's actual two-line name/status label and art reserve must
        // remain inside the shared scroll viewport; a positive-height mask
        // alone would still permit a one-pixel card-top slit.
        expect(selectedCard!.bounds.y + selectedCard!.textInsets.top + 34)
          .toBeLessThanOrEqual(endState.scroll!.bottom);
        const selectedCopy = endState.copyBounds?.find((copy) => copy.text === selectedCard!.text);
        expect(selectedCopy?.visible).toBe(true);
        expect(selectedCopy!.bounds.y + selectedCopy!.bounds.height).toBeLessThanOrEqual(endState.scroll!.bottom);
        const selectedSummary = endState.copyBounds?.find((copy) => copy.text.startsWith('SELECTED'));
        expect(selectedSummary?.text).toContain('Technician Helmet');
        expect(selectedSummary?.text).toContain('STORED');
      }
      await capture(page, testInfo.outputPath(`compact-equipment-inventory-end-${viewport.width}x${viewport.height}.png`));
    } finally {
      await context.close();
    }
  }
});

test('synthetic touch-device Equipment browse drag and tap reach inventory without keyboard focus', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), pyroThresholdSeed());
    await page.goto('/?visual-test=1');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    await settle(page);
    await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
    await settle(page);
    const initial = await diagnostic(page);
    expect(initial.scroll?.bottom).toBeGreaterThan(initial.scroll?.top ?? 0);
    const targetKey = 'equipment-candidate:owned:equipment:technician-helmet';
    let scrolled = initial;
    let target = scrolled.buttons.find((button) => button.key === targetKey);
    const targetFitsScroll = (): boolean => target?.visible === true && target.interactive
      && target.bounds.y >= (scrolled.scroll?.top ?? 0)
      && target.bounds.y + target.bounds.height <= (scrolled.scroll?.bottom ?? 0);
    for (let attempt = 0; attempt < 24 && !targetFitsScroll(); attempt += 1) {
      const scroll = scrolled.scroll!;
      await touchDrag(page,
        { x: 180, y: scroll.bottom - 12 },
        { x: 180, y: scroll.top + 12 });
      await settle(page);
      scrolled = await diagnostic(page);
      target = scrolled.buttons.find((button) => button.key === targetKey);
    }
    expect(targetFitsScroll()).toBe(true);
    expect(scrolled.scroll?.offset).toBeGreaterThan(0);
    expect(target!.bounds.y).toBeGreaterThanOrEqual(scrolled.scroll!.top);
    expect(target!.bounds.y + target!.bounds.height).toBeLessThanOrEqual(scrolled.scroll!.bottom);
    const saveBefore = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
    // Pure touch path: no semantic focus helper, keyboard key, or Enter edge.
    await page.touchscreen.tap(target!.bounds.x + target!.bounds.width / 2, target!.bounds.y + target!.bounds.height / 2);
    await settle(page);
    const selected = await diagnostic(page);
    expect(selected.equipment?.selectedInstanceId).toBe('owned:equipment:technician-helmet');
    expect(selected.copy.join('\n')).toContain('SELECTED');
    expect(selected.copy.join('\n')).toContain('Technician Helmet');
    expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  } finally {
    await context.close();
  }
});

test('Upgrade review remains reachable across measured short-height layouts', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 360, height: 500 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const longName = 'Commando Helmet With A Deliberately Long Engineering Upgrade Review Name';
    await installLongNameFixture(page, longName);
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
  for (const viewport of [{ width: 360, height: 500 }, { width: 360, height: 640 },
    { width: 844, height: 390 }, { width: 844, height: 481 }]) {
    await page.setViewportSize(viewport);
    await settle(page);
    const state = await diagnostic(page);
    const copy = state.copy.join('\n');
    expect(copy).toContain('UPGRADE REVIEW');
    expect(copy).toContain(`UPGRADE REVIEW • ${longName}`);
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
    for (const row of (state.copyBounds ?? []).filter((candidate) => candidate.visible)) {
      expect(row.bounds.y).toBeGreaterThanOrEqual(0);
      expect(row.bounds.y + row.bounds.height).toBeLessThanOrEqual(viewport.height);
    }
  }
  await page.setViewportSize({ width: 360, height: 500 });
  await settle(page);
  await activateButtonText(page, 'Cancel Upgrade');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  expect((await diagnostic(page)).copy.join('\n')).not.toContain('UPGRADE REVIEW');
  expect((await diagnostic(page)).buttons.some((button) => button.text === `Equip ${longName}`)).toBe(true);
  await activateButtonText(page, 'Review upgrade');
  await activateButtonText(page, 'Cancel Upgrade');
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saveBefore);
  expect((await diagnostic(page)).buttons.some((button) => button.text === `Equip ${longName}`)).toBe(true);
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
  const scrollFactsPath = testInfo.outputPath('equipment-filtered-scroll-return-facts.json');
  await writeFile(scrollFactsPath, JSON.stringify({ beforeDetail: beforeDetail.scroll, returned: returned.scroll }));
  await testInfo.attach('equipment-filtered-scroll-return-facts', {
    path: scrollFactsPath,
    contentType: 'application/json',
  });
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
