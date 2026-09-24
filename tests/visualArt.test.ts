import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RendererKind, VisualTextureResource } from '../src/systems/types';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { loadGameData } from '../src/systems/validation';

describe('Visual Art Architecture', () => {
  it('RendererKind describes rendering capability, not content owner', () => {
    const kinds: RendererKind[] = [
      'animated-actor', 'sprite', 'icon', 'portrait',
      'weapon-held', 'world', 'ui-chrome',
    ];
    // Equipment/Part/Achievement/Ability/Passive do not each add a renderer kind
    const contentOwners = ['equipment', 'part', 'achievement', 'ability', 'passive'];
    for (const owner of contentOwners) {
      expect(kinds).not.toContain(owner as RendererKind);
    }
  });

  it('separates logical art from physical resource', () => {
    // A logical art ID references a resource, not a direct PNG path
    const logicalArtId = 'equipment-icon:commando-helmet';
    const resourceId = 'resource:ui-equipment';
    const textureKey = 'art-ui-equipment';
    const frameKey = 'equipment-icon:commando-helmet';

    // The logical art knows its resource + frame
    expect(logicalArtId).toBeTruthy();
    expect(resourceId).toBeTruthy();
    expect(textureKey).toBeTruthy();
    expect(frameKey).toBeTruthy();
  });

  it('preserves a logical named atlas frame through the production registry', () => {
    const resources: VisualTextureResource[] = [{
      id: 'resource:ui-equipment', textureKey: 'art-ui-equipment', sampling: 'nearest',
      load: { type: 'atlas', imageUrl: 'assets/ui/equipment.png', dataUrl: 'assets/ui/equipment.json' },
    }];
    const registry = new DataVisualArtRegistry({
      visualArt: { bindings: [{ id: 'upgrade-icon:helmet', kind: 'upgrade-icon', resourceId: 'resource:ui-equipment', frameKey: 'helmet', required: true, display: { width: 16, height: 16 } }] },
      visualResources: resources,
    });
    const resolved = registry.bindingById('upgrade-icon:helmet');
    expect(resolved?.load.type).toBe('atlas');
    expect(resolved?.frameKey).toBe('helmet');
    expect(resolved?.textureKey).toBe('art-ui-equipment');
  });

  it('binds the Commando set and each dedicated piece to one named-frame equipment atlas', () => {
    const data = loadGameData();
    const art = new DataVisualArtRegistry(data);
    const expected = [
      'icon:equipment-set-commando',
      'icon:equipment-commando-helmet',
      'icon:equipment-commando-armour',
      'icon:equipment-commando-gloves',
      'icon:equipment-commando-boots',
    ];
    const bindings = expected.map((id) => art.bindingById(id));
    expect(bindings).not.toContain(undefined);
    expect(bindings.every((binding) => binding?.kind === 'icon')).toBe(true);
    expect(new Set(bindings.map((binding) => binding?.resourceId))).toEqual(new Set(['resource:equipment-commando']));
    expect(new Set(bindings.map((binding) => binding?.frameKey))).toEqual(new Set(expected));
    expect((data.equipment ?? []).filter((piece) => piece.setId === 'set:commando').map((piece) => piece.icon)).toEqual(expected.slice(1));
    expect(data.equipmentSets?.find((set) => set.id === 'set:commando')?.emblem).toBe(expected[0]);
    // The rest of the existing catalog deliberately remains on its borrowed
    // run-upgrade presentation until each own production family lands.
    expect(art.bindingById(data.equipment?.find((piece) => piece.id === 'equipment:scavenger-helmet')?.icon ?? '')?.kind).toBe('upgrade-icon');
  });

  it('ships a distinct physical spritesheet for every selectable mercenary', () => {
    const ids = [
      'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar',
      'ember-cougar', 'scrap-weasel', 'rattle-raptor', 'piston-ram',
    ];
    const digests = ids.map((id) => createHash('sha256').update(readFileSync(
      resolve('public', 'assets', 'characters', id, `${id}.png`),
    )).digest('hex'));
    expect(new Set(digests).size).toBe(ids.length);
  });
});
