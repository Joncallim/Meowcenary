import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { commitLateFixture, createLateFixtureProfile, decodeLateFixtureProfile, deriveLateB1History, type LateFixtureProfile } from '../gameplay/lateFixture';
import { deserializeIntegratedFixtureEnvelope } from '../gameplay/integratedFixture';
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
  constructor() { super(SceneKey.LateFixture); }
  create(): void {
    this.profile = this.read();
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101820);
    this.status = createUiText(this, 24, 24, '', { fontFamily: 'Nunito, sans-serif', fontSize: '16px', color: '#fff', wordWrap: { width: this.scale.width - 48 } });
    const button = (x: number, y: number, label: string, run: () => void) => { const shape = this.add.rectangle(x, y, 180, 48, 0x3ee8a9).setInteractive(); shape.on('pointerup', run); createUiText(this, x, y, label, { fontSize: '13px', color: '#071018', align: 'center' }).setOrigin(.5); };
    button(120, 300, 'DEVELOP\nD', () => this.commit({ commandId: `late:develop:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }));
    button(320, 300, 'MERGE\nM', () => this.commit({ commandId: `late:merge:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }));
    button(520, 300, 'BUILD\nU', () => this.commit({ commandId: `late:build:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'build' }));
    button(720, 300, 'FIT HM A\nF', () => { const output = this.profile.parts.find(part => part.kind === 'B-HM' && !part.assignedTo); if (output) this.commit({ commandId: `late:fit:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'fit', inputIds: [output.id], targetGun: 'TAB-A' }); });
    button(920, 300, 'RETAIN\nN', () => this.commit({ commandId: `late:retain:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'retain-donors' }));
    button(1120, 300, 'SELL H2\nS', () => this.commit({ commandId: `late:sell-h2:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'sell-h2' }));
    this.input.keyboard?.on('keydown-D', () => this.commit({ commandId: `late:develop:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'develop', inputIds: ['INT-LATE-DONOR-B2-T2'] }));
    this.input.keyboard?.on('keydown-M', () => this.commit({ commandId: `late:merge:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'merge', inputIds: ['INT-LATE-DONOR-B2-T2', 'INT-LATE-DONOR-B3-T2'] }));
    this.input.keyboard?.on('keydown-U', () => this.commit({ commandId: `late:build:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'build' }));
    this.input.keyboard?.on('keydown-F', () => { const output = this.profile.parts.find(part => part.kind === 'B-HM' && !part.assignedTo); if (output) this.commit({ commandId: `late:fit:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'fit', inputIds: [output.id], targetGun: 'TAB-A' }); });
    this.input.keyboard?.on('keydown-N', () => this.commit({ commandId: `late:retain:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'retain-donors' }));
    this.input.keyboard?.on('keydown-S', () => this.commit({ commandId: `late:sell-h2:${this.profile.revision}`, expectedRevision: this.profile.revision, action: 'sell-h2' }));
    Object.defineProperty(globalThis, '__MEOWCENARY_LATE_FIXTURE__', { configurable: true, value: { diagnostics: () => this.diagnostics(), commit: (command: Parameters<typeof commitLateFixture>[1]) => this.commit(command), failNextStorageWrite: () => { this.failNextStorageWrite = true; }, failNextStorageRead: () => { this.failNextStorageRead = true; }, rejectNextWriterLock: () => { this.rejectNextWriterLock = true; } } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_LATE_FIXTURE__; });
    this.render();
  }
  private b1History() { return deriveLateB1History(deserializeIntegratedFixtureEnvelope(localStorage.getItem('meowcenary:int-fb:v1:profile'))); }
  private read(): LateFixtureProfile {
    let raw: string | null;
    try { raw = localStorage.getItem(KEY); } catch { this.blocked = true; this.message = 'Late save storage could not be read; no change was made. Restore access and reload.'; return createLateFixtureProfile(); }
    const decoded = decodeLateFixtureProfile(raw);
    if (decoded.state === 'absent') return createLateFixtureProfile(this.b1History());
    if (decoded.state === 'valid') return decoded.profile;
    this.blocked = true;
    this.message = 'Stored late save is invalid or unsupported. It was preserved unchanged; restore it from a trusted backup before continuing.';
    return createLateFixtureProfile();
  }
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
      this.profile = result.profile;
      this.message = `Confirmed ${command.action}; receipt persisted before presentation.`;
      this.render(); applied = true;
    }); } catch { this.message = 'Late save writer failed before publishing a change.'; this.render(); return false; }
    return applied;
  }
  private render(): void { this.status?.setText(`${this.profile.declaration}\n\nLATE WORKSHOP · revision ${this.profile.revision} · ${this.profile.parts.length} parts\nCredits ${this.profile.wallet.credits} · Metal ${this.profile.wallet.metal} · Circuits ${this.profile.wallet.circuits}\nDiscoveries: ${this.profile.discoveries.join(', ') || 'none'}\n${this.message}\n\nThis surface uses ${KEY} only. B1 is never read or written.`); }
  private currentH2State() { return this.profile.parts.some(part => part.id === 'INT-LATE-HOU-H2-LOOT') ? 'kept' : this.profile.pinnedEarlierHistory.h2State === 'kept' ? 'sold' : this.profile.pinnedEarlierHistory.h2State; }
  private diagnostics() { return Object.freeze({ scene: this.scene.key, blocked: this.blocked, revision: this.profile.revision, parts: this.profile.parts.length, partRecords: this.profile.parts, wallet: this.profile.wallet, receipts: this.profile.receipts, discoveries: this.profile.discoveries, pinnedEarlierHistory: this.profile.pinnedEarlierHistory, currentH2State: this.currentH2State(), declaration: this.profile.declaration, message: this.message }); }
}
