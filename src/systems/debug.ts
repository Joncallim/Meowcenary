import Phaser from 'phaser';

export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(8, 8, '', {
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        color: '#d9f99d',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: { x: 6, y: 4 },
      })
      .setDepth(10_000)
      .setScrollFactor(0)
      .setVisible(false);

    scene.input.keyboard?.on('keydown-F3', this.toggle, this);
  }

  update(lines: readonly string[] = []): void {
    if (!this.visible) {
      return;
    }

    const fps = Math.round(this.scene.game.loop.actualFps);
    this.text.setText(['Meowcenary Debug', `FPS: ${fps}`, ...lines].join('\n'));
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-F3', this.toggle, this);
    this.text.destroy();
  }

  private toggle(): void {
    this.visible = !this.visible;
    this.text.setVisible(this.visible);
  }
}

