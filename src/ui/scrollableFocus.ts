/**
 * ScrollableFocusRegion — reusable scroll/focus primitive for growing list
 * surfaces.
 *
 * Composes with FocusNavigator for logical focus tracking and provides
 * viewport clipping, auto-scroll on focus change, and mixed-input support.
 *
 * V4 (Slice F): replaces per-screen bespoke pagination with one shared
 * scroll/focus region used by Character, Contract, Achievement, Compendium
 * and other list surfaces.
 */
import { FocusNavigator, type FocusDirection } from './focusList';

export interface FocusItemLayout {
  readonly index: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ScrollableFocusRegionOptions {
  readonly viewportTop: number;
  readonly viewportBottom: number;
  readonly itemMargin?: number;
  readonly mode?: 'linear' | 'grid';
  readonly columns?: number;
}

/**
 * Pure scroll/focus state: viewport, content size, scroll offset, and
 * focused item tracking.  Rendering is the caller's responsibility.
 */
export class ScrollableFocusRegion {
  private readonly navigator: FocusNavigator;
  private _scrollOffset = 0;
  private _contentHeight = 0;
  private items: FocusItemLayout[] = [];
  private readonly viewportTop: number;
  private readonly viewportBottom: number;
  private readonly itemMargin: number;

  constructor(options: ScrollableFocusRegionOptions) {
    this.viewportTop = options.viewportTop;
    this.viewportBottom = options.viewportBottom;
    this.itemMargin = options.itemMargin ?? 4;
    this.navigator = new FocusNavigator(options.mode ?? 'linear', options.columns ?? 1);
  }

  get scrollOffset(): number { return this._scrollOffset; }
  get contentHeight(): number { return this._contentHeight; }
  get viewportHeight(): number { return this.viewportBottom - this.viewportTop; }
  get focusedIndex(): number { return this.navigator.index; }
  get itemCount(): number { return this.navigator.count; }

  /** Set the item layouts for this region.  Recomputes content height and
   *  clamps scroll offset. */
  setItems(items: FocusItemLayout[]): void {
    this.items = [...items];
    this.navigator.setCount(items.length);
    this._contentHeight = items.length > 0
      ? Math.max(...items.map((item) => item.bottom)) + this.itemMargin
      : 0;
    this.clampScrollOffset();
  }

  /** Ensure the focused item is fully visible, adjusting scroll offset if
   *  needed. */
  ensureVisible(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    if (!item) return;

    // Item is below viewport → scroll down
    if (item.bottom > this.viewportBottom + this._scrollOffset) {
      this._scrollOffset = item.bottom - this.viewportBottom;
    }
    // Item is above viewport → scroll up
    if (item.top < this.viewportTop + this._scrollOffset) {
      this._scrollOffset = item.top - this.viewportTop;
    }

    this.clampScrollOffset();
  }

  /** Move focus in the given direction.  Returns true if focus changed. */
  moveFocus(direction: FocusDirection): boolean {
    const before = this.navigator.index;
    this.navigator.move(direction);
    if (this.navigator.index !== before) {
      this.ensureVisible(this.navigator.index);
      return true;
    }
    return false;
  }

  /** Scroll by a delta (e.g. from mouse wheel or touch drag). */
  scrollBy(delta: number): void {
    this._scrollOffset += delta;
    this.clampScrollOffset();
  }

  /** Set scroll offset directly. */
  setScrollOffset(offset: number): void {
    this._scrollOffset = offset;
    this.clampScrollOffset();
  }

  /** Handle viewport resize: clamp scroll offset and ensure focused item
   *  remains visible. */
  handleResize(): void {
    this.clampScrollOffset();
    if (this.navigator.index >= 0) {
      this.ensureVisible(this.navigator.index);
    }
  }

  /** Get the layout for a given index, or undefined. */
  itemLayout(index: number): FocusItemLayout | undefined {
    return this.items[index];
  }

  /** Destroy all state. */
  destroy(): void {
    this.items = [];
    this._scrollOffset = 0;
    this._contentHeight = 0;
    this.navigator.setCount(0);
  }

  private clampScrollOffset(): void {
    const maxScroll = Math.max(0, this._contentHeight - this.viewportHeight);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
  }
}
