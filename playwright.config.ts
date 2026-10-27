import { defineConfig } from '@playwright/test';
import { browserSoftwareRenderer } from './scripts/browserSoftwareRenderer';

// These extra landscapes were introduced for the INT-FB/late fixture routes.
// The original six projects retain the complete legacy product suite. Compact
// touch landscape is deliberately blocked by that product's portrait guard.
// Keep the broader legacy landscape audit reproducible without claiming its
// unresolved layout/readability gaps are accepted first-slice coverage.
const fixtureLandscapeTests = process.env.MEOWCENARY_LEGACY_LANDSCAPE_AUDIT === '1'
  ? undefined : ['**/integrated-fixture-recovery.pw.ts', '**/late-fixture.pw.ts'];

export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.pw.ts',
  globalSetup: './browser-tests/rendererSetup.ts',
  fullyParallel: false,
  // Phaser owns a single CPU-heavy render loop per page. Serial CI projects
  // keep visual evidence deterministic instead of letting concurrent viewport
  // runs starve scene/resource transitions on shared runners.
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    screenshot: 'only-on-failure',
    launchOptions: browserSoftwareRenderer(process.platform, process.env.MEOWCENARY_BROWSER_RENDERER, process.env),
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'phone-360x640', use: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true } },
    { name: 'phone-390x844', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'phone-landscape-640x390', testMatch: fixtureLandscapeTests, use: { viewport: { width: 640, height: 390 }, hasTouch: true, isMobile: true } },
    { name: 'tablet-768x1024', use: { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true } },
    { name: 'tablet-landscape-1024x768', testMatch: fixtureLandscapeTests, use: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } },
    { name: 'foldable-1114x720', use: { viewport: { width: 1114, height: 720 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1280x720', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'desktop-1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
