import { expect, test, type Page } from '@playwright/test';
import equipmentCatalog from '../src/data/equipment.json' with { type: 'json' };
import { pressMenuKey } from './menuInputReceipt';

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
  waitForInputFrame(): Promise<boolean>; freeze(): Promise<void>; resume(): void };
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
  await pressMenuKey(page, key);
}

function isEquipmentCard(key: string | undefined): boolean {
  return key?.startsWith('equipment-candidate:') === true || key?.startsWith('equipment-blueprint:') === true;
}

function cardRows(state: Diagnostic): Diagnostic['buttons'][] {
  const rows: Diagnostic['buttons'][] = [];
  for (const button of state.buttons.filter((candidate) => isEquipmentCard(candidate.key))
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x)) {
    const row = rows.at(-1);
    if (!row || Math.abs(row[0]!.bounds.y - button.bounds.y) > 2) rows.push([button]);
    else row.push(button);
  }
  return rows;
}

function firstVisibleCardAnchor(state: Diagnostic): { key: string; intraRowOffset: number } {
  const top = state.scroll!.top;
  const first = state.buttons.filter((button) => isEquipmentCard(button.key)
    && button.bounds.y + button.bounds.height > top)
    .sort((left, right) => left.bounds.y - right.bounds.y)[0]!;
  return { key: first.key!, intraRowOffset: Math.max(0, top - first.bounds.y) };
}

function focusDirection(state: Diagnostic, targetKey: string, viewportWidth: number): string {
  const currentKey = state.focusedKey;
  const current = state.buttons.find((button) => button.key === currentKey);
  const target = state.buttons.find((button) => button.key === targetKey);
  expect(current, `Known focus ${currentKey}`).toBeDefined();
  expect(target, `Existing semantic target ${targetKey}`).toBeDefined();
  if (!current || !target) return 'ArrowDown';

  // The slot/header plan hands Down to the first candidate row. Repeated Down
  // is the authored route through the four-slot grid and Browse Sets control.
  if (currentKey?.startsWith('equipment-slot:') || currentKey === 'equipment:browse-sets') {
    if (isEquipmentCard(targetKey)) return 'ArrowDown';
  }

  if (isEquipmentCard(currentKey) && isEquipmentCard(targetKey)) {
    const rows = cardRows(state);
    const currentRow = rows.findIndex((row) => row.some((button) => button.key === currentKey));
    const targetRow = rows.findIndex((row) => row.some((button) => button.key === targetKey));
    expect(currentRow, `Rendered row for ${currentKey}`).toBeGreaterThanOrEqual(0);
    expect(targetRow, `Rendered row for ${targetKey}`).toBeGreaterThanOrEqual(0);
    if (currentRow === targetRow) return target.bounds.x < current.bounds.x ? 'ArrowLeft' : 'ArrowRight';
    return targetRow < currentRow ? 'ArrowUp' : 'ArrowDown';
  }

  // Detail reading targets page with Up/Down; its actions are not adjacent
  // in the old linear button list and must be reached through the reader.
  if (currentKey?.startsWith('equipment-detail:') || currentKey?.startsWith('equipment-blueprint-detail:')) {
    return target.bounds.y < current.bounds.y ? 'ArrowUp' : 'ArrowDown';
  }

  // Keep the loadout overview's existing slot route as a small fallback.
  const currentIndex = state.buttons.indexOf(current);
  const targetIndex = state.buttons.indexOf(target);
  const columns = state.panel === 'loadout' || viewportWidth >= 1114 ? 4 : 2;
  if (currentIndex < 4 && targetIndex >= 4) return 'ArrowDown';
  if (currentIndex >= 4 && targetIndex < 4) return currentIndex > 4 ? 'ArrowLeft' : 'ArrowUp';
  if (currentIndex < 4 && targetIndex < 4 && Math.floor(currentIndex / columns) !== Math.floor(targetIndex / columns))
    return currentIndex < targetIndex ? 'ArrowDown' : 'ArrowUp';
  return currentIndex < targetIndex ? 'ArrowRight' : 'ArrowLeft';
}

async function focus(page: Page, key: string) {
  for (let step = 0; step < 80; step += 1) {
    const state = await diagnostic(page);
    if (state.focusedKey === key) return;
    await press(page, focusDirection(state, key, page.viewportSize()!.width));
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
  // Entry exposes the full inventory; choosing a physical slot applies the
  // explicit Helmet scope before comparing candidates.
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:'))).toHaveLength(equipmentCatalog.length);
  await press(page, 'Enter'); await settle(page);
  state = await diagnostic(page);
  expect(state.equipment?.selectedSlot).toBe('helmet');
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:'))).toHaveLength(equipmentCatalog.filter(piece => piece.slot === 'helmet').length);
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-candidate:')).every((button) => button.text.includes('Helmet'))).toBe(true);
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`);
  const target = (await diagnostic(page)).buttons.find((button) => button.key === `equipment-candidate:${candidate}`)!;
  expect(target.visible).toBe(true); expect(target.interactive).toBe(true);
  // The full-owned catalog still proves local-update ownership, alongside
  // the mixed stored/fabricable fixture in equipment-updates.pw.ts.
  const mounted = (await measurement(page)).events.filter(event => event.owner === 'menu.render').at(-1)!;
  expect(mounted).toBeDefined();
  // The target was reached through directional focus, so it is inside the
  // real collection rectangle. Pointer selection must retain that existing
  // anchor; the unit seam separately exercises a partially clipped card at
  // the callback boundary without depending on wheel quantization.
  const pointerViewport = await diagnostic(page);
  const pointerAnchor = firstVisibleCardAnchor(pointerViewport);
  const pointerTarget = pointerViewport.buttons.find((button) => button.key === `equipment-candidate:${candidate}`)!;
  expect(pointerTarget.visible).toBe(true);
  expect(pointerTarget.interactive).toBe(true);
  await page.evaluate(() => (globalThis as PerfGlobal).__MEOWCENARY_PERFORMANCE__.resetMeasurement());
  const x = pointerTarget.bounds.x + pointerTarget.bounds.width / 2;
  const y = pointerTarget.bounds.y + pointerTarget.bounds.height / 2;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await settle(page);
  state = await diagnostic(page);
  expect(state.equipment?.selectedInstanceId).toBe(candidate);
  expect(state.equipment?.equipped.helmet).toBe(id('equipment:commando-helmet'));
  expect(state.focusedKey).toBe(`equipment-candidate:${candidate}`);
  const selectedAnchor = firstVisibleCardAnchor(state);
  if (page.viewportSize()!.width < 1040) {
    // Compact selection is an in-place tail update, so its rendered-row
    // anchor is unchanged through the pointer callback.
    expect(selectedAnchor.key).toBe(pointerAnchor.key);
    expect(selectedAnchor.intraRowOffset).toBe(pointerAnchor.intraRowOffset);
  } else {
    // Wide selection intentionally adds the fixed inspector and reflows the
    // catalogue. The pointer callback still leaves the selected card focused;
    // the unit regression certifies that no pre-callback reveal moved its
    // existing anchor.
    expect(selectedAnchor.key).toBeDefined();
  }
  const local = await measurement(page);
  const renders = local.events.filter(event => event.owner === 'menu.render');
  const updates = local.events.filter(event => event.owner === 'menu.update');
  // Explicit slot selection already mounted the desktop inspector around the
  // equipped helmet. Replacing that selection updates its owned suffix in
  // place on both widths, preserving the browse scroll and render generation.
  expect(renders).toHaveLength(0);
  expect(updates).toHaveLength(1);
  expect(updates[0]!.facts).toMatchObject({ section: 'equipment-selection',
    reason: 'same-panel-state-mutation', rebuildCount: mounted.facts.rebuildCount, committed: true });
  await expect.poll(async () => (await measurement(page)).presentedMenu?.revision).toBe(updates[0]!.facts.revision);
  const details = state.buttons.find((button) => button.text === 'View details')!;
  expect(details).toBeDefined();
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(details.bounds.x + details.bounds.width / 2, details.bounds.y + details.bounds.height / 2);
  else await page.mouse.click(details.bounds.x + details.bounds.width / 2, details.bounds.y + details.bounds.height / 2);
  await settle(page);
  state = await diagnostic(page);
  expect(state.focusedKey).toBe(`equipment-detail:${candidate}`);
  const selectedDetail = state.buttons.find((button) => button.focused)!;
  // Shared scrolling clamps at the real content end on tall displays.
  expect(selectedDetail.bounds.y).toBeGreaterThanOrEqual(state.scroll!.top);
  expect(selectedDetail.bounds.y).toBeLessThan(state.scroll!.top + (state.scroll!.bottom - state.scroll!.top) / 2);
  expect(state.copy.join('\n')).toContain('REPLACES: Commando Helmet');
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
  // Detail commit actions are fixed chrome. The reader body remains the sole
  // scroll owner, so Equip must sit below its viewport rather than moving
  // under the mask as the explanation is paged.
  expect(action.bounds.y).toBeGreaterThanOrEqual(state.scroll!.bottom);
  await press(page, 'Enter'); await settle(page);
  expect((await diagnostic(page)).equipment?.equipped.helmet).toBe(candidate);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')!));
  expect(saved.equipmentLoadout.helmet).toBe(candidate);
  await test.step('capture the committed candidate', () => capture(page, testInfo.outputPath('equipment-committed.png')));
});

test('keeps the selected desktop slot grid inside the inspector mask through Back and resize', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'desktop-1280x720', 'The inspector ownership assertion is desktop-specific.');
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
  await focus(page, 'loadout:equipment'); await press(page, 'Enter'); await settle(page);
  await focus(page, 'equipment-slot:helmet'); await press(page, 'Enter'); await settle(page);
  const candidate = id('equipment:recon-helmet');
  await focus(page, `equipment-candidate:${candidate}`); await press(page, 'Enter'); await settle(page);

  let state = await diagnostic(page);
  expect(state.panel).toBe('equipment');
  expect(state.equipment?.selectedInstanceId).toBe(candidate);
  const slots = state.buttons.filter((button) => button.key?.startsWith('equipment-slot:'));
  expect(slots).toHaveLength(4);
  // 1280px wide uses a 1248px content band and reserves 320px + 16px for
  // the inspector, leaving the collection mask at x=16..928.
  slots.forEach((slot) => {
    expect(slot.bounds.x).toBeGreaterThanOrEqual(16);
    expect(slot.bounds.x + slot.bounds.width).toBeLessThanOrEqual(928);
  });
  await page.mouse.move(100, 180); await page.mouse.wheel(0, -10_000);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.waitForInputFrame())).toBe(true);
  state = await diagnostic(page);
  const visibleSlots = state.buttons.filter((button) => button.key?.startsWith('equipment-slot:'));
  expect(visibleSlots.every((slot) => slot.visible && slot.interactive)).toBe(true);
  await test.step('capture the selected inspector ownership', () => capture(page, testInfo.outputPath('equipment-selected-inspector.png')));

  await press(page, 'Escape'); await settle(page);
  expect((await diagnostic(page)).panel).toBe('loadout');
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: Seam }).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  await settle(page);
  await page.setViewportSize({ width: 844, height: 390 }); await settle(page);
  state = await diagnostic(page);
  expect(state.panel).toBe('equipment');
  expect(state.buttons.filter((button) => button.key?.startsWith('equipment-slot:'))).toHaveLength(4);
  state.buttons.filter((button) => button.key?.startsWith('equipment-slot:')).forEach((slot) => {
    expect(slot.bounds.x).toBeGreaterThanOrEqual(0);
    expect(slot.bounds.x + slot.bounds.width).toBeLessThanOrEqual(844);
    expect(slot.bounds.y).toBeGreaterThanOrEqual(0);
    expect(slot.bounds.y + slot.bounds.height).toBeLessThanOrEqual(390);
  });
});
