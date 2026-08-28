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
  ['purchase', 32],
  ['reset', 32],
] as const;

interface RawConfirmSpy {
  readonly raw: Array<{ action: string; source: string }>;
}

function attachRawConfirmSpy(h: { inputController: InputController }): RawConfirmSpy {
  const raw: Array<{ action: string; source: string }> = [];
  h.inputController.onAction('confirm', (edge) => raw.push(edge));
  return { raw };
}

/** The shared simultaneous pattern (INPUT-06): down before one poll, eight
 *  held polls, release one source for two polls, release the other. Exactly
 *  one keyboard-sourced raw confirm edge total. */
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

  // Real card state: a genuine offer with its identity + stack posture.
  const offeredIds = h.openChooser();
  const stacksBefore = { ...h.runState.upgradeStacks };
  expect(offered).toBe(1);
  expect(offeredIds).toHaveLength(3);

  driveSimultaneousPattern(h);
  // Raw edge accounting FIRST (INPUT-06 — owner guards are defense in depth).
  expect(spy.raw).toEqual([{ action: 'confirm', source: 'keyboard' }]);
  expect(chosen).toHaveLength(1);
  const chosenId = chosen[0]!;
  expect(offeredIds).toContain(chosenId);
  expect(h.runState.upgradeStacks[chosenId]).toBe((stacksBefore[chosenId] ?? 0) + 1);
  expect(h.chooserDiagnostics().choiceIds).toEqual([]);
  expect(offered).toBe(1); // one offer token consumed
  expect(uiConfirms).toBe(0); // no ui:confirm substitution
  expect(h.sceneCommands()).toEqual(commands);

  // Fresh re-press → one new edge + one valid next effect (G-15).
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

  // Real rack state: pause → rack → select both T1 pistols → focus Merge.
  h.openRackWithMergePair();
  expect(h.pauseController.snapshot().panel).toBe('inventory');
  const mergeIndex = h.selectRackPairAndFocusMerge();
  expect(mergeIndex).toBe(6);
  expect(h.inventory.snapshot().preview?.result.definitionId).toBe('scrap-pistol-t2');
  const equippedBefore = h.runState.equipped.length;
  const uiConfirmsBefore = uiConfirms; // pause entry + rack entry already emitted

  driveSimultaneousPattern(h);
  // Raw edge accounting FIRST (INPUT-06 — owner guards are defense in depth):
  // the pattern added exactly one keyboard-sourced edge on top of the
  // navigation edges that opened the surface.
  const edgesBefore = 3; // rack-open confirm, slot-a select, slot-b select
  expect(spy.raw.length).toBe(edgesBefore + 1);
  expect(spy.raw[edgesBefore]!.source).toBe('keyboard');
  expect(merged).toBe(1);
  expect(uiConfirms).toBe(uiConfirmsBefore + 1); // exactly one merge confirm cue
  expect(h.runState.equipped).toHaveLength(equippedBefore - 1);
  expect(h.runState.equipped[0]?.tier).toBe(2);
  // Currency and the remaining slots are unchanged.
  expect(h.runState.currency).toBe(currencyBefore);
  expect(h.inventory.snapshot().selectedInstanceIds).toEqual([]);
  // Focus is preserved on the Merge action after the same-panel rebuild.
  expect(h.focusedRackTargetIndex()).toBe(6);
  expect(h.sceneCommands()).toEqual(commands);

  // Fresh valid actions still work (G-15): back to pause, then a fresh
  // simultaneous confirm on Resume resumes the run with exactly one edge.
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

function purchaseTrial(trial: number): void {
  const h = createMenuSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    storageKey: `e19-dup-purchase-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  const commands = h.sceneCommands();

  // Fund the economy through the real persistence boundary.
  h.context.updateMeta((meta) => ({ ...meta, scrap: 500 }));
  const writesBefore = h.writeCount();

  // Home (Start) → Progression: navDown ×3, confirm (one raw confirm edge).
  for (let i = 0; i < 3; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  expect(h.menuSnapshot().panel).toBe('progression');
  // The portrait-safe hub separates legacy training from the progression
  // destinations. Select it once; its first control is the upgrade row.
  for (let i = 0; i < 5; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  const row = h.menuSnapshot().progression.upgrades[0]!;
  expect(row.canPurchase).toBe(true);
  const scrapBefore = h.menuSnapshot().progression.scrap;
  const ringBefore = h.ringedTargetIndex();
  const edgesBefore = spy.raw.length; // progression entry + training entry

  driveSimultaneousPattern(h);
  // The pattern added exactly one keyboard-sourced raw edge; held polls and
  // the staggered releases added zero.
  expect(spy.raw.length).toBe(edgesBefore + 1);
  expect(spy.raw[edgesBefore]!.source).toBe('keyboard');
  // Domain effect: exactly one level increment and one current-level cost
  // deduction, one persistence-write delta, focus preserved on the row.
  const after = h.menuSnapshot().progression;
  const purchased = after.upgrades[0]!;
  expect(purchased.currentLevel).toBe(row.currentLevel + 1);
  expect(after.scrap).toBe(scrapBefore - row.nextCost!);
  expect(h.writeCount()).toBe(writesBefore + 1);
  expect(h.ringedTargetIndex()).toBe(ringBefore);
  expect(h.focusRingCount()).toBe(1);
  expect(h.sceneCommands()).toEqual(commands);

  // Fresh re-press → one new edge + one valid next effect: a second level.
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(edgesBefore + 2);
  expect(spy.raw[edgesBefore + 1]!.source).toBe('keyboard');
  expect(h.menuSnapshot().progression.upgrades[0]!.currentLevel).toBe(row.currentLevel + 2);
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

function resetTrial(trial: number): void {
  const h = createMenuSoakHarness({
    fixtureSeed: EPIC19_SOAK_SEEDS.duplicateSuppression + trial,
    storageKey: `e19-dup-reset-${trial}`,
  });
  const spy = attachRawConfirmSpy(h);
  let uiConfirms = 0;
  h.context.bus.on('ui:confirm', () => { uiConfirms += 1; });
  const commands = h.sceneCommands();
  const settingsBefore = h.context.settings;
  const revisionBefore = h.context.selectionRevision;

  // Real persistent state worth resetting: scrap + a purchased upgrade.
  h.context.updateMeta((meta) => ({
    ...meta,
    scrap: 500,
    permanentUpgrades: { ...meta.permanentUpgrades, 'reinforced-vest': 1 },
  }));
  const writesBefore = h.writeCount();

  // Home (Start) → Progression: navDown ×3, confirm.
  for (let i = 0; i < 3; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  expect(h.menuSnapshot().panel).toBe('progression');
  expect(h.menuSnapshot().progression.scrap).toBe(500);

  // Enter legacy training, then the real two-step reset panel.
  for (let i = 0; i < 5; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  for (let i = 0; i < 5; i += 1) { h.padDown(13); h.poll(); h.padUp(13); h.poll(); }
  h.padDown(0); h.poll(); h.padUp(0); h.poll();
  expect(h.menuSnapshot().panel).toBe('reset-confirmation');
  expect(spy.raw).toHaveLength(3); // progression, training, reset-panel entries

  // The FINAL destructive confirm: simultaneous + held + staggered release.
  driveSimultaneousPattern(h);
  expect(spy.raw).toHaveLength(4);
  expect(spy.raw[3]!.source).toBe('keyboard');
  // Domain effect: one progression reset, one persistence-write delta,
  // settings unchanged, selection revalidation leaves the selection intact.
  expect(h.menuSnapshot().panel).toBe('progression');
  expect(h.menuSnapshot().progression.scrap).toBe(0);
  expect(h.menuSnapshot().progression.upgrades.every((u) => u.currentLevel === 0)).toBe(true);
  expect(h.writeCount()).toBe(writesBefore + 1);
  expect(h.context.settings).toBe(settingsBefore);
  expect(h.context.selectionRevision).toBe(revisionBefore);
  expect(h.focusRingCount()).toBe(1);
  expect(h.sceneCommands()).toEqual(commands);

  // The next valid menu navigation works (G-15): navDown moves focus and
  // emits exactly one ui:navigate; a fresh confirm activates the focused row.
  const navBefore = uiConfirms;
  h.padDown(13);
  h.poll();
  h.padUp(13);
  h.poll();
  h.simultaneousConfirmDown();
  h.poll();
  h.simultaneousConfirmUp();
  h.poll();
  expect(spy.raw).toHaveLength(5);
  expect(uiConfirms).toBe(navBefore + 1); // the fresh confirm activated a row
  expect(h.sceneCommands()).toEqual(commands);
  h.destroy();
}

describe('Epic 19 Slice 5 duplicate-suppression soak', () => {
  it.each(CASES)('keeps one simultaneous held input to one %s effect across %i trials', (surface, count) => {
    for (let trial = 0; trial < count; trial += 1) {
      if (surface === 'card choice') cardChoiceTrial(trial);
      else if (surface === 'rack merge') rackMergeTrial(trial);
      else if (surface === 'purchase') purchaseTrial(trial);
      else resetTrial(trial);
    }
  });
});
