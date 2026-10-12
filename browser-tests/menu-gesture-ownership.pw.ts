import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type Point = { x: number; y: number };
type Button = { key?: string; visible: boolean; interactive: boolean;
  bounds: { x: number; y: number; width: number; height: number } };
type Diagnostic = { panel: string; focusedKey?: string; buttons: Button[];
  scroll?: { top: number; bottom: number; offset: number; contentHeight: number };
  equipment?: { selectedSlot: string; selectedInstanceId?: string; equipped: Record<string, string> } };
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__: {
  showMenu(panel: string): boolean; waitForMenuPresentation(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>; isMenuInputNeutral(): boolean; menuLoadoutDiagnostics(): Diagnostic } };

// Repeated instances are legal stored equipment, not a modified catalog. This
// makes the current helmet collection overflow even at the largest profile.
const seed = {
  version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
  progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] },
  stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
  gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
  equipment: Object.fromEntries(Array.from({ length: 20 }, (_, index) =>
    [`helmet:${index}`, { equipmentId: 'equipment:commando-helmet', tier: 1 }])),
  equipmentLoadout: { helmet: 'helmet:0' }, items: {}, bosses: {}, compendium: {},
  pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
};

async function sample(page: Page) {
  return page.evaluate(async () => {
    const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__;
    // Observe real owner updates, including Phaser's late input poll. No
    // manual stepping, input reset, retained objects or production globals.
    const frames = [await seam.waitForInputFrame(), await seam.waitForInputFrame()];
    const canvas = document.querySelector('canvas')!;
    return { frames, diagnostic: seam.menuLoadoutDiagnostics(), neutral: seam.isMenuInputNeutral(),
      saved: localStorage.getItem('meowcenary.save.v2'),
      nativeCancel: canvas.dataset.gestureNativeCancel,
      secondaryEnd: canvas.dataset.gestureSecondaryEnd,
      remainingTouchIds: canvas.dataset.gestureRemainingTouchIds,
      releasedTouchIds: canvas.dataset.gestureReleasedTouchIds };
  });
}

test('current Menu rectangle owns wheel, drag, cancellation and physical release', async ({ page }, testInfo) => {
  await page.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), seed);
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Partial<Globals>).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.showMenu('equipment'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
  const baseline = await sample(page), region = baseline.diagnostic.scroll!;
  expect(baseline.frames).toEqual([true, true]); expect(baseline.neutral).toBe(true);
  expect(region).toBeDefined(); expect(region.contentHeight).toBeGreaterThan(region.bottom - region.top);
  expect(baseline.diagnostic.buttons.filter(button => button.key?.startsWith('equipment-candidate:'))).toHaveLength(20);
  const width = page.viewportSize()!.width;
  const outside = { x: width * 0.9, y: region.top - 12 };
  const inside = { x: width * 0.9, y: region.top + Math.min(80, (region.bottom - region.top) / 4) };
  const evidence: Array<{ phase: string; state: Awaited<ReturnType<typeof sample>> }> = [];
  const unchanged = (state: Awaited<ReturnType<typeof sample>>, focus?: Pick<Diagnostic, 'focusedKey'>) => {
    expect(state.frames).toEqual([true, true]); expect(state.saved).toBe(baseline.saved);
    expect(state.diagnostic.panel).toBe('equipment'); expect(state.diagnostic.equipment).toEqual(baseline.diagnostic.equipment);
    if (focus) expect(state.diagnostic.focusedKey).toBe(focus.focusedKey);
  };
  const observe = async (phase: string, focus?: Pick<Diagnostic, 'focusedKey'>) => {
    const state = await sample(page); evidence.push({ phase, state }); unchanged(state, focus); return state;
  };
  // Wheel remains genuine mouse input on touch profiles too; the header must
  // never route it into the collection underneath.
  await page.mouse.move(outside.x, outside.y); await page.mouse.wheel(0, 80);
  let mousePoint = outside;
  expect((await observe('outside-header-wheel')).diagnostic.scroll!.offset).toBe(region.offset);

  const touch = Boolean(testInfo.project.use.hasTouch);
  const session = touch ? await page.context().newCDPSession(page) : undefined;
  let held = false;
  const down = async (point: Point) => {
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    else {
      if (mousePoint.x !== point.x || mousePoint.y !== point.y) await page.mouse.move(point.x, point.y);
      mousePoint = point; await page.mouse.down();
    }
    held = true;
  };
  const move = async (point: Point) => {
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
    else { await page.mouse.move(point.x, point.y); mousePoint = point; }
  };
  const up = async () => {
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    held = false;
  };
  try {
    await down(outside); await move({ ...inside, y: inside.y + 20 }); await move(inside); await up();
    expect((await observe('outside-down-cannot-adopt-body')).diagnostic.scroll!.offset).toBe(region.offset);
    await down(inside);
    for (const dy of [-3, 0, -3, 0, -7]) await move({ ...inside, y: inside.y + dy });
    expect((await observe('inside-subthreshold-jitter')).diagnostic.scroll!.offset).toBe(region.offset);
    await move({ ...inside, y: inside.y - 12 });
    expect((await observe('inside-threshold-crossed')).diagnostic.scroll!.offset).toBeGreaterThan(region.offset);
    await move(inside); await up();
    const returned = await observe('drag-return-to-origin-is-not-tap'); expect(returned.neutral).toBe(true);

    if (session) {
      await page.evaluate(() => document.querySelector('canvas')!.addEventListener('touchcancel', event => {
        document.querySelector('canvas')!.dataset.gestureNativeCancel = String(event.isTrusted);
      }, { once: true }));
      await down(inside);
      const cancelOwner = await observe('native-touch-owner-focus');
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); held = false;
      const cancelled = await observe('native-touch-cancel', cancelOwner.diagnostic);
      expect(cancelled.nativeCancel).toBe('true'); expect(cancelled.neutral).toBe(true);
      expect(cancelled.diagnostic.scroll!.offset).toBe(returned.diagnostic.scroll!.offset);
      const back = cancelled.diagnostic.buttons.find(button => button.key === 'back')!;
      expect(back).toBeDefined(); expect(back.interactive).toBe(true);
      const secondary = { id: 2, x: back.bounds.x + back.bounds.width / 2, y: back.bounds.y + back.bounds.height / 2 };
      await down(inside);
      // Primary OVER may legitimately focus its own target. Capture that
      // semantic authority before the ignored secondary enters Back.
      const ownerFocus = await observe('multitouch-primary-owned-focus');
      expect(ownerFocus.diagnostic.focusedKey).toBeDefined();
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...inside, id: 1 }, secondary] });
      await observe('secondary-back-over-with-owner-held', ownerFocus.diagnostic);
      await page.evaluate(() => document.querySelector('canvas')!.addEventListener('touchend', event => {
        const canvas = document.querySelector('canvas')!;
        canvas.dataset.gestureSecondaryEnd = `${event.isTrusted}:${event.touches.length}`;
        canvas.dataset.gestureRemainingTouchIds = JSON.stringify(Array.from(event.touches, touch => touch.identifier));
        canvas.dataset.gestureReleasedTouchIds = JSON.stringify(Array.from(event.changedTouches, touch => touch.identifier));
      }, { once: true }));
      // Pinned Chromium's WebTouchEvents path releases the supplied END IDs.
      // MOVE omission does not release a contact on that path. Observe the
      // native remaining/changed IDs; protocol receipt alone is insufficient.
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [secondary] });
      const secondaryReleased = await observe('secondary-back-release-with-owner-held', ownerFocus.diagnostic);
      expect(secondaryReleased.secondaryEnd).toBe('true:1'); expect(secondaryReleased.neutral).toBe(false);
      expect(secondaryReleased.remainingTouchIds).toBe('[1]'); expect(secondaryReleased.releasedTouchIds).toBe('[2]');
      expect(secondaryReleased.diagnostic.scroll!.offset).toBe(cancelled.diagnostic.scroll!.offset);
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); held = false;
      expect((await observe('multitouch-owner-cancelled', ownerFocus.diagnostic)).neutral).toBe(true);
    }
    const beforeFresh = (await observe('before-fresh-scroll')).diagnostic.scroll!.offset;
    await down(inside); await move({ ...inside, y: inside.y - 40 }); await up();
    const fresh = await observe('fresh-physical-scroll'); expect(fresh.neutral).toBe(true);
    expect(fresh.diagnostic.scroll!.offset).toBeGreaterThan(beforeFresh);
    const back = fresh.diagnostic.buttons.find(button => button.key === 'back')!;
    expect(back).toBeDefined(); expect(back.interactive).toBe(true);
    const point = { x: back.bounds.x + back.bounds.width / 2, y: back.bounds.y + back.bounds.height / 2 };
    if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation())).toBe(true);
    const finished = await sample(page); evidence.push({ phase: 'fresh-back-tap', state: finished });
    expect(finished.diagnostic.panel).toBe('loadout'); expect(finished.saved).toBe(baseline.saved); expect(finished.neutral).toBe(true);
  } finally {
    try {
      if (held) { if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); else await page.mouse.up(); }
    } finally {
      await session?.detach();
      const evidencePath = testInfo.outputPath('menu-gesture-physical-evidence.json');
      await writeFile(evidencePath, JSON.stringify({ profile: testInfo.project.name,
        physical: touch ? 'touch + wheel; native cancel and multitouch' : 'mouse wheel/drag/tap', evidence }, null, 2));
      await testInfo.attach('menu-gesture-physical-evidence', { path: evidencePath, contentType: 'application/json' });
    }
  }
});
