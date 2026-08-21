"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tests/fixtures/allocProbe.entry.ts
var fs = __toESM(require("node:fs"), 1);

// tests/fixtures/phaserStub.ts
var phaserStub_default = {
  Input: {
    Keyboard: {
      KeyCodes: {
        W: "W",
        A: "A",
        S: "S",
        D: "D",
        UP: "UP",
        DOWN: "DOWN",
        LEFT: "LEFT",
        RIGHT: "RIGHT",
        ENTER: "ENTER",
        SPACE: "SPACE",
        ESC: "ESC",
        P: "P",
        I: "I",
        Q: "Q"
      }
    }
  }
};

// src/engine/config.ts
var RuntimeConfig = {
  canvas: { width: 390, height: 844 },
  gameplay: {
    player: {
      baseMaxHealth: 100,
      baseMoveSpeed: 175,
      invulnerabilityMs: 650,
      pickupRadius: 30
    },
    projectile: {
      radius: 4
    },
    drop: {
      radius: 8,
      magnetSpeed: 450
    },
    // Epic 14 §D11: temporary reward scheduling frozen to make the functional
    // loop testable now. Epic 18 owns the final economy/pacing balance.
    weaponRewards: {
      firstMinMs: 2e4,
      firstMaxMs: 4e4,
      repeatMinMs: 3e4,
      repeatMaxMs: 45e3,
      spawnOffset: 64
    },
    // Epic 18 (D2): four choices is the Alpha 2 default; UpgradeSystem
    // validates any explicitly supplied offerCount as a safe integer 1..5.
    upgrades: {
      offerCount: 4
    },
    // Epic 19: shared input tuning. Touch stick mode is confirmed floating
    // (anchored is a dev-only diagnostic); gamepad deadzone/nav threshold and
    // nav auto-repeat values are initial defaults tuned only with recorded
    // evidence. Dash is reserved for the Slice 4 movement-agency evidence gate.
    input: {
      touchStick: {
        radius: 64,
        mode: "floating",
        anchored: { centerX: 82, centerY: 700, activationRadius: 120 }
      },
      gamepad: { moveDeadzone: 0.25, navThreshold: 0.5 },
      navRepeat: { delayMs: 400, intervalMs: 150 }
    }
  },
  performance: {
    targetFps: 60,
    sampleWindowFrames: 120,
    maxFeedbackEffects: 96,
    maxHeavyFeedbackEffects: 72,
    maxDefeatPresentations: 24
  },
  storageKey: "meowcenary.save.v1",
  isDev: false
};

// src/engine/vector.ts
var ZERO_VEC2 = { x: 0, y: 0 };

// src/engine/logicalInput.ts
var ALL_ACTIONS = [
  "confirm",
  "back",
  "pause",
  "inventory",
  "dash",
  "ability",
  "navUp",
  "navDown",
  "navLeft",
  "navRight"
];
var NAV_ACTIONS = [
  "navUp",
  "navDown",
  "navLeft",
  "navRight"
];
var SOURCE_ORDER = ["keyboard", "pointer", "gamepad"];
function applyRadialDeadzone(value, deadzone) {
  if (Number.isNaN(value) || value <= 0) {
    return 0;
  }
  if (deadzone <= 0) {
    return Math.min(value, 1);
  }
  if (deadzone >= 1) {
    return value >= 1 ? 1 : 0;
  }
  if (value < deadzone) {
    return 0;
  }
  const scaled = (value - deadzone) / (1 - deadzone);
  return Math.min(scaled, 1);
}
var LogicalInputCore = class {
  constructor(options) {
    this.options = options;
    for (const source of SOURCE_ORDER) {
      this.held.set(source, /* @__PURE__ */ new Set());
    }
    for (const action of ALL_ACTIONS) {
      this.previousEffective.set(action, false);
    }
    for (const action of NAV_ACTIONS) {
      this.navStates.set(action, { pressedAtMs: null, repeatsEmitted: 0 });
    }
    for (const source of SOURCE_ORDER) {
      this.movementStates.set(source, {
        vector: { ...ZERO_VEC2 },
        active: false,
        lastActiveAtMs: Number.NEGATIVE_INFINITY
      });
    }
  }
  options;
  held = /* @__PURE__ */ new Map();
  previousEffective = /* @__PURE__ */ new Map();
  navStates = /* @__PURE__ */ new Map();
  movementStates = /* @__PURE__ */ new Map();
  edges = [];
  timeMs = 0;
  activeMovementSource = null;
  activeNavAction = null;
  setActionHeld(source, action, held) {
    const set = this.held.get(source);
    if (!set) {
      return;
    }
    if (held) {
      set.add(action);
    } else {
      set.delete(action);
    }
  }
  isHeld(source, action) {
    return this.held.get(source)?.has(action) ?? false;
  }
  isEffectiveHeld(action) {
    for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
      if (this.held.get(SOURCE_ORDER[i])?.has(action)) {
        return true;
      }
    }
    return false;
  }
  /** D4: radial deadzone rescaled [deadzone,1] → [0,1], then length-clamped to
   *  1. Scalar x/y inputs, mutates the preallocated movement vector in place —
   *  the poll path performs zero per-frame allocations (Epic 19 §6 gate). */
  setMovementSample(source, x, y, deadzone) {
    const state = this.movementStates.get(source);
    if (!state) {
      return;
    }
    const magnitude = Math.sqrt(x * x + y * y);
    const scaled = applyRadialDeadzone(magnitude, deadzone);
    const active = scaled > 0;
    const k = magnitude > 0 ? scaled / magnitude : 0;
    state.vector.x = x * k;
    state.vector.y = y * k;
    if (active && !state.active) {
      state.lastActiveAtMs = this.timeMs;
    }
    state.active = active;
  }
  clearSource(source) {
    const heldSet = this.held.get(source);
    if (heldSet) {
      heldSet.clear();
    }
    const movement = this.movementStates.get(source);
    if (movement) {
      movement.vector.x = 0;
      movement.vector.y = 0;
      movement.active = false;
    }
  }
  update(dtMs) {
    this.timeMs += Math.max(0, dtMs);
    this.edges.length = 0;
    this.updateMovementOwner();
    this.updateActions(dtMs);
    return this.edges;
  }
  getMovementVector() {
    if (this.activeMovementSource === null) {
      return { ...ZERO_VEC2 };
    }
    const state = this.movementStates.get(this.activeMovementSource);
    if (!state || !state.active) {
      return { ...ZERO_VEC2 };
    }
    return { x: state.vector.x, y: state.vector.y };
  }
  getActiveMovementSource() {
    return this.activeMovementSource;
  }
  updateMovementOwner() {
    const ownerState = this.activeMovementSource !== null ? this.movementStates.get(this.activeMovementSource) : void 0;
    if (this.activeMovementSource !== null && (!ownerState || !ownerState.active)) {
      this.activeMovementSource = null;
    }
    if (this.activeMovementSource === null) {
      let bestSource = null;
      let bestTime = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
        const source = SOURCE_ORDER[i];
        const state = this.movementStates.get(source);
        if (state?.active && state.lastActiveAtMs > bestTime) {
          bestTime = state.lastActiveAtMs;
          bestSource = source;
        }
      }
      this.activeMovementSource = bestSource;
    }
  }
  updateActions(dtMs) {
    for (let i = 0; i < ALL_ACTIONS.length; i += 1) {
      const action = ALL_ACTIONS[i];
      const effective = this.isEffectiveHeld(action);
      const wasEffective = this.previousEffective.get(action) ?? false;
      if (effective) {
        if (!wasEffective) {
          this.emitEdge(action);
          this.initializeNavState(action, dtMs);
        }
        this.emitNavRepeats(action);
      } else if (wasEffective) {
        this.resetNavState(action);
      }
      this.previousEffective.set(action, effective);
    }
    this.reconcileActiveNavAction();
  }
  emitEdge(action) {
    const source = this.firstHoldingSource(action);
    this.edges.push({ action, source });
  }
  initializeNavState(action, dtMs) {
    if (!NAV_ACTIONS.includes(action)) {
      return;
    }
    if (this.activeNavAction !== null && this.activeNavAction !== action) {
      const prior = this.navStates.get(this.activeNavAction);
      if (prior) {
        prior.pressedAtMs = null;
        prior.repeatsEmitted = 0;
      }
    }
    const state = this.navStates.get(action);
    if (state) {
      state.pressedAtMs = this.timeMs - dtMs;
      state.repeatsEmitted = 0;
    }
    this.activeNavAction = action;
  }
  emitNavRepeats(action) {
    if (action !== this.activeNavAction) {
      return;
    }
    const state = this.navStates.get(action);
    if (!state || state.pressedAtMs === null) {
      return;
    }
    const elapsed = this.timeMs - state.pressedAtMs;
    if (elapsed < this.options.navRepeat.delayMs) {
      return;
    }
    const targetRepeats = Math.floor((elapsed - this.options.navRepeat.delayMs) / this.options.navRepeat.intervalMs) + 1;
    while (state.repeatsEmitted < targetRepeats) {
      this.emitEdge(action);
      state.repeatsEmitted += 1;
    }
  }
  resetNavState(action) {
    if (!NAV_ACTIONS.includes(action)) {
      return;
    }
    const state = this.navStates.get(action);
    if (state) {
      state.pressedAtMs = null;
      state.repeatsEmitted = 0;
    }
    if (this.activeNavAction === action) {
      this.activeNavAction = null;
    }
  }
  reconcileActiveNavAction() {
    if (this.activeNavAction !== null && this.isEffectiveHeld(this.activeNavAction)) {
      return;
    }
    let bestAction = null;
    let bestTime = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < NAV_ACTIONS.length; i += 1) {
      const action = NAV_ACTIONS[i];
      if (!this.isEffectiveHeld(action)) {
        continue;
      }
      const state = this.navStates.get(action);
      const pressedAt = state?.pressedAtMs ?? Number.NEGATIVE_INFINITY;
      if (bestAction === null || pressedAt > bestTime) {
        bestTime = pressedAt;
        bestAction = action;
      }
    }
    if (bestAction !== null) {
      const state = this.navStates.get(bestAction);
      if (state && state.pressedAtMs === null) {
        state.pressedAtMs = this.timeMs;
        state.repeatsEmitted = 0;
      }
    }
    this.activeNavAction = bestAction;
  }
  firstHoldingSource(action) {
    for (let i = 0; i < SOURCE_ORDER.length; i += 1) {
      if (this.held.get(SOURCE_ORDER[i])?.has(action)) {
        return SOURCE_ORDER[i];
      }
    }
    return SOURCE_ORDER[0];
  }
};

// src/systems/input.ts
var KEY_ACTION_MAP = {
  up: "navUp",
  down: "navDown",
  left: "navLeft",
  right: "navRight",
  enter: "confirm",
  space: "confirm",
  esc: "back",
  p: "pause",
  i: "inventory",
  q: "ability"
};
var ACTION_KEY_NAMES = (() => {
  const index = /* @__PURE__ */ new Map();
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
var ACTION_KEY_ENTRIES = Object.freeze(Array.from(ACTION_KEY_NAMES.entries()));
function pressed(key) {
  return key?.isDown ?? false;
}
var KeyboardAdapter = class {
  constructor(scene2, core) {
    this.core = core;
    this.keyboard = scene2.input.keyboard;
    if (!this.keyboard) {
      return;
    }
    const mapping = {
      w: phaserStub_default.Input.Keyboard.KeyCodes.W,
      a: phaserStub_default.Input.Keyboard.KeyCodes.A,
      s: phaserStub_default.Input.Keyboard.KeyCodes.S,
      d: phaserStub_default.Input.Keyboard.KeyCodes.D,
      up: phaserStub_default.Input.Keyboard.KeyCodes.UP,
      down: phaserStub_default.Input.Keyboard.KeyCodes.DOWN,
      left: phaserStub_default.Input.Keyboard.KeyCodes.LEFT,
      right: phaserStub_default.Input.Keyboard.KeyCodes.RIGHT,
      enter: phaserStub_default.Input.Keyboard.KeyCodes.ENTER,
      space: phaserStub_default.Input.Keyboard.KeyCodes.SPACE,
      esc: phaserStub_default.Input.Keyboard.KeyCodes.ESC,
      p: phaserStub_default.Input.Keyboard.KeyCodes.P,
      i: phaserStub_default.Input.Keyboard.KeyCodes.I,
      q: phaserStub_default.Input.Keyboard.KeyCodes.Q
    };
    this.keys = this.keyboard.addKeys(mapping);
  }
  core;
  keys = {};
  keyboard;
  update() {
    const x = (pressed(this.keys.d) || pressed(this.keys.right) ? 1 : 0) + (pressed(this.keys.a) || pressed(this.keys.left) ? -1 : 0);
    const y = (pressed(this.keys.s) || pressed(this.keys.down) ? 1 : 0) + (pressed(this.keys.w) || pressed(this.keys.up) ? -1 : 0);
    const diagonal = x !== 0 && y !== 0;
    this.core.setMovementSample(
      "keyboard",
      diagonal ? x * Math.SQRT1_2 : x,
      diagonal ? y * Math.SQRT1_2 : y,
      0
    );
    for (let i = 0; i < ACTION_KEY_ENTRIES.length; i += 1) {
      const [action, names] = ACTION_KEY_ENTRIES[i];
      let held = false;
      for (let j = 0; j < names.length; j += 1) {
        if (pressed(this.keys[names[j]])) {
          held = true;
          break;
        }
      }
      this.core.setActionHeld("keyboard", action, held);
    }
  }
  destroy() {
    for (const key of Object.values(this.keys)) {
      this.keyboard?.removeKey(key);
    }
  }
};
var PointerAdapter = class {
  constructor(scene2, core, radius, onPointerDown) {
    this.scene = scene2;
    this.core = core;
    this.radius = radius;
    this.onPointerDown = onPointerDown;
    this.scene.input.on("pointerdown", this.handlePointerDown, this);
    this.scene.input.on("pointermove", this.handlePointerMove, this);
    this.scene.input.on("pointerup", this.handlePointerUp, this);
    this.scene.input.on("pointerupoutside", this.handlePointerUp, this);
  }
  scene;
  core;
  radius;
  onPointerDown;
  pointerStart = null;
  pointerCurrent = null;
  pinnedPointerId = null;
  update() {
    if (!this.isActive() || !this.pointerStart || !this.pointerCurrent) {
      this.core.setMovementSample("pointer", 0, 0, 0);
      return;
    }
    let dx = this.pointerCurrent.x - this.pointerStart.x;
    let dy = this.pointerCurrent.y - this.pointerStart.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > this.radius) {
      const scale = this.radius / magnitude;
      dx *= scale;
      dy *= scale;
    }
    this.core.setMovementSample("pointer", dx / this.radius, dy / this.radius, 0);
  }
  destroy() {
    this.scene.input.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.input.off("pointerup", this.handlePointerUp, this);
    this.scene.input.off("pointerupoutside", this.handlePointerUp, this);
  }
  getPointerStart() {
    return this.pointerStart;
  }
  getPointerCurrent() {
    return this.pointerCurrent;
  }
  isActive() {
    return this.pinnedPointerId !== null;
  }
  handlePointerDown(pointer) {
    this.onPointerDown?.();
    if (this.isActive()) {
      return;
    }
    this.pinnedPointerId = pointer.id;
    this.pointerStart = pointerToVec2(pointer);
    this.pointerCurrent = pointerToVec2(pointer);
  }
  handlePointerMove(pointer) {
    if (pointer.id !== this.pinnedPointerId || !pointer.isDown) {
      return;
    }
    this.pointerCurrent = pointerToVec2(pointer);
  }
  handlePointerUp(pointer) {
    if (pointer.id !== this.pinnedPointerId) {
      return;
    }
    this.pinnedPointerId = null;
    this.pointerStart = null;
    this.pointerCurrent = null;
  }
};
var GAMEPAD_BUTTONS = {
  confirm: 0,
  // bottom face position
  back: 1,
  // right face position
  ability: 2,
  // left face position (reserved for Epic 24, D11)
  inventory: 3,
  // top face position
  pause: 9,
  // Menu position
  navUp: 12,
  navDown: 13,
  navLeft: 14,
  navRight: 15
};
var GAMEPAD_BUTTON_ENTRIES = Object.freeze(Object.entries(GAMEPAD_BUTTONS));
var ACTION_INDEX = (() => {
  const index = /* @__PURE__ */ new Map();
  ALL_ACTIONS.forEach((action, i) => index.set(action, i));
  return index;
})();
function isButtonDown(pad, index) {
  return pad.buttons[index]?.pressed === true;
}
var GamepadAdapter = class {
  constructor(scene2, core, deadzone, navThreshold) {
    this.core = core;
    this.deadzone = deadzone;
    this.navThreshold = navThreshold;
    this.gamepad = scene2.input.gamepad;
    this.gamepad?.on("connected", this.handleConnected, this);
    this.gamepad?.on("disconnected", this.handleDisconnected, this);
  }
  core;
  deadzone;
  navThreshold;
  // Preallocated held-state flags, swapped each frame — no Set iteration, no
  // per-frame allocation (Epic 19 §6 gate).
  currentHeld = new Array(ALL_ACTIONS.length).fill(false);
  previousHeld = new Array(ALL_ACTIONS.length).fill(false);
  gamepad;
  update() {
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
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navLeft)) current[ACTION_INDEX.get("navLeft")] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navRight)) current[ACTION_INDEX.get("navRight")] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navUp)) current[ACTION_INDEX.get("navUp")] = true;
        if (isButtonDown(pad, GAMEPAD_BUTTONS.navDown)) current[ACTION_INDEX.get("navDown")] = true;
        const stickMagnitude = Math.sqrt(stickX * stickX + stickY * stickY);
        if (stickMagnitude > this.navThreshold) {
          const dominantAxisX = Math.abs(stickX) >= Math.abs(stickY);
          if (dominantAxisX) {
            current[ACTION_INDEX.get(stickX > 0 ? "navRight" : "navLeft")] = true;
          } else {
            current[ACTION_INDEX.get(stickY > 0 ? "navDown" : "navUp")] = true;
          }
        }
        if (stickMagnitude > bestMagnitude) {
          bestMagnitude = stickMagnitude;
          bestX = stickX;
          bestY = stickY;
        }
        for (let e = 0; e < GAMEPAD_BUTTON_ENTRIES.length; e += 1) {
          const [action, index] = GAMEPAD_BUTTON_ENTRIES[e];
          if (isButtonDown(pad, index)) {
            current[ACTION_INDEX.get(action)] = true;
          }
        }
      }
    }
    const magnitude = Math.sqrt(bestX * bestX + bestY * bestY);
    if (magnitude > 1) {
      bestX /= magnitude;
      bestY /= magnitude;
    }
    this.core.setMovementSample("gamepad", bestX, bestY, this.deadzone);
    const previous = this.previousHeld;
    for (let i = 0; i < ALL_ACTIONS.length; i += 1) {
      const was = previous[i];
      const now = current[i];
      if (was !== now) {
        this.core.setActionHeld("gamepad", ALL_ACTIONS[i], now);
      }
    }
    for (let i = 0; i < previous.length; i += 1) {
      previous[i] = current[i];
    }
  }
  destroy() {
    this.gamepad?.off("connected", this.handleConnected, this);
    this.gamepad?.off("disconnected", this.handleDisconnected, this);
  }
  handleConnected() {
  }
  handleDisconnected() {
    this.core.clearSource("gamepad");
    for (let i = 0; i < this.previousHeld.length; i += 1) {
      this.previousHeld[i] = false;
    }
    for (let i = 0; i < this.currentHeld.length; i += 1) {
      this.currentHeld[i] = false;
    }
  }
};
var InputController = class {
  core;
  adapters;
  pointerAdapter;
  actionSubscriptions = /* @__PURE__ */ new Map();
  anyActionHandlers = /* @__PURE__ */ new Set();
  lastActiveMode = "pointer";
  constructor(scene2) {
    this.core = new LogicalInputCore({
      navRepeat: RuntimeConfig.gameplay.input.navRepeat
    });
    this.pointerAdapter = new PointerAdapter(
      scene2,
      this.core,
      RuntimeConfig.gameplay.input.touchStick.radius,
      () => {
        this.lastActiveMode = "pointer";
      }
    );
    this.adapters = [
      new KeyboardAdapter(scene2, this.core),
      this.pointerAdapter,
      new GamepadAdapter(
        scene2,
        this.core,
        RuntimeConfig.gameplay.input.gamepad.moveDeadzone,
        RuntimeConfig.gameplay.input.gamepad.navThreshold
      )
    ];
  }
  update(dtMs) {
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
      this.lastActiveMode = edge.source;
      const handlers = this.actionSubscriptions.get(edge.action);
      const actionHandlers = [...handlers ?? []];
      const anyHandlers = [...this.anyActionHandlers];
      for (let h = 0; h < actionHandlers.length; h += 1) {
        actionHandlers[h](edge);
      }
      for (let h = 0; h < anyHandlers.length; h += 1) {
        anyHandlers[h](edge);
      }
    }
  }
  onAction(action, handler) {
    const set = this.actionSubscriptions.get(action) ?? /* @__PURE__ */ new Set();
    set.add(handler);
    this.actionSubscriptions.set(action, set);
    return () => set.delete(handler);
  }
  onAnyAction(handler) {
    this.anyActionHandlers.add(handler);
    return () => this.anyActionHandlers.delete(handler);
  }
  getMoveVector() {
    const vector = this.core.getMovementVector();
    return { x: vector.x, y: vector.y };
  }
  getPointer() {
    const current = this.pointerAdapter.getPointerCurrent();
    return current ? { ...current } : null;
  }
  getPresentationSnapshot() {
    const mode = this.core.getActiveMovementSource() ?? this.lastActiveMode;
    const pointerStart = this.pointerAdapter.getPointerStart();
    const pointerCurrent = this.pointerAdapter.getPointerCurrent();
    const snapshot = {
      mode,
      pointerStart: pointerStart ? Object.freeze({ ...pointerStart }) : null,
      pointerCurrent: pointerCurrent ? Object.freeze({ ...pointerCurrent }) : null,
      moveVector: Object.freeze({ ...this.getMoveVector() })
    };
    return Object.freeze(snapshot);
  }
  destroy() {
    for (const adapter of this.adapters) {
      adapter.destroy();
    }
    this.actionSubscriptions.clear();
    this.anyActionHandlers.clear();
  }
};
function pointerToVec2(pointer) {
  return { x: pointer.x, y: pointer.y };
}

// tests/fixtures/allocProbe.entry.ts
var PROBE_POLLS = 2e5;
function makeInput() {
  const listeners = /* @__PURE__ */ new Map();
  const keyRecords2 = {};
  const input2 = {
    keyboard: {
      addKeys: (mapping) => {
        for (const name of Object.keys(mapping)) {
          keyRecords2[name] = { isDown: false };
        }
        return keyRecords2;
      },
      removeKey: () => {
      },
      off: () => {
      },
      keys: /* @__PURE__ */ new Map()
    },
    gamepad: {
      gamepads: [],
      on: () => {
      },
      off: () => {
      }
    },
    // Context-bound like the real Phaser event emitter: PointerAdapter
    // registers its handlers with `this` as the third argument.
    on: (event, handler, context) => {
      const list = listeners.get(event) ?? [];
      const wrapped = context !== void 0 ? handler.bind(context) : handler;
      list.push(wrapped);
      listeners.set(event, list);
    },
    off: () => {
    },
    once: () => {
    },
    emit: (event, ...args) => {
      for (const h of listeners.get(event) ?? []) {
        h(...args);
      }
    },
    activePointer: { x: 0, y: 0 },
    pointers: []
  };
  return { input: input2, keyRecords: keyRecords2 };
}
var canary = process.env.ALLOC_CANARY ?? "none";
var scenario = process.env.ALLOC_SCENARIO ?? "idle";
var { input, keyRecords } = makeInput();
var scene = { input };
var controller = new InputController(scene);
if (scenario === "keyboard-held") {
  keyRecords.d.isDown = true;
  keyRecords.s.isDown = true;
  keyRecords.enter.isDown = true;
} else if (scenario === "gamepad") {
  const buttons = [];
  for (let i = 0; i < 16; i += 1) {
    buttons.push({ pressed: i === 0 || i === 12 });
  }
  const pad = {
    connected: true,
    leftStick: { x: 0.8, y: 0.8 },
    axes: [{ value: 0.8 }, { value: 0.8 }],
    buttons
  };
  input.gamepad.gamepads[0] = pad;
} else if (scenario === "pointer") {
  const start = { id: 1, x: 10, y: 10, isDown: true };
  const current = { id: 1, x: 300, y: 200, isDown: true };
  input.emit("pointerdown", start);
  input.emit("pointermove", current);
} else if (scenario !== "idle") {
  throw new Error("unknown ALLOC_SCENARIO: " + scenario);
}
var seenEdges = [];
controller.onAnyAction((edge) => {
  seenEdges.push(edge.action);
});
for (let i = 0; i < 2e3; i += 1) {
  controller.update(0);
}
if (scenario === "keyboard-held") {
  controller.update(0);
  const move = controller.getMoveVector();
  if (move.x === 0 && move.y === 0) {
    throw new Error("liveness: keyboard-held scenario produced zero movement");
  }
  if (!seenEdges.includes("confirm")) {
    throw new Error("liveness: keyboard-held scenario produced no confirm edge");
  }
} else if (scenario === "gamepad") {
  controller.update(0);
  const move = controller.getMoveVector();
  if (move.x === 0 && move.y === 0) {
    throw new Error("liveness: gamepad scenario produced zero movement");
  }
  if (!seenEdges.some(
    (action) => action === "navUp" || action === "navDown" || action === "navLeft" || action === "navRight"
  )) {
    throw new Error("liveness: gamepad scenario produced no nav edge");
  }
} else if (scenario === "pointer") {
  controller.update(0);
  const move = controller.getMoveVector();
  if (move.x === 0 && move.y === 0) {
    throw new Error("liveness: pointer scenario produced zero movement");
  }
}
if (typeof gc === "function") {
  gc();
  gc();
}
var sink = [];
fs.writeSync(1, "PROBE-START canary=" + canary + " scenario=" + scenario + "\n");
for (let i = 0; i < PROBE_POLLS; i += 1) {
  controller.update(0);
  if (canary === "set") {
    sink.push(/* @__PURE__ */ new Set());
  } else if (canary === "array") {
    sink[0] = [0, 0, 0];
  } else if (canary === "object") {
    sink.push({ a: 1, b: 2 });
  }
  if (sink.length > 1e3) {
    sink.length = 0;
  }
}
fs.writeSync(1, "PROBE-DONE canary=" + canary + " scenario=" + scenario + "\n");
