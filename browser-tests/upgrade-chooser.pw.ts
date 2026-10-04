import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type Rect = { x: number; y: number; width: number; height: number };
type TextRow = Rect & { role: string; text: string; visible: boolean; fontSize: number; physicalFontSize: number; physicalNaturalHeight: number; clipped: boolean; rasterScale: number };
type Diagnostics = {
  offerId?: number; choiceIds: string[]; catalogIds: string[]; rebuildCount: number;
  cards: Array<Rect & { focused: boolean; interactive: boolean; fillColor: number; stroke: { visible: boolean; isStroked: boolean; color: number; alpha: number; width: number; physicalWidth: number } }>;
  text: TextRow[]; icons: Array<Rect & { index: number; artId: string; textureKey: string; visible: boolean }>;
  status: string; pauseReason?: string; stacks: Record<string, number>;
  chosenIds: string[]; pendingCount: number; inputMode: string; inputNeutral: boolean;
  orientationBlocked: boolean; reducedMotion: boolean; canvas: Rect; devicePixelRatio: number;
};
type Seam = {
  waitForMenuPresentation(): Promise<boolean>;
  waitForPreparedGame(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>;
  prepareUpgradeOffer(ids: readonly string[], owned?: Record<string, number>, pendingLevels?: number): boolean;
  upgradeChooserDiagnostics(): Diagnostics;
  setUpgradeTestReducedMotion(value: boolean): boolean;
  removeUpgradeTestArt(id: string, kind: 'texture' | 'frame'): boolean;
};
type BrowserGlobals = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: Seam;
  __UPGRADE_PAD__?: (button: number, pressed: boolean) => void;
};

// Independent, literal player-facing expectations for the shipped catalog.
// These assert values and tradeoffs instead of deriving strings from the UI
// formatter or parsing the prose descriptions it replaces.
const CARDS = [
  ['quick-paws', 'Quick Paws', '+8% movement speed', 'Mercenary', 5],
  ['extra-scrap', 'Extra Scrap', '+25% Scrap gained', 'Run', 3],
  ['hot-barrel', 'Hot Barrel', '+12% fire rate', 'All weapons', 4],
  ['scrap-magnet', 'Scrap Magnet', '+25% pickup radius', 'Mercenary', 4],
  ['reinforced-coat', 'Reinforced Coat', '+12% max health', 'Mercenary', 4],
  ['fast-learner', 'Fast Learner', '+15% XP gained', 'Run', 3],
  ['heavy-rounds', 'Heavy Rounds', '+20% damage · −6% fire rate', 'All weapons', 3],
  ['long-barrel', 'Long Barrel', '+10% range · +12% projectile speed', 'All weapons', 3],
  ['split-shot', 'Split Shot', '+1 projectile · +4° spread', 'All weapons', 2],
  ['punch-through', 'Punch Through', '+1 enemy pierced', 'All weapons', 2],
  ['glass-cannon', 'Glass Cannon', '+30% damage · −10% max health', 'Run', 2],
  ['run-and-gun', 'Run and Gun', '+6% movement speed · +6% fire rate', 'Run', 3],
  ['pistol-deadeye', 'Pistol Deadeye', '+22% damage · +5% range', 'Pistol', 3],
  ['pistol-needle-rounds', 'Pistol Needle Rounds', '+1 enemy pierced · −8% damage', 'Pistol', 2],
  ['smg-overclock', 'SMG Overclock', '+15% fire rate · −5% damage', 'SMG', 2],
  ['smg-spray', 'SMG Spray', '+1 projectile · +5° spread · −5% fire rate', 'SMG', 2],
  ['shotgun-buckshot', 'Shotgun Buckshot', '+1 projectile · +4° spread', 'Shotgun', 2],
  ['shotgun-breacher', 'Shotgun Breacher', '+25% damage · −12% range', 'Shotgun', 3],
] as const;
const FIRST_FOUR = CARDS.slice(0, 4).map(row => row[0]);
const OWNED = { 'quick-paws': 4, 'extra-scrap': 1, 'pistol-needle-rounds': 1 };

async function launch(page: Page): Promise<void> {
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  await page.keyboard.down('Enter');
  try {
    expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  } finally { await page.keyboard.up('Enter'); }
  await frames(page);
}

async function frames(page: Page, count = 2): Promise<void> {
  for (let index = 0; index < count; index++) {
    expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
  }
}

async function diagnostics(page: Page): Promise<Diagnostics> {
  return page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.upgradeChooserDiagnostics());
}

async function prepare(page: Page, ids = FIRST_FOUR, owned: Record<string, number> = {}, pendingLevels = 1): Promise<Diagnostics> {
  expect(await page.evaluate(({ ids, owned, pendingLevels }) =>
    (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.prepareUpgradeOffer(ids, owned, pendingLevels),
  { ids, owned, pendingLevels })).toBe(true);
  await frames(page);
  const state = await diagnostics(page);
  expect(state.status).toBe('paused');
  expect(state.pauseReason).toBe('levelUp');
  expect([...state.choiceIds].sort()).toEqual([...ids].sort());
  expect(state.pendingCount).toBe(pendingLevels);
  return state;
}

function within(inner: Rect, outer: Rect, tolerance = 0.5): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

function assertReadable(state: Diagnostics, owned: Record<string, number> = {}): void {
  expect(state.cards).toHaveLength(state.choiceIds.length);
  expect(state.icons).toHaveLength(state.choiceIds.length);
  const nameFonts = new Set<number>();
  state.choiceIds.forEach((id, index) => {
    const expected = CARDS.find(row => row[0] === id)!;
    const card = state.cards[index];
    const current = owned[id] ?? 0;
    const max = expected[4];
    const status = `${expected[3]} · ${current ? 'OWNED' : 'NEW'} ${current} → ${current + 1}/${max}${current + 1 === max ? ' MAX' : ''}`;
    within(card, state.canvas);
    expect(card.interactive).toBe(true);
    expect(card.height).toBeGreaterThanOrEqual(44);
    const name = state.text.find(row => row.role === `name:${index}`)!;
    const effect = state.text.find(row => row.role === `description:${index}`)!;
    const footer = state.text.find(row => row.role === `status:${index}`)!;
    const rarity = state.text.find(row => row.role === `rarity:${index}`)!;
    expect(name.text).toBe(expected[1]);
    expect(effect.text).toBe(expected[2]);
    expect(footer.text).toBe(status);
    nameFonts.add(name.fontSize);
    expect(name.physicalFontSize).toBeGreaterThanOrEqual(17.9);
    expect(effect.physicalFontSize).toBeGreaterThanOrEqual(13.9);
    for (const row of [name, effect, footer, rarity]) {
      expect(row.visible, `${id} ${row.role}`).toBe(true);
      expect(row.clipped, `${id} ${row.role}`).toBe(false);
      expect(row.rasterScale, `${id} ${row.role}: real glyph scale matches measured layout`).toBe(1);
      expect(row.physicalNaturalHeight, `${id} ${row.role}`).toBeLessThanOrEqual(row.height + 0.1);
      within(row, card);
    }
    const icon = state.icons.find(row => row.index === index)!;
    expect(icon.artId).toBe(`upgrade-icon:${id}`);
    expect(icon.visible).toBe(true);
    within(icon, card);
  });
  expect(nameFonts.size).toBe(1);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  const factsPath = testInfo.outputPath(`${name}-facts.json`);
  await page.screenshot({ path });
  await writeFile(factsPath, JSON.stringify(await diagnostics(page), null, 2));
  await testInfo.attach(name, { path, contentType: 'image/png' });
  await testInfo.attach(`${name}-facts`, { path: factsPath, contentType: 'application/json' });
}

function assertFocusPaint(state: Diagnostics, index: number): void {
  const stroke = state.cards[index].stroke;
  expect(stroke.visible).toBe(true);
  expect(stroke.isStroked).toBe(true);
  expect(stroke.color).toBe(0xf7f1d5);
  expect(stroke.alpha).toBe(1);
  expect(stroke.width).toBe(2);
  expect(stroke.physicalWidth).toBeGreaterThanOrEqual(2);
  expect(state.cards.flatMap((card, index) => card.stroke.isStroked && card.stroke.alpha > 0 ? [index] : [])).toEqual([index]);
}

test('every shipped upgrade keeps its full name, exact effects, scope, stacks and authored icon', async ({ page }, testInfo) => {
  await launch(page);
  for (let start = 0; start < CARDS.length; start += 4) {
    const ids = CARDS.slice(start, start + 4).map(row => row[0]);
    const owned = Object.fromEntries(Object.entries(OWNED).filter(([id]) => ids.includes(id as typeof ids[number])));
    const state = await prepare(page, ids, owned);
    expect([...state.catalogIds].sort()).toEqual(CARDS.map(row => row[0]).sort());
    assertReadable(state, owned);
    await capture(page, testInfo, `catalog-${start / 4 + 1}`);
    const selected = state.choiceIds[0];
    await page.keyboard.press('1');
    await expect.poll(async () => (await diagnostics(page)).chosenIds).toEqual([selected]);
    expect((await diagnostics(page)).stacks[selected]).toBe((owned[selected] ?? 0) + 1);
  }
});

test('touch and pointer commands require a fresh down on the same live card', async ({ page }, testInfo) => {
  await launch(page);
  const first = await prepare(page, FIRST_FOUR, {}, 2);
  const a = first.cards[0]; const b = first.cards[1];
  const point = (card: Rect) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 });
  await page.mouse.move(point(a).x, point(a).y);
  await page.mouse.up(); // No arm.
  await frames(page);
  expect((await diagnostics(page)).chosenIds).toEqual([]);
  const hovered = await diagnostics(page);
  expect(hovered.cards[0].fillColor).toBe(0x214756);
  assertFocusPaint(hovered, 0);
  await capture(page, testInfo, 'pointer-hover');
  await page.mouse.down();
  await frames(page);
  const pressed = await diagnostics(page);
  expect(pressed.cards[0].fillColor).toBe(0x2c6263);
  assertFocusPaint(pressed, 0);
  await capture(page, testInfo, 'pointer-pressed');
  await page.mouse.move(point(b).x, point(b).y);
  await page.mouse.up(); // Down A, release B.
  await frames(page);
  expect((await diagnostics(page)).chosenIds).toEqual([]);
  await page.mouse.move(point(a).x, point(a).y);
  await page.mouse.down();
  await page.keyboard.press('1'); // Resolve while old pointer is held.
  await expect.poll(async () => (await diagnostics(page)).chosenIds.length).toBe(1);
  const second = await diagnostics(page);
  expect(second.offerId).not.toBe(first.offerId);
  await page.mouse.up(); // Release cannot submit replacement offer.
  await frames(page);
  expect((await diagnostics(page)).chosenIds.length).toBe(1);
  const target = point(second.cards[1]);
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await diagnostics(page)).chosenIds.length).toBe(2);
  const final = await diagnostics(page);
  expect(final.chosenIds[1]).toBe(second.choiceIds[1]);
  expect(final.pendingCount).toBe(0);
  expect(final.status).toBe('active');
});

test('keyboard and number-key holds consume one queued offer and require a fresh confirm', async ({ page }) => {
  await launch(page);
  const first = await prepare(page, FIRST_FOUR, {}, 3);
  await page.keyboard.down('1');
  await page.keyboard.down('1'); // Browser emits repeat=true for held key.
  await frames(page, 5);
  expect((await diagnostics(page)).chosenIds).toEqual([first.choiceIds[0]]);
  await page.keyboard.up('1');
  await page.keyboard.press('ArrowDown');
  const second = await diagnostics(page);
  expect(second.cards[1].focused).toBe(true);
  await page.keyboard.down('Enter');
  await frames(page, 5);
  expect((await diagnostics(page)).chosenIds).toEqual([first.choiceIds[0], second.choiceIds[1]]);
  expect((await diagnostics(page)).pendingCount).toBe(1);
  await page.keyboard.up('Enter');
  await frames(page);
  const third = await diagnostics(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await diagnostics(page)).chosenIds.length).toBe(3);
  expect((await diagnostics(page)).chosenIds[2]).toBe(third.choiceIds[0]);
  expect((await diagnostics(page)).status).toBe('active');
});

test('resize rebuild preserves the current token and keyboard focus', async ({ page }, testInfo) => {
  await launch(page);
  await prepare(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const before = await diagnostics(page);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: viewport.height + 20 });
  await expect.poll(async () => (await diagnostics(page)).rebuildCount).toBeGreaterThan(before.rebuildCount);
  const resized = await diagnostics(page);
  expect(resized.offerId).toBe(before.offerId);
  expect(resized.choiceIds).toEqual(before.choiceIds);
  expect(resized.cards[2].focused).toBe(true);
  assertReadable(resized);
  await page.setViewportSize(viewport);
  await expect.poll(async () => (await diagnostics(page)).rebuildCount).toBeGreaterThan(resized.rebuildCount);
  await capture(page, testInfo, 'resized-restored');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await diagnostics(page)).chosenIds).toEqual([before.choiceIds[2]]);
});

for (const kind of ['texture', 'frame'] as const) {
  test(`missing ${kind} keeps real card input usable with reduced motion`, async ({ page }) => {
    await launch(page);
    expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.setUpgradeTestReducedMotion(true))).toBe(true);
    expect(await page.evaluate(kind => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.removeUpgradeTestArt('quick-paws', kind), kind)).toBe(true);
    const state = await prepare(page);
    const index = state.choiceIds.indexOf('quick-paws');
    expect(state.reducedMotion).toBe(true);
    expect(state.icons.some(row => row.index === index)).toBe(false);
    expect(state.text.find(row => row.role === `number:${index}`)?.visible).toBe(true);
    await page.keyboard.press(String(index + 1));
    await expect.poll(async () => (await diagnostics(page)).chosenIds).toEqual(['quick-paws']);
    expect((await diagnostics(page)).status).toBe('active');
  });
}

test('virtual controller is polled by the real input owner and held confirm cannot drain the queue', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const pad = { id: 'Upgrade browser standard controller', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (globalThis as BrowserGlobals).__UPGRADE_PAD__ = (button, pressed) => {
      pad.buttons[button] = { value: pressed ? 1 : 0, pressed, touched: pressed };
      pad.timestamp = performance.now();
    };
  });
  await launch(page);
  await prepare(page, FIRST_FOUR, {}, 2);
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(13, true));
  await frames(page);
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(13, false));
  await frames(page);
  const first = await diagnostics(page);
  expect(first.inputMode).toBe('gamepad');
  expect(first.cards[1].focused).toBe(true);
  assertFocusPaint(first, 1);
  await capture(page, testInfo, 'controller-focused');
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(0, true));
  // A keyboard confirm while the same logical confirm remains held on the
  // pad is coalesced. Releasing one source cannot manufacture a new edge.
  await page.keyboard.down('Enter');
  await frames(page, 5);
  expect((await diagnostics(page)).chosenIds).toEqual([first.choiceIds[1]]);
  expect((await diagnostics(page)).pendingCount).toBe(1);
  await page.keyboard.up('Enter');
  await frames(page);
  expect((await diagnostics(page)).chosenIds).toEqual([first.choiceIds[1]]);
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(0, false));
  await frames(page);
  const second = await diagnostics(page);
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(0, true));
  await expect.poll(async () => (await diagnostics(page)).chosenIds).toEqual([first.choiceIds[1], second.choiceIds[0]]);
  await page.evaluate(() => (globalThis as BrowserGlobals).__UPGRADE_PAD__!(0, false));
  expect((await diagnostics(page)).status).toBe('active');
});

test('390px DPR3 portrait and blocked 844px landscape restore the same production offer', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390x844');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await launch(page);
    const initial = await prepare(page);
    assertReadable(initial);
    expect(initial.devicePixelRatio).toBe(3);
    await capture(page, testInfo, 'portrait-dpr3');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    expect((await diagnostics(page)).chosenIds).toEqual([]);
    expect((await diagnostics(page)).offerId).toBe(initial.offerId);
    await capture(page, testInfo, 'landscape-blocked');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
    await frames(page);
    const restored = await diagnostics(page);
    expect(restored.offerId).toBe(initial.offerId);
    expect(restored.choiceIds).toEqual(initial.choiceIds);
    assertReadable(restored);
    await page.touchscreen.tap(restored.cards[1].x + restored.cards[1].width / 2, restored.cards[1].y + restored.cards[1].height / 2);
    await expect.poll(async () => (await diagnostics(page)).chosenIds).toEqual([restored.choiceIds[1]]);
  } finally { await context.close(); }
});
