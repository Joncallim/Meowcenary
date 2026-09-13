import { describe, expect, it } from 'vitest';
import { ScrollableFocusRegion } from '../src/ui/scrollableFocus';

describe('ScrollableFocusRegion', () => {
  it('initializes with default state', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 400,
    });
    expect(region.scrollOffset).toBe(0);
    expect(region.contentHeight).toBe(0);
    expect(region.focusedIndex).toBe(-1); // No focus initially
    expect(region.itemCount).toBe(0);
  });

  it('computes content height from items', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 400,
    });
    region.setItems([
      { index: 0, top: 0, bottom: 60 },
      { index: 1, top: 64, bottom: 124 },
    ]);
    expect(region.contentHeight).toBe(128); // 124 + 4 margin
    expect(region.itemCount).toBe(2);
  });

  it('ensures focused item is visible', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 100,
    });
    region.setItems([
      { index: 0, top: 0, bottom: 60 },
      { index: 1, top: 64, bottom: 124 },
      { index: 2, top: 128, bottom: 188 },
      { index: 3, top: 192, bottom: 252 },
      { index: 4, top: 256, bottom: 316 },
    ]);
    // Focus last item - should scroll down
    region.ensureVisible(4);
    expect(region.scrollOffset).toBeGreaterThan(0);
  });

  it('clamps scroll offset on resize', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 100,
    });
    region.setItems([
      { index: 0, top: 0, bottom: 60 },
      { index: 1, top: 64, bottom: 124 },
    ]);
    region.setScrollOffset(200); // Beyond content
    region.handleResize();
    expect(region.scrollOffset).toBeLessThanOrEqual(region.contentHeight - region.viewportHeight);
  });

  it('scrolls by delta when content exceeds viewport', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 100,
    });
    region.setItems([
      { index: 0, top: 0, bottom: 60 },
      { index: 1, top: 64, bottom: 124 },
      { index: 2, top: 128, bottom: 188 },
    ]);
    region.scrollBy(50);
    expect(region.scrollOffset).toBe(50);
  });

  it('destroys state', () => {
    const region = new ScrollableFocusRegion({
      viewportTop: 0,
      viewportBottom: 400,
    });
    region.setItems([{ index: 0, top: 0, bottom: 60 }]);
    region.destroy();
    expect(region.itemCount).toBe(0);
    expect(region.contentHeight).toBe(0);
  });
});
