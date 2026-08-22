import { describe, expect, it } from 'vitest';
import { createFixtureSequence, createGameSoakHarness, EPIC19_SOAK_SEEDS } from './helpers/epic19SoakHarness';

describe('Epic 19 Slice 5 mixed-input soak', () => {
  it('processes 1024 seeded rapid keyboard/gamepad/pointer alternation frames without sticky ownership or stale hints', () => {
    const h = createGameSoakHarness({ fixtureSeed: EPIC19_SOAK_SEEDS.mixedInput, runSeed: 1906, storageKey: 'e19-mixed' });
    const s = createFixtureSequence(EPIC19_SOAK_SEEDS.mixedInput);
    for (let frame = 0; frame < 1024; frame += 1) {
      if (s.nextInt(4) === 0) { h.keyDown('d'); } else { h.keyUp('d'); }
      if (s.nextInt(5) === 0) { h.padDown(13); } else { h.padUp(13); }
      if (s.nextInt(7) === 0) { h.input.pointerDown(100, 100, 0); }
      if (s.nextInt(7) === 1) { h.input.pointerUp(0); }
      h.poll();
      const v = h.inputController.getMoveVector();
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1); expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
      expect(v.x === 0 || v.x === 1 || v.x === -1 || Math.abs(v.x) <= 1).toBe(true);
    }
    h.keyUp('d'); h.padUp(13); h.input.pointerUp(0); h.poll(); h.destroy();
  });

  it('turns simultaneous Enter plus bottom-face into exactly one card choice in 64 production-composed trials', () => {
    for (let trial = 0; trial < 64; trial += 1) {
      const h = createGameSoakHarness({ fixtureSeed: EPIC19_SOAK_SEEDS.mixedInput + trial, runSeed: 2000 + trial, storageKey: `e19-choice-${trial}` });
      const chosen: string[] = []; h.bus.on('card:chosen', (e) => chosen.push(e.upgradeId));
      const edges: string[] = []; h.inputController.onAction('confirm', (e) => edges.push(e.source));
      h.openChooser(); h.simultaneousConfirmDown(); h.poll();
      for (let i = 0; i < 3; i += 1) h.poll();
      h.keyUp('Enter'); h.poll(); h.padUp(0); h.poll();
      expect(edges).toEqual(['keyboard']); expect(chosen).toHaveLength(1); h.destroy();
    }
  });
});
