import type Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';

/** Bounded, gameplay-inert geometry feedback for authoritative ability facts. */
export class AbilityPresentationSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly stop: Array<() => void> = [];
  private readonly live = new Map<string, { cue: string; color: number; radius: number; remaining: number; x: number; y: number; transient: boolean; rendered: boolean }>();

  constructor(scene: Phaser.Scene, bus: EventBus, private readonly player: { x: number; y: number }) {
    this.graphics = scene.add.graphics().setDepth(90);
    this.stop.push(bus.on('ability:activated', (event) => {
      const color = Number.parseInt(event.color.slice(1), 16);
      // One live effect per ability is a hard allocation bound; graphics is reused.
      const transient = event.cue === 'shockwave' || event.cue === 'heat-ring' || event.cue === 'loot-pulse' || event.cue === 'heal-burst';
      this.live.set(event.abilityId, { cue: event.cue, color: Number.isFinite(color) ? color : 0xffffff,
        radius: event.radius ?? 36, remaining: event.durationMs, x: event.x, y: event.y, transient, rendered: false });
    }));
    this.stop.push(bus.on('ability:ended', (event) => {
      const effect = this.live.get(event.abilityId);
      if (effect && !effect.transient) this.live.delete(event.abilityId);
    }));
  }

  update(deltaMs: number, reducedMotion: boolean): void {
    this.graphics.clear();
    for (const [id, effect] of this.live) {
      if (effect.transient && effect.rendered && effect.remaining <= 0) {
        this.live.delete(id);
        continue;
      }
      const t = reducedMotion ? 0.65 : Math.min(1, Math.max(0, effect.remaining) / 400);
      const radius = effect.transient
        ? effect.radius * (reducedMotion ? 0.75 : 1.2 - t * 0.35) : effect.radius;
      const x = effect.transient ? effect.x : this.player.x;
      const y = effect.transient ? effect.y : this.player.y;
      this.graphics.lineStyle(2, effect.color, reducedMotion ? 0.9 : 0.45 + t * 0.4);
      this.graphics.strokeCircle(x, y, radius);
      // Non-colour shape cue: shield/precision use a second inner ring, while
      // instantaneous bursts remain expanding rings.
      if (effect.cue === 'shield-aura' || effect.cue === 'precision-mark') this.graphics.strokeCircle(x, y, radius * 0.65);
      if (effect.transient) {
        effect.rendered = true;
        effect.remaining -= deltaMs;
      }
    }
  }

  destroy(): void { this.stop.splice(0).forEach((stop) => stop()); this.live.clear(); this.graphics.destroy(); }
}
