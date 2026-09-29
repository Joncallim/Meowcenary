import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const selectedMaster = 'assets-src/world/junkyard/concepts/junkyard-world-kit-selected.png';
const selectedDigest = 'fafbd2d1663868f6f47e691108fc536555e0a2dcaf51ca52b652456a711e6dee';

describe('Junkyard production world kit', () => {
  it('pins the approved selected master before deriving production assets', () => {
    expect(createHash('sha256').update(readFileSync(selectedMaster)).digest('hex')).toBe(selectedDigest);
    const builder = readFileSync('docs/art/scripts/build-junkyard-concept-assets.py', 'utf8');
    expect(builder).toContain(selectedDigest);
    expect(builder).toContain('selected Junkyard master digest mismatch');
  });
});
