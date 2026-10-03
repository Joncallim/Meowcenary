import { expect, test, type Page } from '@playwright/test';
import equipmentCatalog from '../src/data/equipment.json' with { type: 'json' };

type Button = { key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; buttons: Button[];
  equipment?: { selectedSlot: string; selectedInstanceId?: string; equipped: Record<string, string> } };
type Event = { owner: string; facts: Record<string, string | number | boolean | readonly string[]> };
type Snapshot = { events: Event[]; presentedMenu?: { panel: string; rebuildCount: number; revision: number; atMs: number } };
type Seams = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: {
    showMenu(panel: string): boolean;
    waitForMenuPresentation(): Promise<boolean>;
    isMenuInputNeutral(): boolean;
    menuLoadoutDiagnostics(): Diagnostic;
    menuFocusedKey(): string | undefined;
    freeze(): Promise<void>;
    resume(): void;
  };
  __MEOWCENARY_PERFORMANCE__?: { snapshot(): Snapshot; resetMeasurement(): void };
};
const id = (piece: string) => `owned:${piece}`;

async function diagnostic(page: Page): Promise<Diagnostic> {
  return page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics());
}
async function checkpoint(page: Page) {
  return page.evaluate(() => ({
    diagnostic: (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics(),
    measurement: (globalThis as Seams).__MEOWCENARY_PERFORMANCE__!.snapshot(),
    saved: localStorage.getItem('meowcenary.save.v2'),
  }));
}
async function measurement(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (globalThis as Seams).__MEOWCENARY_PERFORMANCE__!.snapshot());
}
async function settle(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Seams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
}
const probes = new WeakMap<Page, { started: number; keys: Record<string, number> }>();
function phase(page: Page, name: string): void {
  const probe = probes.get(page)!;
  console.info(`[equipment-update] ${name}: ${Date.now() - probe.started}ms keys=${JSON.stringify(probe.keys)}`);
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
async function focus(page: Page, key: string): Promise<void> {
  let focusedKey = await page.evaluate(() =>
    (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuFocusedKey());
  if (focusedKey === key) return;
  const observed = await diagnostic(page);
  const targetIndex = observed.buttons.findIndex(button => button.key === key);
  expect(targetIndex, `Missing semantic focus ${key}`).toBeGreaterThanOrEqual(0);
  const started = Date.now();
  let steps = 0;
  try {
    for (; steps < observed.buttons.length + 4; steps += 1) {
      if (focusedKey === key) return;
      const currentIndex = observed.buttons.findIndex(button => button.key === focusedKey);
      expect(currentIndex, `Unknown semantic focus ${focusedKey}`).toBeGreaterThanOrEqual(0);
      // Slots use spatial vertical navigation. The body is linear in both axes;
      // horizontal keys avoid the vertical endpoint's scroll-only first press.
      focusedKey = await press(page, currentIndex < 4
        ? currentIndex < targetIndex ? 'ArrowDown' : 'ArrowUp'
        : currentIndex < targetIndex ? 'ArrowRight' : 'ArrowLeft');
    }
  } finally {
    phase(page, `focus ${key}: steps=${steps} focused=${focusedKey} elapsed=${Date.now() - started}ms`);
  }
  throw new Error(`Focus did not reach ${key}: ${JSON.stringify(await diagnostic(page))}`);
}

test('Equipment candidate updates preserve committed menu state and selection through resize', async ({ page }, testInfo) => {
  probes.set(page, { started: Date.now(), keys: {} });
  const seed = {
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] },
    stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
    gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
    equipment: Object.fromEntries(equipmentCatalog.map(piece => [id(piece.id), { equipmentId: piece.id, tier: 1 }])),
    equipmentLoadout: { helmet: id('equipment:commando-helmet'), armour: id('equipment:commando-armour'), gloves: id('equipment:recon-gloves') },
    items: {}, bosses: {}, compendium: {}, pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
  };
  await page.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed);
  await page.goto('/?visual-test=1&perf-test=1');
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.showMenu('equipment'))).toBe(true);
  await settle(page);
  expect((await diagnostic(page)).panel).toBe('equipment');
  phase(page, 'Equipment ready');

  // Enter through the real keyboard navigator, then use the profile's actual
  // pointer type to select the stored Recon helmet.
  await focus(page, 'equipment-slot:helmet');
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`);
  phase(page, 'candidate focused by keyboard');
  const beforeSelection = await checkpoint(page);
  const target = beforeSelection.diagnostic.buttons.find(button => button.key === `equipment-candidate:${candidate}`)!;
  expect(target.visible).toBe(true);
  expect(target.interactive).toBe(true);
  const originalSave = beforeSelection.saved;
  const before = beforeSelection.measurement;
  const beforeRender = before.events.filter(event => event.owner === 'menu.render').at(-1);
  expect(beforeRender).toBeDefined();
  const rebuildCount = beforeRender!.facts.rebuildCount;
  expect(typeof rebuildCount).toBe('number');
  await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_PERFORMANCE__!.resetMeasurement());
  const { x, y, width, height } = target.bounds;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x + width / 2, y + height / 2);
  else await page.mouse.click(x + width / 2, y + height / 2);

  await expect.poll(async () => (await measurement(page)).events.some(event => event.owner === 'menu.update'
    && event.facts.committed === true)).toBe(true);
  phase(page, 'selection committed');
  const selected = await checkpoint(page);
  const afterSelection = selected.diagnostic;
  expect(afterSelection.equipment).toMatchObject({ selectedSlot: 'helmet', selectedInstanceId: candidate,
    equipped: { helmet: id('equipment:commando-helmet') } });
  expect(afterSelection.focusedKey).toBe(`equipment-detail:${candidate}`);
  expect(selected.saved).toBe(originalSave);
  const updateEvents = selected.measurement.events;
  expect(updateEvents.filter(event => event.owner === 'menu.render')).toHaveLength(0);
  expect(updateEvents.filter(event => event.owner === 'menu.update')).toHaveLength(1);
  expect(updateEvents.find(event => event.owner === 'menu.update')?.facts).toMatchObject({
    reason: 'same-panel-state-mutation', section: 'equipment-selection', rebuildCount, committed: true,
  });
  const selectionRevision = updateEvents.find(event => event.owner === 'menu.update')!.facts.revision;
  expect(typeof selectionRevision).toBe('number');
  await expect.poll(async () => (await measurement(page)).presentedMenu?.revision).toBe(selectionRevision);
  await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.freeze());
  try { await page.screenshot({ path: testInfo.outputPath('equipment-candidate-selected.png') }); }
  finally { await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.resume()); }

  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: originalViewport.width + 20, height: originalViewport.height });
  await expect.poll(async () => (await measurement(page)).events.some(event => event.owner === 'menu.render'
    && event.facts.reason === 'viewport-resize')).toBe(true);
  await expect.poll(async () => (await diagnostic(page)).focusedKey).toBe(`equipment-detail:${candidate}`);
  const resized = await checkpoint(page);
  expect(resized.diagnostic.equipment?.selectedInstanceId).toBe(candidate);
  const resize = resized.measurement.events.find(event => event.owner === 'menu.render' && event.facts.reason === 'viewport-resize');
  expect(resize?.facts.rebuildCount).toBe((rebuildCount as number) + 1);

  phase(page, 'resize committed');

  // Selection is presentation state only: commit through the focused real
  // Equip command and verify the durable authority changes exactly then.
  await focus(page, `equipment-equip:${candidate}`);
  await press(page, 'Enter');
  await settle(page);
  const equipped = await checkpoint(page);
  expect(equipped.diagnostic.equipment?.equipped.helmet).toBe(candidate);
  const saved = JSON.parse(equipped.saved!);
  expect(saved.equipmentLoadout.helmet).toBe(candidate);
  phase(page, 'equip durable');
});
