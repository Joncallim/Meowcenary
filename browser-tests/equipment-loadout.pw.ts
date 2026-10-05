import { expect, test, type Page } from '@playwright/test';
import equipmentCatalog from '../src/data/equipment.json' with { type: 'json' };

type Diagnostic = {
  panel: string;
  focusedKey?: string;
  copy: string[];
  buttons: Array<{ key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
    bounds: { x: number; y: number; width: number; height: number } }>;
  scroll?: { top: number; bottom: number; offset: number; contentHeight: number };
  equipment?: { selectedSlot: string; selectedInstanceId?: string; equipped: Record<string, string> };
};
type Seam = { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>; menuLoadoutDiagnostics(): Diagnostic;
  freeze(): Promise<void>; resume(): void };
type PerformanceState = { events: Array<{ owner: string; facts: Record<string, unknown> }>;
  presentedMenu?: { revision: number } };
type PerfGlobal = typeof globalThis & { __MEOWCENARY_PERFORMANCE__: {
  snapshot(): PerformanceState; resetMeasurement(): void } };
const measurement = (page: Page) => page.evaluate(() => (globalThis as PerfGlobal).__MEOWCENARY_PERFORMANCE__.snapshot());
const id = (piece: string) => `owned:${piece}`;

async function diagnostic(page: Page): Promise<Diagnostic> {
  return page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
}
async function press(page: Page, key: string) {
  await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(70);
}
async function focus(page: Page, key: string) {
  for (let step = 0; step < 80; step += 1) {
    if ((await diagnostic(page)).focusedKey === key) return;
    const state = await diagnostic(page);
    const current = state.buttons.findIndex(button => button.key === state.focusedKey);
    const target = state.buttons.findIndex(button => button.key === key);
    expect(current, `Known focus ${state.focusedKey}`).toBeGreaterThanOrEqual(0);
    expect(target, `Existing semantic target ${key}`).toBeGreaterThanOrEqual(0);
    const columns = state.panel === 'loadout' || page.viewportSize()!.width >= 1114 ? 4 : 2;
    let direction = current < target ? 'ArrowRight' : 'ArrowLeft';
    if (current < 4 && target >= 4) direction = 'ArrowDown';
    else if (current >= 4 && target < 4) direction = current > 4 ? 'ArrowLeft' : 'ArrowUp';
    else if (current < 4 && target < 4 && Math.floor(current / columns) !== Math.floor(target / columns))
      direction = current < target ? 'ArrowDown' : 'ArrowUp';
    await press(page, direction);
  }
  throw new Error(`Focus did not reach ${key}: ${JSON.stringify(await diagnostic(page))}`);
}
async function settle(page: Page) {
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
}
async function capture(page: Page, path: string) {
  // Capture one settled production frame. Keeping Phaser's render loop busy
  // during browser rasterization adds load without adding useful evidence.
  await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.freeze());
  try { await page.screenshot({ path }); }
  finally { await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.resume()); }
}

test('slot-first Equipment previews before commit and preserves semantic focus through live resize', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const seed = {
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] },
    stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
    gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
    equipment: Object.fromEntries(equipmentCatalog.map((piece) => [id(piece.id), { equipmentId: piece.id, tier: 1 }])),
    equipmentLoadout: { helmet: id('equipment:commando-helmet'), armour: id('equipment:commando-armour'), gloves: id('equipment:recon-gloves') },
    items: {}, bosses: {}, compendium: {}, pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
  };
  await page.addInitScript((save) => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed);
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  await settle(page);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.showMenu('loadout'))).toBe(true);
  await settle(page);
  let state = await diagnostic(page);
  expect(state.buttons.slice(0, 4).map((button) => button.key)).toEqual(['equipment-slot:helmet', 'equipment-slot:armour', 'equipment-slot:gloves', 'equipment-slot:boots']);
  expect(state.copy.join('\n')).toContain('EQUIPMENT • WHOLE LOADOUT');
  expect(state.copy.join('\n')).toContain('GUNSMITH • ENGINEERED WEAPON FAMILY');
  await test.step('capture the settled four-slot overview', () => capture(page, testInfo.outputPath('loadout-slots.png')));
  await focus(page, 'loadout:equipment'); await press(page, 'Enter'); await settle(page);
  state = await diagnostic(page);
  expect(state.panel).toBe('equipment');
  // Traverse every physical slot using the same spatial grid as the owner.
  const columns = page.viewportSize()!.width >= 1114 ? 4 : 2;
  const forward = columns === 2
    ? [['ArrowRight', 'armour'], ['ArrowDown', 'boots'], ['ArrowLeft', 'gloves'], ['ArrowUp', 'helmet']]
    : [['ArrowRight', 'armour'], ['ArrowRight', 'gloves'], ['ArrowRight', 'boots']];
  const reverse = columns === 2
    ? [['ArrowDown', 'gloves'], ['ArrowRight', 'boots'], ['ArrowUp', 'armour'], ['ArrowLeft', 'helmet']]
    : [['ArrowLeft', 'gloves'], ['ArrowLeft', 'armour'], ['ArrowLeft', 'helmet']];
  for (const [direction, slot] of [...forward, ...reverse]) {
    await press(page, direction!);
    expect((await diagnostic(page)).focusedKey).toBe(`equipment-slot:${slot}`);
  }
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:'))).toHaveLength(8);
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:')).every((button) => button.text.includes('Helmet'))).toBe(true);
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`);
  const target = (await diagnostic(page)).buttons.find((button) => button.key === `equipment-candidate:${candidate}`)!;
  expect(target.visible).toBe(true); expect(target.interactive).toBe(true);
  // The full-owned catalog still proves local-update ownership, alongside
  // the mixed stored/fabricable fixture in equipment-updates.pw.ts.
  const mounted = (await measurement(page)).events.filter(event => event.owner === 'menu.render').at(-1)!;
  expect(mounted).toBeDefined();
  await page.evaluate(() => (globalThis as PerfGlobal).__MEOWCENARY_PERFORMANCE__.resetMeasurement());
  const x = target.bounds.x + target.bounds.width / 2;
  const viewport = await diagnostic(page);
  const top = Math.max(target.bounds.y, viewport.scroll!.top);
  const bottom = Math.min(target.bounds.y + target.bounds.height, viewport.scroll!.bottom);
  expect(bottom).toBeGreaterThan(top);
  const y = (top + bottom) / 2;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await settle(page);
  state = await diagnostic(page);
  expect(state.equipment?.selectedInstanceId).toBe(candidate);
  expect(state.equipment?.equipped.helmet).toBe(id('equipment:commando-helmet'));
  expect(state.focusedKey).toBe(`equipment-detail:${candidate}`);
  const local = await measurement(page);
  expect(local.events.filter(event => event.owner === 'menu.render')).toHaveLength(0);
  const updates = local.events.filter(event => event.owner === 'menu.update');
  expect(updates).toHaveLength(1);
  expect(updates[0]!.facts).toMatchObject({ section: 'equipment-selection',
    reason: 'same-panel-state-mutation', rebuildCount: mounted.facts.rebuildCount, committed: true });
  await expect.poll(async () => (await measurement(page)).presentedMenu?.revision).toBe(updates[0]!.facts.revision);
  const selectedDetail = state.buttons.find((button) => button.focused)!;
  // Shared scrolling clamps at the real content end on tall displays.
  expect(selectedDetail.bounds.y).toBeGreaterThanOrEqual(state.scroll!.top);
  expect(selectedDetail.bounds.y).toBeLessThan(state.scroll!.top + (state.scroll!.bottom - state.scroll!.top) / 2);
  expect(state.copy.join('\n')).toContain('Replaces Commando Helmet');
  expect(state.copy.join('\n')).toContain('LOSE 2-piece');
  expect(state.copy.join('\n')).toContain('GAIN 2-piece');
  expect(state.copy.join('\n')).toContain('[All Weapons]');
  await test.step('capture candidate consequences before persistence', () => capture(page, testInfo.outputPath('equipment-preview.png')));
  // The desktop context has a fine pointer; phone landscape remains guarded
  // by the production orientation adapter and is covered by its own suite.
  if (!testInfo.project.use.hasTouch) {
    for (const viewport of [{ width: 844, height: 390 }, { width: 360, height: 640 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => (await diagnostic(page)).focusedKey).toBe(`equipment-detail:${candidate}`);
      expect((await diagnostic(page)).equipment?.selectedInstanceId).toBe(candidate);
    }
  }
  await focus(page, `equipment-equip:${candidate}`);
  state = await diagnostic(page);
  const action = state.buttons.find((button) => button.focused)!;
  expect(action.bounds.height).toBeGreaterThanOrEqual(44);
  expect(action.bounds.width).toBeGreaterThanOrEqual(44);
  expect(action.bounds.y).toBeGreaterThanOrEqual(state.scroll!.top);
  expect(action.bounds.y + action.bounds.height).toBeLessThanOrEqual(state.scroll!.bottom);
  await press(page, 'Enter'); await settle(page);
  expect((await diagnostic(page)).equipment?.equipped.helmet).toBe(candidate);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipmentLoadout.helmet).toBe(candidate);
  await test.step('capture the committed candidate', () => capture(page, testInfo.outputPath('equipment-committed.png')));
});
