import { describe, expect, it } from 'vitest';
import { buildKeyedNavigationPlan, resolveKeyedNavigation, type KeyedNavigationLayout, type KeyedNavigationNode } from '../src/ui/menuSurfaces/keyedNavigation';
import { FocusNavigator, type FocusDirection } from '../src/ui/focusList';

const directions: readonly FocusDirection[] = ['up', 'down', 'left', 'right'];
function node(key: string, sceneIndex: number, role: KeyedNavigationNode['role'] = 'action', centerX = sceneIndex * 10, scrollIndex?: number): KeyedNavigationNode {
  return { key, sceneIndex, role, centerX, generation: 7, ...(scrollIndex === undefined ? {} : { scrollIndex }) };
}
function fixture(count: number, columns: number, mode: 'compact' | 'wide'): Extract<KeyedNavigationLayout, { view: 'browse' }> {
  const cards = Array.from({ length: count }, (_, i) => node(`card:${i}`, 4 + i, 'card', 10 + (i % columns) * 30, i));
  const rows: KeyedNavigationNode[][] = [];
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
  return { view: 'browse', generation: 7, mode, headerRows: [[node('h0', 0, 'action', 0), node('h1', 1, 'action', 60)], [node('h2', 2, 'action', 10), node('h3', 3, 'action', 70)]], cardGroups: [[], rows.slice(0, 1), [], rows.slice(1)], actions: [node('inspect', 4 + count), node('commit', 5 + count)], back: node('back', 6 + count), emptyControl: count ? undefined : node('empty', 7), retainedCandidateKey: count ? `card:${count - 1}` : undefined };
}
// A modified fixture still describes the complete live target list. Preserve
// geometry and keys while reassigning actual scene registration indexes.
function denseBrowse(layout: ReturnType<typeof fixture>): ReturnType<typeof fixture> {
  let index = 0;
  const mapNode = (n: KeyedNavigationNode): KeyedNavigationNode => ({ ...n, sceneIndex: index++ });
  const headerRows = layout.headerRows.map(row => row.map(mapNode));
  const cardGroups = layout.cardGroups.map(group => group.map(row => row.map(mapNode)));
  const emptyControl = layout.emptyControl ? mapNode(layout.emptyControl) : undefined;
  const actions = layout.actions.map(mapNode);
  const back = mapNode(layout.back);
  return { ...layout, headerRows, cardGroups, emptyControl, actions, back };
}
// Independent oracle: find the current node in the rendered arrays and evaluate
// a single rule directly. Production constructs a table rather than searching.
function oracle(layout: ReturnType<typeof fixture>, key: string, direction: FocusDirection, departure: string | null): string {
  const headers = layout.headerRows.filter(r => r.length);
  const rows = layout.cardGroups.flat().filter(r => r.length);
  const retained = layout.retainedCandidateKey ?? rows[0]?.[0]?.key;
  const nearest = (row: readonly KeyedNavigationNode[], x: number) => [...row].sort((a, b) => Math.abs(a.centerX - x) - Math.abs(b.centerX - x) || a.centerX - b.centerX)[0]?.key;
  for (let r = 0; r < headers.length; r++) {
    const c = headers[r].findIndex(n => n.key === key);
    if (c < 0) continue;
    if (direction === 'left') return headers[r][c - 1]?.key ?? key;
    if (direction === 'right') return headers[r][c + 1]?.key ?? key;
    if (direction === 'up') return r ? nearest(headers[r - 1], headers[r][c].centerX)! : layout.back.key;
    return headers[r + 1] ? nearest(headers[r + 1], headers[r][c].centerX)! : retained ?? layout.emptyControl?.key ?? layout.actions[0]?.key ?? layout.back.key;
  }
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].findIndex(n => n.key === key);
    if (c < 0) continue;
    if (direction === 'left') return rows[r][c - 1]?.key ?? key;
    if (direction === 'right') return rows[r][c + 1]?.key ?? (layout.mode === 'wide' ? layout.actions[0]?.key : undefined) ?? key;
    if (direction === 'up') return r ? rows[r - 1][Math.min(c, rows[r - 1].length - 1)].key : nearest(headers.at(-1) ?? [], rows[r][c].centerX) ?? layout.back.key;
    return rows[r + 1] ? rows[r + 1][Math.min(c, rows[r + 1].length - 1)].key : layout.actions[0]?.key ?? layout.back.key;
  }
  const a = layout.actions.findIndex(n => n.key === key);
  if (a >= 0) {
    if (direction === 'down') return layout.actions[a + 1]?.key ?? layout.back.key;
    if (direction === 'up') return layout.actions[a - 1]?.key ?? retained ?? layout.emptyControl?.key ?? headers.at(-1)?.[0]?.key ?? layout.back.key;
    if (direction === 'left' && layout.mode === 'wide') return departure ?? key;
    return key;
  }
  if (key === layout.emptyControl?.key) {
    if (direction === 'up') return headers.at(-1)?.[0]?.key ?? layout.back.key;
    if (direction === 'down') return layout.actions[0]?.key ?? layout.back.key;
  }
  if (key === layout.back.key) {
    if (direction === 'down') return headers[0]?.[0]?.key ?? retained ?? layout.emptyControl?.key ?? layout.actions[0]?.key ?? key;
    if (direction === 'up') return layout.actions.at(-1)?.key ?? retained ?? layout.emptyControl?.key ?? headers.at(-1)?.[0]?.key ?? key;
  }
  return key;
}

describe('keyed navigation plan', () => {
  for (const count of [0, 1, 2, 8, 9, 10, 50]) for (const columns of [2, 3]) for (const mode of ['compact', 'wide'] as const) {
    it(`matches rendered-row oracle for every node/direction: ${count}/${columns}/${mode}`, () => {
      const layout = fixture(count, columns, mode);
      const plan = buildKeyedNavigationPlan(layout);
      const departure = count ? 'card:0' : null;
      for (const n of plan.nodes) for (const direction of directions) {
        const result = resolveKeyedNavigation(plan, n.key, direction, 7, departure)!;
        expect(result.key).toBe(oracle(layout, n.key, direction, departure));
        const target = plan.nodes.find(t => t.key === result.key)!;
        expect(result.sceneIndex).toBe(target.sceneIndex);
        expect(result.scrollIndex).toBe(target.scrollIndex);
        expect(result.departureKey).toBe(n.role === 'card' && target.role === 'action' && layout.actions.some(a => a.key === target.key) ? n.key : departure);
      }
      const visited = new Set([layout.back.key]);
      const pending = [layout.back.key];
      while (pending.length) {
        for (const direction of directions) {
          const target = resolveKeyedNavigation(plan, pending[0], direction, 7, departure)!.key;
          if (!visited.has(target)) { visited.add(target); pending.push(target); }
        }
        pending.shift();
      }
      expect([...visited].sort()).toEqual(plan.nodes.map(n => n.key).sort());
    });
  }
  it('uses left center tie-breaks and skips empty rendered rows/groups', () => {
    const layout = fixture(2, 2, 'compact');
    const tied = { ...layout, headerRows: [[], [node('a', 0, 'action', 0), node('b', 1, 'action', 20)], [], [node('c', 2, 'action', 10)]] };
    const plan = buildKeyedNavigationPlan(denseBrowse(tied));
    expect(resolveKeyedNavigation(plan, 'c', 'up', 7)?.key).toBe('a');
    expect(resolveKeyedNavigation(plan, 'card:0', 'up', 7)?.key).toBe('c');
  });
  it('matches the oracle across interior ragged rows and asymmetric grouped geometry', () => {
    const base = fixture(6, 3, 'wide');
    const cards = base.cardGroups.flat().flat();
    const layout = { ...base, cardGroups: [[], [[cards[0], cards[1]]], [[], [cards[2]], [], [cards[3], cards[4], cards[5]]]], retainedCandidateKey: 'card:4' };
    const plan = buildKeyedNavigationPlan(layout);
    for (const n of plan.nodes) for (const d of directions) expect(resolveKeyedNavigation(plan, n.key, d, 7, 'card:1')?.key).toBe(oracle(layout, n.key, d, 'card:1'));
    expect(resolveKeyedNavigation(plan, 'card:1', 'down', 7)?.key).toBe('card:2');
    expect(resolveKeyedNavigation(plan, 'card:5', 'up', 7)?.key).toBe('card:2');
  });
  it('returns exact scene-owned departure, independent of retained selection', () => {
    const plan = buildKeyedNavigationPlan(fixture(9, 2, 'wide'));
    const enter = resolveKeyedNavigation(plan, 'card:1', 'right', 7)!;
    expect(enter).toMatchObject({ key: 'inspect', departureKey: 'card:1' });
    expect(resolveKeyedNavigation(plan, 'commit', 'left', 7, enter.departureKey)?.key).toBe('card:1');
    expect(resolveKeyedNavigation(plan, 'inspect', 'up', 7, enter.departureKey)?.key).toBe('card:8');
    expect(resolveKeyedNavigation(plan, 'inspect', 'left', 7)?.key).toBe('inspect');
    expect(resolveKeyedNavigation(plan, 'inspect', 'left', 7, 'h0')).toBeNull();
    expect(resolveKeyedNavigation(plan, 'card:1', 'right', 7)?.departureKey).toBe('card:1');
  });
  it('keeps compact edge still and records Down departure', () => {
    const plan = buildKeyedNavigationPlan(fixture(9, 2, 'compact'));
    expect(resolveKeyedNavigation(plan, 'card:1', 'right', 7)?.key).toBe('card:1');
    expect(resolveKeyedNavigation(plan, 'card:8', 'down', 7)).toMatchObject({ key: 'inspect', departureKey: 'card:8' });
    expect(resolveKeyedNavigation(plan, 'inspect', 'left', 7, 'card:1')?.key).toBe('inspect');
  });
  it('supports empty/no-action/no-header views without phantom targets', () => {
    const plan = buildKeyedNavigationPlan(denseBrowse({ ...fixture(0, 2, 'wide'), headerRows: [], actions: [], emptyControl: undefined }));
    expect(plan.nodes.map(n => n.key)).toEqual(['back']);
    for (const d of directions) expect(resolveKeyedNavigation(plan, 'back', d, 7)?.key).toBe('back');
    const cards = buildKeyedNavigationPlan(denseBrowse({ ...fixture(1, 2, 'wide'), headerRows: [], actions: [] }));
    expect(resolveKeyedNavigation(cards, 'card:0', 'right', 7)?.key).toBe('card:0');
    expect(resolveKeyedNavigation(cards, 'back', 'up', 7)?.key).toBe('card:0');
  });
  it('contains only local reading/actions/Back in detail', () => {
    for (const actions of [[], [node('confirm', 1)]]) {
      const plan = buildKeyedNavigationPlan({ view: 'detail', generation: 7, reading: node('read', 0, 'reading', 0, 0), actions, back: node('local:back', actions.length + 1) });
      for (const n of plan.nodes) for (const direction of directions) {
        const expected = direction === 'up' ? n.key === 'read' ? 'local:back' : n.key === 'local:back' ? actions.at(-1)?.key ?? 'read' : 'read' : direction === 'down' ? n.key === 'local:back' ? 'read' : n.key === 'read' ? actions[0]?.key ?? 'local:back' : 'local:back' : n.key;
        expect(resolveKeyedNavigation(plan, n.key, direction, 7)?.key).toBe(expected);
      }
      expect(resolveKeyedNavigation(plan, 'card:0', 'down', 7)).toBeNull();
    }
  });
  it('fails closed for unknown current/direction/generation and forged plans', () => {
    const plan = buildKeyedNavigationPlan(fixture(1, 2, 'compact'));
    expect(resolveKeyedNavigation(plan, 'missing', 'up', 7)).toBeNull();
    expect(resolveKeyedNavigation(plan, 'h0', 'diagonal' as FocusDirection, 7)).toBeNull();
    for (const generation of [6, NaN, Infinity, 7.5]) expect(resolveKeyedNavigation(plan, 'h0', 'up', generation)).toBeNull();
    expect(resolveKeyedNavigation({ ...plan }, 'h0', 'up', 7)).toBeNull();
  });
  it('rejects duplicate/malformed nodes, references and roles', () => {
    const base = fixture(1, 2, 'compact');
    const badNodes = [node('h0', 0), node('', 200), node('x', -1), node('x', 1.5), { ...node('x', 200), generation: 6 }, node('x', 200, 'action', NaN), node('x', 200, 'action', Infinity), node('x', 200, 'card'), node('x', 200, 'action', 10, 2)];
    for (const n of badNodes) expect(() => buildKeyedNavigationPlan({ ...base, actions: [n] })).toThrow();
    for (const scrollIndex of [-1, 0.5, NaN]) expect(() => buildKeyedNavigationPlan({ ...base, cardGroups: [[[node('c', 200, 'card', 0, scrollIndex)]]] })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, cardGroups: [[[node('c', 200, 'card', 0, 0), node('d', 201, 'card', 20, 0)]]] })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, retainedCandidateKey: 'missing' })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, retainedCandidateKey: 'h0' })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, headerRows: [[node('right', 200, 'action', 20), node('left', 201, 'action', 0)]] })).toThrow();
    expect(() => buildKeyedNavigationPlan({ view: 'detail', generation: 7, reading: node('r', 0, 'card'), actions: [], back: node('b', 1) })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, generation: -1 })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, generation: Infinity })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, mode: 'linear' as 'compact' })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, emptyControl: node('empty', 91) })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, actions: [node('x', 200, 'reading')] })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, back: node('b', 300, 'card') })).toThrow();
  });
  it('rejects out-of-range scene indexes that the real navigator would clamp onto another key', () => {
    const malformed: KeyedNavigationLayout = { view: 'detail', generation: 7, reading: node('read', 0, 'reading', 0, 0), actions: [], back: node('local:back', 999) };
    const navigator = new FocusNavigator();
    navigator.setCount(2);
    // The declared scene mapping has no local Back at index 1. Applying its
    // index through the real scene primitive silently clamps to that index.
    navigator.setIndex(malformed.back.sceneIndex);
    expect(navigator.index).toBe(1);
    const declaredTargets = [malformed.reading, malformed.back];
    expect(declaredTargets.find(n => n.sceneIndex === navigator.index)?.key).not.toBe(malformed.back.key);
    expect(() => buildKeyedNavigationPlan(malformed)).toThrow();
  });
  it('rejects sparse/duplicate scene maps without requiring registration source order', () => {
    const base: KeyedNavigationLayout = { view: 'detail', generation: 7, reading: node('read', 0, 'reading', 0, 0), actions: [], back: node('local:back', 1) };
    for (const backIndex of [0, 2, 999]) expect(() => buildKeyedNavigationPlan({ ...base, back: node('local:back', backIndex) })).toThrow();
    expect(() => buildKeyedNavigationPlan({ ...base, reading: node('read', 1, 'reading', 0, 0), back: node('local:back', 2) })).toThrow();
    const permutation = buildKeyedNavigationPlan({ ...base, reading: node('read', 1, 'reading', 0, 0), back: node('local:back', 0) });
    expect(permutation.nodes.map(n => n.sceneIndex)).toEqual([1, 0]);
    expect(resolveKeyedNavigation(permutation, 'read', 'up', 7)).toMatchObject({ key: 'local:back', sceneIndex: 0 });
  });
  it('rejects non-dense scroll subsets, allowing unmapped cards and permuted local indexes', () => {
    const base = fixture(2, 2, 'compact');
    for (const indexes of [[999, 1], [0, 2], [1, 2], [0, 0]]) {
      const cards = base.cardGroups.flat().flat().map((n, i) => ({ ...n, scrollIndex: indexes[i] }));
      expect(() => buildKeyedNavigationPlan({ ...base, cardGroups: [[cards]] })).toThrow();
    }
    const cards = base.cardGroups.flat().flat();
    const permuted = buildKeyedNavigationPlan({ ...base, cardGroups: [[cards.map((n, i) => ({ ...n, scrollIndex: 1 - i }))]] });
    expect(resolveKeyedNavigation(permuted, 'card:0', 'right', 7)?.scrollIndex).toBe(0);
    const { scrollIndex: ignored, ...unmapped } = cards[1];
    expect(ignored).toBe(1);
    const subset = buildKeyedNavigationPlan({ ...base, cardGroups: [[[cards[0], unmapped]]] });
    expect(resolveKeyedNavigation(subset, 'card:0', 'right', 7)?.scrollIndex).toBeUndefined();
    const noMappings = buildKeyedNavigationPlan({ ...base, cardGroups: [[cards.map(n => ({ ...n, scrollIndex: undefined }))]] });
    expect(resolveKeyedNavigation(noMappings, 'card:0', 'down', 7)?.key).toBe('inspect');
  });
  it('copies/freezes inputs and supports prototype-looking semantic keys deterministically', () => {
    const layout = denseBrowse({ ...fixture(0, 2, 'compact'), headerRows: [[node('__proto__', 0), node('constructor', 1)]], actions: [] });
    const before = structuredClone(layout);
    const plan = buildKeyedNavigationPlan(layout);
    expect(layout).toEqual(before);
    (layout.headerRows[0] as KeyedNavigationNode[])[0] = node('changed', 0);
    expect(resolveKeyedNavigation(plan, '__proto__', 'right', 7)?.key).toBe('constructor');
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.nodes)).toBe(true);
    expect(Object.isFrozen(plan.nodes[0])).toBe(true);
    expect(Object.isFrozen(plan.neighbours)).toBe(true);
    expect(Object.isFrozen(plan.neighbours.__proto__)).toBe(true);
    const again = buildKeyedNavigationPlan(before);
    expect(plan).toEqual(again);
  });
});
