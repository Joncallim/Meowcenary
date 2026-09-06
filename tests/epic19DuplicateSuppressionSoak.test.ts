import { describe, expect, it } from 'vitest';
import {
  createGameSoakHarness,
  createMenuSoakHarness,
  EPIC19_SOAK_SEEDS,
} from './helpers/epic19SoakHarness';
import type { InputController } from '../src/systems/input';

const CASES = [
  ['card choice', 32],
  ['rack merge', 32],
  ['settings toggle', 32],
  ['character select', 32],
] as const;

interface RawConfirmSpy {
  readonly raw: Array<{ action: string; source: string }>;
}

function attachRawConfirmSpy(h: { inputController: InputController }): RawConfirmSpy {
  const raw: Array<{ action: string; source: string }> = [];
  h.inputController.onAction('confirm', (edge) => raw.push(edge));
  return { raw };
}

function driveSimultaneousPattern(
  h: { simultaneousConfirmDown: () => void; poll: (dtMs?: number) => void; keyUp: (key: string) => void; padUp: (position: number) => void },
): void {
  h.simultaneousConfirmDown();
  h.poll();
  for (let i = 0; i < 8; i += 1) h.poll();
  h.keyUp('Enter');
  h.poll();
  h.poll();
  h.padUp(0);
  h.poll();
}

function cardChoiceTrial(trial: number): void {
  const h = createGameSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    runSeed: 3000 + trial,
    storageKey: `e19-dup-card-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  const chosen: string[] = [];
  h.bus.on('card:chosen', (e: { upgradeId: string }) => chosen.push(e.upgradeId));
  let offered = 0;
  h.bus.on('card:offered', () => { offered += 1; });
  let uiConfirms = 0;
  h.bus.on('ui:confirm', () => { uiConfirms += 1; });
  const commands = h.sceneCommands();

  const offeredIds = h.openChooser();
  const stacksBefore = { ...h.runState.upgradeStacks };
  expect(offered).toBe(1);
  expect(offeredIds).toHaveLength(3);

  driveSimultaneousPattern(h);
  expect(spy.raw).toEqual([{ action: 'confirm', source: 'keyboard' }]);
  expect(chosen).toHaveLength(1);
  const chosenId = chosen[0]!;
  expect(offeredIds).toContain(chosenId);
  expect(h.runState.upgradeStacks[chosenId]).toBe((stacksBefore[chosenId] ?? 0) + 1);
  expect(h.chooserDiagnostics().choiceIds).toEqual([]);
  expect(offered).toBe(1);
  expect(uiConfirms).toBe(0);
  expect(h.sceneCommands()).toEqual(commands);

  h.bus.emit('level:up', { level: 3 });
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(2);
  expect(spy.raw[1]!.source).toBe('keyboard');
  expect(chosen).toHaveLength(2);
  expect(h.chooserDiagnostics().choiceIds).toEqual([]);
  expect(h.runState.status).toBe('active');
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

function rackMergeTrial(trial: number): void {
  const h = createGameSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    runSeed: 3100 + trial,
    storageKey: `e19-dup-merge-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  let merged = 0;
  h.bus.on('weapon:merged', () => { merged += 1; });
  let uiConfirms = 0;
  h.bus.on('ui:confirm', () => { uiConfirms += 1; });
  let uiBacks = 0;
  h.bus.on('ui:back', () => { uiBacks += 1; });
  const commands = h.sceneCommands();
  const currencyBefore = h.runState.currency;

  h.openRackWithMergePair();
  expect(h.pauseController.snapshot().panel).toBe('inventory');
  const mergeIndex = h.selectRackPairAndFocusMerge();
  expect(mergeIndex).toBe(6);
  expect(h.inventory.snapshot().preview?.result.definitionId).toBe('scrap-pistol-t2');
  const equippedBefore = h.runState.equipped.length;
  const uiConfirmsBefore = uiConfirms;

  driveSimultaneousPattern(h);
  const edgesBefore = 3;
  expect(spy.raw.length).toBe(edgesBefore + 1);
  expect(spy.raw[edgesBefore]!.source).toBe('keyboard');
  expect(merged).toBe(1);
  expect(uiConfirms).toBe(uiConfirmsBefore + 1);
  expect(h.runState.equipped).toHaveLength(equippedBefore - 1);
  expect(h.runState.equipped[0]?.tier).toBe(2);
  expect(h.runState.currency).toBe(currencyBefore);
  expect(h.inventory.snapshot().selectedInstanceIds).toEqual([]);
  expect(h.focusedRackTargetIndex()).toBe(6);
  expect(h.sceneCommands()).toEqual(commands);

  h.padDown(1);
  h.poll();
  h.padUp(1);
  h.poll();
  expect(h.pauseController.snapshot().panel).toBe('pause');
  expect(uiBacks).toBe(1);
  const edgesBeforeFresh = spy.raw.length;
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(edgesBeforeFresh + 1);
  expect(spy.raw[edgesBeforeFresh]!.source).toBe('keyboard');
  expect(h.runState.status).toBe('active');
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

function settingsTrial(trial: number): void {
  const h = createMenuSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    storageKey: `e19-dup-settings-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  const commands = h.sceneCommands();
  let changes = 0;
  h.context.bus.on('settings:changed', () => { changes += 1; });

  // Home → Settings: navDown ×5, confirm.
  for (let i = 0; i < 5; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  expect(h.menuSnapshot().panel).toBe('settings');

  // Focus the Reduced Motion row (row 3): navDown ×3.
  for (let i = 0; i < 3; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  const ringBefore = h.ringedTargetIndex();
  const edgesBefore = spy.raw.length;

  driveSimultaneousPattern(h);
  expect(spy.raw.length).toBe(edgesBefore + 1);
  expect(spy.raw[edgesBefore]!.source).toBe('keyboard');
  expect(changes).toBe(1);
  expect(h.context.settings.reducedMotion).toBe(true);
  expect(h.ringedTargetIndex()).toBe(ringBefore);
  expect(h.focusRingCount()).toBe(1);
  expect(h.sceneCommands()).toEqual(commands);

  // Fresh re-press toggles back off with exactly one more change.
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(edgesBefore + 2);
  expect(spy.raw[edgesBefore + 1]!.source).toBe('keyboard');
  expect(changes).toBe(2);
  expect(h.context.settings.reducedMotion).toBe(false);
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

function characterSelectTrial(trial: number): void {
  const h = createMenuSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    storageKey: `e19-dup-character-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  const commands = h.sceneCommands();

  // Home → Character: navDown ×1, confirm.
  for (let i = 0; i < 1; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  expect(h.menuSnapshot().panel).toBe('character');

  // Focus the second character row.
  for (let i = 0; i < 1; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  const ringBefore = h.ringedTargetIndex();
  const edgesBefore = spy.raw.length;

  driveSimultaneousPattern(h);
  expect(spy.raw.length).toBe(edgesBefore + 1);
  expect(spy.raw[edgesBefore]!.source).toBe('keyboard');
  expect(h.ringedTargetIndex()).toBe(ringBefore);
  expect(h.focusRingCount()).toBe(1);
  expect(h.sceneCommands()).toEqual(commands);

  // Fresh re-press still works.
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(edgesBefore + 2);
  expect(spy.raw[edgesBefore + 1]!.source).toBe('keyboard');
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

describe('Epic 19 Slice 5 duplicate-suppression soak', () => {
  it.each(CASES)('keeps one simultaneous held input to one %s effect across %i trials', (surface, count) => {
    for (let trial = 0; trial < count; trial += 1) {
      if (surface === 'card choice') cardChoiceTrial(trial);
      else if (surface === 'rack merge') rackMergeTrial(trial);
      else if (surface === 'settings toggle') settingsTrial(trial);
      else characterSelectTrial(trial);
    }
  });
});
