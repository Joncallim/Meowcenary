import { describe, expect, it } from 'vitest';
import { createFixtureSequence, createMenuSoakHarness, createGameSoakHarness, EPIC19_SOAK_SEEDS } from './helpers/epic19SoakHarness';

describe('Epic 19 Slice 5 gamepad lifecycle soak', () => {
  it('survives 128 menu disconnect/reconnect cycles without phantom navigation, focus loss, or scene transitions', () => {
    const h = createMenuSoakHarness({ fixtureSeed: EPIC19_SOAK_SEEDS.gamepadLifecycle, storageKey: 'e19-menu' });
    const sequence = createFixtureSequence(EPIC19_SOAK_SEEDS.gamepadLifecycle);
    for (let i = 0; i < 128; i += 1) {
      const position = sequence.nextBoolean() ? 13 : 14;
      h.padDown(position); h.poll(); h.padUp(position); h.poll();
      const focus = h.focusIndex(); const commands = h.sceneCommands();
      h.padDown(position); h.input.gamepad!.disconnect(h.pad); h.poll();
      expect(h.input.gamepad!.gamepads[h.pad.index]).toBe(h.pad);
      expect(h.pad.connected).toBe(false);
      h.input.gamepad!.connect(h.pad); for (let j = 0; j < 4; j += 1) h.poll();
      expect(h.focusIndex()).toBe(focus); expect(h.sceneCommands()).toEqual(commands);
      h.padUp(position); h.pad.setLeftStick(0, 0); h.poll();
      h.padDown(position); h.poll(); h.padUp(position); h.poll();
    }
    h.destroy();
  });

  it('survives 128 mid-run disconnect/reconnect cycles with held-state clear, neutral quarantine, and fresh recovery', () => {
    const h = createGameSoakHarness({ fixtureSeed: EPIC19_SOAK_SEEDS.gamepadLifecycle, runSeed: 1905, storageKey: 'e19-run' });
    for (let i = 0; i < 128; i += 1) {
      h.pad.setLeftStick(0.4, 0); h.padDown(0); h.poll();
      h.input.gamepad!.disconnect(h.pad); h.poll();
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      h.input.gamepad!.connect(h.pad); for (let j = 0; j < 4; j += 1) h.poll();
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      h.padUp(0); h.pad.setLeftStick(0, 0); h.poll();
      h.pad.setLeftStick(0.4, 0); h.poll(); expect(h.inputController.getMoveVector().x).toBeGreaterThan(0);
      h.pad.setLeftStick(0, 0); h.poll();
    }
    h.destroy();
  });
});
