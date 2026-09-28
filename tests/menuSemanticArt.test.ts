import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { loadGameData } from '../src/systems/validation';

const IDS = [
  'chapter-icon:junkyard', 'chapter-icon:forge',
  'objective-icon:kill', 'objective-icon:collect', 'objective-icon:survive', 'objective-icon:defeat',
  'settings-icon:master-audio', 'settings-icon:music', 'settings-icon:sfx',
  'settings-icon:reduced-motion', 'settings-icon:fullscreen',
] as const;

describe('illustrated Contract and Settings art', () => {
  it('resolves every active semantic through one bounded linear-filtered resource', () => {
    const data = loadGameData();
    const art = new DataVisualArtRegistry(data);
    const bindings = IDS.map((id) => art.bindingById(id));
    expect(bindings.every(Boolean)).toBe(true);
    expect(new Set(bindings.map((binding) => binding?.resourceId)))
      .toEqual(new Set(['resource:menu-semantic-icons']));
    expect(bindings.every((binding) => binding?.load.type === 'atlas' && binding.sampling === 'linear')).toBe(true);
    expect(data.assetBundles.find((bundle) => bundle.id === 'bundle:boot-core')?.resourceIds)
      .toContain('resource:menu-semantic-icons');
  });

  it('keeps selected masters, editable source and runtime frames in deterministic parity', () => {
    expect(() => execFileSync('python3', ['docs/art/scripts/build-menu-semantic-concept-atlas.py', '--check']))
      .not.toThrow();
    const atlas = JSON.parse(readFileSync('public/assets/ui/menu-semantic-icons-atlas.json', 'utf8')) as {
      size_x: number;
      size_y: number;
      frames: Record<string, { frame: { w: number; h: number } }>;
    };
    expect([atlas.size_x, atlas.size_y]).toEqual([1056, 96]);
    expect(Object.keys(atlas.frames).sort()).toEqual([...IDS].sort());
    expect(Object.values(atlas.frames).every(({ frame }) => frame.w === 96 && frame.h === 96)).toBe(true);
  });

  it('boots the approved Figma Clean Master wordmark and keeps its derivatives reproducible', () => {
    const data = loadGameData();
    const binding = new DataVisualArtRegistry(data).bindingById('brand:title-lockup');
    expect(binding).toMatchObject({
      resourceId: 'resource:brand-title-lockup',
      sampling: 'linear',
      load: { type: 'image' },
    });
    expect(data.visualResources.find((resource) => resource.id === 'resource:brand-title-lockup'))
      .toMatchObject({ load: { type: 'image', imageUrl: 'assets/ui/brand/meowcenary-title-lockup.png' } });
    expect(data.assetBundles.find((bundle) => bundle.id === 'bundle:boot-core')?.resourceIds)
      .toContain('resource:brand-title-lockup');
    expect(createHash('sha256')
      .update(readFileSync('assets-src/ui/brand/source/meowcenary-primary-logo-clean-master.svg'))
      .digest('hex'))
      .toBe('079c88f708fc96c9417eab00daffb360a7b3a5149887adc6d4f585ba74522a6c');
    expect(() => execFileSync('python3', ['docs/art/scripts/build-approved-brand-assets.py', '--check']))
      .not.toThrow();
  });
});
