import { describe, expect, it } from 'vitest';
import {
  createMenuSoakHarness,
  createGameSoakHarness,
} from './helpers/epic19SoakHarness';
import { SaveManager } from '../src/systems/save';
import { FeedbackSystem, PhaserFeedbackRenderer } from '../src/systems/feedback';

function findHintText(h: { gameScene: unknown }) {
  const objects = (h.gameScene as {
    objects: readonly { state: { kind: string; text: string; destroyed: boolean; alpha: number } }[];
  }).objects;
  return objects.find(
    (object) =>
      object.state.kind === 'text' &&
      !object.state.destroyed &&
      (object.state.text.startsWith('Drag to move')
        || object.state.text.startsWith('WASD')
        || object.state.text.startsWith('Left stick')),
  );
}

describe('Epic 19 Slice 5 reduced-motion regression', () => {
  it('toggles reduced motion through the real settings command, applies it live, and reloads it from persistence', () => {
    const h = createMenuSoakHarness({ fixtureSeed: 1, storageKey: 'e19-motion-settings' });
    let changes = 0;
    h.context.bus.on('settings:changed', () => { changes += 1; });

    // Home (Start) → Settings (row 5): navDown ×5, then confirm.
    for (let i = 0; i < 5; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
    h.padDown(0); h.poll(); h.padUp(0); h.poll();
    expect(h.menuSnapshot().panel).toBe('settings');

    // Settings rows: Mute(0), Music Volume(1), SFX Volume(2), Reduced
    // Motion(3), Back(4). Focus the Reduced Motion row.
    for (let i = 0; i < 3; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
    const rowRing = h.ringedTargetIndex();
    expect(h.textContents()).toContain('Reduced Motion: Off');

    // Confirm on the row: toggles on through the real settings command.
    h.padDown(0); h.poll(); h.padUp(0); h.poll();
    expect(changes).toBe(1);
    expect(h.context.settings.reducedMotion).toBe(true);
    expect(h.textContents()).toContain('Reduced Motion: On');
    // Same-panel rebuild preserves the row focus.
    expect(h.ringedTargetIndex()).toBe(rowRing);
    expect(h.focusRingCount()).toBe(1);

    // Reload from persistence over the same storage adapter.
    const reloaded = new SaveManager(h.storage, h.storageKey, h.context.metaUpgrades.maxLevels()).load();
    expect(reloaded.settings.reducedMotion).toBe(true);

    // Toggle back off: exactly one more settings:changed, persisted false.
    h.padDown(0); h.poll(); h.padUp(0); h.poll();
    expect(changes).toBe(2);
    expect(h.context.settings.reducedMotion).toBe(false);
    expect(h.textContents()).toContain('Reduced Motion: Off');
    expect(h.ringedTargetIndex()).toBe(rowRing);
    const reloadedOff = new SaveManager(h.storage, h.storageKey, h.context.metaUpgrades.maxLevels()).load();
    expect(reloadedOff.settings.reducedMotion).toBe(false);
    h.destroy();
  });

  it('cancels in-flight heavy feedback, keeps light feedback, and resumes heavy feedback after disabling the setting', () => {
    const h = createGameSoakHarness({ fixtureSeed: 2, runSeed: 2, storageKey: 'e19-motion-feedback' });
    const renderer = new PhaserFeedbackRenderer({
      scene: h.gameScene as never,
      maxEffects: 96,
      maxHeavyEffects: 72,
      weaponFeel: [],
    });
    const feedback = new FeedbackSystem({ bus: h.bus, settings: h.context.settings, renderer });

    // Begin heavy feedback: a charger dash trail (3 heavy dots) plus a
    // damage shake under heavy motion (reduced motion starts false).
    h.bus.emit('enemy:dashed', { x: 10, y: 10, dirX: 1, dirY: 0 });
    h.bus.emit('player:damaged', { amount: 5, healthRemaining: 95 });
    expect(renderer.activeEffectCount).toBe(3);
    expect(h.shakeSpy()).toHaveBeenCalled();

    // Toggle true via the real context boundary: immediate shake reset and
    // heavy release; light feedback remains available.
    h.context.updateSettings({ reducedMotion: true });
    expect(h.shakeResetSpy()).toHaveBeenCalled();
    expect(renderer.activeEffectCount).toBe(0);

    // Light feedback still works under reduced motion (stationary cue only).
    h.bus.emit('projectile:hit', { x: 20, y: 20, family: 'pistol', tier: 1, weaponId: 'w', damage: 1, killed: false });
    expect(renderer.activeEffectCount).toBe(1);

    // Later heavy events are gated while the setting is true.
    h.bus.emit('enemy:dashed', { x: 30, y: 30, dirX: 0, dirY: 1 });
    expect(renderer.activeEffectCount).toBe(1);

    // Disable the setting: a fresh heavy event appears (G-15 recovery).
    h.context.updateSettings({ reducedMotion: false });
    h.bus.emit('enemy:dashed', { x: 40, y: 40, dirX: 1, dirY: 0 });
    expect(renderer.activeEffectCount).toBe(4);

    feedback.destroy();
    h.destroy();
  });

  it('uses zero-duration control-hint fade and keeps chooser commands synchronous across reduced-motion rebuilds', () => {
    // Reduced motion ON: the hint fades immediately with NO tween scheduled.
    const reduced = createGameSoakHarness({ fixtureSeed: 3, runSeed: 3, storageKey: 'e19-motion-hint-on' });
    reduced.context.updateSettings({ reducedMotion: true });
    for (let i = 0; i < 140; i += 1) reduced.poll(16); // 2240ms ≥ hint lifetime
    expect(reduced.tweenAdds()).toHaveLength(0);
    const reducedHint = findHintText(reduced);
    expect(reducedHint).toBeDefined();
    expect(reducedHint!.state.alpha).toBe(0);
    reduced.destroy();

    // Reduced motion OFF: the existing 400ms hint tween path is scheduled —
    // the only current positive-duration presentation path.
    const normal = createGameSoakHarness({ fixtureSeed: 4, runSeed: 4, storageKey: 'e19-motion-hint-off' });
    for (let i = 0; i < 140; i += 1) normal.poll(16);
    expect(normal.tweenAdds()).toHaveLength(1);
    expect(normal.tweenAdds()[0]!.duration).toBe(400);
    expect(normal.tweenAdds()[0]!.targets).toBeDefined();
    const normalHint = findHintText(normal);
    expect(normalHint).toBeDefined();
    expect(normalHint!.state.alpha).toBe(1);
    normal.destroy();

    // Chooser (MOTION-03): each render/resize rebuild re-reads the real
    // setting, keeps the current offer committed, preserves focus, and
    // accepts confirm synchronously under BOTH values. NO chooser-duration,
    // tween-cancellation, or visual-delta claims exist on main.
    for (const reducedMotion of [true, false]) {
      const h = createGameSoakHarness({
        fixtureSeed: 10 + (reducedMotion ? 1 : 0),
        runSeed: 10 + (reducedMotion ? 1 : 0),
        storageKey: `e19-motion-chooser-${reducedMotion}`,
      });
      h.context.updateSettings({ reducedMotion });
      const offer = h.openChooser();
      expect(offer).toHaveLength(3);
      expect(h.chooserDiagnostics().reducedMotion).toBe(reducedMotion);
      const offerId = h.chooserDiagnostics().offerId;

      // Keyboard/gamepad focus: one navRight focuses the second card.
      h.padDown(15); h.poll(); h.padUp(15); h.poll();
      expect(h.chooserRingedCardIndex()).toBe(1);

      // Resize rebuilds re-read the setting, keep the offer committed, and
      // preserve the focused index (clamped only when the count shrinks).
      h.resizeTo(844, 390);
      expect(h.chooserDiagnostics().offerId).toBe(offerId);
      expect(h.chooserDiagnostics().reducedMotion).toBe(reducedMotion);
      expect(h.focusSignature()).toEqual([0, 1, 0]);
      h.resizeTo(390, 844);
      expect(h.chooserDiagnostics().offerId).toBe(offerId);
      expect(h.chooserDiagnostics().reducedMotion).toBe(reducedMotion);
      expect(h.focusSignature()).toEqual([0, 1, 0]);

      // Confirm is synchronous under both values: one card:chosen, chooser
      // closes, run resumes.
      const chosen: string[] = [];
      h.bus.on('card:chosen', (e: { upgradeId: string }) => chosen.push(e.upgradeId));
      h.padDown(0); h.poll(); h.padUp(0); h.poll();
      expect(chosen).toHaveLength(1);
      expect(h.chooserDiagnostics().choiceIds).toEqual([]);
      expect(h.runState.status).toBe('active');
      h.destroy();
    }
  });
});
