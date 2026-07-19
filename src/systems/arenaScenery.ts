import type { ArenaDefinition } from './types';

export interface ArenaScenery {
  readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup;
  destroy(): void;
}

export function buildArenaScenery(
  scene: Phaser.Scene,
  arena: Readonly<ArenaDefinition>,
): ArenaScenery {
  const obstacleGroup = scene.physics.add.staticGroup();
  for (const o of arena.obstacles) {
    const rect = scene.add.rectangle(
      o.x + o.w / 2,
      o.y + o.h / 2,
      o.w,
      o.h,
      0x2a3642,
    )
      .setStrokeStyle(1, 0x3b4b5a, 0.6)
      .setDepth(1);
    scene.physics.add.existing(rect, true);
    obstacleGroup.add(rect);
  }
  return { obstacleGroup, destroy: () => obstacleGroup.destroy(true) };
}