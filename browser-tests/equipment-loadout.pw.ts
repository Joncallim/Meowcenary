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
    await press(page, 'ArrowDown');
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
  await page.goto('/?visual-test=1');
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
  await press(page, 'ArrowRight');
  expect((await diagnostic(page)).focusedKey).toBe('equipment-slot:armour');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowDown');
  expect((await diagnostic(page)).focusedKey).toBe(page.viewportSize()!.width >= 674 ? `equipment-candidate:${id('equipment:commando-helmet')}` : 'equipment-slot:gloves');
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:'))).toHaveLength(8);
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:')).every((button) => button.text.includes('Helmet'))).toBe(true);
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`);
  const target = (await diagnostic(page)).buttons.find((button) => button.key === `equipment-candidate:${candidate}`)!;
  expect(target.visible).toBe(true); expect(target.interactive).toBe(true);
  const x = target.bounds.x + target.bounds.width / 2;
  const y = target.bounds.y + target.bounds.height / 2;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await settle(page);
  state = await diagnostic(page);
  expect(state.equipment?.selectedInstanceId).toBe(candidate);
  expect(state.equipment?.equipped.helmet).toBe(id('equipment:commando-helmet'));
  expect(state.focusedKey).toBe(`equipment-detail:${candidate}`);
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
