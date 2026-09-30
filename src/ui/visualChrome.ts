import Phaser from 'phaser';
import type { VisualArtLookup } from '../systems/visualArt';
import type { ResolvedVisualArtBinding } from '../systems/types';

/** Semantic UI families backed by the generic visual-art binding contract. */
export type UiVisualFamily =
  | 'brand' | 'nav-icon' | 'ui-chrome' | 'stat-icon' | 'action-icon'
  | 'hud-icon' | 'settings-icon' | 'chapter-icon' | 'objective-icon' | 'arena-card';

export interface UiVisualOptions {
  readonly size?: number;
  readonly alpha?: number;
  readonly scrollFactor?: number;
  readonly frame?: string;
  readonly depth?: number;
}

export interface UiVisualChrome {
  binding(id: string): Readonly<ResolvedVisualArtBinding> | undefined;
  id(family: UiVisualFamily, name: string): string;
  addIcon(scene: Phaser.Scene, x: number, y: number, id: string, options?: UiVisualOptions): Phaser.GameObjects.Image | undefined;
  addChrome(scene: Phaser.Scene, x: number, y: number, name: string, options?: UiVisualOptions): Phaser.GameObjects.Image | undefined;
  addPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, name?: string, options?: UiVisualOptions): Phaser.GameObjects.GameObject | undefined;
  addFrame(scene: Phaser.Scene, x: number, y: number, width: number, height: number, name?: string, options?: UiVisualOptions): Phaser.GameObjects.GameObject | undefined;
}

/**
 * Thin binding-based renderer shared by menu, HUD and modal consumers. It
 * owns no layout, focus, input, or gameplay state: callers retain their
 * existing responsive geometry and interactive hit targets.
 */
export function createUiVisualChrome(visualArt: VisualArtLookup): UiVisualChrome {
  const binding = (id: string) => visualArt.bindingById(id);
  const id = (family: UiVisualFamily, name: string) => `${family}:${name}`;
  const addIcon = (scene: Phaser.Scene, x: number, y: number, artId: string, options: UiVisualOptions = {}) => {
    const resolved = binding(artId);
    if (!resolved || !scene.textures?.exists(resolved.textureKey) || typeof scene.add?.image !== 'function') return undefined;
    const image = scene.add.image(x, y, resolved.textureKey, options.frame ?? resolved.frameKey);
    const size = options.size ?? Math.min(resolved.display.width, resolved.display.height);
    const scale = size / Math.max(resolved.display.width, resolved.display.height);
    image.setDisplaySize(resolved.display.width * scale, resolved.display.height * scale);
    image.setAlpha(options.alpha ?? 1);
    image.setScrollFactor(options.scrollFactor ?? 0);
    if (options.depth !== undefined) image.setDepth(options.depth);
    return image;
  };
  const addPanel = (scene: Phaser.Scene, x: number, y: number, width: number, height: number, name = 'panel', options: UiVisualOptions = {}) => {
    const resolved = binding(id('ui-chrome', name));
    if (!resolved || !scene.textures?.exists(resolved.textureKey)) return undefined;
    const nineslice = (scene.add as Phaser.Scene['add'] & { nineslice?: (...args: unknown[]) => Phaser.GameObjects.GameObject }).nineslice;
    if (typeof nineslice !== 'function') return undefined;
    const horizontalSlice = Math.min(12, Math.max(1, width / 2));
    const verticalSlice = Math.min(12, Math.max(1, height / 2));
    const object = nineslice.call(
      scene.add,
      x,
      y,
      resolved.textureKey,
      options.frame ?? resolved.frameKey,
      width,
      height,
      horizontalSlice,
      horizontalSlice,
      verticalSlice,
      verticalSlice,
    );
    const display = object as Phaser.GameObjects.GameObject & {
      setScrollFactor?: (value: number) => unknown;
      setAlpha?: (value: number) => unknown;
      setDepth?: (value: number) => unknown;
    };
    display.setScrollFactor?.(options.scrollFactor ?? 0);
    display.setAlpha?.(options.alpha ?? 1);
    if (options.depth !== undefined) display.setDepth?.(options.depth);
    return object;
  };
  return {
    binding,
    id,
    addIcon,
    addChrome: (scene, x, y, name, options = {}) => addIcon(scene, x, y, id('ui-chrome', name), options),
    addPanel,
    addFrame: addPanel,
  };
}
