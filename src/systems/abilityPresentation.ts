import type Phaser from 'phaser';
import type { EventBus, GameEventMap } from '../engine/eventBus';
import type { AbilityEffect } from '../gameplay/abilities';
import type { ModifierStatKey } from '../gameplay/stats';
import { resolveAbilityResolutionCopy } from '../presentation/abilityEffectPresentation';
import { responsiveGameUiViewport, physicalToLogical } from '../ui/layout';
import { createUiText } from '../ui/text';
import { ThemeDepth, ThemeFont } from '../ui/theme';

type Glyph = 'move' | 'rate' | 'damage' | 'pierce' | 'health' | 'armor' | 'range' | 'loot';
const GLYPH_BIT: Readonly<Record<Glyph, number>> = { move: 1, rate: 2, damage: 4, pierce: 8, health: 16, armor: 32, range: 64, loot: 128 };
const STAT_GLYPH: Readonly<Record<ModifierStatKey, Glyph>> = {
  moveSpeed: 'move', attackSpeed: 'rate', damage: 'damage', pierce: 'pierce',
  maxHealth: 'health', armor: 'armor', projectileSpeed: 'move', projectileCount: 'pierce',
  range: 'range', critChance: 'damage', pickupRadius: 'loot', xpGain: 'loot', currencyGain: 'loot', spreadDeg: 'range',
};
interface LiveAbilityEffect {
  readonly abilityId: string;
  readonly kind: AbilityEffect['kind'];
  readonly color: number;
  readonly radius: number;
  readonly glyphMask: number;
  readonly x: number;
  readonly y: number;
  remaining: number;
  elapsed: number;
  rendered: boolean;
}

/** Gameplay-inert, bounded feedback: two reusable display objects, one
 * transient slot, one sustained slot, at most sixteen drawing primitives.
 * Persistent lifetime comes only from ability:ended; no view ticks gameplay. */
export class AbilityPresentationSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly stop: Array<() => void> = [];
  private transient?: LiveAbilityEffect;
  private persistent?: LiveAbilityEffect;
  private bannerRemaining = 0;
  private primitivesRemaining = 16;
  private disposed = false;

  constructor(private readonly scene: Phaser.Scene, bus: EventBus, private readonly player: { x: number; y: number }) {
    this.graphics = scene.add.graphics().setDepth(90);
    this.banner = createUiText(scene, 0, 0, '', {
      color: '#f7f1d5', backgroundColor: '#081118', fontFamily: ThemeFont.family,
      fontSize: '14px', align: 'center', maxLines: 2, padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setDepth(ThemeDepth.transientHint).setScrollFactor(0).setVisible(false);
    this.layoutBanner();
    scene.scale.on('resize', this.layoutBanner, this);
    this.stop.push(bus.on('ability:activated', event => this.activate(event)));
    this.stop.push(bus.on('ability:resolved', event => {
      this.showBanner(event.name, resolveAbilityResolutionCopy(event.resolution));
    }));
    this.stop.push(bus.on('ability:ended', event => {
      if (this.persistent?.abilityId === event.abilityId) this.persistent = undefined;
    }));
  }

  private activate(event: GameEventMap['ability:activated']): void {
    const color = Number.parseInt(event.color.slice(1), 16);
    let glyphMask = 0;
    if (event.mechanicKind === 'stat-burst') {
      for (const modifier of event.modifiers ?? []) glyphMask |= GLYPH_BIT[STAT_GLYPH[modifier.stat]];
    }
    const sustained = event.mechanicKind === 'stat-burst' || event.mechanicKind === 'invulnerable';
    const effect: LiveAbilityEffect = {
      abilityId: event.abilityId, kind: event.mechanicKind,
      color: Number.isFinite(color) ? color : 0xffffff,
      radius: sustained || event.mechanicKind === 'heal' ? event.visualRadius ?? 36 : event.radius ?? 0,
      glyphMask, remaining: Math.max(280, event.durationMs), elapsed: 0,
      x: event.x, y: event.y, rendered: false,
    };
    if (sustained) this.persistent = effect;
    else this.transient = effect;
    this.showBanner(event.headline ?? '', event.detail ?? '');
  }

  private showBanner(name: string, detail: string): void {
    this.banner.setText(`${name}\n${detail}`).setVisible(true);
    this.bannerRemaining = 1800;
  }

  private readonly layoutBanner = (): void => {
    if (this.disposed) return;
    const viewport = responsiveGameUiViewport(this.scene.scale.width, this.scene.scale.height);
    this.banner.setPosition((viewport.originX ?? 0) + viewport.canvasWidth / 2,
      (viewport.originY ?? 0) + physicalToLogical(94, viewport));
    this.banner.setFontSize(physicalToLogical(ThemeFont.bodyMin, viewport));
    this.banner.setWordWrapWidth(viewport.canvasWidth - physicalToLogical(48, viewport), true);
  };

  update(deltaMs: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.graphics.clear();
    this.primitivesRemaining = 16;
    if (this.transient) {
      if (this.transient.rendered && this.transient.remaining <= 0) this.transient = undefined;
      else this.draw(this.transient, false, dt, reducedMotion);
    }
    // Always reserve the mechanical boundary first, even if synthetic facts
    // overlap a large sustained modifier group. No cosmetic cue can hide it.
    if (this.persistent) this.draw(this.persistent, true, dt, reducedMotion);
    if (this.bannerRemaining > 0) {
      this.bannerRemaining = Math.max(0, this.bannerRemaining - dt);
      if (this.bannerRemaining === 0) this.banner.setVisible(false);
    }
  }

  private draw(effect: LiveAbilityEffect, sustained: boolean, dt: number, reducedMotion: boolean): void {
    const x = sustained ? this.player.x : effect.x;
    const y = sustained ? this.player.y : effect.y;
    const r = effect.radius;
    this.graphics.lineStyle(2, effect.color, 0.95);
    switch (effect.kind) {
      case 'knockback':
        // The outer boundary never animates or shifts: it is effect.radius.
        this.circle(x, y, r);
        this.circle(x, y, r * (reducedMotion ? 0.62 : 0.35 + Math.min(1, effect.elapsed / 280) * 0.5));
        this.radialArrows(x, y, r, false);
        break;
      case 'elemental-burst':
        this.circle(x, y, r);
        for (let index = 0; index < 4; index += 1) {
          const angle = index * Math.PI / 2;
          this.line(x + Math.cos(angle) * r * 0.72, y + Math.sin(angle) * r * 0.72,
            x + Math.cos(angle) * r * 0.94, y + Math.sin(angle) * r * 0.94);
        }
        break;
      case 'loot-pulse':
        this.circle(x, y, r);
        this.radialArrows(x, y, r, true);
        break;
      case 'heal':
        this.circle(x, y, 18);
        this.cross(x, y, 9);
        break;
      case 'invulnerable':
        this.hex(x, y, r);
        this.circle(x, y, r * 0.65);
        break;
      case 'stat-burst': {
        // Up to three semantic symbols, selected once at activation. No
        // ability IDs, entities, new display objects or per-frame arrays.
        let drawn = 0;
        for (let bit = 1; bit <= 128 && drawn < 3; bit *= 2) {
          if ((effect.glyphMask & bit) === 0) continue;
          this.statGlyph(bit, x - r + drawn * r, y - r * 0.8, 9);
          drawn += 1;
        }
        this.circle(x, y, r * 0.65);
        break;
      }
      default: {
        const unsupported: never = effect.kind;
        throw new Error(`Unsupported ability presentation: ${String(unsupported)}`);
      }
    }
    effect.rendered = true;
    effect.elapsed += dt;
    if (!sustained) effect.remaining -= dt;
  }

  private radialArrows(x: number, y: number, radius: number, inward: boolean): void {
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      const base = radius * (inward ? 0.82 : 0.62);
      const tip = radius * (inward ? 0.48 : 0.92);
      const tx = Math.cos(angle + Math.PI / 2) * radius * 0.10;
      const ty = Math.sin(angle + Math.PI / 2) * radius * 0.10;
      this.triangle(x + Math.cos(angle) * base - tx, y + Math.sin(angle) * base - ty,
        x + Math.cos(angle) * tip, y + Math.sin(angle) * tip,
        x + Math.cos(angle) * base + tx, y + Math.sin(angle) * base + ty);
    }
  }

  private statGlyph(bit: number, x: number, y: number, r: number): void {
    switch (bit) {
      case 1: // movement: fixed wing/arrow, also legible with reduced motion
        this.line(x - r, y - r, x, y); this.line(x, y, x - r, y + r);
        this.line(x, y - r, x + r, y); this.line(x + r, y, x, y + r);
        break;
      case 2: // fire rate: gear hub and cadence spokes
        this.circle(x, y, r * 0.55);
        for (let index = 0; index < 4; index += 1) {
          const angle = index * Math.PI / 2;
          this.line(x + Math.cos(angle) * r * 0.65, y + Math.sin(angle) * r * 0.65,
            x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        }
        break;
      case 4: // damage: pointed impact mark
        this.triangle(x, y - r, x + r, y + r, x - r, y + r);
        this.line(x, y - r * 0.3, x, y + r * 0.5);
        break;
      case 8: // pierce: projectile crossing a target
        this.line(x - r, y, x + r, y);
        this.line(x, y - r, x, y + r);
        this.line(x + r * 0.5, y - r * 0.5, x + r, y);
        break;
      case 16: this.cross(x, y, r); break;
      case 32: this.hex(x, y, r); break;
      case 64: this.circle(x, y, r); this.line(x - r, y, x + r, y); break;
      case 128: this.triangle(x - r, y - r, x, y + r, x + r, y - r); break;
    }
  }

  private cross(x: number, y: number, r: number): void {
    this.line(x - r, y, x + r, y); this.line(x, y - r, x, y + r);
  }
  private hex(x: number, y: number, r: number): void {
    for (let index = 0; index < 6; index += 1) {
      const a = -Math.PI / 2 + index * Math.PI / 3;
      const b = a + Math.PI / 3;
      this.line(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(b) * r, y + Math.sin(b) * r);
    }
  }
  private circle(x: number, y: number, r: number): void {
    if (this.primitivesRemaining-- > 0) this.graphics.strokeCircle(x, y, r);
  }
  private line(x: number, y: number, toX: number, toY: number): void {
    if (this.primitivesRemaining-- > 0) this.graphics.lineBetween(x, y, toX, toY);
  }
  private triangle(x: number, y: number, bx: number, by: number, cx: number, cy: number): void {
    if (this.primitivesRemaining-- > 0) this.graphics.strokeTriangle(x, y, bx, by, cx, cy);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const stop of this.stop) stop();
    this.stop.length = 0;
    this.scene.scale.off('resize', this.layoutBanner, this);
    this.transient = undefined; this.persistent = undefined;
    this.graphics.destroy(); this.banner.destroy();
  }
}
