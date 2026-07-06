import Phaser from 'phaser';

export class AudioManager {
  private muted = false;
  private volume = 1;

  constructor(private readonly scene: Phaser.Scene) {}

  play(key: string): void {
    if (this.muted || !this.scene.cache.audio.exists(key)) {
      return;
    }

    this.scene.sound.play(key, { volume: this.volume });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  destroy(): void {
    this.scene.sound.stopAll();
  }
}

