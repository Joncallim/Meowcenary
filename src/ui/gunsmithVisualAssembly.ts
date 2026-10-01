import { resolveGunsmithPartVisual } from '../presentation/gunsmithPartVisuals';
export { resolveGunsmithPartVisual, validateGunsmithPartVisuals } from '../presentation/gunsmithPartVisuals';
export type { GunsmithPartVisualFamily, GunsmithPartVisualTier } from '../presentation/gunsmithPartVisuals';
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
