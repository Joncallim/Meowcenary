import { chromium, type FullConfig, type Page } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus, platform, release } from 'node:os';
import { assertBrowserRenderer, browserSoftwareRenderer } from '../scripts/browserSoftwareRenderer';

/** Read the existing Phaser canvas; never create a capability canvas. */
export async function readPhaserRendererFacts(page: Page) {
  return page.evaluate(() => {
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
}

/** Fail before the matrix if the requested test driver silently falls back.
 * Renderer framing still exercises the legacy presentation deliberately: the
 * production root is now the integrated B1 slice, while `fixture=legacy`
 * remains the explicit route for the retained Menu scene. */
export default async function rendererSetup(config: FullConfig): Promise<void> {
  const mode = process.env.MEOWCENARY_BROWSER_RENDERER;
  const records: unknown[] = [];
  for (const [role, rendererMode] of [['runtime', mode], ['visual-authority', undefined]] as const) {
    const browser = await chromium.launch(browserSoftwareRenderer(process.platform, rendererMode, process.env));
    let operationError: unknown;
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`${config.projects[0].use.baseURL}/?fixture=legacy&visual-test=1`);
      await page.waitForFunction(() => Boolean((globalThis as unknown as { __MEOWCENARY_VISUAL_TEST__?: unknown }).__MEOWCENARY_VISUAL_TEST__));
      const settled = await page.evaluate(() => (globalThis as unknown as {
        __MEOWCENARY_VISUAL_TEST__: { waitForMenuPresentation(): Promise<boolean> };
      }).__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation());
      if (settled !== true) throw new Error('Actual renderer probe Home did not settle');
      const facts = await readPhaserRendererFacts(page);
      const metadata = {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        trackedDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()),
        role, requested: rendererMode ?? 'browser-default', browser: browser.version(), facts,
        host: { platform: platform(), release: release(), availableParallelism: availableParallelism(), cpu: cpus()[0]?.model },
      };
      await mkdir('test-results', { recursive: true });
      records.push(metadata);
      await writeFile('test-results/browser-renderer.json', `${JSON.stringify(records, null, 2)}\n`);
      console.log(`BROWSER_RENDERER ${JSON.stringify(metadata)}`);
      assertBrowserRenderer(facts, rendererMode);
      if (role === 'visual-authority') {
        if (!facts.renderer || (mode === 'mesa' && !facts.renderer.includes('SwiftShader')))
          throw new Error('Canonical Linux image suites did not retain their original default renderer');
        process.env.MEOWCENARY_VISUAL_AUTHORITY_RENDERER = facts.renderer;
      }
    } catch (error) { operationError = error; throw error; }
    finally {
      try { await browser.close(); }
      catch (error) {
        if (operationError !== undefined) throw new AggregateError([operationError, error], 'Renderer probe and cleanup failed');
        throw error;
      }
    }
  }
}
