import Phaser from 'phaser';
import type { System } from '../engine/system';
import { clampLength, normalize, type Vec2 } from '../engine/vector';

interface InputKeyMap {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

export type InputMode = 'keyboard' | 'pointer';

export interface InputPresentationSnapshot {
  readonly mode: InputMode;
  readonly pointerStart: Readonly<Vec2> | null;
  readonly pointerCurrent: Readonly<Vec2> | null;
  readonly moveVector: Readonly<Vec2>;
}

export class InputController implements System {
  private readonly keys?: InputKeyMap;
  private pointerStart: Vec2 | null = null;
  private pointerCurrent: Vec2 | null = null;
  private moveVector: Vec2 = { x: 0, y: 0 };
  private mode: InputMode = 'pointer';

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = scene.input.keyboard?.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as InputKeyMap | undefined;

    scene.input.on('pointerdown', this.handlePointerDown, this);
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);
    scene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  update(_dtMs: number): void {
    const keyboard = this.getKeyboardVector();
    const pointer = this.getPointerIntent();
    this.moveVector = clampLength({ x: keyboard.x + pointer.x, y: keyboard.y + pointer.y }, 1);

    if (keyboard.x !== 0 || keyboard.y !== 0) {
      this.mode = 'keyboard';
    }
  }

  getMoveVector(): Vec2 {
    return { ...this.moveVector };
  }

  getPointer(): Vec2 | null {
    return this.pointerCurrent ? { ...this.pointerCurrent } : null;
  }

  getPresentationSnapshot(): InputPresentationSnapshot {
    const snapshot: InputPresentationSnapshot = {
      mode: this.mode,
      pointerStart: this.pointerStart ? Object.freeze({ ...this.pointerStart }) : null,
      pointerCurrent: this.pointerCurrent ? Object.freeze({ ...this.pointerCurrent }) : null,
      moveVector: Object.freeze({ ...this.moveVector }),
    };
    return Object.freeze(snapshot);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
  }

  private getKeyboardVector(): Vec2 {
    if (!this.keys) {
      return { x: 0, y: 0 };
    }

    const x = pressed(this.keys.d) || pressed(this.keys.right) ? 1 : 0;
    const xNeg = pressed(this.keys.a) || pressed(this.keys.left) ? -1 : 0;
    const y = pressed(this.keys.s) || pressed(this.keys.down) ? 1 : 0;
    const yNeg = pressed(this.keys.w) || pressed(this.keys.up) ? -1 : 0;
    return normalize({ x: x + xNeg, y: y + yNeg });
  }

  private getPointerIntent(): Vec2 {
    if (!this.pointerStart || !this.pointerCurrent) {
      return { x: 0, y: 0 };
    }

    const delta = {
      x: this.pointerCurrent.x - this.pointerStart.x,
      y: this.pointerCurrent.y - this.pointerStart.y,
    };
    return clampLength({ x: delta.x / 64, y: delta.y / 64 }, 1);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.mode = 'pointer';
    this.pointerStart = pointerToVec2(pointer);
    this.pointerCurrent = pointerToVec2(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerStart || !pointer.isDown) {
      return;
    }

    this.pointerCurrent = pointerToVec2(pointer);
  }

  private handlePointerUp(): void {
    this.pointerStart = null;
    this.pointerCurrent = null;
  }
}

function pressed(key: Phaser.Input.Keyboard.Key): boolean {
  return key.isDown;
}

function pointerToVec2(pointer: Phaser.Input.Pointer): Vec2 {
  return { x: pointer.x, y: pointer.y };
}
