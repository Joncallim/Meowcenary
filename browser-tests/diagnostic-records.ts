import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';

/** Test-output evidence only. No browser waits, runtime writes or timeout changes. */
export function createDiagnosticRecord(path: string, metadata: Record<string, unknown>) {
  const records: Array<{ sequence: number; elapsedMs: number; phase: string; facts?: unknown }> = [];
  let sequence = 0, omitted = 0; const started = performance.now();
  const inFlight = new Map<number, string>(), failures: unknown[] = [], diagnosticFailures: unknown[] = [];
  let capability: unknown, initialContact: unknown;
  // These roles have a semantic budget, rather than depending on runtime key
  // insertion order. Optional model/UI payloads never displace admission facts.
  const short = (value: unknown, bytes = 96): string => {
    let result = '';
    for (const character of String(value)) {
      if (Buffer.byteLength(JSON.stringify(result + character)) > bytes) break;
      result += character;
    }
    return result;
  };
  const pick = (value: unknown, keys: string[]): Record<string, unknown> => {
    if (!value || typeof value !== 'object') return {};
    const object = value as Record<string, unknown>;
    return Object.fromEntries(keys.filter(key => key in object).map(key => {
      const item = object[key];
      return [key, typeof item === 'string' ? short(item) : item === null || ['number', 'boolean'].includes(typeof item) ? item : undefined];
    }));
  };
  const equality = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text === undefined ? undefined : { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') };
  };
  const intro = (value: Record<string, unknown>) => ({
    ...pick(value, ['visible', 'status', 'phase', 'revision', 'timeMs', 'ready', 'inputNeutral', 'inputQuarantined',
      'orientationBlocked', 'inputMode', 'focusedCommand', 'terminalEvents']),
    runStart: pick(value.runStart, ['count', 'timeMs']),
    identity: pick(value.identity, ['characterId', 'stageId', 'arenaId', 'seed', 'contentVersion']),
    objective: { ...pick(value.objective, ['kind']),
      definition: pick((value.objective as { definition?: unknown } | undefined)?.definition, ['type', 'count', 'timeMs', 'durationMs', 'enemyId']),
      equality: equality(value.objective) },
  });
  const errorFacts = (error: Error) => {
    const identity = (item: Error) => ({ name: short(item.name, 48), message: short(item.message, 160),
      ...('code' in item ? { code: short(item.code, 48) } : {}) });
    if (!(error instanceof AggregateError)) return identity(error);
    const errors: unknown[] = [], visited = new WeakSet<object>(); let examined = 0;
    const visit = (item: unknown, depth: number) => {
      if (errors.length >= 4 || examined++ >= 24) return;
      if (depth >= 6) { errors.push('[bounded depth]'); return; }
      if (item && typeof item === 'object') {
        if (visited.has(item)) { errors.push('[circular]'); return; } visited.add(item);
      }
      if (item instanceof AggregateError) {
        for (const child of item.errors) { if (errors.length >= 4 || examined >= 24) break; visit(child, depth + 1); }
      }
      else errors.push(item instanceof Error ? identity(item) : short(item, 160));
    };
    visited.add(error); for (const child of error.errors) { if (errors.length >= 4 || examined >= 24) break; visit(child, 0); }
    return { ...identity(error), errors, errorDetailsBounded: true };
  };
  const compact = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
    if (depth >= 5) return '[bounded depth]';
    if (typeof value === 'string') return value.slice(0, 1200);
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || value === undefined) return value;
    if (typeof value === 'object') {
      if (value instanceof Error) return errorFacts(value);
      if (seen.has(value)) return '[circular]'; seen.add(value);
      if (Array.isArray(value)) return value.slice(-12).map(entry => compact(entry, depth + 1, seen));
      if (Object.getPrototypeOf(value) !== Object.prototype) return { type: value.constructor?.name ?? 'object' };
      const object = value as Record<string, unknown>;
      if ('visible' in object && 'runStart' in object) return intro(object);
      if ('state' in object && 'key' in object && 'atMs' in object) return {
        ...pick(object, ['touchCancelAtMs', 'touchFrameAtMs', 'padReleaseAtMs', 'padFrameAtMs', 'key', 'atMs']),
        state: object.state && typeof object.state === 'object' ? intro(object.state as Record<string, unknown>) : object.state,
        saved: equality(object.saved),
      };
      if ('maxTouchPoints' in object) return pick(object, ['maxTouchPoints', 'touchEventProperty', 'coarse', 'fine', 'width', 'height', 'devicePixelRatio', 'userAgent']);
      if ('contacts' in object && 'trusted' in object) return pick(object, ['type', 'contacts', 'trusted', 'atMs']);
      return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, entry]) => [key.slice(0, 100), compact(entry, depth + 1, seen)]));
    }
    return String(value).slice(0, 1200);
  };
  const bounded = (value: unknown): unknown => {
    const result = compact(value), encoded = JSON.stringify(result);
    return encoded && Buffer.byteLength(encoded) > 2048
      ? { truncated: true, originalBytes: Buffer.byteLength(encoded), preview: encoded.slice(0, 160) } : result;
  };
  const boundedMetadata = bounded(metadata);
  mkdirSync(dirname(path), { recursive: true });
  const write = () => {
    const snapshot = () => ({ metadata: boundedMetadata, sequence, omitted, inFlight: [...inFlight.values()].slice(-16),
      failures, capability, initialContact, diagnosticFailures: diagnosticFailures.map(bounded), records });
    let json = JSON.stringify(snapshot());
    while (Buffer.byteLength(json) > 65535 && records.length > 2) {
      records.splice(1, 1); omitted++; json = JSON.stringify(snapshot());
    }
    if (Buffer.byteLength(json) > 65535) throw new Error('Diagnostic sticky facts exceeded the 64 KiB bound');
    writeFileSync(path, json + '\n');
  };
  const note = (phase: string, facts?: unknown) => {
    phase = phase.slice(0, 160); const value = bounded(facts);
    if (phase === 'capability') capability = value;
    if (phase === 'dom.touchstart' && initialContact === undefined) initialContact = value;
    if (phase.endsWith(':error') || phase === 'test.failed') { failures.push({ phase, facts: value }); if (failures.length > 4) failures.splice(1, 1); }
    records.push({ sequence: sequence++, elapsedMs: performance.now() - started, phase, facts: value });
    if (records.length > 96) { records.splice(1, 1); omitted++; }
    write();
  };
  const safeNote = (phase: string, facts?: unknown) => {
    try { note(phase, facts); }
    catch (error) { diagnosticFailures.push(error); if (diagnosticFailures.length > 4) diagnosticFailures.splice(1, 1); }
  };
  const assertHealthy = () => {
    if (diagnosticFailures.length) throw new AggregateError(diagnosticFailures, 'Diagnostic event persistence failed');
  };
  const observe = async <T>(phase: string, operation: () => Promise<T>): Promise<T> => {
    phase = phase.slice(0, 150); const token = sequence; inFlight.set(token, phase);
    if (inFlight.size > 32) inFlight.delete(inFlight.keys().next().value!);
    safeNote(`${phase}:begin`); let result: T;
    try { result = await operation(); }
    catch (error) {
      inFlight.delete(token);
      safeNote(`${phase}:error`, error);
      throw error;
    }
    inFlight.delete(token); safeNote(`${phase}:end`, result); return result;
  };
  note('created');
  // Explicit caller notes use the same non-gating path as proxy observations.
  // Persistence errors are reported at finalization, never instead of a later
  // operation or pending-helper rejection.
  return { note: safeNote, safeNote, assertHealthy, observe, path,
    summary: () => ({ ...metadata, events: sequence, omitted, lastPhase: records.at(-1)?.phase,
      failedOperations: failures.length, diagnosticFailures: diagnosticFailures.length,
      inFlight: [...inFlight.values()].slice(-4), capability, initialContact }) };
}

export type DiagnosticRecord = ReturnType<typeof createDiagnosticRecord>;

/** Keep primary and cleanup failures visible, including errors after timeout. */
export async function withRecordedCleanup<T>(record: DiagnosticRecord | undefined, operation: () => Promise<T>, cleanup: Array<[string, () => Promise<unknown>]>): Promise<T> {
  const failures: unknown[] = []; let result!: T;
  try { result = await operation(); } catch (error) { failures.push(error); record?.safeNote('operation:error', error); }
  finally {
    for (const [name, run] of cleanup) {
      record?.safeNote(`cleanup.${name}:begin`);
      // Broken evidence storage must never prevent real cancellation/detach.
      try { const result = await run(); record?.safeNote(`cleanup.${name}:end`, result); }
      catch (error) { failures.push(error); record?.safeNote(`cleanup.${name}:error`, error); }
    }
    try { record?.assertHealthy(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Test operation and cleanup failed');
  return result;
}

export async function withBrowserDiagnostics<T>(page: Page, info: TestInfo, label: string, enabled: boolean,
  run: (observed: Page, record?: DiagnosticRecord) => Promise<T>): Promise<T> {
  if (!enabled) return run(page);
  const record = createDiagnosticRecord(info.outputPath(`${label}-diagnostics.json`), {
    project: info.project.name, label, viewport: page.viewportSize(), isMobile: info.project.use.isMobile === true,
  });
  // An exposed test-only sink retains pre-failure DOM observations on Node even
  // if the page subsequently closes. Callers do not await it to gate input.
  await record.observe('binding.install', () => page.exposeBinding('__MEOWCENARY_TEST_RECORD__', (_source, phase: string, facts: unknown) => record.safeNote(phase, facts)));
  page.on('close', () => record.safeNote('page.close'));
  page.on('crash', () => record.safeNote('page.crash'));
  page.on('pageerror', error => record.safeNote('page.error', error));
  page.on('requestfailed', request => record.safeNote('request.failed', { path: new URL(request.url()).pathname, failure: request.failure() }));
  const wrap = <T extends object>(target: T, owner: string, methods: Set<PropertyKey>): T => new Proxy(target, { get(object, key) {
    const value = Reflect.get(object, key);
    if (typeof value !== 'function') return value;
    if (!methods.has(key)) return value.bind(object);
    return (...args: unknown[]) => {
      const detail = key === 'send' ? String((args[1] as { type?: string } | undefined)?.type ?? args[0])
        : typeof args[0] === 'function' ? args[0].toString().match(/(?:waitFor\w+|\w+Diagnostics)/)?.[0] ?? 'callback'
          : typeof args[0] === 'string' ? args[0].slice(0, 100) : '';
      return record.observe(`${owner}.${String(key)}${detail ? ':' + detail : ''}`, () => Reflect.apply(value, object, args));
    };
  } });
  let sessionId = 0;
  const observed = new Proxy(page, { get(target, key) {
    if (key === 'keyboard') return wrap(page.keyboard, 'keyboard', new Set(['down', 'up', 'press']));
    if (key === 'mouse') return wrap(page.mouse, 'mouse', new Set(['move', 'down', 'up', 'click']));
    if (key === 'context') return () => new Proxy(page.context(), { get(context, property) {
      if (property === 'newCDPSession') return async () => {
        const id = sessionId++;
        const session = await record.observe(`cdp.${id}.create`, () => context.newCDPSession(page));
        return wrap(session, `cdp.${id}`, new Set(['send', 'detach']));
      };
      const value = Reflect.get(context, property); return typeof value === 'function' ? value.bind(context) : value;
    } });
    return Reflect.get(wrap(target, 'page', new Set(['goto', 'evaluate', 'waitForFunction', 'screenshot', 'setViewportSize'])), key);
  } });
  let result!: T; const failures: unknown[] = [];
  try { result = await run(observed, record); }
  catch (error) { failures.push(error); }
  finally {
    record.safeNote(failures.length ? 'test.failed' : 'test.completed', failures[0]);
    try { console.log('MEOW_DIAGNOSTIC_SUMMARY ' + JSON.stringify(record.summary())); }
    catch (error) { failures.push(error); }
    // A failed diagnostic write must not skip the remaining evidence attachment.
    try { await info.attach(label, { path: record.path, contentType: 'application/json' }); }
    catch (error) { failures.push(error); record.safeNote('diagnostic.attach:error', error); }
    try { record.assertHealthy(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Test and diagnostic finalization failed');
  return result;
}

type TitleDraw = { canvasId: number; text: string; x: number; y: number; maxWidth?: number; width: number; height: number;
  font: string; transform: { a: number; b: number; c: number; d: number; e: number; f: number }; [key: string]: unknown };
type TitleObserver = { draws: TitleDraw[]; canvases: Array<{ id: number; canvas: HTMLCanvasElement; eligible: boolean; reason?: string }>; errors: string[]; total: number };
type TitleGlobal = typeof globalThis & { __CONTRACT_TITLE_OBSERVER__?: TitleObserver };

/** Serialized by addInitScript; all executable dependencies are inside it. */
export function installContractTitleObserver(): void {
  const state: TitleObserver = { draws: [], canvases: [], errors: [], total: 0 };
  (globalThis as TitleGlobal).__CONTRACT_TITLE_OBSERVER__ = state;
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof original>) {
    const result = Reflect.apply(original, this, args);
    try {
      const canvas = this.canvas;
      let entry = state.canvases.find(row => row.canvas === canvas);
      if (typeof args[0] !== 'string' || args[0].trim() !== '✓ First Scavenge') {
        if (entry) { entry.eligible = false; entry.reason = 'later non-target fillText reused the retained canvas'; }
        return result;
      }
      if (!entry) { entry = { id: ++state.total, canvas, eligible: false }; state.canvases.push(entry); if (state.canvases.length > 4) state.canvases.shift(); }
      entry.eligible = false; entry.reason = 'target draw observation did not complete';
      const matrix = this.getTransform();
      const metrics = Object.fromEntries(['✓', '✓ ', 'First Scavenge', args[0]].map(text => {
        const measure = this.measureText(text);
        return [text, { width: measure.width, actualBoundingBoxLeft: measure.actualBoundingBoxLeft,
          actualBoundingBoxRight: measure.actualBoundingBoxRight, actualBoundingBoxAscent: measure.actualBoundingBoxAscent,
          actualBoundingBoxDescent: measure.actualBoundingBoxDescent }];
      }));
      const draw: TitleDraw = { canvasId: entry.id, text: args[0], x: args[1], y: args[2], maxWidth: args[3],
        width: canvas.width, height: canvas.height, font: this.font,
        fillStyle: typeof this.fillStyle === 'string' ? this.fillStyle : '[non-string paint]', globalAlpha: this.globalAlpha,
        textAlign: this.textAlign, textBaseline: this.textBaseline, direction: this.direction,
        fontKerning: this.fontKerning, fontStretch: this.fontStretch, fontVariantCaps: this.fontVariantCaps, letterSpacing: this.letterSpacing,
        transform: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f }, metrics,
        fontsStatus: document.fonts.status, fontReadyForCheckmark: document.fonts.check(this.font, '✓'),
        userAgent: navigator.userAgent, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight } };
      state.draws.push(draw); if (state.draws.length > 8) state.draws.shift();
      entry.eligible = true; entry.reason = undefined;
    } catch (error) {
      state.errors.push(error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500));
      if (state.errors.length > 4) state.errors.shift();
    }
    return result;
  };
}

/** Read natural backing pixels only; never draws, resizes or takes a screenshot. */
export async function readContractTitleObserver(includePixels: boolean): Promise<unknown> {
  const state = (globalThis as TitleGlobal).__CONTRACT_TITLE_OBSERVER__;
  if (!state) return { observerMissing: true, targetDrawMissing: true, hashes: [] };
  const hashes: unknown[] = [];
  if (includePixels) for (const { id, canvas, eligible, reason } of state.canvases) {
    const draw = [...state.draws].reverse().find(row => row.canvasId === id);
    if (!draw) { hashes.push({ canvasId: id, ineligible: true, reason: 'target draw metadata missing' }); continue; }
    if (!eligible || canvas.width !== draw.width || canvas.height !== draw.height) {
      hashes.push({ canvasId: id, ineligible: true, reason: reason ?? 'canvas dimensions changed after the target draw' }); continue;
    }
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('retained title canvas has no 2D context');
      // Phaser's text backing canvas is already cropped to the text. Bound any
      // unexpectedly large canvas rather than reading a full game render.
      const width = Math.min(canvas.width, 512), height = Math.min(canvas.height, 128);
      if (width < 1 || height < 1) throw new Error('empty retained title canvas');
      const pixels = context.getImageData(0, 0, width, height).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      hashes.push({ canvasId: id, crop: { x: 0, y: 0, width, height }, finalWidth: canvas.width, finalHeight: canvas.height,
        dimensionsMatchDraw: canvas.width === draw.width && canvas.height === draw.height,
        cropCoversCanvas: width === canvas.width && height === canvas.height,
        rgbaSha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') });
    } catch (error) { hashes.push({ canvasId: id, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { draws: state.draws, errors: state.errors, retainedCanvases: state.canvases.length, targetDrawMissing: state.draws.length === 0, hashes,
    note: 'Font readiness does not identify the checkmark font. Only fillText is observed: clearing or other drawing without a subsequent fillText is not detected. Eligible hashes are backing-pixel observations, not proof that no other drawing occurred.' };
}
