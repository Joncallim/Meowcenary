import Phaser from 'phaser';
import type { System } from '../engine/system';
import { RuntimeConfig } from '../engine/config';
import {
  LogicalInputCore,
  type ActionEdge,
  type GameAction,
  ALL_ACTIONS,
} from '../engine/logicalInput';
import type { Vec2 } from '../engine/vector';

export type { GameAction } from '../engine/logicalInput';
export type InputMode = 'keyboard' | 'pointer' | 'gamepad';

export interface InputPresentationSnapshot {
  readonly mode: InputMode;
  readonly pointerStart: Readonly<Vec2> | null;
  readonly pointerCurrent: Readonly<Vec2> | null;
  readonly moveVector: Readonly<Vec2>;
}

export type ActionHandler = (edge: ActionEdge) => void;

interface InputAdapter {
  update(): void;
  destroy(): void;
}

const KEY_ACTION_MAP: Record<string, GameAction | undefined> = {
  up: 'navUp',
  down: 'navDown',
  left: 'navLeft',
  right: 'navRight',
  enter: 'confirm',
  space: 'confirm',
  esc: 'back',
  p: 'pause',
  i: 'inventory',
  q: 'ability',
};

// Reverse index: action -> key names. Multiple keys map to one action
// (Enter/Space -> confirm); the polled adapter holds the action when ANY
// mapped key is down (OR semantics), never letting one key's false overwrite
// a sibling key's true within the same frame. Precomputed as parallel arrays
// so the per-frame poll does not iterate a Map or allocate (Epic 19 §6 gate).
const ACTION_KEY_NAMES: ReadonlyMap<GameAction, readonly string[]> = (() => {
  const index = new Map<GameAction, string[]>();
  for (const [name, action] of Object.entries(KEY_ACTION_MAP)) {
    if (!action) {
      continue;
    }
    const names = index.get(action) ?? [];
    names.push(name);
    index.set(action, names);
  }
  return index;
})();

const ACTION_KEY_ENTRIES: ReadonlyArray<readonly [GameAction, readonly string[]]> =
  Object.freeze(Array.from(ACTION_KEY_NAMES.entries()));

function pressed(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false;
}

class KeyboardAdapter implements InputAdapter {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;

  constructor(
    scene: Phaser.Scene,
    private readonly core: LogicalInputCore,
  ) {
    this.keyboard = scene.input.keyboard;
    if (!this.keyboard) {
      return;
    }

    const mapping = {
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      i: Phaser.Input.Keyboard.KeyCodes.I,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
    };

    this.keys = this.keyboard.addKeys(mapping) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(): void {
    // Digital normalize without allocation: cardinal keys are already unit
    // length; a diagonal needs the 1/sqrt(2) factor (Epic 19 §6 zero-alloc).
    const x =
      (pressed(this.keys.d) || pressed(this.keys.right) ? 1 : 0) +
      (pressed(this.keys.a) || pressed(this.keys.left) ? -1 : 0);
    const y =
      (pressed(this.keys.s) || pressed(this.keys.down) ? 1 : 0) +
      (pressed(this.keys.w) || pressed(this.keys.up) ? -1 : 0);
    const diagonal = x !== 0 && y !== 0;
    this.core.setMovementSample(
      'keyboard',
      diagonal ? x * Math.SQRT1_2 : x,
      diagonal ? y * Math.SQRT1_2 : y,
      0,
    );

    // Polled actions (Epic 19 D3): reading Key.isDown each frame eliminates
    // the OS key-repeat defect class by construction and detects keys already
    // held when the adapter attached (e.g. held across a scene transition).
    // Polled per action with OR semantics across its mapped keys.
    for (let i = 0; i < ACTION_KEY_ENTRIES.length; i += 1) {
      const [action, names] = ACTION_KEY_ENTRIES[i];
      let held = false;
      for (let j = 0; j < names.length; j += 1) {
        if (pressed(this.keys[names[j]])) {
          held = true;
          break;
        }
      }
      this.core.setActionHeld('keyboard', action, held);
    }
  }

  destroy(): void {
    for (const key of Object.values(this.keys)) {
      this.keyboard?.removeKey(key);
    }
  }
}

class PointerAdapter implements InputAdapter {
  private pointerStart: Vec2 | null = null;
  private pointerCurrent: Vec2 | null = null;
  private pinnedPointerId: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly core: LogicalInputCore,
    private readonly radius: number,
    private readonly onPointerDown?: () => void,
  ) {
    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
    this.scene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  update(): void {
    if (!this.isActive() || !this.pointerStart || !this.pointerCurrent) {
      this.core.setMovementSample('pointer', 0, 0, 0);
      return;
    }

    // Clamp to the stick radius without allocating (Epic 19 §6 zero-alloc).
    let dx = this.pointerCurrent.x - this.pointerStart.x;
    let dy = this.pointerCurrent.y - this.pointerStart.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > this.radius) {
      const scale = this.radius / magnitude;
      dx *= scale;
      dy *= scale;
    }
    this.core.setMovementSample('pointer', dx / this.radius, dy / this.radius, 0);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
  }

  getPointerStart(): Vec2 | null {
    return this.pointerStart;
  }

  getPointerCurrent(): Vec2 | null {
    return this.pointerCurrent;
  }

  isActive(): boolean {
    return this.pinnedPointerId !== null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Epic 19 D7: any pointerdown signals pointer mode — including a second
    // finger tapping a UI control while another pointer is already pinned.
    this.onPointerDown?.();

    // Epic 19 D8: pin movement to the pointer.id that began the gesture.
    // Later pointers never re-anchor movement and stay available to UI.
    if (this.isActive()) {
      return;
    }

    this.pinnedPointerId = pointer.id;
    this.pointerStart = pointerToVec2(pointer);
    this.pointerCurrent = pointerToVec2(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pinnedPointerId || !pointer.isDown) {
      return;
    }

    this.pointerCurrent = pointerToVec2(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pinnedPointerId) {
      return;
    }

    this.pinnedPointerId = null;
    this.pointerStart = null;
    this.pointerCurrent = null;
  }
}

// Standard HTML5 Gamepad button indices used by Phaser. Frozen §4 maps these
// by standard-layout POSITION (bottom face, right face, left face, top face,
// Menu, D-pad) — never vendor names (D5).
const GAMEPAD_BUTTONS: Readonly<Record<string, number>> = {
  confirm: 0, // bottom face position
  back: 1, // right face position
  ability: 2, // left face position (reserved for Epic 24, D11)
  inventory: 3, // top face position
  pause: 9, // Menu position
  navUp: 12,
  navDown: 13,
  navLeft: 14,
  navRight: 15,
};

// Precomputed entries so the poll loop never allocates per frame (§6).
const GAMEPAD_BUTTON_ENTRIES: ReadonlyArray<readonly [string, number]> =
  Object.freeze(Object.entries(GAMEPAD_BUTTONS));

// Action -> index into the preallocated held-state arrays. Iterating a Set or
// clearing/re-adding one allocates in V8; the §6 gate requires zero per-frame
// allocations, so the adapter tracks held actions as boolean flags instead.
const ACTION_INDEX: ReadonlyMap<GameAction, number> = (() => {
  const index = new Map<GameAction, number>();
  ALL_ACTIONS.forEach((action, i) => index.set(action, i));
  return index;
})();

/** Bounds-safe positional button read. Real Phaser `Gamepad.isButtonDown`
 *  indexes `this.buttons[index]` with no bounds check and crashes on pads
 *  exposing fewer buttons (e.g. four-button pads); a non-standard pad must
 *  read as neutral input, never crash the frame (D5). */
function isButtonDown(pad: Phaser.Input.Gamepad.Gamepad, index: number): boolean {
  return pad.buttons[index]?.pressed === true;
}

class GamepadAdapter implements InputAdapter {
  // Preallocated held-state flags, swapped each frame — no Set iteration, no
  // per-frame allocation (Epic 19 §6 gate).
  private readonly currentHeld = new Array<boolean>(ALL_ACTIONS.length).fill(false);
  private readonly previousHeld = new Array<boolean>(ALL_ACTIONS.length).fill(false);
  private readonly gamepad: Phaser.Input.Gamepad.GamepadPlugin | null;

  constructor(
    scene: Phaser.Scene,
    private readonly core: LogicalInputCore,
    private readonly deadzone: number,
    private readonly navThreshold: number,
  ) {
    this.gamepad = scene.input.gamepad;
    this.gamepad?.on('connected', this.handleConnected, this);
    this.gamepad?.on('disconnected', this.handleDisconnected, this);
  }

  update(): void {
    // Iterate the plugin's slot array directly (no getAll() allocation).
    // Real Phaser keeps a disconnected pad in its slot with stale button and
    // stick values; a connected guard must exclude it or the next poll would
    // resurrect phantom input (Epic 19 D2/D3 disconnect requirement).
    const gamepads = this.gamepad?.gamepads;
    let bestX = 0;
    let bestY = 0;
    let bestMagnitude = 0;

    const current = this.currentHeld;
    for (let i = 0; i < current.length; i += 1) {
      current[i] = false;
    }

    if (gamepads) {
      for (let i = 0; i < gamepads.length; i += 1) {
        const pad = gamepads[i];
        if (!pad || !pad.connected) {
          continue;
        }

        const stickX = pad.leftStick.x ?? pad.axes[0]?.value ?? 0;
        const stickY = pad.leftStick.y ?? pad.axes[1]?.value ?? 0;

        // Epic 19 §4: D-pad drives navigation ONLY — it is never mixed into
        // the analog movement vector (movement is left-stick only).
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navLeft)) current[ACTION_INDEX.get('navLeft')!] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navRight)) current[ACTION_INDEX.get('navRight')!] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navUp)) current[ACTION_INDEX.get('navUp')!] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navDown)) current[ACTION_INDEX.get('navDown')!] = true;

        // Epic 19 §4: left-stick digital projection for navigation. A stick
        // deflection beyond navThreshold drives the dominant-axis cardinal nav
        // action, OR-combined with the D-pad buttons.
        const stickMagnitude = Math.sqrt(stickX * stickX + stickY * stickY);
        if (stickMagnitude > this.navThreshold) {
          const dominantAxisX = Math.abs(stickX) >= Math.abs(stickY);
          if (dominantAxisX) {
            current[ACTION_INDEX.get(stickX > 0 ? 'navRight' : 'navLeft')!] = true;
          } else {
            current[ACTION_INDEX.get(stickY > 0 ? 'navDown' : 'navUp')!] = true;
          }
        }

        // Movement is the left stick, length-clamped to 1 without allocating.
        if (stickMagnitude > bestMagnitude) {
          bestMagnitude = stickMagnitude;
          bestX = stickX;
          bestY = stickY;
        }

        for (let e = 0; e < GAMEPAD_BUTTON_ENTRIES.length; e += 1) {
          const [action, index] = GAMEPAD_BUTTON_ENTRIES[e];
          if (isButtonDown(pad, index)) {
            current[ACTION_INDEX.get(action as GameAction)!] = true;
          }
        }
      }
    }

    const magnitude = Math.sqrt(bestX * bestX + bestY * bestY);
    if (magnitude > 1) {
      bestX /= magnitude;
      bestY /= magnitude;
    }
    this.core.setMovementSample('gamepad', bestX, bestY, this.deadzone);

    const previous = this.previousHeld;
    for (let i = 0; i < ALL_ACTIONS.length; i += 1) {
      const was = previous[i];
      const now = current[i];
      if (was !== now) {
        this.core.setActionHeld('gamepad', ALL_ACTIONS[i], now);
      }
    }

    // Swap the preallocated flag arrays for the next frame's diff.
    for (let i = 0; i < previous.length; i += 1) {
      previous[i] = current[i];
    }
  }

  destroy(): void {
    this.gamepad?.off('connected', this.handleConnected, this);
    this.gamepad?.off('disconnected', this.handleDisconnected, this);
  }

  private handleConnected(): void {
    // Polling in update() will pick up the new gamepad automatically.
  }

  private handleDisconnected(): void {
    this.core.clearSource('gamepad');
    for (let i = 0; i < this.previousHeld.length; i += 1) {
      this.previousHeld[i] = false;
    }
    for (let i = 0; i < this.currentHeld.length; i += 1) {
      this.currentHeld[i] = false;
    }
  }
}

export class InputController implements System {
  private readonly core: LogicalInputCore;
  private readonly adapters: InputAdapter[];
  private readonly pointerAdapter: PointerAdapter;
  private readonly actionSubscriptions = new Map<GameAction, Set<ActionHandler>>();
  private readonly anyActionHandlers = new Set<ActionHandler>();
  private lastActiveMode: InputMode = 'pointer';

  constructor(scene: Phaser.Scene) {
    this.core = new LogicalInputCore({
      navRepeat: RuntimeConfig.gameplay.input.navRepeat,
    });
    this.pointerAdapter = new PointerAdapter(
      scene,
      this.core,
      RuntimeConfig.gameplay.input.touchStick.radius,
      () => {
        this.lastActiveMode = 'pointer';
      },
    );
    this.adapters = [
      new KeyboardAdapter(scene, this.core),
      this.pointerAdapter,
      new GamepadAdapter(
        scene,
        this.core,
        RuntimeConfig.gameplay.input.gamepad.moveDeadzone,
        RuntimeConfig.gameplay.input.gamepad.navThreshold,
      ),
    ];
  }

  update(dtMs: number): void {
    for (let i = 0; i < this.adapters.length; i += 1) {
      this.adapters[i].update();
    }

    const edges = this.core.update(dtMs);

    const source = this.core.getActiveMovementSource();
    if (source) {
      this.lastActiveMode = source;
    }

    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[i];
      // Epic 19 D7: any action edge changes the active input source, so
      // menu hints follow keyboard/gamepad activity without movement.
      this.lastActiveMode = edge.source;

      const handlers = this.actionSubscriptions.get(edge.action);
      const actionHandlers = [...(handlers ?? [])];
      const anyHandlers = [...this.anyActionHandlers];

      for (let h = 0; h < actionHandlers.length; h += 1) {
        actionHandlers[h](edge);
      }
      for (let h = 0; h < anyHandlers.length; h += 1) {
        anyHandlers[h](edge);
      }
    }
  }

  onAction(action: GameAction, handler: ActionHandler): () => void {
    const set = this.actionSubscriptions.get(action) ?? new Set();
    set.add(handler);
    this.actionSubscriptions.set(action, set);
    return () => set.delete(handler);
  }

  onAnyAction(handler: ActionHandler): () => void {
    this.anyActionHandlers.add(handler);
    return () => this.anyActionHandlers.delete(handler);
  }

  getMoveVector(): Vec2 {
    const vector = this.core.getMovementVector();
    return { x: vector.x, y: vector.y };
  }

  getPointer(): Vec2 | null {
    const current = this.pointerAdapter.getPointerCurrent();
    return current ? { ...current } : null;
  }

  getPresentationSnapshot(): InputPresentationSnapshot {
    const mode: InputMode = this.core.getActiveMovementSource() ?? this.lastActiveMode;
    const pointerStart = this.pointerAdapter.getPointerStart();
    const pointerCurrent = this.pointerAdapter.getPointerCurrent();
    const snapshot: InputPresentationSnapshot = {
      mode,
      pointerStart: pointerStart ? Object.freeze({ ...pointerStart }) : null,
      pointerCurrent: pointerCurrent ? Object.freeze({ ...pointerCurrent }) : null,
      moveVector: Object.freeze({ ...this.getMoveVector() }),
    };
    return Object.freeze(snapshot);
  }

  destroy(): void {
    for (const adapter of this.adapters) {
      adapter.destroy();
    }
    this.actionSubscriptions.clear();
    this.anyActionHandlers.clear();
  }
}

function pointerToVec2(pointer: Phaser.Input.Pointer): Vec2 {
  return { x: pointer.x, y: pointer.y };
}
