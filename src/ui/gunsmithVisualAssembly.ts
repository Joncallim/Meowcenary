import { deepFreeze } from '../engine/freeze';
import { PART_SLOTS, type PartDefinition } from '../gameplay/gunsmith';
import type { Build, GunsmithState } from '../systems/save';
import type { GunsmithAssembledPreview } from './gunsmithController';

/** Persistent engineering has one presentation-owned chassis per family.
 * Weapon merge tiers describe acquired weapons, never the workshop base. */
export const GUNSMITH_CHASSIS = deepFreeze([
  { familyId: 'pistol', iconArtId: 'weapon-icon:pistol:t1', baseArtId: 'gun-build-base:pistol' },
  { familyId: 'smg', iconArtId: 'weapon-icon:smg:t1', baseArtId: 'gun-build-base:smg' },
  { familyId: 'shotgun', iconArtId: 'weapon-icon:shotgun:t1', baseArtId: 'gun-build-base:shotgun' },
]);

/** Current and candidate composition share this pure resolver. Assembly tier
 * art is a presentation concern; existing Part bindings remain the fallback
 * until their authored tier family is supplied. */
export function resolveGunsmithVisualAssembly(build: Build, state: GunsmithState,
  definitions: ReadonlyMap<string, PartDefinition>): GunsmithAssembledPreview | undefined {
  const chassis = GUNSMITH_CHASSIS.find((entry) => entry.familyId === build.baseWeaponFamily);
  if (!chassis) return undefined;
  const layers = PART_SLOTS.flatMap((slot) => {
    if (slot === 'trait') return [];
    const instanceId = build.fitted[slot];
    const part = instanceId === undefined ? undefined : state.parts[instanceId];
    const definition = part && definitions.get(part.partId);
    return !part || !definition?.presentation.assemblyArtId || instanceId === undefined ? []
      : [{ instanceId, slot, tier: part.tier, artId: definition.presentation.assemblyArtId }];
  });
  const traitCores = build.traitParts.flatMap((instanceId) => {
    const part = state.parts[instanceId];
    const definition = part && definitions.get(part.partId);
    return !part || !definition ? [] : [{ instanceId, tier: part.tier, iconArtId: definition.presentation.iconArtId }];
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
