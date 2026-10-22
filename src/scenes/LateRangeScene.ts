import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { decodeLateFixtureProfile, resolveFittedLateHmRange } from '../gameplay/lateFixture';
import { createUiText } from '../ui/text';

const LATE_KEY = 'meowcenary:int-late:v1:profile';
type Target = { sprite: Phaser.GameObjects.Arc; distance: number; resolved: boolean };

/** A read-only, input-driven late-save range/combat proof. It intentionally
 * owns no wallet, item, receipt, B1, or workshop mutation path. */
export class LateRangeScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;
  private targets: Target[] = [];
  private fire?: Phaser.GameObjects.Rectangle;
  private back?: Phaser.GameObjects.Rectangle;
  private range?: Readonly<{ instanceId: string; refinement: string; full: number; max: number }>;
  constructor() { super(SceneKey.LateRange); }
  create(): void {
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x101820);
    this.status = createUiText(this, 24, 24, '', { fontFamily: 'Nunito, sans-serif', fontSize: '16px', color: '#fff', wordWrap: { width: this.scale.width - 48 } });
    const decoded = decodeLateFixtureProfile(localStorage.getItem(LATE_KEY));
    this.range = decoded.state === 'valid' ? resolveFittedLateHmRange(decoded.profile) : undefined;
    if (!this.range) { this.status.setText('LATE RANGE FIXTURE\nA persisted TAB-A B-HM T3 must be fitted first. No save was changed.\nRETURN / ESC'); this.addBack(); return; }
    const scale = Math.min(12, (this.scale.width - 180) / (this.range.max + 4));
    const originX = 72; const y = Math.min(this.scale.height - 150, 330);
    this.add.line(0, y, originX, 0, this.scale.width - 42, 0, 0x7393d8).setOrigin(0).setLineWidth(2);
    this.add.circle(originX, y, 18, 0xf6c85f);
    const distances = [this.range.full, this.range.max, this.range.max + 2];
    this.targets = distances.map((distance, index) => {
      const sprite = this.add.circle(originX + distance * scale, y, 15, index === 2 ? 0xef6b73 : 0x3ee8a9);
      createUiText(this, sprite.x, y + 30, index === 0 ? `FULL ${distance}m` : index === 1 ? `MAX ${distance}m` : `OUT ${distance}m`, { fontSize: '11px', color: '#fff', align: 'center' }).setOrigin(.5);
      return { sprite, distance, resolved: false };
    });
    this.status.setText(`LATE RANGE FIXTURE · persisted ${this.range.instanceId}\nB-HM T3 ${this.range.refinement}: full ${this.range.full}m · max ${this.range.max}m\nFIRE / SPACE hits the next target inside max range. The red OUT target must remain untouched.\nNo B1 or late-save writes occur here.`);
    this.fire = this.add.rectangle(this.scale.width * .28, this.scale.height - 54, 150, 46, 0x3ee8a9).setInteractive();
    createUiText(this, this.fire.x, this.fire.y, 'FIRE\nSPACE', { fontSize: '13px', color: '#071018', align: 'center' }).setOrigin(.5);
    this.fire.on('pointerup', () => this.fireHm()); this.addBack();
    this.input.keyboard?.on('keydown-SPACE', () => this.fireHm()); this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SceneKey.LateFixture));
    if (import.meta.env.VITE_VISUAL_TEST === '1') {
      Object.defineProperty(globalThis, '__MEOWCENARY_LATE_RANGE__', { configurable: true, value: { diagnostics: () => ({ range: this.range, resolved: this.targets.filter(target => target.resolved).map(target => target.distance), unresolved: this.targets.filter(target => !target.resolved).map(target => target.distance) }), fire: () => this.fireHm() } });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_LATE_RANGE__; });
    }
  }
  private addBack(): void { this.back = this.add.rectangle(this.scale.width * .72, this.scale.height - 54, 150, 46, 0x7393d8).setInteractive(); createUiText(this, this.back.x, this.back.y, 'RETURN\nESC', { fontSize: '13px', color: '#071018', align: 'center' }).setOrigin(.5); this.back.on('pointerup', () => this.scene.start(SceneKey.LateFixture)); }
  private fireHm(): boolean {
    const range = this.range; if (!range) return false;
    const target = this.targets.find(candidate => !candidate.resolved && candidate.distance <= range.max);
    if (!target) return false;
    target.resolved = true; target.sprite.setFillStyle(0x7f8c8d).setAlpha(.45);
    const cleared = this.targets.filter(candidate => candidate.distance <= range.max).every(candidate => candidate.resolved);
    if (cleared) this.status?.setText(`${this.status.text}\nRange contact complete: full and falloff targets cleared; out-of-range target remained intact.`);
    return true;
  }
}
