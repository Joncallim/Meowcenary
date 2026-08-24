import { describe, expect, it } from 'vitest';
import {
  createMenuSoakHarness,
  createGameSoakHarness,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';
import { endRun } from '../src/gameplay/runState';

const REFERENCE_VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'landscape container', width: 844, height: 390 },
  { name: 'iPad portrait', width: 1024, height: 1366 },
  { name: 'desktop', width: 1280, height: 720 },
] as const;

interface ScaleLike {
  scale: {
    width: number;
    height: number;
    displaySize: { width: number; height: number };
    parentSize: { width: number; height: number };
  };
}

function assertFitFixtureSetup(surface: ScaleLike, width: number, height: number): number {
  // RESIZE-05: the harness derives the expected FIT scale independently as
  // min(containerWidth/390, containerHeight/844) and validates the fixture
  // setup once — surface regressions never credit themselves with proving
  // Phaser FIT itself.
  const fit = Math.min(width / 390, height / 844);
  expect(surface.scale.width).toBe(390);
  expect(surface.scale.height).toBe(844);
  expect(surface.scale.displaySize.width).toBeCloseTo(390 * fit, 6);
  expect(surface.scale.displaySize.height).toBeCloseTo(844 * fit, 6);
  expect(surface.scale.parentSize.width).toBe(width);
  expect(surface.scale.parentSize.height).toBe(height);
  return fit;
}

interface TargetLike {
  readonly state: {
    readonly kind: string;
    readonly width: number;
    readonly height: number;
    readonly interactive: boolean;
    readonly destroyed: boolean;
    readonly handlers: Record<string, unknown>;
  };
  getBounds(): { readonly width: number; readonly height: number };
}

/** The 44px promise is two-dimensional at both the target and return FIT. */
function assertPhysicalTargets(targets: readonly TargetLike[], fit: number): void {
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    const bounds = target.getBounds();
    expect(bounds.width * fit).toBeGreaterThanOrEqual(44 - 0.01);
    expect(bounds.height * fit).toBeGreaterThanOrEqual(44 - 0.01);
  }
}

describe('Epic 19 Slice 5 resize/FIT regression', () => {
  it.each(REFERENCE_VIEWPORTS)('preserves committed focus and command ownership at $name', ({ width, height }) => {
    // --- Menu surface ----------------------------------------------------
    const menu = createMenuSoakHarness({ fixtureSeed: width, storageKey: `e19-resize-menu-${width}` });
    // Switch presentation to gamepad so the ring is visible (pointer mode
    // shows the ring only on hover). The first action also completes the
    // audio unlock, which removes the scene's once-pointerdown listener —
    // capture the listener baseline after that steady state.
    menu.padDown(13); menu.poll(); menu.padUp(13); menu.poll();
    menu.padDown(12); menu.poll(); menu.padUp(12); menu.poll();
    const menuListeners = menu.listeners();
    expect(menu.focusRingCount()).toBe(1);
    const menuRowRing = menu.ringedTargetIndex();
    const menuRebuilds = (menu.menuScene as unknown as { renderRebuildCount: number }).renderRebuildCount;
    menu.resizeTo(width, height);
    expect(menu.resizeEmitCount()).toBe(1);
    expect((menu.menuScene as unknown as { renderRebuildCount: number }).renderRebuildCount).toBe(menuRebuilds + 1);
    assertFitFixtureSetup(menu.menuScene as unknown as ScaleLike, width, height);
    // The MenuScene listener transactionally rebuilds directly from THIS event
    // (no panel detour), preserving focus and listener cardinality.
    expect(menu.focusRingCount()).toBe(1);
    expect(menu.ringedTargetIndex()).toBe(menuRowRing);
    expect(menu.sceneCommands()).toEqual({ start: 0, restart: 0 });
    expect(menu.listeners()).toEqual(menuListeners);
    const menuTargets = (menu.menuScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'text' && object.state.handlers['pointerup'] && !object.state.destroyed);
    expect(menuTargets).toHaveLength(5);
    assertPhysicalTargets(menuTargets, Math.min(width / 390, height / 844));
    const menuRing = menu.focusRingBounds()!;
    expect(menuRing.height).toBeGreaterThan(0);
    expect(menuRing.width).toBeGreaterThan(0);
    expect(menuRing.x).toBeGreaterThanOrEqual(-1);
    expect(menuRing.x + menuRing.width).toBeLessThanOrEqual(391);
    expect(menuRing.y).toBeGreaterThanOrEqual(-1);
    expect(menuRing.y + menuRing.height).toBeLessThanOrEqual(845);
    // G-15: a valid nav after the direct rebuild works (committed-display true).
    let navs = 0;
    menu.context.bus.on('ui:navigate', () => { navs += 1; });
    menu.padDown(13); menu.poll(); menu.padUp(13); menu.poll();
    expect(navs).toBe(1);
    menu.resizeTo(390, 844);
    expect(menu.resizeEmitCount()).toBe(2);
    expect((menu.menuScene as unknown as { renderRebuildCount: number }).renderRebuildCount).toBe(menuRebuilds + 2);
    const returnedMenuTargets = (menu.menuScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'text' && object.state.handlers['pointerup'] && !object.state.destroyed);
    expect(returnedMenuTargets).toHaveLength(5);
    assertPhysicalTargets(returnedMenuTargets, 1);
    expect(menu.listeners()).toEqual(menuListeners);
    expect(menu.sceneCommands()).toEqual({ start: 0, restart: 0 });
    menu.destroy();
    expect(menu.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);

    // --- Game surfaces ----------------------------------------------------
    const game = createGameSoakHarness({ fixtureSeed: height, runSeed: width, storageKey: `e19-resize-game-${width}` });
    const gameListeners = game.listeners();
    const commands = game.sceneCommands();
    let uiEvents = 0;
    game.bus.on('ui:navigate', () => { uiEvents += 1; });
    game.bus.on('ui:confirm', () => { uiEvents += 1; });
    game.bus.on('ui:back', () => { uiEvents += 1; });

    // 1. Chooser surface: real offer open, focused card 1 under gamepad.
    const offer = game.openChooser();
    expect(offer).toHaveLength(3);
    const offerId = game.chooserDiagnostics().offerId;
    game.padDown(15); game.poll(); game.padUp(15); game.poll();
    expect(game.chooserRingedCardIndex()).toBe(1);
    const rebuilds = game.chooserDiagnostics().rebuildCount;
    const uiBeforeResize = uiEvents;
    const listenerCallsBefore = game.resizeListenerCalls();
    const listenersBefore = game.listeners();

    game.resizeTo(width, height);
    expect(game.resizeEmitCount()).toBe(1);
    assertFitFixtureSetup(game.gameScene as unknown as ScaleLike, width, height);
    // The chooser rebuilds exactly once from the real event, keeps the
    // committed offer and the focused index, and stays within the logical
    // canvas (390×844) — no CENTER_BOTH/browser-offset claims here.
    expect(game.chooserDiagnostics().rebuildCount).toBe(rebuilds + 1);
    expect(game.chooserDiagnostics().offerId).toBe(offerId);
    expect(game.focusSignature()).toEqual([0, 1, 0]);
    for (const card of game.chooserDiagnostics().cards) {
      expect(card.x - card.width / 2).toBeGreaterThanOrEqual(-1);
      expect(card.x + card.width / 2).toBeLessThanOrEqual(391);
      expect(card.y - card.height / 2).toBeGreaterThanOrEqual(-1);
      expect(card.y + card.height / 2).toBeLessThanOrEqual(845);
    }
    // Every surface with a scale listener was invoked exactly once; no
    // duplicate ui:* or hidden command comes from the resize itself.
    expect(game.resizeListenerCalls()).toBe(listenerCallsBefore + gameListeners.scaleResize);
    expect(uiEvents).toBe(uiBeforeResize);
    expect(game.sceneCommands()).toEqual(commands);
    expect(game.listeners()).toEqual(listenersBefore);
    // Controls pause button is a promised 44px target: produced bounds × FIT.
    const pauseButton = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .find((object) => object.state.kind === 'rect' && object.state.handlers['pointerdown'] && !object.state.destroyed);
    expect(pauseButton).toBeDefined();
    assertPhysicalTargets([pauseButton!], Math.min(width / 390, height / 844));

    game.resizeTo(390, 844);
    expect(game.chooserDiagnostics().rebuildCount).toBe(rebuilds + 2);
    const returnedPauseButton = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .find((object) => object.state.kind === 'rect' && object.state.handlers['pointerdown'] && !object.state.destroyed);
    expect(returnedPauseButton).toBeDefined();
    assertPhysicalTargets([returnedPauseButton!], 1);
    expect(game.chooserDiagnostics().offerId).toBe(offerId);
    expect(game.focusSignature()).toEqual([0, 1, 0]);
    expect(uiEvents).toBe(uiBeforeResize);
    expect(game.sceneCommands()).toEqual(commands);

    // G-15: a valid confirm after resizing works on the committed display.
    const chosen: string[] = [];
    game.bus.on('card:chosen', (e: { upgradeId: string }) => chosen.push(e.upgradeId));
    game.padDown(0); game.poll(); game.padUp(0); game.poll();
    expect(chosen).toHaveLength(1);
    expect(game.chooserDiagnostics().choiceIds).toEqual([]);
    expect(game.runState.status).toBe('active');

    // 2. Pause/rack surface: open the rack, select a slot, resize both ways.
    game.openRackWithMergePair();
    expect(game.pauseController.snapshot().panel).toBe('inventory');
    game.padDown(0); game.poll(); game.padUp(0); game.poll(); // select slot 0
    expect(game.focusedRackTargetIndex()).toBe(0);
    const uiBeforeRackResize = uiEvents;
    game.resizeTo(width, height);
    // Every rack interactive target promises a 44px minimum (the rack layout
    // guarantees slot and action sizes at these reference viewports — see
    // weaponRackLayout.test.ts): produced logical bounds × FIT scale ≥ 44.
    const rackTargets = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'rect' && object.state.handlers['pointerover'] && !object.state.destroyed);
    expect(rackTargets.length).toBeGreaterThanOrEqual(8); // 6 slots + Merge + Back
    assertPhysicalTargets(rackTargets, Math.min(width / 390, height / 844));
    expect(game.focusedRackTargetIndex()).toBe(0); // focus preserved
    expect(uiEvents).toBe(uiBeforeRackResize); // no command from resize
    expect(game.sceneCommands()).toEqual(commands);
    game.resizeTo(390, 844);
    const returnedRackTargets = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'rect' && object.state.handlers['pointerover'] && !object.state.destroyed);
    expect(returnedRackTargets.length).toBeGreaterThanOrEqual(8);
    assertPhysicalTargets(returnedRackTargets, 1);
    expect(game.focusedRackTargetIndex()).toBe(0);
    expect(uiEvents).toBe(uiBeforeRackResize);
    // G-15: nav still works in the rack after resizing.
    const rackNavsBefore = uiEvents;
    game.padDown(15); game.poll(); game.padUp(15); game.poll();
    expect(uiEvents).toBe(rackNavsBefore + 1);
    expect(game.focusedRackTargetIndex()).toBe(1);

    // 3. Summary surface: back out, resume, open then resize the LIVE summary.
    game.padDown(1); game.poll(); game.padUp(1); game.poll(); // rack → pause
    game.padDown(0); game.poll(); game.padUp(0); game.poll(); // Resume
    expect(game.runState.status).toBe('active');
    endRun(game.runState, 'won', game.bus);
    expect(game.runSummaryView.visible).toBe(true);
    expect(game.focusedModalButtonIndex()).toBe(0);
    const summaryListeners = game.listeners();
    const summaryRebuilds = (game.runSummaryView as unknown as { renderRebuildCount: number }).renderRebuildCount;
    game.resizeTo(width, height);
    expect((game.runSummaryView as unknown as { renderRebuildCount: number }).renderRebuildCount).toBe(summaryRebuilds + 1);
    expect(game.runSummaryView.visible).toBe(true);
    expect(game.focusedModalButtonIndex()).toBe(0);
    expect(game.listeners()).toEqual(summaryListeners);
    const summaryButtons = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'rect' && object.state.handlers['pointerup'] && !object.state.destroyed);
    expect(summaryButtons.length).toBe(2); // Retry + Main Menu
    assertPhysicalTargets(summaryButtons, Math.min(width / 390, height / 844));
    // G-15: nav remains live after the direct summary rebuild.
    const summaryNavsBefore = uiEvents;
    game.resizeTo(390, 844);
    expect((game.runSummaryView as unknown as { renderRebuildCount: number }).renderRebuildCount).toBe(summaryRebuilds + 2);
    const returnedSummaryButtons = (game.gameScene as unknown as { objects: readonly TargetLike[] }).objects
      .filter((object) => object.state.kind === 'rect' && object.state.handlers['pointerup'] && !object.state.destroyed);
    expect(returnedSummaryButtons).toHaveLength(2);
    assertPhysicalTargets(returnedSummaryButtons, 1);
    expect(game.sceneCommands()).toEqual(commands);
    expect(game.runSummaryView.visible).toBe(true);
    expect(game.focusedModalButtonIndex()).toBe(0);
    game.padDown(13); game.poll(); game.padUp(13); game.poll();
    expect(uiEvents).toBe(summaryNavsBefore + 1);
    expect(game.focusedModalButtonIndex()).toBe(1);

    expect(game.listeners()).toEqual(gameListeners);
    game.destroy();
    expect(game.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});
