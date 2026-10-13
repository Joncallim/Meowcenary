import type { LaunchOptions } from '@playwright/test';

/** Test infrastructure only. An explicit request must never silently fall back. */
export function browserSoftwareRenderer(
  platform: string,
  mode: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): LaunchOptions | undefined {
  if (mode === undefined) return undefined;
  if (mode !== 'mesa') throw new Error(`Unsupported browser renderer: ${mode}`);
  if (platform !== 'linux') throw new Error('Mesa browser acceptance requires Linux');
  return {
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ozone-platform=headless', '--ignore-gpu-blocklist'],
    env: {
      ...Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      LIBGL_ALWAYS_SOFTWARE: '1',
      EGL_PLATFORM: 'surfaceless',
    },
  };
}

export interface BrowserRendererFacts {
  context: 'webgl' | 'webgl2' | null;
  renderer: string | null;
  antialias: boolean | null;
  stencil: boolean | null;
  drawingWidth: number;
  drawingHeight: number;
}

/** Check the actual Phaser canvas, not a separate capability/demo canvas. */
export function assertBrowserRenderer(facts: BrowserRendererFacts, mode: string | undefined): void {
  if (!facts.context) throw new Error('Browser acceptance requires the actual Phaser WebGL canvas');
  if (facts.drawingWidth !== 1920 || facts.drawingHeight !== 1080) throw new Error('Renderer probe changed the required drawing dimensions');
  if (facts.antialias !== true || facts.stencil !== true) throw new Error('Renderer probe lost Phaser antialias/stencil support');
  if (mode === 'mesa' && (!facts.renderer?.startsWith('ANGLE (Mesa') || !facts.renderer.includes('llvmpipe')))
    throw new Error(`Requested Mesa llvmpipe was not active: ${facts.renderer}`);
}
