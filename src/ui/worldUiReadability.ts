import type Phaser from 'phaser';

export interface WorldUiBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface WorldUiCamera { readonly scrollX: number; readonly scrollY: number }
export interface WorldUiPaint {
  readonly alpha: number;
  readonly visible: boolean;
  getBounds(output?: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle;
  setAlpha(alpha: number): unknown;
}

/** Candidate overlap treatment; authored alpha/fill/stroke remain authoritative. */
export const WORLD_UI_OVERLAP_ALPHA = 0.10;

/** Registered scrollFactor-zero paint under the same unrotated camera as the
 * actor. Its common positive zoom/viewport transform cancels in intersection:
 * cached UI world bounds compare with actor bounds minus camera scroll. */
export class WorldUiReadability {
  private readonly entries: Array<{ paint: WorldUiPaint; bounds: Phaser.Geom.Rectangle; authoredAlpha: number; overlapping: boolean }> = [];

  register(paint: WorldUiPaint | undefined): void {
    if (!paint) return;
    this.entries.push({ paint, bounds: paint.getBounds(), authoredAlpha: paint.alpha, overlapping: false });
  }

  refreshBounds(paint?: WorldUiPaint): void {
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (!paint || paint === entry.paint) entry.paint.getBounds(entry.bounds);
    }
  }

  update(actor: WorldUiBounds | undefined, camera: WorldUiCamera): void {
    const valid = actor !== undefined && Number.isFinite(actor.x) && Number.isFinite(actor.y)
      && Number.isFinite(actor.width) && Number.isFinite(actor.height) && actor.width > 0 && actor.height > 0
      && Number.isFinite(camera.scrollX) && Number.isFinite(camera.scrollY);
    const left = valid ? actor!.x - camera.scrollX : 0;
    const top = valid ? actor!.y - camera.scrollY : 0;
    const right = valid ? left + actor!.width : 0;
    const bottom = valid ? top + actor!.height : 0;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      const rect = entry.bounds;
      const overlap = valid && entry.paint.visible && rect.width > 0 && rect.height > 0
        && left < rect.x + rect.width && right > rect.x && top < rect.y + rect.height && bottom > rect.y;
      const alpha = entry.authoredAlpha * (overlap ? WORLD_UI_OVERLAP_ALPHA : 1);
      if (entry.paint.alpha !== alpha) entry.paint.setAlpha(alpha);
      entry.overlapping = overlap;
    }
  }

  clear(): void {
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry.paint.alpha !== entry.authoredAlpha) entry.paint.setAlpha(entry.authoredAlpha);
    }
    this.entries.length = 0;
  }
}
