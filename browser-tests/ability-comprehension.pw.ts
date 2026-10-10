import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type Rect = { x: number; y: number; width: number; height: number };
type UiState = { phase: 'ready' | 'active' | 'cooling'; activeRemainingMs: number; cooldownRemainingMs: number; readiness: number; activeProgress: number };
type Diagnostics = {
  visible: boolean; status: string; timeMs: number; characterId: string; enemies: number;
  player: { x: number; y: number; health?: number }; abilityState: UiState; abilityUiState: UiState;
  abilityDefinition: { id: string; effect: { kind: string; radius?: number } };
  model?: { mercenaryName: string; ability: { headline: string; detail: string; cooldownLabel: string }; icon: { id: string }; portrait: { id: string } };
  controlsHint?: Rect & { text: string; visible: boolean }; buttons: Rect[]; briefText: Array<Rect & { text: string }>; abilityButton: Rect; abilityBanner: string;
  abilityFx: { persistent?: { kind: string; radius: number; glyphMask: number }; transient?: { kind: string; radius: number } };
  activationId: number; latestResolution?: { kind: string; applied?: number; collected?: number; affected?: number; modifiers?: Array<{ stat: string; op: string; value: number }> };
  inputMode: string; inputNeutral: boolean; orientationBlocked: boolean;
};
type Seam = {
  isSceneActive(key: string): boolean; waitForMenuPresentation(): Promise<boolean>; waitForPreparedGame(): Promise<boolean>; waitForInputFrame(): Promise<boolean>;
  runStartBriefDiagnostics(): Diagnostics | undefined;
  selectAbilityTestCharacter(id: string): boolean;
  prepareAbilityTestConsequences(levelUp?: boolean, crowded?: boolean): boolean;
};
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam; __ABILITY_PAD__?: (button: number, pressed: boolean) => void };
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
async function seed(page: Page, reducedMotion = false): Promise<void> {
  await page.addInitScript(({ characterIds, reducedMotion }) => {
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({ version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion },
      progression: { scrap: 0, unlocks: characterIds.map(id => `character:${id}`) }, selectedCharacterId: 'scrap-tabby',
      stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} }, equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  }, { characterIds: CATALOG.map(row => row[0]), reducedMotion });
}
async function frame(page: Page, count = 1): Promise<void> {
  for (let index = 0; index < count; index++) expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForInputFrame())).toBe(true);
}
async function read(page: Page): Promise<Diagnostics> {
  const state = await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.runStartBriefDiagnostics());
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
  expect(state.enemies).toBe(0); expect(state.buttons).toHaveLength(2);
  return state;
}
async function pulse(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key); try { await frame(page); } finally { await page.keyboard.up(key); }
  await frame(page);
}
async function start(page: Page): Promise<void> {
  await pulse(page, 'Enter');
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
  for (const text of state.briefText) {
    expect(text.x, text.text).toBeGreaterThanOrEqual(0); expect(text.y, text.text).toBeGreaterThanOrEqual(0);
    expect(text.x + text.width, text.text).toBeLessThanOrEqual(viewport.width + 0.01);
    expect(text.y + text.height, text.text).toBeLessThanOrEqual(viewport.height + 0.01);
    if (text.text !== 'Start' && text.text !== 'Back to Menu') expect(text.y + text.height, text.text).toBeLessThanOrEqual(state.buttons[0].y);
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
    expect(brief.model!.ability).toMatchObject({ headline: name, detail, cooldownLabel: cooldown });
    expect(brief.model!.icon.id).toMatch(/^ability-icon:/); expect(brief.model!.portrait.id).toBe(`character-portrait:${character}`);
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
  const point = centre(initial.buttons[0]);
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
  const old = centre(initial.buttons[0]); await page.mouse.move(old.x, old.y); await page.mouse.down(); await frame(page);
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

test('fine-pointer compact landscape keeps both brief actions visible at readable size', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  try { await seed(page, true); await openMenu(page); const brief = await launch(page, 'piston-ram');
  assertBriefFits(brief, { width: 844, height: 390 });
  for (const button of brief.buttons) {
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
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(13, true)); await frame(page);
  await page.evaluate(() => (globalThis as Globals).__ABILITY_PAD__!(13, false)); await frame(page, 2);
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
