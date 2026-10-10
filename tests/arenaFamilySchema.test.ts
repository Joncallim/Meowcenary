import { describe, expect, it } from 'vitest';
import { collectGameDataErrors, loadGameData } from '../src/systems/validation';
const base = loadGameData();
function errors(families: unknown) {
  const data = structuredClone(base);
  Object.assign(data.arenas[0].generation!, { families });
  return collectGameDataErrors(data);
}
const family = { id: 'fixture-family', assemblies: [{ x: 200, y: 200, columns: 4, rows: 4 }] };
describe('data-owned arena family schema', () => {
  it('accepts optional bounded families while preserving legacy generation', () => {
    expect(collectGameDataErrors(base)).toEqual([]);
    expect(errors([family])).toEqual([]);
  });
  it.each([[], Array(9).fill(family), [family, family], [{ ...family, unknown: true }], [{ ...family, assemblies: [] }], [{ ...family, assemblies: [{ x: -1, y: 0, columns: 4, rows: 4 }] }], [{ ...family, assemblies: [{ x: 0, y: 0, columns: 1, rows: 1 }] }], [{ ...family, assemblies: [{ x: 0, y: 0, columns: 8, rows: 8 }] }], [{ ...family, assemblies: [{ x: 0, y: 0, columns: 2.5, rows: 8 }] }]])('rejects malformed, unbounded or duplicate family data: %j', families => {
    expect(errors(families).length).toBeGreaterThan(0);
  });
});
