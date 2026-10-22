import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { decodeLateFixtureProfile, LateRangeCombat, resolveFittedLateHmRange } from '../gameplay/lateFixture';
import { createUiText } from '../ui/text';

const LATE_KEY = 'meowcenary:int-late:v1:profile';
type Target = { sprite: Phaser.GameObjects.Arc; id: 'full' | 'falloff' | 'outside'; distance: number };

/** A read-only, input-driven late-save range/combat proof. It intentionally
 * owns no wallet, item, receipt, B1, or workshop mutation path. */
export class LateRangeScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;
  private targets: Target[] = [];
  private combat?: LateRangeCombat;
  private fire?: Phaser.GameObjects.Rectangle;
  private back?: Phaser.GameObjects.Rectangle;
  private range?: Readonly<{ instanceId: string; refinement: string; full: number; max: number }>;
  private profileKey = LATE_KEY;
  private recoveryMessage?: string;
  constructor() { super(SceneKey.LateRange); }
  create(data?: { profileKey?: string }): void {
    this.profileKey = data?.profileKey ?? LATE_KEY;
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101820);
    this.status = createUiText(this, 24, 24, '', { fontFamily: 'Nunito, sans-serif', fontSize: '16px', color: '#fff', wordWrap: { width: this.scale.width - 48 } });
    const returnToFixture = () => this.scene.start(SceneKey.LateFixture);
    this.input.keyboard?.on('keydown-ESC', returnToFixture);
    this.input.keyboard?.on('keydown-RETURN', returnToFixture);
    let raw: string | null;
    this.installTestSeam();
    try { raw = localStorage.getItem(this.profileKey); }
    catch { this.recoveryMessage = 'Late save storage could not be read. No save was changed.'; this.status.setText(`LATE RANGE FIXTURE\n${this.recoveryMessage}\nRETURN / ESC`); this.addBack(); return; }
    const decoded = decodeLateFixtureProfile(raw);
    this.range = decoded.state === 'valid' ? resolveFittedLateHmRange(decoded.profile) : undefined;
    if (!this.range) { this.recoveryMessage = decoded.state === 'invalid' ? 'Late save is invalid or unsupported. It was preserved unchanged.' : 'A persisted TAB-A B-HM T3 must be fitted first. No save was changed.'; this.status.setText(`LATE RANGE FIXTURE\n${this.recoveryMessage}\nRETURN / ESC`); this.addBack(); return; }
    const scale = Math.min(12, (this.scale.width - 180) / (this.range.max + 4));
    const originX = 72; const y = Math.min(this.scale.height - 150, 330);
    this.add.line(0, y, originX, 0, this.scale.width - 42, 0, 0x7393d8).setOrigin(0).setLineWidth(2);
    this.add.circle(originX, y, 18, 0xf6c85f);
    this.combat = new LateRangeCombat(this.range);
    // These are authored, fixed distances—not range thresholds derived from
    // the equipped refinement—so full/falloff/outside are independently
    // verified by the production contact resolver.
    const targets = this.combat.snapshot();
    this.targets = targets.map((target, index) => {
      const distance = target.distance;
      const sprite = this.add.circle(originX + distance * scale, y, 15, index === 2 ? 0xef6b73 : 0x3ee8a9);
      createUiText(this, sprite.x, y + 30, index === 0 ? `FULL ${distance}m` : index === 1 ? `FALLOFF ${distance}m` : `OUT ${distance}m`, { fontSize: '11px', color: '#fff', align: 'center' }).setOrigin(.5);
      return { sprite, id: target.id, distance };
    });
    this.status.setText(`LATE RANGE FIXTURE · persisted ${this.range.instanceId}\nB-HM T3 ${this.range.refinement}: full ${this.range.full}m · max ${this.range.max}m\nFIRE / SPACE launches a contact attempt at 12m, 18m, then 27m. The shared resolver yields full, falloff, then zero damage.\nNo B1 or late-save writes occur here.`);
    this.fire = this.add.rectangle(this.scale.width * .28, this.scale.height - 54, 150, 46, 0x3ee8a9).setInteractive();
    createUiText(this, this.fire.x, this.fire.y, 'FIRE\nSPACE', { fontSize: '13px', color: '#071018', align: 'center' }).setOrigin(.5);
    this.fire.on('pointerup', () => this.fireHm()); this.addBack();
    this.input.keyboard?.on('keydown-SPACE', () => this.fireHm());
  }
  private installTestSeam(): void {
    if (import.meta.env.VITE_VISUAL_TEST !== '1') return;
    Object.defineProperty(globalThis, '__MEOWCENARY_LATE_RANGE__', { configurable: true, value: { diagnostics: () => ({ range: this.range, targets: this.combat?.snapshot() ?? [], recoveryMessage: this.recoveryMessage }), fire: () => this.fireHm() } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_LATE_RANGE__; });
  }
  private addBack(): void { this.back = this.add.rectangle(this.scale.width * .72, this.scale.height - 54, 150, 46, 0x7393d8).setInteractive(); createUiText(this, this.back.x, this.back.y, 'RETURN\nESC', { fontSize: '13px', color: '#071018', align: 'center' }).setOrigin(.5); this.back.on('pointerup', () => this.scene.start(SceneKey.LateFixture)); }
  private fireHm(): boolean {
    const shot = this.combat?.fire(); if (!shot) return false;
    const target = this.targets.find(candidate => candidate.id === shot.targetId);
    if (target) target.sprite.setFillStyle(shot.damage > 0 ? 0xf6c85f : 0xef6b73).setAlpha(shot.targetHealth === 0 ? .35 : 1);
    this.status?.setText(`${this.status.text}\nProjectile ${shot.targetId} @ ${shot.distance}m: ${shot.damage.toFixed(3)} damage; target health ${shot.targetHealth.toFixed(3)}.`);
    return true;
  }
}
