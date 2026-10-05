/** Static image slots declared by one Loadout mount. Texture completion never
 * owns layout, commands, visibility, or the current scroll position. */
export interface StaticArtNode {
  readonly scene?: unknown;
  setTexture?(key: string, frame?: string | number): unknown;
  setDisplaySize(width: number, height: number): unknown;
  setAlpha(alpha: number): unknown;
  setCrop?(x: number, y: number, width: number, height: number): unknown;
}

export interface StaticArtSlot {
  readonly textureKey: string;
  readonly frame?: string | number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly crop?: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export class MountedStaticArt {
  private readonly pending = new Map<StaticArtNode, StaticArtSlot>();
  private revoked = false;
  private supported = true;

  get canHydrate(): boolean { return !this.revoked && this.supported; }

  unavailable(): void { this.supported = false; }

  register(node: StaticArtNode, slot: StaticArtSlot, ready: boolean): void {
    if (this.revoked) return;
    // Minimal display mocks cannot rebind textures. Keep their existing full
    // render recovery rather than treating absent capabilities as hydration.
    if (!node.scene || typeof node.setTexture !== 'function') this.unavailable();
    if (ready && slot.crop) node.setCrop?.(slot.crop.x, slot.crop.y, slot.crop.width, slot.crop.height);
    if (!ready) this.pending.set(node, slot);
  }

  hydrate(exists: (key: string, frame?: string | number) => boolean): number {
    if (!this.canHydrate) return 0;
    let changed = 0;
    for (const [node, slot] of this.pending) {
      // Phaser clears scene during destroy. The mount also clears this set
      // before teardown, so obsolete nodes cannot be resurrected.
      if (!node.scene) { this.pending.delete(node); continue; }
      if (!exists(slot.textureKey, slot.frame)) continue;
      node.setTexture!(slot.textureKey, slot.frame);
      node.setDisplaySize(slot.width, slot.height);
      if (slot.crop) node.setCrop?.(slot.crop.x, slot.crop.y, slot.crop.width, slot.crop.height);
      node.setAlpha(slot.alpha);
      this.pending.delete(node);
      changed += 1;
    }
    return changed;
  }

  clear(): void {
    this.revoked = true;
    this.pending.clear();
  }
}
