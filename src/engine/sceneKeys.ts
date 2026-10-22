export const SceneKey = {
  Boot: 'BootScene',
  Menu: 'MenuScene',
  Game: 'GameScene',
  IntegratedFixture: 'IntegratedFixtureScene',
  LateFixture: 'LateFixtureScene',
  LateRange: 'LateRangeScene',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

