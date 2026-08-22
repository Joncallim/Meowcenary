import { describe, expect, it } from 'vitest';
import {
  createFixtureSequence,
  createGameSoakHarness,
  EPIC19_SOAK_SEEDS,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';

type Source = 'keyboard' | 'pointer' | 'gamepad';

const SOURCE_ORDER: readonly Source[] = ['keyboard', 'pointer', 'gamepad'];
const POINTER_RADIUS = 64;
const GAMEPAD_DEADZONE = 0.25;

/**
 * Independent scalar oracle encoding the frozen same-poll ordering
 * (Amendment INPUT-06): keyboard and gamepad pressing the same action
 * coalesce to ONE keyboard-sourced edge (source order keyboard → pointer →
 * gamepad); simultaneous movement starts use adapter poll order (keyboard →
 * pointer → gamepad, last crossing wins BOTH the D4 owner and the D7
 * presentation start); a retained movement owner is not itself a new
 * presentation signal; a later action edge supersedes an earlier pending
 * pointerdown. Mirrors the production adapters + LogicalInputCore +
 * InputController D7 logic with plain scalars — never the production code.
 */
class MixedInputOracle {
  private readonly held = new Map<Source, Set<string>>();
  private readonly prevActive = new Map<Source, boolean>();
  private readonly activationSeq = new Map<Source, number>();
  private readonly prevEffective = new Map<string, boolean>();
  private keyboardMove = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private pointer: { startX: number; startY: number; curX: number; curY: number } | null = null;
  private owner: Source | null = null;
  private epoch = 0;
  private lastStart: Source | null = null;
  private pointerDownPending = false;
  private pointerDownMovementSource: Source | null = null;
  mode: Source = 'pointer';
  move = { x: 0, y: 0 };
  readonly edges = { confirm: 0, navRight: 0 };

  constructor() {
    for (const source of SOURCE_ORDER) {
      this.held.set(source, new Set());
      this.prevActive.set(source, false);
      this.activationSeq.set(source, 0);
    }
    for (const action of ['confirm', 'navRight']) {
      this.prevEffective.set(action, false);
    }
  }

  hold(source: Source, action: string, held: boolean): void {
    const set = this.held.get(source)!;
    if (held) set.add(action);
    else set.delete(action);
  }

  holdsKeyboard(action: string): boolean {
    return this.held.get('keyboard')!.has(action);
  }

  get pointerPinned(): boolean {
    return this.pointer !== null;
  }

  pressMoveKey(key: 'd' | 'a'): void {
    this.keys.add(key);
    this.recomputeKeyboardMove();
    this.hold('keyboard', 'movement', true);
  }

  releaseMoveKey(key: 'd' | 'a'): void {
    this.keys.delete(key);
    this.recomputeKeyboardMove();
    this.hold('keyboard', 'movement', this.keys.size > 0);
  }

  private readonly keys = new Set<string>();

  private recomputeKeyboardMove(): void {
    this.keyboardMove = {
      x: (this.keys.has('d') ? 1 : 0) + (this.keys.has('a') ? -1 : 0),
      y: 0,
    };
  }

  setKeyboardMove(x: number, y: number): void {
    this.keyboardMove = { x, y };
  }

  setStick(x: number, y: number): void {
    this.stick = { x, y };
  }

  pointerDown(x: number, y: number): void {
    const wasPinned = this.pointer !== null;
    // A pointerdown between polls is the newest event: it presents pointer
    // mode immediately and stays pending until a later signal acts. An
    // already-pinned pointer only re-asserts mode (production keeps the pin).
    this.mode = 'pointer';
    this.pointerDownPending = true;
    this.pointerDownMovementSource = this.owner;
    if (!wasPinned) {
      this.pointer = { startX: x, startY: y, curX: x, curY: y };
    }
  }

  pointerMove(x: number, y: number): void {
    if (this.pointer) {
      this.pointer.curX = x;
      this.pointer.curY = y;
    }
  }

  pointerUp(): void {
    this.pointer = null;
  }

  poll(): void {
    // Per-source movement samples with the production deadzone rules.
    const keyboardMag = Math.hypot(this.keyboardMove.x, this.keyboardMove.y);
    const keyboardActive = keyboardMag > 0;
    let pointerSample = { x: 0, y: 0 };
    let pointerActive = false;
    if (this.pointer) {
      let dx = this.pointer.curX - this.pointer.startX;
      let dy = this.pointer.curY - this.pointer.startY;
      const mag = Math.hypot(dx, dy);
      if (mag > POINTER_RADIUS) {
        const scale = POINTER_RADIUS / mag;
        dx *= scale;
        dy *= scale;
      }
      pointerSample = { x: dx / POINTER_RADIUS, y: dy / POINTER_RADIUS };
      pointerActive = Math.hypot(pointerSample.x, pointerSample.y) > 0;
    }
    const stickMag = Math.hypot(this.stick.x, this.stick.y);
    const scaledMag = stickMag > GAMEPAD_DEADZONE
      ? (stickMag - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE)
      : 0;
    const gamepadActive = scaledMag > 0;
    const gamepadScale = stickMag > 0 ? scaledMag / stickMag : 0;
    const gamepadSample = { x: this.stick.x * gamepadScale, y: this.stick.y * gamepadScale };

    // Crossings in adapter poll order: the last crossing in this poll wins
    // the D7 start source (and the D4 owner via activationSeq).
    const samples: Record<Source, { x: number; y: number; active: boolean }> = {
      keyboard: { x: this.keyboardMove.x, y: this.keyboardMove.y, active: keyboardActive },
      pointer: { x: pointerSample.x, y: pointerSample.y, active: pointerActive },
      gamepad: { x: gamepadSample.x, y: gamepadSample.y, active: gamepadActive },
    };
    let crossed = false;
    for (const source of SOURCE_ORDER) {
      const active = samples[source].active;
      if (active && !this.prevActive.get(source)) {
        this.epoch += 1;
        this.activationSeq.set(source, this.epoch);
        this.lastStart = source;
        crossed = true;
      }
      this.prevActive.set(source, active);
    }

    // D4 owner: retained while active; otherwise the most recent crossing.
    if (this.owner !== null && !samples[this.owner].active) {
      this.owner = null;
    }
    if (this.owner === null) {
      let best: Source | null = null;
      let bestSeq = 0;
      for (const source of SOURCE_ORDER) {
        if (samples[source].active && this.activationSeq.get(source)! > bestSeq) {
          bestSeq = this.activationSeq.get(source)!;
          best = source;
        }
      }
      this.owner = best;
    }
    this.move = this.owner === null
      ? { x: 0, y: 0 }
      : { x: samples[this.owner].x, y: samples[this.owner].y };

    // D7 presentation: a movement START supersedes a pending pointerdown;
    // a stopped movement clears the pending flag; a retained owner does not
    // re-assert anything. Then each action edge (ALL_ACTIONS order) updates
    // the mode and supersedes the pointerdown.
    if (crossed) {
      this.mode = this.lastStart!;
      this.pointerDownPending = false;
    } else if (this.owner === null) {
      this.pointerDownPending = false;
    } else if (this.pointerDownPending && this.owner === this.pointerDownMovementSource) {
      // The pointerdown is still newer than the same held movement source.
    }

    for (const action of ['confirm', 'navRight']) {
      const effective = this.held.get('keyboard')!.has(action)
        || this.held.get('gamepad')!.has(action);
      if (effective && !this.prevEffective.get(action)) {
        this.edges[action as 'confirm' | 'navRight'] += 1;
        // Frozen same-poll ordering: keyboard → pointer → gamepad.
        const source: Source = this.held.get('keyboard')!.has(action) ? 'keyboard' : 'gamepad';
        this.mode = source;
        this.pointerDownPending = false;
      }
      this.prevEffective.set(action, effective);
    }
  }
}

function expectVectorClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-9);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-9);
}

describe('Epic 19 Slice 5 mixed-input soak', () => {
  it('processes 1024 seeded rapid keyboard/gamepad/pointer alternation frames without sticky ownership or stale hints', () => {
    const h = createGameSoakHarness({
      fixtureSeed: EPIC19_SOAK_SEEDS.mixedInput,
      runSeed: 1906,
      storageKey: 'e19-mixed-oracle',
    });
    const s = createFixtureSequence(EPIC19_SOAK_SEEDS.mixedInput);
    const oracle = new MixedInputOracle();
    const confirmEdges: Array<{ action: string; source: string }> = [];
    h.inputController.onAction('confirm', (edge) => confirmEdges.push(edge));
    let navigations = 0;
    h.bus.on('ui:navigate', () => { navigations += 1; });
    const commands = h.sceneCommands();
    const listenerBaseline = h.listeners();
    const chosen: string[] = [];
    h.bus.on('card:chosen', (e: { upgradeId: string }) => chosen.push(e.upgradeId));
    // Every poll is asserted against the oracle: movement owner-exact (never
    // summed), presentation mode (never a retained owner), command deltas
    // exactly 0/1 as predicted, and no scene transition.
    const pollOnce = () => {
      const before = {
        confirmSpy: confirmEdges.length,
        nav: navigations,
        confirmOracle: oracle.edges.confirm,
        navOracle: oracle.edges.navRight,
      };
      h.poll();
      oracle.poll();
      const move = h.inputController.getMoveVector();
      expectVectorClose(move, oracle.move);
      expect(h.inputController.getInputMode()).toBe(oracle.mode);
      expect(confirmEdges.length - before.confirmSpy).toBe(oracle.edges.confirm - before.confirmOracle);
      expect(navigations - before.nav).toBe(oracle.edges.navRight - before.navOracle);
      expect(h.sceneCommands()).toEqual(commands);
    };
    // Sessions open a real chooser to prove focus visibility under
    // keyboard/gamepad and validity after pointer switching.
    const sessions = new Set([300, 600, 900]);
    let sessionStep = -1; // -1 outside a session

    for (let frame = 0; frame < 1024; frame += 1) {
      if (sessions.has(frame)) {
        sessionStep = 0;
        // Deterministic session preamble: release every held input so the
        // fixed session script's presses always produce fresh edges.
        h.keyUp('Enter');
        oracle.hold('keyboard', 'confirm', false);
        h.padUp(0);
        oracle.hold('gamepad', 'confirm', false);
        h.pad.setLeftStick(0, 0);
        oracle.setStick(0, 0);
        h.keyUp('d');
        h.keyUp('a');
        oracle.releaseMoveKey('d');
        oracle.releaseMoveKey('a');
        h.input.pointerUp(0);
        oracle.pointerUp();
        h.bus.emit('level:up', { level: 2 }); // real offer through UpgradeSystem
      }
      const inSession = sessionStep >= 0 && sessionStep < 8;
      if (inSession) {
        // Fixed session script; every poll still runs the oracle asserts.
        if (sessionStep === 1) {
          h.padDown(15);
          oracle.hold('gamepad', 'navRight', true);
          pollOnce();
          h.padUp(15);
          oracle.hold('gamepad', 'navRight', false);
          pollOnce();
        } else if (sessionStep === 3) {
          h.input.pointerDown(50, 300);
          oracle.pointerDown(50, 300);
          pollOnce();
        } else if (sessionStep === 4) {
          h.input.pointerUp(0);
          oracle.pointerUp();
          pollOnce();
        } else if (sessionStep === 5) {
          h.padDown(0);
          oracle.hold('gamepad', 'confirm', true);
          pollOnce();
          h.padUp(0);
          oracle.hold('gamepad', 'confirm', false);
          pollOnce();
        } else {
          pollOnce();
        }
        if (sessionStep === 2) {
          // Under keyboard/gamepad the focused card carries the exact ring.
          expect(h.chooserRingedCardIndex()).toBe(1);
          expect(h.focusRingCount()).toBe(1);
          expect(h.inputController.getInputMode()).toBe('gamepad');
          expect(h.chooserDiagnostics().choiceIds).toHaveLength(3);
        }
        if (sessionStep === 4) {
          // After a pointer switch the ring follows hover (none) — no stale
          // focus ring survives the mode change.
          expect(h.inputController.getInputMode()).toBe('pointer');
          expect(h.chooserRingedCardIndex()).toBe(-1);
          expect(h.focusRingCount()).toBe(0);
        }
        if (sessionStep === 6) {
          // The session confirm chose exactly one card synchronously.
          expect(chosen).toHaveLength(1);
          expect(h.chooserDiagnostics().choiceIds).toEqual([]);
          expect(h.runState.status).toBe('active');
          chosen.length = 0;
        }
        sessionStep += 1;
        if (sessionStep >= 8) sessionStep = -1;
        continue;
      }

      // Seeded alternation across keyboard movement, gamepad movement,
      // direct pointer touch-stick gestures, same-frame combinations, and
      // releases.
      const op = s.nextInt(16);
      switch (op) {
        case 0:
          if (!oracle.holdsKeyboard('movement')) {
            h.keyDown('d');
            oracle.pressMoveKey('d');
          }
          break;
        case 1:
          h.keyUp('d');
          oracle.releaseMoveKey('d');
          break;
        case 2:
          if (!oracle.holdsKeyboard('movement')) {
            h.keyDown('a');
            oracle.pressMoveKey('a');
          }
          break;
        case 3:
          h.keyUp('a');
          oracle.releaseMoveKey('a');
          break;
        case 4:
          h.pad.setLeftStick(0.4, 0);
          oracle.setStick(0.4, 0);
          break;
        case 5:
          h.pad.setLeftStick(0, 0);
          oracle.setStick(0, 0);
          break;
        case 6:
          h.keyDown('Enter');
          oracle.hold('keyboard', 'confirm', true);
          break;
        case 7:
          h.keyUp('Enter');
          oracle.hold('keyboard', 'confirm', false);
          break;
        case 8:
          h.padDown(0);
          oracle.hold('gamepad', 'confirm', true);
          break;
        case 9:
          h.padUp(0);
          oracle.hold('gamepad', 'confirm', false);
          break;
        case 10:
          if (!oracle.pointerPinned) {
            h.input.pointerDown(120, 200);
            oracle.pointerDown(120, 200);
          }
          break;
        case 11:
          h.input.pointerMove(140, 220);
          oracle.pointerMove(140, 220);
          break;
        case 12:
          h.input.pointerUp(0);
          oracle.pointerUp();
          break;
        case 13:
          // Same-frame Enter + bottom face: coalesces to ONE keyboard edge.
          h.keyDown('Enter');
          h.padDown(0);
          oracle.hold('keyboard', 'confirm', true);
          oracle.hold('gamepad', 'confirm', true);
          break;
        case 14:
          // Same-frame release: releases never create edges.
          h.keyUp('Enter');
          h.padUp(0);
          oracle.hold('keyboard', 'confirm', false);
          oracle.hold('gamepad', 'confirm', false);
          break;
        case 15:
          // Same-frame movement start from keyboard + gamepad: the LAST
          // adapter crossing (gamepad) owns the vector and the presentation.
          h.keyDown('d');
          h.pad.setLeftStick(0.4, 0);
          oracle.pressMoveKey('d');
          oracle.setStick(0.4, 0);
          break;
        default:
          break;
      }
      pollOnce();
    }

    // Releases at the end leave everything neutral; no listener growth.
    h.keyUp('d');
    h.keyUp('a');
    h.keyUp('Enter');
    h.padUp(0);
    h.pad.setLeftStick(0, 0);
    h.input.pointerUp(0);
    h.poll();
    expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
    expect(h.sceneCommands()).toEqual({ start: 0, restart: 0 });
    expect(h.listeners()).toEqual(listenerBaseline);
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });

  it('turns simultaneous Enter plus bottom-face into exactly one card choice in 64 production-composed trials', () => {
    for (let trial = 0; trial < 64; trial += 1) {
      const h = createGameSoakHarness({
        fixtureSeed: EPIC19_SOAK_SEEDS.mixedInput + trial,
        runSeed: 2000 + trial,
        storageKey: `e19-choice-${trial}`,
      });
      const chosen: string[] = [];
      h.bus.on('card:chosen', (e: { upgradeId: string }) => chosen.push(e.upgradeId));
      let offered = 0;
      h.bus.on('card:offered', () => { offered += 1; });
      let uiConfirms = 0;
      h.bus.on('ui:confirm', () => { uiConfirms += 1; });
      const raw: Array<{ action: string; source: string }> = [];
      h.inputController.onAction('confirm', (edge) => raw.push(edge));
      const commands = h.sceneCommands();

      // 1. Open a real offer and record its identity + stack posture.
      const offeredIds = h.openChooser();
      const offerId = h.chooserDiagnostics().offerId;
      expect(offerId).toBeTypeOf('number');
      const stacksBefore = { ...h.runState.upgradeStacks };
      expect(offered).toBe(1);
      expect(offeredIds).toHaveLength(3);

      // 2. Set Enter and standard-layout position 0 down before the same poll.
      h.simultaneousConfirmDown();
      // 3. Poll once, then three held polls; release keyboard only and poll;
      //    release pad and poll.
      h.poll();
      for (let i = 0; i < 3; i += 1) h.poll();
      h.keyUp('Enter');
      h.poll();
      h.padUp(0);
      h.poll();

      // 4. EXACTLY ONE raw confirm edge, keyboard-sourced under the frozen
      //    source order; every held poll, the release-keyboard-while-pad-held
      //    poll, and the final release poll produce ZERO additional edges.
      expect(raw).toEqual([{ action: 'confirm', source: 'keyboard' }]);
      expect(chosen).toHaveLength(1);
      const chosenId = chosen[0]!;
      expect(offeredIds).toContain(chosenId);
      expect(h.runState.upgradeStacks[chosenId]).toBe((stacksBefore[chosenId] ?? 0) + 1);
      expect(h.chooserDiagnostics().choiceIds).toEqual([]);
      expect(h.chooserDiagnostics().offerId).toBeUndefined();
      expect(offered).toBe(1); // no second offer token consumed
      expect(uiConfirms).toBe(0); // no ui:confirm substitution
      expect(h.sceneCommands()).toEqual(commands);

      // 5. A fresh release/re-press produces exactly one new confirm edge and
      //    one valid next effect (G-15): a second offer is chosen once.
      h.bus.emit('level:up', { level: 3 });
      expect(offered).toBe(2);
      h.simultaneousConfirmDown();
      h.poll();
      h.simultaneousConfirmUp();
      h.poll();
      expect(raw).toHaveLength(2);
      expect(raw[1]!.source).toBe('keyboard');
      expect(chosen).toHaveLength(2);
      expect(h.chooserDiagnostics().choiceIds).toEqual([]);
      expect(h.runState.status).toBe('active');
      expect(h.sceneCommands()).toEqual(commands);
      h.destroy();
    }
  });
});
