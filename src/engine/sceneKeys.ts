export const SceneKey = {
  Boot: 'BootScene',
  Menu: 'MenuScene',
  Game: 'GameScene',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

