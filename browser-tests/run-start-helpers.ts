import { expect, type CDPSession, type Page } from '@playwright/test';

// The no-contact response describes this CDP session, never page neutrality.
async function cancelOwnedTouch(session: CDPSession): Promise<void> {
  try { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.') throw error;
  }
}
async function withOwnedTouchSession(page: Page, operation?: (session: CDPSession) => Promise<void>): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const failures: unknown[] = [];
  try { await operation?.(session); }
  catch (error) { failures.push(error); }
  finally {
    // An interrupted gesture must be cancelled through its original owner.
    // Preserve operation/cleanup failures and always attempt one detach.
    try { await cancelOwnedTouch(session); }
    catch (error) { failures.push(error); }
    finally {
      try { await session.detach(); }
      catch (error) { failures.push(error); }
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Touch operation and session cleanup failed');
}

export type IntroCommand = 'continue' | 'start' | 'skip-dialogue' | 'return-menu';
export type Rect = { x: number; y: number; width: number; height: number };
export type IntroDiagnostics = {
  visible: boolean; status: string; phase: 'brief' | 'boss' | 'consumed' | 'cancelled'; revision: number | null; timeMs: number;
  identity?: unknown; objective?: unknown; focusedCommand?: IntroCommand;
  inputNeutral: boolean; inputQuarantined: boolean; ready: boolean;
  commands: Array<{ command: IntroCommand; label: string; bounds: Rect; enabled: boolean }>;
  runStart: { count: number; timeMs?: number; atMs?: number }; terminalEvents: number;
};
type Seam = { runStartIntroDiagnostics(): IntroDiagnostics | undefined; waitForInputFrame(): Promise<boolean>; isSceneActive(key: string): boolean };
type BrowserGlobals = { __MEOWCENARY_VISUAL_TEST__?: Seam };
export async function readRunStartIntro(page: Page): Promise<IntroDiagnostics | undefined> {
  return page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__?.runStartIntroDiagnostics());
}
async function inputFrame(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__?.waitForInputFrame() ?? false)).toBe(true);
}
async function releasePreviousGestures(page: Page): Promise<void> {
  for (const key of ['Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'p', 'i']) await page.keyboard.up(key);
  // An interrupted old press is cancelled outside its target, not released as
  // a new command. No diagnostic clears the adapter's physical state.
  await page.mouse.move(-1, -1); await page.mouse.up();
  await withOwnedTouchSession(page);
}
export function introCommand(state: IntroDiagnostics, command: IntroCommand, viewport: { width: number; height: number }) {
  const matches = state.commands.filter(row => row.command === command);
  expect(matches, `exactly one ${command}`).toHaveLength(1);
  const row = matches[0]!; const rect = row.bounds;
  expect(row.enabled).toBe(true); expect(rect.width).toBeGreaterThan(0); expect(rect.height).toBeGreaterThanOrEqual(44);
  expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + .01); expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + .01);
  return row;
}

/** Commands use the actual input owner and current semantic target, never a
 * private Start call, a fixed index or a diagnostic quarantine reset. */
export async function activateIntroCommand(page: Page, command: IntroCommand, input: 'keyboard' | 'mouse' | 'touch' = 'keyboard'): Promise<IntroDiagnostics> {
  await releasePreviousGestures(page); await inputFrame(page);
  await expect.poll(async () => {
    const state = await readRunStartIntro(page);
    return Boolean(state?.visible && state.ready && state.inputNeutral && !state.inputQuarantined);
  }).toBe(true);
  let before = (await readRunStartIntro(page))!;
  expect(before.status).toBe('intro'); expect(before.timeMs).toBe(0); expect(before.revision).not.toBeNull();
  const identity = before.identity, objective = before.objective, revision = before.revision!;
  if (input === 'keyboard') {
    // Left/right selects footer commands even while Up/Down owns body reading.
    for (let step = 0; before.focusedCommand !== command && step < before.commands.length; step++) {
      await page.keyboard.down('ArrowRight'); try { await inputFrame(page); } finally { await page.keyboard.up('ArrowRight'); }
      await inputFrame(page); before = (await readRunStartIntro(page))!;
    }
    expect(before.focusedCommand).toBe(command);
  }
  const row = introCommand(before, command, page.viewportSize()!); const { x, y, width, height } = row.bounds;
  if (input === 'keyboard') {
    await page.keyboard.down('Enter'); try { await inputFrame(page); } finally { await page.keyboard.up('Enter'); }
  } else if (input === 'mouse') {
    await page.mouse.move(x + width / 2, y + height / 2); await page.mouse.down();
    try { await inputFrame(page); } finally { await page.mouse.up(); }
  } else {
    await withOwnedTouchSession(page, async session => {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + width / 2, y: y + height / 2, id: 1 }] });
      await inputFrame(page); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });
  }
  await inputFrame(page);
  if (command === 'continue') {
    await expect.poll(async () => (await readRunStartIntro(page))?.phase).toBe('boss');
    const after = (await readRunStartIntro(page))!;
    expect(after).toMatchObject({ visible: true, status: 'intro', timeMs: 0, revision: revision + 1, runStart: { count: 0 }, terminalEvents: 0 });
    expect(after.identity).toEqual(identity); expect(after.objective).toEqual(objective); return after;
  }
  if (command === 'return-menu') {
    await expect.poll(() => page.evaluate(() => (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
    const after = (await readRunStartIntro(page))!;
    expect(after).toMatchObject({ visible: false, phase: 'cancelled', runStart: { count: 0 }, terminalEvents: 0 }); return after;
  }
  await expect.poll(async () => (await readRunStartIntro(page))?.runStart.count).toBe(1);
  const after = (await readRunStartIntro(page))!;
  expect(after.visible).toBe(false); expect(after.phase).toBe('consumed'); expect(after.status).not.toBe('intro');
  // Polling may already see simulation time; the event observation is exact.
  expect(after.runStart.timeMs).toBe(0); expect(after.runStart.atMs).toEqual(expect.any(Number)); return after;
}

/** New builds must show an explicit intro. Dialogue is read with Continue,
 * then Start; skipping is a deliberate separate request. */
export async function completeRunStartIntro(page: Page, input: 'keyboard' | 'mouse' | 'touch' = 'keyboard', skipDialogue = false): Promise<IntroDiagnostics> {
  await expect.poll(async () => {
    const state = await readRunStartIntro(page); return state?.visible === true || state?.status === 'active';
  }).toBe(true);
  const state = (await readRunStartIntro(page))!;
  expect(state.visible, 'new intro execution cannot silently accept an already-active baseline').toBe(true);
  if (state.commands.some(row => row.command === 'continue')) {
    if (skipDialogue) return activateIntroCommand(page, 'skip-dialogue', input);
    await activateIntroCommand(page, 'continue', input);
  }
  return activateIntroCommand(page, 'start', input);
}
