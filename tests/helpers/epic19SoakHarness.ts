// Vitest keeps the query-qualified module separate so importing the production
// phase factories does not register the journey test a second time.
import { vi } from 'vitest';
import {
  createMenuPhase,
  createGamePhase,
  focusRingTargets,
  focusedTargetIndex,
  focusedButtonIndex,
  listenerDiagnostics,
  type ListenerDiagnostics,
  type FakeScene,
} from './epic19JourneyComposition';
import type { MockGamepad, MockInputPlugin } from '../__mocks__/phaser';
import type { GameContext } from '../../src/engine/context';
import type { MenuScene } from '../../src/scenes/MenuScene';
import type { GameScene } from '../../src/scenes/GameScene';
import type { RunState } from '../../src/gameplay/runState';
import type { EventBus } from '../../src/engine/eventBus';
import type { InputController } from '../../src/systems/input';
import type { PauseController } from '../../src/ui/pause';
import type { InventoryController } from '../../src/ui/inventory';
import { FocusStroke } from '../../src/ui/theme';
import type { StorageAdapter } from '../../src/systems/save';
import type { MainMenuSnapshot } from '../../src/ui/menus';

export const SOAK_DT_MS = 16;
// SOAK-07: the performance proxy uses a 60-FPS clock (18,000 × 1000/60 =
// 300,000 ms = exactly five minutes), never the 16 ms soak step.
export const PERF_PROXY_DT_MS = 1000 / 60;
export const PERF_PROXY_POLLS = 18_000;
export const PERF_LATE_WINDOW_POLLS = 1_800;
// Re-exported so soaks assert the destroy() baseline contract directly.
export { ZERO_LISTENER_DIAGNOSTICS } from './epic19JourneyComposition';
// The fixture scheduler lives with the phase factories (they construct and
// consume it as a REAL scheduler input, §3.1(2) SOAK-07); re-exported here
// so the shared-harness surface stays exactly the §4.1 contract.
export { createFixtureSequence, type FixtureSequence } from './epic19JourneyComposition';
export const EPIC19_SOAK_SEEDS = Object.freeze({
  gamepadLifecycle: 0x19050001,
  mixedInput: 0x19050002,
  duplicateSuppression: 0x19050003,
  performanceProxy: 0x19050004,
});

export interface SceneCommandCounts { readonly start: number; readonly restart: number; }
export interface Epic19InputDriver {
  readonly input: MockInputPlugin;
  readonly pad: MockGamepad;
  poll(dtMs?: number): void;
  keyDown(key: string): void;
  keyUp(key: string): void;
  padDown(position: number): void;
  padUp(position: number): void;
  simultaneousConfirmDown(): void;
  simultaneousConfirmUp(): void;
  sceneCommands(): SceneCommandCounts;
}

/** Exact FocusStroke/listener/bounds diagnostics shared by both surfaces. */
export interface Epic19FocusSurface {
  /** Live rects carrying the EXACT FocusStroke (width+color+alpha). */
  focusRingCount(): number;
  /** Bounds of the ringed target (logical canvas units), or null. */
  focusRingBounds(): { x: number; y: number; width: number; height: number } | null;
  /** Creation-order index of the ringed rect among live rects. */
  ringedTargetIndex(): number;
}

function driver(phase: {
  scene: FakeScene;
  input: MockInputPlugin;
  pad: MockGamepad;
  update?: (dtMs?: number) => void;
  menuScene?: MenuScene;
}): Epic19InputDriver {
  const input = phase.input;
  const pad = phase.pad;
  const poll = (dtMs = SOAK_DT_MS) => {
    if (phase.update) phase.update(dtMs);
    else phase.menuScene!.update(0, dtMs);
  };
  return {
    input, pad, poll,
    keyDown: (key) => input.keyboard?.holdKey(key),
    keyUp: (key) => input.keyboard?.keyup(key),
    padDown: (position) => pad.setButton(position, true),
    padUp: (position) => pad.setButton(position, false),
    simultaneousConfirmDown: () => { input.keyboard?.holdKey('Enter'); pad.setButton(0, true); },
    simultaneousConfirmUp: () => { input.keyboard?.keyup('Enter'); pad.setButton(0, false); },
    sceneCommands: () => ({
      start: phase.scene.scene.start.mock.calls.length,
      restart: phase.scene.scene.restart.mock.calls.length,
    }),
  };
}

function focusSurface(scene: FakeScene): Epic19FocusSurface {
  const ringed = () => focusRingTargets(scene);
  return {
    focusRingCount: () => ringed().length,
    focusRingBounds: () => {
      const target = ringed()[0];
      if (!target) return null;
      const bounds = target.getBounds();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    },
    ringedTargetIndex: () => scene.objects
      .filter((object) => object.state.kind === 'rect' && !object.state.destroyed)
      .findIndex((object) =>
        object.state.strokeWidth === FocusStroke.width &&
        object.state.strokeColor === FocusStroke.color &&
        object.state.strokeAlpha === FocusStroke.alpha,
      ),
  };
}

export interface Epic19MenuSoakHarness extends Epic19InputDriver, Epic19FocusSurface {
  readonly menuScene: MenuScene;
  readonly context: GameContext;
  readonly inputController: InputController;
  readonly storage: StorageAdapter;
  readonly storageKey: string;
  writeCount(): number;
  menuSnapshot(): MainMenuSnapshot;
  textContents(): readonly string[];
  listeners(): ListenerDiagnostics;
  /** Number of real resize events emitted on the shared scale. */
  resizeEmitCount(): number;
  resizeTo(containerWidth: number, containerHeight: number): void;
  destroy(): void;
}

export function createMenuSoakHarness(options: {
  readonly fixtureSeed: number;
  readonly storageKey: string;
}): Epic19MenuSoakHarness {
  const phase = createMenuPhase({ fixtureSeed: options.fixtureSeed, storageKey: options.storageKey });
  const base = driver({ scene: phase.scene, input: phase.input, pad: phase.pad, menuScene: phase.menuScene });
  const focus = focusSurface(phase.scene);
  const fitScale = (width: number, height: number) => Math.min(width / 390, height / 844);
  return {
    ...base, ...focus,
    menuScene: phase.menuScene,
    context: phase.context,
    inputController: phase.inputController,
    storage: phase.storage,
    storageKey: phase.storageKey,
    writeCount: phase.writeCount,
    menuSnapshot: () => phase.menuController.snapshot(),
    textContents: phase.textContents,
    listeners: () => listenerDiagnostics(phase.scene),
    resizeEmitCount: () => phase.scene.scale.emitCount('resize'),
    resizeTo: (width, height) => {
      const scale = phase.scene.scale;
      const fit = fitScale(width, height);
      scale.displaySize.width = 390 * fit;
      scale.displaySize.height = 844 * fit;
      scale.parentSize.width = width;
      scale.parentSize.height = height;
      // The real Phaser resize event, exactly once per resize.
      scale.emit('resize', scale, { width, height }, { width: 390 * fit, height: 844 * fit }, 1, 390, 844);
    },
    destroy: () => phase.destroy(),
  };
}

export interface Epic19GameSoakHarness extends Epic19InputDriver, Epic19FocusSurface {
  readonly gameScene: GameScene;
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly inputController: InputController;
  readonly pauseController: PauseController;
  readonly inventory: InventoryController;
  readonly context: GameContext;
  readonly storage: StorageAdapter;
  readonly storageKey: string;
  writeCount(): number;
  listeners(): ListenerDiagnostics;
  /** Chooser card focus flags (index of focused card → 1). */
  focusSignature(): readonly number[];
  /** Ringed card index among live chooser cards (rects with pointerover). */
  chooserRingedCardIndex(): number;
  /** Ringed rack target index among rack targets (slots, Merge, Back). */
  focusedRackTargetIndex(): number;
  /** Ringed modal button index among live modal buttons. */
  focusedModalButtonIndex(): number;
  /** Terminal summary surface visibility (Retry/Main Menu). */
  readonly runSummaryView: { visible: boolean };
  /** Live chooser render diagnostics (offerId/rebuildCount/reducedMotion…). */
  chooserDiagnostics(): {
    readonly offerId?: number;
    readonly choiceIds: readonly string[];
    readonly rebuildCount: number;
    readonly reducedMotion: boolean;
    readonly cards: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  };
  /** Number of real resize events emitted on the shared scale. */
  resizeEmitCount(): number;
  /** Number of surface listener invocations for resize events. */
  resizeListenerCalls(): number;
  shakeSpy(): ReturnType<typeof vi.fn>;
  shakeResetSpy(): ReturnType<typeof vi.fn>;
  tweenAdds(): ReadonlyArray<Record<string, unknown>>;
  resizeTo(containerWidth: number, containerHeight: number): void;
  openChooser(): readonly string[];
  openPause(): void;
  openRackWithMergePair(): void;
  /** Selects both rack slots and moves to the Merge action; returns the
   *  focused rack target index (Merge = 6 in the portrait 2-column grid). */
  selectRackPairAndFocusMerge(): number;
  destroy(): void;
}

export function createGameSoakHarness(options: {
  readonly fixtureSeed: number;
  readonly runSeed: number; // fixed harness identity; scheduler never consumes it
  readonly storageKey: string;
}): Epic19GameSoakHarness {
  const phase = createGamePhase({
    fixtureSeed: options.fixtureSeed,
    runSeed: options.runSeed,
    storageKey: options.storageKey,
  });
  const base = driver({ scene: phase.scene, input: phase.input, pad: phase.pad, update: phase.update });
  const focus = focusSurface(phase.scene);
  const fitScale = (width: number, height: number) => Math.min(width / 390, height / 844);
  return {
    ...base, ...focus,
    gameScene: phase.scene as unknown as GameScene,
    runState: phase.runState,
    bus: phase.bus,
    inputController: phase.inputController,
    pauseController: phase.pauseController,
    inventory: phase.inventory,
    context: phase.context,
    storage: phase.storage,
    storageKey: phase.storageKey,
    writeCount: phase.writeCount,
    listeners: () => listenerDiagnostics(phase.scene),
    focusSignature: () => phase.upgradeChooser.diagnostics.cards.map((card: { focused: boolean }) => card.focused ? 1 : 0),
    chooserRingedCardIndex: () => focusedTargetIndex(phase.scene),
    focusedRackTargetIndex: () => focusedTargetIndex(phase.scene),
    focusedModalButtonIndex: () => focusedButtonIndex(phase.scene),
    runSummaryView: phase.runSummaryView,
    chooserDiagnostics: () => phase.upgradeChooser.diagnostics,
    resizeEmitCount: () => phase.scene.scale.emitCount('resize'),
    resizeListenerCalls: () => phase.scene.scale.listenerCallCount('resize'),
    shakeSpy: () => phase.shake,
    shakeResetSpy: () => phase.shakeEffectReset,
    tweenAdds: () => phase.tweenAdds,
    resizeTo: (width, height) => {
      const scale = phase.scene.scale;
      const fit = fitScale(width, height);
      scale.displaySize.width = 390 * fit;
      scale.displaySize.height = 844 * fit;
      scale.parentSize.width = width;
      scale.parentSize.height = height;
      // The real Phaser resize event, exactly once per resize.
      scale.emit('resize', scale, { width, height }, { width: 390 * fit, height: 844 * fit }, 1, 390, 844);
    },
    openChooser: () => { phase.bus.emit('level:up', { level: 2 }); return phase.upgradeChooser.diagnostics.choiceIds; },
    openPause: () => { phase.press(9); },
    openRackWithMergePair: () => { phase.press(9); phase.press(13); phase.press(0); },
    selectRackPairAndFocusMerge: () => {
      phase.press(0); // select slot 0
      phase.press(15); // navRight
      phase.press(0); // select slot 1
      phase.press(13);
      phase.press(13);
      phase.press(13);
      phase.press(14); // portrait grid: [1,3,5,7] then left to Merge (6)
      return focusedTargetIndex(phase.scene);
    },
    destroy: () => phase.destroy(),
  };
}
