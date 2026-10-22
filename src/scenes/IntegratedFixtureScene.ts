import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import {
  beginFixtureProfileAttempt,
  commitAndPersistFixtureWorkshop,
  createIntegratedFixtureEnvelope,
  deserializeIntegratedFixtureEnvelope,
  failFixtureProfileAttempt,
  fixtureDialogue,
  fixturePointLayer,
  INTEGRATED_FIXTURE_ENVELOPE,
  INTEGRATED_FIXTURE_ENVELOPE_KEY,
  INTEGRATED_FIXTURE_JOBS,
  INTEGRATED_FIXTURE_OCCLUDERS,
  INTEGRATED_FIXTURE_POINTS,
  INTEGRATED_FIXTURE_SAVE_KEY,
  INTEGRATED_FIXTURE_SURFACES,
  IntegratedFixtureCombat,
  IntegratedFixtureOperation,
  nextFixtureAttemptId,
  nextFixtureWorldEventId,
  moveFixtureTerrainPosition,
  operationCanSettle,
  resolveFixtureTakeover,
  retryFixtureProfileAttempt,
  serializeIntegratedFixtureEnvelope,
  settleFixtureProfileAttempt,
  settleIntegratedFixtureEvent,
  type FixtureAttemptId,
  type FixtureLayer,
  type FixtureJobId,
  type FixtureLiveMission,
  type FixturePersistentEnvelope,
  type FixtureWorkshopAction,
  type FixtureWorldEventId,
  validateIntegratedFixture,
} from '../gameplay/integratedFixture';
import { createUiText } from '../ui/text';

const SCALE = 10;
const SPEED = 12;
const SAFE_POSITION = Object.freeze({ tabby: { x: 80, y: 110 }, hound: { x: 65, y: 110 } });

type RecoveryMode = 'none' | 'writing' | 'write-failed' | 'recovered';
type FixtureLockManager = { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T> };
type FixtureControlBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * Isolated browser proving-ground route: ?fixture=int-fb. It owns one local
 * envelope and deliberately never reads or writes the normal game save.
 */
export class IntegratedFixtureScene extends Phaser.Scene {
  private lead?: Phaser.GameObjects.Arc;
  private hound?: Phaser.GameObjects.Arc;
  private enemies: Phaser.GameObjects.Arc[] = [];
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private touchTarget?: Phaser.Math.Vector2;
  private status?: Phaser.GameObjects.Text;
  private takeoverPrompt?: Phaser.GameObjects.Text;
  private recoveryModal?: Phaser.GameObjects.Container;
  private recoveryHeading?: Phaser.GameObjects.Text;
  private recoveryDetail?: Phaser.GameObjects.Text;
  private swapButton?: Phaser.GameObjects.Rectangle;
  private interactButton?: Phaser.GameObjects.Rectangle;
  private workshopButton?: Phaser.GameObjects.Rectangle;
  private recoveryButton?: Phaser.GameObjects.Rectangle;
  private retryButton?: Phaser.GameObjects.Rectangle;

  private jobId?: FixtureJobId;
  private completed = new Set<string>();
  private groupCleared = false;
  private extracted = false;
  private controlledActor: 'tabby' | 'hound' = 'tabby';
  private tabbyLayer: FixtureLayer = 'ground';
  private houndLayer: FixtureLayer = 'ground';
  private combatActive = false;
  private combat = new IntegratedFixtureCombat();
  private operation = new IntegratedFixtureOperation();
  private envelope: FixturePersistentEnvelope = createIntegratedFixtureEnvelope();
  private activeWorldEventId?: FixtureWorldEventId;
  private activeAttemptId?: FixtureAttemptId;
  private recoveryMode: RecoveryMode = 'none';
  private recoveryFee?: number;
  private activationWriting = false;
  private progressWriting = false;
  private combatCheckpointWriting = false;
  private combatCheckpointElapsed = 0;
  private settlementPending = false;
  private workshopPreview?: FixtureWorkshopAction;
  private workshopPreviewRevision?: number;
  private workshopModal?: Phaser.GameObjects.Container;
  private combatFeedback = 'No hostile contact.';
  private combatEventSequence = 0;
  private failNextStorageWrite = false;
  private failNextRecoveryWrite = false;
  private rejectNextWriterLock = false;

  constructor() { super(SceneKey.IntegratedFixture); }

  create(): void {
    const errors = validateIntegratedFixture();
    if (errors.length) throw new Error(`INT-FB fixture invalid: ${errors.join(',')}`);
    this.envelope = this.readEnvelope() ?? createIntegratedFixtureEnvelope();
    this.combat = new IntegratedFixtureCombat(this.envelope.workshop);

    const width = INTEGRATED_FIXTURE_ENVELOPE.widthMetres * SCALE;
    const height = INTEGRATED_FIXTURE_ENVELOPE.heightMetres * SCALE;
    this.cameras.main.setBounds(0, 0, width, height).setBackgroundColor('#101820');
    const colors: Readonly<Record<string, number>> = { safe: 0x285943, road: 0x39495a, ramp: 0x7b6c4a, bridge: 0x815a3a, underpass: 0x26313d, tunnel: 0x1a1d2a, pocket: 0x49354e };
    for (const surface of INTEGRATED_FIXTURE_SURFACES) {
      this.add.rectangle((surface.x + surface.width / 2) * SCALE, (surface.z + surface.depth / 2) * SCALE,
        surface.width * SCALE, surface.depth * SCALE, colors[surface.kind] ?? 0x555555, .95).setStrokeStyle(2, 0xb7d5da).setDepth(surface.elevation > 0 ? 2 : 1);
      createUiText(this, (surface.x + .5) * SCALE, (surface.z + .5) * SCALE, `${surface.id.replace('INT-FB-', '')}${surface.elevation > 0 ? ' ↑' : ''}`, { fontFamily: 'Nunito, sans-serif', fontSize: '11px', color: '#e9f3f5' }).setDepth(surface.elevation > 0 ? 3 : 2);
    }
    for (const occluder of INTEGRATED_FIXTURE_OCCLUDERS) this.add.rectangle((occluder.x + occluder.width / 2) * SCALE, (occluder.z + occluder.depth / 2) * SCALE, occluder.width * SCALE, occluder.depth * SCALE, 0x101820, .95).setStrokeStyle(2, 0xef6b73).setDepth(4);
    for (const point of INTEGRATED_FIXTURE_POINTS) this.add.circle(point.x * SCALE, point.z * SCALE, 5, point.role === 'service' ? 0x3ee8a9 : 0xffd166).setStrokeStyle(1, 0x0b1118).setDepth(5);
    this.lead = this.add.circle(SAFE_POSITION.tabby.x, SAFE_POSITION.tabby.y, 7, 0x71d8ff).setStrokeStyle(2, 0xffffff).setDepth(6);
    this.hound = this.add.circle(SAFE_POSITION.hound.x, SAFE_POSITION.hound.y, 6, 0x84e6a0).setStrokeStyle(2, 0xffffff).setDepth(6);
    this.enemies = [this.add.circle(350, 380, 7, 0xef6b73), this.add.circle(370, 400, 7, 0xef6b73)];
    this.enemies.forEach(enemy => enemy.setVisible(false));
    this.status = createUiText(this, 12, 12, '', { fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#fff', backgroundColor: '#101820dd', padding: { x: 8, y: 6 }, wordWrap: { width: 350 } }).setScrollFactor(0).setDepth(10);
    this.createControls();
    this.keys = this.input.keyboard?.createCursorKeys();
    this.installInputs();
    this.cameras.main.startFollow(this.lead, true, .15, .15);
    if (this.envelope.liveMission) this.restoreLiveMission(this.envelope.liveMission);
    this.refreshStatus();
    Object.defineProperty(globalThis, '__MEOWCENARY_INT_FB__', { configurable: true, value: {
      diagnostics: () => this.diagnostics(),
      surrender: () => this.surrender(),
      forceSquadDefeat: () => this.forceSquadDefeat(),
      forceTabbyDown: () => this.forceTabbyDown(),
      prolongCombat: () => this.prolongCombat(),
      prepareF01: () => this.prepareF01(),
      failNextStorageWrite: () => { this.failNextStorageWrite = true; },
      failNextRecoveryWrite: () => { this.failNextRecoveryWrite = true; },
      rejectNextWriterLock: () => { this.rejectNextWriterLock = true; },
    } });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete (globalThis as Record<string, unknown>).__MEOWCENARY_INT_FB__; });
  }

  update(_time: number, delta: number): void {
    if (!this.lead || !this.hound) return;
    if (this.recoveryMode !== 'none' || this.activationWriting || this.progressWriting || this.settlementPending) return;
    if (this.combatActive) {
      const before = resolveFixtureTakeover(this.combat.actorHealth('tabby'), this.combat.actorHealth('hound'), this.controlledActor === 'hound');
      if (before === 'takeover-required') { this.showTakeoverPrompt(); return; }
      if (before === 'lost') { this.beginRecovery('wipe'); return; }
    }
    const controlled = this.controlledSprite();
    if (!controlled || this.combat.actorHealth(this.controlledActor) <= 0) return;
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
      const moved = moveFixtureTerrainPosition(this.spriteTerrainPosition(this.controlledActor), {
        x: controlled.x / SCALE + x / length * step / SCALE,
        z: controlled.y / SCALE + y / length * step / SCALE,
      });
      controlled.setPosition(moved.position.x * SCALE, moved.position.z * SCALE);
      this.setActorLayer(this.controlledActor, moved.position.layer ?? 'ground');
      if (moved.blocked) this.combatFeedback = 'Route blocked by authored terrain or solid cover.';
    }
    if (this.controlledActor === 'tabby') {
      const houndPosition = this.spriteTerrainPosition('hound');
      const desiredX = (this.lead.x - 15) / SCALE;
      const desiredZ = this.lead.y / SCALE;
      const distance = Math.hypot(desiredX - houndPosition.x, desiredZ - houndPosition.z);
      const followStep = Math.min(distance, SPEED * delta / 1000);
      const follow = moveFixtureTerrainPosition(houndPosition, distance > 0 ? {
        x: houndPosition.x + (desiredX - houndPosition.x) / distance * followStep,
        z: houndPosition.z + (desiredZ - houndPosition.z) / distance * followStep,
      } : houndPosition);
      this.hound.setPosition(follow.position.x * SCALE, follow.position.z * SCALE);
      this.setActorLayer('hound', follow.position.layer ?? 'ground');
    }
    if (!this.combatActive) return;
    this.combat.setSquadPositions(this.spriteTerrainPosition('tabby'), this.spriteTerrainPosition('hound'));
    const events = this.combat.advance(delta / 1000);
    if (events.length) { this.combatEventSequence += events.length; this.combatFeedback = events.map(event => `${event.type}:${event.sourceId}>${event.targetId}`).join(' · '); }
    this.combatCheckpointElapsed += delta;
    const groupJustCleared = this.combat.isGroupCleared() && !this.groupCleared;
    if (groupJustCleared) this.recordGroupClear();
    else if ((events.length > 0 || this.combatCheckpointElapsed >= 500) && !this.progressWriting) this.persistCombatCheckpoint();
    const hostiles = this.combat.hostileStates();
    this.enemies.forEach((enemy, index) => {
      const hostile = hostiles[index];
      if (!hostile) { enemy.setVisible(false); return; }
      enemy.setVisible(true).setPosition(hostile.position.x * SCALE, hostile.position.z * SCALE).setDepth(hostile.position.layer === 'elevated' ? 9 : 7).setAlpha(hostile.health === 0 ? .2 : 1);
    });
    const after = resolveFixtureTakeover(this.combat.actorHealth('tabby'), this.combat.actorHealth('hound'), this.controlledActor === 'hound');
    if (after === 'takeover-required') this.showTakeoverPrompt();
    if (after === 'lost') this.beginRecovery('wipe');
    this.refreshStatus();
  }

  private createControls(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const contains = (control: Phaser.GameObjects.Rectangle | undefined) => {
        const bounds = this.controlBounds(control);
        return !!bounds && pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width && pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
      };
      if (contains(this.swapButton)) { this.swapGun(); return; }
      if (contains(this.interactButton)) { this.interact(); return; }
      if (contains(this.workshopButton)) { this.openWorkshopMenu(); return; }
      this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) this.touchTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY); });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.touchTarget = undefined;
      // Container children keep their own local transforms; route the fixed
      // recovery controls through the shared logical pointer path as well so
      // touch and mouse cannot diverge on narrow cameras.
      const contains = (bounds: FixtureControlBounds | undefined) => !!bounds && pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width && pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
      if (this.takeoverPrompt?.visible && this.takeoverPrompt.getBounds().contains(pointer.x, pointer.y)) this.confirmTakeover();
      else if (this.recoveryMode === 'write-failed' && contains(this.controlBounds(this.recoveryButton))) this.beginRecovery('recovery retry');
      else if (this.recoveryMode === 'recovered' && contains(this.controlBounds(this.retryButton))) this.retryEvent();
    });
    this.swapButton = this.add.rectangle(76, this.scale.height - 48, 124, 58, 0x7393d8, .95).setScrollFactor(0).setDepth(10);
    createUiText(this, 76, this.scale.height - 48, 'SWAP\nQ', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(.5).setScrollFactor(0).setDepth(11);
    this.interactButton = this.add.rectangle(this.scale.width - 76, this.scale.height - 48, 124, 58, 0x24cec7, .95).setScrollFactor(0).setDepth(10);
    createUiText(this, this.scale.width - 76, this.scale.height - 48, 'INTERACT\nE', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(.5).setScrollFactor(0).setDepth(11);
    this.workshopButton = this.add.rectangle(this.scale.width / 2, this.scale.height - 48, 110, 58, 0xf6c85f, .95).setScrollFactor(0).setDepth(10);
    createUiText(this, this.scale.width / 2, this.scale.height - 48, 'WORKSHOP\nB', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#071018' }).setOrigin(.5).setScrollFactor(0).setDepth(11);
    this.takeoverPrompt = createUiText(this, this.scale.width / 2, this.scale.height / 2, '', { fontFamily: 'Nunito, sans-serif', fontSize: '18px', color: '#fff', backgroundColor: '#34151bdd', align: 'center', padding: { x: 12, y: 10 } }).setOrigin(.5).setScrollFactor(0).setDepth(20).setVisible(false).setInteractive().on('pointerup', () => this.confirmTakeover());
    const modal = this.add.container(this.scale.width / 2, this.scale.height / 2).setScrollFactor(0).setDepth(40).setVisible(false);
    const panel = this.add.rectangle(0, 0, Math.min(470, this.scale.width - 24), 260, 0x34151b, .98).setStrokeStyle(2, 0xef6b73);
    this.recoveryHeading = createUiText(this, 0, -88, '', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '20px', color: '#fff' }).setOrigin(.5);
    this.recoveryDetail = createUiText(this, 0, -34, '', { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '14px', color: '#fff', wordWrap: { width: Math.min(420, this.scale.width - 50) } }).setOrigin(.5);
    this.recoveryButton = this.add.rectangle(-92, 70, 150, 54, 0xf6c85f).setInteractive().on('pointerup', () => this.beginRecovery('recovery retry'));
    this.retryButton = this.add.rectangle(92, 70, 150, 54, 0x3ee8a9).setInteractive().on('pointerup', () => this.retryEvent());
    const recoverText = createUiText(this, -92, 70, 'RECOVER\nR', { align: 'center', fontSize: '14px', color: '#071018' }).setOrigin(.5);
    const retryText = createUiText(this, 92, 70, 'RETRY\nENTER', { align: 'center', fontSize: '14px', color: '#071018' }).setOrigin(.5);
    modal.add([panel, this.recoveryHeading, this.recoveryDetail, this.recoveryButton, this.retryButton, recoverText, retryText]);
    this.recoveryModal = modal;
  }

  private installInputs(): void {
    this.input.keyboard?.on('keydown-ONE', () => this.selectJob('MC-OPT-R01-01'));
    this.input.keyboard?.on('keydown-TWO', () => this.selectJob('MC-OPT-F01-01'));
    this.input.keyboard?.on('keydown-E', () => this.interact());
    this.input.keyboard?.on('keydown-Q', () => this.swapGun());
    this.input.keyboard?.on('keydown-T', () => this.confirmTakeover());
    this.input.keyboard?.on('keydown-X', () => this.surrender());
    this.input.keyboard?.on('keydown-R', () => this.beginRecovery('recovery retry'));
    this.input.keyboard?.on('keydown-B', () => this.openWorkshopMenu());
    this.input.keyboard?.on('keydown-F', () => this.openWorkshop('fit-f2-a'));
    this.input.keyboard?.on('keydown-G', () => this.openWorkshop('build-b3'));
    this.input.keyboard?.on('keydown-L', () => this.openWorkshop('claim-h2'));
    this.input.keyboard?.on('keydown-S', () => this.openWorkshop('sell-h2'));
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.recoveryMode === 'recovered') this.retryEvent(); else this.confirmWorkshop(); });
    this.input.keyboard?.on('keydown-ESC', () => this.cancelWorkshop());
  }

  private readEnvelope(): FixturePersistentEnvelope | undefined { try { return deserializeIntegratedFixtureEnvelope(localStorage.getItem(INTEGRATED_FIXTURE_ENVELOPE_KEY)); } catch { return undefined; } }
  private writeEnvelope(envelope: FixturePersistentEnvelope): void {
    if (this.failNextRecoveryWrite && envelope.liveMission?.recoveryRequired) { this.failNextRecoveryWrite = false; throw new Error('forced fixture recovery storage failure'); }
    if (this.failNextStorageWrite) { this.failNextStorageWrite = false; throw new Error('forced fixture storage failure'); }
    localStorage.setItem(INTEGRATED_FIXTURE_ENVELOPE_KEY, serializeIntegratedFixtureEnvelope(envelope));
  }
  private requestWriter(unavailable: string, callback: () => Promise<void>, onUnavailable?: () => void): void {
    const rejected = () => { onUnavailable?.(); this.combatFeedback = 'Fixture writer failed before publishing a change.'; this.refreshStatus(); };
    if (this.rejectNextWriterLock) { this.rejectNextWriterLock = false; void Promise.reject(new Error('forced fixture writer-lock rejection')).catch(rejected); return; }
    const locks = (navigator as unknown as { locks?: FixtureLockManager }).locks;
    if (!locks) { onUnavailable?.(); this.combatFeedback = unavailable; this.refreshStatus(); return; }
    void locks.request(`${INTEGRATED_FIXTURE_SAVE_KEY}:writer`, { mode: 'exclusive' }, callback).catch(rejected);
  }
  private assignEnvelope(envelope: FixturePersistentEnvelope): void { this.envelope = envelope; }
  private activeMission(): FixtureLiveMission | undefined { return this.envelope.liveMission; }

  private restoreLiveMission(live: FixtureLiveMission): void {
    this.replaceLiveMission(live);
    this.combat = new IntegratedFixtureCombat(this.envelope.workshop);
    this.combat.restoreJob(live.jobId, live.finiteEnemyGroupCleared);
    if (live.recoveryRequired) {
      this.recoveryMode = 'recovered';
      this.recoveryFee = live.recoveryFee;
      this.restoreSafeState();
      this.combatFeedback = 'Recovery loaded. Retry uses a fresh attempt for the unfinished event.';
      this.showRecoveryControls();
      return;
    }
    if (live.combatSnapshot && this.combat.restore(live.combatSnapshot, live.jobId, live.finiteEnemyGroupCleared)) this.restoreCombatPresentation(live.combatSnapshot);
    this.combatActive = true;
    this.combatFeedback = 'Reloaded unfinished event with its durable event and attempt identity.';
  }
  private restoreSafeState(): void {
    if (!this.lead || !this.hound) return;
    this.lead.setPosition(SAFE_POSITION.tabby.x, SAFE_POSITION.tabby.y);
    this.hound.setPosition(SAFE_POSITION.hound.x, SAFE_POSITION.hound.y);
    this.setActorLayer('tabby', 'ground');
    this.setActorLayer('hound', 'ground');
    this.controlledActor = 'tabby';
    this.combat.setSquadPositions(this.spriteTerrainPosition('tabby'), this.spriteTerrainPosition('hound'));
    this.touchTarget = undefined;
    this.combatActive = false;
    this.enemies.forEach(enemy => enemy.setVisible(false));
    this.cameras.main.startFollow(this.lead, true, .15, .15);
  }
  private replaceLiveMission(live: FixtureLiveMission): void {
    this.jobId = live.jobId;
    this.activeWorldEventId = live.worldEventId;
    this.activeAttemptId = live.attemptId;
    this.completed = new Set(live.completedInteractionIds);
    this.groupCleared = live.finiteEnemyGroupCleared;
    this.controlledActor = live.combatSnapshot?.controlledActor ?? 'tabby';
    this.operation = new IntegratedFixtureOperation();
    this.operation.restoreActive(live.jobId, live.completedInteractionIds, live.finiteEnemyGroupCleared);
  }
  private captureCombatSnapshot() {
    if (this.lead && this.hound) this.combat.setSquadPositions(this.spriteTerrainPosition('tabby'), this.spriteTerrainPosition('hound'));
    return this.combat.snapshot(this.controlledActor);
  }
  private restoreCombatPresentation(snapshot: NonNullable<FixtureLiveMission['combatSnapshot']>): void {
    if (!this.lead || !this.hound) return;
    const actors = new Map(snapshot.actors.map(actor => [actor.id, actor]));
    const tabby = actors.get('tabby')!;
    const hound = actors.get('hound')!;
    this.lead.setPosition(tabby.position.x * SCALE, tabby.position.z * SCALE);
    this.hound.setPosition(hound.position.x * SCALE, hound.position.z * SCALE);
    this.setActorLayer('tabby', tabby.position.layer ?? 'ground');
    this.setActorLayer('hound', hound.position.layer ?? 'ground');
    this.enemies.forEach((enemy, index) => {
      const hostile = this.combat.hostileStates()[index];
      if (!hostile) { enemy.setVisible(false); return; }
      enemy.setPosition(hostile.position.x * SCALE, hostile.position.z * SCALE).setVisible(hostile.health > 0).setDepth(hostile.position.layer === 'elevated' ? 9 : 7).setAlpha(hostile.health === 0 ? .2 : 1);
    });
    this.cameras.main.startFollow(this.controlledSprite()!, true, .15, .15);
  }
  /** A compact, lock-owned checkpoint is the resume boundary for movement,
   * combat cadence, survivor control, and enemy state—not a free retry. */
  private persistCombatCheckpoint(): void {
    const current = this.activeMission();
    if (!current || current.recoveryRequired || !this.combatActive || this.combatCheckpointWriting) return;
    this.combatCheckpointWriting = true;
    this.combatCheckpointElapsed = 0;
    this.requestWriter('Combat checkpoint writer lock unavailable; the active attempt remains in this scene.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      // Capture only while owning the writer. A queued checkpoint must not
      // publish a pre-takeover control state or race a terminal transaction.
      if (!durable || !live || live.recoveryRequired || this.recoveryMode !== 'none' || this.settlementPending || !this.combatActive || live.attemptId !== current.attemptId || live.checkpointRevision !== current.checkpointRevision) { this.combatCheckpointWriting = false; return; }
      const nextLive: FixtureLiveMission = Object.freeze({ ...live, checkpointRevision: live.checkpointRevision + 1, combatSnapshot: this.captureCombatSnapshot() });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, liveMission: nextLive });
      try { this.writeEnvelope(candidate); }
      catch { this.combatCheckpointWriting = false; this.combatFeedback = 'Combat checkpoint storage failed; this attempt continues and will checkpoint again.'; this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(nextLive); this.combatCheckpointWriting = false;
    }, () => { this.combatCheckpointWriting = false; });
  }

  private selectJob(jobId: FixtureJobId): void {
    if (this.activeMission() || this.recoveryMode !== 'none' || this.activationWriting) { this.combatFeedback = 'Finish or recover the current event before selecting another job.'; this.refreshStatus(); return; }
    this.jobId = jobId; this.operation = new IntegratedFixtureOperation(); this.operation.inspect(jobId); this.completed.clear(); this.groupCleared = false; this.extracted = false; this.combatActive = false;
    this.combat = new IntegratedFixtureCombat(this.envelope.workshop); this.enemies.forEach(enemy => enemy.setVisible(false));
    this.combatFeedback = `${jobId} inspected. Accept it at the offer terminal.`; this.refreshStatus();
  }
  private swapGun(): void {
    if (this.recoveryMode !== 'none' || this.settlementPending) return;
    const swapped = this.combat.swapActiveGun(this.controlledActor);
    this.combatFeedback = swapped ? `${this.actorName()} switched to ${this.combat.activeGun(this.controlledActor).instanceId}; 0.30s swap preparation.` : 'Gun swap unavailable.';
    if (swapped) this.persistCombatCheckpoint();
    this.refreshStatus();
  }
  private confirmTakeover(): void {
    if (!this.lead || !this.hound || this.recoveryMode !== 'none' || resolveFixtureTakeover(this.combat.actorHealth('tabby'), this.combat.actorHealth('hound'), false) !== 'takeover-required') return;
    this.controlledActor = 'hound'; this.cameras.main.startFollow(this.hound, true, .15, .15); this.takeoverPrompt?.setVisible(false);
    this.combatFeedback = 'Hound has taken control. Hound now drives movement, interaction, service access, and gun swaps.'; this.persistCombatCheckpoint(); this.refreshStatus();
  }
  private showTakeoverPrompt(): void { this.takeoverPrompt?.setText('Tabby is down.\nContinue as Hound?\nT / TAP TAKE OVER').setVisible(true); this.refreshStatus(); }
  private controlledSprite(): Phaser.GameObjects.Arc | undefined { return this.controlledActor === 'tabby' ? this.lead : this.hound; }
  private actorSprite(actor: 'tabby' | 'hound'): Phaser.GameObjects.Arc | undefined { return actor === 'tabby' ? this.lead : this.hound; }
  private actorLayer(actor: 'tabby' | 'hound'): FixtureLayer { return actor === 'tabby' ? this.tabbyLayer : this.houndLayer; }
  private spriteTerrainPosition(actor: 'tabby' | 'hound') {
    const sprite = this.actorSprite(actor);
    return { x: (sprite?.x ?? 0) / SCALE, z: (sprite?.y ?? 0) / SCALE, layer: this.actorLayer(actor) };
  }
  private setActorLayer(actor: 'tabby' | 'hound', layer: FixtureLayer): void {
    if (actor === 'tabby') this.tabbyLayer = layer;
    else this.houndLayer = layer;
    this.actorSprite(actor)?.setDepth(layer === 'elevated' ? 9 : 6);
  }
  private atService(): boolean { const actor = this.controlledSprite(); return this.actorLayer(this.controlledActor) === 'ground' && !!actor && Math.hypot(actor.x - 80, actor.y - 80) < 55; }
  private actorName(): string { return this.controlledActor === 'tabby' ? 'Tabby' : 'Hound'; }

  private interact(): void {
    if (this.recoveryMode !== 'none' || this.activationWriting || this.progressWriting || this.settlementPending) { this.combatFeedback = 'Recovery or settlement is still pending; controls are locked until it finishes.'; this.refreshStatus(); return; }
    const actor = this.controlledSprite();
    if (!actor || this.combat.actorHealth(this.controlledActor) <= 0) return;
    const nearby = INTEGRATED_FIXTURE_POINTS.find(point => fixturePointLayer(point) === this.actorLayer(this.controlledActor)
      && Math.hypot(point.x * SCALE - actor.x, point.z * SCALE - actor.y) < 38);
    if (nearby?.role === 'discovery' && nearby.id === 'INT-FB-PUBLIC-SPUR') { this.recordLootDiscovery(); return; }
    if (!this.jobId) {
      if (nearby?.role === 'offer-terminal') this.selectJob(actor.x < 250 ? 'MC-OPT-R01-01' : 'MC-OPT-F01-01');
      else this.combatFeedback = 'Move to the safe offer terminal before inspecting a contract.';
      this.refreshStatus();
      return;
    }
    const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)!;
    if (!nearby) return;
    if (nearby.role === 'offer-terminal') this.combatFeedback = this.operation.accept() ? `${fixtureDialogue(job.id, 'accepted')} Reach its entry to activate.` : 'Inspect a job before accepting it.';
    else if (nearby.role === 'interaction') this.recordInteraction(nearby.id);
    else if (nearby.role === 'spawn') {
      if (this.operation.snapshot().phase === 'accepted') this.activateJob(job.id);
      else this.combatFeedback = 'Contract must be accepted at the offer terminal before activation.';
    } else if (nearby.id === job.extractionPointId) {
      if (this.operation.canExtract()) this.settleAtExtraction(job.id);
      else this.combatFeedback = 'Extraction remains locked: finish the displayed event objectives.';
    }
    this.refreshStatus();
  }

  /** Allocates and writes the event/attempt before combat begins. */
  private activateJob(jobId: FixtureJobId): void {
    if (this.activationWriting || this.activeMission()) return;
    this.activationWriting = true; this.combatFeedback = 'Recording world event and attempt before hostiles activate…'; this.refreshStatus();
    this.requestWriter('Activation writer lock unavailable; hostiles were not started.', async () => {
      const durable = this.readEnvelope();
      if (!durable) { this.activationWriting = false; this.combatFeedback = 'Activation storage could not be read; hostiles were not started.'; this.refreshStatus(); return; }
      if (durable.liveMission) { this.activationWriting = false; this.assignEnvelope(durable); this.combatFeedback = 'Another tab already has an unfinished event; reload it before starting a new one.'; this.refreshStatus(); return; }
      const worldEventId = nextFixtureWorldEventId(durable.workshop, jobId);
      const attemptId = nextFixtureAttemptId(durable.workshop, worldEventId);
      const begun = beginFixtureProfileAttempt(durable.workshop, worldEventId, attemptId);
      if (!begun.applied) { this.activationWriting = false; this.combatFeedback = 'Activation was rejected before combat started.'; this.refreshStatus(); return; }
      const nextCombat = new IntegratedFixtureCombat(begun.profile);
      nextCombat.beginJob(jobId);
      if (this.lead && this.hound) nextCombat.setSquadPositions(this.spriteTerrainPosition('tabby'), this.spriteTerrainPosition('hound'));
      const liveMission: FixtureLiveMission = Object.freeze({ jobId, worldEventId, attemptId, completedInteractionIds: Object.freeze([]), finiteEnemyGroupCleared: false, recoveryRequired: false, checkpointRevision: 0, combatSnapshot: nextCombat.snapshot(this.controlledActor) });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, workshop: begun.profile, liveMission });
      try { this.writeEnvelope(candidate); }
      catch { this.activationWriting = false; this.combatFeedback = 'Activation storage failed; no event or attempt was created.'; this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(liveMission); this.combat = nextCombat; this.combatActive = true; this.activationWriting = false; this.combatCheckpointElapsed = 0;
      this.combatFeedback = `Event ${worldEventId} saved. Hostiles activated; auto-fire uses each mercenary position and ballistic LOS.`; this.refreshStatus();
    }, () => { this.activationWriting = false; });
  }
  private recordInteraction(pointId: string): void {
    const current = this.activeMission();
    if (!current || this.progressWriting || !this.activeAttemptId || current.attemptId !== this.activeAttemptId) return;
    this.progressWriting = true;
    this.requestWriter('Objective writer lock unavailable; interaction was not recorded.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      if (!durable || !live || live.attemptId !== current.attemptId || live.recoveryRequired) { this.progressWriting = false; this.combatFeedback = 'Objective changed before it could be recorded.'; this.refreshStatus(); return; }
      const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === live.jobId)!;
      if (!job.requiredInteractionIds.includes(pointId)) { this.progressWriting = false; return; }
      const nextLive: FixtureLiveMission = Object.freeze({ ...live, completedInteractionIds: Object.freeze([...new Set([...live.completedInteractionIds, pointId])]), combatSnapshot: this.captureCombatSnapshot() });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, liveMission: nextLive });
      try { this.writeEnvelope(candidate); }
      catch { this.progressWriting = false; this.combatFeedback = 'Objective storage failed; it remains available to record again.'; this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(nextLive); this.progressWriting = false; this.combatFeedback = `Objective recorded: ${pointId.replace('INT-FB-', '')}.`; this.refreshStatus();
    }, () => { this.progressWriting = false; });
  }
  private recordGroupClear(): void {
    const current = this.activeMission();
    if (!current || this.progressWriting || current.finiteEnemyGroupCleared) return;
    this.progressWriting = true;
    this.requestWriter('Objective writer lock unavailable; exit group remains unconfirmed.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      if (!durable || !live || live.attemptId !== current.attemptId || live.recoveryRequired) { this.progressWriting = false; return; }
      const nextLive: FixtureLiveMission = Object.freeze({ ...live, finiteEnemyGroupCleared: true, combatSnapshot: this.captureCombatSnapshot() });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, liveMission: nextLive });
      try { this.writeEnvelope(candidate); }
      catch { this.progressWriting = false; this.combatFeedback = 'Exit group storage failed; retrying its confirmation is safe.'; this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(nextLive); this.progressWriting = false; this.combatFeedback = 'Finite exit group cleared and saved.'; this.refreshStatus();
    }, () => { this.progressWriting = false; });
  }

  private surrender(): void { if (this.activeMission() && this.combatActive && !this.settlementPending && this.recoveryMode === 'none') this.beginRecovery('surrender'); }
  /** Wipe and surrender both reach this single profile recovery claim. */
  private beginRecovery(reason: 'wipe' | 'surrender' | 'recovery retry'): void {
    const current = this.activeMission();
    if (!current || this.recoveryMode === 'writing' || this.recoveryMode === 'recovered' || this.settlementPending) return;
    this.recoveryMode = 'writing'; this.takeoverPrompt?.setVisible(false); this.showRecoveryControls(); this.combatFeedback = `${reason === 'surrender' ? 'Surrender' : 'Squad wipe'} is recording one recovery claim…`; this.refreshStatus();
    this.requestWriter('Recovery writer lock unavailable; no fee was taken.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      if (!durable || !live || live.attemptId !== current.attemptId || live.recoveryRequired) { this.recoveryMode = 'write-failed'; this.combatFeedback = 'Recovery state changed before it could be saved; no fee was taken here.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      const failure = failFixtureProfileAttempt(durable.workshop, live.attemptId);
      if (!failure.applied) { this.recoveryMode = 'write-failed'; this.combatFeedback = 'Recovery claim was already resolved or rejected; no additional fee was taken.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      const nextLive: FixtureLiveMission = Object.freeze({ ...live, recoveryRequired: true, recoveryFee: failure.fee });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, workshop: failure.profile, liveMission: nextLive });
      try { this.writeEnvelope(candidate); }
      catch { this.recoveryMode = 'write-failed'; this.combatFeedback = 'Recovery storage failed; no fee, gear, material, or mission state was changed.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(nextLive); this.recoveryFee = failure.fee; this.recoveryMode = 'recovered'; this.combat = new IntegratedFixtureCombat(candidate.workshop); this.restoreSafeState();
      this.combatFeedback = `Recovery saved: ${failure.fee} credits. Gear and materials were preserved; retry is ready.`; this.showRecoveryControls(); this.refreshStatus();
    }, () => { this.recoveryMode = 'write-failed'; this.showRecoveryControls(); });
  }
  private retryEvent(): void {
    const current = this.activeMission();
    if (!current || !current.recoveryRequired || this.recoveryMode !== 'recovered') return;
    this.recoveryMode = 'writing'; this.showRecoveryControls();
    this.requestWriter('Retry writer lock unavailable; the recovered event remains safe.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      if (!durable || !live || !live.recoveryRequired || live.attemptId !== current.attemptId) { this.recoveryMode = 'write-failed'; this.combatFeedback = 'Retry state changed before it could be saved.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      const attemptId = nextFixtureAttemptId(durable.workshop, live.worldEventId);
      const retry = retryFixtureProfileAttempt(durable.workshop, live.worldEventId, attemptId);
      if (!retry.applied) { this.recoveryMode = 'recovered'; this.combatFeedback = 'Retry was rejected; the existing recovery remains ready to retry.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      const nextCombat = new IntegratedFixtureCombat(retry.profile);
      nextCombat.beginJob(live.jobId);
      nextCombat.setSquadPositions({ x: SAFE_POSITION.tabby.x / SCALE, z: SAFE_POSITION.tabby.y / SCALE, layer: 'ground' }, { x: SAFE_POSITION.hound.x / SCALE, z: SAFE_POSITION.hound.y / SCALE, layer: 'ground' });
      const nextLive: FixtureLiveMission = Object.freeze({ jobId: live.jobId, worldEventId: live.worldEventId, attemptId, completedInteractionIds: Object.freeze([]), finiteEnemyGroupCleared: false, recoveryRequired: false, checkpointRevision: 0, combatSnapshot: nextCombat.snapshot('tabby') });
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, workshop: retry.profile, liveMission: nextLive });
      try { this.writeEnvelope(candidate); }
      catch { this.recoveryMode = 'recovered'; this.combatFeedback = 'Retry storage failed; the prior recovery remains ready and no new attempt was started.'; this.showRecoveryControls(); this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.replaceLiveMission(nextLive); this.combat = nextCombat; this.restoreSafeState(); this.combatActive = true; this.recoveryMode = 'none'; this.recoveryModal?.setVisible(false); this.combatCheckpointElapsed = 0;
      this.combatFeedback = `Retry ${attemptId} saved for unfinished event ${nextLive.worldEventId}.`; this.refreshStatus();
    }, () => { this.recoveryMode = 'recovered'; this.showRecoveryControls(); });
  }
  private showRecoveryControls(): void {
    if (!this.recoveryModal || !this.recoveryHeading || !this.recoveryDetail || !this.recoveryButton || !this.retryButton) return;
    this.recoveryModal.setVisible(this.recoveryMode !== 'none');
    const retryReady = this.recoveryMode === 'recovered'; this.recoveryButton.setAlpha(this.recoveryMode === 'write-failed' ? 1 : .45); this.retryButton.setAlpha(retryReady ? 1 : .45);
    if (this.recoveryMode === 'writing') { this.recoveryHeading.setText('SQUAD DOWN — RECOVERY SAVING'); this.recoveryDetail.setText('Movement and interaction are locked. The recovery fee is written atomically with your wallet; gear and materials stay intact.'); }
    else if (this.recoveryMode === 'write-failed') { this.recoveryHeading.setText('RECOVERY WRITE FAILED'); this.recoveryDetail.setText('No fee was taken. Tap RECOVER or press R to retry the same failed attempt.'); }
    else { this.recoveryHeading.setText('RECOVERY COMPLETE — SAFE SERVICE'); this.recoveryDetail.setText(this.recoveryFee === undefined
      ? 'This legacy recovery is ready. Its old envelope did not retain the fee amount; gear and materials are preserved. Tap RETRY or press Enter for a fresh attempt on the unfinished event.'
      : `Fee ${this.recoveryFee} credits. Gear and materials preserved. Tap RETRY or press Enter for a fresh attempt on the unfinished event.`); }
  }

  private settleAtExtraction(jobId: FixtureJobId): void {
    const current = this.activeMission();
    if (!current || this.settlementPending || current.recoveryRequired) return;
    this.settlementPending = true; this.combatFeedback = 'Committing event-aware extraction before publishing victory…'; this.refreshStatus();
    this.requestWriter('Settlement writer lock unavailable; extraction remains active.', async () => {
      const durable = this.readEnvelope(); const live = durable?.liveMission;
      if (!durable || !live || live.attemptId !== current.attemptId || live.recoveryRequired || !operationCanSettle({ jobId: live.jobId, completedInteractionIds: live.completedInteractionIds, finiteEnemyGroupCleared: live.finiteEnemyGroupCleared, extractionConfirmed: true })) {
        this.settlementPending = false; this.combatFeedback = 'Extraction changed before it could be committed; it remains active.'; this.refreshStatus(); return;
      }
      const receipt = settleIntegratedFixtureEvent(durable.mission, jobId, live.worldEventId, live.attemptId);
      if (!receipt.applied) { this.settlementPending = false; this.combatFeedback = 'This world event was already delivered; no cargo can reappear.'; this.refreshStatus(); return; }
      const settlement = settleFixtureProfileAttempt(durable.workshop, live.attemptId);
      if (!settlement.applied) { this.settlementPending = false; this.combatFeedback = durable.workshop.paidEventIds.includes(live.worldEventId) ? 'This world event was already delivered; no cargo can reappear.' : 'Settlement was rejected; extraction remains active.'; this.refreshStatus(); return; }
      const candidate: FixturePersistentEnvelope = Object.freeze({ ...durable, mission: receipt.save, workshop: settlement.profile, liveMission: undefined });
      try { this.writeEnvelope(candidate); }
      catch { this.settlementPending = false; this.combatFeedback = 'Settlement storage failed; extraction remains active for a safe retry.'; this.refreshStatus(); return; }
      this.assignEnvelope(candidate); this.extracted = this.operation.extract(); this.combatActive = false; this.activeWorldEventId = undefined; this.activeAttemptId = undefined; this.settlementPending = false;
      this.combatFeedback = `${fixtureDialogue(jobId, 'result')} Event delivery and wallet reward saved.`; this.refreshStatus();
    }, () => { this.settlementPending = false; });
  }

  private recordLootDiscovery(): void {
    this.requestWriter('Discovery writer lock unavailable; loot remains undiscovered.', async () => {
      const durable = this.readEnvelope();
      if (!durable) { this.combatFeedback = 'Discovery storage could not be read.'; this.refreshStatus(); return; }
      const profile = durable.workshop;
      const result = commitAndPersistFixtureWorkshop(profile, { profileId: profile.profileId, commandId: `world:discover-h2:${profile.revision}`, expectedRevision: profile.revision, action: 'discover-h2' }, candidate => this.writeEnvelope(Object.freeze({ ...durable, workshop: candidate })));
      if (result.applied) { this.assignEnvelope(Object.freeze({ ...durable, workshop: result.profile })); this.combatFeedback = 'HOU-H2 integration loot discovered. Claim is now available at safe service.'; }
      else this.combatFeedback = result.reason === 'already-discovered' ? 'HOU-H2 discovery already recorded.' : `Discovery rejected: ${result.reason ?? 'invalid'}.`;
      this.refreshStatus();
    });
  }

  private openWorkshopMenu(): void {
    if (this.recoveryMode !== 'none') return;
    if (!this.atService()) { this.combatFeedback = `Workshop unavailable: move ${this.actorName()} to safe service.`; this.refreshStatus(); return; }
    this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy();
    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2).setScrollFactor(0).setDepth(30);
    const actions: readonly [FixtureWorkshopAction, string][] = [['buy-f2', 'BUY F2'], ['fit-f2-a', 'FIT F2'], ['claim-h2', 'CLAIM H2'], ['sell-h2', 'SELL H2'], ['build-b3', 'BUILD B3'], ['fit-b3-a', 'FIT B3'], ['develop-b2', 'DEVELOP B2']];
    panel.add(this.add.rectangle(0, 0, Math.min(460, this.scale.width - 20), 330, 0x0b1118, .98).setStrokeStyle(2, 0xf6c85f));
    panel.add(createUiText(this, 0, -135, `SAFE SERVICE WORKSHOP\nCredits ${this.envelope.workshop.wallet.credits} · Metal ${this.envelope.workshop.wallet.metal} · Circuits ${this.envelope.workshop.wallet.circuits}`, { align: 'center', fontSize: '14px', color: '#fff' }).setOrigin(.5));
    actions.forEach(([action, label], index) => { const x = index % 2 ? 90 : -90; const y = -65 + Math.floor(index / 2) * 58; const button = this.add.rectangle(x, y, 155, 42, 0x7393d8).setInteractive(); const text = createUiText(this, x, y, label, { fontSize: '13px', color: '#071018' }).setOrigin(.5); button.on('pointerup', () => this.openWorkshop(action)); panel.add([button, text]); });
    const close = createUiText(this, 0, 135, 'CLOSE / ESC', { fontSize: '13px', color: '#fff' }).setOrigin(.5).setInteractive(); close.on('pointerup', () => this.cancelWorkshop()); panel.add(close); this.workshopModal = panel;
  }
  private openWorkshop(action: FixtureWorkshopAction): void {
    if (!this.atService() || this.recoveryMode !== 'none') { this.combatFeedback = `Workshop unavailable: move ${this.actorName()} to safe service.`; this.refreshStatus(); return; }
    this.workshopPreview = action; this.workshopPreviewRevision = this.envelope.workshop.revision; this.workshopModal?.destroy();
    const labels: Record<FixtureWorkshopAction, string> = { 'discover-h2': 'Record HOU-H2 discovery', 'buy-f2': 'Buy TAB-F2 — 1650 Credits', 'fit-f2-a': 'Fit owned TAB-F2 to TAB-A — free', 'claim-h2': 'Claim discovered HOU-H2 — free', 'sell-h2': 'Sell unassigned HOU-H2 — +540 Credits', 'build-b3': 'Build TAB-B3 T1 — 1000 Credits / 40 Metal / 8 Circuits', 'fit-b3-a': 'Fit owned TAB-B3 to TAB-A — free', 'develop-b2': 'Develop gift TAB-B2 T1 → T2 — 500 Credits / 20 Metal / 4 Circuits' };
    const panel = this.add.container(this.scale.width / 2, this.scale.height / 2).setScrollFactor(0).setDepth(30);
    const background = this.add.rectangle(0, 0, Math.min(500, this.scale.width - 20), 220, 0x0b1118, .98).setStrokeStyle(2, 0x24cec7);
    const text = createUiText(this, 0, -58, `WORKSHOP PREVIEW\n${labels[action]}\nNo wallet, item, claim, or assignment changes until confirmed.`, { align: 'center', fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#fff', wordWrap: { width: Math.min(450, this.scale.width - 50) } }).setOrigin(.5);
    const confirm = this.add.rectangle(-85, 65, 140, 45, 0x3ee8a9).setInteractive(); const cancel = this.add.rectangle(85, 65, 140, 45, 0xef6b73).setInteractive();
    const yes = createUiText(this, -85, 65, 'CONFIRM\nENTER', { align: 'center', fontSize: '13px', color: '#071018' }).setOrigin(.5); const no = createUiText(this, 85, 65, 'CANCEL\nESC', { align: 'center', fontSize: '13px', color: '#071018' }).setOrigin(.5);
    confirm.on('pointerup', () => this.confirmWorkshop()); cancel.on('pointerup', () => this.cancelWorkshop()); panel.add([background, text, confirm, cancel, yes, no]); this.workshopModal = panel;
    this.combatFeedback = `Preview ready: ${labels[action]}`; this.refreshStatus();
  }
  private cancelWorkshop(): void { if (!this.workshopPreview && !this.workshopModal) return; this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy(); this.workshopModal = undefined; this.combatFeedback = 'Workshop preview cancelled; nothing changed.'; this.refreshStatus(); }
  private confirmWorkshop(): void {
    const action = this.workshopPreview;
    if (!action || this.recoveryMode !== 'none') return;
    this.requestWriter('Workshop writer lock unavailable; nothing changed.', async () => {
      const durable = this.readEnvelope();
      if (!durable) { this.cancelWorkshop(); this.combatFeedback = 'Workshop storage could not be read; nothing changed.'; this.refreshStatus(); return; }
      if (!this.atService()) { this.cancelWorkshop(); this.combatFeedback = `Workshop confirmation rejected: ${this.actorName()} must be at safe service.`; this.refreshStatus(); return; }
      if (this.workshopPreviewRevision !== durable.workshop.revision) { this.assignEnvelope(durable); this.cancelWorkshop(); this.combatFeedback = 'Workshop changed in another tab; review the refreshed profile before confirming.'; this.refreshStatus(); return; }
      const commandId = `ui:${action}:${durable.workshop.revision}`; const fitKind = action === 'fit-f2-a' ? 'F2' : action === 'fit-b3-a' ? 'B3' : undefined; const fitCandidates = fitKind ? durable.workshop.parts.filter(part => part.kind === fitKind) : []; const partInstanceId = fitCandidates.length === 1 ? fitCandidates[0].instanceId : undefined;
      const result = commitAndPersistFixtureWorkshop(durable.workshop, { profileId: durable.workshop.profileId, commandId, expectedRevision: durable.workshop.revision, action, partInstanceId }, candidate => this.writeEnvelope(Object.freeze({ ...durable, workshop: candidate })));
      if (!result.applied) { this.cancelWorkshop(); this.combatFeedback = result.reason === 'storage-failed' ? 'Workshop storage failed; no debit, item, or assignment was applied.' : `Workshop rejected: ${result.reason ?? 'invalid'}.`; this.refreshStatus(); return; }
      this.assignEnvelope(Object.freeze({ ...durable, workshop: result.profile })); this.workshopPreview = undefined; this.workshopPreviewRevision = undefined; this.workshopModal?.destroy(); this.workshopModal = undefined; this.combatFeedback = `Workshop saved: ${action.replaceAll('-', ' ')} (receipt ${result.receipt!.commandId}).`; this.refreshStatus();
    });
  }

  private forceSquadDefeat(): boolean {
    if (!this.combatActive || !this.activeMission()) return false;
    this.combat.setFixtureSquadHealth('tabby', 0);
    this.combat.setFixtureSquadHealth('hound', 0);
    // Queue the ordinary wipe path now. This test seam deliberately does not
    // wait for another frame, otherwise an unrelated combat checkpoint could
    // consume a deliberately injected recovery-write failure first.
    this.beginRecovery('wipe');
    return true;
  }
  private forceTabbyDown(): boolean { if (!this.combatActive || !this.activeMission()) return false; this.combat.setFixtureSquadHealth('tabby', 0); return true; }
  /** Browser seam: preserves actual hostiles long enough to make a durable
   * partial-combat reload observable without changing normal combat rules. */
  private prolongCombat(): boolean {
    const mission = this.activeMission();
    if (!this.combatActive || !mission) return false;
    const prefix = mission.jobId === 'MC-OPT-R01-01' ? 'r01' : 'f01';
    this.combat.setFixtureHostileHealth(`${prefix}-a` as 'r01-a' | 'f01-a', 10_000);
    this.combat.setFixtureHostileHealth(`${prefix}-b` as 'r01-b' | 'f01-b', 10_000);
    this.persistCombatCheckpoint();
    return true;
  }
  /** Browser seam: it still uses the ordinary durable activation transaction. */
  private prepareF01(): boolean {
    if (this.activeMission() || this.activationWriting || this.recoveryMode !== 'none') return false;
    this.selectJob('MC-OPT-F01-01');
    if (!this.operation.accept()) return false;
    this.activateJob('MC-OPT-F01-01');
    return true;
  }
  private controlBounds(control: Phaser.GameObjects.Rectangle | undefined): FixtureControlBounds | undefined {
    if (!control) return undefined;
    if (control.parentContainer === this.recoveryModal) return Object.freeze({ x: this.recoveryModal.x + control.x - control.displayWidth / 2, y: this.recoveryModal.y + control.y - control.displayHeight / 2, width: control.displayWidth, height: control.displayHeight });
    const bounds = control.getBounds();
    return Object.freeze({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  }
  private refreshStatus(): void {
    const job = this.jobId ? INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)! : undefined;
    const hostiles = this.combat.hostileStates().filter(hostile => hostile.health > 0).length; const tabbyGun = this.combat.activeGun('tabby'); const phase = this.operation.snapshot().phase; const mission = this.activeMission(); const eventLine = mission ? `\nEvent ${mission.worldEventId} · Attempt ${mission.attemptId}` : '';
    this.status?.setText(job ? `INT-FB ${job.id} · ${phase}${eventLine}\n${this.extracted ? 'COMPLETE — event receipt saved' : `Objectives ${this.completed.size}/${job.requiredInteractionIds.length}${job.requiresFiniteGroupClear ? ` · exit group ${this.groupCleared ? 'clear' : this.combatActive ? `${hostiles} hostile(s)` : 'activate at spawn'}` : ' · extraction allowed'}\nTAB ${this.combat.actorHealth('tabby').toFixed(0)} HP · ${tabbyGun.instanceId.split(':').at(-1)} ${tabbyGun.supply} · HOU ${this.combat.actorHealth('hound').toFixed(0)} HP\n${this.combatFeedback}\nMove to offer/markers/spawn/extraction; tap INTERACT or E; swap ${this.actorName()} gun with Q; surrender X`}` : `INT-FB proving ground\n${this.envelope.mission.receipts.length} isolated event receipt(s) loaded. Choose R01 (1 / left side) or F01 (2 / right side).\nWASD/arrows or touch-hold to move.`);
  }
  public diagnostics(): Readonly<{ scene: string; x: number; y: number; controlledActor: 'tabby' | 'hound'; layer: FixtureLayer; tabbyLayer: FixtureLayer; houndLayer: FixtureLayer; combatEventSequence: number; cameraX: number; cameraY: number; controlledGun: string; jobId?: FixtureJobId; phase: string; completedInteractionIds: readonly string[]; canExtract: boolean; extracted: boolean; combatActive: boolean; groupCleared: boolean; tabbyHealth: number; houndHealth: number; tabbyGun: string; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: Readonly<{ x: number; y: number }>; houndPosition: Readonly<{ x: number; y: number }>; hostiles: number; checkpoint?: Readonly<{ revision: number; controlledActor: 'tabby' | 'hound'; tabbyHealth: number; houndHealth: number; tabbyGunSupply: number; houndGunSupply: number; tabbyPosition: Readonly<{ x: number; y: number }>; houndPosition: Readonly<{ x: number; y: number }>; hostileHealths: readonly number[] }>; workshopRevision: number; workshopCredits: number; workshopParts: number; workshopMaterials: Readonly<{ metal: number; circuits: number; cloth: number }>; workshopPreview?: FixtureWorkshopAction; workshopOpen: boolean; worldEventId?: FixtureWorldEventId; activeAttemptId?: FixtureAttemptId; attemptTerminal?: string; recoveryMode: RecoveryMode; recoveryFee?: number; receiptIds: readonly string[]; paidEventIds: readonly FixtureWorldEventId[]; takeoverControl?: FixtureControlBounds; recoveryControl?: FixtureControlBounds; retryControl?: FixtureControlBounds }> {
    const attempt = this.activeAttemptId ? this.envelope.workshop.attempts.find(candidate => candidate.attemptId === this.activeAttemptId) : undefined;
    const takeoverBounds = this.takeoverPrompt?.getBounds();
    const mission = this.activeMission();
    const snapshot = mission?.combatSnapshot;
    const snapshotActor = (id: 'tabby' | 'hound') => snapshot?.actors.find(actor => actor.id === id);
    const tabby = snapshotActor('tabby');
    const hound = snapshotActor('hound');
    const checkpoint = snapshot && tabby && hound ? Object.freeze({
      revision: mission!.checkpointRevision,
      controlledActor: snapshot.controlledActor,
      tabbyHealth: tabby.health,
      houndHealth: hound.health,
      tabbyGunSupply: tabby.weapons[tabby.activeGunIndex]!.supply,
      houndGunSupply: hound.weapons[hound.activeGunIndex]!.supply,
      tabbyPosition: Object.freeze({ x: tabby.position.x * SCALE, y: tabby.position.z * SCALE }),
      houndPosition: Object.freeze({ x: hound.position.x * SCALE, y: hound.position.z * SCALE }),
      hostileHealths: Object.freeze(snapshot.actors.filter(actor => actor.id !== 'tabby' && actor.id !== 'hound').map(actor => actor.health)),
    }) : undefined;
    return Object.freeze({ scene: this.scene.key, x: this.controlledSprite()?.x ?? 0, y: this.controlledSprite()?.y ?? 0, controlledActor: this.controlledActor, layer: this.actorLayer(this.controlledActor), tabbyLayer: this.tabbyLayer, houndLayer: this.houndLayer, combatEventSequence: this.combatEventSequence, cameraX: this.cameras.main.scrollX, cameraY: this.cameras.main.scrollY, controlledGun: this.combat.activeGun(this.controlledActor).instanceId, jobId: this.jobId, completedInteractionIds: Object.freeze([...this.completed]), canExtract: this.operation.canExtract(), extracted: this.extracted, phase: this.operation.snapshot().phase, combatActive: this.combatActive, groupCleared: this.groupCleared, tabbyHealth: this.combat.actorHealth('tabby'), houndHealth: this.combat.actorHealth('hound'), tabbyGun: this.combat.activeGun('tabby').instanceId, tabbyGunSupply: this.combat.activeGun('tabby').supply, houndGunSupply: this.combat.activeGun('hound').supply, tabbyPosition: Object.freeze({ x: this.lead?.x ?? 0, y: this.lead?.y ?? 0 }), houndPosition: Object.freeze({ x: this.hound?.x ?? 0, y: this.hound?.y ?? 0 }), hostiles: this.combat.hostileStates().filter(hostile => hostile.health > 0).length, checkpoint, workshopRevision: this.envelope.workshop.revision, workshopCredits: this.envelope.workshop.wallet.credits, workshopParts: this.envelope.workshop.parts.length, workshopMaterials: Object.freeze({ metal: this.envelope.workshop.wallet.metal, circuits: this.envelope.workshop.wallet.circuits, cloth: this.envelope.workshop.wallet.cloth }), workshopPreview: this.workshopPreview, workshopOpen: !!this.workshopModal, worldEventId: this.activeWorldEventId, activeAttemptId: this.activeAttemptId, attemptTerminal: attempt?.terminal, recoveryMode: this.recoveryMode, recoveryFee: this.recoveryFee, receiptIds: Object.freeze(this.envelope.mission.receipts.map(receipt => receipt.id)), paidEventIds: this.envelope.workshop.paidEventIds, takeoverControl: takeoverBounds && this.takeoverPrompt?.visible ? Object.freeze({ x: takeoverBounds.x, y: takeoverBounds.y, width: takeoverBounds.width, height: takeoverBounds.height }) : undefined, recoveryControl: this.controlBounds(this.recoveryButton), retryControl: this.controlBounds(this.retryButton) });
  }
}
