import { describe, expect, it } from 'vitest';
import { createMenuSoakHarness, createGameSoakHarness } from './helpers/epic19SoakHarness';

const REFERENCE_VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 }, { name: 'landscape container', width: 844, height: 390 },
  { name: 'iPad portrait', width: 1024, height: 1366 }, { name: 'desktop', width: 1280, height: 720 },
] as const;

describe('Epic 19 Slice 5 resize/FIT regression', () => {
  it.each(REFERENCE_VIEWPORTS)('preserves committed focus and command ownership at $name', ({ width, height }) => {
    const h = createMenuSoakHarness({ fixtureSeed: width, storageKey: `e19-resize-${width}` });
    const before = h.focusRingCount(); h.resizeTo(width, height); h.resizeTo(390, 844);
    expect(h.focusRingCount()).toBe(before); expect(h.sceneCommands()).toEqual({ start: 0, restart: 0 }); h.destroy();
    const game = createGameSoakHarness({ fixtureSeed: height, runSeed: width, storageKey: `e19-resize-game-${width}` });
    game.resizeTo(width, height); expect(game.runState.status).toBe('active'); game.destroy();
  });
});
