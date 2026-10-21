import type { LaunchOptions } from '@playwright/test';

/** Test infrastructure only. An explicit request must never silently fall back. */
export function browserSoftwareRenderer(
  platform: string,
  mode: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): LaunchOptions | undefined {
  const executablePath = environment.MEOWCENARY_BROWSER_EXECUTABLE;
  const executableEnvironment = executablePath ? {
    ...Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    XDG_CACHE_HOME: '/tmp/meowcenary-browser-cache',
    XDG_CONFIG_HOME: '/tmp/meowcenary-browser-config',
  } : undefined;
  const executableArgs = executablePath ? ['--no-sandbox', '--disable-breakpad', '--disable-crash-reporter'] : [];
  const executableOptions = executablePath ? { executablePath, args: executableArgs, env: executableEnvironment } : {};
  if (mode === undefined) return executablePath ? executableOptions : undefined;
  if (mode !== 'mesa') throw new Error(`Unsupported browser renderer: ${mode}`);
  if (platform !== 'linux') throw new Error('Mesa browser acceptance requires Linux');
  return {
    ...executableOptions,
    args: [...executableArgs, '--use-gl=angle', '--use-angle=gl-egl', '--ozone-platform=headless', '--ignore-gpu-blocklist'],
    env: {
      ...(executableEnvironment ?? Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))),
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

/** Committed pixel references retain their original browser-default backend.
 * Validate explicit requests, then replace (never merge) runtime launch options. */
export function visualAuthorityLaunchOptions(
  platform: string,
  mode: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): LaunchOptions {
  browserSoftwareRenderer(platform, mode, environment);
  return {};
}
