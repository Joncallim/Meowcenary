import { EventEmitter } from 'events';
import { vi } from 'vitest';

// Shared Phaser runtime mocks for tests that instantiate entities/systems that
// depend on Phaser classes (e.g. DropSystem). Tests needing these mocks must
// import this module; `import type` from 'phaser' does not require it.

export class MockGameObject {
  active = true;
  visible = true;
  destroyed = false;
  depth = 0;
  alpha = 1;
  fillColor?: number;
  strokeWidth = 0;
  strokeColor?: number;
  strokeAlpha = 0;
  body?: MockBody;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setStrokeStyle(width: number, color: number, alpha: number): this {
    this.strokeWidth = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setDisplaySize(): this {
    return this;
  }

  setFillStyle(color: number): this {
    this.fillColor = color;
    return this;
  }

  destroy(): void {
    this.active = false;
    this.destroyed = true;
  }
}

export class MockArc extends MockGameObject {}

export class MockBody {
  enable = true;
  velocity = { x: 0, y: 0 };
  circleRadius?: number;

  constructor(readonly gameObject: MockGameObject) {}

  setCircle(radius: number): void {
    this.circleRadius = radius;
  }

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

export class MockKey extends EventEmitter {
  isDown = false;
  constructor(readonly keyCode: string | number) {
    super();
  }
}

export class MockKeyboardPlugin extends EventEmitter {
  keys = new Map<string | number, MockKey>();

  addKeys(mapping: Record<string, string | number>): Record<string, MockKey> {
    const result: Record<string, MockKey> = {};
    for (const [name, code] of Object.entries(mapping)) {
      if (!this.keys.has(code)) {
        this.keys.set(code, new MockKey(code));
      }
      result[name] = this.keys.get(code)!;
    }
    return result;
  }

  addKey(keyCode: string | number): MockKey {
    if (!this.keys.has(keyCode)) {
      this.keys.set(keyCode, new MockKey(keyCode));
    }
    return this.keys.get(keyCode)!;
  }

  removeKey(key: MockKey | string | number): void {
    const code = typeof key === 'object' ? key.keyCode : key;
    this.keys.delete(code);
  }

  keydown(key: string, repeat = false): void {
    this.emit('keydown', { key, repeat });
    const code = this.resolveCode(key);
    const mockKey = code !== undefined ? this.keys.get(code) : undefined;
    if (mockKey) {
      mockKey.isDown = true;
      if (!repeat) {
        mockKey.emit('down');
      }
    }
  }

  // Simulate a key already held before the adapter attached (e.g. held across
  // a scene transition): sets isDown without emitting any 'down' event.
  holdKey(key: string): void {
    const code = this.resolveCode(key);
    const mockKey = code !== undefined ? this.keys.get(code) : undefined;
    if (mockKey) {
      mockKey.isDown = true;
    }
  }

  keyup(key: string): void {
    this.emit('keyup', { key });
    const code = this.resolveCode(key);
    const mockKey = code !== undefined ? this.keys.get(code) : undefined;
    if (mockKey) {
      mockKey.isDown = false;
      mockKey.emit('up');
    }
  }

  private resolveCode(key: string): string | number | undefined {
    const upper = key.toUpperCase();
    const codeByKey: Record<string, string | number> = {
      W: 'W',
      A: 'A',
      S: 'S',
      D: 'D',
      UP: 'UP',
      DOWN: 'DOWN',
      LEFT: 'LEFT',
      RIGHT: 'RIGHT',
      ARROWUP: 'UP',
      ARROWDOWN: 'DOWN',
      ARROWLEFT: 'LEFT',
      ARROWRIGHT: 'RIGHT',
      ENTER: 'ENTER',
      ' ': 'SPACE',
      SPACE: 'SPACE',
      ESCAPE: 'ESC',
      ESC: 'ESC',
      P: 'P',
      I: 'I',
      Q: 'Q',
    };
    return codeByKey[upper];
  }
}

export class MockButton {
  pressed = false;
  value = 0;
  constructor(readonly index: number) {}
}

export class MockAxis {
  value = 0;
  constructor(readonly index: number) {}
}

export class MockGamepad extends EventEmitter {
  connected = true;
  buttons: MockButton[] = [];
  axes: MockAxis[] = [];
  leftStick = { x: 0, y: 0 };
  rightStick = { x: 0, y: 0 };
  up = false;
  down = false;
  left = false;
  right = false;
  A = false;
  B = false;
  X = false;
  Y = false;

  constructor(readonly index: number = 0) {
    super();
  }

  isButtonDown(index: number): boolean {
    return this.buttons[index]?.pressed ?? false;
  }

  setButton(index: number, pressed: boolean): void {
    while (this.buttons.length <= index) {
      this.buttons.push(new MockButton(this.buttons.length));
    }
    const button = this.buttons[index];
    const changed = button.pressed !== pressed;
    button.pressed = pressed;
    button.value = pressed ? 1 : 0;
    if (changed) {
      this.emit(pressed ? 'down' : 'up', index, button.value, button);
    }
  }

  /** Simulates a short (non-standard) pad: clears buttons so the adapter's
   *  bounds-safe reads must handle missing entries (real Phaser's
   *  `isButtonDown` would throw on `this.buttons[index]` — the adapter must
   *  not call it unguarded). */
  clearButtons(): void {
    this.buttons.length = 0;
  }

  setLeftStick(x: number, y: number): void {
    this.leftStick.x = x;
    this.leftStick.y = y;
  }

  setAxis(index: number, value: number): void {
    while (this.axes.length <= index) {
      this.axes.push(new MockAxis(this.axes.length));
    }
    this.axes[index].value = value;
  }
}

export class MockGamepadPlugin extends EventEmitter {
  gamepads: MockGamepad[] = [];
  total = 0;
  pad1?: MockGamepad;
  pad2?: MockGamepad;
  pad3?: MockGamepad;
  pad4?: MockGamepad;
  private readonly listenerWrappers = new Map<
    string | symbol,
    Map<(...args: unknown[]) => void, (...args: unknown[]) => void>
  >();

  on(event: string | symbol, listener: (...args: unknown[]) => void, context?: unknown): this {
    const wrapped = context !== undefined ? listener.bind(context) : listener;
    let eventMap = this.listenerWrappers.get(event);
    if (!eventMap) {
      eventMap = new Map();
      this.listenerWrappers.set(event, eventMap);
    }
    eventMap.set(listener, wrapped);
    super.on(event, wrapped);
    return this;
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void, context?: unknown): this {
    const bound = context !== undefined ? listener.bind(context) : listener;
    const wrapped = (...args: unknown[]) => {
      this.off(event, listener, context);
      bound(...args);
    };
    let eventMap = this.listenerWrappers.get(event);
    if (!eventMap) {
      eventMap = new Map();
      this.listenerWrappers.set(event, eventMap);
    }
    eventMap.set(listener, wrapped);
    super.on(event, wrapped);
    return this;
  }

  off(event: string | symbol, listener?: (...args: unknown[]) => void, context?: unknown): this {
    if (listener === undefined) {
      if (context === undefined) {
        super.removeAllListeners(event);
        this.listenerWrappers.delete(event);
      }
      return this;
    }
    const eventMap = this.listenerWrappers.get(event);
    const wrapped = eventMap?.get(listener);
    if (wrapped && eventMap) {
      super.off(event, wrapped);
      eventMap.delete(listener);
    }
    return this;
  }

  /** Matches real Phaser 3.90 `GamepadPlugin.getAll()`: returns every occupied
   *  slot, INCLUDING disconnected pads (which keep stale button/stick values
   *  until refreshPads clears them). The adapter must guard `pad.connected`
   *  itself; a mock that filters would hide the phantom-input defect. */
  getAll(): MockGamepad[] {
    return this.gamepads.filter((pad) => pad !== undefined);
  }

  getPad(index: number): MockGamepad | undefined {
    return this.gamepads[index];
  }

  connect(pad: MockGamepad): void {
    pad.connected = true;
    this.gamepads[pad.index] = pad;
    this.total = this.gamepads.filter((p) => p.connected).length;
    this[`pad${pad.index + 1}` as 'pad1'] = pad;
    this.emit('connected', pad, {});
  }

  disconnect(pad: MockGamepad): void {
    pad.connected = false;
    this.total = this.gamepads.filter((p) => p.connected).length;
    this[`pad${pad.index + 1}` as 'pad1'] = undefined;
    this.emit('disconnected', pad, {});
  }
}

export class MockPointer {
  constructor(
    public x = 0,
    public y = 0,
    public isDown = false,
    public id = 0,
  ) {}
}

export class MockInputPlugin extends EventEmitter {
  keyboard?: MockKeyboardPlugin;
  gamepad?: MockGamepadPlugin;
  activePointer = new MockPointer();
  private readonly listenerWrappers = new Map<
    string | symbol,
    Map<(...args: unknown[]) => void, (...args: unknown[]) => void>
  >();

  constructor(options: { keyboard?: boolean; gamepad?: boolean } = {}) {
    super();
    if (options.keyboard) {
      this.keyboard = new MockKeyboardPlugin();
    }
    if (options.gamepad) {
      this.gamepad = new MockGamepadPlugin();
    }
  }

  on(event: string | symbol, listener: (...args: unknown[]) => void, context?: unknown): this {
    const wrapped = context !== undefined ? listener.bind(context) : listener;
    let eventMap = this.listenerWrappers.get(event);
    if (!eventMap) {
      eventMap = new Map();
      this.listenerWrappers.set(event, eventMap);
    }
    eventMap.set(listener, wrapped);
    super.on(event, wrapped);
    return this;
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void, context?: unknown): this {
    const bound = context !== undefined ? listener.bind(context) : listener;
    const wrapped = (...args: unknown[]) => {
      this.off(event, listener, context);
      bound(...args);
    };
    let eventMap = this.listenerWrappers.get(event);
    if (!eventMap) {
      eventMap = new Map();
      this.listenerWrappers.set(event, eventMap);
    }
    eventMap.set(listener, wrapped);
    super.on(event, wrapped);
    return this;
  }

  off(event: string | symbol, listener?: (...args: unknown[]) => void, context?: unknown): this {
    if (listener === undefined) {
      if (context === undefined) {
        super.removeAllListeners(event);
        this.listenerWrappers.delete(event);
      }
      return this;
    }
    const eventMap = this.listenerWrappers.get(event);
    const wrapped = eventMap?.get(listener);
    if (wrapped && eventMap) {
      super.off(event, wrapped);
      eventMap.delete(listener);
    }
    return this;
  }

  // Multi-touch: each pointer.id gets its own MockPointer so the adapter's
  // D8 pinning logic can be exercised with concurrent touches.
  private readonly pointersById = new Map<number, MockPointer>();

  private getOrCreatePointer(id: number): MockPointer {
    let pointer = this.pointersById.get(id);
    if (!pointer) {
      pointer = new MockPointer(0, 0, false, id);
      this.pointersById.set(id, pointer);
    }
    return pointer;
  }

  pointerDown(x: number, y: number, id = 0): void {
    const pointer = this.getOrCreatePointer(id);
    pointer.x = x;
    pointer.y = y;
    pointer.isDown = true;
    this.activePointer = pointer;
    this.emit('pointerdown', pointer);
  }

  pointerMove(x: number, y: number, id = 0): void {
    const pointer = this.getOrCreatePointer(id);
    pointer.x = x;
    pointer.y = y;
    this.activePointer = pointer;
    this.emit('pointermove', pointer);
  }

  pointerUp(id = 0): void {
    const pointer = this.pointersById.get(id);
    if (!pointer) {
      return;
    }
    pointer.isDown = false;
    this.emit('pointerup', pointer);
  }
}

const MockPhaser = {
  AUTO: 'AUTO',
  GameObjects: {
    GameObject: MockGameObject,
    Arc: MockArc,
    Text: MockGameObject,
    Container: MockGameObject,
    Rectangle: MockGameObject,
  },
  Physics: {
    Arcade: {
      Body: MockBody,
      StaticBody: MockBody,
      Group: class MockGroup {
        children = { size: 0 };
      },
    },
  },
  Input: {
    Keyboard: {
      KeyCodes: {
        W: 'W',
        A: 'A',
        S: 'S',
        D: 'D',
        UP: 'UP',
        DOWN: 'DOWN',
        LEFT: 'LEFT',
        RIGHT: 'RIGHT',
        ENTER: 'ENTER',
        SPACE: 'SPACE',
        ESC: 'ESC',
        P: 'P',
        I: 'I',
        Q: 'Q',
      },
      Key: MockKey,
    },
    Gamepad: {
      Gamepad: MockGamepad,
      Button: MockButton,
      Axis: MockAxis,
    },
    Events: {
      POINTER_DOWN: 'pointerdown',
      POINTER_UP: 'pointerup',
      POINTER_MOVE: 'pointermove',
      POINTER_UP_OUTSIDE: 'pointerupoutside',
      POINTER_OVER: 'pointerover',
      POINTER_OUT: 'pointerout',
    },
  },
  Scale: {
    FIT: 'FIT',
    CENTER_BOTH: 'CENTER_BOTH',
    Events: {
      RESIZE: 'resize',
    },
  },
  Scene: class Scene {
    constructor(public key: string) {}
  },
  Scenes: {
    Events: {
      SHUTDOWN: 'shutdown',
      DESTROY: 'destroy',
    },
    Scene: class Scene {
      constructor(public key: string) {}
    },
  },
};

vi.mock('phaser', () => ({
  default: MockPhaser,
}));

export default MockPhaser;
