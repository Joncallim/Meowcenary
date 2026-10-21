import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { createIntegratedFixtureSave, createIntegratedFixtureWorkshopProfile, deserializeIntegratedFixtureSave, fixtureDialogue, INTEGRATED_FIXTURE_SAVE_KEY, IntegratedFixtureCombat, IntegratedFixtureOperation, INTEGRATED_FIXTURE_ENVELOPE, INTEGRATED_FIXTURE_JOBS, INTEGRATED_FIXTURE_POINTS, INTEGRATED_FIXTURE_SURFACES, resolveFixtureTakeover, settleFixtureWorkshopMission, settleIntegratedFixtureJob, type FixtureJobId, type FixtureMissionSave, type FixtureWorkshopProfile, validateIntegratedFixture } from '../gameplay/integratedFixture';

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
  private combatActive = false;
  private combat = new IntegratedFixtureCombat();
  private operation = new IntegratedFixtureOperation();
  private fixtureSave: FixtureMissionSave = createIntegratedFixtureSave();
  private workshopProfile: FixtureWorkshopProfile = createIntegratedFixtureWorkshopProfile();
  private controlledActor: 'tabby' | 'hound' = 'tabby';
  private takeoverPrompt?: Phaser.GameObjects.Text;
  private combatFeedback = 'No hostile contact.';
  private hound?: Phaser.GameObjects.Arc;
  private enemies: Phaser.GameObjects.Arc[] = [];

  constructor() { super(SceneKey.IntegratedFixture); }

  create(): void {
    const errors = validateIntegratedFixture();
    if (errors.length) throw new Error(`INT-FB fixture invalid: ${errors.join(',')}`);
    try { this.fixtureSave = deserializeIntegratedFixtureSave(localStorage.getItem(INTEGRATED_FIXTURE_SAVE_KEY)); } catch { this.fixtureSave = createIntegratedFixtureSave(); }
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
    this.hound = this.add.circle(65, 110, 6, 0x84e6a0).setStrokeStyle(2, 0xffffff);
    this.enemies = [this.add.circle(350, 380, 7, 0xef6b73), this.add.circle(370, 400, 7, 0xef6b73)];
    this.enemies.forEach(enemy => enemy.setVisible(false));
    this.status = this.add.text(12, 12, '', { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#ffffff', backgroundColor: '#101820dd', padding: { x: 8, y: 6 }, wordWrap: { width: 350 } }).setScrollFactor(0).setDepth(10);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointerup', () => { this.touchTarget = undefined; });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > this.scale.height - 100 && pointer.x > this.scale.width - 150) this.interact();
      if (pointer.y > this.scale.height - 100 && pointer.x < 150) this.swapGun();
    });
    this.input.keyboard?.on('keydown-ONE', () => this.selectJob('MC-OPT-R01-01'));
    this.input.keyboard?.on('keydown-TWO', () => this.selectJob('MC-OPT-F01-01'));
    this.input.keyboard?.on('keydown-E', () => this.interact());
    this.input.keyboard?.on('keydown-Q', () => this.swapGun());
    this.input.keyboard?.on('keydown-T', () => this.confirmTakeover());
    this.add.rectangle(76, this.scale.height - 48, 124, 58, 0x7393d8, 0.95).setScrollFactor(0).setDepth(10);
    this.add.text(76, this.scale.height - 48, 'SWAP\nQ', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.add.rectangle(this.scale.width - 76, this.scale.height - 48, 124, 58, 0x24cec7, 0.95).setScrollFactor(0).setDepth(10);
    this.add.text(this.scale.width - 76, this.scale.height - 48, 'INTERACT\nE', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.cameras.main.startFollow(this.lead, true, 0.15, 0.15);
    this.takeoverPrompt = this.add.text(this.scale.width / 2, this.scale.height / 2, '', { fontFamily: 'Nunito, sans-serif', fontSize: '18px', color: '#ffffff', backgroundColor: '#34151bdd', align: 'center', padding: { x: 12, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(20).setVisible(false);
    this.refreshStatus();
    Object.defineProperty(globalThis, '__MEOWCENARY_INT_FB__', { configurable: true, value: { diagnostics: () => this.diagnostics() } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_INT_FB__; });
  }

  update(_time: number, delta: number): void {
    if (!this.lead || !this.hound) return;
    const controlled = this.controlledActor === 'tabby' ? this.lead : this.hound;
    let x = 0;
    let y = 0;
    if (this.keys?.left?.isDown || this.input.keyboard?.addKey('A').isDown) x -= 1;
    if (this.keys?.right?.isDown || this.input.keyboard?.addKey('D').isDown) x += 1;
    if (this.keys?.up?.isDown || this.input.keyboard?.addKey('W').isDown) y -= 1;
    if (this.keys?.down?.isDown || this.input.keyboard?.addKey('S').isDown) y += 1;
    if (x === 0 && y === 0 && this.touchTarget) { x = this.touchTarget.x - controlled.x; y = this.touchTarget.y - controlled.y; }
    const length = Math.hypot(x, y);
    if (length !== 0) {
      const step = SPEED * SCALE * delta / 1000;
      controlled.x = Phaser.Math.Clamp(controlled.x + x / length * step, 7, INTEGRATED_FIXTURE_ENVELOPE.widthMetres * SCALE - 7);
      controlled.y = Phaser.Math.Clamp(controlled.y + y / length * step, 7, INTEGRATED_FIXTURE_ENVELOPE.heightMetres * SCALE - 7);
    }
    if (this.controlledActor === 'tabby') { this.hound.x += (this.lead.x - 15 - this.hound.x) * Math.min(1, delta / 150); this.hound.y += (this.lead.y - this.hound.y) * Math.min(1, delta / 150); }
    if (this.combatActive && this.hound) {
      this.combat.setSquadPositions({ x: this.lead.x / SCALE, z: this.lead.y / SCALE }, { x: this.hound.x / SCALE, z: this.hound.y / SCALE });
      const events = this.combat.advance(delta / 1000);
      if (events.length) this.combatFeedback = events.map(event => `${event.type}:${event.sourceId}>${event.targetId}`).join(' · ');
      const hostiles = this.combat.hostileStates();
      this.groupCleared = this.combat.isGroupCleared();
      if (this.groupCleared) this.operation.setFiniteGroupCleared();
      const takeover = resolveFixtureTakeover(this.combat.actorHealth('tabby'), this.combat.actorHealth('hound'), this.controlledActor === 'hound');
      if (takeover === 'takeover-required') this.takeoverPrompt?.setText('Tabby is down.\nContinue as Hound?\nT / TAKE OVER').setVisible(true);
      if (takeover === 'lost') this.takeoverPrompt?.setText('Squad down.\nReturn to safe service for recovery.').setVisible(true);
      this.enemies.forEach((enemy, index) => {
        const hostile = hostiles[index];
        if (!hostile) return enemy.setVisible(false);
        enemy.setVisible(true).setPosition(hostile.position.x * SCALE, hostile.position.z * SCALE).setAlpha(hostile.health === 0 ? 0.2 : 1);
      });
      this.refreshStatus();
    }
  }

  private selectJob(jobId: FixtureJobId): void { this.jobId = jobId; this.operation.inspect(jobId); this.completed.clear(); this.groupCleared = false; this.extracted = false; this.combatActive = false; this.enemies.forEach(enemy => enemy.setVisible(false)); this.refreshStatus(); }
  private swapGun(): void {
    const swapped = this.combat.swapActiveGun('tabby');
    this.combatFeedback = swapped ? `Tabby switched to ${this.combat.activeGun('tabby').instanceId}; 0.30s swap preparation.` : 'Gun swap unavailable.';
    this.refreshStatus();
  }
  private confirmTakeover(): void {
    if (!this.lead || !this.hound || resolveFixtureTakeover(this.combat.actorHealth('tabby'), this.combat.actorHealth('hound'), false) !== 'takeover-required') return;
    this.controlledActor = 'hound';
    this.cameras.main.startFollow(this.hound, true, 0.15, 0.15);
    this.takeoverPrompt?.setVisible(false);
    this.combatFeedback = 'Hound has taken control. Squad contract remains active.';
    this.refreshStatus();
  }
  private interact(): void {
    if (!this.lead) return;
    if (!this.jobId) { this.selectJob(this.lead.x < 250 ? 'MC-OPT-R01-01' : 'MC-OPT-F01-01'); return; }
    const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)!;
    const nearby = INTEGRATED_FIXTURE_POINTS.find(point => Math.hypot(point.x * SCALE - this.lead!.x, point.z * SCALE - this.lead!.y) < 38);
    if (!nearby) return;
    if (nearby.role === 'offer-terminal') this.combatFeedback = this.operation.accept() ? `${fixtureDialogue(job.id, 'accepted')} Reach its entry to activate.` : 'Inspect a job before accepting it.';
    if (nearby.role === 'interaction' && this.operation.interact(nearby.id)) this.completed.add(nearby.id);
    if (nearby.role === 'spawn') {
      if (this.operation.activate()) { this.combatActive = true; this.combat.beginJob(this.jobId); this.combatFeedback = 'Hostiles activated; auto-fire uses each mercenary position and ballistic LOS.'; }
      else this.combatFeedback = 'Contract must be accepted at the offer terminal before activation.';
    }
    if (nearby.id === job.extractionPointId) {
      this.extracted = this.operation.extract();
      if (this.extracted) {
        const result = settleIntegratedFixtureJob(this.fixtureSave, job.id);
        const workshop = settleFixtureWorkshopMission(this.workshopProfile, `mission:${job.id}:settlement`);
        if (!workshop.applied && !this.fixtureSave.receipts.some(receipt => receipt.jobId === job.id)) { this.extracted = false; this.combatFeedback = 'Settlement could not reconcile; no receipt written.'; this.refreshStatus(); return; }
        const nextWorkshop = workshop.profile;
        try { localStorage.setItem(INTEGRATED_FIXTURE_SAVE_KEY, JSON.stringify(result.save)); localStorage.setItem(`${INTEGRATED_FIXTURE_SAVE_KEY}:workshop`, JSON.stringify(nextWorkshop)); }
        catch { this.extracted = false; this.combatFeedback = 'Settlement storage failed; no success recorded.'; this.refreshStatus(); return; }
        this.fixtureSave = result.save;
        this.workshopProfile = nextWorkshop;
        this.combatFeedback = `${fixtureDialogue(job.id, 'result')} ${result.applied ? 'Settlement saved.' : 'Existing receipt restored.'}`;
      }
    }
    this.refreshStatus();
  }
  private refreshStatus(): void {
    const job = this.jobId ? INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)! : undefined;
    const hostiles = this.combat.hostileStates().filter(hostile => hostile.health > 0).length;
    const tabbyGun = this.combat.activeGun('tabby');
    const phase = this.operation.snapshot().phase;
    this.status?.setText(job ? `INT-FB ${job.id} · ${phase}\n${this.extracted ? 'COMPLETE — isolated receipt saved' : `Objectives ${this.completed.size}/${job.requiredInteractionIds.length}${job.requiresFiniteGroupClear ? ` · exit group ${this.groupCleared ? 'clear' : this.combatActive ? `${hostiles} hostile(s)` : 'activate at spawn'}` : ' · extraction allowed'}\nTAB ${this.combat.actorHealth('tabby').toFixed(0)} HP · ${tabbyGun.instanceId.split(':').at(-1)} ${tabbyGun.supply} · HOU ${this.combat.actorHealth('hound').toFixed(0)} HP\n${this.combatFeedback}\nMove to offer/markers/spawn/extraction; tap INTERACT or E; swap TAB gun with Q`}` : `INT-FB proving ground\n${this.fixtureSave.receipts.length} isolated receipt(s) loaded. Choose R01 (1 / left side) or F01 (2 / right side).\nWASD/arrows or touch-hold to move.`);
  }
  public diagnostics(): Readonly<{ scene: string; x: number; y: number; jobId?: FixtureJobId; phase: string; extracted: boolean; combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; tabbyGun: string; hostiles: number }> {
    return Object.freeze({ scene: this.scene.key, x: this.lead?.x ?? 0, y: this.lead?.y ?? 0, jobId: this.jobId, extracted: this.extracted,
      phase: this.operation.snapshot().phase, combatActive: this.combatActive, groupCleared: this.groupCleared, tabbyHealth: this.combat.actorHealth('tabby'), houndHealth: this.combat.actorHealth('hound'), tabbyGun: this.combat.activeGun('tabby').instanceId,
      hostiles: this.combat.hostileStates().filter(hostile => hostile.health > 0).length });
  }
}
