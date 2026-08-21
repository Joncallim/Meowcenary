import { describe, expect, it } from 'vitest';
import { FocusNavigator, type FocusDirection } from '../src/ui/focusList';

const directions: FocusDirection[] = ['up', 'down', 'left', 'right'];

describe('FocusNavigator', () => {
  it('maintains empty and count/index invariants', () => {
    const nav = new FocusNavigator();
    expect([nav.count, nav.index]).toEqual([0, -1]);
    expect(directions.every((direction) => !nav.move(direction))).toBe(true);
    nav.setCount(1);
    expect(nav.index).toBe(0);
    nav.setCount(8);
    nav.setIndex(7);
    nav.setCount(3);
    expect(nav.index).toBe(2);
    nav.setCount(0);
    expect(nav.index).toBe(-1);
  });

  it('wraps linear movement and reports only actual movement', () => {
    const nav = new FocusNavigator('linear');
    nav.setCount(3);
    expect(nav.move('left')).toBe(true);
    expect(nav.index).toBe(2);
    expect(nav.move('right')).toBe(true);
    expect(nav.index).toBe(0);
    nav.setCount(1);
    expect(nav.move('up')).toBe(false);
  });

  it('uses regular row-major grid movement without wrapping', () => {
    const nav = new FocusNavigator('grid', 3);
    nav.setCount(8);
    nav.setIndex(3);
    expect(nav.move('down')).toBe(true);
    expect(nav.index).toBe(6);
    expect(nav.move('right')).toBe(true);
    expect(nav.index).toBe(7);
    expect(nav.move('right')).toBe(false);
    expect(nav.move('left')).toBe(true);
    expect(nav.index).toBe(6);
    nav.setIndex(4);
    expect(nav.move('down')).toBe(true);
    expect(nav.index).toBe(7);
    nav.setIndex(0);
    expect(nav.move('up')).toBe(false);
    expect(nav.move('right')).toBe(true);
    expect(nav.index).toBe(1);
  });

  it('matches the exhaustive grid oracle', () => {
    for (let count = 0; count <= 64; count += 1) {
      for (let columns = 1; columns <= 16; columns += 1) {
        const nav = new FocusNavigator('grid', columns);
        nav.setCount(count);
        for (let index = 0; index < count; index += 1) {
          for (const direction of directions) {
            nav.setIndex(index);
            const row = Math.floor(index / columns);
            const col = index % columns;
            const expected = direction === 'left'
              ? col === 0 ? index : index - 1
              : direction === 'right'
                ? col === columns - 1 || index + 1 >= count ? index : index + 1
                : direction === 'up'
                  ? row === 0 ? index : index - columns
                  : (row + 1) * columns >= count
                    ? index
                    : Math.min((row + 1) * columns + col, count - 1);
            const moved = nav.move(direction);
            expect(nav.index).toBe(expected);
            expect(moved).toBe(expected !== index);
            expect(nav.index).toBeGreaterThanOrEqual(0);
            expect(nav.index).toBeLessThan(count);
          }
        }
      }
    }
  }, 15_000);

  it('rejects invalid numeric boundaries immediately', () => {
    expect(() => new FocusNavigator('grid', 0)).toThrow(RangeError);
    const nav = new FocusNavigator();
    for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => nav.setCount(value)).toThrow(RangeError);
      expect(() => nav.setColumns(value)).toThrow(RangeError);
      if (!Number.isSafeInteger(value)) {
        expect(() => nav.setIndex(value)).toThrow(RangeError);
      }
    }
  });
});
