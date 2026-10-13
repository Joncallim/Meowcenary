import { expect, type CDPSession, type Page } from '@playwright/test';
// @ts-expect-error standalone JavaScript tooling has no declaration file
import { isNoActiveCdpTouchMessage, releaseRunStartKeys } from '../scripts/performance-run-start.mjs';
export { isNoActiveCdpTouchMessage };

// The no-contact response describes this CDP session, never page neutrality.
async function cancelOwnedTouch(session: CDPSession): Promise<void> {
  try { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
  catch (error) {
    if (!(error instanceof Error) || !isNoActiveCdpTouchMessage(error.message)) throw error;
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
async function inputFrame(page: Page): Promise<{ state?: IntroDiagnostics; menuActive: boolean }> {
  const sample = await page.evaluate(async () => {
    const seam = (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__;
    const completed = await seam?.waitForInputFrame() ?? false;
    return { completed, state: completed === true ? seam?.runStartIntroDiagnostics() : undefined,
      menuActive: completed === true && seam?.isSceneActive('MenuScene') === true };
  });
  expect(sample.completed).toBe(true); return sample;
}
async function releasePreviousGestures(page: Page): Promise<void> {
  await releaseRunStartKeys(page);
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
  await releasePreviousGestures(page);
  const admission = await inputFrame(page);
  let before: IntroDiagnostics | undefined;
  let admissionSample = admission.state;
  await expect.poll(async () => {
    const state = admissionSample ?? await readRunStartIntro(page); admissionSample = undefined;
    const admitted = Boolean(state?.visible && state.ready && state.inputNeutral && !state.inputQuarantined);
    if (admitted) before = state;
    return admitted;
  }).toBe(true);
  // Assert the immutable sample that admitted the command, rather than doing
  // another renderer round trip for the same unchanged input-owner frame.
  let accepted = before!;
  expect(accepted.status).toBe('intro'); expect(accepted.timeMs).toBe(0); expect(accepted.revision).not.toBeNull();
  const identity = accepted.identity, objective = accepted.objective, revision = accepted.revision!;
  if (input === 'keyboard') {
    // Left/right selects footer commands even while Up/Down owns body reading.
    for (let step = 0; accepted.focusedCommand !== command && step < accepted.commands.length; step++) {
      await page.keyboard.down('ArrowRight'); try { await inputFrame(page); } finally { await page.keyboard.up('ArrowRight'); }
      accepted = (await inputFrame(page)).state!;
    }
    expect(accepted.focusedCommand).toBe(command);
  }
  const row = introCommand(accepted, command, page.viewportSize()!); const { x, y, width, height } = row.bounds;
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
  const completion = await inputFrame(page);
  if (command === 'continue') {
    let observed: IntroDiagnostics | undefined;
    let first = completion.state;
    await expect.poll(async () => { observed = first ?? await readRunStartIntro(page); first = undefined; return observed?.phase; }).toBe('boss');
    const after = observed!;
    expect(after).toMatchObject({ visible: true, status: 'intro', timeMs: 0, revision: revision + 1, runStart: { count: 0 }, terminalEvents: 0 });
    expect(after.identity).toEqual(identity); expect(after.objective).toEqual(objective); return after;
  }
  if (command === 'return-menu') {
    let observed: IntroDiagnostics | undefined;
    let first: { menuActive: boolean; state?: IntroDiagnostics } | undefined = completion;
    await expect.poll(async () => {
      const sample = first ?? await page.evaluate(() => {
        const seam = (globalThis as BrowserGlobals).__MEOWCENARY_VISUAL_TEST__!;
        return { menuActive: seam.isSceneActive('MenuScene'), state: seam.runStartIntroDiagnostics() };
      });
      first = undefined; observed = sample.state; return sample.menuActive;
    }).toBe(true);
    const after = observed!;
    expect(after).toMatchObject({ visible: false, phase: 'cancelled', runStart: { count: 0 }, terminalEvents: 0 }); return after;
  }
  let observed: IntroDiagnostics | undefined;
  let first = completion.state;
  await expect.poll(async () => { observed = first ?? await readRunStartIntro(page); first = undefined; return observed?.runStart.count; }).toBe(1);
  const after = observed!;
  expect(after.visible).toBe(false); expect(after.phase).toBe('consumed'); expect(after.status).not.toBe('intro');
  // Polling may already see simulation time; the event observation is exact.
  expect(after.runStart.timeMs).toBe(0); expect(after.runStart.atMs).toEqual(expect.any(Number)); return after;
}

/** New builds must show an explicit intro. Dialogue is read with Continue,
 * then Start; skipping is a deliberate separate request. */
export async function completeRunStartIntro(page: Page, input: 'keyboard' | 'mouse' | 'touch' = 'keyboard', skipDialogue = false): Promise<IntroDiagnostics> {
  let observed: IntroDiagnostics | undefined;
  await expect.poll(async () => {
    observed = await readRunStartIntro(page); return observed?.visible === true || observed?.status === 'active';
  }).toBe(true);
  const state = observed!;
  expect(state.visible, 'new intro execution cannot silently accept an already-active baseline').toBe(true);
  if (state.commands.some(row => row.command === 'continue')) {
    if (skipDialogue) return activateIntroCommand(page, 'skip-dialogue', input);
    await activateIntroCommand(page, 'continue', input);
  }
  return activateIntroCommand(page, 'start', input);
}
