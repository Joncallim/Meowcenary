import { deepFreeze } from '../engine/freeze';

/**
 * Pinned, test-only INT-FB source data. This is deliberately not a production
 * map or campaign catalog: it lets Phaser adapters prove one connected loop
 * without changing legacy saves, campaign topology, or balance tables.
 */
export const INTEGRATED_FIXTURE_VERSION = 'int-fb-v1';
export const INTEGRATED_FIXTURE_ENVELOPE = Object.freeze({ widthMetres: 80, heightMetres: 64 });
export const INTEGRATED_FIXTURE_BODY_DIAMETER_METRES = 0.8;
export const INTEGRATED_FIXTURE_REQUIRED_PATH_WIDTH_METRES = 3;

/** Solid fixture volumes.  They are deliberately separate from walkable
 * surfaces: a route around a crate never implies a legal ballistic shot. */
export interface FixtureOccluder {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Raised deck traffic is above the small ground cover in this proving ground. */
  readonly layer?: FixtureLayer;
}

export const INTEGRATED_FIXTURE_OCCLUDERS: readonly FixtureOccluder[] = deepFreeze([
  { id: 'INT-FB-R01-CRATE-WALL', x: 31, z: 37, width: 1.5, depth: 8 },
  { id: 'INT-FB-F01-LOT-SHED', x: 60, z: 42, width: 3, depth: 2 },
]);

export type FixtureJobId = 'MC-OPT-R01-01' | 'MC-OPT-F01-01';
export type FixtureSurfaceKind = 'safe' | 'road' | 'ramp' | 'bridge' | 'underpass' | 'tunnel' | 'pocket';
export type FixtureLayer = 'ground' | 'elevated';

export interface FixtureSurface {
  readonly id: string;
  readonly kind: FixtureSurfaceKind;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly elevation: number;
}

export interface FixturePoint {
  readonly id: string;
  readonly surfaceId: string;
  readonly x: number;
  readonly z: number;
  readonly role: 'service' | 'offer-terminal' | 'interaction' | 'extraction' | 'spawn' | 'discovery';
}

export interface FixtureJob {
  readonly id: FixtureJobId;
  readonly pocketSurfaceId: string;
  readonly finiteEnemyGroupId: string;
  readonly requiredInteractionIds: readonly string[];
  readonly extractionPointId: string;
  /** F01 intentionally has no total-clear requirement. */
  readonly requiresFiniteGroupClear: boolean;
}

export const INTEGRATED_FIXTURE_SURFACES: readonly FixtureSurface[] = deepFreeze([
  { id: 'INT-FB-SAFE-01', kind: 'safe', x: 2, z: 2, width: 16, depth: 14, elevation: 0 },
  { id: 'INT-FB-ROAD-01', kind: 'road', x: 18, z: 5, width: 26, depth: 5, elevation: 0 },
  { id: 'INT-FB-RAMP-01', kind: 'ramp', x: 38, z: 10, width: 4, depth: 12, elevation: 0 },
  { id: 'INT-FB-BRIDGE-01', kind: 'bridge', x: 42, z: 20, width: 20, depth: 4, elevation: 3 },
  { id: 'INT-FB-UNDERPASS-01', kind: 'underpass', x: 38, z: 20, width: 24, depth: 4, elevation: 0 },
  { id: 'INT-FB-TUNNEL-01', kind: 'tunnel', x: 62, z: 20, width: 14, depth: 6, elevation: 0 },
  { id: 'INT-FB-R01-POCKET', kind: 'pocket', x: 18, z: 10, width: 20, depth: 42, elevation: 0 },
  { id: 'INT-FB-F01-POCKET', kind: 'pocket', x: 48, z: 26, width: 24, depth: 28, elevation: 0 },
]);

export const INTEGRATED_FIXTURE_POINTS: readonly FixturePoint[] = deepFreeze([
  { id: 'INT-FB-SERVICE-01', surfaceId: 'INT-FB-SAFE-01', x: 8, z: 8, role: 'service' },
  { id: 'INT-FB-OFFER-01', surfaceId: 'INT-FB-SAFE-01', x: 13, z: 8, role: 'offer-terminal' },
  { id: 'INT-FB-R01-MARKER-A', surfaceId: 'INT-FB-R01-POCKET', x: 23, z: 39, role: 'interaction' },
  { id: 'INT-FB-R01-MARKER-B', surfaceId: 'INT-FB-R01-POCKET', x: 34, z: 46, role: 'interaction' },
  { id: 'INT-FB-R01-COLLECTION', surfaceId: 'INT-FB-R01-POCKET', x: 29, z: 48, role: 'interaction' },
  { id: 'INT-FB-R01-EXTRACTION', surfaceId: 'INT-FB-R01-POCKET', x: 20, z: 49, role: 'extraction' },
  { id: 'INT-FB-F01-DISPUTED-LOT', surfaceId: 'INT-FB-F01-POCKET', x: 55, z: 41, role: 'interaction' },
  { id: 'INT-FB-F01-EXTRACTION', surfaceId: 'INT-FB-F01-POCKET', x: 69, z: 49, role: 'extraction' },
  { id: 'INT-FB-PUBLIC-SPUR', surfaceId: 'INT-FB-UNDERPASS-01', x: 53, z: 22, role: 'discovery' },
  { id: 'INT-FB-R01-SPAWN', surfaceId: 'INT-FB-R01-POCKET', x: 37, z: 38, role: 'spawn' },
  { id: 'INT-FB-F01-SPAWN', surfaceId: 'INT-FB-F01-POCKET', x: 67, z: 39, role: 'spawn' },
]);

export const INTEGRATED_FIXTURE_JOBS: readonly FixtureJob[] = deepFreeze([
  {
    id: 'MC-OPT-R01-01',
    pocketSurfaceId: 'INT-FB-R01-POCKET',
    finiteEnemyGroupId: 'INT-FB-R01-EXIT-GROUP',
    requiredInteractionIds: ['INT-FB-R01-MARKER-A', 'INT-FB-R01-MARKER-B', 'INT-FB-R01-COLLECTION'],
    extractionPointId: 'INT-FB-R01-EXTRACTION',
    requiresFiniteGroupClear: true,
  },
  {
    id: 'MC-OPT-F01-01',
    pocketSurfaceId: 'INT-FB-F01-POCKET',
    finiteEnemyGroupId: 'INT-FB-F01-DISPUTED-GROUP',
    requiredInteractionIds: ['INT-FB-F01-DISPUTED-LOT'],
    extractionPointId: 'INT-FB-F01-EXTRACTION',
    requiresFiniteGroupClear: false,
  },
]);
/** Immutable content binding for archived fixture replays.  Replay never
 * treats a caller/debug flag as proof that historical authored content exists. */
export function resolveIntegratedFixtureReplayContent(contentId: string, storyBranch: string): boolean {
  return (contentId === 'fixture:MC-OPT-R01-01:v1' && storyBranch === 'MC-OPT-R01-01')
    || (contentId === 'fixture:MC-OPT-F01-01:v1' && storyBranch === 'MC-OPT-F01-01');
}

export interface FixtureOperationState {
  readonly jobId: FixtureJobId;
  readonly completedInteractionIds: readonly string[];
  readonly finiteEnemyGroupCleared: boolean;
  readonly extractionConfirmed: boolean;
}

export function operationCanSettle(state: Readonly<FixtureOperationState>): boolean {
  const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === state.jobId);
  if (!job || !state.extractionConfirmed) return false;
  const completed = new Set(state.completedInteractionIds);
  if (!job.requiredInteractionIds.every(id => completed.has(id))) return false;
  return !job.requiresFiniteGroupClear || state.finiteEnemyGroupCleared;
}

export type FixtureOperationPhase = 'uninspected' | 'inspected' | 'accepted' | 'active' | 'settled';
/** Authoritative small contract lifecycle used by the scene adapter and tests. */
export class IntegratedFixtureOperation {
  private jobId?: FixtureJobId;
  private phase: FixtureOperationPhase = 'uninspected';
  private readonly completed = new Set<string>();
  private groupCleared = false;

  public inspect(jobId: FixtureJobId): void { this.jobId = jobId; this.phase = 'inspected'; this.completed.clear(); this.groupCleared = false; }
  public accept(): boolean { if (this.phase !== 'inspected') return false; this.phase = 'accepted'; return true; }
  public activate(): boolean { if (this.phase !== 'accepted') return false; this.phase = 'active'; return true; }
  public interact(pointId: string): boolean {
    if (this.phase !== 'active' || !this.jobId) return false;
    const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === this.jobId)!;
    if (!job.requiredInteractionIds.includes(pointId)) return false;
    this.completed.add(pointId);
    return true;
  }
  public setFiniteGroupCleared(): void { if (this.phase === 'active') this.groupCleared = true; }
  /** Read-only extraction gate used by persistence adapters before they publish settlement. */
  public canExtract(): boolean {
    if (this.phase !== 'active' || !this.jobId) return false;
    return operationCanSettle({ jobId: this.jobId, completedInteractionIds: [...this.completed], finiteEnemyGroupCleared: this.groupCleared, extractionConfirmed: true });
  }
  public extract(): boolean {
    if (!this.canExtract()) return false;
    this.phase = 'settled';
    return true;
  }
  /** Rehydrates only durable, unfinished progress; combat state remains scene-owned. */
  public restoreActive(jobId: FixtureJobId, completedInteractionIds: readonly string[], finiteEnemyGroupCleared: boolean): boolean {
    const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === jobId);
    if (!job || !completedInteractionIds.every(id => job.requiredInteractionIds.includes(id))) return false;
    this.jobId = jobId;
    this.phase = 'active';
    this.completed.clear();
    completedInteractionIds.forEach(id => this.completed.add(id));
    this.groupCleared = finiteEnemyGroupCleared;
    return true;
  }
  public snapshot(): Readonly<{ jobId?: FixtureJobId; phase: FixtureOperationPhase; completedInteractionIds: readonly string[]; finiteEnemyGroupCleared: boolean }> {
    return Object.freeze({ jobId: this.jobId, phase: this.phase, completedInteractionIds: Object.freeze([...this.completed]), finiteEnemyGroupCleared: this.groupCleared });
  }
}

export const INTEGRATED_FIXTURE_SAVE_KEY = 'meowcenary:int-fb:v1';
/**
 * The proving ground deliberately has one isolated browser envelope.  It is
 * not the game's SaveManager schema and is never written by replay helpers.
 */
export const INTEGRATED_FIXTURE_ENVELOPE_KEY = `${INTEGRATED_FIXTURE_SAVE_KEY}:profile`;
export const INTEGRATED_FIXTURE_ENVELOPE_VERSION = 'int-fb-envelope-v3';
export interface FixtureMissionReceipt {
  readonly id: string;
  readonly jobId: FixtureJobId;
  readonly worldEventId: FixtureWorldEventId;
  readonly attemptId: FixtureAttemptId;
  readonly recipientId: 'rcc-dispatch' | 'fre-broker';
  readonly credits: 1000;
  readonly metal: 20;
  readonly circuits: 4;
  readonly cloth: 6;
  /** New attempts retain their actual activation snapshot; older receipts
   * intentionally omit this and are replay-unavailable. */
  readonly replayRecord?: Readonly<{ version: 'int-fb-replay-v1'; contentId: string; storyBranch: string; startSnapshot: FixtureCombatSnapshot; /** Exact resolved workshop/loadout at activation. Older snapshot-only records stay unavailable. */ loadout?: FixtureWorkshopProfile }>;
}
export interface FixtureMissionSave {
  readonly version: typeof INTEGRATED_FIXTURE_VERSION;
  readonly seed: 'int-fb-post-chapter-2';
  readonly receipts: readonly FixtureMissionReceipt[];
}
export function createIntegratedFixtureSave(): FixtureMissionSave {
  return Object.freeze({ version: INTEGRATED_FIXTURE_VERSION, seed: 'int-fb-post-chapter-2', receipts: Object.freeze([]) });
}
/**
 * Delivery history is keyed by the durable world event, never by a reusable
 * job definition.  A new event may pay; a repeat callback for one delivered
 * event cannot recreate its cargo or receipt.
 */
export function settleIntegratedFixtureEvent(save: FixtureMissionSave, jobId: FixtureJobId, worldEventId: FixtureWorldEventId, attemptId: FixtureAttemptId, replayRecord?: FixtureMissionReceipt['replayRecord']): Readonly<{ save: FixtureMissionSave; receipt: FixtureMissionReceipt; applied: boolean }> {
  const id = `int-fb:${worldEventId}:settlement`;
  const existing = save.receipts.find(receipt => receipt.id === id);
  if (existing) return Object.freeze({ save, receipt: existing, applied: false });
  const receipt: FixtureMissionReceipt = Object.freeze({ id, jobId, worldEventId, attemptId, recipientId: jobId === 'MC-OPT-R01-01' ? 'rcc-dispatch' : 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6, ...(replayRecord ? { replayRecord } : {}) });
  const next = Object.freeze({ version: INTEGRATED_FIXTURE_VERSION, seed: 'int-fb-post-chapter-2' as const, receipts: Object.freeze([...save.receipts, receipt]) });
  return Object.freeze({ save: next, receipt, applied: true });
}
/** Compatibility-only source receipt helper. Live scenes must settle by event. */
export function settleIntegratedFixtureJob(save: FixtureMissionSave, jobId: FixtureJobId): Readonly<{ save: FixtureMissionSave; receipt: FixtureMissionReceipt; applied: boolean }> {
  const legacyEventId = jobId as FixtureWorldEventId;
  return settleIntegratedFixtureEvent(save, jobId, legacyEventId, `legacy-attempt:${jobId}` as FixtureAttemptId);
}
export function deserializeIntegratedFixtureSave(value: string | null): FixtureMissionSave {
  if (!value) return createIntegratedFixtureSave();
  try {
    const parsed = JSON.parse(value) as Partial<FixtureMissionSave>;
    if (parsed.version !== INTEGRATED_FIXTURE_VERSION || parsed.seed !== 'int-fb-post-chapter-2' || !Array.isArray(parsed.receipts)) return createIntegratedFixtureSave();
    const receipts = parsed.receipts.flatMap((receipt): readonly FixtureMissionReceipt[] => {
      if (!receipt || typeof receipt.id !== 'string' || (receipt.jobId !== 'MC-OPT-R01-01' && receipt.jobId !== 'MC-OPT-F01-01')
        || (receipt.recipientId !== 'rcc-dispatch' && receipt.recipientId !== 'fre-broker')
        || receipt.credits !== 1000 || receipt.metal !== 20 || receipt.circuits !== 4 || receipt.cloth !== 6) return [];
      if (typeof receipt.worldEventId === 'string' && receipt.worldEventId.length > 0 && typeof receipt.attemptId === 'string' && receipt.attemptId.length > 0) return [receipt];
      // The isolated v1 fixture receipt had no event identity. Keep it readable
      // and non-destructive by assigning its deterministic old job identity;
      // this never reads or rewrites the normal game-save schema.
      if (receipt.id !== `int-fb:${receipt.jobId}:settlement`) return [];
      return [Object.freeze({ ...receipt, worldEventId: receipt.jobId as FixtureWorldEventId, attemptId: `legacy-attempt:${receipt.jobId}` as FixtureAttemptId })];
    });
    return Object.freeze({ version: INTEGRATED_FIXTURE_VERSION, seed: 'int-fb-post-chapter-2', receipts: Object.freeze(receipts) });
  } catch { return createIntegratedFixtureSave(); }
}
export function fixtureDialogue(jobId: FixtureJobId, phase: 'offer' | 'accepted' | 'result'): string {
  if (jobId === 'MC-OPT-R01-01') return phase === 'offer' ? 'RCC: Recover both authorized shipment markers, then clear the exit.'
    : phase === 'accepted' ? 'Tabby: We have the recipient proof. Move.' : 'RCC: Correct recipient confirmed. Receipt recorded.';
  return phase === 'offer' ? 'FRE: Recover the disputed cargo through disclosed unauthorized access, then extract.'
    : phase === 'accepted' ? 'Hound: Disputed lot. We take the marked cargo and leave.' : 'FRE: Disputed lot received. Receipt recorded.';
}

/** Read-only history projection; it has no transaction or save mutation path. */
export function historicalFixtureMissionReplay(save: FixtureMissionSave, receiptId: string): Readonly<{ receipt: FixtureMissionReceipt; text: string }> | undefined {
  const receipt = save.receipts.find(candidate => candidate.id === receiptId);
  if (!receipt) return undefined;
  return Object.freeze({ receipt, text: `${fixtureDialogue(receipt.jobId, 'result')} Historical receipt: ${receipt.id}.` });
}
/** Caller-supplied retained content identity. The fixture does not invent a
 * later story branch or substitute missing historical content. */
export interface FixtureHistoricalReplayContent { readonly contentId: string; readonly storyBranch: string; readonly available: boolean; }
export interface FixtureHistoricalReplaySession { readonly replaySessionId: string; readonly profileHash: string; readonly receipt: FixtureMissionReceipt; readonly contentId: string; readonly storyBranch: string; }
function fixtureStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
/** This profile hash is a replay guard, not a security primitive. */
export function fixtureWorkshopProfileHash(profile: FixtureWorkshopProfile): string { return fixtureStableHash(JSON.stringify(profile)); }
export function beginHistoricalFixtureReplay(profile: FixtureWorkshopProfile, save: FixtureMissionSave, receiptId: string, content: FixtureHistoricalReplayContent): Readonly<{ session?: FixtureHistoricalReplaySession; reason?: 'receipt-unavailable' | 'pinned-content-unavailable' }> {
  const receipt = save.receipts.find(candidate => candidate.id === receiptId);
  if (!receipt || !receipt.replayRecord) return Object.freeze({ reason: 'receipt-unavailable' });
  if (!content.available || !content.contentId || !content.storyBranch || content.contentId !== receipt.replayRecord.contentId || content.storyBranch !== receipt.replayRecord.storyBranch) return Object.freeze({ reason: 'pinned-content-unavailable' });
  const profileHash = fixtureWorkshopProfileHash(profile);
  return Object.freeze({ session: Object.freeze({ replaySessionId: `int-fb:replay:${receipt.id}:${profileHash}`, profileHash, receipt: Object.freeze({ ...receipt }), contentId: content.contentId, storyBranch: content.storyBranch }) });
}
/** Completion is an observation only: any terminal route must retain the
 * session's profile hash and cannot return a profile mutation. */
export function finishHistoricalFixtureReplay(profile: FixtureWorkshopProfile, session: FixtureHistoricalReplaySession, outcome: 'success' | 'death' | 'exit'): Readonly<{ outcome: 'success' | 'death' | 'exit'; profileHashUnchanged: boolean }> {
  return Object.freeze({ outcome, profileHashUnchanged: fixtureWorkshopProfileHash(profile) === session.profileHash });
}

export type FixtureRecoveryState = 'active' | 'takeover-required' | 'recovered' | 'lost';
/** The survivor must explicitly continue after lead KO; recovery never modifies durable gear. */
export function resolveFixtureTakeover(tabbyHealth: number, houndHealth: number, confirmed: boolean): FixtureRecoveryState {
  if (tabbyHealth > 0) return 'active';
  if (houndHealth <= 0) return 'lost';
  return confirmed ? 'recovered' : 'takeover-required';
}
export type FixtureWorldEventId = string & { readonly __worldEvent: unique symbol };
export type FixtureAttemptId = string & { readonly __attempt: unique symbol };
export type FixtureAttemptTerminal = 'active' | 'victory' | 'failure';
export interface FixtureAttemptRecord { readonly worldEventId: FixtureWorldEventId; readonly attemptId: FixtureAttemptId; readonly terminal: FixtureAttemptTerminal; readonly recoveryClaimed: boolean; }
export interface FixtureAttemptLedger { readonly attempts: readonly FixtureAttemptRecord[]; readonly paidEventIds: readonly FixtureWorldEventId[]; }
export function beginFixtureAttempt(worldEventId: FixtureWorldEventId, attemptId: FixtureAttemptId): FixtureAttemptRecord { return Object.freeze({ worldEventId, attemptId, terminal: 'active', recoveryClaimed: false }); }
export function recoverFixtureFailure(attempt: FixtureAttemptRecord, settledCredits: number): Readonly<{ attempt: FixtureAttemptRecord; fee: number; applied: boolean }> {
  if (attempt.terminal !== 'failure' || attempt.recoveryClaimed) return Object.freeze({ attempt, fee: 0, applied: false });
  const fee = Math.min(250, Math.floor(Math.max(0, settledCredits) * .10));
  return Object.freeze({ attempt: Object.freeze({ ...attempt, recoveryClaimed: true }), fee, applied: true });
}
export function terminalFixtureAttempt(attempt: FixtureAttemptRecord, terminal: 'victory' | 'failure'): FixtureAttemptRecord { return attempt.terminal === 'active' ? Object.freeze({ ...attempt, terminal }) : attempt; }
export function retryFixtureAttempt(ledger: FixtureAttemptLedger, worldEventId: FixtureWorldEventId, attemptId: FixtureAttemptId): FixtureAttemptLedger {
  if (ledger.paidEventIds.includes(worldEventId) || ledger.attempts.some(attempt => attempt.attemptId === attemptId)
    || !ledger.attempts.some(attempt => attempt.worldEventId === worldEventId && attempt.terminal === 'failure' && attempt.recoveryClaimed)) return ledger;
  return Object.freeze({ attempts: Object.freeze([...ledger.attempts, beginFixtureAttempt(worldEventId, attemptId)]), paidEventIds: ledger.paidEventIds });
}
export function settleFixtureAttempt(ledger: FixtureAttemptLedger, attemptId: FixtureAttemptId): Readonly<{ ledger: FixtureAttemptLedger; applied: boolean }> {
  const target = ledger.attempts.find(attempt => attempt.attemptId === attemptId);
  if (!target || target.terminal !== 'active' || ledger.paidEventIds.includes(target.worldEventId)) return Object.freeze({ ledger, applied: false });
  return Object.freeze({ ledger: Object.freeze({ attempts: Object.freeze(ledger.attempts.map(attempt => attempt.attemptId === attemptId ? terminalFixtureAttempt(attempt, 'victory') : attempt)), paidEventIds: Object.freeze([...ledger.paidEventIds, target.worldEventId]) }), applied: true });
}
export function failFixtureProfileAttempt(profile: FixtureWorkshopProfile, attemptId: FixtureAttemptId): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean; fee: number }> {
  const index = profile.attempts.findIndex(attempt => attempt.attemptId === attemptId); if (index < 0) return Object.freeze({ profile, applied: false, fee: 0 });
  const failed = terminalFixtureAttempt(profile.attempts[index]!, 'failure'); const recovery = recoverFixtureFailure(failed, profile.wallet.credits); if (!recovery.applied) return Object.freeze({ profile, applied: false, fee: 0 });
  return Object.freeze({ profile: freezeProfile({ ...profile, revision: profile.revision + 1, wallet: { ...profile.wallet, credits: profile.wallet.credits - recovery.fee }, attempts: [...profile.attempts.slice(0, index), recovery.attempt, ...profile.attempts.slice(index + 1)] }), applied: true, fee: recovery.fee });
}
/** Allocates the first attempt for a newly discovered world event. */
export function beginFixtureProfileAttempt(profile: FixtureWorkshopProfile, worldEventId: FixtureWorldEventId, attemptId: FixtureAttemptId): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean }> {
  if (profile.paidEventIds.includes(worldEventId) || profile.attempts.some(attempt => attempt.worldEventId === worldEventId || attempt.attemptId === attemptId)) return Object.freeze({ profile, applied: false });
  return Object.freeze({ profile: freezeProfile({ ...profile, revision: profile.revision + 1, attempts: [...profile.attempts, beginFixtureAttempt(worldEventId, attemptId)] }), applied: true });
}
export function retryFixtureProfileAttempt(profile: FixtureWorkshopProfile, worldEventId: FixtureWorldEventId, attemptId: FixtureAttemptId): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean }> {
  const ledger = retryFixtureAttempt({ attempts: profile.attempts, paidEventIds: profile.paidEventIds }, worldEventId, attemptId);
  if (ledger.attempts === profile.attempts) return Object.freeze({ profile, applied: false });
  return Object.freeze({ profile: freezeProfile({ ...profile, revision: profile.revision + 1, attempts: ledger.attempts, paidEventIds: ledger.paidEventIds }), applied: true });
}
/** Applies the canonical B1 success attribution once per certified job. The
 * optional job identity keeps legacy callers compatible while the live scene
 * provides it at its atomic mission/profile settlement boundary. */
export function settleFixtureProfileAttempt(profile: FixtureWorkshopProfile, attemptId: FixtureAttemptId, jobId?: FixtureJobId): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean }> {
  const settled = settleFixtureAttempt({ attempts: profile.attempts, paidEventIds: profile.paidEventIds }, attemptId);
  if (!settled.applied) return Object.freeze({ profile, applied: false });
  const progression = jobId ? awardFixtureEventProgression(profile, jobId, settled.ledger.paidEventIds.at(-1)!) : profile;
  return Object.freeze({ profile: freezeProfile({ ...progression, revision: profile.revision + 1, attempts: settled.ledger.attempts, paidEventIds: settled.ledger.paidEventIds, wallet: { ...progression.wallet, credits: progression.wallet.credits + 1000, metal: progression.wallet.metal + 20, circuits: progression.wallet.circuits + 4, cloth: progression.wallet.cloth + 6 } }), applied: true });
}

/** Persisted scene progress references the profile ledger; it never owns a second terminal state. */
export interface FixtureLiveMission {
  readonly jobId: FixtureJobId;
  readonly worldEventId: FixtureWorldEventId;
  readonly attemptId: FixtureAttemptId;
  readonly completedInteractionIds: readonly string[];
  readonly finiteEnemyGroupCleared: boolean;
  readonly recoveryRequired: boolean;
  /** Monotonic ownership token for combat snapshots. A stale tab may observe
   * an active attempt, but cannot publish over a checkpoint it did not read. */
  readonly checkpointRevision: number;
  /** Companion mutation counter retained with the revision for persisted
   * compare-and-swap compatibility; it is not a designated-owner lease. */
  readonly ownerEpoch: number;
  /** Written in the same envelope transaction as the recovery debit. Older
   * isolated envelopes did not retain this display receipt. */
  readonly recoveryFee?: number;
  /** Last atomic combat checkpoint for this unfinished attempt. It restores
   * the actual survivors rather than manufacturing a fresh squad on reload. */
  readonly combatSnapshot?: FixtureCombatSnapshot;
  readonly replayRecord?: NonNullable<FixtureMissionReceipt['replayRecord']>;
}
export interface FixturePersistentEnvelope {
  readonly version: typeof INTEGRATED_FIXTURE_ENVELOPE_VERSION;
  readonly mission: FixtureMissionSave;
  readonly workshop: FixtureWorkshopProfile;
  readonly liveMission?: FixtureLiveMission;
}
export type FixtureEnvelopeDecode = Readonly<{ state: 'absent' } | { state: 'invalid' } | { state: 'valid'; envelope: FixturePersistentEnvelope }>;
function fixtureSemanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => fixtureSemanticEqual(item, right[index]));
  const leftRecord = left as Record<string, unknown>; const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord); const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key) && fixtureSemanticEqual(leftRecord[key], rightRecord[key]));
}
/** A replay record is durable evidence, not an optional UI hint.  Validate the
 * same shape for the unfinished attempt and its eventual receipt so malformed
 * live metadata can never be promoted into a save that rejects on reload. */
function validFixtureReplayRecord(value: unknown, job: FixtureJobId): value is NonNullable<FixtureMissionReceipt['replayRecord']> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<NonNullable<FixtureMissionReceipt['replayRecord']>>;
  return record.version === 'int-fb-replay-v1'
    && typeof record.contentId === 'string' && record.contentId.length > 0
    && record.storyBranch === job
    && validFixtureCombatSnapshot(record.startSnapshot, job, false)
    && (record.loadout === undefined || validArchivedReplayLoadout(record.loadout));
}
/** Strict enough for an immutable archived loadout without comparing its
 * historical wallet/attempt ledger to the current live profile. */
function validArchivedReplayLoadout(value: unknown): value is FixtureWorkshopProfile {
  if (!value || typeof value !== 'object') return false;
  const loadout = value as Partial<FixtureWorkshopProfile>;
  const kinds = new Set(['R1', 'B1', 'B2', 'B3', 'F1', 'F2', 'P1', 'H1', 'C1', 'H2']);
  const slots = new Set(['R', 'B', 'F', 'P', 'H', 'C']);
  const guns = ['TAB-A', 'TAB-B', 'HOU-A', 'HOU-B'] as const;
  if (loadout.version !== 'int-fb-profile-v2' || loadout.profileId !== 'INT-B1-PROFILE-01' || !Number.isSafeInteger(loadout.revision) || loadout.revision! < 0 || !loadout.wallet || !['credits', 'metal', 'circuits', 'cloth', 'flux'].every(key => Number.isFinite(loadout.wallet![key as keyof FixtureWallet]) && loadout.wallet![key as keyof FixtureWallet]! >= 0) || !Array.isArray(loadout.parts) || !loadout.gunSlots) return false;
  if (!loadout.parts.every(part => !!part && typeof part.instanceId === 'string' && part.instanceId.length > 0 && kinds.has(part.kind) && slots.has(part.slot) && (part.family === 'TAB' || part.family === 'HOU') && (part.tier === null || part.tier === 1 || part.tier === 2 || part.tier === 3) && Number.isSafeInteger(part.version) && part.version > 0)) return false;
  if (new Set(loadout.parts.map(part => part.instanceId)).size !== loadout.parts.length) return false;
  const assigned: string[] = [];
  for (const gun of guns) {
    const slotsForGun = loadout.gunSlots[gun];
    if (!slotsForGun) return false;
    for (const slot of slots) {
      const id = slotsForGun[slot as FixtureSlot]; const part = loadout.parts.find(candidate => candidate.instanceId === id);
      if (!part || part.slot !== slot || part.family !== (gun.startsWith('TAB') ? 'TAB' : 'HOU')) return false;
      assigned.push(id);
    }
  }
  return new Set(assigned).size === assigned.length;
}
export function createIntegratedFixtureEnvelope(): FixturePersistentEnvelope {
  return Object.freeze({ version: INTEGRATED_FIXTURE_ENVELOPE_VERSION, mission: createIntegratedFixtureSave(), workshop: createIntegratedFixtureWorkshopProfile() });
}
function validLiveMission(value: unknown, profile: FixtureWorkshopProfile): value is FixtureLiveMission {
  if (!value || typeof value !== 'object') return false;
  const live = value as Partial<FixtureLiveMission>;
  if ((live.jobId !== 'MC-OPT-R01-01' && live.jobId !== 'MC-OPT-F01-01') || typeof live.worldEventId !== 'string' || !live.worldEventId
    || typeof live.attemptId !== 'string' || !live.attemptId || !Array.isArray(live.completedInteractionIds)
    || !live.completedInteractionIds.every(id => typeof id === 'string') || typeof live.finiteEnemyGroupCleared !== 'boolean' || typeof live.recoveryRequired !== 'boolean'
    || (live.checkpointRevision !== undefined && (!Number.isSafeInteger(live.checkpointRevision) || live.checkpointRevision < 0))
    || (live.ownerEpoch !== undefined && (!Number.isSafeInteger(live.ownerEpoch) || live.ownerEpoch < 0))
    || (live.recoveryFee !== undefined && (!Number.isInteger(live.recoveryFee) || live.recoveryFee < 0 || live.recoveryFee > 250))
    || (!live.recoveryRequired && live.recoveryFee !== undefined)
    || (live.combatSnapshot !== undefined && !validFixtureCombatSnapshot(live.combatSnapshot, live.jobId, live.finiteEnemyGroupCleared))
    || (live.replayRecord !== undefined && !validFixtureReplayRecord(live.replayRecord, live.jobId))) return false;
  const job = INTEGRATED_FIXTURE_JOBS.find(candidate => candidate.id === live.jobId)!;
  if (!live.completedInteractionIds.every(id => job.requiredInteractionIds.includes(id))) return false;
  const attempt = profile.attempts.find(candidate => candidate.attemptId === live.attemptId && candidate.worldEventId === live.worldEventId);
  return !!attempt && !profile.paidEventIds.includes(live.worldEventId)
    && (live.recoveryRequired ? attempt.terminal === 'failure' && attempt.recoveryClaimed : attempt.terminal === 'active');
}
/**
 * V2 fixture envelopes are read without touching the browser until their next
 * ordinary transaction.  The normal game save is deliberately never read.
 */
export function deserializeIntegratedFixtureEnvelope(value: string | null): FixturePersistentEnvelope {
  if (!value) return createIntegratedFixtureEnvelope();
  try {
    const raw = JSON.parse(value) as { version?: string; mission?: unknown; workshop?: unknown; liveMission?: unknown };
    if (raw.version !== INTEGRATED_FIXTURE_ENVELOPE_VERSION && raw.version !== 'int-fb-envelope-v2') return createIntegratedFixtureEnvelope();
    const mission = deserializeIntegratedFixtureSave(JSON.stringify(raw.mission));
    const workshop = deserializeIntegratedFixtureWorkshopProfile(raw.workshop);
    const liveMission = validLiveMission(raw.liveMission, workshop) ? Object.freeze({ ...raw.liveMission, checkpointRevision: raw.liveMission.checkpointRevision ?? 0, ownerEpoch: raw.liveMission.ownerEpoch ?? 0, completedInteractionIds: Object.freeze([...raw.liveMission.completedInteractionIds]), ...(raw.liveMission.combatSnapshot ? { combatSnapshot: freezeFixtureCombatSnapshot(raw.liveMission.combatSnapshot) } : {}), ...(raw.liveMission.replayRecord ? { replayRecord: Object.freeze({ ...raw.liveMission.replayRecord, startSnapshot: freezeFixtureCombatSnapshot(raw.liveMission.replayRecord.startSnapshot) }) } : {}) }) : undefined;
    return Object.freeze({ version: INTEGRATED_FIXTURE_ENVELOPE_VERSION, mission, workshop, ...(liveMission ? { liveMission } : {}) });
  } catch { return createIntegratedFixtureEnvelope(); }
}
/** Fail-closed browser boundary. Only absence may create a new B1 fixture. */
export function decodeIntegratedFixtureEnvelope(value: string | null): FixtureEnvelopeDecode {
  if (value === null) return Object.freeze({ state: 'absent' });
  try {
    const raw = JSON.parse(value) as { version?: string; mission?: unknown; workshop?: unknown; liveMission?: unknown };
    if (raw.version !== INTEGRATED_FIXTURE_ENVELOPE_VERSION && raw.version !== 'int-fb-envelope-v2') return Object.freeze({ state: 'invalid' });
    const workshop = raw.workshop as Record<string, unknown> | undefined;
    const mission = raw.mission as Record<string, unknown> | undefined;
    const manifest = workshop?.manifest as Record<string, unknown> | undefined;
    const requiredWorkshopArrays = ['parts', 'claims', 'receipts', 'discoveries', 'knownSchematics', 'capabilities', 'attempts', 'paidEventIds', 'progressionAwardedEventIds'];
    const requiredManifestBooleans = ['firstCaseComplete', 'allSixIntroduced', 'workshopIntroduction', 't2Capability', 'mergeT3Locked', 't4Locked', 't5DirectManufactureLocked', 'tabDossierComplete', 'c012GiftClaimConsumed'];
    const record = (candidate: unknown): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object' && !Array.isArray(candidate);
    const nonEmpty = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.length > 0;
    const jobId = (candidate: unknown): candidate is FixtureJobId => candidate === 'MC-OPT-R01-01' || candidate === 'MC-OPT-F01-01';
    const partKinds: readonly FixturePartKind[] = ['R1', 'B1', 'F1', 'P1', 'H1', 'C1', 'B2', 'F2', 'H2', 'B3'];
    const slots: readonly FixtureSlot[] = ['R', 'B', 'F', 'P', 'H', 'C'];
    const guns: readonly FixtureGunId[] = ['TAB-A', 'TAB-B', 'HOU-A', 'HOU-B'];
    if (!mission || typeof mission !== 'object' || mission.version !== INTEGRATED_FIXTURE_VERSION || mission.seed !== 'int-fb-post-chapter-2' || !Array.isArray(mission.receipts)
      || !mission.receipts.every(receipt => record(receipt) && nonEmpty(receipt.id) && jobId(receipt.jobId) && nonEmpty(receipt.worldEventId) && nonEmpty(receipt.attemptId) && receipt.recipientId === (receipt.jobId === 'MC-OPT-R01-01' ? 'rcc-dispatch' : 'fre-broker') && receipt.credits === 1000 && receipt.metal === 20 && receipt.circuits === 4 && receipt.cloth === 6 && (receipt.replayRecord === undefined || validFixtureReplayRecord(receipt.replayRecord, receipt.jobId)))
      || !workshop || typeof workshop !== 'object' || !manifest || typeof manifest !== 'object'
      || !requiredWorkshopArrays.every(key => Array.isArray(workshop[key]))
      || !requiredManifestBooleans.every(key => typeof manifest[key] === 'boolean')
      || !Array.isArray(manifest.factoryOfferIds) || !manifest.factoryOfferIds.every(nonEmpty) || !nonEmpty(manifest.serviceId)
      || !workshop.gunSlots || typeof workshop.gunSlots !== 'object' || !workshop.wallet || typeof workshop.wallet !== 'object') return Object.freeze({ state: 'invalid' });
    const wallet = workshop.wallet as Record<string, unknown>;
    const parts = workshop.parts as readonly unknown[];
    const gunSlots = workshop.gunSlots as Record<string, unknown>;
    const rawPartsById = new Map(parts.filter(record).map(candidate => [candidate.instanceId, candidate] as const));
    const assignedIds = guns.flatMap(gun => slots.map(slot => (gunSlots[gun] as Record<string, unknown> | undefined)?.[slot]));
    if (workshop.version !== 'int-fb-profile-v2' || workshop.profileId !== 'INT-B1-PROFILE-01' || workshop.definitionVersion !== 'int-fb-definitions-v1' || workshop.rulesVersion !== 'int-fb-rules-v1'
      || !Number.isInteger(workshop.revision) || (workshop.revision as number) < 0
      || !['credits', 'metal', 'circuits', 'cloth', 'flux'].every(key => Number.isFinite(wallet[key]) && (wallet[key] as number) >= 0)
      || !parts.every(candidate => record(candidate) && nonEmpty(candidate.instanceId) && partKinds.includes(candidate.kind as FixturePartKind) && (candidate.family === 'TAB' || candidate.family === 'HOU') && slots.includes(candidate.slot as FixtureSlot) && typeof candidate.protectedBaseline === 'boolean' && typeof candidate.sealedFactory === 'boolean' && (candidate.tier === null || candidate.tier === 1 || candidate.tier === 2) && (candidate.refinement === null || candidate.refinement === 'Balanced') && nonEmpty(candidate.maker) && nonEmpty(candidate.provenance) && Number.isInteger(candidate.version) && (candidate.version as number) > 0)
      || new Set(parts.map(candidate => (candidate as Record<string, unknown>).instanceId)).size !== parts.length
      || !guns.every(gun => record(gunSlots[gun]) && slots.every(slot => nonEmpty((gunSlots[gun] as Record<string, unknown>)[slot])))
      || new Set(assignedIds).size !== assignedIds.length || !guns.every(gun => slots.every(slot => { const candidate = rawPartsById.get((gunSlots[gun] as Record<string, unknown>)[slot] as string); return candidate?.family === (gun.startsWith('TAB') ? 'TAB' : 'HOU') && candidate.slot === slot; }))
      || ![...(workshop.claims as unknown[]), ...(workshop.discoveries as unknown[]), ...(workshop.knownSchematics as unknown[]), ...(workshop.capabilities as unknown[]), ...(workshop.paidEventIds as unknown[]), ...(workshop.progressionAwardedEventIds as unknown[])].every(nonEmpty)
      || !(workshop.receipts as unknown[]).every(receipt => record(receipt) && nonEmpty(receipt.commandId) && Number.isInteger(receipt.revision) && (receipt.revision as number) > 0 && Array.isArray(receipt.outputIds) && receipt.outputIds.every(nonEmpty))
      || !(workshop.attempts as unknown[]).every(attempt => record(attempt) && nonEmpty(attempt.worldEventId) && nonEmpty(attempt.attemptId) && (attempt.terminal === 'active' || attempt.terminal === 'victory' || attempt.terminal === 'failure') && typeof attempt.recoveryClaimed === 'boolean')) return Object.freeze({ state: 'invalid' });
    const envelope = deserializeIntegratedFixtureEnvelope(value);
    // The legacy decoder seeds on bad nested values; reject those by requiring
    // every required persisted branch and live attempt to survive decoding.
    if (!raw.mission || !raw.workshop || (raw.liveMission !== undefined && !envelope.liveMission)
      // A successful decode must never be a legacy seed in disguise. The
      // legacy reader remains for compatibility-only callers, but the durable
      // browser boundary accepts no silently repaired workshop branch.
      || !fixtureSemanticEqual(envelope.workshop, raw.workshop)) return Object.freeze({ state: 'invalid' });
    return Object.freeze({ state: 'valid', envelope });
  } catch { return Object.freeze({ state: 'invalid' }); }
}
export function serializeIntegratedFixtureEnvelope(envelope: FixturePersistentEnvelope): string { return JSON.stringify(envelope); }
export function nextFixtureWorldEventId(profile: FixtureWorkshopProfile, jobId: FixtureJobId): FixtureWorldEventId {
  const prior = new Set(profile.attempts.filter(attempt => attempt.worldEventId.startsWith(`int-fb:event:${jobId}:`)).map(attempt => attempt.worldEventId));
  let sequence = 1;
  while (prior.has(`int-fb:event:${jobId}:${sequence}` as FixtureWorldEventId)) sequence += 1;
  return `int-fb:event:${jobId}:${sequence}` as FixtureWorldEventId;
}
export function nextFixtureAttemptId(profile: FixtureWorkshopProfile, worldEventId: FixtureWorldEventId): FixtureAttemptId {
  let sequence = profile.attempts.filter(attempt => attempt.worldEventId === worldEventId).length + 1;
  let id = `int-fb:attempt:${worldEventId}:${sequence}` as FixtureAttemptId;
  while (profile.attempts.some(attempt => attempt.attemptId === id)) { sequence += 1; id = `int-fb:attempt:${worldEventId}:${sequence}` as FixtureAttemptId; }
  return id;
}

export type FixturePartKind = 'R1' | 'B1' | 'F1' | 'P1' | 'H1' | 'C1' | 'B2' | 'F2' | 'H2' | 'B3';
export type FixtureGunId = 'TAB-A' | 'TAB-B' | 'HOU-A' | 'HOU-B';
export type FixtureSlot = 'R' | 'B' | 'F' | 'P' | 'H' | 'C';
export type FixtureWorkshopAction = 'discover-h2' | 'buy-f2' | 'claim-h2' | 'sell-h2' | 'build-b3' | 'develop-b2' | 'fit-f2-a' | 'fit-b3-a';
export interface FixtureWallet { readonly credits: number; readonly metal: number; readonly circuits: number; readonly cloth: number; readonly flux: number; }
export interface FixtureWorkshopStamp { readonly serviceId: 'INT-FB-SERVICE-01'; readonly commandId: string; readonly definitionVersion: 'int-fb-definitions-v1'; readonly rulesVersion: 'int-fb-rules-v1'; }
export interface FixturePart { readonly instanceId: string; readonly kind: FixturePartKind; readonly family: 'TAB' | 'HOU'; readonly slot: FixtureSlot; readonly protectedBaseline: boolean; readonly sealedFactory: boolean; readonly tier: 1 | 2 | null; readonly refinement: 'Balanced' | null; readonly maker: string; readonly provenance: string; readonly workshopStamp?: FixtureWorkshopStamp; readonly version: number; }
export interface FixtureWorkshopReceipt { readonly commandId: string; readonly action: FixtureWorkshopAction | 'mission'; readonly revision: number; readonly outputIds: readonly string[]; }
export interface FixtureStanding { readonly rcc: number; readonly fre: number; }
export interface FixtureWorkshopManifest { readonly firstCaseComplete: true; readonly allSixIntroduced: true; readonly workshopIntroduction: true; readonly t2Capability: true; readonly mergeT3Locked: true; readonly t4Locked: true; readonly t5DirectManufactureLocked: true; readonly tabDossierComplete: true; readonly houDossierSelected: 0; readonly c012GiftClaimConsumed: true; readonly serviceId: 'INT-FB-SERVICE-01'; readonly factoryOfferIds: readonly string[]; }
/** B1 retains only the selected Hound dossier count; later dossier branches
 * remain outside this fixture rather than being fabricated here. */
export interface FixtureWorkshopProfile { readonly version: 'int-fb-profile-v2'; readonly profileId: 'INT-B1-PROFILE-01'; readonly definitionVersion: 'int-fb-definitions-v1'; readonly rulesVersion: 'int-fb-rules-v1'; readonly revision: number; readonly wallet: FixtureWallet; readonly manifest: FixtureWorkshopManifest; readonly parts: readonly FixturePart[]; readonly gunSlots: Readonly<Record<FixtureGunId, Readonly<Record<FixtureSlot, string>>>>; readonly claims: readonly string[]; readonly receipts: readonly FixtureWorkshopReceipt[]; readonly discoveries: readonly string[]; readonly knownSchematics: readonly string[]; readonly capabilities: readonly string[]; readonly attempts: readonly FixtureAttemptRecord[]; readonly paidEventIds: readonly FixtureWorldEventId[]; readonly standing: FixtureStanding; readonly houDossier: number; readonly fluxQualificationRemainder: number; readonly progressionAwardedEventIds: readonly FixtureWorldEventId[]; }
export interface FixtureWorkshopCommand { readonly profileId?: string; readonly commandId: string; readonly expectedRevision: number; readonly action: FixtureWorkshopAction; readonly partInstanceId?: string; }
type SlotMap = Record<FixtureGunId, Record<FixtureSlot, string>>;
const fixtureGuns: readonly FixtureGunId[] = ['TAB-A', 'TAB-B', 'HOU-A', 'HOU-B'];
const fixtureSlots: readonly FixtureSlot[] = ['R', 'B', 'F', 'P', 'H', 'C'];
const familyForGun = (gun: FixtureGunId): 'TAB' | 'HOU' => gun.slice(0, 3) as 'TAB' | 'HOU';
const B1_MANIFEST: FixtureWorkshopManifest = Object.freeze({ firstCaseComplete: true, allSixIntroduced: true, workshopIntroduction: true, t2Capability: true, mergeT3Locked: true, t4Locked: true, t5DirectManufactureLocked: true, tabDossierComplete: true, houDossierSelected: 0, c012GiftClaimConsumed: true, serviceId: 'INT-FB-SERVICE-01', factoryOfferIds: Object.freeze(['INT-B1-OFFER-TAB-F2']) });
const freezeProfile = (profile: Omit<FixtureWorkshopProfile, 'version'>): FixtureWorkshopProfile => Object.freeze({ version: 'int-fb-profile-v2', ...profile, manifest: Object.freeze({ ...profile.manifest, factoryOfferIds: Object.freeze([...profile.manifest.factoryOfferIds]) }), paidEventIds: Object.freeze([...profile.paidEventIds]), attempts: Object.freeze(profile.attempts.map(attempt => Object.freeze({ ...attempt }))), wallet: Object.freeze({ ...profile.wallet }), standing: Object.freeze({ ...profile.standing }), progressionAwardedEventIds: Object.freeze([...profile.progressionAwardedEventIds]), parts: Object.freeze(profile.parts.map(part => Object.freeze({ ...part, ...(part.workshopStamp ? { workshopStamp: Object.freeze({ ...part.workshopStamp }) } : {}) }))), gunSlots: Object.freeze(Object.fromEntries(fixtureGuns.map(gun => [gun, Object.freeze({ ...profile.gunSlots[gun] })])) as FixtureWorkshopProfile['gunSlots']), claims: Object.freeze([...profile.claims]), discoveries: Object.freeze([...profile.discoveries]), knownSchematics: Object.freeze([...profile.knownSchematics]), capabilities: Object.freeze([...profile.capabilities]), receipts: Object.freeze(profile.receipts.map(receipt => Object.freeze({ ...receipt, outputIds: Object.freeze([...receipt.outputIds]) }))) });
export function createIntegratedFixtureWorkshopProfile(): FixtureWorkshopProfile {
  const parts: FixturePart[] = [];
  const gunSlots = {} as SlotMap;
  for (const gun of fixtureGuns) {
    gunSlots[gun] = {} as Record<FixtureSlot, string>;
    for (const slot of fixtureSlots) {
      const kind = `${slot}1` as FixturePartKind;
      const instanceId = `INT-B1-${gun}-${slot}-BASE`;
      parts.push({ instanceId, kind, family: familyForGun(gun), slot, protectedBaseline: true, sealedFactory: true, tier: null, refinement: null, maker: slot === 'C' ? 'Needlebank Instruments' : 'Rivetwake Heavy Works', provenance: 'factory baseline', version: 1 });
      gunSlots[gun][slot] = instanceId;
    }
  }
  const gift: FixturePart = { instanceId: 'INT-B1-TAB-B2-GIFT', kind: 'B2', family: 'TAB', slot: 'B', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Needlebank Instruments', provenance: 'C01.2 first-barrel fixture grant', version: 1 };
  parts.push(gift); gunSlots['TAB-B'].B = gift.instanceId;
  return freezeProfile({ profileId: 'INT-B1-PROFILE-01', definitionVersion: 'int-fb-definitions-v1', rulesVersion: 'int-fb-rules-v1', revision: 0, wallet: { credits: 3000, metal: 80, circuits: 16, cloth: 12, flux: 3 }, manifest: B1_MANIFEST, standing: { rcc: 0, fre: 0 }, houDossier: 0, fluxQualificationRemainder: .25, progressionAwardedEventIds: [], parts, gunSlots, claims: [], discoveries: [], knownSchematics: ['TAB-B2', 'TAB-B3'], capabilities: ['T2'], attempts: [], paidEventIds: [], receipts: [] });
}
function progressionJobFromEventId(eventId: FixtureWorldEventId): FixtureJobId | undefined {
  return (['MC-OPT-R01-01', 'MC-OPT-F01-01'] as const).find(jobId => eventId.includes(`:${jobId}:`));
}
function progressionState(eventIds: readonly FixtureWorldEventId[]): Readonly<{ houDossier: number; fluxQualificationRemainder: number; flux: number }> {
  const qualified = eventIds.length;
  return Object.freeze({ houDossier: Math.min(4, qualified), fluxQualificationRemainder: .25 + (qualified % 3), flux: Math.floor(qualified / 3) });
}
function standingForProgressionEvents(eventIds: readonly FixtureWorldEventId[]): FixtureStanding {
  return Object.freeze({ rcc: eventIds.some(eventId => progressionJobFromEventId(eventId) === 'MC-OPT-R01-01') ? 10 : 0, fre: eventIds.some(eventId => progressionJobFromEventId(eventId) === 'MC-OPT-F01-01') ? 10 : 0 });
}
function awardFixtureEventProgression(profile: FixtureWorkshopProfile, jobId: FixtureJobId, worldEventId: FixtureWorldEventId): FixtureWorkshopProfile {
  if (profile.progressionAwardedEventIds.includes(worldEventId)) return profile;
  const progressionAwardedEventIds = [...profile.progressionAwardedEventIds, worldEventId];
  const state = progressionState(progressionAwardedEventIds);
  return freezeProfile({ ...profile, progressionAwardedEventIds, standing: { rcc: profile.standing.rcc + (jobId === 'MC-OPT-R01-01' && profile.standing.rcc === 0 ? 10 : 0), fre: profile.standing.fre + (jobId === 'MC-OPT-F01-01' && profile.standing.fre === 0 ? 10 : 0) }, houDossier: state.houDossier, fluxQualificationRemainder: state.fluxQualificationRemainder, wallet: { ...profile.wallet, flux: 3 + state.flux } });
}
function legalAttemptLedger(attempts: readonly FixtureAttemptRecord[], paidEventIds: readonly FixtureWorldEventId[]): boolean {
  const attemptIds = new Set<string>();
  const paid = new Set<string>();
  if (!attempts.every(attempt => typeof attempt.worldEventId === 'string' && attempt.worldEventId.length > 0
    && typeof attempt.attemptId === 'string' && attempt.attemptId.length > 0
    && (attempt.terminal === 'active' || attempt.terminal === 'victory' || attempt.terminal === 'failure')
    && typeof attempt.recoveryClaimed === 'boolean' && !attemptIds.has(attempt.attemptId)
    && (attemptIds.add(attempt.attemptId), true))) return false;
  if (!paidEventIds.every(eventId => typeof eventId === 'string' && eventId.length > 0 && !paid.has(eventId) && (paid.add(eventId), true))) return false;
  return paidEventIds.every(eventId => attempts.some(attempt => attempt.worldEventId === eventId && attempt.terminal === 'victory'));
}
/** Reject malformed/legacy envelopes rather than ever rewriting the normal game save. */
export function deserializeIntegratedFixtureWorkshopProfile(value: unknown): FixtureWorkshopProfile {
  if (!value || typeof value !== 'object') return createIntegratedFixtureWorkshopProfile();
  const raw = value as Partial<FixtureWorkshopProfile>;
  if (raw.version !== 'int-fb-profile-v2' || raw.profileId !== 'INT-B1-PROFILE-01' || raw.definitionVersion !== 'int-fb-definitions-v1' || raw.rulesVersion !== 'int-fb-rules-v1' || !Number.isInteger(raw.revision) || raw.revision! < 0 || !raw.wallet || !Array.isArray(raw.parts) || !raw.gunSlots || !Array.isArray(raw.claims) || !Array.isArray(raw.receipts) || !Array.isArray(raw.discoveries) || !Array.isArray(raw.knownSchematics) || !Array.isArray(raw.capabilities)) return createIntegratedFixtureWorkshopProfile();
  const wallet = raw.wallet;
  if (!['credits', 'metal', 'circuits', 'cloth', 'flux'].every(key => Number.isFinite(wallet[key as keyof FixtureWallet]) && wallet[key as keyof FixtureWallet]! >= 0)) return createIntegratedFixtureWorkshopProfile();
  const attempts = Array.isArray(raw.attempts) ? raw.attempts as FixtureAttemptRecord[] : [];
  const paidEventIds = Array.isArray(raw.paidEventIds) ? raw.paidEventIds as FixtureWorldEventId[] : [];
  if (!legalAttemptLedger(attempts, paidEventIds)) return createIntegratedFixtureWorkshopProfile();
  const rawRecord = raw as Record<string, unknown>;
  const progressionAwardedEventIds = raw.progressionAwardedEventIds === undefined ? paidEventIds : raw.progressionAwardedEventIds;
  if (!Array.isArray(progressionAwardedEventIds) || !progressionAwardedEventIds.every(eventId => typeof eventId === 'string' && paidEventIds.includes(eventId as FixtureWorldEventId)) || new Set(progressionAwardedEventIds).size !== progressionAwardedEventIds.length) return createIntegratedFixtureWorkshopProfile();
  const migratedProgression = progressionState(progressionAwardedEventIds as FixtureWorldEventId[]);
  const standing = raw.standing === undefined ? standingForProgressionEvents(progressionAwardedEventIds as FixtureWorldEventId[]) : raw.standing;
  const houDossier = raw.houDossier === undefined ? migratedProgression.houDossier : raw.houDossier;
  const fluxQualificationRemainder = raw.fluxQualificationRemainder === undefined ? migratedProgression.fluxQualificationRemainder : raw.fluxQualificationRemainder;
  if (!standing || !Number.isInteger(standing.rcc) || !Number.isInteger(standing.fre) || standing.rcc < 0 || standing.fre < 0 || !Number.isInteger(houDossier) || houDossier < 0 || houDossier > 4 || !Number.isFinite(fluxQualificationRemainder) || fluxQualificationRemainder < 0 || fluxQualificationRemainder >= 3) return createIntegratedFixtureWorkshopProfile();
  const manifest = raw.manifest === undefined ? B1_MANIFEST : raw.manifest;
  if (!manifest || typeof manifest !== 'object' || (rawRecord.progressionAwardedJobIds !== undefined && raw.progressionAwardedEventIds === undefined)) return createIntegratedFixtureWorkshopProfile();
  const profile = freezeProfile({ profileId: raw.profileId, definitionVersion: raw.definitionVersion, rulesVersion: raw.rulesVersion, revision: raw.revision!, wallet, manifest: manifest as FixtureWorkshopManifest, standing, houDossier, fluxQualificationRemainder, progressionAwardedEventIds: progressionAwardedEventIds as FixtureWorldEventId[], parts: raw.parts as FixturePart[], gunSlots: raw.gunSlots as FixtureWorkshopProfile['gunSlots'], claims: raw.claims as string[], discoveries: raw.discoveries as string[], knownSchematics: raw.knownSchematics as string[], capabilities: raw.capabilities as string[], attempts, paidEventIds, receipts: raw.receipts as FixtureWorkshopReceipt[] });
  return legalSlots(profile) && new Set(profile.parts.map(candidate => candidate.instanceId)).size === profile.parts.length ? profile : createIntegratedFixtureWorkshopProfile();
}
function part(profile: FixtureWorkshopProfile, instanceId: string): FixturePart | undefined { return profile.parts.find(candidate => candidate.instanceId === instanceId); }
function assigned(profile: FixtureWorkshopProfile, instanceId: string): boolean { return fixtureGuns.some(gun => fixtureSlots.some(slot => profile.gunSlots[gun][slot] === instanceId)); }
function legalSlots(profile: FixtureWorkshopProfile): boolean {
  const seen = new Set<string>();
  return fixtureGuns.every(gun => fixtureSlots.every(slot => { const candidate = part(profile, profile.gunSlots[gun][slot]); return !!candidate && candidate.family === familyForGun(gun) && candidate.slot === slot && !seen.has(candidate.instanceId) && (seen.add(candidate.instanceId), true); }));
}
function finish(profile: FixtureWorkshopProfile, commandId: string, action: FixtureWorkshopReceipt['action'], next: Omit<FixtureWorkshopProfile, 'version' | 'revision' | 'receipts'>, outputIds: readonly string[] = []): FixtureWorkshopProfile {
  const revision = profile.revision + 1;
  return freezeProfile({ ...next, revision, receipts: [...profile.receipts, { commandId, action, revision, outputIds }] });
}
function reject(profile: FixtureWorkshopProfile, reason: string): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean; reason: string; receipt?: FixtureWorkshopReceipt }> { return Object.freeze({ profile, applied: false, reason }); }
/** Pure transaction preparation. A caller must persist result.profile before publishing it. */
export function commitFixtureWorkshop(profile: FixtureWorkshopProfile, command: FixtureWorkshopCommand): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean; reason?: string; receipt?: FixtureWorkshopReceipt }> {
  if (command.profileId !== undefined && command.profileId !== profile.profileId) return reject(profile, 'wrong-profile');
  const prior = profile.receipts.find(receipt => receipt.commandId === command.commandId);
  if (prior) return Object.freeze({ profile, applied: false, reason: 'duplicate-command', receipt: prior });
  if (!command.commandId) return reject(profile, 'missing-command');
  if (command.expectedRevision !== profile.revision) return reject(profile, 'stale-revision');
  if (!legalSlots(profile)) return reject(profile, 'invalid-assignments');
  const wallet = profile.wallet;
  const next = (patch: Partial<Pick<FixtureWorkshopProfile, 'wallet' | 'parts' | 'gunSlots' | 'claims' | 'discoveries'>>, outputIds: readonly string[] = []) => {
    const result = finish(profile, command.commandId, command.action, { profileId: profile.profileId, definitionVersion: profile.definitionVersion, rulesVersion: profile.rulesVersion, wallet: patch.wallet ?? wallet, manifest: profile.manifest, standing: profile.standing, houDossier: profile.houDossier, fluxQualificationRemainder: profile.fluxQualificationRemainder, progressionAwardedEventIds: profile.progressionAwardedEventIds, parts: patch.parts ?? profile.parts, gunSlots: patch.gunSlots ?? profile.gunSlots, claims: patch.claims ?? profile.claims, discoveries: patch.discoveries ?? profile.discoveries, knownSchematics: profile.knownSchematics, capabilities: profile.capabilities, attempts: profile.attempts, paidEventIds: profile.paidEventIds }, outputIds);
    return Object.freeze({ profile: result, applied: true, receipt: result.receipts.at(-1)! });
  };
  if (command.action === 'discover-h2') return profile.discoveries.includes('INT-LOOT-01') ? reject(profile, 'already-discovered') : next({ discoveries: [...profile.discoveries, 'INT-LOOT-01'] });
  if (command.action === 'buy-f2') {
    if (!profile.manifest.factoryOfferIds.includes('INT-B1-OFFER-TAB-F2')) return reject(profile, 'offer-unavailable');
    // The canonical catalogue is permanently available after its milestone,
    // but this B1 fixture binds only one unit of stock. Do not claim it sold
    // out or invent a replenishment schedule while later stock gates remain
    // unbound.
    if (profile.receipts.some(receipt => receipt.action === 'buy-f2')) return reject(profile, 'additional-fixture-stock-unbound');
    if (wallet.credits < 1650) return reject(profile, 'insufficient-credits');
    const output: FixturePart = { instanceId: `INT-B1-TAB-F2-${command.commandId}`, kind: 'F2', family: 'TAB', slot: 'F', protectedBaseline: false, sealedFactory: true, tier: null, refinement: null, maker: 'Rivetwake Heavy Works', provenance: 'fixture factory offer', version: 1 };
    return next({ wallet: { ...wallet, credits: wallet.credits - 1650 }, parts: [...profile.parts, output] }, [output.instanceId]);
  }
  if (command.action === 'claim-h2') {
    if (!profile.discoveries.includes('INT-LOOT-01')) return reject(profile, 'undiscovered-loot');
    if (profile.claims.includes('INT-LOOT-01')) return reject(profile, 'already-claimed');
    const output: FixturePart = { instanceId: 'INT-B1-HOU-H2-LOOT', kind: 'H2', family: 'HOU', slot: 'H', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Kestrel Cut Assembly', provenance: 'integration loot fixture', version: 1 };
    return next({ parts: [...profile.parts, output], claims: [...profile.claims, 'INT-LOOT-01'] }, [output.instanceId]);
  }
  if (command.action === 'sell-h2') { const target = part(profile, 'INT-B1-HOU-H2-LOOT'); return !target || assigned(profile, target.instanceId) || target.protectedBaseline ? reject(profile, 'not-sellable') : next({ wallet: { ...wallet, credits: wallet.credits + 540 }, parts: profile.parts.filter(candidate => candidate.instanceId !== target.instanceId) }); }
  if (command.action === 'build-b3') {
    if (!profile.knownSchematics.includes('TAB-B3')) return reject(profile, 'unknown-schematic');
    if (wallet.credits < 1000 || wallet.metal < 40 || wallet.circuits < 8) return reject(profile, 'insufficient-resources');
    const output: FixturePart = { instanceId: `INT-B1-TAB-B3-${command.commandId}`, kind: 'B3', family: 'TAB', slot: 'B', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Oddlot Cooperative', provenance: 'fixture workshop build', workshopStamp: { serviceId: profile.manifest.serviceId, commandId: command.commandId, definitionVersion: profile.definitionVersion, rulesVersion: profile.rulesVersion }, version: 1 };
    return next({ wallet: { ...wallet, credits: wallet.credits - 1000, metal: wallet.metal - 40, circuits: wallet.circuits - 8 }, parts: [...profile.parts, output] }, [output.instanceId]);
  }
  if (command.action === 'develop-b2') { const target = part(profile, 'INT-B1-TAB-B2-GIFT'); if (!profile.knownSchematics.includes('TAB-B2') || !profile.capabilities.includes('T2') || !target || target.sealedFactory || target.protectedBaseline || target.tier !== 1 || wallet.credits < 500 || wallet.metal < 20 || wallet.circuits < 4) return reject(profile, 'ineligible-develop'); return next({ wallet: { ...wallet, credits: wallet.credits - 500, metal: wallet.metal - 20, circuits: wallet.circuits - 4 }, parts: profile.parts.map(candidate => candidate.instanceId === target.instanceId ? { ...candidate, tier: 2, version: candidate.version + 1 } : candidate) }); }
  const expectedKind = command.action === 'fit-f2-a' ? 'F2' : 'B3';
  const target = command.partInstanceId ? part(profile, command.partInstanceId) : undefined;
  if (!target || target.kind !== expectedKind || target.family !== 'TAB') return reject(profile, 'exact-part-required');
  const gunSlots: SlotMap = structuredClone(profile.gunSlots);
  gunSlots['TAB-A'][target.slot] = target.instanceId;
  const candidate = freezeProfile({ ...profile, gunSlots });
  return !legalSlots(candidate) ? reject(profile, 'invalid-fit') : next({ gunSlots });
}
/** Save boundary for UI adapters: callers may publish only the returned profile. */
export function commitAndPersistFixtureWorkshop(profile: FixtureWorkshopProfile, command: FixtureWorkshopCommand, persist: (candidate: FixtureWorkshopProfile) => void): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean; reason?: string; receipt?: FixtureWorkshopReceipt }> {
  const result = commitFixtureWorkshop(profile, command);
  if (!result.applied) return result;
  try { persist(result.profile); }
  catch { return Object.freeze({ profile, applied: false, reason: 'storage-failed' }); }
  return result;
}
export function settleFixtureWorkshopMission(profile: FixtureWorkshopProfile, commandId: string): Readonly<{ profile: FixtureWorkshopProfile; applied: boolean }> {
  const prior = profile.receipts.find(receipt => receipt.commandId === commandId);
  if (prior) return Object.freeze({ profile, applied: false });
  const result = finish(profile, commandId, 'mission', { profileId: profile.profileId, definitionVersion: profile.definitionVersion, rulesVersion: profile.rulesVersion, wallet: { ...profile.wallet, credits: profile.wallet.credits + 1000, metal: profile.wallet.metal + 20, circuits: profile.wallet.circuits + 4, cloth: profile.wallet.cloth + 6 }, manifest: profile.manifest, standing: profile.standing, houDossier: profile.houDossier, fluxQualificationRemainder: profile.fluxQualificationRemainder, progressionAwardedEventIds: profile.progressionAwardedEventIds, parts: profile.parts, gunSlots: profile.gunSlots, claims: profile.claims, discoveries: profile.discoveries, knownSchematics: profile.knownSchematics, capabilities: profile.capabilities, attempts: profile.attempts, paidEventIds: profile.paidEventIds });
  return Object.freeze({ profile: result, applied: true });
}

/** Input to the human auto-target policy. Selection never searches hidden weak points. */
export interface AutoTargetCandidate {
  readonly actorId: string;
  readonly revealed: boolean;
  readonly ballisticLineOfSight: boolean;
  readonly inRange: boolean;
  /** Used only to select the nearest lawful body anchor when no target is owned/retained. */
  readonly muzzleToBodyAnchorMetres: number;
  /** Carried separately: shot range/falloff uses this actual first-contact distance. */
  readonly muzzleToFirstContactMetres: number;
}

export interface AutoTargetRequest {
  readonly ownedDesignationId?: string;
  readonly retainedTargetId?: string;
  readonly candidates: readonly AutoTargetCandidate[];
}

/**
 * A revealed, legal ballistic target is required. A walkable path never makes
 * a candidate eligible. Selection uses the ordinary body anchor. The actual
 * first contact is intentionally not consulted here; the combat resolver uses
 * it later for range/falloff. Stable-ID is the reproducible secondary key.
 */
export function selectHumanAutoTarget(request: Readonly<AutoTargetRequest>): AutoTargetCandidate | undefined {
  const legal = request.candidates.filter(candidate => candidate.revealed
    && candidate.ballisticLineOfSight && candidate.inRange
    && Number.isFinite(candidate.muzzleToBodyAnchorMetres) && candidate.muzzleToBodyAnchorMetres >= 0);
  const findLegal = (id: string | undefined): AutoTargetCandidate | undefined => legal.find(candidate => candidate.actorId === id);
  return findLegal(request.ownedDesignationId)
    ?? findLegal(request.retainedTargetId)
    ?? [...legal].sort((left, right) => left.muzzleToBodyAnchorMetres - right.muzzleToBodyAnchorMetres
      || (left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0))[0];
}

export function validateIntegratedFixture(): readonly string[] {
  const errors: string[] = [];
  const surfaces = new Map(INTEGRATED_FIXTURE_SURFACES.map(surface => [surface.id, surface]));
  const points = new Set<string>();
  for (const surface of INTEGRATED_FIXTURE_SURFACES) {
    if (surface.x < 0 || surface.z < 0 || surface.width < INTEGRATED_FIXTURE_REQUIRED_PATH_WIDTH_METRES
      || surface.depth < INTEGRATED_FIXTURE_REQUIRED_PATH_WIDTH_METRES
      || surface.x + surface.width > INTEGRATED_FIXTURE_ENVELOPE.widthMetres
      || surface.z + surface.depth > INTEGRATED_FIXTURE_ENVELOPE.heightMetres) errors.push(`invalid-surface:${surface.id}`);
  }
  for (const point of INTEGRATED_FIXTURE_POINTS) {
    const surface = surfaces.get(point.surfaceId);
    if (points.has(point.id)) errors.push(`duplicate-point:${point.id}`);
    points.add(point.id);
    if (!surface || point.x < surface.x || point.x > surface.x + surface.width || point.z < surface.z || point.z > surface.z + surface.depth) errors.push(`invalid-point:${point.id}`);
  }
  for (const job of INTEGRATED_FIXTURE_JOBS) {
    if (!surfaces.has(job.pocketSurfaceId) || !points.has(job.extractionPointId)
      || job.requiredInteractionIds.some(id => !points.has(id))) errors.push(`invalid-job:${job.id}`);
  }
  if (!INTEGRATED_FIXTURE_SURFACES.some(surface => surface.kind === 'bridge') || !INTEGRATED_FIXTURE_SURFACES.some(surface => surface.kind === 'underpass')) errors.push('missing-layered-overlap');
  return Object.freeze(errors);
}

/** Contact damage is full through fullRange, then linearly falls to half at maxRange. */
export function fixtureRangeDamage(distanceMetres: number, rawDamage: number, fullRange = 12, maxRange = 24): number {
  if (!Number.isFinite(distanceMetres) || !Number.isFinite(rawDamage) || distanceMetres < 0
    || fullRange < 0 || maxRange < fullRange || distanceMetres > maxRange) return 0;
  const factor = distanceMetres <= fullRange || maxRange === fullRange
    ? 1
    : 1 - 0.5 * ((distanceMetres - fullRange) / (maxRange - fullRange));
  return rawDamage * factor;
}

/** A world coordinate carries its deck.  Omitted layers are legacy ground
 * coordinates; newly written combat checkpoints always store it explicitly. */
export interface FixturePosition { readonly x: number; readonly z: number; readonly layer?: FixtureLayer; }

const FIXTURE_GROUND: FixtureLayer = 'ground';
const FIXTURE_ELEVATED: FixtureLayer = 'elevated';
const RAMP_TRANSITION_Z = 16;

function fixtureLayer(position: FixturePosition): FixtureLayer { return position.layer ?? FIXTURE_GROUND; }
function freezeFixturePosition(position: FixturePosition): FixturePosition {
  return Object.freeze({ x: position.x, z: position.z, layer: fixtureLayer(position) });
}
function pointInFixtureSurface(position: FixturePosition, surface: FixtureSurface): boolean {
  return position.x >= surface.x && position.x <= surface.x + surface.width
    && position.z >= surface.z && position.z <= surface.z + surface.depth;
}
function surfaceSupportsFixtureLayer(surface: FixtureSurface, position: FixturePosition, layer: FixtureLayer): boolean {
  if (!pointInFixtureSurface(position, surface)) return false;
  if (surface.kind === 'bridge') return layer === FIXTURE_ELEVATED;
  // z=16 belongs to the elevated deck. Keeping the boundary single-owned
  // makes ground→elevated and elevated→ground traversal deterministic.
  if (surface.kind === 'ramp') return layer === FIXTURE_GROUND
    ? position.z < RAMP_TRANSITION_Z
    : position.z >= RAMP_TRANSITION_Z;
  return layer === FIXTURE_GROUND;
}
function transitionFixtureLayer(from: FixturePosition, candidate: FixturePosition): FixtureLayer {
  const current = fixtureLayer(from);
  const ramp = INTEGRATED_FIXTURE_SURFACES.find(surface => surface.kind === 'ramp');
  if (!ramp || !pointInFixtureSurface(candidate, ramp)) return current;
  if (current === FIXTURE_GROUND && from.z < RAMP_TRANSITION_Z && candidate.z >= RAMP_TRANSITION_Z) return FIXTURE_ELEVATED;
  if (current === FIXTURE_ELEVATED && candidate.z < RAMP_TRANSITION_Z) return FIXTURE_GROUND;
  return current;
}
function fixturePositionInBounds(position: FixturePosition, bodyRadius: number): boolean {
  return position.x >= bodyRadius && position.z >= bodyRadius
    && position.x <= INTEGRATED_FIXTURE_ENVELOPE.widthMetres - bodyRadius
    && position.z <= INTEGRATED_FIXTURE_ENVELOPE.heightMetres - bodyRadius;
}
function fixturePositionHitsSolid(position: FixturePosition, bodyRadius: number): boolean {
  const layer = fixtureLayer(position);
  return INTEGRATED_FIXTURE_OCCLUDERS.some(occluder => (occluder.layer ?? FIXTURE_GROUND) === layer
    && position.x >= occluder.x - bodyRadius && position.x <= occluder.x + occluder.width + bodyRadius
    && position.z >= occluder.z - bodyRadius && position.z <= occluder.z + occluder.depth + bodyRadius);
}

/** Returns whether a body centre occupies one of the authored deck surfaces.
 * The union is tested before body solids so touching surface rectangles keep
 * their intended route connected instead of producing artificial seam gaps. */
export function isFixtureTerrainPositionWalkable(position: FixturePosition, bodyRadius = INTEGRATED_FIXTURE_BODY_DIAMETER_METRES / 2): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z) || !Number.isFinite(bodyRadius) || bodyRadius < 0) return false;
  const normalized = freezeFixturePosition(position);
  return fixturePositionInBounds(normalized, bodyRadius)
    && INTEGRATED_FIXTURE_SURFACES.some(surface => surfaceSupportsFixtureLayer(surface, normalized, normalized.layer!))
    && !fixturePositionHitsSolid(normalized, bodyRadius);
}

export interface FixtureTerrainMove {
  readonly position: FixturePosition;
  readonly blocked: boolean;
  readonly transitioned: boolean;
}

/** Sweeps small deterministic steps through the authored route union.  On a
 * solid contact it attempts legal axis slides, never bounds-only clamping. */
export function moveFixtureTerrainPosition(from: FixturePosition, desired: FixturePosition, bodyRadius = INTEGRATED_FIXTURE_BODY_DIAMETER_METRES / 2): FixtureTerrainMove {
  const start = freezeFixturePosition(from);
  if (!isFixtureTerrainPositionWalkable(start, bodyRadius) || !Number.isFinite(desired.x) || !Number.isFinite(desired.z)) {
    return Object.freeze({ position: start, blocked: true, transitioned: false });
  }
  const dx = desired.x - start.x;
  const dz = desired.z - start.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
  let position = start;
  let blocked = false;
  let transitioned = false;
  const tryStep = (x: number, z: number): FixturePosition | undefined => {
    const layer = transitionFixtureLayer(position, { x, z, layer: fixtureLayer(position) });
    const candidate = freezeFixturePosition({ x, z, layer });
    return isFixtureTerrainPositionWalkable(candidate, bodyRadius) ? candidate : undefined;
  };
  for (let step = 1; step <= steps; step += 1) {
    const x = start.x + dx * step / steps;
    const z = start.z + dz * step / steps;
    const direct = tryStep(x, z);
    let accepted = direct;
    if (!accepted) {
      const slideX = tryStep(x, position.z);
      const slideZ = tryStep(position.x, z);
      // A stationary axis candidate is not a slide. Accepting it would let a
      // later interpolation step tunnel through a solid that stopped us.
      accepted = slideX && (slideX.x !== position.x || slideX.z !== position.z) ? slideX
        : slideZ && (slideZ.x !== position.x || slideZ.z !== position.z) ? slideZ
          : undefined;
    }
    if (!accepted) { blocked = true; break; }
    if (accepted.layer !== position.layer) transitioned = true;
    position = accepted;
    if (!direct) blocked = true;
  }
  return Object.freeze({ position, blocked, transitioned });
}

export function fixturePointLayer(point: FixturePoint): FixtureLayer | undefined {
  const surface = INTEGRATED_FIXTURE_SURFACES.find(candidate => candidate.id === point.surfaceId);
  if (!surface) return undefined;
  if (surface.kind === 'bridge') return FIXTURE_ELEVATED;
  if (surface.kind === 'ramp') return point.z >= RAMP_TRANSITION_Z ? FIXTURE_ELEVATED : FIXTURE_GROUND;
  return FIXTURE_GROUND;
}

export function fixturePositionsShareLayer(left: FixturePosition, right: FixturePosition): boolean {
  return fixtureLayer(left) === fixtureLayer(right);
}
export type FixtureCombatantId = 'tabby' | 'hound' | 'r01-a' | 'r01-b' | 'f01-a' | 'f01-b';
export interface FixtureWeaponSnapshot { readonly supply: number; readonly nextShotSeconds: number; readonly refillRemaining: number; /** Legacy snapshots begin at the first shot. */ readonly shotOffsetIndex?: number; }
export interface FixtureCombatActorSnapshot {
  readonly id: FixtureCombatantId;
  readonly position: FixturePosition;
  readonly health: number;
  readonly maxHealth: number;
  readonly activeGunIndex: number;
  readonly weapons: readonly FixtureWeaponSnapshot[];
}
export interface FixtureCombatSnapshot {
  readonly controlledActor: 'tabby' | 'hound';
  readonly actors: readonly FixtureCombatActorSnapshot[];
}
export interface FixtureCombatEvent {
  readonly type: 'weapon-fired' | 'enemy-damaged' | 'enemy-defeated' | 'actor-damaged' | 'actor-defeated';
  readonly sourceId: FixtureCombatantId;
  readonly targetId: FixtureCombatantId;
  readonly damage?: number;
  readonly targetHealth?: number;
  /** B3 rotates one fired round through its authored lateral offsets. */
  readonly shotOffsetDegrees?: number;
}

interface FixtureWeaponProfile {
  readonly id: string; readonly damage: number; readonly cycleSeconds: number;
  readonly initialSetupSeconds: number; readonly fullRangeMetres: number; readonly maxRangeMetres: number; readonly store: number; readonly refillSeconds: number; readonly shotOffsetDegrees: readonly number[]; readonly contactWidthMetres: number;
}
export interface FixtureResolvedGunProfile { readonly gunId: FixtureGunId; readonly store: number; readonly refillSeconds: number; readonly fullRangeMetres: number; readonly maxRangeMetres: number; readonly setupSeconds: number; readonly coneMultiplier: number; readonly contactWidthMetres: number; readonly shotOffsetDegrees: readonly number[]; }
/** Reads the actual six-slot assignment; no workshop choice may alter damage. */
export function resolveFixtureGunProfile(profile: FixtureWorkshopProfile, gunId: FixtureGunId): FixtureResolvedGunProfile {
  const barrel = part(profile, profile.gunSlots[gunId].B)!;
  const feed = part(profile, profile.gunSlots[gunId].F)!;
  const structuralRange = barrel.kind === 'B2' ? 1.25 : barrel.kind === 'B3' ? .7 : 1;
  // Engineering is .03 per tier step: B2 T2 is one step (1.25 × 1.03),
  // while the late-fixture T3 vector carries two steps (1.25 × 1.06).
  const engineeringRange = barrel.kind === 'B2' && barrel.tier === 2 ? .03 : 0;
  const round = (value: number) => Math.round(value * 1e12) / 1e12;
  return Object.freeze({ gunId, store: feed.kind === 'F2' ? 18 : 12, refillSeconds: feed.kind === 'F2' ? 2.7 : 1.5,
    fullRangeMetres: round(12 * structuralRange * (1 + Math.min(.40, engineeringRange))), maxRangeMetres: round(24 * structuralRange * (1 + Math.min(.40, engineeringRange))),
    setupSeconds: .1 * (barrel.kind === 'B2' ? 1.25 : 1), coneMultiplier: barrel.kind === 'B2' ? .65 : barrel.kind === 'B3' ? 1.6 : 1, contactWidthMetres: barrel.kind === 'B2' ? .02 : barrel.kind === 'B3' ? .24 : .1,
    shotOffsetDegrees: Object.freeze(barrel.kind === 'B3' ? [-6, 0, 6] : [0]) });
}
interface FixtureWeaponState { readonly instanceId: string; readonly profile: FixtureWeaponProfile; supply: number; nextShotSeconds: number; refillRemaining: number; shotOffsetIndex: number; }
interface FixtureActorState {
  readonly id: FixtureCombatantId; readonly team: 'squad' | 'hostile';
  position: FixturePosition; health: number; maxHealth: number; readonly radius: number;
  retainedTargetId?: FixtureCombatantId; readonly weapons: FixtureWeaponState[]; activeGunIndex: number;
}

const TABBY_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'TAB-service-pistol', damage: 30, cycleSeconds: 0.25, initialSetupSeconds: 0.1, fullRangeMetres: 12, maxRangeMetres: 24, store: 12, refillSeconds: 1.5, shotOffsetDegrees: Object.freeze([0]), contactWidthMetres: .1,
});
const HOUND_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'HOU-service-coil-smg', damage: 14, cycleSeconds: 0.1, initialSetupSeconds: 0.1, fullRangeMetres: 8, maxRangeMetres: 18, store: 30, refillSeconds: 1.5, shotOffsetDegrees: Object.freeze([0]), contactWidthMetres: .1,
});
const HOSTILE_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'fixture-hostile-rifle', damage: 7, cycleSeconds: 1, initialSetupSeconds: 0.5, fullRangeMetres: 10, maxRangeMetres: 16, store: 99, refillSeconds: 1.5, shotOffsetDegrees: Object.freeze([0]), contactWidthMetres: .1,
});

function expectedFixtureCombatants(jobId: FixtureJobId): readonly FixtureCombatantId[] {
  return jobId === 'MC-OPT-R01-01' ? ['tabby', 'hound', 'r01-a', 'r01-b'] : ['tabby', 'hound', 'f01-a', 'f01-b'];
}
function validFixtureCombatSnapshot(value: unknown, jobId: FixtureJobId, finiteEnemyGroupCleared: boolean): value is FixtureCombatSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<FixtureCombatSnapshot>;
  if ((snapshot.controlledActor !== 'tabby' && snapshot.controlledActor !== 'hound') || !Array.isArray(snapshot.actors)) return false;
  const expected = expectedFixtureCombatants(jobId);
  if (snapshot.actors.length !== expected.length) return false;
  const seen = new Set<string>();
  return snapshot.actors.every((actor): actor is FixtureCombatActorSnapshot => {
    const weapons = actor?.weapons;
    const hostile = actor?.id !== 'tabby' && actor?.id !== 'hound';
    const weaponCount = hostile ? 1 : 2;
    return !!actor && expected.includes(actor.id) && !seen.has(actor.id) && (seen.add(actor.id), true)
      && Number.isFinite(actor.position?.x) && Number.isFinite(actor.position?.z)
      && actor.position.x >= 0 && actor.position.x <= INTEGRATED_FIXTURE_ENVELOPE.widthMetres
      && actor.position.z >= 0 && actor.position.z <= INTEGRATED_FIXTURE_ENVELOPE.heightMetres
      && (actor.position.layer === undefined || actor.position.layer === FIXTURE_GROUND || actor.position.layer === FIXTURE_ELEVATED)
      && Number.isFinite(actor.maxHealth) && actor.maxHealth > 0 && actor.maxHealth <= 10_000
      && Number.isFinite(actor.health) && actor.health >= 0 && actor.health <= actor.maxHealth
      && Number.isInteger(actor.activeGunIndex) && actor.activeGunIndex >= 0 && actor.activeGunIndex < weaponCount
      && Array.isArray(weapons) && weapons.length === weaponCount
      && weapons.every(weapon => Number.isFinite(weapon.supply) && weapon.supply >= 0 && weapon.supply <= 1_000
        && Number.isFinite(weapon.nextShotSeconds) && weapon.nextShotSeconds >= 0 && weapon.nextShotSeconds <= 10
        && Number.isFinite(weapon.refillRemaining) && weapon.refillRemaining >= 0 && weapon.refillRemaining <= 10
        && (weapon.shotOffsetIndex === undefined || (Number.isInteger(weapon.shotOffsetIndex) && weapon.shotOffsetIndex >= 0 && weapon.shotOffsetIndex <= 2)))
      && (!finiteEnemyGroupCleared || !hostile || actor.health === 0);
  });
}
function freezeFixtureCombatSnapshot(snapshot: FixtureCombatSnapshot): FixtureCombatSnapshot {
  return Object.freeze({ controlledActor: snapshot.controlledActor, actors: Object.freeze(snapshot.actors.map(actor => Object.freeze({
    id: actor.id,
    position: freezeFixturePosition(actor.position),
    health: actor.health,
    maxHealth: actor.maxHealth,
    activeGunIndex: actor.activeGunIndex,
    weapons: Object.freeze(actor.weapons.map(weapon => Object.freeze({ ...weapon }))),
  }))) });
}

function segmentIntersectsOccluder(from: FixturePosition, to: FixturePosition, box: FixtureOccluder): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, low, high] of [[from.x, dx, box.x, box.x + box.width], [from.z, dz, box.z, box.z + box.depth]] as const) {
    if (delta === 0) { if (origin >= low && origin <= high) continue; return false; }
    const first = (low - origin) / delta;
    const second = (high - origin) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return false;
  }
  return exit >= 0 && enter <= 1;
}

export function hasFixtureBallisticLineOfSight(from: FixturePosition, to: FixturePosition): boolean {
  const layer = fixtureLayer(from);
  return fixturePositionsShareLayer(from, to)
    && !INTEGRATED_FIXTURE_OCCLUDERS.some(occluder => (occluder.layer ?? FIXTURE_GROUND) === layer && segmentIntersectsOccluder(from, to, occluder));
}

/**
 * Small deterministic combat owner for the isolated slice. Phaser only moves
 * and renders actors; this owner decides targeting, cadence, damage and death.
 */
export class IntegratedFixtureCombat {
  private readonly actors = new Map<FixtureCombatantId, FixtureActorState>();
  private readonly events: FixtureCombatEvent[] = [];
  private ownedDesignationId?: FixtureCombatantId;

  constructor(profile = createIntegratedFixtureWorkshopProfile()) {
    const weaponFor = (gunId: FixtureGunId): FixtureWeaponProfile => { const resolved = resolveFixtureGunProfile(profile, gunId); return { ...TABBY_FIXTURE_GUN, id: `int-fb:${gunId}`, store: resolved.store, refillSeconds: resolved.refillSeconds, initialSetupSeconds: resolved.setupSeconds, fullRangeMetres: resolved.fullRangeMetres, maxRangeMetres: resolved.maxRangeMetres, contactWidthMetres: resolved.contactWidthMetres, shotOffsetDegrees: resolved.shotOffsetDegrees }; };
    const tabA = weaponFor('TAB-A'); const tabB = weaponFor('TAB-B');
    this.add('tabby', 'squad', { x: 8, z: 11 }, 100, 0.4, tabA);
    this.actors.get('tabby')!.weapons.push({ instanceId: 'int-fb:TAB-B', profile: tabB, supply: tabB.store, nextShotSeconds: tabB.initialSetupSeconds, refillRemaining: 0, shotOffsetIndex: 0 });
    this.add('hound', 'squad', { x: 6.5, z: 11 }, 100, 0.4, HOUND_FIXTURE_GUN, 2);
  }

  private add(id: FixtureCombatantId, team: 'squad' | 'hostile', position: FixturePosition, health: number, radius: number, weapon?: FixtureWeaponProfile, gunCount = 1): void {
    const weapons = weapon ? Array.from({ length: gunCount }, (_, index) => ({ instanceId: `int-fb:${id}:gun-${index + 1}`, profile: weapon, supply: weapon.store, nextShotSeconds: weapon.initialSetupSeconds, refillRemaining: 0, shotOffsetIndex: 0 })) : [];
    this.actors.set(id, { id, team, position: freezeFixturePosition(position), health, maxHealth: health, radius, weapons, activeGunIndex: 0 });
  }

  public beginJob(jobId: FixtureJobId): void {
    for (const actor of [...this.actors.values()]) if (actor.team === 'hostile') this.actors.delete(actor.id);
    const prefix = jobId === 'MC-OPT-R01-01' ? 'r01' : 'f01';
    const locations = jobId === 'MC-OPT-R01-01' ? [{ x: 37, z: 38 }, { x: 37, z: 42 }] : [{ x: 67, z: 39 }, { x: 67, z: 44 }];
    this.add(`${prefix}-a` as FixtureCombatantId, 'hostile', locations[0]!, 90, 0.4, HOSTILE_FIXTURE_GUN);
    this.add(`${prefix}-b` as FixtureCombatantId, 'hostile', locations[1]!, 90, 0.4, HOSTILE_FIXTURE_GUN);
    this.ownedDesignationId = undefined;
  }
  /** Reload only persists the finite-clear fact, so restore it without reviving
   * a group that was already durably cleared. */
  public restoreJob(jobId: FixtureJobId, finiteGroupCleared: boolean): void {
    this.beginJob(jobId);
    if (!finiteGroupCleared) return;
    for (const actor of this.actors.values()) if (actor.team === 'hostile') actor.health = 0;
  }

  public setSquadPositions(tabby: FixturePosition, hound: FixturePosition): void {
    this.actors.get('tabby')!.position = freezeFixturePosition(tabby);
    this.actors.get('hound')!.position = freezeFixturePosition(hound);
  }
  /** Durable checkpoint containing every combatant needed to resume this exact attempt. */
  public snapshot(controlledActor: 'tabby' | 'hound'): FixtureCombatSnapshot {
    return freezeFixtureCombatSnapshot({ controlledActor, actors: [...this.actors.values()].map(actor => ({
      id: actor.id,
      position: freezeFixturePosition(actor.position),
      health: actor.health,
      maxHealth: actor.maxHealth,
      activeGunIndex: actor.activeGunIndex,
      weapons: actor.weapons.map(weapon => ({ supply: weapon.supply, nextShotSeconds: weapon.nextShotSeconds, refillRemaining: weapon.refillRemaining, shotOffsetIndex: weapon.shotOffsetIndex })),
    })) });
  }
  /** Restores only a validated snapshot matching the job's authored roster. */
  public restore(snapshot: FixtureCombatSnapshot, jobId: FixtureJobId, finiteEnemyGroupCleared: boolean): boolean {
    if (!validFixtureCombatSnapshot(snapshot, jobId, finiteEnemyGroupCleared)) return false;
    const expected = expectedFixtureCombatants(jobId);
    if (this.actors.size !== expected.length || expected.some(id => !this.actors.has(id))) return false;
    for (const saved of snapshot.actors) {
      const actor = this.actors.get(saved.id)!;
      if (actor.weapons.length !== saved.weapons.length) return false;
      actor.position = freezeFixturePosition(saved.position);
      actor.maxHealth = saved.maxHealth;
      actor.health = saved.health;
      actor.activeGunIndex = saved.activeGunIndex;
      saved.weapons.forEach((weapon, index) => {
        const target = actor.weapons[index]!;
        target.supply = weapon.supply;
        target.nextShotSeconds = weapon.nextShotSeconds;
        target.refillRemaining = weapon.refillRemaining;
        target.shotOffsetIndex = (weapon.shotOffsetIndex ?? 0) % target.profile.shotOffsetDegrees.length;
      });
    }
    this.ownedDesignationId = undefined;
    this.events.length = 0;
    return true;
  }
  public designate(targetId: FixtureCombatantId | undefined): void { this.ownedDesignationId = targetId; }
  /** Exactly one equipped gun is active. Stored supply and cadence belong to each instance. */
  public swapActiveGun(id: 'tabby' | 'hound'): boolean {
    const actor = this.actors.get(id);
    if (!actor || actor.weapons.length < 2 || actor.health <= 0) return false;
    actor.activeGunIndex = (actor.activeGunIndex + 1) % actor.weapons.length;
    const incoming = actor.weapons[actor.activeGunIndex]!;
    incoming.nextShotSeconds = Math.max(incoming.nextShotSeconds, 0.30);
    return true;
  }
  public activeGun(id: 'tabby' | 'hound'): Readonly<{ instanceId: string; supply: number }> {
    const gun = this.actors.get(id)!.weapons[this.actors.get(id)!.activeGunIndex]!;
    return Object.freeze({ instanceId: gun.instanceId, supply: gun.supply });
  }
  public isGroupCleared(): boolean { return ![...this.actors.values()].some(actor => actor.team === 'hostile' && actor.health > 0); }
  public actorHealth(id: FixtureCombatantId): number { return this.actors.get(id)?.health ?? 0; }
  /** Test fixture only: keeps a valid authored hostile contact alive for cadence/refill proofs. */
  public setFixtureHostileHealth(id: FixtureCombatantId, health: number): void { const actor = this.actors.get(id); if (actor?.team === 'hostile' && Number.isFinite(health) && health >= 0 && health <= 10_000) { if (health > 0) actor.maxHealth = health; actor.health = health; } }
  /** Test fixture only: drives the real scene recovery branch without faking its persistence. */
  public setFixtureSquadHealth(id: 'tabby' | 'hound', health: number): void { const actor = this.actors.get(id); if (actor && Number.isFinite(health) && health >= 0) actor.health = Math.min(actor.maxHealth, health); }
  public hostileStates(): readonly Readonly<{ id: FixtureCombatantId; position: FixturePosition; health: number }>[] {
    return Object.freeze([...this.actors.values()].filter(actor => actor.team === 'hostile').map(actor => Object.freeze({ id: actor.id, position: freezeFixturePosition(actor.position), health: actor.health })));
  }
  public drainEvents(): readonly FixtureCombatEvent[] { const value = Object.freeze([...this.events]); this.events.length = 0; return value; }

  public advance(deltaSeconds: number): readonly FixtureCombatEvent[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.drainEvents();
    for (const actor of this.actors.values()) {
      const gun = actor.weapons[actor.activeGunIndex];
      if (!gun || actor.health <= 0) continue;
      if (gun.refillRemaining > 0) { gun.refillRemaining -= deltaSeconds; if (gun.refillRemaining <= 0) { gun.refillRemaining = 0; gun.supply = gun.profile.store; gun.nextShotSeconds = Math.max(gun.nextShotSeconds, 0); } continue; }
      gun.nextShotSeconds -= deltaSeconds;
      while (gun.nextShotSeconds <= 0 && actor.health > 0) {
        const target = this.chooseTarget(actor);
        if (target && gun.supply > 0) this.fire(actor, target, gun);
        gun.nextShotSeconds += gun.profile.cycleSeconds;
      }
    }
    return this.drainEvents();
  }

  private chooseTarget(source: FixtureActorState): FixtureActorState | undefined {
    const opponents = [...this.actors.values()].filter(candidate => candidate.team !== source.team && candidate.health > 0);
    const candidates = opponents.map(candidate => {
      const anchor = Math.hypot(candidate.position.x - source.position.x, candidate.position.z - source.position.z);
      return { actorId: candidate.id, revealed: true, ballisticLineOfSight: hasFixtureBallisticLineOfSight(source.position, candidate.position),
        inRange: anchor <= source.weapons[source.activeGunIndex]!.profile.maxRangeMetres, muzzleToBodyAnchorMetres: anchor, muzzleToFirstContactMetres: Math.max(0, anchor - candidate.radius) };
    });
    const selected = selectHumanAutoTarget({
      ownedDesignationId: source.team === 'squad' ? this.ownedDesignationId : undefined,
      retainedTargetId: source.retainedTargetId,
      candidates,
    });
    if (!selected) return undefined;
    source.retainedTargetId = selected.actorId as FixtureCombatantId;
    return this.actors.get(selected.actorId as FixtureCombatantId);
  }

  private fire(source: FixtureActorState, target: FixtureActorState, gun: FixtureWeaponState): void {
    const anchor = Math.hypot(target.position.x - source.position.x, target.position.z - source.position.z);
    const damage = fixtureRangeDamage(Math.max(0, anchor - target.radius), gun.profile.damage, gun.profile.fullRangeMetres, gun.profile.maxRangeMetres);
    if (damage <= 0) return;
    const shotOffsetDegrees = gun.profile.shotOffsetDegrees[gun.shotOffsetIndex] ?? 0;
    gun.shotOffsetIndex = (gun.shotOffsetIndex + 1) % gun.profile.shotOffsetDegrees.length;
    gun.supply -= 1;
    if (gun.supply === 0) gun.refillRemaining = gun.profile.refillSeconds;
    const lateralMiss = Math.abs(Math.sin(shotOffsetDegrees * Math.PI / 180) * anchor) > target.radius + gun.profile.contactWidthMetres;
    this.events.push(Object.freeze({ type: 'weapon-fired', sourceId: source.id, targetId: target.id, damage: lateralMiss ? 0 : damage, shotOffsetDegrees }));
    if (lateralMiss) return;
    target.health = Math.max(0, target.health - damage);
    this.events.push(Object.freeze({
      type: target.team === 'hostile' ? 'enemy-damaged' : 'actor-damaged', sourceId: source.id, targetId: target.id, damage, targetHealth: target.health,
    }));
    if (target.health === 0) this.events.push(Object.freeze({ type: target.team === 'hostile' ? 'enemy-defeated' : 'actor-defeated', sourceId: source.id, targetId: target.id }));
  }
}
