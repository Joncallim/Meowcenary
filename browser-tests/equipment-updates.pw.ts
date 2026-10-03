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
async function measurement(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (globalThis as Seams).__MEOWCENARY_PERFORMANCE__!.snapshot());
}
async function settle(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Seams).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
}
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  try {
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__;
      return seam !== undefined && !seam.isMenuInputNeutral();
    }), { intervals: [16, 32, 50] }).toBe(true);
  } finally { await page.keyboard.up(key); }
  await expect.poll(() => page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__?.isMenuInputNeutral()),
    { intervals: [16, 32, 50] }).toBe(true);
}
async function focus(page: Page, key: string): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    // Observe the existing focus owner without deriving the complete Equipment
    // model and walking every display object for each real key press.
    if (await page.evaluate(() => (globalThis as Seams).__MEOWCENARY_VISUAL_TEST__!.menuFocusedKey()) === key) return;
    await press(page, 'ArrowDown');
  }
  throw new Error(`Focus did not reach ${key}: ${JSON.stringify(await diagnostic(page))}`);
}

test('Equipment candidate updates preserve committed menu state and selection through resize', async ({ page }, testInfo) => {
  const started = Date.now();
  const phase = (name: string) => console.info(`[equipment-update] ${name}: ${Date.now() - started}ms`);
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
  phase('Equipment ready');

  // Enter through the real keyboard navigator, then use the profile's actual
  // pointer type to select the stored Recon helmet.
  await focus(page, 'equipment-slot:helmet');
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`);
  phase('candidate focused by keyboard');
  const target = (await diagnostic(page)).buttons.find(button => button.key === `equipment-candidate:${candidate}`)!;
  expect(target.visible).toBe(true);
  expect(target.interactive).toBe(true);
  const originalSave = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  const before = await measurement(page);
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
  phase('selection committed');
  const afterSelection = await diagnostic(page);
  expect(afterSelection.equipment).toMatchObject({ selectedSlot: 'helmet', selectedInstanceId: candidate,
    equipped: { helmet: id('equipment:commando-helmet') } });
  expect(afterSelection.focusedKey).toBe(`equipment-detail:${candidate}`);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(originalSave);
  const updateEvents = (await measurement(page)).events;
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
  expect((await diagnostic(page)).equipment?.selectedInstanceId).toBe(candidate);
  const resize = (await measurement(page)).events.find(event => event.owner === 'menu.render' && event.facts.reason === 'viewport-resize');
  expect(resize?.facts.rebuildCount).toBe((rebuildCount as number) + 1);

  phase('resize committed');

  // Selection is presentation state only: commit through the focused real
  // Equip command and verify the durable authority changes exactly then.
  await focus(page, `equipment-equip:${candidate}`);
  await press(page, 'Enter');
  await settle(page);
  expect((await diagnostic(page)).equipment?.equipped.helmet).toBe(candidate);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipmentLoadout.helmet).toBe(candidate);
  phase('equip durable');
});
