import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { commitLateFixture, createLateFixtureProfile, decodeLateFixtureProfile, deriveLateB1History, type LateCommand, type LateFixtureProfile } from '../gameplay/lateFixture';
import { decodeIntegratedFixtureEnvelope } from '../gameplay/integratedFixture';
import { createUiText } from '../ui/text';

const KEY = 'meowcenary:int-late:v1:profile';
/** Separate later-save surface; it never reads or writes INT-FB B1 storage. */
export class LateFixtureScene extends Phaser.Scene {
  private profile: LateFixtureProfile = createLateFixtureProfile();
  private status?: Phaser.GameObjects.Text;
  private message = 'Choose RETAIN DONORS, DEVELOP donor, MERGE donors, or BUILD after discovery.';
  private blocked = false;
  private failNextStorageWrite = false;
  private failNextStorageRead = false;
  private rejectNextWriterLock = false;
  private pending?: LateCommand;
  private compactLayout = false;
  constructor() { super(SceneKey.LateFixture); }
  create(): void {
    this.profile = this.read();
    this.compactLayout = (this.scale.width < 600 || this.scale.height < 500) && this.scale.height < 650;
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101820);
    this.status = createUiText(this, 24, 24, '', { fontFamily: 'Nunito, sans-serif', fontSize: '16px', color: '#fff', wordWrap: { width: this.scale.width - 48 } });
    const stage = (action: LateCommand['action'], inputIds?: readonly string[], targetGun?: 'TAB-A') => {
      // Retain the published fixture command alias while the durable action
      // remains `retain-donors`; receipts are part of replayable history.
      const commandAlias = action === 'retain-donors' ? 'retain' : action;
      this.preview({ commandId: `late:${commandAlias}:${this.profile.revision}`, expectedRevision: this.profile.revision, action, ...(inputIds ? { inputIds } : {}), ...(targetGun ? { targetGun } : {}) });
    };
    const narrow = this.scale.width < 600 || this.scale.height < 500; const ultraCompact = narrow && this.scale.height < 500;
    const buttonWidth = ultraCompact ? Math.min(108, this.scale.width / 3 - 12) : Math.min(172, this.scale.width / 2 - 18);
    const button = (x: number, y: number, label: string, run: () => void, color = 0x3ee8a9) => { this.add.rectangle(x, y, buttonWidth, 46, color).setInteractive().on('pointerup', run); createUiText(this, x, y, label, { fontSize: ultraCompact ? '10px' : '12px', color: '#071018', align: 'center' }).setOrigin(.5); };
    const columns = ultraCompact ? [this.scale.width * .17, this.scale.width * .50, this.scale.width * .83] : narrow ? [this.scale.width * .27, this.scale.width * .73] : [this.scale.width * .12, this.scale.width * .30, this.scale.width * .48, this.scale.width * .66, this.scale.width * .84, this.scale.width * .94];
    const rows = ultraCompact ? [270, 325] : narrow ? this.compactLayout ? [315, 370, 425] : [350, 410, 470] : [300, 300, 300, 300, 300, 300];
    [['DEVELOP\nD', 'develop', ['INT-LATE-DONOR-B2-T2']], ['MERGE\n25/50/25 · M', 'merge', ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2']], ['BUILD\nBALANCED · U', 'build'], ['FIT HM A\nF', 'fit'], ['RETAIN\nN', 'retain-donors'], ['SELL H2\nS', 'sell-h2']].forEach(([label, action, inputs], index) => button(columns[ultraCompact ? index % 3 : narrow ? index % 2 : index]!, rows[ultraCompact ? Math.floor(index / 3) : narrow ? Math.floor(index / 2) : index]!, label as string, () => { const output = action === 'fit' ? this.profile.parts.find(part => part.kind === 'B-HM' && !part.assignedTo)?.id : undefined; stage(action as LateCommand['action'], output ? [output] : inputs as readonly string[] | undefined, action === 'fit' ? 'TAB-A' : undefined); }));
    const confirmY = ultraCompact ? 360 : narrow ? this.compactLayout ? 495 : 550 : 370; button(this.scale.width * .32, confirmY, 'CONFIRM\nENTER', () => { const pending = this.pending; if (pending) void this.commit(pending); }, 0xf6c85f); button(this.scale.width * .68, confirmY, 'CANCEL\nESC', () => this.cancelPreview(), 0x7393d8);
    this.input.keyboard?.on('keydown-D', () => stage('develop', ['INT-LATE-DONOR-B2-T2'])); this.input.keyboard?.on('keydown-M', () => stage('merge', ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'])); this.input.keyboard?.on('keydown-U', () => stage('build')); this.input.keyboard?.on('keydown-N', () => stage('retain-donors')); this.input.keyboard?.on('keydown-S', () => stage('sell-h2'));
    Object.defineProperty(globalThis, '__MEOWCENARY_LATE_FIXTURE__', { configurable: true, value: { diagnostics: () => this.diagnostics(), commit: (command: Parameters<typeof commitLateFixture>[1]) => this.commit(command), failNextStorageWrite: () => { this.failNextStorageWrite = true; }, failNextStorageRead: () => { this.failNextStorageRead = true; }, rejectNextWriterLock: () => { this.rejectNextWriterLock = true; } } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_LATE_FIXTURE__; });
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.pending) void this.commit(this.pending); }); this.input.keyboard?.on('keydown-ESC', () => this.cancelPreview()); this.render();
  }
  private b1History() {
    try {
      const decoded = decodeIntegratedFixtureEnvelope(localStorage.getItem('meowcenary:int-fb:v1:profile'));
      if (decoded.state === 'valid') return deriveLateB1History(decoded.envelope);
      if (decoded.state === 'absent') return deriveLateB1History(undefined);
    } catch { /* handled below */ }
    this.blocked = true;
    this.message = 'Earlier B1 history is invalid or unavailable; late save was not initialized and both saves were preserved.';
    return undefined;
  }
  private read(): LateFixtureProfile {
    let raw: string | null;
    try { raw = localStorage.getItem(KEY); } catch { this.blocked = true; this.message = 'Late save storage could not be read; no change was made. Restore access and reload.'; return createLateFixtureProfile(); }
    const decoded = decodeLateFixtureProfile(raw);
    if (decoded.state === 'absent') { const history = this.b1History(); return history ? createLateFixtureProfile(history) : createLateFixtureProfile(); }
    if (decoded.state === 'valid') return decoded.profile;
    this.blocked = true;
    this.message = 'Stored late save is invalid or unsupported. It was preserved unchanged; restore it from a trusted backup before continuing.';
    return createLateFixtureProfile();
  }
  private preview(command: LateCommand): void {
    if (this.blocked) return;
    const inputs = (command.inputIds ?? []).map(id => this.profile.parts.find(part => part.id === id)).filter((part): part is NonNullable<typeof part> => !!part);
    const donors = inputs.map(part => `${part.id}@v${part.version}`).join(', ') || 'none';
    const cost = command.action === 'develop' ? '500 Credits · 20 Metal · 4 Circuits' : command.action === 'build' ? '2000 Credits · 80 Metal · 16 Circuits' : 'no currency/material fee';
    const outcome = command.action === 'merge' ? 'one internal sample: LeanA 25% · Balanced 50% · LeanB 25%' : command.action === 'build' ? 'Balanced B-HM' : command.action === 'develop' ? 'same instance; tier +1; refinement preserved' : command.action;
    this.pending = command; this.message = `Preview ${command.action}: donors ${donors}. Cost ${cost}. Outcome ${outcome}. Confirm or Cancel; no change has been made.`; this.render();
  }
  private cancelPreview(): void { if (!this.pending) return; this.pending = undefined; this.message = 'Preview cancelled; no RNG draw, debit, inventory change, or receipt.'; this.render(); }
  /** Single durable writer: never publish a candidate until storage accepts it. */
  private async commit(command: Parameters<typeof commitLateFixture>[1]): Promise<boolean> {
    if (this.blocked) return false;
    const locks = (navigator as unknown as { locks?: { request(name: string, options: { mode: 'exclusive' }, callback: () => Promise<void>): Promise<void> } }).locks;
    if (!locks) { this.message = 'Late save writer is unavailable; no change was made.'; this.render(); return false; }
    let applied = false;
    if (this.rejectNextWriterLock) { this.rejectNextWriterLock = false; this.message = 'Late save writer failed before publishing a change.'; this.render(); return false; }
    try { await locks.request(`${KEY}:writer`, { mode: 'exclusive' }, async () => {
      if (this.blocked) return;
      let raw: string | null;
      try { if (this.failNextStorageRead) { this.failNextStorageRead = false; throw new Error('forced late read failure'); } raw = localStorage.getItem(KEY); } catch { this.message = 'Late save storage could not be read; no change was made. Retry safely.'; this.render(); return; }
      let durable = this.profile;
      if (raw !== null) {
        const decoded = decodeLateFixtureProfile(raw);
        if (decoded.state !== 'valid') { this.blocked = true; this.message = 'Stored late save is invalid or unsupported. It was preserved unchanged; restore it from a trusted backup before continuing.'; this.render(); return; }
        durable = decoded.profile;
      }
      const result = commitLateFixture(durable, command);
      if (!result.applied) { this.profile = durable; this.message = result.reason === 'duplicate-command' ? 'Confirmation already persisted; durable receipt reconciled.' : result.reason === 'stale-revision' ? 'Confirmation was stale; validated durable state refreshed. Retry deliberately.' : `Confirmation rejected: ${result.reason}.`; this.render(); return; }
      try { if (this.failNextStorageWrite) { this.failNextStorageWrite = false; throw new Error('forced late storage failure'); } localStorage.setItem(KEY, JSON.stringify(result.profile)); }
      catch { this.message = 'Late save storage failed; no change was made. Retry safely.'; this.render(); return; }
      this.profile = result.profile; this.pending = undefined;
      const receipt = result.profile.receipts.at(-1);
      this.message = `Confirmed ${command.action}${receipt?.refinement ? ` (${receipt.refinement})` : ''}; receipt persisted before presentation.`;
      this.render(); applied = true;
    }); } catch { this.message = 'Late save writer failed before publishing a change.'; this.render(); return false; }
    return applied;
  }
  private render(): void { this.status?.setText(`${this.profile.declaration}\n\nLATE WORKSHOP · revision ${this.profile.revision} · ${this.profile.parts.length} parts\nCredits ${this.profile.wallet.credits} · Metal ${this.profile.wallet.metal} · Circuits ${this.profile.wallet.circuits}\nDiscoveries: ${this.profile.discoveries.join(', ') || 'none'}\n${this.message}${this.compactLayout ? '' : `\n\nThis surface uses ${KEY} only. Earlier B1 history is read only; B1 is never modified.`}`); }
  private currentH2State() { return this.profile.parts.some(part => part.id === 'INT-LATE-HOU-H2-LOOT') ? 'kept' : this.profile.pinnedEarlierHistory.h2State === 'kept' ? 'sold' : this.profile.pinnedEarlierHistory.h2State; }
  private diagnostics() { return Object.freeze({ scene: this.scene.key, blocked: this.blocked, revision: this.profile.revision, parts: this.profile.parts.length, partRecords: this.profile.parts, wallet: this.profile.wallet, receipts: this.profile.receipts, discoveries: this.profile.discoveries, pinnedEarlierHistory: this.profile.pinnedEarlierHistory, currentH2State: this.currentH2State(), declaration: this.profile.declaration, message: this.message }); }
}
