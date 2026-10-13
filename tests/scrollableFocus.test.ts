import { describe, expect, it } from 'vitest';
import { ScrollableFocusRegion } from '../src/ui/scrollableFocus';

type DirectFocusOptions = { readonly reveal?: boolean };
function setFocusedIndex(region: ScrollableFocusRegion, index: number, options?: DirectFocusOptions): boolean {
  return region.setFocusedIndex(index, options);
}

function focusableRegion(count: number, mode: 'linear' | 'grid' = 'linear', columns = 1): ScrollableFocusRegion {
  const region = new ScrollableFocusRegion({ viewportTop: 0, viewportBottom: 100, mode, columns });
  region.setItems(Array.from({ length: count }, (_, index) => ({
    index, top: index * 60, bottom: index * 60 + 50,
  })));
  return region;
}

describe('ScrollableFocusRegion direct focus synchronization', () => {
  it('sets one exact local index, reports only changes, and minimally reveals even an unchanged valid focus', () => {
    const region = focusableRegion(8);
    expect(region.focusedIndex).toBe(0);
    expect(setFocusedIndex(region, 6, { reveal: false })).toBe(true);
    expect(region.focusedIndex).toBe(6);
    expect(setFocusedIndex(region, 6, { reveal: false })).toBe(false);
    region.setScrollOffset(300);
    expect(setFocusedIndex(region, 6)).toBe(false);
    expect(region.focusedIndex).toBe(6);
    expect(region.scrollOffset).toBe(310);
  });

  it('keeps the scroll offset when reveal is disabled and clears a pending prefix reveal', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 200 });
    region.setItems([{ index: 0, top: 150, bottom: 180 }, { index: 1, top: 250, bottom: 280 }]);
    region.setScrollOffset(25);
    expect(region.scrollToStart()).toBe(true);
    expect(setFocusedIndex(region, 0)).toBe(false);
    expect(region.ensureFocusedVisible()).toBe(false);

    region.setScrollOffset(50);
    expect(setFocusedIndex(region, 1, { reveal: false })).toBe(true);
    expect(region.focusedIndex).toBe(1);
    expect(region.scrollOffset).toBe(50);
  });

  it('rejects safe out-of-range indexes without clamping or changing focus/scroll', () => {
    const region = focusableRegion(3);
    setFocusedIndex(region, 1, { reveal: false });
    region.setScrollOffset(20);
    for (const invalid of [-1, 3, 100]) {
      expect(setFocusedIndex(region, invalid)).toBe(false);
      expect([region.focusedIndex, region.scrollOffset]).toEqual([1, 20]);
    }
  });

  it('throws for non-safe indexes before changing focus or scroll', () => {
    const region = focusableRegion(3);
    setFocusedIndex(region, 1, { reveal: false });
    region.setScrollOffset(20);
    for (const invalid of [1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => setFocusedIndex(region, invalid)).toThrow(RangeError);
      expect([region.focusedIndex, region.scrollOffset]).toEqual([1, 20]);
    }
  });

  it('keeps the empty focus sentinel and rejects every direct index', () => {
    const region = focusableRegion(0);
    expect(region.focusedIndex).toBe(-1);
    expect(setFocusedIndex(region, 0)).toBe(false);
    expect(setFocusedIndex(region, -1)).toBe(false);
    expect(region.focusedIndex).toBe(-1);
    expect(() => setFocusedIndex(region, NaN)).toThrow(RangeError);
    expect(region.focusedIndex).toBe(-1);
  });

  it.each([
    ['linear', 1], ['grid', 2], ['grid', 3],
  ] as const)('synchronizes every source/target pair without directional traversal (%s, %i columns)', (mode, columns) => {
    const counts = [0, 1, 2, 8, 9, 10, 50];
    for (const count of counts) {
      for (let source = 0; source < count; source += 1) {
        for (let target = 0; target < count; target += 1) {
          const region = focusableRegion(count, mode, columns);
          expect(setFocusedIndex(region, source, { reveal: false })).toBe(source !== 0);
          expect(region.focusedIndex).toBe(source);
          const offset = region.scrollOffset;
          expect(setFocusedIndex(region, target, { reveal: false })).toBe(source !== target);
          expect(region.focusedIndex).toBe(target);
          expect(region.scrollOffset).toBe(offset);
        }
      }
    }
  });

  it.each([
    ['linear', 1], ['grid', 2], ['grid', 3],
  ] as const)('minimally reveals every mapped target with real row geometry (%s, %i columns)', (mode, columns) => {
    for (const count of [0, 1, 2, 8, 9, 10, 50]) {
      const items = Array.from({ length: count }, (_, index) => ({
        index, top: 100 + Math.floor(index / columns) * 60, bottom: 150 + Math.floor(index / columns) * 60,
      }));
      for (let source = 0; source < count; source += 1) {
        for (let target = 0; target < count; target += 1) {
          const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 200, mode, columns });
          region.setItems(items);
          region.setFocusedIndex(source);
          const before = region.scrollOffset;
          const item = items[target]!;
          const alreadyVisible = item.top - before >= 100 && item.bottom - before <= 200;
          expect(region.setFocusedIndex(target)).toBe(source !== target);
          expect(region.focusedIndex).toBe(target);
          expect(item.top - region.scrollOffset).toBeGreaterThanOrEqual(100);
          expect(item.bottom - region.scrollOffset).toBeLessThanOrEqual(200);
          expect(region.scrollOffset).toBeGreaterThanOrEqual(0);
          expect(region.scrollOffset).toBeLessThanOrEqual(Math.max(0, region.contentHeight - region.viewportHeight));
          if (alreadyVisible) expect(region.scrollOffset).toBe(before);
        }
      }
    }
  });
});

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

  it('includes non-focusable presentation below the final focus item in its scroll extent', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 0, viewportBottom: 100 });
    region.setItems([{ index: 0, top: 0, bottom: 80 }]);
    region.includeContentBottom(240);
    expect(region.itemCount).toBe(1);
    expect(region.contentHeight).toBe(244);
    region.setItems([{ index: 0, top: 0, bottom: 80 }]);
    expect(region.contentHeight).toBe(244);
    region.scrollBy(1_000);
    expect(region.scrollOffset).toBe(144);
  });

  it('computes max drag relative to a nonzero viewport top without overscrolling', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 300 });
    region.setItems([
      { index: 0, top: 100, bottom: 180 },
      { index: 1, top: 420, bottom: 500 },
    ]);
    region.includeContentBottom(600);
    expect(region.contentHeight).toBe(504);
    region.scrollBy(10_000);
    expect(region.scrollOffset).toBe(304);
  });

  it('keeps nonzero-top focus and resize clamping in the same relative extent', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 300 });
    region.setItems([
      { index: 0, top: 100, bottom: 180 },
      { index: 1, top: 420, bottom: 500 },
    ]);
    region.moveFocus('down');
    expect(region.scrollOffset).toBe(200);
    region.setScrollOffset(10_000);
    region.handleResize();
    expect(region.scrollOffset).toBe(204);
  });

  it('reveals a supplemental detail tail once before controller focus leaves the final row', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 300 });
    region.setItems([{ index: 0, top: 100, bottom: 180 }]);
    region.includeContentBottom(500);

    expect(region.scrollToEnd()).toBe(true);
    expect(region.scrollOffset).toBe(204);
    expect(region.scrollToEnd()).toBe(false);
  });

  it('reveals and restores non-focusable presentation before the first controller row', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 300 });
    region.setItems([{ index: 0, top: 360, bottom: 420 }, { index: 1, top: 430, bottom: 490 }]);
    region.ensureVisible(0);
    expect(region.scrollOffset).toBe(120);
    expect(region.scrollToStart()).toBe(true);
    expect(region.scrollOffset).toBe(0);
    expect(region.scrollToStart()).toBe(false);
    expect(region.ensureFocusedVisible()).toBe(true);
    expect(region.scrollOffset).toBe(120);
  });

  it('does not consume controller navigation for the ordinary trailing item margin', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 300 });
    region.setItems([{ index: 0, top: 280, bottom: 340 }]);

    expect(region.scrollToEnd()).toBe(false);
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
