export const SceneKey = {
  Boot: 'BootScene',
  Game: 'GameScene',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

