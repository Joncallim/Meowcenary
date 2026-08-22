// Vitest keeps the query-qualified module separate so importing the production
// phase factories does not register the journey test a second time.
import { createMenuPhase, createGamePhase } from './epic19JourneyComposition';
import type { MockGamepad, MockInputPlugin } from '../__mocks__/phaser';
import type { GameContext } from '../../src/engine/context';
import type { MenuScene } from '../../src/scenes/MenuScene';
import type { GameScene } from '../../src/scenes/GameScene';
import type { RunState } from '../../src/gameplay/runState';
import type { EventBus } from '../../src/engine/eventBus';
import type { InputController } from '../../src/systems/input';

export const SOAK_DT_MS = 16;
export const PERF_PROXY_DT_MS = 1000 / 60;
export const PERF_PROXY_POLLS = 18_000;
export const PERF_LATE_WINDOW_POLLS = 1_800;
export const EPIC19_SOAK_SEEDS = Object.freeze({
  gamepadLifecycle: 0x19050001,
  mixedInput: 0x19050002,
  duplicateSuppression: 0x19050003,
  performanceProxy: 0x19050004,
});

export interface FixtureSequence {
  nextInt(exclusiveMax: number): number;
  nextBoolean(): boolean;
}

export function createFixtureSequence(seed: number): FixtureSequence {
  let state = seed >>> 0;
  return {
    nextInt(exclusiveMax) {
      if (!Number.isSafeInteger(exclusiveMax) || exclusiveMax <= 0) throw new Error('exclusiveMax must be positive');
      state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) >>> 0;
      state = Math.imul(state ^ (state >>> 13), 0x45d9f3b) >>> 0;
      state = (state ^ (state >>> 16)) >>> 0;
      return state % exclusiveMax;
    },
    nextBoolean() { return this.nextInt(2) === 1; },
  };
}

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

function driver(phase: ReturnType<typeof createMenuPhase> | ReturnType<typeof createGamePhase>): Epic19InputDriver {
  const input = phase.input;
  const pad = phase.pad;
  const poll = (dtMs = SOAK_DT_MS) => {
    if ('update' in phase) phase.update(dtMs);
    else phase.menuScene.update(0, dtMs);
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

export interface Epic19MenuSoakHarness extends Epic19InputDriver {
  readonly menuScene: MenuScene; readonly context: GameContext;
  focusIndex(): number; focusRingCount(): number; textContents(): readonly string[];
  resizeTo(containerWidth: number, containerHeight: number): void; destroy(): void;
}

export function createMenuSoakHarness(options: { readonly fixtureSeed: number; readonly storageKey: string }): Epic19MenuSoakHarness {
  void options;
  const phase = createMenuPhase();
  const base = driver(phase);
  const focus = () => phase.scene.objects.filter((o: any) => o.state.kind === 'rect' && o.state.handlers.pointerover && !o.state.destroyed);
  return {
    ...base, menuScene: phase.menuScene, context: phase.context,
    focusIndex: () => focus().findIndex((o: any) => o.state.strokeWidth === 2 && o.state.strokeAlpha === 1),
    focusRingCount: () => focus().filter((o: any) => o.state.strokeWidth === 2 && o.state.strokeAlpha === 1).length,
    textContents: phase.textContents,
    resizeTo: (width, height) => {
      const scale = (phase.scene as any).scale;
      scale.displaySize.width = 390 * Math.min(width / 390, height / 844);
      scale.displaySize.height = 844 * Math.min(width / 390, height / 844);
      scale.parentSize.width = width; scale.parentSize.height = height;
      (phase.menuScene as any).scale.width = 390; (phase.menuScene as any).scale.height = 844;
      (phase.scene as any).emitResize?.();
    },
    destroy: () => phase.menuScene.events.emit('shutdown'),
  };
}

export interface Epic19GameSoakHarness extends Epic19InputDriver {
  readonly gameScene: GameScene; readonly runState: RunState; readonly bus: EventBus; readonly inputController: InputController; readonly context: GameContext;
  focusSignature(): readonly number[]; resizeTo(containerWidth: number, containerHeight: number): void;
  openChooser(): readonly string[]; openRackWithMergePair(): void; destroy(): void;
}

export function createGameSoakHarness(options: { readonly fixtureSeed: number; readonly runSeed: number; readonly storageKey: string }): Epic19GameSoakHarness {
  void options.fixtureSeed; void options.storageKey;
  const phase = createGamePhase(options.runSeed);
  const base = driver(phase);
  return {
    ...base, gameScene: phase.scene as unknown as GameScene, runState: phase.runState, bus: phase.bus, context: phase.context,
    inputController: phase.seams.inputController,
    focusSignature: () => phase.upgradeChooser.diagnostics.cards.map((card: { focused: boolean }) => card.focused ? 1 : 0),
    resizeTo: () => { /* phase views are resized by their production scale listener in the journey fixture */ },
    openChooser: () => { phase.bus.emit('level:up', { level: 2 }); return phase.upgradeChooser.diagnostics.choiceIds; },
    openRackWithMergePair: () => { phase.press(9); phase.press(13); phase.press(0); },
    destroy: () => { phase.upgradeChooser.destroy(); phase.pauseView.destroy(); phase.runSummaryView.destroy(); phase.seams.inputController.destroy(); },
  };
}
