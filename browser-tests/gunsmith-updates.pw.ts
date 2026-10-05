import { expect, test, type Page } from '@playwright/test';

type Diagnostic = { panel: string; focusedKey?: string; scroll?: { top: number; bottom: number }; buttons: Array<{ key?: string;
  text: string; focused: boolean; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } }> };
type PerformanceState = { events: Array<{ owner: string; facts: Record<string, unknown> }>;
  presentedMenu?: { revision: number } };
type Seams = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__: { showMenu(panel: string): boolean;
    waitForMenuPresentation(): Promise<boolean>; isMenuInputNeutral(): boolean;
    menuFocusedKey(): string | undefined; menuLoadoutDiagnostics(): Diagnostic;
    freeze(): Promise<void>; resume(): void };
  __MEOWCENARY_PERFORMANCE__: { snapshot(): PerformanceState; resetMeasurement(): void };
};
const diagnostic = (page: Page) => page.evaluate(() =>
  (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
const checkpoint = (page: Page) => page.evaluate(() => ({
  diagnostic: (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics(),
  measurement: (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.snapshot(),
  saved: JSON.parse(localStorage.getItem('meowcenary.save.v2')!),
}));
const measurement = (page: Page) => page.evaluate(() =>
  (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.snapshot());
const probes = new WeakMap<Page, { started: number; keys: Record<string, number> }>();
function phase(page: Page, name: string): void {
  const probe = probes.get(page)!;
  console.info(`[gunsmith-update] ${name}: ${Date.now() - probe.started}ms keys=${JSON.stringify(probe.keys)}`);
}
async function observeInput(page: Page, expectedNeutral: boolean) {
  // Sample the real logical input owner in the renderer, without a protocol
  // round trip between frames. Keep the previous poll's five-second deadline.
  return page.evaluate(expected => new Promise<{ neutral: boolean | undefined; focusedKey?: string }>(resolve => {
    const seam = (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__;
    let frame: number | undefined;
    const finish = () => {
      clearTimeout(timeout);
      if (frame !== undefined) cancelAnimationFrame(frame);
      resolve({ neutral: seam?.isMenuInputNeutral(), focusedKey: seam?.menuFocusedKey() });
    };
    const timeout = setTimeout(finish, 5000);
    const sample = () => {
      if (seam?.isMenuInputNeutral() === expected) finish();
      else frame = requestAnimationFrame(sample);
    };
    sample();
  }), expectedNeutral);
}
async function press(page: Page, key: string): Promise<string | undefined> {
  const keys = probes.get(page)!.keys;
  keys[key] = (keys[key] ?? 0) + 1;
  try {
    const [held] = await Promise.all([observeInput(page, false), page.keyboard.down(key)]);
    expect(held.neutral, `${key} sampled held`).toBe(false);
  } finally { await page.keyboard.up(key); }
  const released = await observeInput(page, true);
  expect(released.neutral, `${key} sampled released`).toBe(true);
  return released.focusedKey;
}
async function focus(page: Page, key: string, direction?: string): Promise<void> {
  const order = direction ? undefined : (await diagnostic(page)).buttons.map(button => button.key);
  const target = order?.indexOf(key);
  if (target !== undefined) expect(target).toBeGreaterThanOrEqual(0);
  let focusedKey = await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuFocusedKey());
  const started = Date.now();
  let steps = 0;
  try {
    for (; steps < 80; steps += 1) {
      if (focusedKey === key) return;
      let next = direction;
      if (order && target !== undefined) {
        const current = order.indexOf(focusedKey);
        expect(current).toBeGreaterThanOrEqual(0);
        const count = order.length;
        next = (target - current + count) % count <= (current - target + count) % count
          ? 'ArrowRight' : 'ArrowLeft';
      }
      focusedKey = await press(page, next!);
    }
  } finally {
    phase(page, `focus ${key} via ${direction ?? 'shortest wrap'}: steps=${steps} focused=${focusedKey} elapsed=${Date.now() - started}ms`);
  }
  throw new Error(`Missing semantic focus ${key}: ${JSON.stringify(await diagnostic(page))}`);
}
async function reset(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.resetMeasurement());
}
async function assertLocalCommit(page: Page, rebuildCount: unknown) {
  // Observe the owning commit and its presented revision together. Repeated
  // protocol reads add scheduling cost without making the assertion stronger.
  await expect.poll(async () => {
    const state = await measurement(page);
    const update = state.events.find(event => event.owner === 'menu.update' && event.facts.committed === true);
    return { committed: Boolean(update), presented: Boolean(update && state.presentedMenu?.revision === update.facts.revision) };
  }).toEqual({ committed: true, presented: true });
  const result = await checkpoint(page);
  const state = result.measurement;
  expect(state.events.filter(event => event.owner === 'menu.render')).toHaveLength(0);
  const updates = state.events.filter(event => event.owner === 'menu.update');
  expect(updates).toHaveLength(1);
  expect(updates[0]!.facts).toMatchObject({ section: 'gunsmith-body', rebuildCount,
    reason: 'same-panel-state-mutation', committed: true });
  expect(typeof updates[0]!.facts.revision).toBe('number');
  expect(state.presentedMenu?.revision).toBe(updates[0]!.facts.revision);
  return result;
}

async function openGunsmith(page: Page) {
  probes.set(page, { started: Date.now(), keys: {} });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 640, unlocks: [] }, stages: {}, achievements: {}, characters: {},
    gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] }],
      parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
    equipment: {}, equipmentLoadout: {},
  })));
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Seams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.showMenu('gunsmith'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  phase(page, 'Gunsmith ready');
  const initial = await checkpoint(page);
  const mounted = initial.measurement.events.filter(event => event.owner === 'menu.render').at(-1)!;
  const rebuildCount = mounted.facts.rebuildCount;
  return { rebuildCount, errors, gunsmith: initial.saved.gunsmith };
}

async function replaceCompact(page: Page, rebuildCount: unknown, hasTouch: boolean | undefined) {
  await focus(page, 'gunsmith-part:compact');
  const target = (await diagnostic(page)).buttons.find(row => row.key === 'gunsmith-part:compact')!;
  expect(target.text).toContain('STORED');
  expect(target.text).toContain('Preview change');
  const before = await checkpoint(page);
  expect(target.visible && target.interactive).toBe(true);
  await reset(page);
  const { x, y, width, height } = target.bounds;
  const scroll = before.diagnostic.scroll;
  const tapY = (Math.max(y, scroll?.top ?? 0) + Math.min(y + height, scroll?.bottom ?? page.viewportSize()!.height)) / 2;
  if (hasTouch) await page.touchscreen.tap(x + width / 2, tapY);
  else await page.mouse.click(x + width / 2, tapY);
  const preview = await assertLocalCommit(page, rebuildCount);
  expect(preview.saved).toEqual(before.saved);
  expect(preview.diagnostic.focusedKey).toBe('gunsmith-commit');
  expect(preview.diagnostic.buttons.find(row => row.key === 'gunsmith-commit')!.text).toContain('REPLACE HEAVY RECEIVER T2');
  await reset(page);
  await press(page, 'Enter');
  const replacement = await assertLocalCommit(page, rebuildCount);
  const saved = replacement.saved;
  expect(saved.gunsmith.builds[0].fitted.receiver).toBe('compact');
  expect(saved.gunsmith.parts.heavy).toMatchObject({ partId: 'part:receiver-heavy', tier: 2 });
  expect(replacement.diagnostic.focusedKey).toBe('gunsmith-inspect:compact');
  expect(replacement.diagnostic.buttons.find(row => row.key === 'gunsmith-inspect:compact')!.text).toContain('EQUIPPED');
  phase(page, 'replacement committed and presented');
  return replacement;
}

test('Gunsmith family switching preserves builds and parts before replacement in the returned family', async ({ page }, testInfo) => {
  const { rebuildCount, errors, gunsmith } = await openGunsmith(page);
  for (const family of ['smg', 'pistol']) {
    await focus(page, `gunsmith-family:${family}`, family === 'pistol' ? 'ArrowUp' : 'ArrowDown');
    await reset(page);
    await press(page, 'Enter');
    const switched = await assertLocalCommit(page, rebuildCount);
    expect(switched.saved.gunsmith.selectedBuildId).toBe(`build:${family}`);
    expect(switched.diagnostic.focusedKey).toBe(`gunsmith-family:${family}`);
    // Selection changes the body's fitting commands, not the stored builds or
    // part assignments. Returning to Pistol must restore its replacement row.
    expect(switched.saved.gunsmith).toEqual({ ...gunsmith, selectedBuildId: `build:${family}` });
    const heavy = switched.diagnostic.buttons.find(row => row.key === (family === 'smg' ? 'gunsmith-part:heavy' : 'gunsmith-inspect:heavy'))!;
    const compact = switched.diagnostic.buttons.find(row => row.key === 'gunsmith-part:compact')!;
    expect(heavy.text).toContain(family === 'smg' ? 'EQUIPPED • Pistol Build' : 'EQUIPPED');
    expect(compact.text).toContain('STORED');
    expect(compact.text.split('\n').at(-1)).toBe('Preview change');
    phase(page, `${family} selected and presented`);
  }
  await replaceCompact(page, rebuildCount, testInfo.project.use.hasTouch);
  expect(errors).toEqual([]);
});

test('Gunsmith replacement retains menu ownership and semantic focus through resize and removal', async ({ page }, testInfo) => {
  const { rebuildCount, errors } = await openGunsmith(page);
  const replacement = await replaceCompact(page, rebuildCount, testInfo.project.use.hasTouch);
  const saved = replacement.saved;
  await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path: testInfo.outputPath('gunsmith-replacement-committed.png'), scale: 'css' }); }
  finally { await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.resume()); }

  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width + 20, height: viewport.height });
  await expect.poll(() => page.evaluate(() => ({
    resized: (globalThis as Seams).__MEOWCENARY_PERFORMANCE__.snapshot().events.some(event =>
      event.owner === 'menu.render' && event.facts.reason === 'viewport-resize'),
    focusedKey: (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__.menuFocusedKey(),
  }))).toEqual({ resized: true, focusedKey: 'gunsmith-inspect:compact' });
  phase(page, 'resize focus restored');
  const resize = await checkpoint(page);
  expect(resize.saved.gunsmith).toEqual(saved.gunsmith);
  expect(resize.diagnostic.focusedKey).toBe('gunsmith-inspect:compact');
  const resized = resize.measurement.events.filter(event => event.owner === 'menu.render').at(-1)!;
  await focus(page, 'gunsmith-unequip:compact');
  await reset(page);
  await press(page, 'Enter');
  const removal = await assertLocalCommit(page, resized.facts.rebuildCount);
  expect(removal.saved.gunsmith.builds[0].fitted.receiver).toBeUndefined();
  expect(removal.diagnostic.focusedKey).toBe('gunsmith-part:compact');
  expect(errors).toEqual([]);
  phase(page, 'removal durable and presented');
});
