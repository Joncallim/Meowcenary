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
  },
  storageKey: 'meowcenary.save.v1',
  isDev: import.meta.env.DEV,
} as const;
