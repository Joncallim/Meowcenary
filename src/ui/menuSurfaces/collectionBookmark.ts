/** Bounded transient view data; controller selection and saves stay elsewhere. */
export interface CollectionBookmark {
  readonly scope: string;
  readonly candidateKey: string | null;
  readonly focusKey: string;
  readonly anchorKey: string | null;
  readonly intraRowOffset: number;
}
export interface CollectionBookmarkRow {
  readonly keys: readonly string[];
  readonly top: number;
  readonly height: number;
}
export interface CollectionBookmarkLayout {
  readonly scope: string;
  readonly candidateKeys: readonly string[];
  readonly focusKeys: readonly string[];
  readonly rows: readonly CollectionBookmarkRow[];
  readonly fallbackFocusKey: string;
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly maxScroll: number;
}
export interface RestoredCollectionBookmark {
  readonly bookmark: Readonly<CollectionBookmark>;
  readonly scrollOffset: number;
}
function keyIsValid(key: string): boolean { return typeof key === 'string' && key.trim().length > 0; }
function keysSet(keys: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const key of keys) {
    if (!keyIsValid(key) || set.has(key)) throw new RangeError('Invalid/duplicate identity');
    set.add(key);
  }
  return set;
}
function finite(value: number): void { if (!Number.isFinite(value)) throw new RangeError('Invalid geometry'); }
function clamp(value: number, max: number): number { return Math.max(0, Math.min(value, max)); }
function validateLayout(layout: CollectionBookmarkLayout): { candidates: Set<string>; focus: Set<string>; rowByKey: Map<string, CollectionBookmarkRow> } {
  if (!keyIsValid(layout.scope)) throw new RangeError('Invalid scope');
  const candidates = keysSet(layout.candidateKeys);
  const focus = keysSet(layout.focusKeys);
  if (!focus.has(layout.fallbackFocusKey)) throw new RangeError('Missing fallback focus');
  for (const key of candidates) if (!focus.has(key)) throw new RangeError('Candidate missing from legal focus');
  for (const value of [layout.viewportTop, layout.viewportHeight, layout.maxScroll]) finite(value);
  if (layout.viewportHeight <= 0 || layout.maxScroll < 0) throw new RangeError('Invalid viewport/scroll bounds');
  const rowByKey = new Map<string, CollectionBookmarkRow>();
  let previousBottom = -Infinity;
  const ordered: string[] = [];
  for (const row of layout.rows) {
    finite(row.top); finite(row.height); finite(row.top + row.height);
    if (row.keys.length === 0 || row.height <= 0 || row.top < previousBottom) throw new RangeError('Invalid rendered row');
    for (const key of row.keys) {
      if (!candidates.has(key) || rowByKey.has(key)) throw new RangeError('Invalid row identity');
      rowByKey.set(key, row); ordered.push(key);
    }
    previousBottom = row.top + row.height;
  }
  if (ordered.length !== layout.candidateKeys.length || ordered.some((key, i) => key !== layout.candidateKeys[i])) throw new RangeError('Rows must cover the current ordered candidates exactly');
  return { candidates, focus, rowByKey };
}
/** Old order, not current position, determines repair of a disappeared key. */
function repair(key: string | null, oldOrder: readonly string[], legal: ReadonlySet<string>, first: string | null): string | null {
  if (key !== null && legal.has(key)) return key;
  const index = key === null ? -1 : oldOrder.indexOf(key);
  if (index >= 0) {
    for (let i = index + 1; i < oldOrder.length; i++) if (legal.has(oldOrder[i])) return oldOrder[i];
    for (let i = index - 1; i >= 0; i--) if (legal.has(oldOrder[i])) return oldOrder[i];
  }
  return first;
}

/** Restore anchor first. Pointer returns do not implicitly reveal focus. */
export function restoreCollectionBookmark(bookmark: CollectionBookmark | null, previousCandidateKeys: readonly string[],
  layout: CollectionBookmarkLayout): Readonly<RestoredCollectionBookmark> {
  keysSet(previousCandidateKeys);
  const { candidates, focus, rowByKey } = validateLayout(layout);
  if (bookmark) {
    if (!keyIsValid(bookmark.scope) || !keyIsValid(bookmark.focusKey) ||
      (bookmark.candidateKey !== null && !keyIsValid(bookmark.candidateKey)) ||
      (bookmark.anchorKey !== null && !keyIsValid(bookmark.anchorKey))) throw new RangeError('Invalid bookmark identity');
    finite(bookmark.intraRowOffset);
  }
  const retained = bookmark?.scope === layout.scope ? bookmark : null;
  const first = layout.candidateKeys[0] ?? null;
  const candidateKey = repair(retained?.candidateKey ?? null, retained ? previousCandidateKeys : [], candidates, first);
  const focusKey = retained && focus.has(retained.focusKey) ? retained.focusKey
    : repair(retained?.focusKey ?? null, retained ? previousCandidateKeys : [], candidates, first) ?? layout.fallbackFocusKey;
  const anchor = repair(retained?.anchorKey ?? null, retained ? previousCandidateKeys : [], candidates, first);
  const row = anchor === null ? undefined : rowByKey.get(anchor);
  const intraRowOffset = row ? clamp(retained?.intraRowOffset ?? 0, row.height) : 0;
  const scrollOffset = row ? clamp(row.top + intraRowOffset - layout.viewportTop, layout.maxScroll) : 0;
  return Object.freeze({ bookmark: Object.freeze({ scope: layout.scope, candidateKey, focusKey,
    anchorKey: row?.keys[0] ?? null, intraRowOffset }), scrollOffset });
}

/** Explicit keyboard/controller policy after restore. Fixed controls preserve it. */
export function revealCollectionFocus(scrollOffset: number, focusKey: string, layout: CollectionBookmarkLayout): number {
  finite(scrollOffset);
  const { rowByKey } = validateLayout(layout);
  const row = rowByKey.get(focusKey);
  let offset = clamp(scrollOffset, layout.maxScroll);
  if (!row) return offset;
  if (row.height > layout.viewportHeight) throw new RangeError('Oversized row requires detail reader');
  if (row.top + row.height > layout.viewportTop + offset + layout.viewportHeight) offset = row.top + row.height - layout.viewportTop - layout.viewportHeight;
  if (row.top < layout.viewportTop + offset) offset = row.top - layout.viewportTop;
  return clamp(offset, layout.maxScroll);
}
