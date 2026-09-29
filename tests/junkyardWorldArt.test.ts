import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const selectedMaster = 'assets-src/world/junkyard/concepts/junkyard-world-kit-selected.png';
const selectedDigest = 'fafbd2d1663868f6f47e691108fc536555e0a2dcaf51ca52b652456a711e6dee';
const builderPath = 'docs/art/scripts/build-junkyard-concept-assets.py';

describe('Junkyard production world kit', () => {
  it('pins the approved selected master before deriving production assets', () => {
    expect(createHash('sha256').update(readFileSync(selectedMaster)).digest('hex')).toBe(selectedDigest);
    const builder = readFileSync(builderPath, 'utf8');
    expect(builder).toContain(selectedDigest);
    expect(builder).toContain('selected Junkyard master digest mismatch');
    expect(() => execFileSync('python3', [builderPath, '--check'])).not.toThrow();

    const root = mkdtempSync(join(tmpdir(), 'meow-junkyard-master-'));
    try {
      const isolatedBuilder = join(root, builderPath);
      const isolatedMaster = join(root, selectedMaster);
      mkdirSync(join(root, 'docs/art/scripts'), { recursive: true });
      mkdirSync(join(root, 'assets-src/world/junkyard/concepts'), { recursive: true });
      copyFileSync(builderPath, isolatedBuilder);
      writeFileSync(isolatedMaster, Buffer.concat([readFileSync(selectedMaster), Buffer.from([0])]));
      const drifted = spawnSync('python3', [isolatedBuilder, '--check'], { encoding: 'utf8' });
      expect(drifted.status).not.toBe(0);
      expect(`${drifted.stdout}${drifted.stderr}`).toContain('selected Junkyard master digest mismatch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
