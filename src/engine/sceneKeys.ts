export const SceneKey = {
  Boot: 'BootScene',
  Menu: 'MenuScene',
  Game: 'GameScene',
  IntegratedFixture: 'IntegratedFixtureScene',
  LateFixture: 'LateFixtureScene',
  LateRange: 'LateRangeScene',
  JunctionSlice: 'JunctionSliceScene',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

