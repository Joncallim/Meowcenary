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
  private destroyed = false;

  constructor(options: HazardSystemOptions) {
    this.hazards = options.hazards;
    this.runState = options.runState;
    this.bus = options.bus;
    this.player = options.player;
  }

  update(dtMs: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    if (this.runState.status !== 'active') return;
    if (this.hazards.length === 0) return;
    if (!this.player.active) return;

    const px = this.player.x;
    const py = this.player.y;

    for (const hazard of this.hazards) {
      if (this.runState.status !== 'active') break;

      const inHazard =
        px >= hazard.x && px <= hazard.x + hazard.w &&
        py >= hazard.y && py <= hazard.y + hazard.h;

      if (!inHazard) continue;

      const damage = hazard.damagePerSecond * dtMs / 1000;
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
  }
}