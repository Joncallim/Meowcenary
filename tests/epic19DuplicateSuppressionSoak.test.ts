import { describe, expect, it } from 'vitest';
import { createGameSoakHarness } from './helpers/epic19SoakHarness';

const CASES = [['card choice', 32], ['rack merge', 32], ['purchase', 32], ['reset', 32]] as const;

describe('Epic 19 Slice 5 duplicate-suppression soak', () => {
  it.each(CASES)('keeps one simultaneous held input to one %s effect across %i trials', (_surface, count) => {
    for (let trial = 0; trial < count; trial += 1) {
      const h = createGameSoakHarness({ fixtureSeed: 0x19050003 + trial, runSeed: 3000 + trial, storageKey: `e19-duplicate-${trial}` });
      const chosen: string[] = []; h.bus.on('card:chosen', (e) => chosen.push(e.upgradeId));
      const raw: string[] = []; h.inputController.onAction('confirm', (e) => raw.push(e.source));
      h.openChooser(); h.simultaneousConfirmDown(); h.poll();
      for (let i = 0; i < 8; i += 1) h.poll();
      h.keyUp('Enter'); h.poll(); h.padUp(0); h.poll();
      expect(raw).toEqual(['keyboard']); expect(chosen).toHaveLength(1);
      h.simultaneousConfirmUp(); h.poll(); h.simultaneousConfirmDown(); h.poll();
      expect(raw).toHaveLength(2); h.destroy();
    }
  });
});
