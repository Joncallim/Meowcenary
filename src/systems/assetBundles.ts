import { deepFreeze } from '../engine/freeze';
import type { AssetBundleDefinition, VisualTextureResource } from './types';
import { DataVisualResourceRegistry } from './visualArt';

/**
 * Resolves data-owned stage bundles to the real visual bindings the loader
 * consumes. It deliberately receives canonical IDs; no stage or arena name is
 * reconstructed here.
 */
export class DataAssetBundleRegistry {
  private readonly bundlesById = new Map<string, readonly Readonly<VisualTextureResource>[]>();
  private readonly allResources: readonly Readonly<VisualTextureResource>[];

  constructor(
    data: { readonly assetBundles: readonly AssetBundleDefinition[]; readonly visualResources: readonly VisualTextureResource[] },
  ) {
    const resources = new DataVisualResourceRegistry(data);
    const seen = new Set<string>();
    const all: Readonly<VisualTextureResource>[] = [];
    for (const bundle of data.assetBundles) {
      const bindings = bundle.resourceIds.map((id) => {
        const resource = resources.resourceById(id);
        if (!resource) throw new Error(`Asset bundle "${bundle.id}" references missing visual resource "${id}"`);
        return deepFreeze(structuredClone(resource));
      });
      const frozen = Object.freeze(bindings);
      this.bundlesById.set(bundle.id, frozen);
      for (const binding of frozen) {
        if (!seen.has(binding.id)) {
          seen.add(binding.id);
          all.push(binding);
        }
      }
    }
    this.allResources = Object.freeze(all);
  }

  resourcesForBundle(id: string): readonly Readonly<VisualTextureResource>[] | undefined {
    return this.bundlesById.get(id);
  }

  all(): readonly Readonly<VisualTextureResource>[] {
    return this.allResources;
  }
}
