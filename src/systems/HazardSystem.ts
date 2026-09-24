import type { System } from '../engine/system';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import type { Player } from '../entities/Player';
import type { HazardDefinition } from './types';
import type { ArenaHazardSkinDefinition } from './types';
import type { VisualArtLookup } from './visualArt';
import { VisualDepth } from './visualDepths';

export interface HazardSystemOptions {
  readonly scene: Phaser.Scene;
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly player: Player;
  readonly hazards: readonly HazardDefinition[];
  readonly hazardSkins?: readonly ArenaHazardSkinDefinition[];
  readonly visualArt?: VisualArtLookup;
}

export class HazardSystem implements System {
  private readonly hazards: readonly HazardDefinition[];
  private readonly runState: RunState;
  private readonly bus: EventBus;
  private readonly player: Player;
  private readonly visuals: Phaser.GameObjects.GameObject[] = [];
  private destroyed = false;

  constructor(options: HazardSystemOptions) {
    this.hazards = options.hazards;
    this.runState = options.runState;
    this.bus = options.bus;
    this.player = options.player;

    if (options.scene.add && options.hazards.length > 0 && options.visualArt) {
      const skins = new Map((options.hazardSkins ?? []).map((skin) => [skin.hazardId, skin]));
      for (const h of options.hazards) {
        const skin = skins.get(h.id);
        const binding = skin && options.visualArt.bindingById(skin.artId);
        if (!skin || !binding || binding.kind !== 'world' || !options.scene.textures.exists(binding.textureKey)) {
          throw new Error(`Hazard "${h.id}" cannot start without its loaded world skin`);
        }
        const tile = options.scene.add.tileSprite(
          h.x + h.w / 2,
          h.y + h.h / 2,
          h.w,
          h.h,
          binding.textureKey,
          binding.frameKey,
        ).setDepth(VisualDepth.groundDecoration);
        this.visuals.push(tile);
      }
    } else if (options.scene.add && options.hazards.length > 0) {
      // Headless/legacy geometry diagnostics do not supply the production art
      // registry. Keep their non-authoritative visual fallback isolated here.
      for (const h of options.hazards) {
        const rect = options.scene.add.rectangle(
          h.x + h.w / 2, h.y + h.h / 2, h.w, h.h, 0xff4444, 0.18,
        ).setDepth(VisualDepth.groundDecoration);
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

      // Circle-rect intersection: clamp centre to rect, compare squared distance
      const closestX = Math.max(hazard.x, Math.min(px, hazard.x + hazard.w));
      const closestY = Math.max(hazard.y, Math.min(py, hazard.y + hazard.h));
      const dx = px - closestX;
      const dy = py - closestY;
      const inHazard = dx * dx + dy * dy < r * r;

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
