import { describe, expect, it } from 'vitest';
import {
  createFixtureSequence,
  createGameSoakHarness,
  EPIC19_SOAK_SEEDS,
  PERF_LATE_WINDOW_POLLS,
  PERF_PROXY_DT_MS,
  PERF_PROXY_POLLS,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';

/**
 * Deterministic oracle for the proxy schedule: keyboard/gamepad movement
 * ownership (never summed), confirm edges (coalesced keyboard→gamepad), and
 * the disconnect/quarantine lifecycle. Scalar-only — independent of the
 * production input code.
 */
class PerfOracle {
  private readonly keys = new Set<string>();
  private keyboardMove = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private enterHeld = false;
  private padConfirmHeld = false;
  private padConnected = true;
  private quarantined = false;
  private keyboardActive = false;
  private gamepadActive = false;
  private keyboardSeq = 0;
  private gamepadSeq = 0;
  private epoch = 0;
  private owner: 'keyboard' | 'gamepad' | null = null;
  private confirmEffective = false;
  confirmEdges = 0;
  move = { x: 0, y: 0 };

  heldKey(key: string): boolean {
    return this.keys.has(key);
  }

  holdKey(key: string): void {
    this.keys.add(key);
    this.recomputeKeyboardMove();
  }

  releaseKey(key: string): void {
    this.keys.delete(key);
    this.recomputeKeyboardMove();
  }

  setStick(x: number, y: number): void {
    this.stick = { x, y };
  }

  holdEnter(held: boolean): void {
    this.enterHeld = held;
  }

  holdPadConfirm(held: boolean): void {
    this.padConfirmHeld = held;
  }

  disconnect(): void {
    this.padConnected = false;
    this.quarantined = true;
    this.gamepadActive = false;
    if (this.owner === 'gamepad') this.owner = null;
  }

  reconnect(): void {
    this.padConnected = true;
    // The slot stays quarantined until the pad reports neutral.
  }

  poll(): void {
    const keyboardActive = this.keyboardMove.x !== 0 || this.keyboardMove.y !== 0;
    let gx = 0;
    let gy = 0;
    let gamepadActive = false;
    if (this.padConnected) {
      const mag = Math.hypot(this.stick.x, this.stick.y);
      if (this.quarantined) {
        if (mag <= 0.25 && !this.padConfirmHeld) {
          this.quarantined = false;
        }
      }
      if (!this.quarantined) {
        const scaledMag = mag > 0.25 ? (mag - 0.25) / (1 - 0.25) : 0;
        const scale = mag > 0 ? scaledMag / mag : 0;
        gx = this.stick.x * scale;
        gy = this.stick.y * scale;
        gamepadActive = scaledMag > 0;
      }
    }

    if (keyboardActive && !this.keyboardActive) {
      this.epoch += 1;
      this.keyboardSeq = this.epoch;
    }
    if (gamepadActive && !this.gamepadActive) {
      this.epoch += 1;
      this.gamepadSeq = this.epoch;
    }
    this.keyboardActive = keyboardActive;
    this.gamepadActive = gamepadActive;

    if (this.owner === 'keyboard' && !keyboardActive) this.owner = null;
    if (this.owner === 'gamepad' && !gamepadActive) this.owner = null;
    if (this.owner === null) {
      if (gamepadActive && (!keyboardActive || this.gamepadSeq >= this.keyboardSeq)) {
        this.owner = 'gamepad';
      } else if (keyboardActive) {
        this.owner = 'keyboard';
      } else {
        this.owner = null;
      }
    }
    this.move = this.owner === 'keyboard'
      ? { x: this.keyboardMove.x, y: this.keyboardMove.y }
      : this.owner === 'gamepad'
        ? { x: gx, y: gy }
        : { x: 0, y: 0 };

    const effective = this.enterHeld || (this.padConfirmHeld && this.padConnected && !this.quarantined);
    if (effective && !this.confirmEffective) {
      this.confirmEdges += 1;
    }
    this.confirmEffective = effective;
  }

  private recomputeKeyboardMove(): void {
    this.keyboardMove = {
      x: (this.keys.has('d') ? 1 : 0) + (this.keys.has('a') ? -1 : 0),
      y: 0,
    };
  }
}

describe('Epic 19 Slice 5 late-wave performance proxy', () => {
  it('runs an 18,000-poll five-minute-equivalent deterministic input schedule with bounded state and exact effects', () => {
    const h = createGameSoakHarness({
      fixtureSeed: EPIC19_SOAK_SEEDS.performanceProxy,
      runSeed: 1907,
      storageKey: 'e19-performance',
    });
    const s = createFixtureSequence(EPIC19_SOAK_SEEDS.performanceProxy);
    const oracle = new PerfOracle();
    const confirmEdges: Array<{ action: string; source: string }> = [];
    h.inputController.onAction('confirm', (edge) => confirmEdges.push(edge));
    let elapsed = 0;
    let late = 0;
    const commands = h.sceneCommands();
    const listenersBefore = h.listeners();
    const LATE_START = PERF_PROXY_POLLS - PERF_LATE_WINDOW_POLLS; // 16,200

    for (let poll = 0; poll < PERF_PROXY_POLLS; poll += 1) {
      const inLate = poll >= LATE_START;
      let op = inLate ? s.nextInt(14) : s.nextInt(10);
      if (inLate && op >= 10) {
        if (op === 10) {
          h.input.gamepad!.disconnect(h.pad);
          oracle.disconnect();
        } else if (op === 11) {
          h.input.gamepad!.connect(h.pad);
          oracle.reconnect();
        } else if (op === 12) {
          if (!oracle.heldKey('d')) {
            h.keyDown('d');
            oracle.holdKey('d');
          }
        } else {
          h.keyUp('d');
          oracle.releaseKey('d');
        }
      } else {
        switch (op) {
          case 0:
            if (!oracle.heldKey('d')) { h.keyDown('d'); oracle.holdKey('d'); }
            break;
          case 1:
            h.keyUp('d'); oracle.releaseKey('d');
            break;
          case 2:
            h.pad.setLeftStick(0.4, 0); oracle.setStick(0.4, 0);
            break;
          case 3:
            h.pad.setLeftStick(0, 0); oracle.setStick(0, 0);
            break;
          case 4:
            h.keyDown('Enter'); oracle.holdEnter(true);
            break;
          case 5:
            h.keyUp('Enter'); oracle.holdEnter(false);
            break;
          case 6:
            h.padDown(0); oracle.holdPadConfirm(true);
            break;
          case 7:
            h.padUp(0); oracle.holdPadConfirm(false);
            break;
          case 8:
            // Same-frame Enter + bottom face → ONE keyboard-sourced edge.
            h.keyDown('Enter'); h.padDown(0);
            oracle.holdEnter(true); oracle.holdPadConfirm(true);
            break;
          case 9:
            // Same-frame release → no edge.
            h.keyUp('Enter'); h.padUp(0);
            oracle.holdEnter(false); oracle.holdPadConfirm(false);
            break;
          default:
            break;
        }
      }

      const edgesBefore = confirmEdges.length;
      const oracleBefore = oracle.confirmEdges;
      h.poll(PERF_PROXY_DT_MS);
      oracle.poll();
      // Oracle-exact edge accounting and movement ownership (never summed).
      expect(confirmEdges.length - edgesBefore).toBe(oracle.confirmEdges - oracleBefore);
      const move = h.inputController.getMoveVector();
      expect(Math.abs(move.x - oracle.move.x)).toBeLessThan(1e-9);
      expect(Math.abs(move.y - oracle.move.y)).toBeLessThan(1e-9);

      elapsed += PERF_PROXY_DT_MS;
      if (inLate) late += PERF_PROXY_DT_MS;
    }

    // Oracle-exact totals, bounded listeners/subscriptions, stable scenes.
    expect(confirmEdges.length).toBe(oracle.confirmEdges);
    expect(h.listeners()).toEqual(listenersBefore);
    expect(h.sceneCommands()).toEqual(commands);
    // SOAK-07: 18,000 × 1000/60 = 300,000 ms (five minutes); the late window
    // is 1,800 polls ≈ 30,000 ms. No wall-clock assertion — host speed is not
    // player evidence.
    expect(Math.abs(elapsed - 300_000)).toBeLessThan(0.001);
    expect(Math.abs(late - 30_000)).toBeLessThan(0.001);

    // Final fresh action after neutral (G-15): release everything, clear any
    // reconnect quarantine, then one fresh confirm produces exactly one edge.
    h.keyUp('d');
    h.keyUp('Enter');
    h.padUp(0);
    h.pad.setLeftStick(0, 0);
    h.poll();
    if (h.pad.connected) h.poll(); // neutral poll lifts the quarantine
    const edgesBeforeFresh = confirmEdges.length;
    h.keyDown('Enter');
    h.poll();
    h.keyUp('Enter');
    h.poll();
    expect(confirmEdges.length).toBe(edgesBeforeFresh + 1);
    expect(confirmEdges[edgesBeforeFresh]!.source).toBe('keyboard');
    expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 });
    expect(h.sceneCommands()).toEqual(commands);
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});
