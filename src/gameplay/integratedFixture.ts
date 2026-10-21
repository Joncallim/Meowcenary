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
