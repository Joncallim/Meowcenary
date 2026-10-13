import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { MenuScene } from '../src/scenes/MenuScene';
import { ScrollableFocusRegion } from '../src/ui/scrollableFocus';

interface ScrollFocusOwner {
  scrollRegion?: ScrollableFocusRegion;
  scrollLocalIndexByFocusIndex: Map<number, number>;
}
const synchronize = (MenuScene.prototype as unknown as {
  syncScrollFocus(this: ScrollFocusOwner, focusedIndex: number): void;
}).syncScrollFocus;

describe('Menu semantic focus to scroll-local focus synchronization', () => {
  it.each([[9, 1, 0], [10, 0, 9]] as const)(
    'reaches the mapped target across grid columns (%i items, %i to %i)', (count, source, target) => {
      const region = new ScrollableFocusRegion({ viewportTop: 0, viewportBottom: 100, mode: 'grid', columns: 2 });
      region.setItems(Array.from({ length: count }, (_, index) => ({ index, top: index * 30, bottom: index * 30 + 20 })));
      region.setFocusedIndex(source, { reveal: false });
      const realMove = region.moveFocus.bind(region);
      let traversals = 0;
      // Keep the original looping path reproducibly RED without hanging the
      // test process when Up/Down can never reach the other column.
      vi.spyOn(region, 'moveFocus').mockImplementation(direction => {
        if (++traversals > count * 2) throw new Error('Directional traversal never reaches semantic focus');
        return realMove(direction);
      });
      const owner: ScrollFocusOwner = { scrollRegion: region, scrollLocalIndexByFocusIndex: new Map([[700, target]]) };
      expect(() => synchronize.call(owner, 700)).not.toThrow();
      expect(region.focusedIndex).toBe(target);
      expect(traversals).toBe(0);
      const item = region.itemLayout(target)!;
      expect(item.top - region.scrollOffset).toBeGreaterThanOrEqual(0);
      expect(item.bottom - region.scrollOffset).toBeLessThanOrEqual(100);
    },
  );

  it('reveals an already-focused action below non-focusable content using its scene mapping', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 100, viewportBottom: 200 });
    region.setItems([{ index: 0, top: 280, bottom: 320 }]);
    const owner: ScrollFocusOwner = { scrollRegion: region, scrollLocalIndexByFocusIndex: new Map([[37, 0]]) };
    synchronize.call(owner, 37);
    expect(region.focusedIndex).toBe(0);
    expect(region.scrollOffset).toBe(120);
  });

  it('leaves the region untouched for fixed-shell controls or disposed scroll content', () => {
    const region = new ScrollableFocusRegion({ viewportTop: 0, viewportBottom: 100 });
    region.setItems([{ index: 0, top: 0, bottom: 80 }]);
    region.includeContentBottom(400);
    region.setScrollOffset(120);
    const setFocus = vi.spyOn(region, 'setFocusedIndex');
    synchronize.call({ scrollRegion: region, scrollLocalIndexByFocusIndex: new Map([[37, 0]]) }, 99);
    expect(setFocus).not.toHaveBeenCalled();
    expect(region.scrollOffset).toBe(120);
    expect(() => synchronize.call({ scrollLocalIndexByFocusIndex: new Map([[37, 0]]) }, 37)).not.toThrow();
  });
});
