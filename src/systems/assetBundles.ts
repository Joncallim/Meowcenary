import { deepFreeze } from '../engine/freeze';
import type { AssetBundleDefinition, VisualArtBinding } from './types';
import type { VisualArtLookup } from './visualArt';

/**
 * Resolves data-owned stage bundles to the real visual bindings the loader
 * consumes. It deliberately receives canonical IDs; no stage or arena name is
 * reconstructed here.
 */
export class DataAssetBundleRegistry {
  private readonly bundlesById = new Map<string, readonly Readonly<VisualArtBinding>[]>();
  private readonly allStageBindings: readonly Readonly<VisualArtBinding>[];

  constructor(
    data: { readonly assetBundles: readonly AssetBundleDefinition[] },
    visualArt: VisualArtLookup,
  ) {
    const seen = new Set<string>();
    const all: Readonly<VisualArtBinding>[] = [];
    for (const bundle of data.assetBundles) {
      const bindings = bundle.assetIds.map((id) => {
        const binding = visualArt.bindingById(id);
        if (!binding) throw new Error(`Asset bundle "${bundle.id}" references unloaded visual art "${id}"`);
        return deepFreeze(structuredClone(binding));
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
    this.allStageBindings = Object.freeze(all);
  }

  bindingsForBundle(id: string): readonly Readonly<VisualArtBinding>[] | undefined {
    return this.bundlesById.get(id);
  }

  /** Union of declared stage bundles for initial preload before stage selection. */
  allBindings(): readonly Readonly<VisualArtBinding>[] {
    return this.allStageBindings;
  }
}
