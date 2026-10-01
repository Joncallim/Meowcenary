import partVisuals from '../data/gunsmith-part-visuals.json';
import { deepFreeze } from '../engine/freeze';
import type { PartDefinition } from '../gameplay/gunsmith';

deepFreeze(partVisuals);

export interface GunsmithPartVisualTier {
  readonly tier: number;
  readonly iconArtId: string;
  readonly assemblyArtId?: string;
}

export interface GunsmithPartVisualFamily {
  readonly partId: string;
  readonly tierInvariant: boolean;
  readonly tiers: readonly GunsmithPartVisualTier[];
}

/** Exact presentation coverage: missing, duplicate, aliased or stale physical
 * tier art fails before it can become a silently misleading preview. */
export function validateGunsmithPartVisuals(definitions: readonly PartDefinition[],
  families: readonly GunsmithPartVisualFamily[] = partVisuals.parts,
  artIds?: ReadonlySet<string>): void {
  const known = new Set(definitions.map((definition) => definition.id));
  if (families.length !== known.size || new Set(families.map((family) => family.partId)).size !== families.length)
    throw new Error('Gunsmith Part visual families must cover the catalog exactly once');
  const physical = families.filter((row) => !row.tierInvariant).flatMap((row) => row.tiers);
  if (new Set(physical.map((row) => row.iconArtId)).size !== physical.length
    || new Set(physical.map((row) => row.assemblyArtId)).size !== physical.length)
    throw new Error('Aliased Gunsmith Part visual tiers across families');
  for (const family of families) {
    const definition = definitions.find((row) => row.id === family.partId);
    if (!definition || family.tierInvariant !== (definition.slot === 'trait'))
      throw new Error(`Invalid Gunsmith Part visual family ${family.partId}`);
    if (family.tiers.length !== 5 || family.tiers.some((row, index) => row.tier !== index + 1))
      throw new Error(`Missing or stale Gunsmith Part visual tier ${family.partId}`);
    if (family.tierInvariant && new Set(family.tiers.map((row) => row.iconArtId)).size !== 1)
      throw new Error(`Tier-invariant Gunsmith emblem changed ${family.partId}`);
    if (!family.tierInvariant && (new Set(family.tiers.map((row) => row.iconArtId)).size !== 5
      || new Set(family.tiers.map((row) => row.assemblyArtId)).size !== 5))
      throw new Error(`Aliased Gunsmith Part visual tiers ${family.partId}`);
    for (const row of family.tiers) {
      if (!row.iconArtId || (!family.tierInvariant && !row.assemblyArtId)
        || (family.tierInvariant && row.assemblyArtId !== undefined))
        throw new Error(`Invalid Gunsmith Part visual tier ${family.partId} T${row.tier}`);
      if (artIds && [row.iconArtId, row.assemblyArtId].some((id) => id !== undefined && !artIds.has(id)))
        throw new Error(`Unregistered Gunsmith Part visual tier ${family.partId} T${row.tier}`);
    }
  }
}

export function resolveGunsmithPartVisual(definition: Pick<PartDefinition, 'id'>, tier: number,
  families: readonly GunsmithPartVisualFamily[] = partVisuals.parts): GunsmithPartVisualTier {
  const family = families.find((row) => row.partId === definition.id);
  const visual = family?.tiers.find((row) => row.tier === tier);
  if (!visual) throw new Error(`Missing Gunsmith Part visual ${definition.id} T${tier}`);
  return visual;
}

