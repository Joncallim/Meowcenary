import assert from 'node:assert/strict';

// Preparation ends at the first rendered intro (current builds) or active
// frame (historical builds). Automated Start is a separate measured boundary.
export async function waitForPerformanceRunStart(page, input = 'keyboard') {
  await page.waitForFunction(() => {
    const status = globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun?.status;
    return status === 'intro' || status === 'active';
  });
  const preparedRun = await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun);
  if (preparedRun.status === 'active') return { preparedRun };

  const brief = await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.runStartBriefDiagnostics());
  assert(brief?.visible && brief.status === 'intro' && brief.timeMs === 0, 'rendered intro must own the frozen brief');
  const start = brief.buttons[0];
  assert(start?.width > 0 && start.height > 0, 'brief Start must have usable bounds');
  const frame = async () => assert.equal(await page.evaluate(() => globalThis.__MEOWCENARY_VISUAL_TEST__.waitForInputFrame()), true);
  // Consume the released Menu command on the new controller before Start.
  await frame();
  const startCommandAtMs = await page.evaluate(() => performance.now());
  if (input === 'keyboard') {
    await page.keyboard.down('Enter');
    try { await frame(); } finally { await page.keyboard.up('Enter'); }
  } else if (input === 'touch') {
    await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  } else {
    assert.equal(input, 'mouse', 'unsupported performance launch input');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    try { await frame(); } finally { await page.mouse.up(); }
  }
  await frame();
  await page.waitForFunction(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun?.status === 'active');
  return { preparedRun, startCommandAtMs };
}
