import { expect, test, type Page } from '@playwright/test';
import visualArt from '../src/data/visual-art.json' with { type: 'json' };
import partVisuals from '../src/data/gunsmith-part-visuals.json' with { type: 'json' };

type Event = { owner: string; facts: Record<string, string | number | boolean | readonly string[]> };
type Diagnostic = { panel: string; focusedKey?: string; copy: string[];
  scroll?: { top: number; bottom: number; offset: number; contentHeight: number };
  buttons: { key?: string; text: string; focused: boolean; visible: boolean; interactive: boolean;
    bounds: { x: number; y: number; width: number; height: number } }[] };
type Globals = typeof globalThis & {
  __MEOWCENARY_VISUAL_TEST__?: { showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
    menuLoadoutDiagnostics(): Diagnostic; isMenuInputNeutral(): boolean;
    menuArtDiagnostics(): { texture: string; frame: string | number; x: number; y: number;
      width: number; height: number; alpha: number; visible: boolean;
      crop?: { x: number; y: number; width: number; height: number } }[] };
  __MEOWCENARY_PERFORMANCE__?: { resetMeasurement(): void; snapshot(): {
    events: Event[]; presentedMenu?: { panel: string; rebuildCount: number; revision: number } } };
};
async function checkpoint(page: Page) {
  return page.evaluate(() => ({
    diagnostic: (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics(),
    perf: (globalThis as Globals).__MEOWCENARY_PERFORMANCE__!.snapshot(),
    saved: localStorage.getItem('meowcenary.save.v2'),
  }));
}

for (const scenario of ['current mount', 'returned and resized mount', 'equipment failure and retry'] as const) {
test(`late Loadout art preserves mounted controls without full rebuilds: ${scenario}`, async ({ page }, testInfo) => {
  const capture = async (name: string) => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const seed = {
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] }, stages: {}, achievements: {}, characters: {},
    gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] } } },
    equipment: { commando: { equipmentId: 'equipment:commando-helmet', tier: 1 } },
    equipmentLoadout: { helmet: 'commando' },
  };
  await page.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed);
  let releaseEquipment!: () => void; let releaseAssembly!: () => void;
  const equipmentHeld = new Promise<void>(resolve => { releaseEquipment = resolve; });
  const assemblyHeld = new Promise<void>(resolve => { releaseAssembly = resolve; });
  let equipmentRequested = 0; let assemblyRequested = 0;
  let failEquipment = scenario === 'equipment failure and retry';
  await page.route('**/assets/equipment/commando/commando-equipment-atlas.png', async route => {
    equipmentRequested += 1; await equipmentHeld;
    if (failEquipment) await route.abort('failed');
    else await route.continue();
  });
  await page.route('**/assets/gunsmith/tiers/gunsmith-tier-assembly-atlas.png', async route => {
    assemblyRequested += 1; await assemblyHeld; await route.continue();
  });
  try {
    await page.goto('/?visual-test=1&perf-test=1');
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showMenu('loadout'))).toBe(true);
    await expect.poll(() => equipmentRequested).toBe(1);
    if (scenario === 'returned and resized mount') {
      await page.keyboard.down('Escape');
      try {
        await expect.poll(async () => (await checkpoint(page)).diagnostic.panel).toBe('home');
      } finally { await page.keyboard.up('Escape'); }
      await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(true);
      const target = (await checkpoint(page)).diagnostic.buttons.find(button => button.text === 'Loadout')!;
      expect(target.visible && target.interactive).toBe(true);
      const { x, y, width, height } = target.bounds;
      if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x + width / 2, y + height / 2);
      else await page.mouse.click(x + width / 2, y + height / 2);
      await expect.poll(async () => (await checkpoint(page)).diagnostic.panel).toBe('loadout');
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: viewport.width + 23, height: viewport.height + 29 });
      await expect.poll(async () => (await checkpoint(page)).perf.events.filter(event =>
        event.owner === 'menu.render' && event.facts.reason === 'viewport-resize').length).toBeGreaterThan(0);
    }
    // Exercise the real focus/input path while physical art is still pending.
    await page.keyboard.down('ArrowRight');
    try {
      await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(false);
    } finally { await page.keyboard.up('ArrowRight'); }
    await expect.poll(() => page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isMenuInputNeutral())).toBe(true);
    const before = await checkpoint(page);
    expect(before.diagnostic.panel).toBe('loadout');
    expect(before.diagnostic.focusedKey).toBe('equipment-slot:armour');
    const reserved = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuArtDiagnostics());
    const missing = reserved.filter(row => row.texture === '__DEFAULT');
    expect(missing.length).toBeGreaterThanOrEqual(2);
    expect(missing.every(row => row.alpha === 0 && row.width > 0 && row.height > 0)).toBe(true);
    expect(missing.every(row => row.crop === undefined)).toBe(true);
    await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_PERFORMANCE__!.resetMeasurement());
    releaseEquipment();
    await expect.poll(() => assemblyRequested).toBe(1);
    releaseAssembly();
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const state = (globalThis as Globals).__MEOWCENARY_PERFORMANCE__!.snapshot();
      const update = state.events.filter(event => event.owner === 'menu.update' && event.facts.reason === 'lazy-art-hydration').at(-1);
      return !!update && update.facts.committed === true && state.presentedMenu?.panel === 'loadout'
        && state.presentedMenu.revision === update.facts.revision;
    })).toBe(true);
    const after = await checkpoint(page);
    expect(after.perf.events.filter(event => event.owner === 'menu.render')).toHaveLength(0);
    const updates = after.perf.events.filter(event => event.owner === 'menu.update' && event.facts.reason === 'lazy-art-hydration');
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates.every(event => event.facts.committed === true && event.facts.created === 0 && event.facts.destroyed === 0)).toBe(true);
    expect(after.perf.presentedMenu!.revision).toBe(updates.at(-1)!.facts.revision);
    expect(after.perf.presentedMenu!.rebuildCount).toBe(updates.at(-1)!.facts.rebuildCount);
    expect(after.diagnostic).toEqual(before.diagnostic);
    expect(after.saved).toBe(before.saved);
    const bound = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuArtDiagnostics());
    expect(bound).toHaveLength(reserved.length);
    // Tree traversal order is the actual Phaser draw order. Rebinding changes
    // texture/frame/opacity and source-local crop; full placement and layer
    // position stay fixed. Crop is checked separately after binding below.
    expect(bound.map(({ texture: _texture, frame: _frame, alpha: _alpha, crop: _crop, ...geometry }) => geometry))
      .toEqual(reserved.map(({ texture: _texture, frame: _frame, alpha: _alpha, crop: _crop, ...geometry }) => geometry));
    if (scenario === 'equipment failure and retry') {
      // The Commando physical atlas owns both this helmet and its Set emblem.
      expect(bound.filter(row => row.texture === '__DEFAULT')).toHaveLength(2);
      expect(bound.filter(row => row.texture === '__DEFAULT').every(row => row.alpha === 0 && row.crop === undefined)).toBe(true);
      expect(equipmentRequested).toBe(3); // Phaser's established two retries.
    } else {
      expect(bound.some(row => row.texture === 'art-equipment-commando' && row.frame === 'equipment-icon:commando-helmet' && row.alpha === 1 && row.visible)).toBe(true);
      expect(equipmentRequested).toBe(1);
    }
    const assembly = bound.filter(row => row.texture === 'art-gunsmith-tier-assembly');
    const base = visualArt.bindings.find(row => row.id === 'gun-build-base:pistol')!;
    const receiverTier = partVisuals.parts.find(part => part.partId === 'part:receiver-heavy')!.tiers.find(tier => tier.tier === 2)!;
    if (!('assemblyArtId' in receiverTier)) throw new Error('The selected receiver tier must have assembly art');
    const receiver = visualArt.bindings.find(row => row.id === receiverTier.assemblyArtId)!;
    expect(assembly.map(row => row.frame)).toEqual([base.frameKey, receiver.frameKey]);
    // Literal native rectangles retain two transparent pixels around every
    // nonzero source pixel. Lazy binding must match the already-loaded path.
    expect(assembly.map(row => row.crop)).toEqual([
      { x: 87, y: 67, width: 114, height: 104 },
      { x: 103, y: 63, width: 74, height: 59 },
    ]);
    expect(assembly.every(row => row.alpha === 1 && row.width > 0 && row.height > 0)).toBe(true);
    expect(assembly[0]!.x).toBe(assembly[1]!.x);
    expect(assembly[0]!.y).toBe(assembly[1]!.y);
    expect(assemblyRequested).toBe(1);
    expect(errors).toEqual([]);
    await capture('loadout-hydrated');
    if (scenario === 'equipment failure and retry') {
      failEquipment = false;
      // Warm navigation retries the unavailable physical resource, while
      // already loaded assembly stays cached. Observe after the real mount.
      expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showMenu('home'))).toBe(true);
      expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showMenu('loadout'))).toBe(true);
      expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
      const retry = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuArtDiagnostics());
      expect(retry.some(row => row.texture === 'art-equipment-commando' && row.frame === 'equipment-icon:commando-helmet' && row.alpha === 1 && row.visible)).toBe(true);
      expect(retry.filter(row => row.texture === '__DEFAULT')).toHaveLength(0);
      expect(equipmentRequested).toBe(4);
      expect(assemblyRequested).toBe(1);
      expect((await checkpoint(page)).saved).toBe(before.saved);
      expect(errors).toEqual([]);
      await capture('loadout-retried');
    }
    const scroll = (await checkpoint(page)).diagnostic.scroll!;
    await page.mouse.move(page.viewportSize()!.width / 2, (scroll.top + scroll.bottom) / 2);
    await page.mouse.wheel(0, 9000);
    await expect.poll(async () => (await checkpoint(page)).diagnostic.scroll!.offset).toBeGreaterThan(0);
    await capture('loadout-assembly');
  } finally {
    releaseEquipment(); releaseAssembly();
  }
});
}
