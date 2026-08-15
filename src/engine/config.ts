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
  },
  performance: {
    targetFps: 60,
    sampleWindowFrames: 120,
    maxFeedbackEffects: 96,
    maxHeavyFeedbackEffects: 72,
    maxDefeatPresentations: 24,
  },
  storageKey: 'meowcenary.save.v1',
  isDev: import.meta.env.DEV,
} as const;
