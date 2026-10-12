import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import stageCatalog from '../src/data/stages.json' with { type: 'json' };
import type { ComposedRunRequest } from '../src/gameplay/runRequest';
import type { ResolvedArenaLayout } from '../src/gameplay/arenaLayout';
import type { IntroDiagnostics, Rect } from './run-start-helpers';
import { isNoActiveCdpTouchMessage } from './run-start-helpers';

type Input = 'touch' | 'keyboard' | 'controller';
type Scenario = 'normal' | 'required-resource-retry' | 'terminal-neutral-warm-return';
type Intro = IntroDiagnostics & { confirmHeld: boolean; inputMode: string; enemies: number;
  identity: { characterId: string; stageId?: string; arenaId: string; seed: number; contentVersion: string } };
type Action = { label?: string; bounds: Rect; focused: boolean; enabled: boolean };
type Actions = { actions: Action[]; focusedLabel?: string };
type Receipt = { kind: 'focus'; surface: 'menu' | 'intro' | 'summary'; previous?: string }
  | { kind: 'load' } | { kind: 'start' }
  | { kind: 'summary'; label: 'Retry' | 'Main Menu'; previousSeed: number };
type Menu = { panel: string; focusedKey?: string; copy: string[]; buttons: Array<{ key?: string; text: string;
  visible: boolean; interactive: boolean; focused: boolean; bounds: Rect }> };
type Preparation = { active: boolean; state: 'idle' | 'loading' | 'failed'; request?: ComposedRunRequest; layout?: ResolvedArenaLayout };
type Seam = {
  startRecordedRunTest(request: ComposedRunRequest, isTraining?: boolean): Promise<boolean>;
  runPreparationDiagnostics(): Preparation;
  runStartIntroDiagnostics(): Intro | undefined;
  arenaLayoutDiagnostics(): { layout: ResolvedArenaLayout; status: string; timeMs: number } | undefined;
  summaryActionDiagnostics(): { actions: Action[]; focusedLabel?: string } | undefined;
  summaryMenuTarget(): { x: number; y: number } | undefined;
  menuLoadoutDiagnostics(): Menu;
  isMenuInputNeutral(): boolean;
  isSceneActive(key: string): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  waitForPreparedGame(): Promise<boolean>;
  waitForInputFrame(): Promise<boolean>;
  showRunSummary(outcome: 'won' | 'lost'): boolean;
};
type PhysicalEvent = { type: string; trusted?: boolean; key?: string; contacts?: number; button?: number;
  pressed?: boolean; atMs: number; sampledAtMs?: number; inputMode?: string; confirmHeld?: boolean; neutral?: boolean };
type Globals = { __MEOWCENARY_VISUAL_TEST__?: Seam;
  __REHEARSAL_PAD__?: (button: number, pressed: boolean) => void;
  __REHEARSAL_EVENTS__?: PhysicalEvent[] };
const SAVE_KEY = 'meowcenary.save.v2';
const campaignIds = stageCatalog.filter(stage => stage.campaignRole !== 'optional').map(stage => stage.id);
const biomes = [
  { stageId: 'stage:junkyard-01', arenaId: 'junkyard-lot', resource: '/assets/world/junkyard-floor-base/junkyard-floor-base.png' },
  { stageId: 'stage:forge-01', arenaId: 'forge-foundry', resource: '/assets/world/forge/forge-world-atlas.png' },
] as const;
const observedReceipts = new WeakMap<Page, Array<{ owner: string; observedAtMs: number; facts: unknown }>>();
function retainObservation(page: Page, owner: string, facts: unknown): void {
  const samples = observedReceipts.get(page) ?? [];
  samples.push({ owner, observedAtMs: Date.now(), facts });
  if (samples.length > 12) samples.shift();
  observedReceipts.set(page, samples);
}

async function installFixture(page: Page, input: Input): Promise<void> {
  expect(campaignIds).toHaveLength(10);
  await page.addInitScript(({ ids, controller, saveKey }) => {
    // Actual Save V4 envelope and shipped campaign IDs; no schema or ID changes.
    localStorage.setItem(saveKey, JSON.stringify({ version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] }, selectedCharacterId: 'scrap-tabby',
      stages: Object.fromEntries(ids.map(id => [id, { completed: true, bestTimeMs: 60000 }])),
      achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} }, equipment: {}, equipmentLoadout: {},
      items: {}, bosses: {}, compendium: {}, pendingAchievementReports: [],
      appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
    const globals = globalThis as Globals;
    const events: PhysicalEvent[] = globals.__REHEARSAL_EVENTS__ = [];
    const record = (event: PhysicalEvent) => { events.push(event); if (events.length > 128) events.shift(); };
    for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => {
      const key = event as KeyboardEvent;
      record({ type, key: key.key, trusted: key.isTrusted, atMs: performance.now() });
    }, true);
    for (const type of ['touchstart', 'touchend', 'touchcancel']) document.addEventListener(type, event => {
      const touch = event as TouchEvent;
      record({ type, trusted: touch.isTrusted, contacts: touch.touches.length, atMs: performance.now() });
    }, true);
    if (!controller) return;
    // Native browser API fixture is sampled by Phaser's actual GamepadPlugin
    // and production InputController. No logical-action or scene command calls.
    const pad = { id: 'Integration rehearsal standard pad', index: 0, connected: true, mapping: 'standard',
      timestamp: performance.now(), axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    globals.__REHEARSAL_PAD__ = (button, pressed) => {
      pad.buttons[button] = { value: pressed ? 1 : 0, pressed, touched: pressed };
      pad.timestamp = Math.max(performance.now(), pad.timestamp + 0.001);
      record({ type: 'native-pad-fixture', button, pressed, atMs: pad.timestamp });
    };
  }, { ids: campaignIds, controller: input === 'controller', saveKey: SAVE_KEY });
}

async function frame(page: Page): Promise<void> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
}
async function home(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
  await neutral(page);
}
async function neutral(page: Page): Promise<void> {
  // Observe the owning input frame and neutral/quarantine receipt. Registration
  // and scene handoffs can need different frame counts; there is no fixed delay.
  await expect.poll(async () => {
    const sample = await page.evaluate(async () => {
      const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!;
      const completed = await seam.waitForInputFrame();
      if (completed !== true) return { completed, neutral: false };
      if (seam.isSceneActive('MenuScene')) return { completed, neutral: seam.isMenuInputNeutral() };
      const intro = seam.runStartIntroDiagnostics();
      return { completed, neutral: intro?.inputNeutral === true && intro.inputQuarantined === false,
        inputNeutral: intro?.inputNeutral, inputQuarantined: intro?.inputQuarantined, status: intro?.status };
    });
    retainObservation(page, 'neutral', sample);
    expect(sample.completed).toBe(true); return sample.neutral;
  }).toBe(true);
}

// Read only the receipt needed by this physical action, immediately after the
// owning frame. A second renderer round trip must not separate these facts.
async function observeReceipt(page: Page, receipt: Receipt, held?: { key: string; button: number }): Promise<boolean> {
  const sample = await page.evaluate(async ({ receipt, held }) => {
    const globals = globalThis as Globals, seam = globals.__MEOWCENARY_VISUAL_TEST__!;
    const completed = await seam.waitForInputFrame();
    if (completed !== true) return { completed, accepted: false };
    let accepted: boolean, present = true;
    let facts: unknown;
    if (receipt.kind === 'focus') {
      const state = receipt.surface === 'menu' ? seam.menuLoadoutDiagnostics()
        : receipt.surface === 'intro' ? seam.runStartIntroDiagnostics() : seam.summaryActionDiagnostics();
      present = state !== undefined;
      const focused = receipt.surface === 'menu' ? (state as Menu | undefined)?.buttons.find(button => button.focused)?.text
        : receipt.surface === 'intro' ? (state as Intro | undefined)?.focusedCommand : (state as Actions | undefined)?.focusedLabel;
      accepted = present && focused !== receipt.previous;
      facts = { surface: receipt.surface, previous: receipt.previous, focused, present };
    } else if (receipt.kind === 'load') {
      const state = seam.runPreparationDiagnostics().state, gameActive = seam.isSceneActive('GameScene');
      accepted = state === 'loading' || gameActive; facts = { state, gameActive };
    } else if (receipt.kind === 'start') {
      const state = seam.runStartIntroDiagnostics();
      accepted = state?.runStart.count === 1;
      facts = { count: state?.runStart.count, status: state?.status, seed: state?.identity.seed };
    } else if (receipt.label === 'Main Menu') {
      const menuActive = seam.isSceneActive('MenuScene'), gameActive = seam.isSceneActive('GameScene');
      accepted = menuActive && !gameActive; facts = { menuActive, gameActive };
    } else {
      const next = seam.runStartIntroDiagnostics(), menuActive = seam.isSceneActive('MenuScene');
      accepted = menuActive || (next?.visible === true && next.identity.seed !== receipt.previousSeed);
      facts = { menuActive, visible: next?.visible, seed: next?.identity.seed, previousSeed: receipt.previousSeed };
    }
    if (accepted && held) {
      const state = seam.runStartIntroDiagnostics(), atMs = performance.now();
      globals.__REHEARSAL_EVENTS__!.push({ type: 'held-post-step', ...held, atMs, sampledAtMs: atMs,
        inputMode: state?.inputMode, confirmHeld: state?.confirmHeld, neutral: state?.inputNeutral });
    }
    return { completed, accepted, present, facts };
  }, { receipt, held });
  retainObservation(page, receipt.kind, sample);
  expect(sample.completed).toBe(true);
  expect(sample.present ?? true, 'physical action must retain its rendered receipt owner').toBe(true);
  return sample.accepted;
}
async function intro(page: Page): Promise<Intro> {
  const state = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.runStartIntroDiagnostics());
  expect(state).toBeDefined(); return state!;
}
async function preparation(page: Page): Promise<Preparation> {
  return page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.runPreparationDiagnostics());
}
async function saved(page: Page): Promise<string | null> {
  return page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
}
function centre(bounds: Rect) { return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; }
function fits(bounds: Rect, page: Page): void {
  const viewport = page.viewportSize()!;
  expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.x).toBeGreaterThanOrEqual(-0.01); expect(bounds.y).toBeGreaterThanOrEqual(-0.01);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 0.01);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 0.01);
}

async function press(page: Page, input: Exclude<Input, 'touch'>, key: string, button: number,
  receipt: Receipt): Promise<void> {
  if (input === 'keyboard') await page.keyboard.down(key);
  else await page.evaluate(({ button }) => (globalThis as Globals).__REHEARSAL_PAD__!(button, true), { button });
  try {
    // The physical hold survives Phaser POST_STEP, rather than key.press's
    // driver timing or a test-side synthetic logical dispatch.
    await expect.poll(() => observeReceipt(page, receipt, { key, button })).toBe(true);
  } finally {
    if (input === 'keyboard') await page.keyboard.up(key);
    else await page.evaluate(({ button }) => (globalThis as Globals).__REHEARSAL_PAD__!(button, false), { button });
  }
  await neutral(page);
}
async function touch(page: Page, bounds: Rect, receipt: Receipt): Promise<void> {
  fits(bounds, page);
  const session = await page.context().newCDPSession(page);
  const errors: unknown[] = [];
  try {
    // CDP produces real trusted touch events even in desktop projects without
    // a touchscreen fixture. One session owns this contact and its cleanup.
    const firstAtMs = await page.evaluate(() => performance.now());
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...centre(bounds), id: 1 }] });
    await frame(page);
    const contacts = async () => page.evaluate(firstAtMs => (globalThis as Globals).__REHEARSAL_EVENTS__!
      .filter(event => event.atMs >= firstAtMs && event.type.startsWith('touch')), firstAtMs);
    expect(await contacts()).toEqual([expect.objectContaining({ type: 'touchstart', trusted: true, contacts: 1 })]);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => observeReceipt(page, receipt)).toBe(true);
    expect(await contacts()).toEqual([
      expect.objectContaining({ type: 'touchstart', trusted: true, contacts: 1 }),
      expect.objectContaining({ type: 'touchend', trusted: true, contacts: 0 }),
    ]);
    await neutral(page);
  } catch (error) { errors.push(error); }
  finally {
    try { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
    catch (error) { if (!(error instanceof Error) || !isNoActiveCdpTouchMessage(error.message)) errors.push(error); }
    try { await session.detach(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Rehearsal touch operation or contact cleanup failed');
}

async function focusAction(page: Page, input: Exclude<Input, 'touch'>, label: string,
  read: () => Promise<Actions>, surface: 'menu' | 'intro' | 'summary'): Promise<Action> {
  let state = await read();
  for (let step = 0; state.focusedLabel !== label && step < state.actions.length * 3; step++) {
    const target = state.actions.find(action => action.label === label);
    const current = state.actions.find(action => action.focused);
    expect(target, `semantic action ${label}`).toBeDefined(); expect(current, 'actual focus owner').toBeDefined();
    const a = centre(current!.bounds), b = centre(target!.bounds);
    // Follow rendered geometry and inspect real focus after each admitted
    // action. Never assume an action's index or privately set the navigator.
    const direction = Math.abs(b.y - a.y) > 2 ? (b.y > a.y ? 'down' : 'up') : (b.x > a.x ? 'right' : 'left');
    const key = { down: 'ArrowDown', up: 'ArrowUp', right: 'ArrowRight', left: 'ArrowLeft' }[direction];
    const button = { down: 13, up: 12, right: 15, left: 14 }[direction];
    const prior = state.focusedLabel;
    await press(page, input, key, button, { kind: 'focus', surface, previous: prior });
    state = await read(); expect(state.focusedLabel, 'physical navigation receipt').not.toBe(prior);
  }
  expect(state.focusedLabel).toBe(label);
  const target = state.actions.find(action => action.label === label)!;
  expect(target.enabled).toBe(true); fits(target.bounds, page); return target;
}
async function menuAction(page: Page, input: Input, label: string): Promise<void> {
  const read = async () => {
    const state = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics());
    return { focusedLabel: state.buttons.find(button => button.focused)?.text,
      actions: state.buttons.map(button => ({ label: button.text, bounds: button.bounds, focused: button.focused,
        enabled: button.visible && button.interactive })) };
  };
  await neutral(page);
  const target = input === 'touch' ? (await read()).actions.find(action => action.label === label)
    : await focusAction(page, input, label, read, 'menu');
  expect(target).toBeDefined(); expect(target!.enabled).toBe(true);
  const accepted: Receipt = { kind: 'load' };
  if (input === 'touch') await touch(page, target!.bounds, accepted);
  else await press(page, input, 'Enter', 0, accepted);
}
async function start(page: Page, input: Input): Promise<Intro> {
  await neutral(page);
  let state = await intro(page);
  expect(state).toMatchObject({ visible: true, status: 'intro', timeMs: 0, runStart: { count: 0 }, terminalEvents: 0 });
  expect(state.commands.some(command => command.command === 'continue')).toBe(false);
  const read = async () => {
    const current = await intro(page);
    return { focusedLabel: current.focusedCommand,
      actions: current.commands.map(command => ({ label: command.command, bounds: command.bounds,
        focused: command.command === current.focusedCommand, enabled: command.enabled })) };
  };
  const target = input === 'touch' ? (await read()).actions.find(action => action.label === 'start')
    : await focusAction(page, input, 'start', read, 'intro');
  expect(target).toBeDefined(); expect(target!.enabled).toBe(true); fits(target!.bounds, page);
  const accepted: Receipt = { kind: 'start' };
  if (input === 'touch') await touch(page, target!.bounds, accepted);
  else await press(page, input, 'Enter', 0, accepted);
  await expect.poll(async () => { state = await intro(page); return state.runStart.count; }).toBe(1);
  expect(state).toMatchObject({ visible: false, phase: 'consumed', runStart: { count: 1, timeMs: 0 }, terminalEvents: 0 });
  expect(state.status).toBe('active'); expect(state.inputMode).toBe(input === 'controller' ? 'gamepad' : input === 'touch' ? 'pointer' : 'keyboard');
  return state;
}
async function summaryAction(page: Page, input: Input, label: 'Retry' | 'Main Menu'): Promise<void> {
  const read = async () => {
    const state = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.summaryActionDiagnostics());
    expect(state).toBeDefined(); return state!;
  };
  await neutral(page);
  const previousSeed = (await intro(page)).identity.seed;
  const target = input === 'touch' ? (await read()).actions.find(action => action.label === label)
    : await focusAction(page, input, label, read, 'summary');
  expect(target).toBeDefined(); expect(target!.enabled).toBe(true);
  const accepted: Receipt = { kind: 'summary', label, previousSeed };
  if (input === 'touch') {
    if (label === 'Main Menu') {
      const semanticPoint = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.summaryMenuTarget());
      expect(semanticPoint).toBeDefined();
      const point = centre(target!.bounds);
      expect(semanticPoint!.x).toBeCloseTo(point.x, 1); expect(semanticPoint!.y).toBeCloseTo(point.y, 1);
    }
    await touch(page, target!.bounds, accepted);
  } else await press(page, input, 'Enter', 0, accepted);
}
async function prepared(page: Page, request: ComposedRunRequest, arenaId: string, beforeSave: string | null): Promise<ResolvedArenaLayout> {
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  await neutral(page);
  const state = await intro(page);
  expect(state).toMatchObject({ visible: true, phase: 'brief', status: 'intro', timeMs: 0, enemies: 0,
    runStart: { count: 0 }, terminalEvents: 0 });
  expect(state.identity).toMatchObject({ characterId: request.characterId, stageId: request.kind === 'stage' ? request.stageId : undefined,
    arenaId, seed: request.seed });
  const facts = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.arenaLayoutDiagnostics());
  expect(facts).toBeDefined(); expect(facts).toMatchObject({ status: 'intro', timeMs: 0 });
  expect(facts!.layout).toMatchObject({ arenaId, seed: request.seed, contentVersion: state.identity.contentVersion });
  expect(facts!.layout.hash).toMatch(/^[0-9a-f]+$/); expect(facts!.layout.generationVersion).toBeGreaterThan(0);
  await frame(page);
  expect((await intro(page)).timeMs).toBe(0); expect(await saved(page)).toBe(beforeSave);
  return facts!.layout;
}
async function capture(page: Page, info: TestInfo, name: string, facts: Record<string, unknown>): Promise<void> {
  const path = info.outputPath(`${name}.json`);
  const sample = await page.evaluate(() => {
    const globals = globalThis as Globals, seam = globals.__MEOWCENARY_VISUAL_TEST__!;
    return { intro: seam.runStartIntroDiagnostics(), preparation: seam.runPreparationDiagnostics(), physicalEvents: globals.__REHEARSAL_EVENTS__ };
  });
  await writeFile(path, JSON.stringify({ profile: info.project.name, viewport: page.viewportSize(), ...facts,
    ...sample,
  }, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
  const image = info.outputPath(`${name}.png`); await page.screenshot({ path: image });
  await info.attach(`${name}-screenshot`, { path: image, contentType: 'image/png' });
}

for (const biome of biomes) for (const input of ['touch', 'keyboard', 'controller'] as const)
  for (const scenario of ['normal', 'required-resource-retry', 'terminal-neutral-warm-return'] as const satisfies readonly Scenario[]) {
    test(`${biome.stageId} ${input}: ${scenario}`, async ({ page }, info) => {
      const unexpectedErrors: string[] = [], expectedResourceErrors: string[] = [];
      const assets = new Map<string, number>(); let failRequired = false;
      page.on('pageerror', error => unexpectedErrors.push(error.message));
      page.on('requestfailed', request => unexpectedErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/assets/')) assets.set(path, (assets.get(path) ?? 0) + 1);
      });
      page.on('response', response => {
        if (response.status() < 400) return;
        const fact = `${response.status()} ${response.url()}`;
        if (new URL(response.url()).pathname === biome.resource && response.status() === 503) expectedResourceErrors.push(fact);
        else unexpectedErrors.push(fact);
      });
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location().url;
        if (location && new URL(location).pathname === biome.resource && /503/.test(message.text())) expectedResourceErrors.push(message.text());
        else unexpectedErrors.push(message.text());
      });
      await installFixture(page, input);
      let operationError: unknown;
      try {
        await page.goto('/?visual-test=1&perf-test=1'); await home(page);
        const beforeSave = await saved(page);
        expect(beforeSave).not.toBeNull();
        // Freeze an ordinary stage request through real Menu preparation. The
        // seam chooses the tuple; every Start, Retry and return remains physical.
        const request: ComposedRunRequest = { kind: 'stage', characterId: 'scrap-tabby', stageId: biome.stageId, seed: 42 };
        if (scenario === 'required-resource-retry') {
          expect(assets.has(biome.resource), 'mandatory biome resource must still be cold after Home').toBe(false);
          failRequired = true;
          await page.route(`**${biome.resource}`, route => failRequired
            ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Intentional rehearsal required-resource failure' })
            : route.continue());
        }
        const launched = await page.evaluate(request => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.startRecordedRunTest(request), request);
        let failed: Preparation | undefined;
        if (scenario === 'required-resource-retry') {
          expect(launched).toBe(false);
          failed = await preparation(page);
          expect(failed).toMatchObject({ active: true, state: 'failed', request }); expect(failed.layout).toBeDefined();
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
          expect(expectedResourceErrors.length).toBeGreaterThan(0); expect(await saved(page)).toBe(beforeSave);
          const failedCopy = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().copy);
          expect(failedCopy).toContain(stageCatalog.find(stage => stage.id === biome.stageId)!.name);
          await capture(page, info, 'required-resource-failure', { request, beforeSave, failed, expectedResourceErrors });
          // Remove the failure route before real Retry; it must retain the same
          // captured request/layout instead of resolving a new seed.
          failRequired = false; await page.unroute(`**${biome.resource}`);
          await menuAction(page, input, 'Retry Loading Contract');
        } else expect(launched).toBe(true);
        const layout = await prepared(page, request, biome.arenaId, beforeSave);
        if (failed) { expect(layout).toEqual(failed.layout); expect(failed.request).toEqual(request); }
        await capture(page, info, 'prepared', { request, layout, beforeSave, failed, expectedResourceErrors });
        const identity = (await intro(page)).identity;
        const started = await start(page, input); expect(started.identity).toEqual(identity);
        expect((await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.arenaLayoutDiagnostics()))!.layout).toEqual(layout);
        if (scenario === 'terminal-neutral-warm-return') {
          // Presentation fixture only: real terminal settlement/persistence is
          // covered by unit suites, never claimed from this synthetic summary.
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
          await summaryAction(page, input, 'Retry');
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
          await neutral(page);
          const replay = await intro(page);
          expect(replay).toMatchObject({ visible: true, status: 'intro', phase: 'brief', timeMs: 0, runStart: { count: 0 } });
          expect(replay.identity).toMatchObject({ characterId: request.characterId, stageId: biome.stageId, arenaId: biome.arenaId,
            contentVersion: layout.contentVersion });
          expect(replay.identity.seed).not.toBe(request.seed);
          const replayLayout = (await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.arenaLayoutDiagnostics()))!.layout;
          expect(replayLayout.seed).toBe(replay.identity.seed); expect(replayLayout.generationVersion).toBe(layout.generationVersion);
          await start(page, input);
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.showRunSummary('lost'))).toBe(true);
          const beforeReturnAssets = [...assets];
          await summaryAction(page, input, 'Main Menu'); await home(page);
          const returned = await preparation(page);
          expect(returned).toMatchObject({ active: true, state: 'idle' }); expect(returned.request).toBeUndefined(); expect(returned.layout).toBeUndefined();
          expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.menuLoadoutDiagnostics().panel)).toBe('home');
          // A stale Phaser Replay payload would already own loading/prepared
          // Game here. Two separate real observations keep the warm Menu idle.
          for (let observation = 0; observation < 2; observation++) {
            await frame(page); expect(await preparation(page)).toEqual(returned);
            expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
          }
          expect([...assets]).toEqual(beforeReturnAssets);
          await capture(page, info, 'terminal-neutral-warm-return', { request, layout, replayIdentity: replay.identity, replayLayout,
            returned, beforeReturnAssets, afterReturnAssets: [...assets], settlementEvidence: 'presentation fixture only; real settlement covered by unit suites' });
        } else await capture(page, info, 'started', { request, layout, failed, expectedResourceErrors });
        const events = await page.evaluate(() => (globalThis as Globals).__REHEARSAL_EVENTS__!);
        if (input === 'touch') expect(events.some(event => event.type === 'touchstart' && event.trusted && event.contacts === 1)).toBe(true);
        if (input === 'keyboard') expect(events.some(event => event.type === 'keydown' && event.key === 'Enter' && event.trusted)).toBe(true);
        if (input === 'controller') expect(events.some(event => event.type === 'held-post-step' && event.inputMode === 'gamepad')).toBe(true);
        expect(unexpectedErrors).toEqual([]);
      } catch (error) {
        operationError = error;
        // Retain completed owner receipts even when the test deadline already
        // closed the page. This attachment issues no late browser command.
        await info.attach('last-owned-receipts', { body: JSON.stringify(observedReceipts.get(page) ?? [], null, 2), contentType: 'application/json' });
        throw error;
      }
      finally {
        // Release physical owners even when an assertion interrupts a row.
        const cleanup = await Promise.allSettled([
          page.keyboard.up('Enter'), page.keyboard.up('ArrowUp'), page.keyboard.up('ArrowDown'),
          page.keyboard.up('ArrowLeft'), page.keyboard.up('ArrowRight'),
          page.evaluate(() => { for (const button of [0, 12, 13, 14, 15]) (globalThis as Globals).__REHEARSAL_PAD__?.(button, false); }),
        ]);
        const rejected = cleanup.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (rejected.length) throw new AggregateError([
          ...(operationError === undefined ? [] : [operationError]), ...rejected.map(result => result.reason),
        ], 'Rehearsal operation or physical-input cleanup failed');
      }
    });
  }
