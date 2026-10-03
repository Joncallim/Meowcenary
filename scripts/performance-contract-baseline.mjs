// Supplementary real Contract launch evidence; no timing-sensitive CI threshold.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const base = option('--url', 'http://127.0.0.1:4261');
const out = option('--out', '/tmp/meow209-contracts');
const primary = JSON.parse(await readFile(option('--baseline', '/tmp/meow209-baseline-ef8d90c/results.json')));
assert.equal(primary.exit, 0);
const measurementSHA = option('--expected-sha', primary.measurementSHA);
assert.equal((await (await fetch(`${base}/build-meta.json`)).json()).commit, measurementSHA);
await mkdir(out, { recursive: true });
const result = { measurementSHA, fixtureSourceSHA: primary.measurementSHA,
 method: 'Fresh context, same baseline save, real Home Play Contract touch/pointer; end at POST_RENDER active prepared GameScene. Normal menu RNG seed is recorded, not overridden. No intervening panel warmup, combat fixture or progression settlement.', cohorts: [] };
const browser = await chromium.launch();
try {
 for (const profile of [...new Map(primary.cohorts.map(c => [c.profile.name, c.profile])).values()]) {
  for (let repeat = 0; repeat < 3; repeat++) {
   const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr, isMobile: profile.touch, hasTouch: profile.touch });
   await context.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), primary.cohorts[0].fixture);
   const page = await context.newPage(); const client = await context.newCDPSession(page);
   await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
   const errors = [];
   page.on('pageerror', error => errors.push(String(error)));
   page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
   page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
   page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
   await page.goto(`${base}/?visual-test=1&perf-test=1`, { waitUntil: 'domcontentloaded' });
   await page.waitForFunction(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__));
   assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation()), true);
   const target = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics()
    .buttons.find(button => button.text === 'Play Contract'));
   assert(target?.visible && target.interactive, 'real Contract action must be available');
   const start = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
   const { x, y, width, height } = target.bounds;
   if (profile.touch) await page.touchscreen.tap(x + width / 2, y + height / 2);
   else await page.mouse.click(x + width / 2, y + height / 2);
   await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun?.status === 'active');
   const state = await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot());
   assert.equal(state.run.training, false); assert.equal(state.run.status, 'active');
   assert(Number.isSafeInteger(state.run.seed)); assert.deepEqual(errors, []);
   result.cohorts.push({ profile, repeat, durationMs: state.presentedRun.atMs - start,
    observedDurationMs: await page.evaluate(start => performance.now() - start, start), errors, state });
   await context.close();
  }
  process.stdout.write(`${profile.name}: 3 actual Contract launches\n`);
 }
 result.exit = 0;
} catch (error) { result.exit = 1; result.error = String(error); throw error; }
finally { await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2)); await browser.close(); }
