export const SceneKey = {
  Boot: 'BootScene',
  Menu: 'MenuScene',
  Game: 'GameScene',
  IntegratedFixture: 'IntegratedFixtureScene',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

