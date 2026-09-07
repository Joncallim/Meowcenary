import { describe, expect, it } from 'vitest';
import {
  computeRunResourceClosure,
  computeMenuBundle,
  findSharedResources,
  physicalResourcesForBindings,
} from '../src/systems/resourceLoader';
import type { VisualTextureResource } from '../src/systems/types';

describe('Resource Loader', () => {
  const mockResources: VisualTextureResource[] = [
    {
      id: 'resource:char-tabby',
      textureKey: 'art-char-tabby',
      sampling: 'nearest',
      load: { type: 'image', imageUrl: 'assets/characters/tabby.png' },
    },
    {
      id: 'resource:enemy-dust-mite',
      textureKey: 'art-enemy-dust-mite',
      sampling: 'nearest',
      load: { type: 'spritesheet', imageUrl: 'assets/enemies/dust-mite.png', frameWidth: 32, frameHeight: 32 },
    },
    {
      id: 'resource:ui-equipment',
      textureKey: 'art-ui-equipment',
      sampling: 'nearest',
      load: { type: 'atlas', imageUrl: 'assets/ui/equipment.png', dataUrl: 'assets/ui/equipment.json' },
    },
  ];

  it('computes run resource closure', () => {
    const closure = computeRunResourceClosure(
      ['resource:char-tabby'],
      ['resource:enemy-dust-mite'],
      [],
      ['resource:world-junkyard'],
      ['resource:ui-equipment'],
    );
    expect(closure).toContain('resource:char-tabby');
    expect(closure).toContain('resource:enemy-dust-mite');
    expect(closure).toContain('resource:ui-equipment');
  });

  it('deduplicates resource IDs in closure', () => {
    const closure = computeRunResourceClosure(
      ['resource:char-tabby'],
      ['resource:char-tabby'], // same resource from multiple sources
      [], [], [],
    );
    expect(closure.length).toBe(1);
  });

  it('computes menu bundle from logical art IDs', () => {
    const registry = new Map(mockResources.map((r) => [r.id, r]));
    const artToResource = new Map<string, string>([
      ['character-portrait:tabby', 'resource:char-tabby'],
      ['enemy-icon:dust-mite', 'resource:enemy-dust-mite'],
    ]);
    const bundle = computeMenuBundle(registry, ['character-portrait:tabby'], artToResource);
    expect(bundle.length).toBe(1);
    expect(bundle[0].id).toBe('resource:char-tabby');
  });

  it('finds shared resources by texture key', () => {
    const resources: VisualTextureResource[] = [
      { id: 'resource:a', textureKey: 'shared-key', sampling: 'nearest', load: { type: 'image', imageUrl: 'a.png' } },
      { id: 'resource:b', textureKey: 'shared-key', sampling: 'nearest', load: { type: 'image', imageUrl: 'b.png' } },
    ];
    const shared = findSharedResources(resources);
    expect(shared.size).toBe(1);
    expect(shared.has('shared-key')).toBe(true);
  });

  it('uses the production physical-resource projection for 500 logical bindings without 500 texture loads', () => {
    const bindings = Array.from({ length: 500 }, (_, index) => ({
      id: `upgrade-icon:synthetic-${index}`,
      kind: 'upgrade-icon' as const,
      textureKey: 'art-synthetic-shared-atlas',
      url: 'assets/ui/synthetic-shared-atlas.png',
      required: true,
      sampling: 'nearest' as const,
      load: { type: 'image' as const },
      display: { width: 16, height: 16 },
    }));

    const resources = physicalResourcesForBindings(bindings);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.textureKey).toBe('art-synthetic-shared-atlas');
  });
});
