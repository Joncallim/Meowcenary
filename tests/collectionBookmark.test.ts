import { describe, expect, it } from 'vitest';
import { restoreCollectionBookmark, revealCollectionFocus, type CollectionBookmark, type CollectionBookmarkLayout } from '../src/ui/menuSurfaces/collectionBookmark';

function layout(keys = ['a', 'b', 'c', 'd'], columns = 2): CollectionBookmarkLayout {
  const rows = [];
  for (let i = 0; i < keys.length; i += columns) rows.push({ keys: keys.slice(i, i + columns), top: 100 + rows.length * 80, height: 80 });
  return { scope: 'helmet', candidateKeys: keys, focusKeys: ['header', ...keys, 'inspect', 'back'], rows, fallbackFocusKey: 'back', viewportTop: 100, viewportHeight: 100, maxScroll: Math.max(0, rows.length * 80 - 100) };
}
const bookmark: CollectionBookmark = { scope: 'helmet', candidateKey: 'a', focusKey: 'inspect', anchorKey: 'c', intraRowOffset: 25 };

describe('collection bookmark repair', () => {
  it('retains candidate, distinct focus and anchor without automatic reveal', () => {
    const result = restoreCollectionBookmark(bookmark, ['a', 'b', 'c', 'd'], layout());
    expect(result.bookmark).toEqual(bookmark);
    expect(result.scrollOffset).toBe(60);
    expect(revealCollectionFocus(result.scrollOffset, 'a', layout())).toBe(0);
    expect(revealCollectionFocus(result.scrollOffset, 'inspect', layout())).toBe(60);
  });
  it('preserves an unclamped same-geometry anchor and rerows changed columns', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(restoreCollectionBookmark(bookmark, keys, layout(keys)).scrollOffset).toBe(105);
    const result = restoreCollectionBookmark(bookmark, keys, layout(keys, 3));
    expect(result.bookmark.anchorKey).toBe('a');
    expect(result.scrollOffset).toBe(25);
    expect(result.bookmark.candidateKey).toBe('a');
    expect(result.bookmark.focusKey).toBe('inspect');
  });
  it('repairs by old successor, then predecessor, then first legal candidate', () => {
    const old = ['a', 'b', 'c', 'd', 'e'];
    const removed = { ...bookmark, candidateKey: 'b', focusKey: 'b', anchorKey: 'b' };
    for (const [keys, expected] of [[['e', 'c', 'a'], 'c'], [['a'], 'a'], [['new'], 'new']] as const) {
      const result = restoreCollectionBookmark(removed, old, layout([...keys]));
      expect(result.bookmark).toMatchObject({ candidateKey: expected, focusKey: expected, anchorKey: keys[0] });
    }
  });
  it('keeps retained stable identities through insertion/reorder and focused card independent of candidate', () => {
    const b = { ...bookmark, focusKey: 'd' };
    const result = restoreCollectionBookmark(b, ['a', 'b', 'c', 'd'], layout(['new', 'd', 'a', 'c', 'b'], 3));
    expect(result.bookmark).toMatchObject({ candidateKey: 'a', focusKey: 'd', anchorKey: 'c' });
  });
  it('clears absent selection and routes empty focus to current fallback', () => {
    const current = { ...layout([]), focusKeys: ['empty', 'back'], fallbackFocusKey: 'empty' };
    expect(restoreCollectionBookmark({ ...bookmark, focusKey: 'c' }, ['a', 'b', 'c', 'd'], current)).toEqual({ bookmark: { scope: 'helmet', candidateKey: null, focusKey: 'empty', anchorKey: null, intraRowOffset: 0 }, scrollOffset: 0 });
  });
  it('resets changed scope and new bookmark without repairing from unrelated old IDs', () => {
    const current = { ...layout(['x', 'a', 'c']), scope: 'boots' };
    const expected = { scope: 'boots', candidateKey: 'x', focusKey: 'x', anchorKey: 'x', intraRowOffset: 0 };
    expect(restoreCollectionBookmark(bookmark, ['a', 'b', 'c'], current).bookmark).toEqual(expected);
    expect(restoreCollectionBookmark(null, [], current).bookmark).toEqual(expected);
  });
  it('clamps intra-row offset and global offset separately', () => {
    const current = layout(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(restoreCollectionBookmark({ ...bookmark, intraRowOffset: 999 }, current.candidateKeys, current)).toMatchObject({ bookmark: { intraRowOffset: 80 }, scrollOffset: 140 });
    expect(restoreCollectionBookmark({ ...bookmark, intraRowOffset: -100 }, current.candidateKeys, current)).toMatchObject({ bookmark: { intraRowOffset: 0 }, scrollOffset: 80 });
    expect(restoreCollectionBookmark({ ...bookmark, anchorKey: 'a' }, current.candidateKeys, { ...current, rows: current.rows.map((r, i) => ({ ...r, top: i * 80 })) }).scrollOffset).toBe(0);
  });
  it('minimal reveal is explicit, bounded and leaves fixed focus stationary', () => {
    const current = layout(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(revealCollectionFocus(0, 'c', current)).toBe(60);
    expect(revealCollectionFocus(60, 'c', current)).toBe(60);
    expect(revealCollectionFocus(140, 'c', current)).toBe(80);
    expect(revealCollectionFocus(40, 'inspect', current)).toBe(40);
    expect(revealCollectionFocus(500, 'missing', current)).toBe(140);
  });
  it('requires explicit detail policy for oversized rows and skips gaps when revealing', () => {
    const current = layout(['a', 'b', 'c', 'd']);
    expect(() => revealCollectionFocus(0, 'a', { ...current, viewportHeight: 40 })).toThrow();
    const gapped = { ...current, rows: [current.rows[0], { ...current.rows[1], top: 210 }], maxScroll: 90 };
    expect(revealCollectionFocus(0, 'c', gapped)).toBe(90);
    expect(restoreCollectionBookmark(bookmark, current.candidateKeys, gapped).scrollOffset).toBe(90);
  });
  it('fails closed on malformed identity/geometry and mismatched rows', () => {
    const current = layout();
    for (const broken of [ { ...current, candidateKeys: ['a', 'a'] }, { ...current, focusKeys: ['back', 'back'] }, { ...current, fallbackFocusKey: 'absent' }, { ...current, maxScroll: -1 }, { ...current, viewportTop: NaN }, { ...current, viewportHeight: 0 }, { ...current, rows: [{ keys: ['a'], top: 0, height: Infinity }] }, { ...current, rows: [{ keys: ['a'], top: 0, height: -1 }] }, { ...current, rows: [{ keys: ['a', 'a', 'b', 'c', 'd'], top: 0, height: 80 }] }, { ...current, rows: [] } ]) expect(() => restoreCollectionBookmark(bookmark, ['a', 'b', 'c', 'd'], broken)).toThrow();
    expect(() => restoreCollectionBookmark({ ...bookmark, intraRowOffset: NaN }, [], current)).toThrow();
    expect(() => restoreCollectionBookmark(bookmark, ['a', 'a'], current)).toThrow();
    expect(() => revealCollectionFocus(NaN, 'a', current)).toThrow();
  });
  it('is immutable and deterministic across exhaustive single removals, reversal and columns', () => {
    for (const count of [0, 1, 2, 8, 9, 10, 50]) for (const columns of [2, 3]) {
      const old = Array.from({ length: count }, (_, i) => `key:${i}`);
      for (let removed = 0; removed < Math.max(1, count); removed++) {
        const keys = old.filter((_, i) => i !== removed).reverse();
        const input = { scope: 'helmet', candidateKey: old[removed] ?? null, focusKey: old[removed] ?? 'back', anchorKey: old[removed] ?? null, intraRowOffset: 30 };
        const current = layout(keys, columns);
        const before = structuredClone({ input, current, old });
        const result = restoreCollectionBookmark(input, old, current);
        const expected = old.slice(removed + 1).find(k => keys.includes(k)) ?? old.slice(0, removed).reverse().find(k => keys.includes(k)) ?? keys[0] ?? null;
        expect(result.bookmark.candidateKey).toBe(expected);
        expect(result.bookmark.focusKey).toBe(expected ?? 'back');
        const row = current.rows.find(r => expected !== null && r.keys.includes(expected));
        expect(result.bookmark.anchorKey).toBe(row?.keys[0] ?? null);
        expect(result.scrollOffset).toBe(row ? Math.max(0, Math.min(row.top + 30 - current.viewportTop, current.maxScroll)) : 0);
        expect(restoreCollectionBookmark(input, old, current)).toEqual(result);
        expect({ input, current, old }).toEqual(before);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.bookmark)).toBe(true);
      }
    }
  });
});
