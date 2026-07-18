import type { System } from '../engine/system';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import type { Player } from '../entities/Player';
import type { HazardDefinition } from './types';

export interface HazardSystemOptions {
  readonly scene: Phaser.Scene;
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly player: Player;
  readonly hazards: readonly HazardDefinition[];
}

export class HazardSystem implements System {
  private readonly hazards: readonly HazardDefinition[];
  private readonly runState: RunState;
  private readonly bus: EventBus;
  private readonly player: Player;
  private readonly visuals: Phaser.GameObjects.Rectangle[] = [];
  private destroyed = false;

  constructor(options: HazardSystemOptions) {
    this.hazards = options.hazards;
    this.runState = options.runState;
    this.bus = options.bus;
    this.player = options.player;

    if (options.scene.add && options.hazards.length > 0) {
      for (const h of options.hazards) {
        const rect = options.scene.add.rectangle(
          h.x + h.w / 2, h.y + h.h / 2, h.w, h.h,
          0xff4444,
          0.18,
        ).setDepth(0);
        this.visuals.push(rect);
      }
    }
  }

  update(dtMs: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    if (this.runState.status !== 'active') return;
    if (this.hazards.length === 0) return;
    if (!this.player.active) return;

    const px = this.player.x;
    const py = this.player.y;
    const r = this.player.bodyRadius;

    for (const hazard of this.hazards) {
      if (this.runState.status !== 'active') break;

      const inHazard =
        px + r >= hazard.x && px - r <= hazard.x + hazard.w &&
        py + r >= hazard.y && py - r <= hazard.y + hazard.h;

      if (!inHazard) continue;

      const damage = hazard.damagePerSecond * dtMs / 1000;
      if (!Number.isFinite(damage) || damage <= 0) continue;
      this.player.takeEnvironmentalDamage(damage);
      this.bus.emit('hazard:triggered', {
        hazardId: hazard.id,
        damage,
        x: px,
        y: py,
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const rect of this.visuals) {
      rect.destroy();
    }
    this.visuals.length = 0;
  }
}