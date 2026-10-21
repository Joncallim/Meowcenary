import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { createUiText } from '../ui/text';
import { commitAndPersistFixtureWorkshop, createIntegratedFixtureSave, createIntegratedFixtureWorkshopProfile, deserializeIntegratedFixtureSave, deserializeIntegratedFixtureWorkshopProfile, fixtureDialogue, INTEGRATED_FIXTURE_SAVE_KEY, IntegratedFixtureCombat, IntegratedFixtureOperation, INTEGRATED_FIXTURE_ENVELOPE, INTEGRATED_FIXTURE_JOBS, INTEGRATED_FIXTURE_POINTS, INTEGRATED_FIXTURE_SURFACES, resolveFixtureTakeover, settleFixtureWorkshopMission, settleIntegratedFixtureJob, type FixtureJobId, type FixtureMissionSave, type FixtureWorkshopAction, type FixtureWorkshopProfile, validateIntegratedFixture } from '../gameplay/integratedFixture';

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
  private workshopPreview?: FixtureWorkshopAction;
  private workshopPreviewRevision?: number;
  private workshopModal?: Phaser.GameObjects.Container;
  private combatFeedback = 'No hostile contact.';
  private hound?: Phaser.GameObjects.Arc;
  private enemies: Phaser.GameObjects.Arc[] = [];

  constructor() { super(SceneKey.IntegratedFixture); }

  create(): void {
    const errors = validateIntegratedFixture();
    if (errors.length) throw new Error(`INT-FB fixture invalid: ${errors.join(',')}`);
    try {
      const envelope = localStorage.getItem(`${INTEGRATED_FIXTURE_SAVE_KEY}:profile`);
      if (envelope) {
        const parsed = JSON.parse(envelope) as { mission?: FixtureMissionSave; workshop?: FixtureWorkshopProfile };
        this.fixtureSave = deserializeIntegratedFixtureSave(JSON.stringify(parsed.mission));
        this.workshopProfile = deserializeIntegratedFixtureWorkshopProfile(parsed.workshop);
      } else this.fixtureSave = deserializeIntegratedFixtureSave(localStorage.getItem(INTEGRATED_FIXTURE_SAVE_KEY));
    } catch { this.fixtureSave = createIntegratedFixtureSave(); this.workshopProfile = createIntegratedFixtureWorkshopProfile(); }
    const width = INTEGRATED_FIXTURE_ENVELOPE.widthMetres * SCALE;
    const height = INTEGRATED_FIXTURE_ENVELOPE.heightMetres * SCALE;
    this.cameras.main.setBounds(0, 0, width, height).setBackgroundColor('#101820');
    const colors: Readonly<Record<string, number>> = { safe: 0x285943, road: 0x39495a, ramp: 0x7b6c4a, bridge: 0x815a3a, underpass: 0x26313d, tunnel: 0x1a1d2a, pocket: 0x49354e };
    for (const surface of INTEGRATED_FIXTURE_SURFACES) {
      this.add.rectangle((surface.x + surface.width / 2) * SCALE, (surface.z + surface.depth / 2) * SCALE,
        surface.width * SCALE, surface.depth * SCALE, colors[surface.kind] ?? 0x555555, 0.95).setStrokeStyle(2, 0xb7d5da);
      createUiText(this, (surface.x + 0.5) * SCALE, (surface.z + 0.5) * SCALE, surface.id.replace('INT-FB-', ''), { fontFamily: 'Nunito, sans-serif', fontSize: '11px', color: '#e9f3f5' });
    }
    for (const point of INTEGRATED_FIXTURE_POINTS) {
      this.add.circle(point.x * SCALE, point.z * SCALE, 5, point.role === 'service' ? 0x3ee8a9 : 0xffd166).setStrokeStyle(1, 0x0b1118);
    }
    this.lead = this.add.circle(8 * SCALE, 11 * SCALE, 7, 0x71d8ff).setStrokeStyle(2, 0xffffff);
    this.hound = this.add.circle(65, 110, 6, 0x84e6a0).setStrokeStyle(2, 0xffffff);
    this.enemies = [this.add.circle(350, 380, 7, 0xef6b73), this.add.circle(370, 400, 7, 0xef6b73)];
    this.enemies.forEach(enemy => enemy.setVisible(false));
    this.status = createUiText(this, 12, 12, '', { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#ffffff', backgroundColor: '#101820dd', padding: { x: 8, y: 6 }, wordWrap: { width: 350 } }).setScrollFactor(0).setDepth(10);
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
    this.input.keyboard?.on('keydown-B', () => this.openWorkshopMenu());
    this.input.keyboard?.on('keydown-F', () => this.openWorkshop('fit-f2-a'));
    this.input.keyboard?.on('keydown-G', () => this.openWorkshop('build-b3'));
    this.input.keyboard?.on('keydown-D', () => this.openWorkshop('develop-b2'));
    this.input.keyboard?.on('keydown-L', () => this.openWorkshop('claim-h2'));
    this.input.keyboard?.on('keydown-S', () => this.openWorkshop('sell-h2'));
    this.input.keyboard?.on('keydown-ENTER', () => this.confirmWorkshop());
    this.input.keyboard?.on('keydown-ESC', () => this.cancelWorkshop());
    this.add.rectangle(76, this.scale.height - 48, 124, 58, 0x7393d8, 0.95).setScrollFactor(0).setDepth(10);
    createUiText(this, 76, this.scale.height - 48, 'SWAP\nQ', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.add.rectangle(this.scale.width - 76, this.scale.height - 48, 124, 58, 0x24cec7, 0.95).setScrollFactor(0).setDepth(10);
    createUiText(this, this.scale.width - 76, this.scale.height - 48, 'INTERACT\nE', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.add.rectangle(this.scale.width / 2, this.scale.height - 48, 110, 58, 0xf6c85f, 0.95).setScrollFactor(0).setDepth(10).setInteractive().on('pointerup', () => this.openWorkshopMenu());
    createUiText(this, this.scale.width / 2, this.scale.height - 48, 'WORKSHOP\nB', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.cameras.main.startFollow(this.lead, true, 0.15, 0.15);
    this.takeoverPrompt = createUiText(this, this.scale.width / 2, this.scale.height / 2, '', { fontFamily: 'Nunito, sans-serif', fontSize: '18px', color: '#ffffff', backgroundColor: '#34151bdd', align: 'center', padding: { x: 12, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setDepth(20).setVisible(false);
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
  private atService(): boolean { return !!this.lead && Math.hypot(this.lead.x - 80, this.lead.y - 80) < 55; }
  private openWorkshopMenu(): void {
    if (!this.atService()) { this.combatFeedback = 'Workshop unavailable: move Tabby to safe service.'; this.refreshStatus(); return; }
    this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy();
    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2).setScrollFactor(0).setDepth(30);
    const actions: readonly [FixtureWorkshopAction, string][] = [['buy-f2', 'BUY F2'], ['fit-f2-a', 'FIT F2'], ['claim-h2', 'CLAIM H2'], ['sell-h2', 'SELL H2'], ['build-b3', 'BUILD B3'], ['fit-b3-a', 'FIT B3'], ['develop-b2', 'DEVELOP B2']];
    panel.add(this.add.rectangle(0, 0, Math.min(460, this.scale.width - 20), 330, 0x0b1118, .98).setStrokeStyle(2, 0xf6c85f));
    panel.add(createUiText(this, 0, -135, `SAFE SERVICE WORKSHOP\nCredits ${this.workshopProfile.wallet.credits} · Metal ${this.workshopProfile.wallet.metal} · Circuits ${this.workshopProfile.wallet.circuits}`, { align: 'center', fontSize: '14px', color: '#fff' }).setOrigin(.5));
    actions.forEach(([action, label], index) => { const x = (index % 2 ? 90 : -90); const y = -65 + Math.floor(index / 2) * 58; const button = this.add.rectangle(x, y, 155, 42, 0x7393d8).setInteractive(); const text = createUiText(this, x, y, label, { fontSize: '13px', color: '#071018' }).setOrigin(.5); button.on('pointerup', () => this.openWorkshop(action)); panel.add([button, text]); });
    const close = createUiText(this, 0, 135, 'CLOSE / ESC', { fontSize: '13px', color: '#fff' }).setOrigin(.5).setInteractive(); close.on('pointerup', () => this.cancelWorkshop()); panel.add(close); this.workshopModal = panel;
  }
  private openWorkshop(action: FixtureWorkshopAction): void {
    if (!this.atService()) { this.combatFeedback = 'Workshop unavailable: move Tabby to safe service.'; this.refreshStatus(); return; }
    this.workshopPreview = action;
    this.workshopPreviewRevision = this.workshopProfile.revision;
    this.workshopModal?.destroy();
    const labels: Record<FixtureWorkshopAction, string> = { 'buy-f2': 'Buy TAB-F2 — 1650 Credits', 'fit-f2-a': 'Fit owned TAB-F2 to TAB-A — free', 'claim-h2': 'Claim discovered HOU-H2 — free', 'sell-h2': 'Sell unassigned HOU-H2 — +540 Credits', 'build-b3': 'Build TAB-B3 T1 — 1000 Credits / 40 Metal / 8 Circuits', 'fit-b3-a': 'Fit owned TAB-B3 to TAB-A — free', 'develop-b2': 'Develop gift TAB-B2 T1 → T2 — 500 Credits / 20 Metal / 4 Circuits' };
    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2).setScrollFactor(0).setDepth(30);
    const background = this.add.rectangle(0, 0, Math.min(500, this.scale.width - 20), 220, 0x0b1118, 0.98).setStrokeStyle(2, 0x24cec7);
    const text = createUiText(this, 0, -58, `WORKSHOP PREVIEW\n${labels[action]}\nNo wallet, item, claim, or assignment changes until confirmed.`, { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#ffffff', wordWrap: { width: Math.min(450, this.scale.width - 50) } }).setOrigin(.5);
    const confirm = this.add.rectangle(-85, 65, 140, 45, 0x3ee8a9).setInteractive();
    const cancel = this.add.rectangle(85, 65, 140, 45, 0xef6b73).setInteractive();
    const yes = createUiText(this, -85, 65, 'CONFIRM\nENTER', { align: 'center', fontSize: '13px', color: '#071018' }).setOrigin(.5);
    const no = createUiText(this, 85, 65, 'CANCEL\nESC', { align: 'center', fontSize: '13px', color: '#071018' }).setOrigin(.5);
    confirm.on('pointerup', () => this.confirmWorkshop()); cancel.on('pointerup', () => this.cancelWorkshop());
    panel.add([background, text, confirm, cancel, yes, no]); this.workshopModal = panel;
    this.combatFeedback = `Preview ready: ${labels[action]}`; this.refreshStatus();
  }
  private cancelWorkshop(): void { if (!this.workshopPreview && !this.workshopModal) return; this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy(); this.workshopModal = undefined; this.combatFeedback = 'Workshop preview cancelled; nothing changed.'; this.refreshStatus(); }
  private confirmWorkshop(): void {
    const action = this.workshopPreview;
    if (!action) return;
    if (!this.atService()) { this.cancelWorkshop(); this.combatFeedback = 'Workshop confirmation rejected: safe service required.'; this.refreshStatus(); return; }
    try {
      const saved = localStorage.getItem(`${INTEGRATED_FIXTURE_SAVE_KEY}:profile`);
      if (saved) {
        const raw = JSON.parse(saved) as { workshop?: unknown };
        const durable = deserializeIntegratedFixtureWorkshopProfile(raw.workshop);
        if ((raw.workshop as { version?: string } | undefined)?.version === 'int-fb-profile-v2' && durable.revision !== this.workshopProfile.revision) {
          this.workshopProfile = durable; this.cancelWorkshop(); this.combatFeedback = 'Workshop changed in another tab; review the refreshed profile before confirming.'; this.refreshStatus(); return;
        }
      }
    } catch { this.cancelWorkshop(); this.combatFeedback = 'Workshop storage could not be read; nothing changed.'; this.refreshStatus(); return; }
    if (this.workshopPreviewRevision !== this.workshopProfile.revision) { this.cancelWorkshop(); this.combatFeedback = 'Workshop preview is stale; review the latest profile.'; this.refreshStatus(); return; }
    const commandId = `ui:${action}:${this.workshopProfile.revision}`;
    const fitKind = action === 'fit-f2-a' ? 'F2' : action === 'fit-b3-a' ? 'B3' : undefined;
    const fitCandidates = fitKind ? this.workshopProfile.parts.filter(part => part.kind === fitKind) : [];
    const partInstanceId = fitCandidates.length === 1 ? fitCandidates[0].instanceId : undefined;
    const result = commitAndPersistFixtureWorkshop(this.workshopProfile, { commandId, expectedRevision: this.workshopPreviewRevision, action, partInstanceId }, candidate => localStorage.setItem(`${INTEGRATED_FIXTURE_SAVE_KEY}:profile`, JSON.stringify({ version: 'int-fb-envelope-v2', mission: this.fixtureSave, workshop: candidate })));
    if (!result.applied) { this.cancelWorkshop(); this.combatFeedback = result.reason === 'storage-failed' ? 'Workshop storage failed; no debit, item, or assignment was applied.' : `Workshop rejected: ${result.reason ?? 'invalid'}.`; this.refreshStatus(); return; }
    this.workshopProfile = result.profile; this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy(); this.workshopModal = undefined;
    this.combatFeedback = `Workshop saved: ${action.replaceAll('-', ' ')} (receipt ${result.receipt!.commandId}).`; this.refreshStatus();
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
      if (this.operation.canExtract()) {
        const result = settleIntegratedFixtureJob(this.fixtureSave, job.id);
        const workshop = settleFixtureWorkshopMission(this.workshopProfile, `mission:${job.id}:settlement`);
        if (!workshop.applied && !this.fixtureSave.receipts.some(receipt => receipt.jobId === job.id)) { this.combatFeedback = 'Settlement could not reconcile; no receipt written.'; this.refreshStatus(); return; }
        const nextWorkshop = workshop.profile;
        try { localStorage.setItem(`${INTEGRATED_FIXTURE_SAVE_KEY}:profile`, JSON.stringify({ version: 'int-fb-profile-v1', mission: result.save, workshop: nextWorkshop })); }
        catch { this.combatFeedback = 'Settlement storage failed; extraction remains active for retry.'; this.refreshStatus(); return; }
        this.fixtureSave = result.save;
        this.workshopProfile = nextWorkshop;
        this.extracted = this.operation.extract();
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
  public diagnostics(): Readonly<{ scene: string; x: number; y: number; jobId?: FixtureJobId; phase: string; extracted: boolean; combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; tabbyGun: string; hostiles: number; workshopRevision: number; workshopCredits: number; workshopParts: number; workshopPreview?: FixtureWorkshopAction }> {
    return Object.freeze({ scene: this.scene.key, x: this.lead?.x ?? 0, y: this.lead?.y ?? 0, jobId: this.jobId, extracted: this.extracted,
      phase: this.operation.snapshot().phase, combatActive: this.combatActive, groupCleared: this.groupCleared, tabbyHealth: this.combat.actorHealth('tabby'), houndHealth: this.combat.actorHealth('hound'), tabbyGun: this.combat.activeGun('tabby').instanceId,
      hostiles: this.combat.hostileStates().filter(hostile => hostile.health > 0).length, workshopRevision: this.workshopProfile.revision, workshopCredits: this.workshopProfile.wallet.credits, workshopParts: this.workshopProfile.parts.length, workshopPreview: this.workshopPreview });
  }
}
