import { expect, test, type Page } from '@playwright/test';
import type { JunctionSliceState } from '../src/gameplay/junctionSlice';

type Diagnostic = { state: JunctionSliceState & { paused: boolean }; panel?: string; focus?: string; busy: boolean; message: string };
type World = typeof globalThis & {
  __MEOWCENARY_JUNCTION__?: { diagnostics(): Diagnostic };
  __JUNCTION_PAD__?: { axes: number[]; buttons: Array<{ value: number; pressed: boolean; touched: boolean }>; timestamp: number };
};
const SAVE = 'meowcenary:junction-slice:v1';
async function state(page: Page): Promise<Diagnostic> {
  return page.evaluate(() => (globalThis as World).__MEOWCENARY_JUNCTION__!.diagnostics());
}
async function ready(page: Page) {
  await page.goto('/?fixture=junction');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as World).__MEOWCENARY_JUNCTION__))).toBe(true);
  await page.waitForTimeout(180);
}
async function key(page: Page, value: string) {
  const frames = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.down(value); await frames();
  await page.keyboard.up(value); await frames();
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}
async function shopReview(page: Page) {
  await key(page, 'i'); await key(page, 'ArrowDown'); await key(page, 'Enter'); await key(page, 'Enter');
  expect((await state(page)).panel).toBe('Confirm purchase');
}
async function moveAxis(page: Page, axis: 'x' | 'z', target: number) {
  const current = (await state(page)).state;
  const start = current.combat.actors.find(a => a.id === current.controlledActor)!.position[axis];
  const direction = axis === 'x' ? target > start ? 'd' : 'a' : target > start ? 's' : 'w';
  await page.keyboard.down(direction);
  try {
    await expect.poll(async () => {
      const s = (await state(page)).state;
      const value = s.combat.actors.find(a => a.id === s.controlledActor)!.position[axis];
      return target > start ? value >= target : value <= target;
    }, { timeout: 8000, intervals: [80] }).toBe(true);
  } finally {
    await page.keyboard.up(direction);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(async () => (await state(page)).busy).toBe(false);
  }
}
async function moveX(page: Page, target: number) { await moveAxis(page, 'x', target); }
test('first Junction outing fights, returns, cancels, buys, fits and reloads through real controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Desktop technical prototype; no art/device acceptance.');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const unrelated = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k !== 'meowcenary:junction-slice:v1').map(k => [k, localStorage.getItem(k)])));
  const otherSaves = await unrelated();
  expect((await state(page)).state.phase).toBe('offer');
  await key(page, 'Enter'); expect((await state(page)).panel).toBe('Dispatch contact');
  await key(page, 'Enter');
  await expect.poll(async () => (await state(page)).state.phase).toBe('accepted');
  await moveX(page, 28);
  expect((await state(page)).state.phase).toBe('fighting');
  await page.screenshot({ path: info.outputPath('junction-real-fight-placeholder.png') });
  await moveX(page, 39);
  await expect.poll(async () => (await state(page)).state.phase, { timeout: 8000 }).toBe('return');
  expect((await state(page)).state.combat.actors.filter(a => a.id.startsWith('junction')).every(a => a.health === 0)).toBe(true);
  // Each authoritative movement step can travel up to three world units.
  // Approach the contact from the inside edge of its service circle so the
  // next observed step cannot overshoot both axes outside that circle.
  await moveX(page, 10);
  await moveAxis(page, 'z', 10);
  const returned = (await state(page)).state;
  const position = returned.combat.actors.find(a => a.id === returned.controlledActor)!.position;
  expect(Math.hypot(position.x - 8, position.z - 8)).toBeLessThanOrEqual(3.5);
  await key(page, 'Enter'); expect((await state(page)).panel).toBe('Return to dispatch');
  await key(page, 'Enter');
  await expect.poll(async () => (await state(page)).state.phase).toBe('complete');
  await page.mouse.click(450, 678);
  await expect.poll(async () => (await state(page)).panel).toBe('Dispatch merchant');
  const before = (await state(page)).state;
  await key(page, 'Enter');
  expect(await state(page)).toMatchObject({ panel: 'Confirm purchase', focus: 'cancel' });
  await key(page, 'Enter');
  expect((await state(page)).state.workshop.wallet.credits).toBe(3000);
  await key(page, 'Enter'); await key(page, 'ArrowUp'); await key(page, 'Enter');
  await expect.poll(async () => (await state(page)).state.workshop.wallet.credits).toBe(1350);
  const bought = (await state(page)).state;
  expect(bought.workshop.parts).toHaveLength(before.workshop.parts.length + 1);
  expect(bought.workshop.gunSlots['TAB-A'].F).toBe(before.workshop.gunSlots['TAB-A'].F);
  await page.screenshot({ path: info.outputPath('junction-merchant-comparison-placeholder.png') });
  await key(page, 'ArrowDown'); await key(page, 'Enter');
  expect(await state(page)).toMatchObject({ panel: 'Confirm fit', focus: 'cancel' });
  await key(page, 'ArrowUp'); await key(page, 'Enter');
  const fitted = (await state(page)).state;
  const feed = fitted.workshop.parts.find(p => p.instanceId === fitted.workshop.gunSlots['TAB-A'].F);
  expect(feed?.kind).toBe('F2');
  expect(fitted.workshop.parts.some(p => p.instanceId === before.workshop.gunSlots['TAB-A'].F)).toBe(true);
  const health = fitted.combat.actors.filter(a => a.id === 'tabby' || a.id === 'hound').map(a => a.health);
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as World).__MEOWCENARY_JUNCTION__))).toBe(true);
  const reloaded = (await state(page)).state;
  expect(reloaded).toMatchObject({ phase: 'complete', completionId: 'junction-first-clear-v1' });
  expect(reloaded.workshop.wallet.credits).toBe(1350);
  expect(reloaded.workshop.gunSlots).toEqual(fitted.workshop.gunSlots);
  expect(reloaded.combat.actors.filter(a => a.id === 'tabby' || a.id === 'hound').map(a => a.health)).toEqual(health);
  expect(await unrelated()).toEqual(otherSaves);
  expect(errors).toEqual([]);
});

test('controller navigation, safe purchase focus, pause and held-input rearm use the shared adapter', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720', 'Synthetic standard pad, not physical controller acceptance.');
  await page.addInitScript(() => {
    const pad = { id: 'Junction standard controller fixture', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (globalThis as World).__JUNCTION_PAD__ = pad;
  });
  const button = async (index: number) => {
    await page.evaluate(i => { const p = (globalThis as World).__JUNCTION_PAD__!; p.buttons[i] = { value: 1, pressed: true, touched: true }; p.timestamp = Math.max(performance.now(), p.timestamp + .001); }, index);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(i => { const p = (globalThis as World).__JUNCTION_PAD__!; p.buttons[i] = { value: 0, pressed: false, touched: false }; p.timestamp = Math.max(performance.now(), p.timestamp + .001); }, index);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(async () => (await state(page)).busy).toBe(false);
  };
  await ready(page);
  await button(0); expect((await state(page)).panel).toBe('Dispatch contact');
  await button(0); expect((await state(page)).state.phase).toBe('accepted');
  await button(3); expect((await state(page)).panel).toBe('Two-weapon loadout');
  const gun = (await state(page)).state.combat.actors[0].activeGunIndex;
  await button(0);
  expect((await state(page)).state.combat.actors[0].activeGunIndex).not.toBe(gun);
  await button(3); await button(13); await button(0);
  expect((await state(page)).panel).toBe('Dispatch merchant');
  await button(0); expect(await state(page)).toMatchObject({ panel: 'Confirm purchase', focus: 'cancel' });
  await button(0); expect((await state(page)).state.workshop.wallet.credits).toBe(3000);
  await button(1);
  await page.evaluate(() => { const p = (globalThis as World).__JUNCTION_PAD__!; p.axes[0] = 1; p.timestamp = performance.now(); });
  await expect.poll(async () => (await state(page)).state.combat.actors[0].position.x).toBeGreaterThan(10);
  await button(9); expect((await state(page)).panel).toBe('Paused');
  const x = (await state(page)).state.combat.actors[0].position.x;
  await page.waitForTimeout(300);
  expect((await state(page)).state.combat.actors[0].position.x).toBe(x);
  await page.evaluate(() => { const p = (globalThis as World).__JUNCTION_PAD__!; p.axes[0] = 0; p.timestamp = performance.now(); });
  await page.waitForTimeout(120); await button(0);
  expect((await state(page)).panel).toBeUndefined();
});

test('corrupt prototype storage is preserved and cannot be spent', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => localStorage.setItem('meowcenary:junction-slice:v1', '{corrupt'));
  await ready(page); expect((await state(page)).panel).toBe('Save unavailable');
  await key(page, 'Enter'); await key(page, 'Escape');
  expect((await state(page)).panel).toBe('Save unavailable');
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE)).toBe('{corrupt');
});

test('pointer confirmation owns its original choice and rejects dragged releases', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720');
  await ready(page); await shopReview(page);
  const bytes = await page.evaluate(key => localStorage.getItem(key), SAVE);
  for (const from of [{ x: 600, y: 550 }, { x: 1087, y: 392 }, { x: 1072, y: 348 }]) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(1087, 348); await page.mouse.up();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect((await state(page)).state.workshop.wallet.credits).toBe(3000);
    expect(await page.evaluate(key => localStorage.getItem(key), SAVE)).toBe(bytes);
  }
  await page.mouse.click(1087, 348);
  await expect.poll(async () => (await state(page)).state.workshop.wallet.credits).toBe(1350);
});

test('resize revokes queued movement and permits a fresh movement press', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720');
  await ready(page);
  await page.evaluate(() => new Promise<void>(resolve => {
    navigator.locks.request('meowcenary:junction-slice:v1:writer', { mode: 'exclusive' }, async () => {
      resolve(); await new Promise<void>(release => { (globalThis as unknown as { releaseJunction(): void }).releaseJunction = release; });
    });
  }));
  const before = (await state(page)).state;
  await page.keyboard.down('d');
  await expect.poll(async () => (await state(page)).busy).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.up('d');
  await page.evaluate(() => (globalThis as unknown as { releaseJunction(): void }).releaseJunction());
  await page.evaluate(() => navigator.locks.request('meowcenary:junction-slice:v1:writer', { mode: 'exclusive' }, async () => undefined));
  await page.waitForTimeout(180);
  expect((await state(page)).state.combat).toEqual(before.combat);
  expect((await state(page)).state.revision).toBe(before.revision);
  await page.keyboard.down('d');
  try { await expect.poll(async () => (await state(page)).state.combat.actors[0].position.x).toBeGreaterThan(9); }
  finally { await page.keyboard.up('d'); }
});

test('denied storage preserves the accepted work order and refuses a purchase', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720');
  await ready(page); await key(page, 'Enter'); await key(page, 'Enter');
  await shopReview(page);
  const bytes = await page.evaluate(key => localStorage.getItem(key), SAVE);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'meowcenary:junction-slice:v1') throw new DOMException('Denied test writer', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await key(page, 'ArrowUp'); await key(page, 'Enter');
  await expect.poll(async () => (await state(page)).panel).toBe('Paused');
  expect((await state(page)).state.workshop.wallet.credits).toBe(3000);
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE)).toBe(bytes);
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean((globalThis as World).__MEOWCENARY_JUNCTION__))).toBe(true);
  expect((await state(page)).state).toMatchObject({ phase: 'accepted', workshop: { wallet: { credits: 3000 } } });
});

test('a stale second tab cannot overwrite a newer purchase', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1280x720');
  await ready(page); const second = await context.newPage(); await ready(second);
  try {
    await page.bringToFront(); await page.waitForTimeout(150);
    // Window focus changes pause deliberately; resume before opening loadout.
    if ((await state(page)).panel === 'Paused') await key(page, 'Enter');
    await shopReview(page); await key(page, 'ArrowUp'); await key(page, 'Enter');
    await expect.poll(async () => (await state(page)).state.workshop.wallet.credits).toBe(1350);
    const committed = await page.evaluate(key => localStorage.getItem(key), SAVE);
    await second.bringToFront(); await page.waitForTimeout(150);
    if ((await state(second)).panel === 'Paused') await key(second, 'Enter');
    await shopReview(second); await key(second, 'ArrowUp'); await key(second, 'Enter');
    await expect.poll(async () => (await state(second)).panel).toBe('Paused');
    expect(await second.evaluate(key => localStorage.getItem(key), SAVE)).toBe(committed);
  } finally { await second.close(); }
});
