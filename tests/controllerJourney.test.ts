import { describe, expect, it, vi } from 'vitest';
import { MockGamepad, MockInputPlugin } from './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { InputController, type GameAction } from '../src/systems/input';
import { createRunState, endRun } from '../src/gameplay/runState';
import { createEventBus } from '../src/engine/eventBus';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { InventoryController } from '../src/ui/inventory';
import { PauseController } from '../src/ui/pause';

type JourneySeams = {
  runState: ReturnType<typeof createRunState>;
  inputController: InputController;
  pauseController: PauseController;
  pauseView: {
    moveFocus: (direction: string) => boolean;
    confirmFocused: () => boolean;
    render: () => void;
  };
  runSummaryView: {
    moveFocus: (direction: string) => boolean;
    confirmFocused: () => boolean;
  };
  routeAction: (action: GameAction) => void;
};

function createJourney() {
  const bus = createEventBus();
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const context = createGameContext({
    bus,
    menuRng: createRng(1),
    data,
    metaUpgrades,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'controller-journey', metaUpgrades.maxLevels()),
  });
  const input = new MockInputPlugin({ gamepad: true });
  const gamepad = new MockGamepad();
  input.gamepad!.connect(gamepad);
  const scene = new GameScene();
  const sceneStart = vi.fn();
  Object.assign(scene, {
    input,
    registry: { get: (key: string) => key === GAME_CONTEXT_REGISTRY_KEY ? context : undefined },
    scene: { start: sceneStart, restart: vi.fn() },
  });

  const runState = createRunState({ seed: 7, characterId: 'starter', arenaId: 'arena' });
  runState.status = 'active';
  const inventory = new InventoryController({
    runState,
    bus,
    weaponRegistry: new DataWeaponRegistry(data),
  });
  const pauseController = new PauseController({ runState, bus, inventory });
  const pauseFocus = { index: 0 };
  const summaryFocus = { index: 0 };
  const pauseView = {
    moveFocus: vi.fn((direction: string) => {
      pauseFocus.index = direction === 'down' || direction === 'right' ? 1 : 0;
      return true;
    }),
    confirmFocused: vi.fn(() => {
      if (pauseFocus.index === 0) return pauseController.resume();
      return pauseController.openInventory();
    }),
    render: vi.fn(),
  };
  const runSummaryView = {
    moveFocus: vi.fn((direction: string) => {
      summaryFocus.index = direction === 'down' || direction === 'right' ? 1 : 0;
      return true;
    }),
    confirmFocused: vi.fn(() => true),
  };
  const inputController = new InputController(scene as never);
  const seams = scene as unknown as JourneySeams;
  Object.assign(seams, { runState, inputController, pauseController, pauseView, runSummaryView });
  return { seams, input, gamepad, inputController, bus, sceneStart, pointerCalls: {
    down: vi.spyOn(input, 'pointerDown'),
    move: vi.spyOn(input, 'pointerMove'),
    up: vi.spyOn(input, 'pointerUp'),
  } };
}

function press(gamepad: MockGamepad, input: InputController, position: number): void {
  gamepad.setButton(position, true);
  input.update(16);
  gamepad.setButton(position, false);
  input.update(16);
}

describe('headless production controller journey', () => {
  it('walks active run → pause → rack → active without pointer input', () => {
    const { seams, gamepad, inputController, pointerCalls } = createJourney();
    const actions: string[] = [];
    seams.inputController.onAction('pause', () => { actions.push('pause'); seams.routeAction('pause'); });
    seams.inputController.onAction('navDown', () => { actions.push('navDown'); seams.routeAction('navDown'); });
    seams.inputController.onAction('confirm', () => { actions.push('confirm'); seams.routeAction('confirm'); });
    seams.inputController.onAction('back', () => { actions.push('back'); seams.routeAction('back'); });

    press(gamepad, inputController, 9);
    expect(seams.runState.status).toBe('paused');
    expect(seams.pauseController.snapshot().panel).toBe('pause');
    press(gamepad, inputController, 13);
    press(gamepad, inputController, 0);
    expect(seams.pauseController.snapshot().panel).toBe('inventory');
    press(gamepad, inputController, 1);
    expect(seams.pauseController.snapshot().panel).toBe('pause');
    press(gamepad, inputController, 1);
    expect(seams.runState.status).toBe('active');
    expect(actions).toEqual(['pause', 'navDown', 'confirm', 'back', 'back']);
    expect(pointerCalls.down).not.toHaveBeenCalled();
    expect(pointerCalls.move).not.toHaveBeenCalled();
    expect(pointerCalls.up).not.toHaveBeenCalled();
  });

  it('keeps terminal summary precedence and supports the alternate Main Menu focus', () => {
    const { seams, gamepad, inputController, pointerCalls } = createJourney();
    endRun(seams.runState, 'won', createEventBus());
    seams.runSummaryView.moveFocus = vi.fn((direction: string) => direction === 'down');
    seams.runSummaryView.confirmFocused = vi.fn(() => true);
    seams.inputController.onAction('back', () => seams.routeAction('back'));
    seams.inputController.onAction('pause', () => seams.routeAction('pause'));
    seams.inputController.onAction('inventory', () => seams.routeAction('inventory'));
    seams.inputController.onAction('navDown', () => seams.routeAction('navDown'));
    seams.inputController.onAction('confirm', () => seams.routeAction('confirm'));

    press(gamepad, inputController, 1);
    press(gamepad, inputController, 9);
    press(gamepad, inputController, 3);
    expect(seams.runSummaryView.moveFocus).not.toHaveBeenCalled();
    press(gamepad, inputController, 13);
    press(gamepad, inputController, 0);
    expect(seams.runSummaryView.moveFocus).toHaveBeenCalledWith('down');
    expect(seams.runSummaryView.confirmFocused).toHaveBeenCalledTimes(1);
    expect(pointerCalls.down).not.toHaveBeenCalled();
    expect(pointerCalls.move).not.toHaveBeenCalled();
    expect(pointerCalls.up).not.toHaveBeenCalled();
  });
});
