import assert from 'node:assert/strict';

// Preparation ends at the first rendered intro (current builds) or active
// frame (historical builds). Continue and final Start have separate endpoints.
export async function waitForPerformanceRunStart(page, input = 'keyboard') {
  assert(['keyboard', 'mouse', 'touch'].includes(input), 'unsupported performance launch input');
  await page.waitForFunction(() => {
    const status = globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun?.status;
    return status === 'intro' || status === 'active';
  });
  const preparedRun = await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun);
  if (preparedRun.status === 'active') return { preparedRun, compatibility: 'already-active' };
  const read = () => page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.runStartIntroDiagnostics());
  const frame = async () => assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.waitForInputFrame()), true);
  const release = async () => {
    for (const key of ['Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'p', 'i']) await page.keyboard.up(key);
    await page.mouse.move(-1, -1); await page.mouse.up();
    const session = await page.context().newCDPSession(page);
    try { await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
    finally { await session.detach(); }
    await frame();
    await page.waitForFunction(() => {
      const state = globalThis.__MEOWCENARY_VISUAL_TEST__.runStartIntroDiagnostics();
      return state?.visible && state.ready && state.inputNeutral && !state.inputQuarantined;
    });
  };
  const command = async (name) => {
    await release();
    let before = await read();
    assert(before?.visible && before.status === 'intro' && before.timeMs === 0, 'rendered intro must remain frozen');
    assert.equal(before.runStart.count, 0); assert.equal(before.terminalEvents, 0);
    assert.equal(typeof before.revision, 'number');
    if (input === 'keyboard') {
      for (let step = 0; before.focusedCommand !== name && step < before.commands.length; step++) {
        await page.keyboard.down('ArrowRight'); try { await frame(); } finally { await page.keyboard.up('ArrowRight'); }
        await frame(); before = await read();
      }
      assert.equal(before.focusedCommand, name, 'logical focus must reach the semantic command');
    }
    const matches = before.commands.filter(row => row.command === name);
    assert.equal(matches.length, 1, `exactly one ${name} command is required`);
    const target = matches[0]; const { x, y, width, height } = target.bounds; const viewport = page.viewportSize();
    assert(target.enabled && width > 0 && height >= 44, 'intro command must be enabled and usable');
    assert(x >= 0 && y >= 0 && x + width <= viewport.width + .01 && y + height <= viewport.height + .01, 'intro command must be fully visible');
    const commandAtMs = await page.evaluate(() => performance.now());
    if (input === 'keyboard') {
      await page.keyboard.down('Enter'); try { await frame(); } finally { await page.keyboard.up('Enter'); }
    } else if (input === 'mouse') {
      await page.mouse.move(x + width / 2, y + height / 2); await page.mouse.down();
      try { await frame(); } finally { await page.mouse.up(); }
    } else {
      const session = await page.context().newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + width / 2, y: y + height / 2, id: 1 }] });
        await frame(); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally { await session.detach(); }
    }
    await frame();
    if (name === 'continue') {
      await page.waitForFunction(() => globalThis.__MEOWCENARY_VISUAL_TEST__.runStartIntroDiagnostics()?.phase === 'boss');
      const after = await read();
      assert.equal(after.visible, true); assert.equal(after.status, 'intro'); assert.equal(after.timeMs, 0);
      assert.equal(after.revision, before.revision + 1); assert.equal(after.runStart.count, 0); assert.equal(after.terminalEvents, 0);
      assert.deepEqual(after.identity, before.identity); assert.deepEqual(after.objective, before.objective);
      return { command: name, commandAtMs, completedAtMs: await page.evaluate(() => performance.now()) };
    }
    await page.waitForFunction(() => globalThis.__MEOWCENARY_VISUAL_TEST__.runStartIntroDiagnostics()?.runStart.count === 1);
    const after = await read();
    assert.equal(after.visible, false); assert.equal(after.phase, 'consumed'); assert.notEqual(after.status, 'intro');
    assert.equal(after.runStart.timeMs, 0); assert.equal(typeof after.runStart.atMs, 'number');
    return { commandAtMs, startedAtMs: after.runStart.atMs };
  };
  const initial = await read();
  assert(initial?.visible && initial.status === 'intro', 'new builds require an explicit intro');
  const dialogueCommands = [];
  if (initial.commands.some(row => row.command === 'continue')) dialogueCommands.push(await command('continue'));
  const start = await command('start');
  await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun?.status === 'active');
  return { preparedRun, compatibility: 'explicit-intro', dialogueCommands, startCommandAtMs: start.commandAtMs, startedAtMs: start.startedAtMs };
}
