import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { activateIntroCommand, completeRunStartIntro, introCommand, type IntroDiagnostics, type Rect } from './run-start-helpers';
import type { RunStartIntroModel } from '../src/presentation/runStartIntro';
import { writeFile } from 'node:fs/promises';
// @ts-expect-error standalone JavaScript tooling has no declaration file
import { waitForPerformanceRunStart } from '../scripts/performance-run-start.mjs';

type UiState = { phase: 'ready' | 'active' | 'cooling'; activeRemainingMs: number; cooldownRemainingMs: number; readiness: number; activeProgress: number };
type Diagnostics = IntroDiagnostics & {
  visible: boolean; status: string; timeMs: number; characterId: string; enemies: number;
  player: { x: number; y: number; health?: number }; abilityState: UiState; abilityUiState: UiState;
  abilityDefinition: { id: string; effect: { kind: string; radius?: number } };
  model?: RunStartIntroModel;
  controlsHint?: Rect & { text: string; visible: boolean }; body?: Rect; scroll?: { offset: number; max: number }; introText: Array<Rect & { text: string; inScrollBody: boolean }>; abilityButton: Rect; abilityBanner: string;
  abilityFx: { persistent?: { kind: string; radius: number; glyphMask: number }; transient?: { kind: string; radius: number } };
  activationId: number; latestResolution?: { kind: string; applied?: number; collected?: number; affected?: number; modifiers?: Array<{ stat: string; op: string; value: number }> };
  inputMode: string; inputNeutral: boolean; orientationBlocked: boolean;
};
type Seam = {
  isSceneActive(key: string): boolean; waitForMenuPresentation(): Promise<boolean>; waitForPreparedGame(): Promise<boolean>; waitForInputFrame(): Promise<boolean>;
  runStartIntroDiagnostics(): Diagnostics | undefined;
  selectAbilityTestCharacter(id: string): boolean;
  prepareAbilityTestConsequences(levelUp?: boolean, crowded?: boolean): boolean;
};
type Globals = { __MEOWCENARY_VISUAL_TEST__?: Seam; __ABILITY_PAD__?: (button: number, pressed: boolean) => void };
const CATALOG = [
  ['scrap-tabby', 'Scrap Burst', 'Knock back enemies within 90 range.', 'Cooldown 9s.', 'knockback', 'cooling'],
  ['bolt-hound', 'Giga Chomp', 'Restore up to 40 HP.', 'Cooldown 18s.', 'heal', 'cooling'],
  ['volt-lynx', 'Adrenaline', 'Move 40% faster for 2.5s.', 'Cooldown 10s.', 'stat-burst', 'active'],
  ['brass-boar', 'Shield Flicker', 'Become invulnerable for 1.2s.', 'Cooldown 15s.', 'invulnerable', 'active'],
  ['ember-cougar', 'Heat Vent', 'Deal 90 damage to enemies within 110 range.', 'Cooldown 11s.', 'elemental-burst', 'cooling'],
  ['scrap-weasel', 'Scavenge Pulse', 'Collect nearby Scrap and XP within 160 range.', 'Cooldown 8s.', 'loot-pulse', 'cooling'],
  ['rattle-raptor', 'Precision Mark', 'Gain 30% damage and +1 pierce for 4s.', 'Cooldown 14s.', 'stat-burst', 'active'],
  ['piston-ram', 'Overclock', 'Gain 50% fire rate and 25% movement speed for 3.5s.', 'Cooldown 12s.', 'stat-burst', 'active'],
] as const;

async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = { id: 'Ability standard controller', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (globalThis as Globals).__ABILITY_PAD__ = (button, pressed) => {
      pad.buttons[button] = { value: pressed ? 1 : 0, pressed, touched: pressed }; pad.timestamp = performance.now();
    };
  });
}
async function seed(page: Page, reducedMotion = false, clearedStages: string[] = []): Promise<void> {
  await page.addInitScript(({ characterIds, reducedMotion, clearedStages }) => {
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({ version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion },
      progression: { scrap: 0, unlocks: characterIds.map(id => `character:${id}`) }, selectedCharacterId: 'scrap-tabby',
      stages: Object.fromEntries(clearedStages.map(id => [id, { completed: true, bestTimeMs: 60000 }])), achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} }, equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  }, { characterIds: CATALOG.map(row => row[0]), reducedMotion, clearedStages });
}
async function frame(page: Page, count = 1): Promise<void> {
  for (let index = 0; index < count; index++) expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
}
async function read(page: Page): Promise<Diagnostics> {
  const state = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.runStartIntroDiagnostics());
  expect(state).toBeDefined(); return state!;
}
async function openMenu(page: Page): Promise<void> {
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
}
async function launch(page: Page, character = 'scrap-tabby', keepLaunchHeld = false): Promise<Diagnostics> {
  expect(await page.evaluate(id => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.selectAbilityTestCharacter(id), character)).toBe(true);
  await frame(page, 2);
  await page.keyboard.down('Enter');
  try { expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true); }
  finally { if (!keepLaunchHeld) await page.keyboard.up('Enter'); }
  await frame(page, 2);
  const state = await read(page);
  expect(state.visible).toBe(true); expect(state.status).toBe('intro'); expect(state.timeMs).toBe(0);
  expect(state.enemies).toBe(0);
  expect(state.commands.filter(row => row.command === 'return-menu')).toHaveLength(1);
  expect(state.commands.filter(row => row.command === 'start' || row.command === 'continue')).toHaveLength(1);
  expect(state.runStart.count).toBe(0);
  return state;
}
async function pulse(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key); try { await frame(page); } finally { await page.keyboard.up(key); }
  await frame(page);
}
async function start(page: Page): Promise<void> {
  await completeRunStartIntro(page);
  expect((await read(page)).status).toBe('active');
}
async function captureFacts(page: Page, info: TestInfo, name: string): Promise<void> {
  const facts = info.outputPath(`${name}-facts.json`);
  const state = await read(page);
  const pixelRatio = await page.evaluate(() => devicePixelRatio);
  await writeFile(facts, JSON.stringify({ ...state, capture: { project: info.project.name, viewport: page.viewportSize(), devicePixelRatio: pixelRatio } }, null, 2));
  await info.attach(`${name}-facts`, { path: facts, contentType: 'application/json' });
}
async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await captureFacts(page, info, name);
  const image = info.outputPath(`${name}.png`);
  await page.screenshot({ path: image });
  await info.attach(name, { path: image, contentType: 'image/png' });
}
function centre(rect: Rect): { x: number; y: number } { return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; }
function assertBriefFits(state: Diagnostics, viewport: { width: number; height: number }): void {
  expect(state.body).toBeDefined();
  for (const command of state.commands) introCommand(state, command.command, viewport);
  for (const text of state.introText) {
    expect(text.x, text.text).toBeGreaterThanOrEqual(0);
    expect(text.x + text.width, text.text).toBeLessThanOrEqual(viewport.width + 0.01);
    if (text.inScrollBody) {
      expect(text.x, text.text).toBeGreaterThanOrEqual(state.body!.x - .01);
      expect(text.x + text.width, text.text).toBeLessThanOrEqual(state.body!.x + state.body!.width + .01);
      // Vertical overflow belongs to the existing masked, scrollable body.
      expect(text.y + (state.scroll?.offset ?? 0), text.text).toBeGreaterThanOrEqual(state.body!.y - .01);
    } else {
      expect(text.y, text.text).toBeGreaterThanOrEqual(0);
      expect(text.y + text.height, text.text).toBeLessThanOrEqual(viewport.height + .01);
    }
  }
  const regions = [{ name: 'scroll body', bounds: state.body! }, ...state.commands.map(row => ({ name: row.command, bounds: row.bounds }))];
  for (const { name, bounds } of regions) {
    expect(bounds.width, name).toBeGreaterThan(0); expect(bounds.height, name).toBeGreaterThan(0);
    expect(bounds.x, name).toBeGreaterThanOrEqual(0); expect(bounds.y, name).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, name).toBeLessThanOrEqual(viewport.width + .01);
    expect(bounds.y + bounds.height, name).toBeLessThanOrEqual(viewport.height + .01);
  }
  for (const row of state.commands) expect(row.bounds.width, row.command).toBeGreaterThanOrEqual(44);
  // Portrait stacks actions below the body; compact landscape puts them
  // beside it. Either layout must keep the actual regions disjoint.
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i].bounds, b = regions[j].bounds;
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    expect(Math.min(overlapX, overlapY), `${regions[i].name} overlaps ${regions[j].name}`).toBeLessThanOrEqual(.01);
  }
}
function assertHintFits(state: Diagnostics, viewport: { width: number; height: number }): void {
  if (!state.controlsHint?.visible) return;
  const hint = state.controlsHint;
  expect(hint.x).toBeGreaterThanOrEqual(16 - 0.01);
  expect(hint.x + hint.width).toBeLessThanOrEqual(viewport.width - 16 + 0.01);
  expect(hint.y).toBeGreaterThan(180);
  expect(hint.y + hint.height).toBeLessThan(state.abilityButton.y);
}
async function save(page: Page): Promise<string | null> { return page.evaluate(() => localStorage.getItem('meowcenary.save.v2')); }

for (const [character, name, detail, cooldown, kind, phase] of CATALOG) {
  test(`${name}: real briefing, activation receipt and authoritative HUD`, async ({ page }, info) => {
    await seed(page, true); await openMenu(page); const brief = await launch(page, character);
    expect(brief.characterId).toBe(character); assertBriefFits(brief, page.viewportSize()!);
    expect(brief.model!.ability!.effect).toMatchObject({ headline: name, detail, cooldownLabel: cooldown });
    expect(brief.model!.ability!.iconArtId).toMatch(/^ability-icon:/); expect(brief.model!.mercenary.portraitArtId).toBe(`character-portrait:${character}`);
    const beforeSave = await save(page); await frame(page, 4);
    expect((await read(page)).timeMs).toBe(0); expect(await save(page)).toBe(beforeSave);
    await capture(page, info, `${character}-brief`);
    await start(page);
    expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.prepareAbilityTestConsequences())).toBe(true);
    const prepared = await read(page);
    await page.keyboard.down('q');
    try {
      await frame(page);
      const result = await read(page);
      expect(result.activationId).toBe(1); expect(result.latestResolution!.kind).toBe(kind);
      expect(result.abilityUiState.phase).toBe(phase);
      expect(result.abilityBanner).toContain(name);
      assertHintFits(result, page.viewportSize()!);
      if (kind === 'heal') {
        expect(result.latestResolution!.applied).toBe(result.player.health! - prepared.player.health!);
        expect(result.latestResolution!.applied).toBe(13);
        expect(result.abilityBanner).toContain('+13 HP');
      }
      if (kind === 'loot-pulse') { expect(result.latestResolution!.collected).toBeGreaterThanOrEqual(2); expect(result.abilityBanner).toContain(`Collected ${result.latestResolution!.collected}`); }
      if (kind === 'knockback') { expect(result.latestResolution!.affected).toBeGreaterThan(0); expect(result.latestResolution!.affected).toBeLessThanOrEqual(4); expect(result.abilityBanner).toContain(`Knocked back ${result.latestResolution!.affected}`); }
      if (kind === 'elemental-burst') { expect(result.latestResolution!.affected).toBeGreaterThan(0); expect(result.latestResolution!.affected).toBeLessThanOrEqual(4); expect(result.abilityBanner).toContain(`Hit ${result.latestResolution!.affected}`); }
      if (phase === 'active') {
        expect(result.abilityUiState.activeRemainingMs).toBeGreaterThan(0);
        expect(result.abilityFx.persistent!.kind).toBe(kind);
      } else expect(result.abilityUiState.activeRemainingMs).toBe(0);
      if (result.abilityDefinition.effect.radius !== undefined) expect(result.abilityFx.transient!.radius).toBe(result.abilityDefinition.effect.radius);
      await capture(page, info, `${character}-activation`);
    } finally { await page.keyboard.up('q'); }
  });
}

test('held launch Confirm is quarantined; real controller Confirm starts once and neutral re-arms ability', async ({ page }, info) => {
  await installPad(page);
  await seed(page); await openMenu(page); const initial = await launch(page, 'scrap-tabby', true);
  await frame(page, 4); expect((await read(page)).status).toBe('intro');
  await page.keyboard.up('Enter'); await frame(page, 2);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, true)); await frame(page, 3);
  const started = await read(page); expect(started.status).toBe('active'); expect(started.visible).toBe(false);
  expect(started.inputMode).toBe('gamepad'); expect(started.activationId).toBe(0);
  // Both sources remain held until a real neutral poll; an additional action
  // behind this boundary cannot become a gameplay edge.
  await page.keyboard.down('q'); await page.keyboard.down('w'); await frame(page, 3);
  const held = await read(page); expect(held.activationId).toBe(0); expect(held.player).toMatchObject(initial.player);
  await page.keyboard.up('q'); await page.keyboard.up('w');
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, false)); await frame(page, 2);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(2, true)); await frame(page);
  expect((await read(page)).activationId).toBe(1);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(2, false)); await capture(page, info, 'controller-start-and-fresh-ability');
});

test('touch Start consumes held movement/ability and preserves a fresh ability card gesture', async ({ page }, info) => {
  await seed(page); await openMenu(page); const initial = await launch(page);
  await page.keyboard.down('w'); await page.keyboard.down('q'); await frame(page, 2);
  const point = centre(introCommand(initial, 'start', page.viewportSize()!).bounds);
  if (info.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await frame(page, 3);
  const started = await read(page); expect(started.status).toBe('active'); expect(started.activationId).toBe(0);
  expect(started.player).toMatchObject(initial.player);
  await page.keyboard.up('w'); await page.keyboard.up('q'); await frame(page, 2);
  const ability = centre((await read(page)).abilityButton);
  if (info.project.use.hasTouch) await page.touchscreen.tap(ability.x, ability.y);
  else await page.mouse.click(ability.x, ability.y);
  await frame(page);
  expect((await read(page)).activationId).toBe(1); await capture(page, info, 'touch-start-and-ability');
});

test('resize revokes an unfinished Start pointer gesture and Back/relaunch leaves no stale brief', async ({ page }, info) => {
  await seed(page); await openMenu(page); const initial = await launch(page); const beforeSave = await save(page);
  const old = centre(introCommand(initial, 'start', page.viewportSize()!).bounds); await page.mouse.move(old.x, old.y); await page.mouse.down(); await frame(page);
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: viewport.width + 20, height: viewport.height + 20 }); await frame(page, 2);
  await page.mouse.up(); await frame(page, 2); expect((await read(page)).status).toBe('intro');
  expect((await read(page)).timeMs).toBe(0); expect(await save(page)).toBe(beforeSave);
  await capture(page, info, 'resized-frozen-brief');
  await pulse(page, 'Escape');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await save(page)).toBe(beforeSave);
  const next = await launch(page); expect(next.visible).toBe(true); expect(next.timeMs).toBe(0);
  await start(page); expect((await read(page)).activationId).toBe(0);
  // The resized brief is the visual evidence for this journey. Preserve the
  // fresh-run facts without a second full-resolution image of the ordinary HUD.
  await captureFacts(page, info, 'fresh-relaunch');
});

test('DPR3 reduced-motion phone stays frozen through blocked landscape and foreground restoration', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await seed(page, true); await openMenu(page); const initial = await launch(page, 'brass-boar');
    expect(await page.evaluate(() => devicePixelRatio)).toBe(3); await capture(page, info, 'brief-dpr3');
    await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
    await page.keyboard.down('Enter'); await frame(page, 2);
    expect((await read(page)).status).toBe('intro'); expect((await read(page)).timeMs).toBe(0);
    await capture(page, info, 'brief-landscape-blocked');
    const cdp = await context.newCDPSession(page);
    try { await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); }
    finally { await cdp.detach(); }
    await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('#portrait-orientation-guard')).toBeHidden(); await frame(page, 2);
    expect((await read(page)).status).toBe('intro'); expect((await read(page)).player).toEqual(initial.player);
    await page.keyboard.up('Enter'); await frame(page, 2); await start(page);
    await pulse(page, 'q'); const active = await read(page); expect(active.abilityUiState.phase).toBe('active');
    await pulse(page, 'p'); const paused = await read(page); await frame(page, 5);
    expect((await read(page)).abilityState).toEqual(paused.abilityState);
    expect((await read(page)).abilityFx.persistent!.kind).toBe('invulnerable');
    await pulse(page, 'Escape'); await capture(page, info, 'shield-dpr3-restored');
    await expect.poll(async () => (await read(page)).abilityUiState.phase).toBe('cooling');
    expect((await read(page)).abilityFx.persistent).toBeUndefined();
  } finally { await context.close(); }
});

test('fine-pointer compact landscape keeps every intro command visible at readable size', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  try { await seed(page, true); await openMenu(page); const brief = await launch(page, 'piston-ram');
  assertBriefFits(brief, { width: 844, height: 390 });
  for (const { bounds: button } of brief.commands) {
    expect(button.x).toBeGreaterThanOrEqual(0); expect(button.y).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(844); expect(button.y + button.height).toBeLessThanOrEqual(390);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  await capture(page, info, 'compact-landscape-brief'); await start(page); await pulse(page, 'q'); await capture(page, info, 'compact-landscape-overclock');
  } finally { await context.close(); }
});


test('Scavenge reports the admitted collection before the real upgrade pause freezes its HUD', async ({ page }, info) => {
  await seed(page, true); await openMenu(page); await launch(page, 'scrap-weasel'); await start(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.prepareAbilityTestConsequences(true))).toBe(true);
  await pulse(page, 'q'); const paused = await read(page);
  expect(paused.status).toBe('paused'); expect(paused.latestResolution!.kind).toBe('loot-pulse'); expect(paused.latestResolution!.collected).toBeGreaterThanOrEqual(2);
  expect(paused.abilityBanner).toContain(`Collected ${paused.latestResolution!.collected}`); expect(paused.abilityUiState.phase).toBe('cooling');
  expect(paused.abilityFx.transient!.radius).toBe(160);
  await frame(page, 5); expect((await read(page)).abilityState).toEqual(paused.abilityState);
  await capture(page, info, 'scavenge-upgrade-pause-actual-receipt');
});


test('Back controller Confirm stays quarantined across the new Menu input owner', async ({ page }, info) => {
  await installPad(page); await seed(page); await openMenu(page); await launch(page);
  for (let step = 0; (await read(page)).focusedCommand !== 'return-menu' && step < 3; step++) {
    await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(15, true)); await frame(page);
    await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(15, false)); await frame(page, 2);
  }
  expect((await read(page)).focusedCommand).toBe('return-menu');
  const beforeSave = await save(page);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, true)); await frame(page, 8);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('MenuScene'))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.isSceneActive('GameScene'))).toBe(false);
  expect(await save(page)).toBe(beforeSave);
  await page.screenshot({ path: info.outputPath('back-held-controller-menu.png') });
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, false)); await frame(page, 2);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, true));
  try { expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true); }
  finally { await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(0, false)); }
  await frame(page, 2); expect((await read(page)).status).toBe('intro'); await capture(page, info, 'back-neutral-fresh-relaunch');
});

test('normal browser entry exposes no ability diagnostics without explicit visual opt-in', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#game-root canvas')).toBeVisible();
  expect(await page.evaluate(() => ({ visualSeam: '__MEOWCENARY_VISUAL_TEST__' in globalThis, padFixture: '__ABILITY_PAD__' in globalThis }))).toEqual({ visualSeam: false, padFixture: false });
});

test('crowded combat keeps Overclock modifiers readable with one sustained effect slot', async ({ page }, info) => {
  await seed(page, true); await openMenu(page); await launch(page, 'piston-ram'); await start(page);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.prepareAbilityTestConsequences(false, true))).toBe(true);
  await pulse(page, 'q'); const active = await read(page);
  expect(active.enemies).toBeGreaterThanOrEqual(28);
  expect(active.activationId).toBe(1); expect(active.abilityUiState.phase).toBe('active');
  expect(active.latestResolution).toMatchObject({ kind: 'stat-burst', modifiers: [
    { stat: 'attackSpeed', op: 'mult', value: 1.5 }, { stat: 'moveSpeed', op: 'mult', value: 1.25 },
  ] });
  expect(active.abilityFx.persistent).toMatchObject({ kind: 'stat-burst', glyphMask: 3 });
  expect(active.abilityFx.transient).toBeUndefined();
  expect(active.abilityBanner).toBe('Overclock\n+50% fire rate • +25% movement speed 3.5s');
  assertHintFits(active, page.viewportSize()!);
  await capture(page, info, 'crowded-combat-overclock');
  await frame(page, 3);
  expect((await read(page)).abilityFx.persistent).toMatchObject({ kind: 'stat-burst', glyphMask: 3 });
  expect((await read(page)).abilityFx.transient).toBeUndefined();
});


for (const input of ['keyboard', 'mouse', 'touch'] as const) {
  test(`dialogue uses Continue then explicit Start through semantic ${input} targets`, async ({ page }, info) => {
    await seed(page, true, ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04']);
    await openMenu(page); const brief = await launch(page);
    expect(brief.model?.boss?.enemyId).toBe('boss-crusher');
    expect(brief.commands.some(row => row.command === 'start')).toBe(false);
    const beforeSave = await save(page);
    const boss = await activateIntroCommand(page, 'continue', input);
    expect(boss).toMatchObject({ phase: 'boss', revision: 1, status: 'intro', timeMs: 0, runStart: { count: 0 } });
    const dialogue = await read(page); assertBriefFits(dialogue, page.viewportSize()!);
    expect(dialogue.enemies).toBe(0); expect(await save(page)).toBe(beforeSave);
    expect(dialogue.introText.some(row => row.text.includes(brief.model!.boss!.lines[0]))).toBe(true);
    if (dialogue.scroll!.max > 0) {
      const body = centre(dialogue.body!); await page.mouse.move(body.x, body.y); await page.mouse.wheel(0, 10000); await frame(page, 2);
      expect((await read(page)).scroll!.offset).toBe((await read(page)).scroll!.max);
    }
    await capture(page, info, `boss-dialogue-${input}`);
    await activateIntroCommand(page, 'start', input);
    expect((await read(page)).runStart).toMatchObject({ count: 1, timeMs: 0 });
    expect((await read(page)).enemies).toBeGreaterThanOrEqual(1);
  });
}

test('Skip is deliberate and Return abandons a dialogue intro without facts', async ({ page }) => {
  await seed(page, true, ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04']);
  await openMenu(page); await launch(page); const beforeSave = await save(page);
  await activateIntroCommand(page, 'return-menu', 'mouse');
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await save(page)).toBe(beforeSave);
  await launch(page); const started = await completeRunStartIntro(page, 'mouse', true);
  expect(started).toMatchObject({ phase: 'consumed', runStart: { count: 1, timeMs: 0 } });
});

const NO_ACTIVE_CDP_TOUCH = 'cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.';
type ContactEvent = { type: string; atMs: number; contacts: number; trusted: boolean };
type ReleaseObservation = { touchCancelAtMs?: number; touchFrameAtMs?: number; padReleaseAtMs?: number; padFrameAtMs?: number };
type ContactAdmission = { release: ReleaseObservation; dispatches: Array<ReleaseObservation & { key: string; atMs: number; state?: Diagnostics; saved: string | null }> };
type ContactGlobals = Globals & { __TOUCH_REPAIR_EVENTS__?: ContactEvent[]; __TOUCH_REPAIR_ADMISSION__?: ContactAdmission };
type SessionEvent = { session: number; type: string; error?: string };

async function prepareContactProbe(page: Page, dialogue = false): Promise<Diagnostics> {
  await seed(page, true, dialogue ? ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04'] : []);
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  const state = await launch(page); await frame(page);
  await page.evaluate(() => {
    const events: ContactEvent[] = []; (globalThis as ContactGlobals).__TOUCH_REPAIR_EVENTS__ = events;
    for (const type of ['touchstart', 'touchend', 'touchcancel', 'pointercancel', 'click']) {
      document.addEventListener(type, event => {
        events.push({ type, atMs: performance.now(), contacts: 'touches' in event ? (event as TouchEvent).touches.length : 0, trusted: event.isTrusted });
      }, true);
    }
  });
  return state;
}
async function contactEvents(page: Page): Promise<ContactEvent[]> {
  return page.evaluate(() => (globalThis as ContactGlobals).__TOUCH_REPAIR_EVENTS__!);
}
function frozenIntro(state: Diagnostics, initial: Diagnostics): void {
  expect(state).toMatchObject({ visible: true, status: 'intro', phase: initial.phase, revision: initial.revision, timeMs: 0, runStart: { count: 0 }, terminalEvents: 0 });
  expect(state.identity).toEqual(initial.identity); expect(state.objective).toEqual(initial.objective);
}
async function assertPhysicalAdmission(page: Page): Promise<void> {
  expect(await read(page)).toMatchObject({ visible: true, ready: true, inputNeutral: true, inputQuarantined: false });
}

// These wrappers observe real CDP calls. The interruption hook runs only after
// Chromium has accepted touchStart; it never fabricates an input event or
// changes the game's diagnostics. Every helper-created session remains real.
function observedContactPage(page: Page, events: SessionEvent[], afterStart?: () => Promise<void>): Page {
  let nextSession = 0;
  return new Proxy(page, { get(target, key) {
    if (key === 'context') return () => ({ newCDPSession: async () => {
      const session = await page.context().newCDPSession(page), id = nextSession++;
      return new Proxy(session, { get(owner, property) {
        if (property === 'send') return async (method: string, params: { type?: string }) => {
          events.push({ session: id, type: params.type ?? method });
          try {
            const result = await owner.send(method as 'Input.dispatchTouchEvent', params as Parameters<typeof owner.send<'Input.dispatchTouchEvent'>>[1]);
            if (params.type === 'touchStart') await afterStart?.();
            return result;
          } catch (error) {
            events.push({ session: id, type: 'send-error', error: error instanceof Error ? error.message : String(error) }); throw error;
          }
        };
        if (property === 'detach') return async () => { events.push({ session: id, type: 'detach' }); await owner.detach(); };
        const value = Reflect.get(owner, property); return typeof value === 'function' ? value.bind(owner) : value;
      } });
    } });
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
}

for (const helper of ['browser', 'performance'] as const) for (const input of ['keyboard', 'mouse', 'touch'] as const) for (const dialogue of [false, true]) {
  test(`CDP no-contact: ${helper} ${input}, dialogue=${dialogue}, keeps explicit admission`, async ({ page }, info) => {
    await prepareContactProbe(page, dialogue); const sessions: SessionEvent[] = [];
    const observed = observedContactPage(page, sessions);
    if (helper === 'browser') await completeRunStartIntro(observed, input);
    else {
      const timing = await waitForPerformanceRunStart(observed, input);
      expect(timing.compatibility).toBe('explicit-intro'); expect(timing.preparedRun.status).toBe('intro');
      expect(timing.dialogueCommands).toHaveLength(dialogue ? 1 : 0);
      expect(timing.preparedRun.atMs).toBeLessThanOrEqual(timing.startCommandAtMs);
      if (dialogue) expect(timing.dialogueCommands[0].completedAtMs).toBeLessThanOrEqual(timing.startCommandAtMs);
      expect(timing.startCommandAtMs).toBeLessThanOrEqual(timing.startedAtMs);
    }
    const after = await read(page);
    expect(after).toMatchObject({ phase: 'consumed', revision: null, runStart: { count: 1, timeMs: 0 }, terminalEvents: 0 });
    expect(sessions.some(event => event.error === NO_ACTIVE_CDP_TOUCH)).toBe(true);
    const ids = new Set(sessions.map(event => event.session));
    for (const session of ids) expect(sessions.filter(event => event.session === session && event.type === 'detach')).toHaveLength(1);
    await info.attach('cdp-no-contact-sessions', { body: JSON.stringify(sessions), contentType: 'application/json' });
  });
}

for (const helper of ['browser', 'performance'] as const) test(`CDP owned interruption: ${helper} cancels its original session without firing the old target`, async ({ page }, info) => {
  const initial = await prepareContactProbe(page), beforeSave = await save(page), sessions: SessionEvent[] = [];
  const interruption = new Error('intentional interruption after a real admitted touchStart');
  const observed = observedContactPage(page, sessions, async () => {
    await frame(page); frozenIntro(await read(page), initial);
    expect((await read(page)).inputNeutral).toBe(false);
    expect((await contactEvents(page)).some(event => event.type === 'touchstart' && event.contacts === 1 && event.trusted)).toBe(true);
    throw interruption;
  });
  // Browser old target is Return, fresh target is Start. Performance old target
  // is Start, fresh target is Return: an unwanted activation cannot pass either.
  const operation = helper === 'browser' ? activateIntroCommand(observed, 'return-menu', 'touch') : waitForPerformanceRunStart(observed, 'touch');
  await expect(operation).rejects.toBe(interruption);
  const owner = sessions.find(event => event.type === 'touchStart')!.session;
  expect(sessions.filter(event => event.session === owner).map(event => event.type)).toEqual(['touchStart', 'send-error', 'touchCancel', 'detach']);
  const contacts = await contactEvents(page);
  expect(contacts.some(event => event.type === 'touchcancel' && event.trusted && event.contacts === 0)).toBe(true);
  expect(contacts.some(event => event.type === 'pointercancel' && event.trusted)).toBe(true);
  expect(contacts.filter(event => event.type === 'touchend' || event.type === 'click')).toEqual([]);
  frozenIntro(await read(page), initial); expect(await save(page)).toBe(beforeSave);
  await frame(page); await assertPhysicalAdmission(page);
  await activateIntroCommand(page, helper === 'browser' ? 'start' : 'return-menu', 'keyboard');
  expect((await read(page)).runStart.count).toBe(helper === 'browser' ? 1 : 0);
  await info.attach('owned-contact-order', { body: JSON.stringify({ sessions, contacts }), contentType: 'application/json' });
});

for (const holdPad of [false, true]) test(`CDP separate owner remains a physical gate; held pad=${holdPad}`, async ({ page }, info) => {
  await installPad(page); const initial = await prepareContactProbe(page), beforeSave = await save(page);
  const owner = await page.context().newCDPSession(page), sessions: SessionEvent[] = [];
  let settled = false;
  await page.evaluate(() => {
    const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!;
    const evidence: ContactAdmission = { release: {}, dispatches: [] };
    (globalThis as ContactGlobals).__TOUCH_REPAIR_ADMISSION__ = evidence;
    document.addEventListener('touchcancel', () => {
      evidence.release.touchCancelAtMs = performance.now();
      // Observation only: this registers a real completed input frame in the
      // page, independently of the test driver's later promise continuation.
      void seam.waitForInputFrame().then(completed => {
        if (completed) evidence.release.touchFrameAtMs = performance.now();
      });
    }, true);
    document.addEventListener('keydown', event => {
      const state = seam.runStartIntroDiagnostics();
      // Capture precedes Phaser's normal non-capture keyboard processing.
      // Never await, poll, hold or delay the dispatched command to make it pass.
      evidence.dispatches.push({ ...evidence.release, key: event.key, atMs: performance.now(),
        state: state && structuredClone(state), saved: localStorage.getItem('meowcenary.save.v2') });
    }, true);
  });
  const point = centre(introCommand(initial, 'return-menu', page.viewportSize()!).bounds);
  let pending: Promise<IntroDiagnostics> | undefined;
  try {
    await owner.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 7 }] });
    await frame(page); expect((await read(page)).inputNeutral).toBe(false);
    expect((await contactEvents(page)).some(event => event.type === 'touchstart' && event.contacts === 1 && event.trusted)).toBe(true);
    if (holdPad) { await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(2, true)); await frame(page); }
    const observed = observedContactPage(page, sessions);
    pending = activateIntroCommand(observed, 'start', 'keyboard');
    // Attach both outcomes immediately while retaining the original rejection.
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await expect.poll(() => sessions.some(event => event.error === NO_ACTIVE_CDP_TOUCH)).toBe(true);
    await frame(page, 3); expect(settled).toBe(false); frozenIntro(await read(page), initial);
    expect((await read(page)).inputNeutral).toBe(false); expect(await save(page)).toBe(beforeSave);
    expect((await contactEvents(page)).filter(event => event.type === 'touchcancel')).toEqual([]);
    await owner.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect((await contactEvents(page)).some(event => event.type === 'touchcancel' && event.trusted)).toBe(true);
    if (holdPad) {
      // The pad still owns a physical hold here, so these pre-release frozen
      // assertions cannot race with a correctly admitted command.
      await frame(page, 3); expect(settled).toBe(false); frozenIntro(await read(page), initial);
      expect((await read(page)).inputNeutral).toBe(false); expect(await save(page)).toBe(beforeSave);
      await page.evaluate(() => {
        (globalThis as Globals).__ABILITY_PAD__!(2, false);
        const evidence = (globalThis as ContactGlobals).__TOUCH_REPAIR_ADMISSION__!;
        evidence.release.padReleaseAtMs = performance.now();
        void (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame().then(completed => {
          if (completed) evidence.release.padFrameAtMs = performance.now();
        });
      });
    }
    // Once the final owner releases, the helper may finish before this driver
    // resumes. Validate page-side facts captured at actual dispatch, not a late
    // main-thread flag or a separate post-release frozen-state read.
    await pending; expect((await read(page)).runStart).toMatchObject({ count: 1, timeMs: 0 });
    const admission = await page.evaluate(() => (globalThis as ContactGlobals).__TOUCH_REPAIR_ADMISSION__!);
    expect(admission.dispatches.filter(row => row.key === 'Enter')).toHaveLength(1);
    for (const dispatch of admission.dispatches) {
      expect(['ArrowRight', 'Enter']).toContain(dispatch.key);
      expect(dispatch.touchCancelAtMs).toEqual(expect.any(Number)); expect(dispatch.touchFrameAtMs).toEqual(expect.any(Number));
      expect(dispatch.touchCancelAtMs!).toBeLessThanOrEqual(dispatch.touchFrameAtMs!);
      expect(dispatch.touchFrameAtMs!).toBeLessThanOrEqual(dispatch.atMs);
      if (holdPad) {
        expect(dispatch.padReleaseAtMs).toEqual(expect.any(Number)); expect(dispatch.padFrameAtMs).toEqual(expect.any(Number));
        expect(dispatch.padReleaseAtMs!).toBeLessThanOrEqual(dispatch.padFrameAtMs!);
        expect(dispatch.padFrameAtMs!).toBeLessThanOrEqual(dispatch.atMs);
      }
      expect(dispatch.state).toBeDefined(); frozenIntro(dispatch.state!, initial); expect(dispatch.saved).toBe(beforeSave);
      expect(dispatch.state).toMatchObject({ visible: true, ready: true, inputNeutral: true, inputQuarantined: false });
    }
    await info.attach('separate-owner-contact-order', { body: JSON.stringify({ sessions, contacts: await contactEvents(page), admission }), contentType: 'application/json' });
  } finally {
    try {
      try { await owner.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
      catch (error) { if (!(error instanceof Error) || error.message !== NO_ACTIVE_CDP_TOUCH) throw error; }
    } finally {
      await owner.detach(); await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(2, false));
      // Do not strand a rejected helper promise when an earlier assertion fails.
      if (pending) await Promise.allSettled([pending]);
    }
  }
});
