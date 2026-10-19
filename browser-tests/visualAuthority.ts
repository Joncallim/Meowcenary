import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { visualAuthorityLaunchOptions } from '../scripts/browserSoftwareRenderer';
import { readPhaserRendererFacts } from './rendererSetup';

const recordedPages = new WeakMap<TestInfo, number>();
const ownedPages = new WeakMap<TestInfo, Set<Page>>();

/** Register a page from an explicitly owned context for afterEach verification. */
export function registerVisualAuthorityPage(page: Page, testInfo: TestInfo): void {
  const pages = ownedPages.get(testInfo) ?? new Set<Page>();
  pages.add(page);
  ownedPages.set(testInfo, pages);
}

/** Use before closing an explicitly owned context; afterEach covers fixture pages. */
export async function assertVisualAuthority(page: Page, testInfo: TestInfo): Promise<void> {
  await expect(page.locator('#game-root canvas')).toBeVisible();
  const facts = await readPhaserRendererFacts(page);
  const expectedRenderer = process.env.MEOWCENARY_VISUAL_AUTHORITY_RENDERER;
  const record = { role: 'visual-authority', project: testInfo.project.name,
    title: testInfo.title, expectedRenderer, viewport: page.viewportSize(), facts };
  console.log(`VISUAL_AUTHORITY_RENDERER ${JSON.stringify(record)}`);
  await testInfo.attach('visual-authority-renderer', {
    body: JSON.stringify(record), contentType: 'application/json',
  });
  expect(expectedRenderer, 'default preflight must establish the visual driver').toBeTruthy();
  expect(facts.renderer, 'actual fixture must replace inherited runtime Mesa options').toBe(expectedRenderer);
  expect(facts.context).not.toBeNull();
  expect(facts.antialias).toBe(true);
  expect(facts.stencil).toBe(true);
  expect(facts.drawingWidth).toBeGreaterThan(0);
  expect(facts.drawingHeight).toBeGreaterThan(0);
  recordedPages.set(testInfo, (recordedPages.get(testInfo) ?? 0) + 1);
}

/** Entire committed-image modules retain their original renderer, including
 * their non-image assertions. Call in each module; import caching cannot own it. */
export function useVisualAuthority(): void {
  test.use({ launchOptions: visualAuthorityLaunchOptions(process.platform,
    process.env.MEOWCENARY_BROWSER_RENDERER, process.env) });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'skipped') return;
    // Runs before fixture teardown, including failed image comparisons.
    // Verify the fixture page and every still-open page registered from an
    // explicitly owned context. This keeps a screenshot failure primary while
    // still proving that the actual game page used by the test was inspected.
    const pages = new Set<Page>();
    if (!page.isClosed() && page.url() !== 'about:blank') pages.add(page);
    for (const owned of ownedPages.get(testInfo) ?? []) {
      if (!owned.isClosed() && owned.url() !== 'about:blank') pages.add(owned);
    }
    for (const actual of pages) await assertVisualAuthority(actual, testInfo);
    expect(recordedPages.get(testInfo) ?? 0, 'an executed test must verify its actual game canvas').toBeGreaterThan(0);
  });
}
