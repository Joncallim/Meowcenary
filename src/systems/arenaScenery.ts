import Phaser from 'phaser';
import type { ArenaDefinition, EdgeSpawnLane, VisualArtBinding } from './types';
import type { VisualArtLookup } from './visualArt';
import { VisualDepth } from './visualDepths';

const TILE_SIZE = 32;

export interface ArenaScenery {
  readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup;
  destroy(): void;
}

/** Render-state evidence for the data-authored arena. This is deliberately
 * presentation-only: it is useful to scene diagnostics and integration tests
 * without making scenery a second source of physics truth. */
export interface ArenaPresentationNode {
  readonly role: 'floor' | 'boundary' | 'decoration' | 'obstacle-skin';
  readonly artId: string;
  readonly textureKey: string;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly visible: boolean;
  readonly active: boolean;
}

export interface ArenaPresentationInspection {
  readonly nodes: readonly ArenaPresentationNode[];
  readonly floorNodeCount: number;
  readonly boundaryNodeCount: number;
  readonly decorationNodeCount: number;
  readonly obstacleSkinNodeCount: number;
}

/** Data-authored world presentation. Collision rectangles remain the sole
 * physics authority; floor, boundary, decorations, and skins are display-only. */
export class ArenaWorldView implements ArenaScenery {
  readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup;
  private readonly nodes: Phaser.GameObjects.GameObject[] = [];
  private readonly presentationNodes: ArenaPresentationNode[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arena: Readonly<ArenaDefinition>,
    private readonly visualArt?: VisualArtLookup,
  ) {
    this.obstacleGroup = scene.physics.add.staticGroup();
    // GameScene always provides the validated visual registry. Do this before
    // creating a single body: a collidable landmark without its readable skin
    // is a release-blocking resource failure, never a playable fallback.
    if (this.visualArt) this.assertRequiredVisualsAvailable();
    this.buildFloor();
    this.buildBoundary();
    this.buildDecorations();
    this.buildObstacles();
    // The no-registry call path is intentionally retained for headless
    // physics diagnostics. Production GameScene always supplies the registry.
    if (this.visualArt) this.assertPresentationReady();
  }

  destroy(): void {
    for (const node of this.nodes) node.destroy();
    this.nodes.length = 0;
    this.presentationNodes.length = 0;
    this.obstacleGroup.destroy(true);
  }

  /** Narrow diagnostic surface: proves that the actual images made by this
   * production world builder are live, rather than merely that their files
   * were requested or their texture keys exist. */
  presentationInspection(): ArenaPresentationInspection {
    const nodes = this.presentationNodes.map((node) => Object.freeze({ ...node }));
    return Object.freeze({
      nodes: Object.freeze(nodes),
      floorNodeCount: nodes.filter((node) => node.role === 'floor').length,
      boundaryNodeCount: nodes.filter((node) => node.role === 'boundary').length,
      decorationNodeCount: nodes.filter((node) => node.role === 'decoration').length,
      obstacleSkinNodeCount: nodes.filter((node) => node.role === 'obstacle-skin').length,
    });
  }

  private binding(artId: string): Readonly<VisualArtBinding> | undefined {
    const binding = this.visualArt?.bindingById(artId);
    return binding?.kind === 'world' && this.scene.textures.exists(binding.textureKey)
      ? binding
      : undefined;
  }

  private assertRequiredVisualsAvailable(): void {
    const ids = new Set<string>([
      ...this.arena.visual.floorArtIds,
      ...Object.values(this.arena.visual.boundary),
      ...this.arena.visual.decorations.map((decoration) => decoration.artId),
      ...this.arena.visual.obstacleSkins.map((skin) => skin.artId),
    ]);
    const missing = [...ids].filter((id) => this.binding(id) === undefined);
    if (missing.length > 0) {
      throw new Error(`Arena "${this.arena.id}" cannot start: required world visuals are unavailable (${missing.join(', ')})`);
    }
  }

  private addImage(
    role: ArenaPresentationNode['role'],
    artId: string,
    x: number,
    y: number,
    depth: number,
    rotation = 0,
    flipX = false,
  ): Phaser.GameObjects.Image | undefined {
    const binding = this.binding(artId);
    if (!binding) return undefined;
    const image = this.scene.add.image(x, y, binding.textureKey, binding.frameKey)
      .setDisplaySize(binding.display.width, binding.display.height)
      .setDepth(depth)
      .setRotation(rotation)
      .setFlipX(flipX)
      // Be explicit at this production boundary. Phaser defaults to both,
      // but an image whose creation state is ever changed by a plugin must
      // fail the run rather than silently turning scenery into dark physics.
      .setVisible(true)
      .setActive(true);
    this.nodes.push(image);
    this.presentationNodes.push({
      role,
      artId,
      textureKey: binding.textureKey,
      x,
      y,
      depth,
      visible: image.visible,
      active: image.active,
    });
    return image;
  }

  private assertPresentationReady(): void {
    const inspection = this.presentationInspection();
    const expectedFloorNodes = Math.ceil(this.arena.size.width / TILE_SIZE) * Math.ceil(this.arena.size.height / TILE_SIZE);
    if (inspection.floorNodeCount !== expectedFloorNodes || inspection.boundaryNodeCount === 0 || inspection.decorationNodeCount !== this.arena.visual.decorations.length || inspection.obstacleSkinNodeCount !== this.arena.obstacles.length) {
      throw new Error(`Arena "${this.arena.id}" world presentation is incomplete`);
    }
    const inactive = inspection.nodes.filter((node) => !node.visible || !node.active);
    if (inactive.length > 0) {
      throw new Error(`Arena "${this.arena.id}" world presentation has inactive nodes (${inactive.map((node) => node.artId).join(', ')})`);
    }
  }

  private buildFloor(): void {
    const ids = this.arena.visual.floorArtIds;
    const rows = Math.ceil(this.arena.size.height / TILE_SIZE);
    const columns = Math.ceil(this.arena.size.width / TILE_SIZE);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const artId = ids[(column * 31 + row * 17) % ids.length]!;
        this.addImage(
          'floor', artId,
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
    this.addImage('boundary', artId, x, y, VisualDepth.boundary, rotation, flipX);
  }

  private buildDecorations(): void {
    for (const decoration of this.arena.visual.decorations) {
      this.addImage(
        'decoration', decoration.artId,
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
      const skin = skins.get(obstacle.id);
      if (this.visualArt && !skin) {
        throw new Error(`Arena "${this.arena.id}" obstacle "${obstacle.id}" has no collision-readable skin`);
      }
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

      const image = skin && this.addImage(
        'obstacle-skin', skin.artId,
        obstacle.x + obstacle.w / 2 + (skin.offsetX ?? 0),
        obstacle.y + obstacle.h / 2 + (skin.offsetY ?? 0),
        VisualDepth.obstacle,
      );
      // The no-registry path exists solely for headless geometry diagnostics.
      // In an actual run this was preflighted above; keep this local guard so
      // future call sites cannot reintroduce invisible colliders.
      if (this.visualArt && !image) {
        rect.destroy();
        throw new Error(`Arena "${this.arena.id}" obstacle "${obstacle.id}" has no loaded collision-readable skin`);
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
