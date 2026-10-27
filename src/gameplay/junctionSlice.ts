import { deepFreeze } from '../engine/freeze';
import {
  IntegratedFixtureCombat, HOSTILE_FIXTURE_GUN, createIntegratedFixtureEnvelope,
  createIntegratedFixtureWorkshopProfile, decodeIntegratedFixtureEnvelope,
  commitFixtureWorkshop, resolveFixtureGunProfile,
  type FixtureCombatSnapshot, type FixtureCombatEvent, type FixturePosition,
  type FixtureWorkshopProfile, type FixtureEncounterHostile,
} from './integratedFixture';

export const JUNCTION_SAVE_KEY = 'meowcenary:junction-slice:v1';
export const JUNCTION_VERSION = 'junction-slice-v1';
export const JUNCTION_PROVENANCE = 'isolated weapons-only technical seed; not campaign progression or approved economy';
export const JUNCTION_CONTACT: FixturePosition = Object.freeze({ x: 8, z: 8, layer: 'ground' });
export const JUNCTION_ENTRY: FixturePosition = Object.freeze({ x: 26, z: 11, layer: 'ground' });
export interface JunctionRectangle { readonly id: string; readonly x: number; readonly z: number; readonly width: number; readonly depth: number; }
export const JUNCTION_SURFACES = deepFreeze([
  { id: 'junction-safe-frontage', kind: 'safe', x: 2, z: 2, width: 16, depth: 14 },
  { id: 'junction-public-approach', kind: 'corridor', x: 18, z: 8, width: 8, depth: 6 },
  { id: 'junction-restricted-yard', kind: 'restricted', x: 26, z: 8, width: 20, depth: 20 },
] as const);
export const JUNCTION_COVER: readonly JunctionRectangle[] = deepFreeze([
  { id: 'junction-yard-cover', x: 34, z: 17, width: 2, depth: 4 },
]);
export const JUNCTION_HOSTILES: readonly FixtureEncounterHostile[] = deepFreeze([
  { id: 'junction-yard-rifle-a', position: { x: 35, z: 14, layer: 'ground' }, health: 90, radius: .4, weapon: HOSTILE_FIXTURE_GUN },
  { id: 'junction-yard-rifle-b', position: { x: 41, z: 22, layer: 'ground' }, health: 90, radius: .4, weapon: HOSTILE_FIXTURE_GUN },
]);
export type JunctionPhase = 'offer' | 'accepted' | 'fighting' | 'return' | 'complete' | 'lost';
export type JunctionActor = 'tabby' | 'hound';
export type JunctionShopAction = 'buy-f2' | 'fit-f2-a';
export interface JunctionSliceState {
  readonly version: typeof JUNCTION_VERSION;
  readonly provenance: typeof JUNCTION_PROVENANCE;
  readonly revision: number;
  readonly attempt: number;
  readonly phase: JunctionPhase;
  readonly controlledActor: JunctionActor;
  readonly combat: FixtureCombatSnapshot;
  readonly workshop: FixtureWorkshopProfile;
  readonly completionId?: 'junction-first-clear-v1';
}
export interface JunctionShopPreview { readonly action: JunctionShopAction; readonly revision: number; readonly workshopRevision: number; }
export interface JunctionCommandResult { readonly applied: boolean; readonly reason?: string; readonly events?: readonly FixtureCombatEvent[]; }
export type JunctionDecode = Readonly<{ state: 'absent' | 'valid'; model: JunctionSliceModel } | { state: 'invalid' }>;
export type JunctionWriter = (serialized: string) => void;

function inRectangle(p: FixturePosition, box: JunctionRectangle, inset = 0): boolean {
  return p.x >= box.x + inset && p.x <= box.x + box.width - inset && p.z >= box.z + inset && p.z <= box.z + box.depth - inset;
}
export function isJunctionRestricted(p: FixturePosition): boolean { return inRectangle(p, JUNCTION_SURFACES[2]); }
export function isJunctionWalkable(p: FixturePosition, allowYard = true): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || (p.layer !== undefined && p.layer !== 'ground')) return false;
  // All four body corners must be in the connected floor union. Adjacent
  // rectangles therefore keep their join open while outer edges stay honest.
  const radius = .4;
  return [-radius, radius].every(dx => [-radius, radius].every(dz => JUNCTION_SURFACES.some(box =>
    (allowYard || box.kind !== 'restricted') && inRectangle({ x: p.x + dx, z: p.z + dz }, box))))
    && !JUNCTION_COVER.some(box => p.x >= box.x - radius && p.x <= box.x + box.width + radius
      && p.z >= box.z - radius && p.z <= box.z + box.depth + radius);
}
function segmentHitsBox(from: FixturePosition, to: FixturePosition, box: JunctionRectangle): boolean {
  let lo = 0; let hi = 1;
  for (const [start, delta, min, max] of [[from.x, to.x - from.x, box.x, box.x + box.width], [from.z, to.z - from.z, box.z, box.z + box.depth]]) {
    if (delta === 0) { if (start < min || start > max) return false; continue; }
    lo = Math.max(lo, Math.min((min - start) / delta, (max - start) / delta));
    hi = Math.min(hi, Math.max((min - start) / delta, (max - start) / delta));
    if (lo > hi) return false;
  }
  return true;
}
export function hasJunctionLineOfSight(from: FixturePosition, to: FixturePosition): boolean {
  return isJunctionRestricted(from) && isJunctionRestricted(to) && !JUNCTION_COVER.some(box => segmentHitsBox(from, to, box));
}
function combatFor(profile: FixtureWorkshopProfile): IntegratedFixtureCombat {
  const combat = new IntegratedFixtureCombat(profile, hasJunctionLineOfSight);
  combat.beginEncounter(JUNCTION_HOSTILES);
  return combat;
}
export function createJunctionSliceState(): JunctionSliceState {
  const workshop = createIntegratedFixtureWorkshopProfile();
  return deepFreeze({ version: JUNCTION_VERSION, provenance: JUNCTION_PROVENANCE, revision: 0, attempt: 1,
    phase: 'offer', controlledActor: 'tabby', combat: combatFor(workshop).snapshot('tabby', true), workshop });
}
export function serializeJunctionSlice(state: JunctionSliceState): string {
  const { version, provenance, revision, attempt, phase, controlledActor, combat, workshop, completionId } = state;
  return JSON.stringify({ version, provenance, revision, attempt, phase, controlledActor, combat, workshop, completionId });
}

/** Strict isolated save boundary. Invalid data is reported, never reseeded. */
export function decodeJunctionSlice(bytes: string | null): Readonly<{ state: 'absent' | 'valid'; value: JunctionSliceState } | { state: 'invalid' }> {
  if (bytes === null) return { state: 'absent', value: createJunctionSliceState() };
  try {
    const raw = JSON.parse(bytes) as JunctionSliceState;
    if (!raw || Object.keys(raw).some(key => !['version', 'provenance', 'revision', 'attempt', 'phase', 'controlledActor', 'combat', 'workshop', 'completionId'].includes(key))
      || raw.version !== JUNCTION_VERSION || raw.provenance !== JUNCTION_PROVENANCE
      || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Number.isSafeInteger(raw.attempt) || raw.attempt < 1
      || !['offer', 'accepted', 'fighting', 'return', 'complete', 'lost'].includes(raw.phase)
      || (raw.controlledActor !== 'tabby' && raw.controlledActor !== 'hound') || raw.combat?.controlledActor !== raw.controlledActor
      || (raw.phase === 'complete' ? raw.completionId !== 'junction-first-clear-v1' : raw.completionId !== undefined)) return { state: 'invalid' };
    const decoded = decodeIntegratedFixtureEnvelope(JSON.stringify({ ...createIntegratedFixtureEnvelope(), workshop: raw.workshop }));
    if (decoded.state !== 'valid' || raw.workshop.receipts.some(r => r.action !== 'buy-f2' && r.action !== 'fit-f2-a')
      || raw.workshop.attempts.length || raw.workshop.paidEventIds.length || raw.workshop.progressionAwardedEventIds.length) return { state: 'invalid' };
    const combat = combatFor(decoded.envelope.workshop);
    if (!combat.restoreEncounter(raw.combat) || raw.combat.actors.some(actor => !isJunctionWalkable(actor.position))) return { state: 'invalid' };
    if (JUNCTION_HOSTILES.some(def => { const saved = raw.combat.actors.find(a => a.id === def.id)!; return saved.position.x !== def.position.x || saved.position.z !== def.position.z; })
      || ((raw.phase === 'offer' || raw.phase === 'accepted') && raw.combat.actors.some(a => a.health !== a.maxHealth || ((a.id === 'tabby' || a.id === 'hound') && isJunctionRestricted(a.position))))) return { state: 'invalid' };
    const cleared = combat.isGroupCleared();
    if ((raw.phase === 'return' || raw.phase === 'complete') !== cleared
      || (raw.phase === 'lost') !== (combat.actorHealth('tabby') <= 0 && combat.actorHealth('hound') <= 0)
      || (raw.controlledActor === 'hound' && combat.actorHealth('tabby') > 0)) return { state: 'invalid' };
    return { state: 'valid', value: deepFreeze(raw) };
  } catch { return { state: 'invalid' }; }
}

/** Phaser-free, single-writer rule owner. A scene calls commands inside its
 * browser writer lock. Every mutation persists before becoming observable. */
export class JunctionSliceModel {
  private paused = false;
  private preview?: JunctionShopPreview;
  private constructor(private state: JunctionSliceState, private readonly writer: JunctionWriter) {}
  public static load(bytes: string | null, writer: JunctionWriter): JunctionDecode {
    const decoded = decodeJunctionSlice(bytes);
    return decoded.state === 'invalid' ? decoded : { state: decoded.state, model: new JunctionSliceModel(decoded.value, writer) };
  }
  public snapshot(): JunctionSliceState & Readonly<{ paused: boolean }> { return Object.freeze({ ...this.state, paused: this.paused }); }
  public setPaused(paused: boolean): void { this.paused = paused; if (!paused) this.preview = undefined; }
  public atContact(): boolean {
    const p = this.state.combat.actors.find(a => a.id === this.state.controlledActor)!.position;
    return Math.hypot(p.x - JUNCTION_CONTACT.x, p.z - JUNCTION_CONTACT.z) <= 3.5;
  }
  public shopComparison() {
    const equipped = resolveFixtureGunProfile(this.state.workshop, 'TAB-A');
    return Object.freeze({ selected: Object.freeze({ name: 'TAB-F2 Long Drum', price: 1650, supply: 18, refillSeconds: 2.7 }),
      equipped: Object.freeze({ name: equipped.store === 18 ? 'TAB-F2 Long Drum' : 'TAB-F1 Service Feed', supply: equipped.store, refillSeconds: equipped.refillSeconds }),
      owned: this.state.workshop.parts.some(p => p.kind === 'F2'), placeholderEconomy: true });
  }
  private commit(candidate: JunctionSliceState, events: readonly FixtureCombatEvent[] = []): JunctionCommandResult {
    const next = deepFreeze({ ...candidate, revision: this.state.revision + 1 });
    try { this.writer(serializeJunctionSlice(next)); } catch { return { applied: false, reason: 'storage-failed' }; }
    this.state = next;
    return { applied: true, events };
  }
  public interact(): JunctionCommandResult {
    if (this.paused || this.preview) return { applied: false, reason: 'paused' };
    if (!this.atContact()) return { applied: false, reason: 'return-to-contact' };
    if (this.state.phase === 'offer') return this.commit({ ...this.state, phase: 'accepted' });
    if (this.state.phase === 'return') return this.commit({ ...this.state, phase: 'complete', completionId: 'junction-first-clear-v1' });
    return { applied: false, reason: this.state.phase === 'complete' ? 'already-complete' : 'workyard-not-cleared' };
  }
  public previewShop(action: JunctionShopAction): JunctionShopPreview | undefined {
    if (!this.atContact() || this.state.combat.actors.find(a => a.id === this.state.controlledActor)!.health <= 0 || this.state.phase === 'lost') return undefined;
    this.preview = Object.freeze({ action, revision: this.state.revision, workshopRevision: this.state.workshop.revision });
    return this.preview;
  }
  public cancelShop(): void { this.preview = undefined; }
  public confirmShop(preview: JunctionShopPreview): JunctionCommandResult {
    if (this.preview !== preview || preview.revision !== this.state.revision || !this.atContact()) return { applied: false, reason: 'stale-preview' };
    const result = commitFixtureWorkshop(this.state.workshop, { profileId: this.state.workshop.profileId,
      commandId: `junction:${preview.action}:${preview.workshopRevision}`, expectedRevision: preview.workshopRevision, action: preview.action,
      partInstanceId: preview.action === 'fit-f2-a' ? this.state.workshop.parts.find(p => p.kind === 'F2')?.instanceId : undefined });
    if (!result.applied) return { applied: false, reason: result.reason };
    const combat = combatFor(result.profile);
    if (!combat.restoreEncounter(this.state.combat)) return { applied: false, reason: 'invalid-loadout' };
    const committed = this.commit({ ...this.state, workshop: result.profile, combat: combat.snapshot(this.state.controlledActor, true) });
    if (committed.applied) this.preview = undefined;
    return committed;
  }
  public swapGun(): JunctionCommandResult {
    if (this.paused || this.preview) return { applied: false, reason: 'paused' };
    const combat = combatFor(this.state.workshop); combat.restoreEncounter(this.state.combat);
    if (!combat.swapActiveGun(this.state.controlledActor)) return { applied: false, reason: 'unavailable' };
    return this.commit({ ...this.state, combat: combat.snapshot(this.state.controlledActor, true) });
  }
  public confirmTakeover(): JunctionCommandResult {
    if (this.paused || this.preview || this.state.controlledActor !== 'tabby') return { applied: false, reason: 'unavailable' };
    const combat = combatFor(this.state.workshop); combat.restoreEncounter(this.state.combat);
    if (combat.actorHealth('tabby') > 0 || combat.actorHealth('hound') <= 0) return { applied: false, reason: 'unavailable' };
    return this.commit({ ...this.state, controlledActor: 'hound', combat: combat.snapshot('hound', true) });
  }
  public retry(): JunctionCommandResult {
    if (this.state.phase !== 'lost' || this.paused) return { applied: false, reason: 'unavailable' };
    return this.commit({ ...this.state, phase: 'accepted', controlledActor: 'tabby', attempt: this.state.attempt + 1,
      combat: combatFor(this.state.workshop).snapshot('tabby', true) });
  }
  public move(dx: number, dz: number, seconds: number): JunctionCommandResult { return this.step(dx, dz, seconds, false); }
  public advance(seconds: number): JunctionCommandResult { return this.step(0, 0, seconds); }
  public step(dx: number, dz: number, seconds: number, advanceCombat = true): JunctionCommandResult {
    if (this.paused || this.preview || this.state.phase === 'lost') return { applied: false, reason: 'paused' };
    if (![dx, dz, seconds].every(Number.isFinite) || seconds <= 0 || seconds > 1) return { applied: false, reason: 'invalid-step' };
    const combat = combatFor(this.state.workshop); combat.restoreEncounter(this.state.combat);
    const snapshots = new Map(this.state.combat.actors.map(a => [a.id, a]));
    const controlled = snapshots.get(this.state.controlledActor)!;
    if (controlled.health <= 0) return { applied: false, reason: 'takeover-required' };
    const length = Math.hypot(dx, dz); const scale = length > 1 ? 1 / length : 1;
    const allowed = this.state.phase !== 'offer';
    const p = sweep(controlled.position, dx * scale * 12 * seconds, dz * scale * 12 * seconds, allowed);
    const tabby = this.state.controlledActor === 'tabby' ? p : snapshots.get('tabby')!.position;
    let hound = this.state.controlledActor === 'hound' ? p : snapshots.get('hound')!.position;
    if (this.state.controlledActor === 'tabby' && snapshots.get('hound')!.health > 0) {
      const vx = tabby.x - 1.5 - hound.x; const vz = tabby.z - hound.z; const distance = Math.hypot(vx, vz);
      const factor = distance > 0 ? Math.min(1, 12 * seconds / distance) : 0;
      hound = sweep(hound, vx * factor, vz * factor, allowed);
    }
    combat.setSquadPositions(tabby, hound);
    let phase: JunctionPhase = this.state.phase;
    if (phase === 'accepted' && isJunctionRestricted(p)) phase = 'fighting';
    const events: FixtureCombatEvent[] = [];
    if (advanceCombat && (phase === 'fighting' || phase === 'return' || phase === 'complete')) {
      let left = seconds;
      while (left > 1e-9) { const delta = Math.min(.05, left); events.push(...combat.advance(delta)); left -= delta; }
      if (combat.actorHealth('tabby') <= 0 && combat.actorHealth('hound') <= 0) phase = 'lost';
      else if (phase === 'fighting' && combat.isGroupCleared()) phase = 'return';
    }
    const snapshot = combat.snapshot(this.state.controlledActor, true);
    if (phase === this.state.phase && JSON.stringify(snapshot) === JSON.stringify(this.state.combat)) return { applied: false, reason: 'unchanged' };
    return this.commit({ ...this.state, phase, combat: snapshot }, events);
  }
}
function sweep(start: FixturePosition, dx: number, dz: number, allowYard: boolean): FixturePosition {
  let p = { ...start, layer: 'ground' as const };
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2));
  for (let i = 0; i < count; i++) {
    const direct = { ...p, x: p.x + dx / count, z: p.z + dz / count };
    if (isJunctionWalkable(direct, allowYard)) { p = direct; continue; }
    const x = { ...p, x: direct.x };
    if (isJunctionWalkable(x, allowYard)) p = x;
    const z = { ...p, z: direct.z };
    if (isJunctionWalkable(z, allowYard)) p = z;
  }
  return p;
}
