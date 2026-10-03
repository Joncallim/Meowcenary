import type Phaser from 'phaser';

/** One display mount, with commands revoked before its objects are destroyed.
 * A panel instance can retain semantic UI state across unmount/remount. */
export class MenuSurfaceMount {
  private generation = 0;
  private disposed = false;
  private mountedRoot?: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {}

  get root(): Phaser.GameObjects.Container | undefined { return this.mountedRoot; }

  present(parent: Phaser.GameObjects.Container, draw: (root: Phaser.GameObjects.Container) => void): void {
    if (this.disposed) throw new Error('Cannot present a disposed Menu surface');
    this.unmount();
    const root = this.scene.add.container(0, 0);
    // Adopt before drawing: partial construction is already owned on failure.
    this.mountedRoot = root;
    try {
      parent.add(root);
      root.setScrollFactor(0);
      draw(root);
    } catch (error) {
      this.unmount();
      throw error;
    }
  }

  guardedCommand(action: () => void): () => void {
    const generation = this.generation;
    return () => {
      if (!this.disposed && this.mountedRoot && generation === this.generation) action();
    };
  }

  unmount(): void {
    this.generation += 1;
    const root = this.mountedRoot;
    this.mountedRoot = undefined;
    root?.destroy(true);
  }

  dispose(): void {
    this.unmount();
    this.disposed = true;
  }
}
