import Phaser from 'phaser';
import type { ArenaDefinition, EdgeSpawnLane, VisualArtBinding } from './types';
import type { VisualArtLookup } from './visualArt';
import { VisualDepth } from './visualDepths';

const TILE_SIZE = 32;

export interface ArenaScenery {
  readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup;
  destroy(): void;
}

/** Data-authored world presentation. Collision rectangles remain the sole
 * physics authority; floor, boundary, decorations, and skins are display-only. */
export class ArenaWorldView implements ArenaScenery {
  readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup;
  private readonly nodes: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arena: Readonly<ArenaDefinition>,
    private readonly visualArt?: VisualArtLookup,
  ) {
    this.obstacleGroup = scene.physics.add.staticGroup();
    this.buildFloor();
    this.buildBoundary();
    this.buildDecorations();
    this.buildObstacles();
  }

  destroy(): void {
    for (const node of this.nodes) node.destroy();
    this.nodes.length = 0;
    this.obstacleGroup.destroy(true);
  }

  private binding(artId: string): Readonly<VisualArtBinding> | undefined {
    const binding = this.visualArt?.bindingById(artId);
    return binding?.kind === 'world' && this.scene.textures.exists(binding.textureKey)
      ? binding
      : undefined;
  }

  private addImage(
    artId: string,
    x: number,
    y: number,
    depth: number,
    rotation = 0,
    flipX = false,
  ): Phaser.GameObjects.Image | undefined {
    const binding = this.binding(artId);
    if (!binding) return undefined;
    const image = this.scene.add.image(x, y, binding.textureKey)
      .setDisplaySize(binding.display.width, binding.display.height)
      .setDepth(depth)
      .setRotation(rotation)
      .setFlipX(flipX);
    this.nodes.push(image);
    return image;
  }

  private buildFloor(): void {
    const ids = this.arena.visual.floorArtIds;
    const rows = Math.ceil(this.arena.size.height / TILE_SIZE);
    const columns = Math.ceil(this.arena.size.width / TILE_SIZE);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const artId = ids[(column * 31 + row * 17) % ids.length]!;
        this.addImage(
          artId,
          column * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          VisualDepth.floor,
        );
      }
    }
  }

  private buildBoundary(): void {
    const edgeLanes = this.arena.spawnRegions.find((region) => region.kind === 'edge-lanes');
    const lanes = edgeLanes?.kind === 'edge-lanes' ? edgeLanes.lanes : [];
    const columns = Math.ceil(this.arena.size.width / TILE_SIZE);
    const rows = Math.ceil(this.arena.size.height / TILE_SIZE);
    for (let column = 0; column < columns; column += 1) {
      this.addBoundaryTile('top', column, columns, column * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2, lanes);
      this.addBoundaryTile('bottom', column, columns, column * TILE_SIZE + TILE_SIZE / 2, this.arena.size.height - TILE_SIZE / 2, lanes);
    }
    for (let row = 1; row < rows - 1; row += 1) {
      this.addBoundaryTile('left', row, columns, TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, lanes);
      this.addBoundaryTile('right', row, columns, this.arena.size.width - TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, lanes);
    }
  }

  private addBoundaryTile(
    side: EdgeSpawnLane['side'],
    index: number,
    columnCount: number,
    x: number,
    y: number,
    lanes: readonly EdgeSpawnLane[],
  ): void {
    const coordinate = side === 'top' || side === 'bottom' ? x : y;
    const lane = lanes.find((candidate) =>
      candidate.side === side && coordinate >= candidate.offset && coordinate < candidate.offset + candidate.width);
    const terminal = side === 'top' || side === 'bottom'
      ? index === 0 || index === columnCount - 1
      : false;
    const boundary = this.arena.visual.boundary;
    const artId = lane
      ? boundary.gateArtId
      : terminal
        ? boundary.cornerArtId
        : (index * 7 + (side === 'bottom' || side === 'right' ? 3 : 0)) % 11 === 0
          ? boundary.patchArtId
          : boundary.straightArtId;
    const rotation = side === 'right' ? Math.PI / 2
      : side === 'bottom' ? Math.PI
        : side === 'left' ? -Math.PI / 2
          : 0;
    // The corner art is an asymmetric top-left corner (wall trim on top, accent
    // post on the left). Rotation alone reaches the diagonally opposite corner
    // (bottom-right); the other two need an additional horizontal flip so the
    // accent post lands against the correct wall.
    const flipX = terminal && (side === 'bottom') !== (index === columnCount - 1);
    this.addImage(artId, x, y, VisualDepth.boundary, rotation, flipX);
  }

  private buildDecorations(): void {
    for (const decoration of this.arena.visual.decorations) {
      this.addImage(
        decoration.artId,
        decoration.x,
        decoration.y,
        decoration.layer === 'ground' ? VisualDepth.groundDecoration : VisualDepth.lowDecoration,
        0,
        decoration.flipX ?? false,
      );
    }
  }

  private buildObstacles(): void {
    const skins = new Map(this.arena.visual.obstacleSkins.map((skin) => [skin.obstacleId, skin]));
    for (const obstacle of this.arena.obstacles) {
      const rect = this.scene.add.rectangle(
        obstacle.x + obstacle.w / 2,
        obstacle.y + obstacle.h / 2,
        obstacle.w,
        obstacle.h,
        0x000000,
        0,
      ).setVisible(false);
      this.scene.physics.add.existing(rect, true);
      this.obstacleGroup.add(rect);

      const skin = skins.get(obstacle.id);
      if (skin) {
        this.addImage(
          skin.artId,
          obstacle.x + obstacle.w / 2 + (skin.offsetX ?? 0),
          obstacle.y + obstacle.h / 2 + (skin.offsetY ?? 0),
          VisualDepth.obstacle,
        );
      }
    }
  }
}

export function buildArenaScenery(
  scene: Phaser.Scene,
  arena: Readonly<ArenaDefinition>,
  visualArt?: VisualArtLookup,
): ArenaScenery {
  return new ArenaWorldView(scene, arena, visualArt);
}
