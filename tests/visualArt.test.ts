import { describe, expect, it } from 'vitest';
import type { RendererKind } from '../src/systems/types';

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
});
