import { describe, expect, it } from 'vitest';
import {
  createFixtureSequence,
  createMenuSoakHarness,
  createGameSoakHarness,
  EPIC19_SOAK_SEEDS,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';

describe('Epic 19 Slice 5 gamepad lifecycle soak', () => {
  it('survives 128 menu disconnect/reconnect cycles without phantom navigation, focus loss, or scene transitions', () => {
    const h = createMenuSoakHarness({
      fixtureSeed: EPIC19_SOAK_SEEDS.gamepadLifecycle,
      storageKey: 'e19-menu-lifecycle',
    });
    const sequence = createFixtureSequence(EPIC19_SOAK_SEEDS.gamepadLifecycle);
    let navigations = 0;
    let confirms = 0;
    let backs = 0;
    h.context.bus.on('ui:navigate', () => { navigations += 1; });
    h.context.bus.on('ui:confirm', () => { confirms += 1; });
    h.context.bus.on('ui:back', () => { backs += 1; });
    // Home panel: five buttons (Start, Character, Arena, Progression,
    // Settings); the ringed rect is the background + row index, so the
    // ringed target index is exactly 1 + the navigator row. Switch the
    // presentation to gamepad first (pointer mode shows the ring only on
    // hover), then return to row 0.
    h.padDown(13); h.poll(); h.padUp(13); h.poll();
    h.padDown(12); h.poll(); h.padUp(12); h.poll();
    let menuRow = 0;
    const baseline = h.listeners();
    expect(h.focusRingCount()).toBe(1);
    expect(h.ringedTargetIndex()).toBe(1 + menuRow);

    for (let cycle = 0; cycle < 128; cycle += 1) {
      // navDown (13) and navRight (15) both advance the linear navigator +1.
      const direction = sequence.nextBoolean() ? 13 : 15;
      const navBefore = navigations;
      const commands = h.sceneCommands();

      // 1. Fresh press of the seeded direction from a real focused menu
      //    panel: exactly one accepted nav, focus advances, one ring.
      h.padDown(direction);
      h.poll();
      expect(navigations).toBe(navBefore + 1);
      expect(confirms).toBe(0);
      expect(backs).toBe(0);
      menuRow = (menuRow + 1) % 5;
      expect(h.focusRingCount()).toBe(1);
      expect(h.ringedTargetIndex()).toBe(1 + menuRow);
      const recordedRing = h.ringedTargetIndex();

      // 2. Disconnect while the D-pad remains held: the same wrapper stays in
      //    its slot, connected flips false, stale button state remains, the
      //    next poll emits no action, focus stays exactly the recorded index,
      //    movement is neutral.
      h.input.gamepad!.disconnect(h.pad);
      expect(h.input.gamepad!.gamepads[h.pad.index]).toBe(h.pad);
      expect(h.pad.connected).toBe(false);
      expect(h.pad.isButtonDown(direction)).toBe(true);
      h.poll();
      expect(navigations).toBe(navBefore + 1);
      expect(confirms).toBe(0);
      expect(backs).toBe(0);
      expect(h.ringedTargetIndex()).toBe(recordedRing);
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      expect(h.sceneCommands()).toEqual(commands);

      // 3. Reconnect the same stale wrapper; poll four times: no phantom
      //    nav/confirm, no focus change, no scene.start/restart.
      h.input.gamepad!.connect(h.pad);
      expect(h.pad.connected).toBe(true);
      for (let j = 0; j < 4; j += 1) h.poll();
      expect(navigations).toBe(navBefore + 1);
      expect(confirms).toBe(0);
      expect(backs).toBe(0);
      expect(h.ringedTargetIndex()).toBe(recordedRing);
      expect(h.sceneCommands()).toEqual(commands);

      // 4. Release all mapped controls and center the stick; poll once to
      //    clear the quarantine.
      h.padUp(direction);
      h.pad.setLeftStick(0, 0);
      h.poll();

      // 5. Freshly press/release the selected direction: exactly one accepted
      //    nav, one visible FocusStroke, focus advances according to the real
      //    navigator, and no scene transition.
      const freshNavBefore = navigations;
      h.padDown(direction);
      h.poll();
      h.padUp(direction);
      h.poll();
      expect(navigations).toBe(freshNavBefore + 1);
      expect(confirms).toBe(0);
      expect(backs).toBe(0);
      expect(h.focusRingCount()).toBe(1);
      menuRow = (menuRow + 1) % 5;
      expect(h.ringedTargetIndex()).toBe(1 + menuRow);
      expect(h.sceneCommands()).toEqual(commands);
    }

    // No listener growth across 128 disconnect/reconnect cycles.
    expect(h.listeners()).toEqual(baseline);
    // GAMEPAD-02: destroy restores the connected/disconnected + pointer +
    // action + resize listener baselines exactly.
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });

  it('survives 128 mid-run disconnect/reconnect cycles with held-state clear, neutral quarantine, and fresh recovery', () => {
    const h = createGameSoakHarness({
      fixtureSeed: EPIC19_SOAK_SEEDS.gamepadLifecycle,
      runSeed: 1905,
      storageKey: 'e19-run-lifecycle',
    });
    const sequence = createFixtureSequence(EPIC19_SOAK_SEEDS.gamepadLifecycle);
    let confirmEdges = 0;
    h.inputController.onAction('confirm', () => { confirmEdges += 1; });
    const baseline = h.listeners();

    for (let cycle = 0; cycle < 128; cycle += 1) {
      // Seeded cardinal stick direction, magnitude 0.4: above moveDeadzone
      // (0.25), at/below navThreshold (0.5) — movement without a nav action.
      const axis = sequence.nextInt(4);
      const stick = axis === 0 ? { x: 0.4, y: 0 } : axis === 1 ? { x: -0.4, y: 0 } : axis === 2 ? { x: 0, y: 0.4 } : { x: 0, y: -0.4 };
      const commands = h.sceneCommands();

      // 1. Active run: hold the seeded stick direction and bottom-face
      //    confirm, poll once: exactly one direct confirm edge (discarded as
      //    a command by the active run) and nonzero movement.
      const edgesBefore = confirmEdges;
      h.pad.setLeftStick(stick.x, stick.y);
      h.padDown(0);
      h.poll();
      expect(confirmEdges).toBe(edgesBefore + 1);
      const move = h.inputController.getMoveVector();
      expect(move.x !== 0 || move.y !== 0).toBe(true);

      // 2. Disconnect: movement becomes exactly {0,0} immediately, held
      //    gamepad state clears (no additional confirm edge), no scene
      //    transition.
      h.input.gamepad!.disconnect(h.pad);
      h.poll();
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      expect(confirmEdges).toBe(edgesBefore + 1);
      expect(h.sceneCommands()).toEqual(commands);

      // 3. Reconnect with stale button/stick, poll four times: the quarantine
      //    keeps movement zero and the confirm count unchanged.
      h.input.gamepad!.connect(h.pad);
      for (let j = 0; j < 4; j += 1) h.poll();
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      expect(confirmEdges).toBe(edgesBefore + 1);
      expect(h.sceneCommands()).toEqual(commands);

      // 4. Neutral poll lifts the quarantine; fresh stick crossing and fresh
      //    confirm release/re-press work exactly once (G-15 recovery).
      h.padUp(0);
      h.pad.setLeftStick(0, 0);
      h.poll();
      h.pad.setLeftStick(stick.x, stick.y);
      h.poll();
      expect(h.inputController.getMoveVector()).not.toEqual({ x: 0, y: 0 });
      h.padDown(0);
      h.poll();
      h.padUp(0);
      h.poll();
      expect(confirmEdges).toBe(edgesBefore + 2);
      h.pad.setLeftStick(0, 0);
      h.poll();
      expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
      expect(h.sceneCommands()).toEqual(commands);
    }

    // No listener growth across 128 disconnect/reconnect cycles.
    expect(h.listeners()).toEqual(baseline);
    // GAMEPAD-02: destroy restores the connected/disconnected + pointer +
    // action + resize listener baselines exactly.
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});
