import partVisuals from '../data/gunsmith-part-visuals.json';
import { deepFreeze } from '../engine/freeze';
import { PART_SLOTS, type PartDefinition } from '../gameplay/gunsmith';
import type { Build, GunsmithState } from '../systems/save';
import type { GunsmithAssembledPreview } from './gunsmithController';

/** Persistent engineering has one presentation-owned chassis per family.
 * Weapon merge tiers describe acquired weapons, never the workshop base. */
export const GUNSMITH_CHASSIS = deepFreeze([
  { familyId: 'pistol', iconArtId: 'gun-chassis-icon:pistol', baseArtId: 'gun-build-base:pistol' },
  { familyId: 'smg', iconArtId: 'gun-chassis-icon:smg', baseArtId: 'gun-build-base:smg' },
  { familyId: 'shotgun', iconArtId: 'gun-chassis-icon:shotgun', baseArtId: 'gun-build-base:shotgun' },
]);

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

/** Current, candidate and committed composition share exact fitted tier art. */
export function resolveGunsmithVisualAssembly(build: Build, state: GunsmithState,
  definitions: ReadonlyMap<string, PartDefinition>): GunsmithAssembledPreview | undefined {
  const chassis = GUNSMITH_CHASSIS.find((entry) => entry.familyId === build.baseWeaponFamily);
  if (!chassis) return undefined;
  const layers = PART_SLOTS.flatMap((slot) => {
    if (slot === 'trait') return [];
    const instanceId = build.fitted[slot];
    const part = instanceId === undefined ? undefined : state.parts[instanceId];
    const definition = part && definitions.get(part.partId);
    if (!part || !definition || instanceId === undefined) return [];
    const visual = resolveGunsmithPartVisual(definition, part.tier);
    return visual.assemblyArtId === undefined ? [] : [{ instanceId, slot, tier: part.tier, artId: visual.assemblyArtId }];
  });
  const traitCores = build.traitParts.flatMap((instanceId) => {
    const part = state.parts[instanceId];
    const definition = part && definitions.get(part.partId);
    return !part || !definition ? [] : [{ instanceId, tier: part.tier, iconArtId: resolveGunsmithPartVisual(definition, part.tier).iconArtId }];
  });
  const icons = new Map<string, string>();
  for (const definition of definitions.values()) for (const [trait, artId] of Object.entries(definition.presentation.traitIconArtIds)) {
    if (artId) icons.set(trait, artId);
  }
  const traits = new Set<string>();
  for (const instanceId of [...Object.values(build.fitted), ...build.traitParts]) {
    const part = instanceId === undefined ? undefined : state.parts[instanceId];
    const definition = part && definitions.get(part.partId);
    if (part && definition) for (const trait of [...definition.traits, ...part.infusedTraits]) traits.add(trait);
  }
  return deepFreeze({ baseArtId: chassis.baseArtId, layers, traitCores,
    traitEmblems: [...traits].flatMap((trait) => { const iconArtId = icons.get(trait); return iconArtId ? [{ trait, iconArtId }] : []; }) });
}
