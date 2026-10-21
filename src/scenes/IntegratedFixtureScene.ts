import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { INTEGRATED_FIXTURE_ENVELOPE, INTEGRATED_FIXTURE_POINTS, INTEGRATED_FIXTURE_SURFACES, validateIntegratedFixture } from '../gameplay/integratedFixture';

const SCALE = 10;
const SPEED = 12;

/** Isolated visual proving-ground route: ?fixture=int-fb. No save mutation. */
export class IntegratedFixtureScene extends Phaser.Scene {
  private lead?: Phaser.GameObjects.Arc;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private touchTarget?: Phaser.Math.Vector2;

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
    this.add.text(12, 12, 'INT-FB proving ground\nWASD / arrows: move · touch: hold direction\nDebug fixture only — no save changes', { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#ffffff', backgroundColor: '#101820cc', padding: { x: 8, y: 6 } }).setScrollFactor(0).setDepth(10);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointerup', () => { this.touchTarget = undefined; });
    this.cameras.main.startFollow(this.lead, true, 0.15, 0.15);
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
}
