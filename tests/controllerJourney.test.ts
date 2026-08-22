import { describe, expect, it } from 'vitest';
import {
  createMenuPhase,
  createGamePhase,
  focusRingTargets,
  sceneCommands,
  expectSceneDeltas,
  focusedTargetIndex,
  focusedButtonIndex,
  type ScriptedOperation,
} from './helpers/epic19JourneyComposition';
import { createFixtureSequence } from './helpers/epic19SoakHarness';
import { endRun } from '../src/gameplay/runState';
import { SceneKey } from '../src/engine/sceneKeys';
import { FocusStroke } from '../src/ui/theme';

// The shared Epic 19 soak harness imports this test module with a Vitest query
// that exposes the real composition factories without registering the journey
// test a second time in every ordinary soak file. The composition factories
// themselves live in tests/helpers/epic19JourneyComposition.ts — this file is
// the UNCHANGED journey (same describe/test names and assertions; only the
// factory code moved out).
if (!import.meta.url.includes('?as-harness')) {
  describe('headless production controller journey', () => {
    it('walks menu → run → level-up → pause → rack merge → summary across real owners with zero pointer input', () => {
    // ------------------------------------------------------------------
    // Phase A: Menu (brief steps 1-5) through the real MenuScene.
    // ------------------------------------------------------------------
    const menu = createMenuPhase();
    const menuSnapshot = () =>
      (menu.menuScene as unknown as {
        controller: { snapshot: () => import('../src/ui/menus').MainMenuSnapshot };
      }).controller.snapshot();

    // 1. Menu home: navDown, confirm → Character.
    let sceneBefore = sceneCommands(menu.scene);
    menu.press(13);
    expect(menu.events).toEqual(['ui:navigate']);
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    menu.press(0);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm']);
    expect(menu.textContents()).toContain('Choose Character');
    expect(menuSnapshot().panel).toBe('character');
    sceneBefore = expectSceneDeltas(sceneBefore, menu.scene, 'menu step 1');
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 1');

    // 2. Character: confirm the visible default (already-selected is a
    //    successful no-op), then back → Home.
    menu.press(0);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm', 'ui:confirm']);
    expect(menu.textContents()).toContain('Choose Character');
    expect(menuSnapshot().panel).toBe('character');
    menu.press(1);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back']);
    expect(menu.textContents()).toContain('Start');
    expect(menuSnapshot().panel).toBe('home');
    sceneBefore = expectSceneDeltas(sceneBefore, menu.scene, 'menu step 2');
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 2');

    // 3. Home (panel reset): navDown, navDown, confirm → Arena.
    menu.press(13);
    menu.press(13);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate',
    ]);
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm',
    ]);
    expect(menu.textContents()).toContain('Choose Arena');
    expect(menuSnapshot().panel).toBe('arena');
    sceneBefore = expectSceneDeltas(sceneBefore, menu.scene, 'menu step 3');
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 3');

    // 4. Arena: confirm the visible default, then back → Home.
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm',
    ]);
    expect(menu.textContents()).toContain('Choose Arena');
    expect(menuSnapshot().panel).toBe('arena');
    menu.press(1);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back',
    ]);
    expect(menu.textContents()).toContain('Start');
    expect(menuSnapshot().panel).toBe('home');
    sceneBefore = expectSceneDeltas(sceneBefore, menu.scene, 'menu step 4');
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 4');

    // 5. Home (panel reset): confirm → exactly one Game scene start and no
    //    restart (F3).
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:confirm',
    ]);
    sceneBefore = expectSceneDeltas(sceneBefore, menu.scene, 'menu step 5', { start: 1 });
    expect(menu.sceneStart).toHaveBeenCalledWith(SceneKey.Game);
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 5');

    // ------------------------------------------------------------------
    // Phase B: Game (brief steps 6-13) through real owners and the real
    // GameScene.routeAction.
    // ------------------------------------------------------------------
    const game = createGamePhase();
    sceneBefore = sceneCommands(game.scene);

    // 6. A real level:up through UpgradeSystem/UpgradeChooser. The level-up
    //    chooser row is inside the pointer-free journey.
    game.bus.emit('level:up', { level: 2 });
    expect(game.runState.status).toBe('paused');
    expect(game.runState.pauseReason).toBe('levelUp');
    expect(game.events).toEqual([]);
    const focusedCards = () =>
      game.upgradeChooser.diagnostics.cards.map((card) => card.focused);
    expect(focusedCards()).toEqual([true, false, false]);
    const offeredIds = game.upgradeChooser.diagnostics.choiceIds;
    expect(offeredIds).toHaveLength(3);
    // Pointer presentation initially: no card carries the actual ring.
    const chooserCards = () =>
      game.scene.objects.filter(
        (object) =>
          object.state.kind === 'rect' &&
          object.state.handlers['pointerover'] &&
          !object.state.destroyed,
      );
    const ringedCardIndex = () =>
      chooserCards().findIndex(
        (card) =>
          card.state.strokeWidth === FocusStroke.width &&
          card.state.strokeColor === FocusStroke.color &&
          card.state.strokeAlpha === FocusStroke.alpha,
      );
    expect(ringedCardIndex()).toBe(-1);

    // navRight focuses the second card (exactly one ui:navigate): the ring is
    // the ACTUAL rendered FocusStroke on the second card, not just logical
    // diagnostics, and the exact run snapshot is unchanged.
    game.press(15);
    expect(game.events).toEqual(['ui:navigate']);
    expect(focusedCards()).toEqual([false, true, false]);
    expect(ringedCardIndex()).toBe(1);
    expect(chooserCards()[1]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(chooserCards()[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(chooserCards()[1]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(chooserCards()[0]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(sceneBefore.start).toBe(0);
    expect(sceneBefore.restart).toBe(0);

    // confirm chooses exactly the focused offer token and returns to active
    // play; the authoritative run snapshot reflects the accepted choice. The
    // accepted choice audio is card:chosen — no ui:confirm is emitted.
    game.press(0);
    expect(game.events).toEqual(['ui:navigate']);
    expect(game.runState.status).toBe('active');
    expect(game.runState.upgradeStacks[offeredIds[1]!]).toBe(1);
    expect(game.upgradeChooser.diagnostics.choiceIds).toEqual([]);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'chooser step 6');
    assertZeroPointerCalls(game.pointerCalls, 'chooser step 6');

    // 7. Pause (position 9) → manual pause panel with Resume focused.
    game.press(9);
    expect(game.events).toEqual(['ui:navigate', 'ui:confirm']);
    expect(game.runState.status).toBe('paused');
    expect(game.runState.pauseReason).toBe('manual');
    expect(game.pauseController.snapshot().panel).toBe('pause');
    expect(focusedButtonIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'pause entry step 7');
    assertZeroPointerCalls(game.pointerCalls, 'pause entry step 7');

    // 8. navDown, confirm → Weapon Rack (one ui:navigate, one ui:confirm).
    const beforeRack = game.events.length;
    game.press(13);
    game.press(0);
    expect(game.pauseController.snapshot().panel).toBe('inventory');
    expect(game.events.slice(beforeRack)).toEqual(['ui:navigate', 'ui:confirm']);
    // Genuine rack entry resets to the first occupied slot.
    expect(focusedTargetIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'rack entry step 8');
    assertZeroPointerCalls(game.pointerCalls, 'rack entry step 8');

    // 9. Rack: confirm slot 0; navRight, confirm slot 1. The preview exists
    //    and focus remains slot 1 after both same-inventory rerenders.
    const beforeSlot0 = game.events.length;
    game.press(0);
    expect(game.events.slice(beforeSlot0)).toEqual(['ui:navigate']);
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual(['a']);
    expect(focusedTargetIndex(game.scene)).toBe(0);
    const beforeSlot1 = game.events.length;
    game.press(15);
    game.press(0);
    expect(game.events.slice(beforeSlot1)).toEqual(['ui:navigate', 'ui:navigate']);
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual(['a', 'b']);
    expect(game.inventory.snapshot().preview?.result.definitionId).toBe('scrap-pistol-t2');
    expect(focusedTargetIndex(game.scene)).toBe(1);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'rack selection step 9');
    assertZeroPointerCalls(game.pointerCalls, 'rack selection step 9');

    // 10. Portrait grid (count=8, C=2): from i=1 the path is exactly
    //     [1, 3, 5, 7, 6] — Down, Down, Down (last-row clamp to Back), Left.
    const path: number[] = [];
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(14);
    path.push(focusedTargetIndex(game.scene));
    expect([1, ...path]).toEqual([1, 3, 5, 7, 6]);
    expect(game.events.slice(beforeSlot1)).toEqual([
      'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate',
    ]);

    // Confirm on Merge: exactly one weapon:merged, one ui:confirm, one T2
    // weapon, and focus stays Merge i=6 (preservation, not a count clamp).
    const mergesBefore = game.merged;
    const eventsBeforeMerge = game.events.length;
    game.press(0);
    expect(game.merged).toBe(mergesBefore + 1);
    expect(game.events.slice(eventsBeforeMerge)).toEqual(['ui:confirm']);
    expect(game.runState.equipped).toHaveLength(1);
    expect(game.runState.equipped[0]?.tier).toBe(2);
    expect(focusedTargetIndex(game.scene)).toBe(6);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'rack merge step 10');
    assertZeroPointerCalls(game.pointerCalls, 'rack merge step 10');

    // 11. back → Pause (selection cleared / panel walk preserved), back →
    //     active run.
    game.press(1);
    expect(game.pauseController.snapshot().panel).toBe('pause');
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual([]);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    game.press(1);
    expect(game.pauseController.snapshot().panel).toBe('closed');
    expect(game.runState.status).toBe('active');
    expect(game.events.slice(eventsBeforeMerge)).toEqual(['ui:confirm', 'ui:back', 'ui:back']);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'back walk step 11');
    assertZeroPointerCalls(game.pointerCalls, 'back walk step 11');

    // 12. End the run: the terminal listener renders the summary with Retry
    //     focused. Back, Pause, and Inventory each leave it unchanged.
    endRun(game.runState, 'won', game.bus);
    expect(game.runState.status).toBe('won');
    expect(game.runSummaryView.visible).toBe(true);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    const eventsBeforeTerminal = game.events.length;
    game.press(1); // back — the deliberate terminal no-op
    game.press(9); // pause — discarded
    game.press(3); // inventory — discarded
    expect(game.events.length).toBe(eventsBeforeTerminal);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'terminal discarded edges step 12');
    assertZeroPointerCalls(game.pointerCalls, 'terminal discarded edges step 12');

    // 13. Retry branch: confirm → exactly one scene restart (F3).
    const eventsBeforeRetry = game.events.length;
    game.press(0);
    expect(game.events.slice(eventsBeforeRetry)).toEqual(['ui:confirm']);
    sceneBefore = expectSceneDeltas(sceneBefore, game.scene, 'retry branch step 13', { restart: 1 });
    assertZeroPointerCalls(game.pointerCalls, 'retry branch step 13');

    // ------------------------------------------------------------------
    // Phase C: fresh terminal fixture for the alternate branch (step 14).
    // ------------------------------------------------------------------
    const fresh = createGamePhase(11);
    endRun(fresh.runState, 'lost', fresh.bus);
    expect(fresh.runSummaryView.visible).toBe(true);
    // Flip the presentation mode with a deliberate terminal no-op (Back is
    // discarded in the terminal row) — the Retry ring then appears.
    fresh.press(1);
    expect(focusedButtonIndex(fresh.scene)).toBe(0);
    expect(focusRingTargets(fresh.scene)).toHaveLength(1);

    // navDown → Main Menu, confirm → exactly one Menu scene start and no
    // restart (F3).
    const beforeMenu = fresh.events.length;
    const sceneBefore14 = sceneCommands(fresh.scene);
    fresh.press(13);
    expect(fresh.events.slice(beforeMenu)).toEqual(['ui:navigate']);
    expect(focusedButtonIndex(fresh.scene)).toBe(1);
    fresh.press(0);
    expect(fresh.events.slice(beforeMenu)).toEqual(['ui:navigate', 'ui:confirm']);
    expectSceneDeltas(sceneBefore14, fresh.scene, 'main menu branch step 14', { start: 1 });
    expect(fresh.scene.scene.start).toHaveBeenCalledWith(SceneKey.Menu);
    assertZeroPointerCalls(fresh.pointerCalls, 'main menu branch step 14');
  });

    // §4.1 / §3.1(2) (SOAK-07): the fixture scheduler selects operations ONLY.
    // The scheduled harness runs the SAME scripted domain commands as the
    // control, but every press operation's input delivery (pad / keyboard /
    // simultaneous source, 0-2 held polls) is drawn LIVE from its fixture
    // sequence — thousands of real fixture draws interleaved with production
    // upgrade-RNG draws. The control executes the identical script with fixed
    // gamepad delivery and zero fixture draws. Identical production-RNG
    // posture (offer history + draw counts) and identical domain effects then
    // DEMONSTRATE that the fixture scheduler never consumes, reseeds, or
    // replaces production RNG. The schedulerDraws()/delivery assertions also
    // fail if the scheduler input is ignored (the old vacuous shape), because
    // an ignored sequence draws nothing and never drives keyboard/both
    // deliveries.
    it('proves the fixture scheduler never consumes or reseeds production RNG (scheduled-vs-control draw posture)', () => {
      // --- Menu surface: same script, fixture-driven delivery vs fixed control.
      const menuScheduled = createMenuPhase({
        storageKey: 'e19-posture-menu-scheduled',
        scheduler: createFixtureSequence(0x19050042),
      });
      const menuControl = createMenuPhase({ storageKey: 'e19-posture-menu-control' });
      const menuScript = buildMenuPostureScript();
      menuScheduled.runScripted(menuScript);
      menuControl.runScripted(menuScript);
      // The fixture sequence genuinely drove the scheduled harness: every
      // press drew its delivery (pad / keyboard / simultaneous all appear),
      // while the control consumed zero fixture draws.
      const menuLog = menuScheduled.scriptedLog();
      expect(menuLog).toHaveLength(menuScript.length);
      expect(menuScheduled.schedulerDraws()).toBe(2 * pressOpCount(menuScript));
      expect(menuControl.schedulerDraws()).toBe(0);
      expect(menuLog.some((entry) => entry.includes('@pad:'))).toBe(true);
      expect(menuLog.some((entry) => entry.includes('@keyboard:'))).toBe(true);
      expect(menuLog.some((entry) => entry.includes('@both:'))).toBe(true);
      // Same domain commands → same domain effects on the menu surface.
      expect(menuScheduled.events).toEqual(menuControl.events);
      expect(menuScheduled.events.length).toBeGreaterThan(400);
      expect(focusRingTargets(menuScheduled.scene)).toHaveLength(1);
      expect(focusRingTargets(menuControl.scene)).toHaveLength(1);
      menuScheduled.destroy();
      menuControl.destroy();

      // --- Game surface: production-RNG posture after thousands of draws.
      const scheduled = createGamePhase({
        runSeed: 4242,
        storageKey: 'e19-posture-scheduled',
        fixtureSeed: 0x19050042,
      });
      const control = createGamePhase({ runSeed: 4242, storageKey: 'e19-posture-control' });
      const script = buildGamePostureScript();

      // Capture every production offer at generation time. The UpgradeSystem
      // level:up listener was registered during phase construction, so by the
      // time these listeners run the fresh 3-card offer is materialized.
      const scheduledOffers: string[][] = [];
      const controlOffers: string[][] = [];
      scheduled.bus.on('level:up', () => {
        const ids = scheduled.upgradeChooser.diagnostics.choiceIds;
        if (ids.length > 0) scheduledOffers.push([...ids]);
      });
      control.bus.on('level:up', () => {
        const ids = control.upgradeChooser.diagnostics.choiceIds;
        if (ids.length > 0) controlOffers.push([...ids]);
      });

      scheduled.runScripted(script);
      control.runScripted(script);

      // Thousands of fixture draws were genuinely consumed by the scheduled
      // harness (all three delivery sources appear) and none by the control.
      const scheduledLog = scheduled.scriptedLog();
      expect(scheduledLog).toHaveLength(script.length);
      expect(scheduled.schedulerDraws()).toBe(2 * pressOpCount(script));
      expect(scheduled.schedulerDraws()).toBeGreaterThanOrEqual(2000);
      expect(control.schedulerDraws()).toBe(0);
      expect(scheduledLog.some((entry) => entry.includes('@pad:'))).toBe(true);
      expect(scheduledLog.some((entry) => entry.includes('@keyboard:'))).toBe(true);
      expect(scheduledLog.some((entry) => entry.includes('@both:'))).toBe(true);

      // Production-RNG posture: every offer the run produced is byte-identical
      // between the harnesses (tens of offers, three cards each) and the
      // production draw counts match exactly. If the fixture scheduler ever
      // consumed, reseeded, or replaced the production RNG, the scheduled
      // offers would diverge at the first affected draw and this comparison
      // fails.
      expect(scheduledOffers.length).toBeGreaterThanOrEqual(30);
      expect(controlOffers.length).toBeGreaterThanOrEqual(30);
      expect(scheduledOffers).toEqual(controlOffers);
      expect(scheduled.productionRngDraws()).toBeGreaterThan(0);
      expect(scheduled.productionRngDraws()).toBe(control.productionRngDraws());

      // Identical domain effects from the identical command script.
      expect(scheduled.events).toEqual(control.events);
      expect(scheduled.runState.upgradeStacks).toEqual(control.runState.upgradeStacks);

      // The final offer (chooser open after the last level-up) is directly
      // comparable, and choosing it in both harnesses yields the same stack
      // increment and the same resume.
      const scheduledChoices = scheduled.upgradeChooser.diagnostics.choiceIds;
      const controlChoices = control.upgradeChooser.diagnostics.choiceIds;
      expect(scheduledChoices).toHaveLength(3);
      expect(controlChoices).toHaveLength(3);
      expect(scheduledChoices).toEqual(controlChoices);
      const target = controlChoices[0]!;
      const scheduledBefore = scheduled.runState.upgradeStacks[target] ?? 0;
      const controlBefore = control.runState.upgradeStacks[target] ?? 0;
      scheduled.press(0);
      control.press(0);
      expect(scheduled.runState.upgradeStacks[target]).toBe(scheduledBefore + 1);
      expect(control.runState.upgradeStacks[target]).toBe(controlBefore + 1);
      expect(scheduled.runState.upgradeStacks).toEqual(control.runState.upgradeStacks);
      expect(scheduled.upgradeChooser.diagnostics.choiceIds).toEqual([]);
      expect(control.upgradeChooser.diagnostics.choiceIds).toEqual([]);
      expect(scheduled.runState.status).toBe('active');
      expect(control.runState.status).toBe('active');
      scheduled.destroy();
      control.destroy();
    });
  });
}

// Fixed domain-command scripts for the draw-posture proof. The SAME script
// runs in the scheduled and control harnesses: the scheduled side selects
// each press operation's input delivery from its fixture sequence, the
// control uses fixed gamepad delivery with zero fixture draws.
function pressOpCount(script: readonly ScriptedOperation[]): number {
  return script.reduce((count, op) => ('press' in op ? count + 1 : count), 0);
}

function buildMenuPostureScript(): ScriptedOperation[] {
  const script: ScriptedOperation[] = [];
  // 480 nav presses — 13 (navDown) and 15 (navRight) both advance the linear
  // 5-row menu navigator +1 and wrap.
  for (let i = 0; i < 480; i += 1) {
    script.push({ press: i % 2 === 0 ? 13 : 15 });
    if (i % 16 === 15) script.push({ idlePolls: 2 });
  }
  return script;
}

function buildGamePostureScript(): ScriptedOperation[] {
  const script: ScriptedOperation[] = [];
  const directions = [15, 13, 14, 12];
  // 32 full rounds + a final level-up = 33 offers, well below the ~44-round
  // point where the eligible upgrade pool exhausts (finite maxStacks) and
  // offer generation legitimately returns zero cards.
  for (let round = 0; round < 32; round += 1) {
    // Level-up: the production upgrade RNG draws a fresh 3-card offer.
    script.push({ levelUp: 2 });
    // Chooser-open navigation moves focus (one ui:navigate per press).
    for (let i = 0; i < 10; i += 1) script.push({ press: directions[i % directions.length] });
    // Confirm chooses exactly the focused card and resumes the run.
    script.push({ press: 0 });
    // Active-run navigation is discarded by routeAction — no events — but
    // every press still draws its delivery from the fixture sequence,
    // keeping the fixture draw count in the thousands.
    for (let i = 0; i < 30; i += 1) script.push({ press: directions[(i + 1) % directions.length] });
    script.push({ idlePolls: 2 });
  }
  // One final level-up leaves a fresh chooser open (focus on card 0) so the
  // last three production offers are directly comparable and choosing card 0
  // in both harnesses yields the same stack increment.
  script.push({ levelUp: 2 });
  return script;
}

function assertZeroPointerCalls(
  pointerCalls: { down: { mock: { calls: unknown[] } }; move: { mock: { calls: unknown[] } }; up: { mock: { calls: unknown[] } } },
  phase: string,
) {
  expect(pointerCalls.down.mock.calls, `${phase}: pointerDown must stay at zero`).toHaveLength(0);
  expect(pointerCalls.move.mock.calls, `${phase}: pointerMove must stay at zero`).toHaveLength(0);
  expect(pointerCalls.up.mock.calls, `${phase}: pointerUp must stay at zero`).toHaveLength(0);
}
