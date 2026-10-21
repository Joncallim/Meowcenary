import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { INTEGRATED_FIXTURE_ENVELOPE, INTEGRATED_FIXTURE_JOBS, INTEGRATED_FIXTURE_POINTS, INTEGRATED_FIXTURE_SURFACES, operationCanSettle, type FixtureJobId, validateIntegratedFixture } from '../gameplay/integratedFixture';

const SCALE = 10;
const SPEED = 12;

/** Isolated visual proving-ground route: ?fixture=int-fb. No save mutation. */
export class IntegratedFixtureScene extends Phaser.Scene {
  private lead?: Phaser.GameObjects.Arc;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private touchTarget?: Phaser.Math.Vector2;
  private jobId?: FixtureJobId;
  private completed = new Set<string>();
  private groupCleared = false;
  private extracted = false;
  private status?: Phaser.GameObjects.Text;

  constructor() { super(SceneKey.IntegratedFixture); }

  create(): void {
    const errors = validateIntegratedFixture();
    if (errors.length) throw new Error(`INT-FB fixture invalid: ${errors.join(',')}`);
    const width = INTEGRATED_FIXTURE_ENVELOPE.widthMetres * SCALE;
    const height = INTEGRATED_FIXTURE_ENVELOPE.heightMetres * SCALE;
    this.cameras.main.setBounds(0, 0, width, height).setBackgroundColor('#101820');
    const colors: Readonly<Record<string, number>> = { safe: 0x285943, road: 0x39495a, ramp: 0x7b6c4a, bridge: 0x815a3a, underpass: 0x26313d, tunnel: 0x1a1d2a, pocket: 0x49354e };
    for (const surface of INTEGRATED_FIXTURE_SURFACES) {
      this.add.rectangle((surface.x + surface.width / 2) * SCALE, (surface.z + surface.depth / 2) * SCALE,
        surface.width * SCALE, surface.depth * SCALE, colors[surface.kind] ?? 0x555555, 0.95).setStrokeStyle(2, 0xb7d5da);
      this.add.text((surface.x + 0.5) * SCALE, (surface.z + 0.5) * SCALE, surface.id.replace('INT-FB-', ''), { fontFamily: 'Nunito, sans-serif', fontSize: '11px', color: '#e9f3f5' });
    }
    for (const point of INTEGRATED_FIXTURE_POINTS) {
      this.add.circle(point.x * SCALE, point.z * SCALE, 5, point.role === 'service' ? 0x3ee8a9 : 0xffd166).setStrokeStyle(1, 0x0b1118);
    }
    this.lead = this.add.circle(8 * SCALE, 11 * SCALE, 7, 0x71d8ff).setStrokeStyle(2, 0xffffff);
    this.status = this.add.text(12, 12, '', { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#ffffff', backgroundColor: '#101820dd', padding: { x: 8, y: 6 }, wordWrap: { width: 350 } }).setScrollFactor(0).setDepth(10);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointerup', () => { this.touchTarget = undefined; });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > this.scale.height - 100 && pointer.x > this.scale.width - 150) this.interact();
    });
    this.input.keyboard?.on('keydown-ONE', () => this.selectJob('MC-OPT-R01-01'));
    this.input.keyboard?.on('keydown-TWO', () => this.selectJob('MC-OPT-F01-01'));
    this.input.keyboard?.on('keydown-E', () => this.interact());
    this.add.rectangle(this.scale.width - 76, this.scale.height - 48, 124, 58, 0x24cec7, 0.95).setScrollFactor(0).setDepth(10);
    this.add.text(this.scale.width - 76, this.scale.height - 48, 'INTERACT\nE', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.cameras.main.startFollow(this.lead, true, 0.15, 0.15);
    this.refreshStatus();
    Object.defineProperty(globalThis, '__MEOWCENARY_INT_FB__', { configurable: true, value: { diagnostics: () => this.diagnostics() } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_INT_FB__; });
  }

  update(_time: number, delta: number): void {
    if (!this.lead) return;
    let x = 0;
    let y = 0;
    if (this.keys?.left?.isDown || this.input.keyboard?.addKey('A').isDown) x -= 1;
    if (this.keys?.right?.isDown || this.input.keyboard?.addKey('D').isDown) x += 1;
    if (this.keys?.up?.isDown || this.input.keyboard?.addKey('W').isDown) y -= 1;
    if (this.keys?.down?.isDown || this.input.keyboard?.addKey('S').isDown) y += 1;
    if (x === 0 && y === 0 && this.touchTarget) { x = this.touchTarget.x - this.lead.x; y = this.touchTarget.y - this.lead.y; }
    const length = Math.hypot(x, y);
    if (length === 0) return;
    const step = SPEED * SCALE * delta / 1000;
    this.lead.x = Phaser.Math.Clamp(this.lead.x + x / length * step, 7, INTEGRATED_FIXTURE_ENVELOPE.widthMetres * SCALE - 7);
    this.lead.y = Phaser.Math.Clamp(this.lead.y + y / length * step, 7, INTEGRATED_FIXTURE_ENVELOPE.heightMetres * SCALE - 7);
  }

  private selectJob(jobId: FixtureJobId): void { this.jobId = jobId; this.completed.clear(); this.groupCleared = false; this.extracted = false; this.refreshStatus(); }
  private interact(): void {
    if (!this.lead) return;
    if (!this.jobId) { this.selectJob(this.lead.x < 250 ? 'MC-OPT-R01-01' : 'MC-OPT-F01-01'); return; }
    const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)!;
    const nearby = INTEGRATED_FIXTURE_POINTS.find(point => Math.hypot(point.x * SCALE - this.lead!.x, point.z * SCALE - this.lead!.y) < 38);
    if (!nearby) return;
    if (nearby.role === 'interaction') this.completed.add(nearby.id);
    if (nearby.role === 'spawn') this.groupCleared = true;
    if (nearby.id === job.extractionPointId) this.extracted = operationCanSettle({ jobId: this.jobId, completedInteractionIds: [...this.completed], finiteEnemyGroupCleared: this.groupCleared, extractionConfirmed: true });
    this.refreshStatus();
  }
  private refreshStatus(): void {
    const job = this.jobId ? INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)! : undefined;
    this.status?.setText(job ? `INT-FB ${job.id}\n${this.extracted ? 'COMPLETE — test-only receipt pending adapter' : `Objectives ${this.completed.size}/${job.requiredInteractionIds.length}${job.requiresFiniteGroupClear ? ` · exit group ${this.groupCleared ? 'clear' : 'active'}` : ' · extraction allowed'}\nMove to markers/spawn/extraction; tap INTERACT or E`}` : 'INT-FB proving ground\nChoose R01 (1 / left side) or F01 (2 / right side).\nWASD/arrows or touch-hold to move. No save changes.');
  }
  public diagnostics(): Readonly<{ scene: string; x: number; y: number; jobId?: FixtureJobId; extracted: boolean }> { return Object.freeze({ scene: this.scene.key, x: this.lead?.x ?? 0, y: this.lead?.y ?? 0, jobId: this.jobId, extracted: this.extracted }); }
}
