export type TouchStickMode = 'floating' | 'anchored';

export interface AnchoredTouchStickConfig {
  readonly centerX: number;
  readonly centerY: number;
  readonly activationRadius: number;
}

export interface TouchStickConfig {
  readonly radius: number;
  readonly mode: TouchStickMode;
  readonly anchored: AnchoredTouchStickConfig;
}

const TOUCH_STICK_CONFIG: TouchStickConfig = {
  radius: 64,
  mode: 'floating',
  anchored: { centerX: 82, centerY: 700, activationRadius: 120 },
};

/** Validates the config boundary once, before input listeners attach. */
export function assertTouchStickConfig(config: TouchStickConfig): void {
  if (!Number.isFinite(config.radius) || config.radius <= 0) {
    throw new Error('touchStick.radius must be a finite number greater than zero');
  }
  if (config.mode !== 'floating' && config.mode !== 'anchored') {
    throw new Error('touchStick.mode must be floating or anchored');
  }
  if (!Number.isFinite(config.anchored.centerX) || !Number.isFinite(config.anchored.centerY)) {
    throw new Error('touchStick.anchored center must be finite');
  }
  if (!Number.isFinite(config.anchored.activationRadius) || config.anchored.activationRadius <= 0) {
    throw new Error('touchStick.anchored.activationRadius must be a finite number greater than zero');
  }
}

export const RuntimeConfig = {
  canvas: { width: 390, height: 844 },
  gameplay: {
    player: {
      baseMaxHealth: 100,
      baseMoveSpeed: 175,
      invulnerabilityMs: 650,
      pickupRadius: 30,
    },
    projectile: {
      radius: 4,
    },
    drop: {
      radius: 8,
      magnetSpeed: 450,
    },
    // Epic 14 §D11: temporary reward scheduling frozen to make the functional
    // loop testable now. Epic 18 owns the final economy/pacing balance.
    weaponRewards: {
      firstMinMs: 20_000,
      firstMaxMs: 40_000,
      repeatMinMs: 30_000,
      repeatMaxMs: 45_000,
      spawnOffset: 64,
    },
    // Epic 18 (D2): four choices is the Alpha 2 default; UpgradeSystem
    // validates any explicitly supplied offerCount as a safe integer 1..5.
    upgrades: {
      offerCount: 4,
    },
    // Epic 19: shared input tuning. Touch stick mode is confirmed floating
    // (anchored is a dev-only diagnostic); gamepad deadzone/nav threshold and
    // nav auto-repeat values are initial defaults tuned only with recorded
    // evidence. Dash is reserved for the Slice 4 movement-agency evidence gate.
    input: {
      touchStick: TOUCH_STICK_CONFIG,
      gamepad: { moveDeadzone: 0.25, navThreshold: 0.5 },
      navRepeat: { delayMs: 400, intervalMs: 150 },
    },
  },
  performance: {
    targetFps: 60,
    sampleWindowFrames: 120,
    maxFeedbackEffects: 96,
    maxHeavyFeedbackEffects: 72,
    maxDefeatPresentations: 24,
  },
  storageKey: 'meowcenary.save.v2',
  isDev: import.meta.env.DEV,
} as const;
