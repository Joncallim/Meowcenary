// Matched warm-route control: same build, fixture, waits and renderer, probe on/off.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const base = option('--url', 'http://127.0.0.1:4261');
const out = option('--out', '/tmp/meow209-controls');
const primary = JSON.parse(await readFile(option('--baseline', '/tmp/meow209-baseline-ef8d90c/results.json')));
assert.equal(primary.exit, 0);
assert.equal((await (await fetch(`${base}/build-meta.json`)).json()).commit, primary.measurementSHA);
await mkdir(out, { recursive: true });
const result = { measurementSHA: primary.measurementSHA, method: 'Same served instrumented build, explicit perf opt-in ON/OFF; same seeded save and matched existing route-seam readiness observer. Warm route latency includes that observer equally in both groups; not first-presented timing.', cohorts: [] };
const browser = await chromium.launch();
try {
 for (const profile of [...new Map(primary.cohorts.map(c => [c.profile.name, c.profile])).values()]) {
  for (let repeat = 0; repeat < 3; repeat++) {
   for (const enabled of repeat % 2 ? [true, false] : [false, true]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
     deviceScaleFactor: profile.dpr, isMobile: profile.touch, hasTouch: profile.touch });
    await context.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), primary.cohorts[0].fixture);
    const page = await context.newPage(); const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu }); await client.send('Performance.enable');
    await page.goto(`${base}/?visual-test=1${enabled ? '&perf-test=1' : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(globalThis.__MEOWCENARY_VISUAL_TEST__));
    await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation());
    assert.equal(await page.evaluate(() => Boolean(globalThis.__MEOWCENARY_PERFORMANCE__)), enabled);
    for (const panel of ['loadout', 'equipment', 'gunsmith', 'home']) {
     await page.evaluate(async panel => { if (!globalThis.__MEOWCENARY_VISUAL_TEST__.showMenu(panel)) throw new Error('route rejected');
      await globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation(); }, panel);
    }
    const row = { profile, repeat, enabled, actions: [] }; result.cohorts.push(row);
    for (const panel of ['loadout', 'equipment', 'gunsmith', 'home']) {
     const before = await client.send('Performance.getMetrics');
     const action = await page.evaluate(async panel => {
      const start = performance.now();
      if (!globalThis.__MEOWCENARY_VISUAL_TEST__.showMenu(panel)) throw new Error('route rejected');
      await globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation();
      return { panel, observedDurationMs: performance.now() - start };
     }, panel);
     row.actions.push({ ...action, before, after: await client.send('Performance.getMetrics') });
    }
    await context.close();
   }
  }
  process.stdout.write(`${profile.name}: 3 matched ON/OFF pairs\n`);
 }
 result.exit = 0;
} catch (error) { result.exit = 1; result.error = String(error); throw error; }
finally { await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2)); await browser.close(); }
