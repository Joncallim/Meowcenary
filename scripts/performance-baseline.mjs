// Explicit evidence runner, deliberately outside timing-sensitive CI gates.
// Build VITE_VISUAL_TEST=1, serve dist, then pass --url, --out, --repeats.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const base = option('--url', 'http://127.0.0.1:4261');
const output = option('--out', '/tmp/meow209-performance');
const repeats = Number(option('--repeats', '3'));
const windowMs = Number(option('--window-ms', '10000'));
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10);
assert(Number.isFinite(windowMs) && windowMs >= 1000 && windowMs <= 30000);
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('../src/data/equipment.json', import.meta.url)));
const fixture = {
  version: 4, settings: { muted: false, musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: false },
  progression: { scrap: 640, unlocks: ['capability:equipment-tier-2'] }, stages: {}, achievements: {}, characters: {},
  gunsmith: { selectedBuildId: 'build:pistol', fabricationSerials: {},
    builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
    parts: { heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] }, compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } },
  equipment: Object.fromEntries(catalog.map(piece => [`owned:${piece.id}`, { equipmentId: piece.id, tier: 1 }])),
  equipmentLoadout: { helmet: 'owned:equipment:commando-helmet', armour: 'owned:equipment:commando-armour', gloves: 'owned:equipment:recon-gloves' },
};
const meta = await (await fetch(`${base}/build-meta.json`)).json();
const result = { baselineSHA: '26f46fb5398c7eb769fe1bffa5ed60f80f20eea5', measurementSHA: meta.commit,
  sourceHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  started: new Date().toISOString(), environment: { platform: os.platform(), arch: os.arch(), release: os.release(),
    cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, totalMemory: os.totalmem(), node: process.version },
  method: { repeats, windowMs, frameWindow: 600, percentile: 'nearest rank', budgetMs: 1000 / 60,
    network: 'local Vite preview, unthrottled; resource timing transfer/encoded/decoded sizes retained',
    route: 'existing test-build route seam; real controller/render/load path, excludes input dispatch',
    action: 'real keyboard focus + Enter through shared logical input; latency includes held input edge',
    combat: 'real Training/resource/spawn/physics/weapon path; fixed run/fixture seeds; fixture grants60s invulnerability; no progression writes',
    result: 'existing dedicated terminal-presentation fixture + real keyboard return; not durable reward acceptance',
    rawFrames: 'Phaser raw loop cadence; gameplay frame samples are separately labelled smoothed simulation delta',
    limitations: ['Desktop Chromium/Linux virtual renderer, not physical Android/iOS.', 'CPU4x is emulation, not a calibrated phone.',
      'Browser polling and opt-in diagnostic object walks are excluded from recorded render duration but can perturb scheduling.',
      'No timing thresholds or claimed optimization in Phase A. Cold context has fresh HTTP cache; warm navigation keeps textures/cache.',
      'Combat uses seeded fixture inputs and wall-clock frame cadence; actual active/allocated counts are recorded, not assumed identical.'] }, cohorts: [] };
const browser = await chromium.launch();
result.environment.browser = browser.version();
const snapshot = async page => page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot());
const compact = state => ({ ...state, owners: state.owners.filter(owner => owner.sampleCount > 0) });
const settle = async page => {
  assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation()), true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
};
const press = async (page, key) => {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(70); } finally { await page.keyboard.up(key); }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
async function focus(page, predicate) {
  for (let step = 0; step < 120; step++) {
    const state = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.menuLoadoutDiagnostics());
    const row = state.buttons.find(predicate);
    assert(row, 'target semantic action exists');
    if (row.focused) return;
    await press(page, 'ArrowDown');
  }
  throw new Error('semantic focus did not reach target');
}
async function route(page, panel, name) {
  const measured = await page.evaluate(async panel => {
    const probe = globalThis.__MEOWCENARY_PERFORMANCE__;
    probe.resetMeasurement(); const started = performance.now();
    if (!globalThis.__MEOWCENARY_VISUAL_TEST__.showMenu(panel)) throw new Error('route did not accept');
    await globalThis.__MEOWCENARY_VISUAL_TEST__.waitForMenuPresentation();
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    return { durationMs: performance.now() - started, state: probe.snapshot() };
  }, panel);
  assert.equal(measured.state.menu.panel, panel);
  assert.equal(measured.state.menu.settled, true);
  return { name, ...measured, state: compact(measured.state) };
}
async function inputAction(page, name, key = 'Enter') {
  const started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
  await press(page, key); await settle(page);
  return { name, durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(await snapshot(page)) };
}
async function launch(page, name, seed) {
  const started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
  assert.equal(await page.evaluate(seed => globalThis.__MEOWCENARY_VISUAL_TEST__.startPerformanceTraining(seed), seed), true);
  await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().run?.status === 'active');
  const state = await snapshot(page); assert.equal(state.run.seed, seed); assert.equal(state.run.training, true);
  return { name, durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(state) };
}
async function terminalReturn(page, name) {
  assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.showRunSummary('lost')), true);
  await page.waitForTimeout(200); await press(page, 'ArrowDown'); await press(page, 'ArrowDown');
  const started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
  await press(page, 'Enter');
  await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().menu?.settled === true);
  const state = await snapshot(page); assert.equal(state.menu.panel, 'home'); assert.equal(state.gameplay, undefined);
  return { name, durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(state) };
}
try {
  for (const profile of [{ name: 'desktop-1280x720', width: 1280, height: 720, dpr: 1, touch: false, cpu: 1 },
    { name: 'phone-390x844-dpr3', width: 390, height: 844, dpr: 3, touch: true, cpu: 4 },
    { name: 'foldable-1114x720-dpr2', width: 1114, height: 720, dpr: 2, touch: true, cpu: 4 }]) {
    if (option('--profile', 'all') !== 'all' && option('--profile', 'all') !== profile.name) continue;
    for (let repeat = 0; repeat < repeats; repeat++) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr, hasTouch: profile.touch, isMobile: profile.touch });
      await context.addInitScript(save => localStorage.setItem('meowcenary.save.v2', JSON.stringify(save)), fixture);
      const page = await context.newPage(); const client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      await client.send('Performance.enable');
      const cohort = { profile, repeat, errors: [], actions: [], fixture, checkpoints: [] }; result.cohorts.push(cohort);
      page.on('pageerror', error => cohort.errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') cohort.errors.push(message.text()); });
      page.on('requestfailed', request => cohort.errors.push({ url: request.url(), failure: request.failure() }));
      const encodings = {};
      page.on('response', response => { if (response.status() >= 400) cohort.errors.push({ url: response.url(), status: response.status() });
        const encoding = response.headers()['content-encoding']; if (encoding) encodings[response.url()] = encoding; });
      await page.goto(`${base}/?visual-test=1&perf-test=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__?.snapshot().menu?.settled === true);
      const cold = await snapshot(page);
      cohort.actions.push({ name: 'cold-usable-home', durationMs: await page.evaluate(() => performance.now()), state: compact(cold) });
      cohort.coldResources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({
        path: new URL(entry.name).pathname, startMs: entry.startTime, durationMs: entry.duration,
        transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
      })));
      cohort.encodings = encodings;
      await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement()); await page.waitForTimeout(1500);
      cohort.actions.push({ name: 'warm-home', durationMs: 1500, state: compact(await snapshot(page)) });
      for (const [name, panel] of [['home-contract', 'stage'], ['home-mercenary', 'character'], ['home-career', 'career'], ['loadout-entry', 'loadout'], ['equipment-entry', 'equipment']]) {
        await route(page, 'home', 'setup-home'); cohort.actions.push(await route(page, panel, name));
      }
      await focus(page, row => row.key === 'equipment-candidate:owned:equipment:recon-helmet');
      cohort.actions.push(await inputAction(page, 'equipment-select'));
      await focus(page, row => row.key === 'equipment-equip:owned:equipment:recon-helmet');
      cohort.actions.push(await inputAction(page, 'equipment-equip'));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')));
      assert.equal(saved.equipmentLoadout.helmet, 'owned:equipment:recon-helmet');
      await focus(page, row => row.key === 'equipment-blueprint:equipment:commando-helmet');
      cohort.actions.push(await inputAction(page, 'equipment-blueprint-select'));
      await focus(page, row => row.key === 'equipment-fabricate:equipment:commando-helmet');
      const countBefore = Object.keys(saved.equipment).length;
      cohort.actions.push(await inputAction(page, 'equipment-fabricate'));
      assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('meowcenary.save.v2')).equipment).length), countBefore + 1);
      await route(page, 'home', 'setup-home'); cohort.actions.push(await route(page, 'gunsmith', 'gunsmith-entry'));
      await focus(page, row => row.text.startsWith('Pistol Build'));
      cohort.actions.push(await inputAction(page, 'gunsmith-build-select'));
      await focus(page, row => row.text.startsWith('Compact Receiver T1 • OWNED'));
      cohort.actions.push(await inputAction(page, 'gunsmith-part-replace'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('meowcenary.save.v2')).gunsmith.builds[0].fitted.receiver), 'compact');
      for (const [name, panel] of [['warm-equipment-entry', 'equipment'], ['warm-gunsmith-entry', 'gunsmith'], ['warm-home-return', 'home']]) cohort.actions.push(await route(page, panel, name));
      await page.screenshot({ path: `${output}/${profile.name}-${repeat}-warm-home.png`, scale: 'css' });
      cohort.actions.push(await launch(page, 'menu-prepared-game', 209001));
      assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.preparePerformanceCombat(209101, 0)), true);
      await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement());
      const metricsBefore = await client.send('Performance.getMetrics');
      await page.waitForTimeout(windowMs);
      const light = await snapshot(page); assert.equal(light.run.status, 'active', 'light window stays combat-active');
      cohort.actions.push({ name: 'light-combat', durationMs: windowMs, state: compact(light), metricsBefore, metricsAfter: await client.send('Performance.getMetrics') });
      let started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
      await press(page, 'Escape'); await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().run?.status === 'paused');
      cohort.actions.push({ name: 'pause', durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(await snapshot(page)) });
      started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
      await press(page, 'Escape'); await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().run?.status === 'active');
      cohort.actions.push({ name: 'resume', durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(await snapshot(page)) });
      started = await page.evaluate(() => { globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement(); return performance.now(); });
      await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(200);
      await page.setViewportSize({ width: profile.width, height: profile.height });
      await page.waitForFunction(() => document.getElementById('portrait-orientation-guard')?.hidden === true);
      await page.waitForTimeout(200);
      cohort.actions.push({ name: 'resize-orientation-return', durationMs: await page.evaluate(start => performance.now() - start, started), state: compact(await snapshot(page)) });
      cohort.actions.push(await terminalReturn(page, 'run-result-menu'));
      cohort.actions.push(await launch(page, 'warm-menu-prepared-game', 209002));
      assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.preparePerformanceCombat(209102, 48)), true);
      await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.resetMeasurement());
      const heavyBefore = await client.send('Performance.getMetrics');
      await page.waitForTimeout(windowMs);
      const heavy = await snapshot(page); assert.equal(heavy.run.status, 'active', 'heavy window stays combat-active');
      assert.equal(heavy.run.fixture.spawned, 48);
      cohort.actions.push({ name: 'heavy-combat', durationMs: windowMs, state: compact(heavy), metricsBefore: heavyBefore, metricsAfter: await client.send('Performance.getMetrics') });
      await page.screenshot({ path: `${output}/${profile.name}-${repeat}-heavy-combat.png`, scale: 'css' });
      cohort.actions.push(await terminalReturn(page, 'warm-run-result-menu'));
      cohort.metrics = await client.send('Performance.getMetrics');
      assert.equal(cohort.errors.length, 0, 'benchmark browser errors');
      await context.close();
      await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2));
      process.stdout.write(`${profile.name} repeat${repeat + 1}: ${cohort.actions.length} checkpoints complete\n`);
    }
  }
  result.exit = 0;
} catch (error) { result.exit = 1; result.error = String(error); throw error; }
finally { result.finished = new Date().toISOString(); await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2)); await browser.close(); }
