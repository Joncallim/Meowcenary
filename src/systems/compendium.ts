/**
 * Monster Compendium system.
 *
 * V4 (Slice H): discovery tracking, read model, and editorial data.
 * Consumes canonical enemy:spawned (encountered) and enemy:killed (defeated)
 * events from Slice B. Training events do not persist discovery.
 * No arbitrary kill-count lore grind.
 */
import type { CompendiumDiscoveryStatus } from './save';
import type { SaveDataV4 } from './save';
import { freezeSaveV4 } from './save';

/** Compendium editorial metadata (separate from enemy mechanic truth). */
export interface CompendiumEntry {
  readonly enemyId: string;
  readonly fieldNote: string;
  readonly behaviour: string;
  readonly tells: string;
  readonly counterplay: string;
}

/** Read model for a single compendium entry. */
export interface CompendiumReadEntry {
  readonly enemyId: string;
  readonly discoveryStatus: CompendiumDiscoveryStatus | undefined;
  readonly name: string;
  readonly fieldNote: string;
  readonly behaviour: string;
  readonly tells: string;
  readonly counterplay: string;
  readonly foundIn: readonly string[];
}

/** Registry of compendium editorial data. */
export class CompendiumRegistry {
  private readonly entries = new Map<string, CompendiumEntry>();

  constructor(entries: readonly CompendiumEntry[]) {
    for (const entry of entries) {
      this.entries.set(entry.enemyId, Object.freeze({ ...entry }));
    }
  }

  get(enemyId: string): CompendiumEntry | undefined {
    return this.entries.get(enemyId);
  }

  all(): readonly CompendiumEntry[] {
    return [...this.entries.values()];
  }
}

/**
 * Update compendium discovery status for an enemy.
 * Only persists on monotonic status changes (unseen→encountered, encountered→defeated).
 * Returns the updated SaveDataV4 or the same reference if unchanged.
 */
export function updateCompendiumDiscovery(
  save: SaveDataV4,
  enemyId: string,
  status: CompendiumDiscoveryStatus,
): SaveDataV4 {
  const current = save.compendium[enemyId];

  // Defeated implies encountered, so upgrade any existing status
  if (current === 'defeated') return save; // Already at highest status
  if (current === 'encountered' && status === 'encountered') return save; // No change
  if (current === undefined && status === 'encountered') {
    // New encounter
    const newCompendium: Record<string, CompendiumDiscoveryStatus> = {
      ...save.compendium,
      [enemyId]: 'encountered' as CompendiumDiscoveryStatus,
    };
    return freezeSaveV4({ ...save, compendium: Object.freeze(newCompendium) });
  }
  if (status === 'defeated') {
    // Upgrade to defeated (from undefined or encountered)
    const newCompendium: Record<string, CompendiumDiscoveryStatus> = {
      ...save.compendium,
      [enemyId]: 'defeated' as CompendiumDiscoveryStatus,
    };
    return freezeSaveV4({ ...save, compendium: Object.freeze(newCompendium) });
  }

  return save;
}

/**
 * Build a read entry for the compendium UI.
 */
export function buildCompendiumReadEntry(
  enemyId: string,
  discoveryStatus: CompendiumDiscoveryStatus | undefined,
  editorial: CompendiumEntry | undefined,
  name: string,
  foundInStages: readonly string[],
): CompendiumReadEntry {
  return Object.freeze({
    enemyId,
    discoveryStatus,
    name,
    fieldNote: editorial?.fieldNote ?? 'Unknown.',
    behaviour: editorial?.behaviour ?? 'Unknown.',
    tells: editorial?.tells ?? 'Unknown.',
    counterplay: editorial?.counterplay ?? 'Unknown.',
    foundIn: Object.freeze([...foundInStages]),
  });
}

/**
 * Get all compendium read entries for the UI.
 */
export function getAllCompendiumEntries(
  save: SaveDataV4,
  registry: CompendiumRegistry,
  enemyNames: ReadonlyMap<string, string>,
  enemyStageMembership: ReadonlyMap<string, readonly string[]>,
): readonly CompendiumReadEntry[] {
  const allEnemyIds = new Set([
    ...Object.keys(save.compendium),
    ...registry.all().map((e) => e.enemyId),
  ]);

  return [...allEnemyIds]
    .map((enemyId) => {
      const editorial = registry.get(enemyId);
      return buildCompendiumReadEntry(
        enemyId,
        save.compendium[enemyId],
        editorial,
        enemyNames.get(enemyId) ?? enemyId,
        enemyStageMembership.get(enemyId) ?? [],
      );
    })
    .sort((a, b) => a.enemyId.localeCompare(b.enemyId));
}
