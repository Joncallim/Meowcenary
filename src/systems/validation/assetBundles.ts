import type { ArenaDefinition, AssetBundleDefinition, VisualArtCatalog, VisualTextureResource } from '../types';
import { isUnlockId } from '../ids';
import type { RowCheck } from '../validation';

export const checkAssetBundle: RowCheck = (row: unknown): string[] => {
  if (!row || typeof row !== 'object') return ['not an object'];
  const bundle = row as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof bundle.id !== 'string' || !isUnlockId(bundle.id) || !bundle.id.startsWith('bundle:')) {
    errors.push('id: must be a valid bundle ID');
  }
  if (!Array.isArray(bundle.resourceIds) || bundle.resourceIds.length === 0) {
    errors.push('resourceIds: must be a non-empty array');
  } else {
    const ids = bundle.resourceIds;
    if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      errors.push('resourceIds: entries must be non-empty canonical visual resource IDs');
    }
    if (new Set(ids).size !== ids.length) errors.push('resourceIds: entries must be unique');
  }
  return errors;
};

/** Cross-catalog contract: a stage bundle must exist, and every member must
 * be a real visual-art binding. This makes an assetBundleId a loadable
 * content contract rather than a syntax-only label. */
export function assertStageAssetBundleReferences(
  stages: readonly { readonly id: string; readonly arenaId: string; readonly assetBundleId: string }[],
  bundles: readonly AssetBundleDefinition[],
  visualArt: VisualArtCatalog,
  visualResources: readonly VisualTextureResource[],
  arenas: readonly Pick<ArenaDefinition, 'id' | 'visual'>[],
): void {
  const bundleIds = new Set(bundles.map((bundle) => bundle.id));
  const bundlesById = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  const resourceIds = new Set(visualResources.map((resource) => resource.id));
  const arenasById = new Map(arenas.map((arena) => [arena.id, arena]));
  for (const [bundleIndex, bundle] of bundles.entries()) {
    for (const resourceId of bundle.resourceIds) {
      if (!resourceIds.has(resourceId)) {
        throw new Error(`asset-bundles.json[${bundleIndex}].resourceIds: "${resourceId}" not found in visual-resources catalog`);
      }
    }
  }
  const memberSets = new Map<string, string>();
  for (const bundle of bundles) {
    const signature = [...bundle.resourceIds].sort().join('\u0000');
    const prior = memberSets.get(signature);
    if (prior !== undefined) {
      throw new Error(`asset-bundles.json: "${bundle.id}" duplicates the declared members of "${prior}"`);
    }
    memberSets.set(signature, bundle.id);
  }
  for (const [stageIndex, stage] of stages.entries()) {
    if (!bundleIds.has(stage.assetBundleId)) {
      throw new Error(`stages.json[${stageIndex}].assetBundleId: "${stage.assetBundleId}" not found in asset bundle catalog`);
    }
    const arena = arenasById.get(stage.arenaId);
    if (!arena) continue; // the normal stage→arena validator reports this reference.
    const requiredAssetIds = [
      ...arena.visual.floorArtIds,
      arena.visual.boundary.straightArtId,
      arena.visual.boundary.cornerArtId,
      arena.visual.boundary.patchArtId,
      arena.visual.boundary.gateArtId,
      ...arena.visual.decorations.map((decoration) => decoration.artId),
      ...arena.visual.obstacleSkins.map((skin) => skin.artId),
    ];
    const bundleAssets = new Set(bundlesById.get(stage.assetBundleId)!.resourceIds);
    const requiredAssets = new Set(requiredAssetIds.map((id) => visualArt.bindings.find((binding) => binding.id === id)?.resourceId));
    for (const assetId of requiredAssetIds) {
      const resourceId = visualArt.bindings.find((binding) => binding.id === assetId)?.resourceId;
      if (!resourceId || !bundleAssets.has(resourceId)) {
        throw new Error(`stages.json[${stageIndex}].assetBundleId: "${stage.assetBundleId}" is missing arena asset "${assetId}"`);
      }
    }
    if (bundleAssets.size !== requiredAssets.size) {
      throw new Error(`stages.json[${stageIndex}].assetBundleId: "${stage.assetBundleId}" must contain exactly the arena visual assets`);
    }
  }
  const declaredAssets = new Set(bundles.flatMap((bundle) => bundle.resourceIds));
  for (const binding of visualArt.bindings) {
    if (binding.kind === 'world' && binding.required && (binding.resourceId === undefined || !declaredAssets.has(binding.resourceId))) {
      throw new Error(`visual-art.json: required world binding "${binding.id}" is not declared by an asset bundle`);
    }
  }
}
