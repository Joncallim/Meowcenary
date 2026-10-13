import { chromium, type FullConfig } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { assertBrowserRenderer, browserSoftwareRenderer } from '../scripts/browserSoftwareRenderer';

/** Fail before the matrix if the requested test driver silently falls back.
 * This page uses the normal visual-build Home and its real loader/frame owners. */
export default async function rendererSetup(config: FullConfig): Promise<void> {
  const mode = process.env.MEOWCENARY_BROWSER_RENDERER;
  const browser = await chromium.launch(browserSoftwareRenderer(process.platform, mode, process.env));
  let operationError: unknown;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${config.projects[0].use.baseURL}/?visual-test=1`);
    await page.waitForFunction(() => Boolean((globalThis as unknown as { __MEOWCENARY_VISUAL_TEST__?: unknown }).__MEOWCENARY_VISUAL_TEST__));
    const settled = await page.evaluate(() => (globalThis as unknown as {
      __MEOWCENARY_VISUAL_TEST__: { waitForMenuPresentation(): Promise<boolean> };
    }).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation());
    if (settled !== true) throw new Error('Actual renderer probe Home did not settle');
    const facts = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('Missing actual Phaser canvas');
      const first = canvas.getContext('webgl');
      const gl = first ?? canvas.getContext('webgl2');
      const attributes = gl?.getContextAttributes();
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        context: gl ? first ? 'webgl' as const : 'webgl2' as const : null,
        renderer: gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
        antialias: attributes?.antialias ?? null, stencil: attributes?.stencil ?? null,
        drawingWidth: gl?.drawingBufferWidth ?? 0, drawingHeight: gl?.drawingBufferHeight ?? 0,
        samples: gl ? Number(gl.getParameter(gl.SAMPLES)) : null,
      };
    });
    const metadata = {
      head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      trackedDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()),
      requested: mode ?? 'browser-default', browser: browser.version(), facts,
      host: { platform: platform(), release: release(), availableParallelism: availableParallelism(), cpu: cpus()[0]?.model },
    };
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/browser-renderer.json', `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`BROWSER_RENDERER ${JSON.stringify(metadata)}`);
    assertBrowserRenderer(facts, mode);
  } catch (error) { operationError = error; throw error; }
  finally {
    try { await browser.close(); }
    catch (error) {
      if (operationError !== undefined) throw new AggregateError([operationError, error], 'Renderer probe and cleanup failed');
      throw error;
    }
  }
}
