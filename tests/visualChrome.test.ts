import { describe, expect, it, vi } from 'vitest';
import { createUiVisualChrome } from '../src/ui/visualChrome';

describe('binding-based UI visual chrome', () => {
  it('builds semantic IDs without content-specific renderer branches', () => {
    const art = { bindingById: vi.fn((id: string) => id === 'ui-chrome:card' ? { id } : undefined), all: () => [] } as never;
    const chrome = createUiVisualChrome(art);
    expect(chrome.id('nav-icon', 'mercenary')).toBe('nav-icon:mercenary');
    expect(chrome.binding('ui-chrome:card')).toEqual({ id: 'ui-chrome:card' });
  });

  it('uses a nine-slice panel API and preserves explicit border insets', () => {
    const nineslice = vi.fn(() => ({ setScrollFactor: vi.fn(), setAlpha: vi.fn(), setDepth: vi.fn() }));
    const scene = { textures: { exists: () => true }, add: { nineslice } } as never;
    const art = { bindingById: (id: string) => ({ id, textureKey: 'ui', frameKey: id, display: { width: 24, height: 24 } }), all: () => [] } as never;
    createUiVisualChrome(art).addPanel(scene, 10, 20, 180, 96, 'modal', { depth: 800 });
    expect(nineslice).toHaveBeenCalledWith(10, 20, 'ui', 'ui-chrome:modal', 180, 96, 6, 6, 6, 6);
  });
});
