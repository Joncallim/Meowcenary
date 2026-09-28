import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

const DESTINATIONS = [
  'play-contract', 'mercenary', 'loadout', 'career', 'training', 'settings',
  'equipment', 'gunsmith', 'achievements', 'compendium', 'change-contract',
] as const;

describe('large menu navigation art', () => {
  it('covers every player-facing destination with the selected production atlas', () => {
    const art = new DataVisualArtRegistry(loadGameData());
    for (const destination of DESTINATIONS) {
      expect(art.bindingById(`nav-icon:${destination}`)).toMatchObject({
        resourceId: 'resource:navigation-icons',
        kind: 'icon',
        required: true,
        display: { width: 96, height: 96 },
      });
    }
    expect(art.bindingById('nav-icon:change-contract')?.frameKey).toBe('nav-icon:change-contract');
    expect(art.bindingById('nav-icon:change-contract')?.frameKey)
      .not.toBe(art.bindingById('nav-icon:play-contract')?.frameKey);
  });

  it('keeps generated master, editable source, and deterministic runtime export in parity', () => {
    expect(() => execFileSync('python3', ['docs/art/scripts/build-navigation-concept-atlas.py', '--check']))
      .not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/ui/navigation-icons-atlas.json', 'utf8')) as {
      size_x: number;
      size_y: number;
      frames: Record<string, { frame: { w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([2112, 192]);
    expect(Object.keys(atlas.frames).sort()).toEqual(DESTINATIONS.map((id) => `nav-icon:${id}`).sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 192 && frame.h === 192)).toBe(true);
  });
});
