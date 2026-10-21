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
}

export const INTEGRATED_FIXTURE_OCCLUDERS: readonly FixtureOccluder[] = deepFreeze([
  { id: 'INT-FB-R01-CRATE-WALL', x: 31, z: 37, width: 1.5, depth: 8 },
  { id: 'INT-FB-F01-LOT-SHED', x: 60, z: 42, width: 3, depth: 2 },
]);

export type FixtureJobId = 'MC-OPT-R01-01' | 'MC-OPT-F01-01';
export type FixtureSurfaceKind = 'safe' | 'road' | 'ramp' | 'bridge' | 'underpass' | 'tunnel' | 'pocket';

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
  { id: 'INT-FB-UNDERPASS-01', kind: 'underpass', x: 42, z: 20, width: 20, depth: 4, elevation: 0 },
  { id: 'INT-FB-TUNNEL-01', kind: 'tunnel', x: 62, z: 20, width: 14, depth: 6, elevation: 0 },
  { id: 'INT-FB-R01-POCKET', kind: 'pocket', x: 18, z: 34, width: 22, depth: 18, elevation: 0 },
  { id: 'INT-FB-F01-POCKET', kind: 'pocket', x: 48, z: 36, width: 24, depth: 18, elevation: 0 },
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
  public extract(): boolean {
    if (this.phase !== 'active' || !this.jobId) return false;
    const settled = operationCanSettle({ jobId: this.jobId, completedInteractionIds: [...this.completed], finiteEnemyGroupCleared: this.groupCleared, extractionConfirmed: true });
    if (settled) this.phase = 'settled';
    return settled;
  }
  public snapshot(): Readonly<{ jobId?: FixtureJobId; phase: FixtureOperationPhase; completedInteractionIds: readonly string[]; finiteEnemyGroupCleared: boolean }> {
    return Object.freeze({ jobId: this.jobId, phase: this.phase, completedInteractionIds: Object.freeze([...this.completed]), finiteEnemyGroupCleared: this.groupCleared });
  }
}

export const INTEGRATED_FIXTURE_SAVE_KEY = 'meowcenary:int-fb:v1';
export interface FixtureMissionReceipt {
  readonly id: string;
  readonly jobId: FixtureJobId;
  readonly recipientId: 'rcc-dispatch' | 'fre-broker';
  readonly credits: 1000;
  readonly metal: 20;
  readonly circuits: 4;
  readonly cloth: 6;
}
export interface FixtureMissionSave {
  readonly version: typeof INTEGRATED_FIXTURE_VERSION;
  readonly seed: 'int-fb-post-chapter-2';
  readonly receipts: readonly FixtureMissionReceipt[];
}
export function createIntegratedFixtureSave(): FixtureMissionSave {
  return Object.freeze({ version: INTEGRATED_FIXTURE_VERSION, seed: 'int-fb-post-chapter-2', receipts: Object.freeze([]) });
}
/** A settlement is source-receipt idempotent; it never writes the legacy save schema. */
export function settleIntegratedFixtureJob(save: FixtureMissionSave, jobId: FixtureJobId): Readonly<{ save: FixtureMissionSave; receipt: FixtureMissionReceipt; applied: boolean }> {
  const id = `int-fb:${jobId}:settlement`;
  const existing = save.receipts.find(receipt => receipt.id === id);
  if (existing) return Object.freeze({ save, receipt: existing, applied: false });
  const receipt: FixtureMissionReceipt = Object.freeze({ id, jobId, recipientId: jobId === 'MC-OPT-R01-01' ? 'rcc-dispatch' : 'fre-broker', credits: 1000, metal: 20, circuits: 4, cloth: 6 });
  const next = Object.freeze({ version: INTEGRATED_FIXTURE_VERSION, seed: 'int-fb-post-chapter-2' as const, receipts: Object.freeze([...save.receipts, receipt]) });
  return Object.freeze({ save: next, receipt, applied: true });
}
export function deserializeIntegratedFixtureSave(value: string | null): FixtureMissionSave {
  if (!value) return createIntegratedFixtureSave();
  try {
    const parsed = JSON.parse(value) as Partial<FixtureMissionSave>;
    if (parsed.version !== INTEGRATED_FIXTURE_VERSION || parsed.seed !== 'int-fb-post-chapter-2' || !Array.isArray(parsed.receipts)) return createIntegratedFixtureSave();
    const receipts = parsed.receipts.filter((receipt): receipt is FixtureMissionReceipt => Boolean(receipt) && typeof receipt.id === 'string'
      && (receipt.jobId === 'MC-OPT-R01-01' || receipt.jobId === 'MC-OPT-F01-01') && (receipt.recipientId === 'rcc-dispatch' || receipt.recipientId === 'fre-broker')
      && receipt.credits === 1000 && receipt.metal === 20 && receipt.circuits === 4 && receipt.cloth === 6);
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

export type FixtureRecoveryState = 'active' | 'takeover-required' | 'recovered' | 'lost';
/** The survivor must explicitly continue after lead KO; recovery never modifies durable gear. */
export function resolveFixtureTakeover(tabbyHealth: number, houndHealth: number, confirmed: boolean): FixtureRecoveryState {
  if (tabbyHealth > 0) return 'active';
  if (houndHealth <= 0) return 'lost';
  return confirmed ? 'recovered' : 'takeover-required';
}

export type FixturePartKind = 'R1' | 'B1' | 'F1' | 'P1' | 'H1' | 'C1' | 'B2' | 'F2' | 'H2' | 'B3';
export type FixtureGunId = 'TAB-A' | 'TAB-B' | 'HOU-A' | 'HOU-B';
export type FixtureSlot = 'R' | 'B' | 'F' | 'P' | 'H' | 'C';
export type FixtureWorkshopAction = 'buy-f2' | 'claim-h2' | 'sell-h2' | 'build-b3' | 'develop-b2' | 'fit-f2-a' | 'fit-b3-a';
export interface FixtureWallet { readonly credits: number; readonly metal: number; readonly circuits: number; readonly cloth: number; readonly flux: number; }
export interface FixturePart { readonly instanceId: string; readonly kind: FixturePartKind; readonly family: 'TAB' | 'HOU'; readonly slot: FixtureSlot; readonly protectedBaseline: boolean; readonly sealedFactory: boolean; readonly tier: 1 | 2 | null; readonly refinement: 'Balanced' | null; readonly maker: string; readonly provenance: string; readonly version: number; }
export interface FixtureWorkshopReceipt { readonly commandId: string; readonly action: FixtureWorkshopAction | 'mission'; readonly revision: number; readonly outputIds: readonly string[]; }
export interface FixtureWorkshopProfile { readonly version: 'int-fb-profile-v2'; readonly revision: number; readonly wallet: FixtureWallet; readonly parts: readonly FixturePart[]; readonly gunSlots: Readonly<Record<FixtureGunId, Readonly<Record<FixtureSlot, string>>>>; readonly claims: readonly string[]; readonly receipts: readonly FixtureWorkshopReceipt[]; }
export interface FixtureWorkshopCommand { readonly commandId: string; readonly expectedRevision: number; readonly action: FixtureWorkshopAction; }
type SlotMap = Record<FixtureGunId, Record<FixtureSlot, string>>;
const fixtureGuns: readonly FixtureGunId[] = ['TAB-A', 'TAB-B', 'HOU-A', 'HOU-B'];
const fixtureSlots: readonly FixtureSlot[] = ['R', 'B', 'F', 'P', 'H', 'C'];
const familyForGun = (gun: FixtureGunId): 'TAB' | 'HOU' => gun.slice(0, 3) as 'TAB' | 'HOU';
const freezeProfile = (profile: Omit<FixtureWorkshopProfile, 'version'>): FixtureWorkshopProfile => Object.freeze({ version: 'int-fb-profile-v2', ...profile, wallet: Object.freeze({ ...profile.wallet }), parts: Object.freeze(profile.parts.map(part => Object.freeze({ ...part }))), gunSlots: Object.freeze(Object.fromEntries(fixtureGuns.map(gun => [gun, Object.freeze({ ...profile.gunSlots[gun] })])) as FixtureWorkshopProfile['gunSlots']), claims: Object.freeze([...profile.claims]), receipts: Object.freeze(profile.receipts.map(receipt => Object.freeze({ ...receipt, outputIds: Object.freeze([...receipt.outputIds]) }))) });
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
  return freezeProfile({ revision: 0, wallet: { credits: 3000, metal: 80, circuits: 16, cloth: 12, flux: 3 }, parts, gunSlots, claims: [], receipts: [] });
}
/** Reject malformed/legacy envelopes rather than ever rewriting the normal game save. */
export function deserializeIntegratedFixtureWorkshopProfile(value: unknown): FixtureWorkshopProfile {
  if (!value || typeof value !== 'object') return createIntegratedFixtureWorkshopProfile();
  const raw = value as Partial<FixtureWorkshopProfile>;
  if (raw.version !== 'int-fb-profile-v2' || !Number.isInteger(raw.revision) || raw.revision! < 0 || !raw.wallet || !Array.isArray(raw.parts) || !raw.gunSlots || !Array.isArray(raw.claims) || !Array.isArray(raw.receipts)) return createIntegratedFixtureWorkshopProfile();
  const wallet = raw.wallet;
  if (!['credits', 'metal', 'circuits', 'cloth', 'flux'].every(key => Number.isFinite(wallet[key as keyof FixtureWallet]) && wallet[key as keyof FixtureWallet]! >= 0)) return createIntegratedFixtureWorkshopProfile();
  const profile = freezeProfile({ revision: raw.revision!, wallet, parts: raw.parts as FixturePart[], gunSlots: raw.gunSlots as FixtureWorkshopProfile['gunSlots'], claims: raw.claims as string[], receipts: raw.receipts as FixtureWorkshopReceipt[] });
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
  const prior = profile.receipts.find(receipt => receipt.commandId === command.commandId);
  if (prior) return Object.freeze({ profile, applied: false, reason: 'duplicate-command', receipt: prior });
  if (!command.commandId) return reject(profile, 'missing-command');
  if (command.expectedRevision !== profile.revision) return reject(profile, 'stale-revision');
  if (!legalSlots(profile)) return reject(profile, 'invalid-assignments');
  const wallet = profile.wallet;
  const next = (patch: Partial<Pick<FixtureWorkshopProfile, 'wallet' | 'parts' | 'gunSlots' | 'claims'>>, outputIds: readonly string[] = []) => {
    const result = finish(profile, command.commandId, command.action, { wallet: patch.wallet ?? wallet, parts: patch.parts ?? profile.parts, gunSlots: patch.gunSlots ?? profile.gunSlots, claims: patch.claims ?? profile.claims }, outputIds);
    return Object.freeze({ profile: result, applied: true, receipt: result.receipts.at(-1)! });
  };
  if (command.action === 'buy-f2') {
    if (wallet.credits < 1650) return reject(profile, 'insufficient-credits');
    const output: FixturePart = { instanceId: `INT-B1-TAB-F2-${command.commandId}`, kind: 'F2', family: 'TAB', slot: 'F', protectedBaseline: false, sealedFactory: true, tier: null, refinement: null, maker: 'Rivetwake Heavy Works', provenance: 'fixture factory offer', version: 1 };
    return next({ wallet: { ...wallet, credits: wallet.credits - 1650 }, parts: [...profile.parts, output] }, [output.instanceId]);
  }
  if (command.action === 'claim-h2') {
    if (profile.claims.includes('INT-LOOT-01')) return reject(profile, 'already-claimed');
    const output: FixturePart = { instanceId: 'INT-B1-HOU-H2-LOOT', kind: 'H2', family: 'HOU', slot: 'H', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Kestrel Cut Assembly', provenance: 'integration loot fixture', version: 1 };
    return next({ parts: [...profile.parts, output], claims: [...profile.claims, 'INT-LOOT-01'] }, [output.instanceId]);
  }
  if (command.action === 'sell-h2') { const target = part(profile, 'INT-B1-HOU-H2-LOOT'); return !target || assigned(profile, target.instanceId) || target.protectedBaseline ? reject(profile, 'not-sellable') : next({ wallet: { ...wallet, credits: wallet.credits + 540 }, parts: profile.parts.filter(candidate => candidate.instanceId !== target.instanceId) }); }
  if (command.action === 'build-b3') {
    if (wallet.credits < 1000 || wallet.metal < 40 || wallet.circuits < 8) return reject(profile, 'insufficient-resources');
    const output: FixturePart = { instanceId: `INT-B1-TAB-B3-${command.commandId}`, kind: 'B3', family: 'TAB', slot: 'B', protectedBaseline: false, sealedFactory: false, tier: 1, refinement: 'Balanced', maker: 'Oddlot Cooperative', provenance: 'INT-FB-SERVICE-01', version: 1 };
    return next({ wallet: { ...wallet, credits: wallet.credits - 1000, metal: wallet.metal - 40, circuits: wallet.circuits - 8 }, parts: [...profile.parts, output] }, [output.instanceId]);
  }
  if (command.action === 'develop-b2') { const target = part(profile, 'INT-B1-TAB-B2-GIFT'); if (!target || target.sealedFactory || target.tier !== 1 || wallet.credits < 500 || wallet.metal < 20 || wallet.circuits < 4) return reject(profile, 'ineligible-develop'); return next({ wallet: { ...wallet, credits: wallet.credits - 500, metal: wallet.metal - 20, circuits: wallet.circuits - 4 }, parts: profile.parts.map(candidate => candidate.instanceId === target.instanceId ? { ...candidate, tier: 2, version: candidate.version + 1 } : candidate) }); }
  const target = profile.parts.find(candidate => candidate.kind === (command.action === 'fit-f2-a' ? 'F2' : 'B3'));
  if (!target) return reject(profile, 'not-owned');
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
  const result = finish(profile, commandId, 'mission', { wallet: { ...profile.wallet, credits: profile.wallet.credits + 1000, metal: profile.wallet.metal + 20, circuits: profile.wallet.circuits + 4, cloth: profile.wallet.cloth + 6 }, parts: profile.parts, gunSlots: profile.gunSlots, claims: profile.claims });
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

export interface FixturePosition { readonly x: number; readonly z: number; }
export type FixtureCombatantId = 'tabby' | 'hound' | 'r01-a' | 'r01-b' | 'f01-a' | 'f01-b';
export interface FixtureCombatEvent {
  readonly type: 'weapon-fired' | 'enemy-damaged' | 'enemy-defeated' | 'actor-damaged' | 'actor-defeated';
  readonly sourceId: FixtureCombatantId;
  readonly targetId: FixtureCombatantId;
  readonly damage?: number;
  readonly targetHealth?: number;
}

interface FixtureWeaponProfile {
  readonly id: string; readonly damage: number; readonly cycleSeconds: number;
  readonly initialSetupSeconds: number; readonly fullRangeMetres: number; readonly maxRangeMetres: number; readonly store: number;
}
interface FixtureWeaponState { readonly instanceId: string; readonly profile: FixtureWeaponProfile; supply: number; nextShotSeconds: number; }
interface FixtureActorState {
  readonly id: FixtureCombatantId; readonly team: 'squad' | 'hostile';
  position: FixturePosition; health: number; readonly maxHealth: number; readonly radius: number;
  retainedTargetId?: FixtureCombatantId; readonly weapons: FixtureWeaponState[]; activeGunIndex: number;
}

const TABBY_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'TAB-service-pistol', damage: 30, cycleSeconds: 0.25, initialSetupSeconds: 0.1, fullRangeMetres: 12, maxRangeMetres: 24, store: 12,
});
const HOUND_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'HOU-service-coil-smg', damage: 14, cycleSeconds: 0.1, initialSetupSeconds: 0.1, fullRangeMetres: 8, maxRangeMetres: 18, store: 30,
});
const HOSTILE_FIXTURE_GUN: FixtureWeaponProfile = Object.freeze({
  id: 'fixture-hostile-rifle', damage: 7, cycleSeconds: 1, initialSetupSeconds: 0.5, fullRangeMetres: 10, maxRangeMetres: 16, store: 99,
});

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
  return !INTEGRATED_FIXTURE_OCCLUDERS.some(occluder => segmentIntersectsOccluder(from, to, occluder));
}

/**
 * Small deterministic combat owner for the isolated slice. Phaser only moves
 * and renders actors; this owner decides targeting, cadence, damage and death.
 */
export class IntegratedFixtureCombat {
  private readonly actors = new Map<FixtureCombatantId, FixtureActorState>();
  private readonly events: FixtureCombatEvent[] = [];
  private ownedDesignationId?: FixtureCombatantId;

  constructor() {
    this.add('tabby', 'squad', { x: 8, z: 11 }, 100, 0.4, TABBY_FIXTURE_GUN, 2);
    this.add('hound', 'squad', { x: 6.5, z: 11 }, 100, 0.4, HOUND_FIXTURE_GUN, 2);
  }

  private add(id: FixtureCombatantId, team: 'squad' | 'hostile', position: FixturePosition, health: number, radius: number, weapon?: FixtureWeaponProfile, gunCount = 1): void {
    const weapons = weapon ? Array.from({ length: gunCount }, (_, index) => ({ instanceId: `int-fb:${id}:gun-${index + 1}`, profile: weapon, supply: weapon.store, nextShotSeconds: weapon.initialSetupSeconds })) : [];
    this.actors.set(id, { id, team, position: { ...position }, health, maxHealth: health, radius, weapons, activeGunIndex: 0 });
  }

  public beginJob(jobId: FixtureJobId): void {
    for (const actor of [...this.actors.values()]) if (actor.team === 'hostile') this.actors.delete(actor.id);
    const prefix = jobId === 'MC-OPT-R01-01' ? 'r01' : 'f01';
    const locations = jobId === 'MC-OPT-R01-01' ? [{ x: 37, z: 38 }, { x: 37, z: 42 }] : [{ x: 67, z: 39 }, { x: 67, z: 44 }];
    this.add(`${prefix}-a` as FixtureCombatantId, 'hostile', locations[0]!, 90, 0.4, HOSTILE_FIXTURE_GUN);
    this.add(`${prefix}-b` as FixtureCombatantId, 'hostile', locations[1]!, 90, 0.4, HOSTILE_FIXTURE_GUN);
    this.ownedDesignationId = undefined;
  }

  public setSquadPositions(tabby: FixturePosition, hound: FixturePosition): void {
    this.actors.get('tabby')!.position = { ...tabby };
    this.actors.get('hound')!.position = { ...hound };
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
  public hostileStates(): readonly Readonly<{ id: FixtureCombatantId; position: FixturePosition; health: number }>[] {
    return Object.freeze([...this.actors.values()].filter(actor => actor.team === 'hostile').map(actor => Object.freeze({ id: actor.id, position: { ...actor.position }, health: actor.health })));
  }
  public drainEvents(): readonly FixtureCombatEvent[] { const value = Object.freeze([...this.events]); this.events.length = 0; return value; }

  public advance(deltaSeconds: number): readonly FixtureCombatEvent[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.drainEvents();
    for (const actor of this.actors.values()) {
      const gun = actor.weapons[actor.activeGunIndex];
      if (!gun || actor.health <= 0) continue;
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
    gun.supply -= 1;
    target.health = Math.max(0, target.health - damage);
    this.events.push(Object.freeze({ type: 'weapon-fired', sourceId: source.id, targetId: target.id, damage }), Object.freeze({
      type: target.team === 'hostile' ? 'enemy-damaged' : 'actor-damaged', sourceId: source.id, targetId: target.id, damage, targetHealth: target.health,
    }));
    if (target.health === 0) this.events.push(Object.freeze({ type: target.team === 'hostile' ? 'enemy-defeated' : 'actor-defeated', sourceId: source.id, targetId: target.id }));
  }
}
