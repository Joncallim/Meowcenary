import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, renameSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { createDiagnosticRecord, withBrowserDiagnostics, withRecordedCleanup, installContractTitleObserver, readContractTitleObserver } from '../browser-tests/diagnostic-records';

function record() {
  const path = join(mkdtempSync(join(tmpdir(), 'meow-diagnostic-test-')), 'facts.json');
  return { path, recorder: createDiagnosticRecord(path, { project: 'desktop-1920x1080' }), read: () => JSON.parse(readFileSync(path, 'utf8')) };
}

describe('bounded browser diagnostic persistence', () => {
  it('writes a begun operation before its promise returns and retains it beyond the normal ring', async () => {
    const r = record(); let finish!: () => void;
    const pending = r.recorder.observe('page.evaluate:runStartIntroDiagnostics', () => new Promise<void>(resolve => { finish = resolve; }));
    for (let i = 0; i < 160; i++) r.recorder.note('normal', { i });
    expect(r.read().inFlight).toEqual(['page.evaluate:runStartIntroDiagnostics']);
    expect(r.read().omitted).toBeGreaterThan(0); finish(); await pending;
    expect(r.read().inFlight).toEqual([]);
  });
  it('retains capability, initial contact and failures when normal records roll over', async () => {
    const r = record(), original = new Error('closed page');
    r.recorder.note('capability', { maxTouchPoints: 1, coarse: true, fine: false });
    r.recorder.note('dom.touchstart', { contacts: 1, trusted: true });
    await expect(r.recorder.observe('read', async () => { throw original; })).rejects.toBe(original);
    for (let i = 0; i < 180; i++) r.recorder.note('normal', { i });
    expect(r.read().failures[0].facts.message).toBe('closed page');
    expect(r.read().capability.maxTouchPoints).toBe(1); expect(r.read().initialContact.contacts).toBe(1);
  });
  it('enforces the exact serialized 64 KiB ceiling with large sticky and normal records', () => {
    const r = record(), large = { value: '🙂'.repeat(6000), rows: Array.from({ length: 40 }, () => 'é'.repeat(6000)) };
    r.recorder.note('capability', large); r.recorder.note('dom.touchstart', large);
    for (let i = 0; i < 150; i++) {
      r.recorder.note(i < 12 ? 'error:error' : 'normal', large);
      expect(statSync(r.path).size).toBeLessThanOrEqual(65536);
    }
  });
  it('bounds cyclic and deeply nested AggregateErrors without recursive failure', () => {
    const r = record(); const error = new AggregateError([], 'cycle'); error.errors.push(error);
    expect(() => r.recorder.note('test.failed', error)).not.toThrow();
    expect(r.read().failures[0].facts.errors).toEqual(['[circular]']);
    expect(statSync(r.path).size).toBeLessThanOrEqual(65536);
  });
  it('uses monotonic time rather than a changing wall clock', () => {
    const wall = vi.spyOn(Date, 'now').mockReturnValueOnce(100000).mockReturnValue(-100000);
    try { const r = record(); r.recorder.note('later'); expect(r.read().records.every((row: { elapsedMs: number }) => row.elapsedMs >= 0)).toBe(true); }
    finally { wall.mockRestore(); }
  });
  it('retains all operation and cleanup failures while still trying later cleanup', async () => {
    const r = record(), original = new Error('assertion'), cancel = new Error('cancel'), detach = new Error('detach'), steps: string[] = [];
    const result = await withRecordedCleanup(r.recorder, async () => { r.recorder.note('operation.begin'); throw original; }, [
      ['cancel', async () => { expect(r.read().failures[0].facts.message).toBe(original.message); steps.push('cancel'); throw cancel; }],
      ['detach', async () => { steps.push('detach'); throw detach; }],
      ['release', async () => { steps.push('release'); }],
    ]).catch(error => error);
    expect(result).toBeInstanceOf(AggregateError); expect(result.errors).toEqual([original, cancel, detach]);
    expect(steps).toEqual(['cancel', 'detach', 'release']);
    expect(r.read().failures.map((row: { phase: string; facts: { message: string } }) => [row.phase, row.facts.message]))
      .toEqual([['operation:error', 'assertion'], ['cleanup.cancel:error', 'cancel'], ['cleanup.detach:error', 'detach']]);
  });
  it('still cancels and detaches after diagnostic write failure, preserving the primary error', async () => {
    const r = record(), original = new Error('primary assertion');
    const steps: string[] = [];
    const directory = dirname(r.path), unavailable = directory + '-temporarily-unavailable';
    renameSync(directory, unavailable);
    let result: unknown;
    try {
      result = await withRecordedCleanup(r.recorder, async () => { r.recorder.note('operation.begin'); throw original; }, [
        ['cancel', async () => { steps.push('cancel'); }],
        ['detach', async () => { steps.push('detach'); }],
      ]).catch(error => error);
    } finally { renameSync(unavailable, directory); }
    expect(steps).toEqual(['cancel', 'detach']);
    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).errors[0]).toBe(original);
    expect((result as AggregateError).errors[1].errors.every((error: NodeJS.ErrnoException) => error.code === 'ENOENT')).toBe(true);
    r.recorder.note('storage.recovered');
    expect(r.read().diagnosticFailures.length).toBeGreaterThan(0);
  });
  it('keeps the original wrapped CDP and Page cleanup calls exactly once when recording fails', async () => {
    const directory = join(mkdtempSync(join(tmpdir(), 'meow-wrapped-diagnostic-')), 'output');
    const calls: string[] = [], attachments: string[] = [], original = new Error('primary assertion before cleanup'), detachError = new Error('real detach failure');
    const session = { send: async () => { calls.push('cancel'); }, detach: async () => { calls.push('detach'); throw detachError; } };
    const page = { viewportSize: () => ({ width: 1920, height: 1080 }), exposeBinding: async () => {}, on: () => {},
      context: () => ({ newCDPSession: async () => session }), keyboard: { up: async () => { calls.push('key-up'); } },
      evaluate: async () => { calls.push('pad-release'); } } as unknown as Page;
    const info = { project: { name: 'desktop-1920x1080', use: {} }, outputPath: (name: string) => join(directory, name), attach: async (name: string) => { attachments.push(name); } } as unknown as TestInfo;
    const result = await withBrowserDiagnostics(page, info, 'wrapped', true, async (observed, recorder) => {
      const owner = await observed.context().newCDPSession(observed);
      renameSync(directory, directory + '-unavailable');
      try {
        return await withRecordedCleanup(recorder, async () => { throw original; }, [
          ['cancel', () => owner.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })],
          ['detach', () => owner.detach()], ['key-up', () => observed.keyboard.up('Enter')],
          ['pad-release', () => observed.evaluate(() => {})],
        ]);
      } finally { renameSync(directory + '-unavailable', directory); }
    }).catch(error => error);
    const flatten = (error: unknown): unknown[] => error instanceof AggregateError ? error.errors.flatMap(flatten) : [error];
    expect(calls).toEqual(['cancel', 'detach', 'key-up', 'pad-release']); expect(attachments).toEqual(['wrapped']);
    expect(flatten(result)).toContain(original); expect(flatten(result)).toContain(detachError);
    expect(flatten(result).some(error => (error as NodeJS.ErrnoException).code === 'ENOENT')).toBe(true);
    const facts = JSON.parse(readFileSync(join(directory, 'wrapped-diagnostics.json'), 'utf8'));
    expect(JSON.stringify(facts.failures)).toContain(original.message);
    expect(JSON.stringify(facts.failures)).toContain(detachError.message);
  });
  it('retains semantic admission and dispatch fields regardless of source key order or bulky UI fields', () => {
    const r = record();
    const state = { ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['unrelated' + i, 'x'.repeat(1200)])),
      visible: true, status: 'intro', phase: 'brief', revision: 0, timeMs: 0, ready: true, inputNeutral: false,
      inputQuarantined: true, runStart: { count: 0 }, terminalEvents: 0,
      identity: { characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 7 },
      objective: { kind: 'stage', definition: { type: 'kill', count: 25 } } };
    r.recorder.note('contact.prepared', state);
    r.recorder.note('contact.dispatch', { touchCancelAtMs: 1, touchFrameAtMs: 2, padReleaseAtMs: 3, padFrameAtMs: 4,
      key: 'Enter', atMs: 5, state, saved: 'seeded-save'.repeat(2000) });
    const [prepared, dispatch] = r.read().records.slice(-2).map((row: { facts: unknown }) => row.facts);
    const required = { visible: true, status: 'intro', phase: 'brief', revision: 0, timeMs: 0, ready: true,
      inputNeutral: false, inputQuarantined: true, runStart: { count: 0 }, terminalEvents: 0 };
    expect(prepared).toMatchObject(required);
    expect(dispatch).toMatchObject({ touchCancelAtMs: 1, touchFrameAtMs: 2, padReleaseAtMs: 3, padFrameAtMs: 4,
      key: 'Enter', atMs: 5, state: required, saved: { bytes: 22000, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(dispatch.state.identity).toMatchObject(state.identity);
    expect(dispatch.state.objective).toMatchObject({ kind: 'stage', definition: { type: 'kill', count: 25 } });
    expect(Buffer.byteLength(JSON.stringify(dispatch))).toBeLessThanOrEqual(2048);
    expect(statSync(r.path).size).toBeLessThanOrEqual(65536);
  });
  it('persists the first original error identity rather than an aggregate stack prefix', () => {
    const r = record(), primary = new TypeError('first operation failed'), cleanup = new Error('cancel failed');
    Object.assign(primary, { code: 'PRIMARY' });
    r.recorder.note('test.failed', new AggregateError([new AggregateError([primary, cleanup], 'cleanup wrapper')], 'test wrapper'));
    const facts = r.read().failures[0].facts;
    expect(facts.errors[0]).toMatchObject({ name: 'TypeError', message: 'first operation failed', code: 'PRIMARY' });
    expect(JSON.stringify(facts)).toContain('cancel failed'); expect(facts.preview).toBeUndefined();
  });
  it('throws a lone original error unchanged rather than wrapping it', async () => {
    const original = { reason: 'test failure' };
    await expect(withRecordedCleanup(undefined, async () => { throw original; }, [['cleanup', async () => {}]])).rejects.toBe(original);
  });
});

describe('source-level context and observer boundaries', () => {
  it('limits touch capability to the four owned/separate-owner definitions', () => {
    const source = readFileSync('browser-tests/ability-comprehension.pw.ts', 'utf8');
    expect(source.match(/test\.use\(\{ hasTouch: true \}\)/g)).toHaveLength(1);
    const scope = source.slice(source.indexOf("test.describe('touch-capable ownership fixtures'"));
    expect(scope).toContain('CDP owned interruption:'); expect(scope).toContain('CDP separate owner');
    expect(scope).not.toContain('CDP no-contact:'); expect(scope).not.toContain('isMobile:');
    expect(scope).not.toContain('setViewportSize');
  });
  it('does not instrument the actor resize case or change browser budget/retry configuration', () => {
    const source = readFileSync('browser-tests/actor-framing.pw.ts', 'utf8');
    expect(source.slice(source.indexOf("test('actor bounds remain stable"))).not.toContain('withBrowserDiagnostics');
    const config = readFileSync('playwright.config.ts', 'utf8'); expect(config).toContain('retries: 0');
    expect(config).not.toContain('timeout:');
  });
  it('calls the real fillText first with identical receiver/arguments and keeps bounded records', () => {
    const calls: unknown[] = [], original = function (this: unknown, ...args: unknown[]) { calls.push({ receiver: this, args }); return 'drawn'; };
    class Context { fillText = original; }
    Context.prototype.fillText = original;
    vi.stubGlobal('CanvasRenderingContext2D', Context);
    vi.stubGlobal('document', { fonts: { status: 'loaded', check: () => true } });
    vi.stubGlobal('navigator', { userAgent: 'unit' }); vi.stubGlobal('devicePixelRatio', 1); vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720);
    try {
      installContractTitleObserver();
      for (let i = 0; i < 12; i++) {
        const context = { canvas: { width: 300, height: 40 }, font: '18px Nunito', fillStyle: '#fff', globalAlpha: 1,
          getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), measureText: () => ({ width: 120 }) };
        const args = ['✓ First Scavenge', 2, 20, 250] as const;
        expect(Reflect.apply(Context.prototype.fillText, context, args)).toBe('drawn');
        expect(calls.at(-1)).toEqual({ receiver: context, args: [...args] });
      }
      const observed = (globalThis as unknown as { __CONTRACT_TITLE_OBSERVER__: { draws: unknown[]; canvases: unknown[] } }).__CONTRACT_TITLE_OBSERVER__;
      expect(observed.draws).toHaveLength(8); expect(observed.canvases).toHaveLength(4);
      const broken = { canvas: {}, getTransform: () => { throw new Error('observer only'); } };
      expect(() => Reflect.apply(Context.prototype.fillText, broken, ['✓ First Scavenge', 0, 0])).not.toThrow();
      expect(calls.at(-1)).toEqual({ receiver: broken, args: ['✓ First Scavenge', 0, 0] });
    } finally { vi.unstubAllGlobals(); delete (globalThis as unknown as Record<string, unknown>).__CONTRACT_TITLE_OBSERVER__; }
  });
});

describe('retained Contract title canvas eligibility', () => {
  it('rejects same-size reuse and marks a missing target draw without altering native drawing', async () => {
    const sentinel = new Error('native draw failure');
    class Context {
      canvas = { width: 400, height: 64, getContext: () => this };
      font = '18px Nunito'; fillStyle = '#fff'; globalAlpha = 1; content = '';
      fillText(text: string, _x: number, _y: number) { if (text === 'native-error') throw sentinel; this.content = text; return 'drawn'; }
      getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
      measureText() { return { width: 200 }; }
      getImageData() { return { data: new Uint8ClampedArray(400 * 64 * 4).fill(this.content.startsWith('✓') ? 42 : 17) }; }
    }
    vi.stubGlobal('CanvasRenderingContext2D', Context);
    vi.stubGlobal('document', { fonts: { status: 'loaded', check: () => true } });
    vi.stubGlobal('navigator', { userAgent: 'unit' }); vi.stubGlobal('devicePixelRatio', 1); vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720);
    try {
      installContractTitleObserver(); const context = new Context();
      expect(await readContractTitleObserver(true)).toMatchObject({ targetDrawMissing: true, hashes: [] });
      expect(context.fillText('✓ First Scavenge', 2, 20)).toBe('drawn');
      const first = await readContractTitleObserver(true) as { hashes: Array<{ rgbaSha256?: string }> };
      expect(first.hashes[0].rgbaSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(context.fillText('unrelated reused label', 2, 20)).toBe('drawn');
      const reused = await readContractTitleObserver(true) as { hashes: Array<{ rgbaSha256?: string; ineligible?: boolean }> };
      expect(reused.hashes[0]).toMatchObject({ ineligible: true }); expect(reused.hashes[0].rgbaSha256).toBeUndefined();
      expect(() => context.fillText('native-error', 0, 0)).toThrow(sentinel);
      context.fillText('✓ First Scavenge', 2, 20);
      expect(await readContractTitleObserver(true)).toMatchObject({ targetDrawMissing: false, hashes: [{ rgbaSha256: first.hashes[0].rgbaSha256 }] });
    } finally { vi.unstubAllGlobals(); delete (globalThis as unknown as Record<string, unknown>).__CONTRACT_TITLE_OBSERVER__; }
  });
});
