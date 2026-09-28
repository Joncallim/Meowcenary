import type Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';

interface LiveAbilityEffect {
  cue: string;
  color: number;
  radius: number;
  remaining: number;
  elapsed: number;
  x: number;
  y: number;
  transient: boolean;
  rendered: boolean;
}

/** Bounded, gameplay-inert workshop-pixel feedback for authoritative ability facts. */
export class AbilityPresentationSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly stop: Array<() => void> = [];
  private readonly live = new Map<string, LiveAbilityEffect>();

  constructor(scene: Phaser.Scene, bus: EventBus, private readonly player: { x: number; y: number }) {
    this.graphics = scene.add.graphics().setDepth(90);
    this.stop.push(bus.on('ability:activated', (event) => {
      const color = Number.parseInt(event.color.slice(1), 16);
      // One live effect per ability is a hard allocation bound; one Graphics
      // object is cleared and redrawn rather than spawning transient objects.
      const transient = event.cue === 'shockwave' || event.cue === 'heat-ring'
        || event.cue === 'loot-pulse' || event.cue === 'heal-burst';
      this.live.set(event.abilityId, {
        cue: event.cue,
        color: Number.isFinite(color) ? color : 0xffffff,
        radius: event.radius ?? 36,
        // Instant gameplay abilities still need enough presentation time to
        // read as an authored action rather than a single-frame debug ring.
        remaining: transient ? Math.max(280, event.durationMs) : event.durationMs,
        elapsed: 0,
        x: event.x,
        y: event.y,
        transient,
        rendered: false,
      });
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
      const life = reducedMotion ? 0.7 : Math.min(1, effect.elapsed / 260);
      const pulse = reducedMotion ? 0 : Math.sin(effect.elapsed / 90) * 0.08;
      const radius = effect.transient
        ? effect.radius * (reducedMotion ? 0.78 : 0.58 + life * 0.62)
        : effect.radius * (1 + pulse);
      const x = effect.transient ? effect.x : this.player.x;
      const y = effect.transient ? effect.y : this.player.y;
      const strongAlpha = reducedMotion ? 0.95 : effect.transient ? 0.92 - life * 0.24 : 0.78;
      const softAlpha = reducedMotion ? 0.16 : effect.transient ? 0.2 - life * 0.08 : 0.12;

      this.graphics.fillStyle(effect.color, softAlpha);
      this.graphics.fillCircle(x, y, Math.max(5, radius * 0.34));
      this.graphics.fillStyle(effect.color, Math.min(0.82, strongAlpha));
      this.drawAccentFills(effect.cue, x, y, radius, reducedMotion);
      this.graphics.lineStyle(3, 0x0a0f14, Math.min(0.8, strongAlpha));
      this.drawCue(effect.cue, x + 1, y + 1, radius, reducedMotion);
      this.graphics.lineStyle(2, effect.color, strongAlpha);
      this.drawCue(effect.cue, x, y, radius, reducedMotion);
      this.graphics.lineStyle(1, this.mixWithWhite(effect.color), Math.min(0.92, strongAlpha));
      this.drawHighlights(effect.cue, x, y, radius);

      effect.rendered = true;
      if (deltaMs > 0) {
        effect.elapsed += deltaMs;
        if (effect.transient) effect.remaining -= deltaMs;
      }
    }
  }

  private drawAccentFills(cue: string, x: number, y: number, radius: number, reducedMotion: boolean): void {
    const count = reducedMotion ? 4 : 8;
    if (cue === 'shockwave' || cue === 'heat-ring') {
      for (let index = 0; index < count; index += 1) {
        // Shock shards sit between the outlined radial ticks, creating a
        // legible burst instead of four accidental X-shaped markers.
        const angle = index * Math.PI * 2 / count;
        const tangentX = Math.cos(angle + Math.PI / 2) * radius * 0.09;
        const tangentY = Math.sin(angle + Math.PI / 2) * radius * 0.09;
        const baseX = x + Math.cos(angle) * radius * 0.9;
        const baseY = y + Math.sin(angle) * radius * 0.9;
        const length = cue === 'heat-ring' ? 1.22 : 1.12;
        this.graphics.fillTriangle(
          baseX - tangentX, baseY - tangentY,
          x + Math.cos(angle) * radius * length, y + Math.sin(angle) * radius * length,
          baseX + tangentX, baseY + tangentY,
        );
      }
      return;
    }
    if (cue === 'loot-pulse' || cue === 'heal-burst' || cue === 'shield-aura' || cue === 'overclock-aura') {
      const nodes = cue === 'shield-aura' ? 6 : cue === 'overclock-aura' ? 8 : 4;
      for (let index = 0; index < nodes; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / nodes;
        this.graphics.fillCircle(
          x + Math.cos(angle) * radius * 0.82,
          y + Math.sin(angle) * radius * 0.82,
          Math.max(2, radius * (cue === 'loot-pulse' ? 0.08 : 0.06)),
        );
      }
      return;
    }
    if (cue === 'speed-trail') {
      this.graphics.fillTriangle(x + radius * 0.88, y, x + radius * 0.42, y - radius * 0.24,
        x + radius * 0.42, y + radius * 0.24);
    } else if (cue === 'precision-mark') {
      this.graphics.fillCircle(x, y, Math.max(2, radius * 0.1));
    }
  }

  private drawCue(cue: string, x: number, y: number, radius: number, reducedMotion: boolean): void {
    switch (cue) {
      case 'shockwave':
        this.graphics.strokeCircle(x, y, radius);
        this.graphics.strokeCircle(x, y, radius * 0.72);
        this.drawRadialTicks(x, y, radius * 0.8, radius * 1.12, 4, Math.PI / 4);
        break;
      case 'heat-ring':
        this.graphics.strokeCircle(x, y, radius);
        this.drawHeatTongues(x, y, radius, reducedMotion ? 4 : 8);
        break;
      case 'loot-pulse':
        this.graphics.strokeCircle(x, y, radius);
        this.graphics.strokeCircle(x, y, radius * 0.82);
        this.drawInwardChevron(x - radius, y, x - radius * 0.45, y, radius * 0.12);
        this.drawInwardChevron(x + radius, y, x + radius * 0.45, y, radius * 0.12);
        this.drawInwardChevron(x, y - radius, x, y - radius * 0.45, radius * 0.12);
        this.drawInwardChevron(x, y + radius, x, y + radius * 0.45, radius * 0.12);
        break;
      case 'heal-burst':
        this.graphics.strokeCircle(x, y, radius);
        this.drawRepairSpark(x, y - radius * 0.62, radius * 0.16);
        this.drawRepairSpark(x + radius * 0.62, y, radius * 0.16);
        this.drawRepairSpark(x, y + radius * 0.62, radius * 0.16);
        this.drawRepairSpark(x - radius * 0.62, y, radius * 0.16);
        break;
      case 'speed-trail':
        this.graphics.lineBetween(x - radius, y - radius * 0.38, x + radius * 0.18, y - radius * 0.38);
        this.graphics.lineBetween(x - radius * 1.15, y, x + radius * 0.4, y);
        this.graphics.lineBetween(x - radius, y + radius * 0.38, x + radius * 0.18, y + radius * 0.38);
        this.drawInwardChevron(x + radius * 0.42, y, x + radius * 0.85, y, radius * 0.24);
        break;
      case 'overclock-aura':
        this.graphics.strokeCircle(x, y, radius);
        this.graphics.strokeCircle(x, y, radius * 0.58);
        this.drawRadialTicks(x, y, radius * 0.68, radius * 1.02, 8, Math.PI / 8);
        break;
      case 'shield-aura':
        this.graphics.strokeCircle(x, y, radius * 0.96);
        this.graphics.strokeCircle(x, y, radius * 0.62);
        this.drawHex(x, y, radius);
        break;
      case 'precision-mark':
        this.drawDiamond(x, y, radius * 0.58);
        this.drawCornerBrackets(x, y, radius);
        this.graphics.lineBetween(x - radius * 0.92, y, x - radius * 0.58, y);
        this.graphics.lineBetween(x + radius * 0.58, y, x + radius * 0.92, y);
        break;
    }
  }

  private drawHighlights(cue: string, x: number, y: number, radius: number): void {
    switch (cue) {
      case 'shockwave':
        this.graphics.strokeCircle(x, y, radius * 0.86);
        this.drawRadialTicks(x, y, radius * 0.92, radius * 1.05, 4, 0);
        break;
      case 'heat-ring':
        this.graphics.strokeCircle(x, y, radius * 0.76);
        break;
      case 'loot-pulse':
        this.drawDiamond(x, y, radius * 0.18);
        break;
      case 'heal-burst':
        this.drawRepairSpark(x, y, radius * 0.28);
        break;
      case 'speed-trail':
        this.graphics.lineBetween(x - radius * 0.58, y, x + radius * 0.46, y);
        break;
      case 'overclock-aura':
        this.graphics.strokeCircle(x, y, radius * 0.78);
        break;
      case 'shield-aura':
        this.drawHex(x, y, radius * 0.78);
        break;
      case 'precision-mark':
        this.drawDiamond(x, y, radius * 0.28);
        break;
    }
  }

  private mixWithWhite(color: number): number {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    return ((red + ((255 - red) >> 1)) << 16)
      | ((green + ((255 - green) >> 1)) << 8)
      | (blue + ((255 - blue) >> 1));
  }

  private drawRadialTicks(x: number, y: number, inner: number, outer: number, count: number, offset: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = offset + index * Math.PI * 2 / count;
      this.graphics.lineBetween(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
      );
    }
  }

  private drawHeatTongues(x: number, y: number, radius: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count;
      const tangentX = Math.cos(angle + Math.PI / 2) * radius * 0.12;
      const tangentY = Math.sin(angle + Math.PI / 2) * radius * 0.12;
      const baseX = x + Math.cos(angle) * radius * 0.86;
      const baseY = y + Math.sin(angle) * radius * 0.86;
      this.graphics.strokeTriangle(
        baseX - tangentX, baseY - tangentY,
        x + Math.cos(angle) * radius * 1.2, y + Math.sin(angle) * radius * 1.2,
        baseX + tangentX, baseY + tangentY,
      );
    }
  }

  private drawInwardChevron(fromX: number, fromY: number, toX: number, toY: number, size: number): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const sideX = Math.cos(angle + Math.PI / 2) * size;
    const sideY = Math.sin(angle + Math.PI / 2) * size;
    this.graphics.lineBetween(fromX, fromY, toX, toY);
    this.graphics.lineBetween(toX, toY, toX - Math.cos(angle) * size + sideX, toY - Math.sin(angle) * size + sideY);
    this.graphics.lineBetween(toX, toY, toX - Math.cos(angle) * size - sideX, toY - Math.sin(angle) * size - sideY);
  }

  private drawRepairSpark(x: number, y: number, size: number): void {
    this.graphics.lineBetween(x - size, y, x + size, y);
    this.graphics.lineBetween(x, y - size, x, y + size);
  }

  private drawHex(x: number, y: number, radius: number): void {
    for (let index = 0; index < 6; index += 1) {
      const a = -Math.PI / 2 + index * Math.PI / 3;
      const b = -Math.PI / 2 + (index + 1) * Math.PI / 3;
      this.graphics.lineBetween(x + Math.cos(a) * radius, y + Math.sin(a) * radius,
        x + Math.cos(b) * radius, y + Math.sin(b) * radius);
    }
  }

  private drawDiamond(x: number, y: number, radius: number): void {
    this.graphics.lineBetween(x, y - radius, x + radius, y);
    this.graphics.lineBetween(x + radius, y, x, y + radius);
    this.graphics.lineBetween(x, y + radius, x - radius, y);
    this.graphics.lineBetween(x - radius, y, x, y - radius);
  }

  private drawCornerBrackets(x: number, y: number, radius: number): void {
    const short = radius * 0.28;
    // Avoid allocating iterator arrays in the per-frame presentation path.
    for (let horizontalIndex = 0; horizontalIndex < 2; horizontalIndex += 1) {
      const horizontal = horizontalIndex === 0 ? -1 : 1;
      for (let verticalIndex = 0; verticalIndex < 2; verticalIndex += 1) {
        const vertical = verticalIndex === 0 ? -1 : 1;
        const cornerX = x + horizontal * radius;
        const cornerY = y + vertical * radius;
        this.graphics.lineBetween(cornerX, cornerY, cornerX - horizontal * short, cornerY);
        this.graphics.lineBetween(cornerX, cornerY, cornerX, cornerY - vertical * short);
      }
    }
  }

  destroy(): void {
    this.stop.splice(0).forEach((stop) => stop());
    this.live.clear();
    this.graphics.destroy();
  }
}
