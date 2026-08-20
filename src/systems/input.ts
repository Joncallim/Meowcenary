import Phaser from 'phaser';
import type { System } from '../engine/system';
import { RuntimeConfig } from '../engine/config';
import {
  LogicalInputCore,
  type ActionEdge,
  type GameAction,
  ALL_ACTIONS,
} from '../engine/logicalInput';
import { ZERO_VEC2, clampLength, normalize, type Vec2 } from '../engine/vector';

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
};

// Reverse index: action -> key names. Multiple keys map to one action
// (Enter/Space -> confirm); the polled adapter holds the action when ANY
// mapped key is down (OR semantics), never letting one key's false overwrite
// a sibling key's true within the same frame.
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
    };

    this.keys = this.keyboard.addKeys(mapping) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(): void {
    const x =
      (pressed(this.keys.d) || pressed(this.keys.right) ? 1 : 0) +
      (pressed(this.keys.a) || pressed(this.keys.left) ? -1 : 0);
    const y =
      (pressed(this.keys.s) || pressed(this.keys.down) ? 1 : 0) +
      (pressed(this.keys.w) || pressed(this.keys.up) ? -1 : 0);
    this.core.setMovementSample('keyboard', normalize({ x, y }), 0);

    // Polled actions (Epic 19 D3): reading Key.isDown each frame eliminates
    // the OS key-repeat defect class by construction and detects keys already
    // held when the adapter attached (e.g. held across a scene transition).
    // Polled per action with OR semantics across its mapped keys.
    for (const [action, names] of ACTION_KEY_NAMES) {
      this.core.setActionHeld(
        'keyboard',
        action,
        names.some((name) => pressed(this.keys[name])),
      );
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
      this.core.setMovementSample('pointer', ZERO_VEC2, 0);
      return;
    }

    const delta = {
      x: this.pointerCurrent.x - this.pointerStart.x,
      y: this.pointerCurrent.y - this.pointerStart.y,
    };
    const clamped = clampLength(delta, this.radius);
    this.core.setMovementSample(
      'pointer',
      { x: clamped.x / this.radius, y: clamped.y / this.radius },
      0,
    );
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

// Standard HTML5 Gamepad button indices used by Phaser.
const GAMEPAD_BUTTONS: Readonly<Record<string, number>> = {
  confirm: 0,
  back: 1,
  inventory: 3, // top face (Y)
  ability: 2, // left face (X)
  pause: 9, // Menu/Start
  navUp: 12,
  navDown: 13,
  navLeft: 14,
  navRight: 15,
};

class GamepadAdapter implements InputAdapter {
  private previousActions = new Set<GameAction>();
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
    const gamepads = this.gamepad?.getAll() ?? [];
    let bestVector = ZERO_VEC2;
    let bestMagnitude = 0;

    const currentActions = new Set<GameAction>();

    for (const pad of gamepads) {
      const stickX = pad.leftStick.x ?? pad.axes[0]?.value ?? 0;
      const stickY = pad.leftStick.y ?? pad.axes[1]?.value ?? 0;

      let dpadX = 0;
      let dpadY = 0;
      if (pad.isButtonDown(GAMEPAD_BUTTONS.navLeft)) dpadX -= 1;
      if (pad.isButtonDown(GAMEPAD_BUTTONS.navRight)) dpadX += 1;
      if (pad.isButtonDown(GAMEPAD_BUTTONS.navUp)) dpadY -= 1;
      if (pad.isButtonDown(GAMEPAD_BUTTONS.navDown)) dpadY += 1;

      // Epic 19 §4: left-stick digital projection for navigation. A stick
      // deflection beyond navThreshold drives the dominant-axis cardinal nav
      // action, OR-combined with the D-pad buttons.
      const stickMagnitude = Math.hypot(stickX, stickY);
      if (stickMagnitude > this.navThreshold) {
        const dominantAxisX = Math.abs(stickX) >= Math.abs(stickY);
        if (dominantAxisX) {
          currentActions.add(stickX > 0 ? 'navRight' : 'navLeft');
        } else {
          currentActions.add(stickY > 0 ? 'navDown' : 'navUp');
        }
      }

      const vector = clampLength({ x: stickX + dpadX, y: stickY + dpadY }, 1);
      const magnitude = Math.hypot(vector.x, vector.y);
      if (magnitude > bestMagnitude) {
        bestMagnitude = magnitude;
        bestVector = vector;
      }

      for (const [action, index] of Object.entries(GAMEPAD_BUTTONS)) {
        if (pad.isButtonDown(index)) {
          currentActions.add(action as GameAction);
        }
      }
    }

    this.core.setMovementSample('gamepad', bestVector, this.deadzone);

    for (const action of ALL_ACTIONS) {
      const was = this.previousActions.has(action);
      const now = currentActions.has(action);
      if (was !== now) {
        this.core.setActionHeld('gamepad', action, now);
      }
    }

    this.previousActions = currentActions;
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
    this.previousActions.clear();
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
    for (const adapter of this.adapters) {
      adapter.update();
    }

    const edges = this.core.update(dtMs);

    const source = this.core.getActiveMovementSource();
    if (source) {
      this.lastActiveMode = source;
    }

    for (const edge of edges) {
      // Epic 19 D7: any action edge changes the active input source, so
      // menu hints follow keyboard/gamepad activity without movement.
      this.lastActiveMode = edge.source;

      const handlers = this.actionSubscriptions.get(edge.action);
      const actionHandlers = [...(handlers ?? [])];
      const anyHandlers = [...this.anyActionHandlers];

      for (const handler of actionHandlers) {
        handler(edge);
      }
      for (const handler of anyHandlers) {
        handler(edge);
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
