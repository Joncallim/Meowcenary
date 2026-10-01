import { expect, it } from 'vitest';
import { collectDisplayObjects, displayObjectChange, type DisplayNode } from '../src/platform/performanceDisplay';

it('counts nested containers once and distinguishes retained identities from replacements', () => {
  const stable: DisplayNode = {};
  const removed: DisplayNode = {};
  const added: DisplayNode = {};
  const before = collectDisplayObjects([{ list: [stable, removed, stable] }]);
  const after = collectDisplayObjects([{ list: [stable, added] }]);
  expect(displayObjectChange(before, after)).toEqual({ created: 2, destroyed: 2, stableObjects: 3 });
});
it('does not loop on duplicate/cyclic diagnostic children', () => {
  const nodes: DisplayNode[] = [];
  const root: DisplayNode = { list: nodes };
  nodes.push(root);
  expect(collectDisplayObjects([root]).size).toBe(1);
});
