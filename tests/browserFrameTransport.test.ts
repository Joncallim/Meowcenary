import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual browser helper. The frame promises below are deliberately
// deferred; transport batching must never batch the owner updates themselves.
function harness(waitForInputFrame: () => Promise<boolean>) {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'frame');
  if (!fn) throw new Error('Missing browser owner-frame helper');
  const frame = runInNewContext(ts.transpileModule(fn.getText(source) + '\nframe;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect, __MEOWCENARY_VISUAL_TEST__: { waitForInputFrame } }) as
    (page: { evaluate: (callback: (count: number) => Promise<boolean[]>, count: number) => Promise<boolean[]> }, count?: number) => Promise<void>;
  const evaluate = vi.fn(async (callback: (count: number) => Promise<boolean[]>, count: number) => callback(count));
  return { run: (count?: number) => frame({ evaluate }, count), evaluate };
}

describe('browser owner-frame transport', () => {
  it.each([1, 2, 4])('joins exactly %s sequential owner frames through one transport', async count => {
    const waits = vi.fn(async () => true), h = harness(waits);
    await h.run(count);
    expect(waits).toHaveBeenCalledTimes(count);
    expect(h.evaluate).toHaveBeenCalledTimes(1);
  });
  it('cannot request the next frame while the previous frame remains unresolved', async () => {
    const pending: Array<(value: boolean) => void> = [];
    const signals: Array<() => void> = [];
    const started = Array.from({ length: 4 }, () => new Promise<void>(resolve => signals.push(resolve)));
    const waits = vi.fn(() => new Promise<boolean>(resolve => {
      const index = pending.length; pending.push(resolve); signals[index]();
    })), h = harness(waits);
    const done = h.run(4);
    for (let index = 0; index < 4; index++) {
      await started[index];
      expect(waits).toHaveBeenCalledTimes(index + 1);
      pending[index](true);
    }
    await done; expect(h.evaluate).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1, 2])('a false frame at %s prevents all later owner waits', async failureAt => {
    let calls = 0;
    const waits = vi.fn(async () => calls++ !== failureAt), h = harness(waits);
    await expect(h.run(4)).rejects.toThrow();
    expect(waits).toHaveBeenCalledTimes(failureAt + 1);
  });
  it('preserves the original rejection and requests no following frame', async () => {
    const reason = new Error('scene shutdown');
    const waits = vi.fn(async () => { throw reason; }), h = harness(waits);
    await expect(h.run(4)).rejects.toBe(reason);
    expect(waits).toHaveBeenCalledTimes(1);
  });
});

it('missing Ability diagnostics cannot produce a successful evidence attachment', async () => {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'captureFacts');
  if (!fn) throw new Error('Missing browser evidence helper');
  const writeFile = vi.fn(), attach = vi.fn();
  const capture = runInNewContext(ts.transpileModule(fn.getText(source) + '\ncaptureFacts;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect, writeFile, devicePixelRatio: 1,
    __MEOWCENARY_VISUAL_TEST__: { runStartIntroDiagnostics: () => undefined } }) as
    (page: unknown, info: unknown, name: string) => Promise<void>;
  const page = { evaluate: async (callback: () => unknown) => callback(), viewportSize: () => ({ width: 1920, height: 1080 }) };
  const info = { outputPath: () => 'discarded-test-evidence.json', attach, project: { name: 'desktop' } };
  await expect(capture(page, info, 'missing-owner')).rejects.toThrow();
  expect(writeFile).not.toHaveBeenCalled(); expect(attach).not.toHaveBeenCalled();
});

it.each([null, 'stale-owner'])('a malformed %s frame stops before any following wait', async value => {
  const waits = vi.fn(async () => value as unknown as boolean), h = harness(waits);
  await expect(h.run(4)).rejects.toThrow();
  expect(waits).toHaveBeenCalledTimes(1);
});
