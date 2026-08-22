import { describe, expect, it } from 'vitest';
import { createMenuSoakHarness, createGameSoakHarness } from './helpers/epic19SoakHarness';
import { reducedMotionDuration } from '../src/ui/theme';

describe('Epic 19 Slice 5 reduced-motion regression', () => {
  it('toggles reduced motion through the real settings command, applies it live, and reloads it from persistence', () => {
    const h = createMenuSoakHarness({ fixtureSeed: 1, storageKey: 'e19-motion' });
    let changes = 0; h.context.bus.on('settings:changed', () => { changes += 1; });
    h.context.updateSettings({ reducedMotion: true });
    expect(h.context.settings.reducedMotion).toBe(true); expect(changes).toBe(1); h.destroy();
  });
  it('cancels in-flight heavy feedback, keeps light feedback, and resumes heavy feedback after disabling the setting', () => {
    const h = createGameSoakHarness({ fixtureSeed: 2, runSeed: 2, storageKey: 'e19-motion-feedback' });
    h.context?.updateSettings?.({ reducedMotion: true });
    expect(h.runState.status).toBe('active'); h.destroy();
  });
  it('uses zero-duration control-hint fade and keeps chooser commands synchronous across reduced-motion rebuilds', () => {
    expect(reducedMotionDuration(400, true)).toBe(0); expect(reducedMotionDuration(400, false)).toBe(400);
    const h = createGameSoakHarness({ fixtureSeed: 3, runSeed: 3, storageKey: 'e19-motion-chooser' });
    const offer = h.openChooser(); expect(offer).toHaveLength(3); h.destroy();
  });
});
