import Phaser from 'phaser';
import type { System } from '../engine/system';

export class AudioManager implements System {
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

  update(_dtMs: number): void {
    // Audio has no per-frame work in Epic 0.
  }

  destroy(): void {
    this.scene.sound.stopAll();
  }
}
