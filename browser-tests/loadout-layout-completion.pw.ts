import { writeFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type Button = { key?: string; text: string; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; copy: string[]; buttons: Button[];
  scroll?: { top: number; bottom: number; offset: number } };
type Art = { texture: string; frame: string | number; x: number; y: number;
  width: number; height: number; alpha: number; visible: boolean;
  crop?: { x: number; y: number; width: number; height: number } };
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: {
  showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>; menuLoadoutDiagnostics(): Diagnostic; menuArtDiagnostics(): Art[];
  freeze(): Promise<void>; resume(): void } };
const seed = { version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
  progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] }, stages: {}, achievements: {}, characters: {},
  gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
    builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] },
      { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] },
      { id: 'build:shotgun', name: 'Shotgun Build', baseWeaponFamily: 'shotgun', fitted: {}, traitParts: [] }],
    parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
      compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
  equipment: { helmet: { equipmentId: 'equipment:scavenger-helmet', tier: 1 },
    armour: { equipmentId: 'equipment:scavenger-armour', tier: 1 } },
  equipmentLoadout: { helmet: 'helmet', armour: 'armour' } };
const read = (page: Page) => page.evaluate(() => ({
  diagnostic: (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics(),
  art: (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.menuArtDiagnostics(),
  saved: localStorage.getItem('meowcenary.save.v2')!,
}));
async function open(page: Page, panel: string) {
  await page.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed);
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(panel => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu(panel), panel)).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
}
async function pulse(page: Page, key: string) {
  await page.keyboard.down(key);
  try { expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true); }
  finally { await page.keyboard.up(key); }
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame());
}
async function focus(page: Page, key: string) {
  const first = await read(page);
  expect(first.diagnostic.buttons.some(button => button.key === key), `semantic target ${key}`).toBe(true);
  for (let count = 0; count < first.diagnostic.buttons.length + 4; count += 1) {
    const { diagnostic } = await read(page);
    if (diagnostic.focusedKey === key) return;
    const current = diagnostic.buttons.findIndex(button => button.key === diagnostic.focusedKey);
    const target = diagnostic.buttons.findIndex(button => button.key === key);
    expect(current).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    const columns = diagnostic.panel === 'loadout' || page.viewportSize()!.width >= 1000 ? 4 : 2;
    let direction = current < target ? 'ArrowRight' : 'ArrowLeft';
    if (diagnostic.panel === 'gunsmith') {
      const count = diagnostic.buttons.length;
      direction = (target - current + count) % count <= (current - target + count) % count
        ? 'ArrowRight' : 'ArrowLeft';
    }
    if (diagnostic.panel === 'equipment' || diagnostic.panel === 'loadout') {
      if (current < 4 && target >= 4) direction = 'ArrowDown';
      else if (current >= 4 && target < 4) direction = current > 4 ? 'ArrowLeft' : 'ArrowUp';
      else if (current < 4 && target < 4 && Math.floor(current / columns) !== Math.floor(target / columns))
        direction = current < target ? 'ArrowDown' : 'ArrowUp';
    }
    await pulse(page, direction);
  }
  throw new Error(`Focus did not reach ${key}: ${JSON.stringify((await read(page)).diagnostic)}`);
}
async function activate(page: Page, key: string, testInfo: TestInfo): Promise<void> {
  return activateByPointerScroll(page, key, testInfo);
}
async function activateByPointerScroll(page: Page, key: string, testInfo: TestInfo, hover = false): Promise<void> {
  // Pointer/touch journeys reveal with their own real wheel/drag gestures.
  // Native keyboard/controller navigation has separate release/held-edge cases.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { diagnostic } = await read(page);
    const target = diagnostic.buttons.find(button => button.key === key);
    expect(target, `semantic pointer target ${key}`).toBeDefined();
    const top = diagnostic.scroll?.top ?? 0;
    const bottom = diagnostic.scroll?.bottom ?? page.viewportSize()!.height;
    const visibleTop = Math.max(top, target!.bounds.y);
    const visibleBottom = Math.min(bottom, target!.bounds.y + target!.bounds.height);
    const x = target!.bounds.x + target!.bounds.width / 2;
    if (target!.visible && target!.interactive && visibleBottom > visibleTop) {
      const y = (visibleTop + visibleBottom) / 2;
      if (hover) {
        expect(testInfo.project.use.hasTouch).toBeFalsy();
        await page.mouse.move(x, y);
        expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
        expect((await read(page)).diagnostic.focusedKey).toBe(key);
      } else {
        if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
      }
      return;
    }
    const middle = (top + bottom) / 2;
    const delta = target!.bounds.y + target!.bounds.height / 2 - middle;
    if (testInfo.project.use.hasTouch) {
      const session = await page.context().newCDPSession(page);
      const distance = Math.max(-(bottom - top) * 0.65, Math.min((bottom - top) * 0.65, delta));
      const gestureX = page.viewportSize()!.width * 0.82;
      const startY = middle + distance / 2;
      try {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gestureX, y: startY, id: 1 }] });
        for (let step = 1; step <= 3; step += 1) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: [{ x: gestureX, y: startY - distance * step / 3, id: 1 }] });
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
        }
      } finally {
        try { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        finally { await session.detach(); }
      }
    } else {
      await page.mouse.move(x, middle);
      await page.mouse.wheel(0, delta);
    }
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
  }
  throw new Error(`Pointer scroll did not reveal ${key}: ${JSON.stringify((await read(page)).diagnostic)}`);
}
async function evidence(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path, scale: 'css' }); }
  finally { await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.resume()); }
  await testInfo.attach(name, { path, contentType: 'image/png' });
  const factsPath = testInfo.outputPath(`${name}-facts.json`);
  await writeFile(factsPath, JSON.stringify(await read(page), null, 2));
  await testInfo.attach(`${name}-facts`, { path: factsPath, contentType: 'application/json' });
}
// Literal opaque bounds of the approved native frames. These expectations are
// independent of the production framing helper and also run against main's dist.
function alpha(row: Art, frameWidth: number, frameHeight: number, left: number, top: number, width: number, height: number) {
  return { x: row.x - row.width / 2 + left * row.width / frameWidth,
    y: row.y - row.height / 2 + top * row.height / frameHeight,
    width: width * row.width / frameWidth, height: height * row.height / frameHeight };
}
test('Equipment renders the equipped native helmet at the approved visible size', async ({ page }, testInfo) => {
  await open(page, 'equipment');
  await evidence(page, testInfo, 'equipment-native-size');
  const state = await read(page);
  const rows = state.art.filter(row => row.frame === 'equipment-icon:scavenger-helmet' && row.alpha === 1 && row.visible);
  expect(rows.length).toBeGreaterThan(0);
  const slot = state.diagnostic.buttons.find(button => button.key === 'equipment-slot:helmet')!.bounds;
  const visible = rows.map(row => alpha(row, 96, 96, 10, 10, 76, 75)).filter(bounds =>
    bounds.x >= slot.x && bounds.x + bounds.width <= slot.x + slot.width
    && bounds.y >= slot.y && bounds.y + bounds.height <= slot.y + slot.height);
  expect(visible.length, 'visible native artwork belongs to the equipped slot').toBeGreaterThan(0);
  const target = page.viewportSize()!.width < 380 ? 128 : page.viewportSize()!.width < 600 ? 144 : 264;
  // Normalize sub-picometre IEEE754 multiplication noise, not pixel tolerance.
  const extent = Number(Math.max(...visible.map(bounds => Math.max(bounds.width, bounds.height))).toFixed(9));
  if (page.viewportSize()!.width >= 1000 && page.viewportSize()!.width < 1200) {
    expect(extent).toBeGreaterThanOrEqual(240);
    expect(extent).toBeLessThanOrEqual(264);
    for (const button of state.diagnostic.buttons.slice(0, 4)) {
      expect(button.bounds.y).toBeGreaterThanOrEqual(state.diagnostic.scroll!.top);
      expect(button.bounds.y + button.bounds.height).toBeLessThanOrEqual(state.diagnostic.scroll!.bottom);
    }
  } else expect(extent).toBeCloseTo(target, 1);
  expect(JSON.parse(state.saved).equipmentLoadout.helmet).toBe('helmet');
});
test('Gunsmith Pistol chassis and receiver use one native assembly transform at the approved visible width', async ({ page }, testInfo) => {
  await open(page, 'gunsmith');
  await evidence(page, testInfo, 'pistol-native-assembly');
  const state = await read(page);
  expect(state.art.some(row => row.texture === 'art-figma-menu-chrome'
    && row.frame === 'ui-chrome:figma-card' && row.visible && row.alpha > 0),
  'direct cold Gunsmith entry closes shared chrome without visiting Equipment').toBe(true);
  const receiver = state.art.find(row => row.frame === 'gun-build-part:receiver-heavy:t2' && row.alpha === 1)!;
  expect(receiver).toBeDefined();
  const base = state.art.find(row => row.frame === 'gun-build-base:pistol' && row.alpha === 1 && row.x === receiver.x && row.y === receiver.y)!;
  expect(base).toBeDefined(); expect(receiver).toBeDefined();
  expect(base.crop).toEqual({ x: 87, y: 67, width: 114, height: 104 });
  expect(receiver.crop).toEqual({ x: 103, y: 63, width: 74, height: 59 });
  expect([receiver.x, receiver.y, receiver.width, receiver.height]).toEqual([base.x, base.y, base.width, base.height]);
  const a = alpha(base, 358, 196, 89, 69, 110, 100);
  const b = alpha(receiver, 358, 196, 105, 65, 70, 55);
  const unionWidth = Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x);
  const width = page.viewportSize()!.width;
  expect(unionWidth).toBeCloseTo(Math.min(700, width - 64), 1);
  expect(JSON.parse(state.saved).gunsmith.builds[0].fitted.receiver).toBe('heavy');
});
test('Gunsmith candidate touch or pointer previews replacement before a separate commit', async ({ page }, testInfo) => {
  await open(page, 'gunsmith');
  const before = await read(page);
  await activate(page, 'gunsmith-part:compact', testInfo);
  await evidence(page, testInfo, 'replacement-preview');
  const preview = await read(page);
  expect(preview.saved).toBe(before.saved);
  expect(preview.diagnostic.focusedKey).toBe('gunsmith-commit');
  expect(preview.diagnostic.buttons.find(button => button.key === 'gunsmith-commit')!.text).toContain('REPLACE HEAVY RECEIVER T2');
  expect(preview.diagnostic.copy.join('\n')).toContain('Heavy Receiver T2 returns to STORED.');
  expect(preview.diagnostic.copy.join('\n')).toContain('Damage • 9.92 to 8');
  expect(preview.diagnostic.copy.join('\n')).toContain('Fire Rate • 1.35/s to 1.66/s');
  const chassis = preview.art.filter(row => row.frame === 'gun-build-base:pistol' && row.alpha === 1);
  const heavy = preview.art.find(row => row.frame === 'gun-build-part:receiver-heavy:t2' && row.alpha === 1)!;
  const compact = preview.art.find(row => row.frame === 'gun-build-part:receiver-compact:t1' && row.alpha === 1)!;
  expect(chassis).toHaveLength(2);
  for (const part of [heavy, compact]) {
    expect(part).toBeDefined();
    const base = chassis.find(row => row.y === part.y)!;
    expect(base).toBeDefined();
    expect([part.x, part.y, part.width, part.height]).toEqual([base.x, base.y, base.width, base.height]);
  }
  expect([chassis[0]!.x, chassis[0]!.width, chassis[0]!.height]).toEqual([chassis[1]!.x, chassis[1]!.width, chassis[1]!.height]);
  await pulse(page, 'Enter');
  await expect.poll(async () => JSON.parse((await read(page)).saved).gunsmith.builds[0].fitted.receiver).toBe('compact');
  const committed = await read(page);
  expect(JSON.parse(committed.saved).gunsmith.parts.heavy).toMatchObject({ partId: 'part:receiver-heavy', tier: 2 });
  expect(committed.diagnostic.focusedKey).toBe('gunsmith-inspect:compact');
  expect(JSON.parse(committed.saved).progression.scrap).toBe(640);
});

type Fixture = typeof globalThis & { __loadoutStorage: { fail: boolean; attempts: number; writes: number };
  __loadoutPad: { connected: boolean; pressed: number } };
async function storageFixture(page: Page) {
  await page.addInitScript(() => {
    const observer = { fail: false, attempts: 0, writes: 0 };
    (globalThis as Fixture).__loadoutStorage = observer;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'meowcenary.save.v2') {
        observer.attempts += 1;
        if (observer.fail) throw new DOMException('Fixture storage unavailable', 'QuotaExceededError');
      }
      original.call(this, key, value);
      if (key === 'meowcenary.save.v2') observer.writes += 1;
    };
  });
}
async function resetStorage(page: Page, fail: boolean) {
  await page.evaluate(fail => Object.assign((globalThis as Fixture).__loadoutStorage,
    { fail, attempts: 0, writes: 0 }), fail);
}
const storage = (page: Page) => page.evaluate(() => ({ ...(globalThis as Fixture).__loadoutStorage }));
// Cancellation is a separate bounded journey. Keep failed commit -> cancel ->
// real Back -> warm return together below: that causal chain owns stale-state
// coverage. Each journey retains the default budget and real input gestures.
test('Gunsmith pointer preview cancellation retains stored ownership and restores semantic focus', async ({ page }, testInfo) => {
  await storageFixture(page); await open(page, 'gunsmith');
  const initial = await read(page); await resetStorage(page, false);
  await activateByPointerScroll(page, 'gunsmith-part:compact', testInfo);
  await activate(page, 'gunsmith-preview-cancel', testInfo);
  expect((await read(page)).saved).toBe(initial.saved);
  expect((await read(page)).diagnostic.focusedKey).toBe('gunsmith-part:compact');
  expect(await storage(page)).toMatchObject({ attempts: 0, writes: 0 });
});
// This recovery starts from the warm, Compact-focused checkpoint inherited
// from cancellation in the former combined test. Preparation owns its ordinary
// hook budget; the complete failed-save/recovery chain owns the test budget.
// One fresh context and one test keep this independent of other test results.
test.describe('Gunsmith recovery from its prepared warm checkpoint', () => {
  let context: BrowserContext | undefined;
  let page: Page;
  test.beforeAll(async ({ browser }, testInfo) => {
    const { contextOptions, baseURL, colorScheme, viewport, hasTouch, isMobile, deviceScaleFactor } = testInfo.project.use;
    context = await browser.newContext({ ...contextOptions, baseURL, colorScheme, viewport, hasTouch, isMobile, deviceScaleFactor });
    page = await context.newPage();
    await storageFixture(page); await open(page, 'gunsmith');
    await resetStorage(page, false);
    // Real keyboard focus restores the already-revealed precondition, then
    // the test selects through the original touch/pointer command.
    await focus(page, 'gunsmith-part:compact');
    expect((await read(page)).diagnostic.buttons.some(row => row.key === 'gunsmith-commit')).toBe(false);
    expect(await storage(page)).toMatchObject({ attempts: 0, writes: 0 });
  });
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus || !page || page.isClosed()) return;
    const path = testInfo.outputPath('test-failed-1.png');
    await page.screenshot({ path });
    await testInfo.attach('screenshot', { path, contentType: 'image/png' });
  });
  test.afterAll(async () => { await context?.close(); });
  test('Gunsmith failed commit retains stored ownership through cancellation and warm return', async ({}, testInfo) => {
    const initial = await read(page);
    await activate(page, 'gunsmith-part:compact', testInfo);
    expect(await storage(page)).toMatchObject({ attempts: 0, writes: 0 });
    await resetStorage(page, true); await pulse(page, 'Enter');
    await expect.poll(async () => (await read(page)).diagnostic.copy.join('\n')).toContain('Could not save that Gunsmith change');
    expect((await read(page)).saved).toBe(initial.saved);
    expect(await storage(page)).toMatchObject({ attempts: 1, writes: 0 });
    await evidence(page, testInfo, 'replacement-save-failure');
    await resetStorage(page, false);
    // Real Back cancels the preview before leaving the screen; warm re-entry
    // cannot carry a discarded candidate into an unrelated confirmation.
    await pulse(page, 'Escape');
    expect((await read(page)).saved).toBe(initial.saved);
    await pulse(page, 'Escape');
    await expect.poll(async () => (await read(page)).diagnostic.panel).toBe('loadout');
    const link = (await read(page)).diagnostic.buttons.find(row => row.text === 'Gunsmith')!;
    expect(link).toBeDefined();
    await activate(page, link.key!, testInfo);
    await expect.poll(async () => (await read(page)).diagnostic.panel).toBe('gunsmith');
    expect((await read(page)).diagnostic.buttons.some(row => row.key === 'gunsmith-commit')).toBe(false);
    expect((await read(page)).saved).toBe(initial.saved);
  });
});
test('Gunsmith Parts selection and fabrication cancellation spend nothing before explicit confirmation', async ({ page }, testInfo) => {
  await storageFixture(page); await open(page, 'gunsmith'); await resetStorage(page, false);
  const initial = await read(page);
  await activate(page, 'gunsmith-surface:parts', testInfo);
  expect((await read(page)).diagnostic.buttons.some(row => row.key === 'gunsmith-part:compact')).toBe(false);
  await activate(page, 'gunsmith-catalog:part:receiver-compact', testInfo);
  expect((await read(page)).saved).toBe(initial.saved);
  await activate(page, 'gunsmith-fabricate-request:part:receiver-compact', testInfo);
  expect((await read(page)).diagnostic.buttons.find(row => row.key === 'gunsmith-fabricate-confirm:part:receiver-compact')!.text).toContain('60 Scrap');
  await evidence(page, testInfo, 'parts-fabrication-confirmation');
  await activate(page, 'gunsmith-fabricate-cancel:part:receiver-compact', testInfo);
  expect((await read(page)).saved).toBe(initial.saved);
  expect(await storage(page)).toMatchObject({ attempts: 0, writes: 0 });
  await activate(page, 'gunsmith-fabricate-request:part:receiver-compact', testInfo);
  await page.keyboard.down('Enter');
  try {
    await expect.poll(async () => JSON.parse((await read(page)).saved).progression.scrap).toBe(580);
    for (let frame = 0; frame < 3; frame += 1)
      expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
    expect(await storage(page)).toMatchObject({ attempts: 1, writes: 1 });
  } finally { await page.keyboard.up('Enter'); }
  const result = JSON.parse((await read(page)).saved);
  expect(Object.values(result.gunsmith.parts)).toHaveLength(3);
  expect(result.gunsmith.parts.heavy).toEqual(JSON.parse(initial.saved).gunsmith.parts.heavy);
  expect(result.gunsmith.builds).toEqual(JSON.parse(initial.saved).gunsmith.builds);
  expect(Object.values(result.gunsmith.parts).filter((part: unknown) =>
    (part as { partId: string; tier: number }).partId === 'part:receiver-compact' && (part as { tier: number }).tier === 1)).toHaveLength(2);
});
test('Equipment equipped upgrade shows exact values and keeps its instance and set after atomic commit', async ({ page }, testInfo) => {
  await storageFixture(page); await open(page, 'equipment'); await resetStorage(page, false);
  await activate(page, 'equipment-candidate:helmet', testInfo);
  const before = await read(page);
  expect(before.diagnostic.copy.join('\n')).toContain('100 Scrap');
  expect(before.diagnostic.copy.join('\n')).toContain('12');
  expect(before.diagnostic.copy.join('\n')).toContain('24');
  if (testInfo.project.use.hasTouch) await focus(page, 'equipment-upgrade:helmet');
  else await activateByPointerScroll(page, 'equipment-upgrade:helmet', testInfo, true);
  await evidence(page, testInfo, 'equipment-equipped-upgrade-preview');
  await resetStorage(page, true); await pulse(page, 'Enter');
  expect((await read(page)).saved).toBe(before.saved);
  expect(await storage(page)).toMatchObject({ attempts: 1, writes: 0 });
  await resetStorage(page, false);
  if (testInfo.project.use.hasTouch) await focus(page, 'equipment-upgrade:helmet');
  else await activateByPointerScroll(page, 'equipment-upgrade:helmet', testInfo, true);
  await pulse(page, 'Enter');
  await expect.poll(async () => JSON.parse((await read(page)).saved).equipment.helmet.tier).toBe(2);
  const committed = JSON.parse((await read(page)).saved);
  expect(committed.progression.scrap).toBe(540);
  expect(committed.equipmentLoadout).toEqual(JSON.parse(before.saved).equipmentLoadout);
  expect(committed.equipment.armour).toEqual(JSON.parse(before.saved).equipment.armour);
  expect(await storage(page)).toMatchObject({ attempts: 1, writes: 1 });
  await evidence(page, testInfo, 'equipment-equipped-upgrade-committed');
});
test('physical controller polling previews and commits the selected receiver with one held confirmation', async ({ page }, testInfo) => {
  await storageFixture(page);
  await page.addInitScript(() => {
    const pad = { connected: true, pressed: -1 }; (globalThis as Fixture).__loadoutPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pad.connected ? [{
      id: 'Loadout standard controller fixture', index: 0, connected: true, mapping: 'standard',
      timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) =>
        ({ pressed: index === pad.pressed, touched: index === pad.pressed, value: index === pad.pressed ? 1 : 0 })),
    }] : [] });
  });
  await open(page, 'gunsmith'); await resetStorage(page, false);
  const before = await read(page);
  const padPulse = async (button: number) => {
    await page.evaluate(button => { (globalThis as Fixture).__loadoutPad.pressed = button; }, button);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
    await page.evaluate(() => { (globalThis as Fixture).__loadoutPad.pressed = -1; });
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
  };
  // Actual D-pad edges use the shared linear navigator's wrapping path;
  // release samples still separate each move from preview/confirmation.
  const order = before.diagnostic.buttons.map(row => row.key);
  const target = order.indexOf('gunsmith-part:compact');
  const current = order.indexOf(before.diagnostic.focusedKey);
  expect(target).toBeGreaterThanOrEqual(0); expect(current).toBeGreaterThanOrEqual(0);
  const forward = (target - current + order.length) % order.length;
  const backward = (current - target + order.length) % order.length;
  for (let index = 0; index < Math.min(forward, backward); index += 1)
    await padPulse(forward <= backward ? 15 : 14);
  expect((await read(page)).diagnostic.focusedKey).toBe('gunsmith-part:compact');
  await padPulse(0);
  expect((await read(page)).saved).toBe(before.saved);
  expect((await read(page)).diagnostic.focusedKey).toBe('gunsmith-commit');
  await evidence(page, testInfo, 'controller-replacement-preview');
  await page.evaluate(() => { (globalThis as Fixture).__loadoutPad.pressed = 0; });
  try {
    await expect.poll(async () => JSON.parse((await read(page)).saved).gunsmith.builds[0].fitted.receiver).toBe('compact');
    for (let frame = 0; frame < 3; frame += 1)
      expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
    expect(await storage(page)).toMatchObject({ attempts: 1, writes: 1 });
  } finally { await page.evaluate(() => { (globalThis as Fixture).__loadoutPad.pressed = -1; }); }
});
for (const family of ['smg', 'shotgun'] as const) {
  test(`Gunsmith ${family} retains its native whole-weapon framing on real family selection`, async ({ page }, testInfo) => {
    await open(page, 'gunsmith');
    const initial = JSON.parse((await read(page)).saved);
    await activate(page, `gunsmith-family:${family}`, testInfo);
    await evidence(page, testInfo, `${family}-native-assembly`);
    const state = await read(page);
    const frames = state.art.filter(row => row.frame === `gun-build-base:${family}` && row.alpha === 1);
    expect(frames).toHaveLength(1);
    const bounds = family === 'smg' ? alpha(frames[0]!, 358, 196, 83, 68, 170, 99)
      : alpha(frames[0]!, 358, 196, 80, 74, 170, 75);
    expect(bounds.width).toBeCloseTo(Math.min(700, page.viewportSize()!.width - 64), 1);
    expect(JSON.parse(state.saved).gunsmith).toEqual({ ...initial.gunsmith, selectedBuildId: `build:${family}` });
    expect(state.diagnostic.copy.join('\n')).toContain(family === 'smg' ? 'SMG' : 'Shotgun');
  });
}
test('390 DPR3 preserves preview and focus through blocked landscape and portrait restoration', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    hasTouch: true, isMobile: true, colorScheme: 'dark', baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  try {
    await open(page, 'gunsmith'); const initial = await read(page);
    await activate(page, 'gunsmith-part:compact', testInfo);
    expect((await read(page)).saved).toBe(initial.saved);
    expect((await read(page)).diagnostic.focusedKey).toBe('gunsmith-commit');
    await evidence(page, testInfo, '390-dpr3-preview');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await read(page)).diagnostic.focusedKey).toBe('gunsmith-commit');
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
    expect((await read(page)).saved).toBe(initial.saved);
    const state = await read(page); const commit = state.diagnostic.buttons.find(button => button.key === 'gunsmith-commit')!;
    expect(commit.visible && commit.interactive).toBe(true);
    expect(commit.bounds.y + commit.bounds.height).toBeLessThanOrEqual(state.diagnostic.scroll!.bottom + 0.01);
    await evidence(page, testInfo, '844-compact-preview');
    await pulse(page, 'Escape');
    expect((await read(page)).saved).toBe(initial.saved);
    expect((await read(page)).diagnostic.buttons.some(button => button.key === 'gunsmith-commit')).toBe(true);
    expect((await read(page)).diagnostic.focusedKey).toBe('gunsmith-commit');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
    await pulse(page, 'Escape');
    expect((await read(page)).saved).toBe(initial.saved);
    expect((await read(page)).diagnostic.buttons.some(button => button.key === 'gunsmith-commit')).toBe(false);
  } finally { await context.close(); }
});
