import { describe, expect, it } from 'vitest';
import { assertBrowserRenderer, browserSoftwareRenderer, visualAuthorityLaunchOptions, type BrowserRendererFacts } from '../scripts/browserSoftwareRenderer';

const actual: BrowserRendererFacts = {
  context: 'webgl', renderer: 'ANGLE (Mesa, llvmpipe (LLVM 18.1.8 256 bits), OpenGL ES 3.2)',
  antialias: true, stencil: true, drawingWidth: 1920, drawingHeight: 1080,
};

describe('explicit browser software renderer', () => {
  it('keeps ordinary unspecified browser launches unchanged', () => {
    expect(browserSoftwareRenderer('linux', undefined, {})).toBeUndefined();
    expect(browserSoftwareRenderer('darwin', undefined, {})).toBeUndefined();
  });
  it('keeps canonical image suites on default without inheriting runtime flags or environment', () => {
    expect(visualAuthorityLaunchOptions('linux', 'mesa', { LIBGL_ALWAYS_SOFTWARE: '1' })).toEqual({});
    expect(visualAuthorityLaunchOptions('darwin', undefined, {})).toEqual({});
    expect(() => visualAuthorityLaunchOptions('linux', 'mesaa', {})).toThrow('Unsupported');
  });
  it('rejects a misspelled or unsupported request instead of silently passing with another backend', () => {
    expect(() => browserSoftwareRenderer('linux', 'mesaa', {})).toThrow('Unsupported');
    expect(() => browserSoftwareRenderer('darwin', 'mesa', {})).toThrow('requires Linux');
  });
  it('forces software rendering without changing driver-level antialiasing or the game canvas', () => {
    const options = browserSoftwareRenderer('linux', 'mesa', { DISPLAY: ':99', UNUSED: undefined });
    expect(options?.env).toEqual({ DISPLAY: ':99', LIBGL_ALWAYS_SOFTWARE: '1', EGL_PLATFORM: 'surfaceless' });
    expect(options?.args).not.toContain('--disable-gpu');
    expect(options?.args).not.toContain('--disable-software-rasterizer');
    expect(() => assertBrowserRenderer(actual, 'mesa')).not.toThrow();
  });
  it('rejects actual Canvas fallback and silent SwiftShader fallback', () => {
    expect(() => assertBrowserRenderer({ ...actual, context: null }, 'mesa')).toThrow('actual Phaser');
    expect(() => assertBrowserRenderer({ ...actual, renderer: 'ANGLE (Google, Vulkan, SwiftShader)' }, 'mesa')).toThrow('not active');
  });
  it('rejects reduced dimensions, missing antialiasing and missing stencil support', () => {
    expect(() => assertBrowserRenderer({ ...actual, drawingWidth: 1280 }, 'mesa')).toThrow('dimensions');
    expect(() => assertBrowserRenderer({ ...actual, antialias: false }, 'mesa')).toThrow('antialias/stencil');
    expect(() => assertBrowserRenderer({ ...actual, stencil: false }, 'mesa')).toThrow('antialias/stencil');
  });
});
