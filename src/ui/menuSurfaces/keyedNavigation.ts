import type { FocusDirection } from '../focusList';

/** Rendered targets only. Generation belongs to the scene's committed layout. */
export interface KeyedNavigationNode {
  readonly key: string;
  readonly role: 'action' | 'card' | 'reading';
  /** Complete live-view mapping is a permutation of 0..nodeCount-1. */
  readonly sceneIndex: number;
  /** Present mappings form a permutation of 0..mappedCount-1. */
  readonly scrollIndex?: number;
  readonly centerX: number;
  readonly generation: number;
}
interface LayoutBase {
  readonly generation: number;
  readonly actions: readonly KeyedNavigationNode[];
  /** Outer or local Back is supplied by the active view, never inferred. */
  readonly back: KeyedNavigationNode;
}
export type KeyedNavigationLayout = LayoutBase & ({
  readonly view: 'browse';
  readonly mode: 'compact' | 'wide';
  readonly headerRows: readonly (readonly KeyedNavigationNode[])[];
  /** Decorative group headings are absent; empty groups/rows are skipped. */
  readonly cardGroups: readonly (readonly (readonly KeyedNavigationNode[])[])[];
  readonly retainedCandidateKey?: string;
  readonly emptyControl?: KeyedNavigationNode;
} | {
  readonly view: 'detail';
  readonly reading: KeyedNavigationNode;
});
export interface KeyedNavigationPlan {
  readonly generation: number;
  readonly nodes: readonly Readonly<KeyedNavigationNode>[];
  readonly neighbours: Readonly<Record<string, Readonly<Partial<Record<FocusDirection, string>>>>>;
}
export interface KeyedNavigationStep {
  readonly key: string;
  readonly sceneIndex: number;
  readonly scrollIndex?: number;
  /** Scene-owned scalar receipt; feed it back for a wide inspector Left. */
  readonly departureKey: string | null;
}
interface PlanData {
  readonly byKey: Readonly<Record<string, Readonly<KeyedNavigationNode>>>;
  readonly inspectorKeys: ReadonlySet<string>;
  readonly wide: boolean;
}
// Accept only plans constructed here. The private lookup never escapes.
const plans = new WeakMap<KeyedNavigationPlan, PlanData>();
const directions: readonly FocusDirection[] = ['up', 'down', 'left', 'right'];
function validKey(key: string): boolean { return typeof key === 'string' && key.trim().length > 0; }
function validIndex(index: number): boolean { return Number.isSafeInteger(index) && index >= 0; }

/** Build at mount/reflow/read-model change, then atomically install with hits. */
export function buildKeyedNavigationPlan(layout: KeyedNavigationLayout): KeyedNavigationPlan {
  if (!validIndex(layout.generation)) throw new RangeError('Invalid layout generation');
  if (layout.view !== 'browse' && layout.view !== 'detail') throw new RangeError('Invalid view');
  if (layout.view === 'browse' && layout.mode !== 'compact' && layout.mode !== 'wide') throw new RangeError('Invalid layout mode');
  const byKey: Record<string, Readonly<KeyedNavigationNode>> = Object.create(null);
  const edges: Record<string, Partial<Record<FocusDirection, string>>> = Object.create(null);
  const nodes: Readonly<KeyedNavigationNode>[] = [];
  const sceneIndexes = new Set<number>();
  const scrollIndexes = new Set<number>();
  function add(n: KeyedNavigationNode, role: KeyedNavigationNode['role']): void {
    if (!validKey(n.key) || Object.hasOwn(byKey, n.key)) throw new RangeError('Invalid/duplicate target key');
    if (n.role !== role || (n.scrollIndex !== undefined && role === 'action')) throw new RangeError('Invalid target role');
    if (!validIndex(n.sceneIndex) || sceneIndexes.has(n.sceneIndex)) throw new RangeError('Invalid/duplicate scene index');
    if (n.generation !== layout.generation || !Number.isFinite(n.centerX)) throw new RangeError('Invalid generation/geometry');
    if (n.scrollIndex !== undefined) {
      if (!validIndex(n.scrollIndex) || scrollIndexes.has(n.scrollIndex)) throw new RangeError('Invalid/duplicate scroll index');
      scrollIndexes.add(n.scrollIndex);
    }
    sceneIndexes.add(n.sceneIndex);
    byKey[n.key] = Object.freeze({ key: n.key, role: n.role, sceneIndex: n.sceneIndex,
      ...(n.scrollIndex === undefined ? {} : { scrollIndex: n.scrollIndex }), centerX: n.centerX, generation: n.generation });
    nodes.push(byKey[n.key]);
    edges[n.key] = {};
  }
  function addRows(rows: readonly (readonly KeyedNavigationNode[])[], role: 'action' | 'card'): void {
    for (const row of rows) {
      let previousX = -Infinity;
      for (const n of row) {
        if (n.centerX <= previousX) throw new RangeError('Rendered rows must be ordered left to right');
        add(n, role);
        previousX = n.centerX;
      }
    }
  }
  function edge(from: string, direction: FocusDirection, to: string | undefined): void {
    if (to !== undefined) {
      if (!Object.hasOwn(byKey, from) || !Object.hasOwn(byKey, to)) throw new RangeError('Unresolved navigation edge');
      edges[from][direction] = to;
    }
  }
  function nearest(row: readonly KeyedNavigationNode[], centerX: number): string | undefined {
    let key: string | undefined;
    let distance = Infinity;
    for (const n of row) {
      const nextDistance = Math.abs(n.centerX - centerX);
      // Rows are left-to-right, so a tie keeps the left control.
      if (key === undefined || nextDistance < distance) { key = n.key; distance = nextDistance; }
    }
    return key;
  }
  let retained: string | undefined;
  let first: string;
  if (layout.view === 'browse') {
    const headers = layout.headerRows.filter(row => row.length > 0);
    const rows = layout.cardGroups.flat().filter(row => row.length > 0);
    addRows(headers, 'action');
    addRows(rows, 'card');
    if (layout.emptyControl) {
      if (rows.length) throw new RangeError('Empty control cannot coexist with candidate rows');
      add(layout.emptyControl, 'action');
    }
    for (const n of layout.actions) add(n, 'action');
    add(layout.back, 'action');
    retained = layout.retainedCandidateKey ?? rows[0]?.[0].key;
    if (retained !== undefined && byKey[retained]?.role !== 'card') throw new RangeError('Retained key must resolve to a current card');
    const empty = layout.emptyControl?.key;
    const firstAction = layout.actions[0]?.key;
    first = headers[0]?.[0].key ?? retained ?? empty ?? firstAction ?? layout.back.key;
    for (let r = 0; r < headers.length; r++) for (let c = 0; c < headers[r].length; c++) {
      const n = headers[r][c];
      edge(n.key, 'left', headers[r][c - 1]?.key);
      edge(n.key, 'right', headers[r][c + 1]?.key);
      edge(n.key, 'up', r === 0 ? layout.back.key : nearest(headers[r - 1], n.centerX));
      edge(n.key, 'down', headers[r + 1] ? nearest(headers[r + 1], n.centerX) : retained ?? empty ?? firstAction ?? layout.back.key);
    }
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const n = rows[r][c];
      edge(n.key, 'left', rows[r][c - 1]?.key);
      edge(n.key, 'right', rows[r][c + 1]?.key ?? (layout.mode === 'wide' ? firstAction : undefined));
      edge(n.key, 'up', r ? rows[r - 1][Math.min(c, rows[r - 1].length - 1)].key : nearest(headers.at(-1) ?? [], n.centerX) ?? layout.back.key);
      edge(n.key, 'down', rows[r + 1] ? rows[r + 1][Math.min(c, rows[r + 1].length - 1)].key : firstAction ?? layout.back.key);
    }
    if (empty) {
      edge(empty, 'up', headers.at(-1)?.[0].key ?? layout.back.key);
      edge(empty, 'down', firstAction ?? layout.back.key);
    }
    retained ??= empty ?? headers.at(-1)?.[0].key;
  } else {
    add(layout.reading, 'reading');
    for (const n of layout.actions) add(n, 'action');
    add(layout.back, 'action');
    retained = layout.reading.key;
    first = retained;
    // The scene first consumes reader paging; these edges apply at boundaries.
    edge(retained, 'up', layout.back.key);
    edge(retained, 'down', layout.actions[0]?.key ?? layout.back.key);
  }
  // Nodes cover the complete current live view. Uniqueness/nonnegative
  // integers were checked during add; this final bound also proves no holes.
  // Validate sets, not source order: scene and scroll registration may differ.
  for (const index of sceneIndexes) {
    if (index >= nodes.length) throw new RangeError('Scene indexes must cover the complete live view densely');
  }
  for (const index of scrollIndexes) {
    if (index >= scrollIndexes.size) throw new RangeError('Scroll indexes must cover the mapped subset densely');
  }
  for (let i = 0; i < layout.actions.length; i++) {
    edge(layout.actions[i].key, 'up', layout.actions[i - 1]?.key ?? retained ?? layout.back.key);
    edge(layout.actions[i].key, 'down', layout.actions[i + 1]?.key ?? layout.back.key);
  }
  edge(layout.back.key, 'down', first);
  edge(layout.back.key, 'up', layout.actions.at(-1)?.key ?? retained ?? layout.back.key);
  for (const key of Object.keys(edges)) Object.freeze(edges[key]);
  const plan: KeyedNavigationPlan = Object.freeze({ generation: layout.generation, nodes: Object.freeze(nodes), neighbours: Object.freeze(edges) });
  plans.set(plan, { byKey: Object.freeze(byKey), inspectorKeys: new Set(layout.actions.map(n => n.key)), wide: layout.view === 'browse' && layout.mode === 'wide' });
  return plan;
}

/** One table lookup, no live navigator, listeners, reveal, selection or action. */
export function resolveKeyedNavigation(plan: KeyedNavigationPlan, currentKey: string, direction: FocusDirection,
  generation: number, departureKey: string | null = null): Readonly<KeyedNavigationStep> | null {
  const data = plans.get(plan);
  if (!data || !validIndex(generation) || generation !== plan.generation || !directions.includes(direction) || !Object.hasOwn(data.byKey, currentKey)) return null;
  if (departureKey !== null && (!Object.hasOwn(data.byKey, departureKey) || data.byKey[departureKey].role !== 'card')) return null;
  const current = data.byKey[currentKey];
  const neighbour = data.wide && direction === 'left' && data.inspectorKeys.has(currentKey)
    ? departureKey ?? currentKey
    : plan.neighbours[currentKey][direction] ?? currentKey;
  const target = data.byKey[neighbour];
  const nextDeparture = current.role === 'card' && data.inspectorKeys.has(neighbour) ? currentKey : departureKey;
  return Object.freeze({ key: target.key, sceneIndex: target.sceneIndex,
    ...(target.scrollIndex === undefined ? {} : { scrollIndex: target.scrollIndex }), departureKey: nextDeparture });
}
