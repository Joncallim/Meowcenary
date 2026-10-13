/** Pure #200 foundation, recovered from the existing local pickup work.
 * Production renderer and native art cutover remain separate. */
import { deepFreeze } from '../engine/freeze';
import type { LootGrant } from '../gameplay/loot';
import type { WeaponRegistry } from '../gameplay/weapons';
import type { ResolvedVisualArtBinding } from '../systems/types';
import type { VisualArtLookup } from '../systems/visualArt';

export interface DropPresentationDependencies {
  readonly weaponRegistry: Pick<WeaponRegistry, 'weaponById'>;
  readonly visualArt: Pick<VisualArtLookup, 'bindingById'>;
}
export interface DropPresentation {
  readonly kind: LootGrant['kind'];
  readonly artId: string;
  readonly binding: Readonly<ResolvedVisualArtBinding>;
  /** World display only; does not change the authoritative physics circle. */
  readonly display: { readonly width: number; readonly height: number };
  readonly weapon?: Readonly<{ definitionId: string; family: string; tier: number }>;
}

/** Resolve once before publishing a pool lifetime. Never creates/adopts a
 * weapon instance, resolves loot, consumes RNG, or changes admission state. */
export function resolveDropPresentation(
  grant: LootGrant,
  dependencies: DropPresentationDependencies,
): Readonly<DropPresentation> {
  if (!dependencies?.visualArt || !dependencies.weaponRegistry) throw new Error('Drop presentation requires content and art registries');
  let artId: string;
  let weapon: DropPresentation['weapon'];
  if (grant.kind === 'weapon') {
    const definition = dependencies.weaponRegistry.weaponById(grant.definitionId);
    if (!definition || definition.id !== grant.definitionId) throw new Error(`Unknown weapon pickup "${grant.definitionId}"`);
    if (!definition.family || !Number.isSafeInteger(definition.mergeTier) || definition.mergeTier < 1) throw new Error(`Weapon pickup "${definition.id}" has invalid family/tier identity`);
    artId = definition.art.iconId;
    weapon = { definitionId: definition.id, family: definition.family, tier: definition.mergeTier };
  } else if (grant.kind === 'xp' || grant.kind === 'scrap' || grant.kind === 'chest') {
    artId = `drop:${grant.kind}`;
  } else {
    throw new Error('Unsupported pickup grant kind');
  }
  const binding = dependencies.visualArt.bindingById(artId);
  const kind = grant.kind === 'weapon' ? 'weapon-icon' : 'drop';
  if (!binding || binding.id !== artId || binding.kind !== kind || binding.required !== true) {
    throw new Error(`Pickup "${grant.kind}" requires registered ${kind} art "${artId}"`);
  }
  if (!binding.textureKey || !binding.url || (binding.load.type === 'atlas' && !binding.frameKey)) {
    throw new Error(`Pickup art "${artId}" requires a resolved texture and atlas frame`);
  }
  const { width, height } = binding.display;
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error(`Pickup art "${artId}" requires positive finite display dimensions`);
  const scale = weapon ? Math.min(1, 20 / Math.max(width, height)) : 1;
  return deepFreeze({ kind: grant.kind, artId, binding: structuredClone(binding),
    display: { width: width * scale, height: height * scale }, ...(weapon ? { weapon } : {}) });
}
