import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function actualHelper(name: string, globals: Record<string, unknown> = {}): (...args: any[]) => unknown {
  const path = 'browser-tests/world-ui-readability.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing browser observation helper ${name}`);
  return runInNewContext(ts.transpileModule(`${fn.getText(source)}\n${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, globals) as (...args: any[]) => unknown;
}

function resizePlateAssertions() {
  const path = 'browser-tests/world-ui-readability.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const testCall = source.statements.find((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(source) === 'test'
    && ts.isStringLiteral(statement.expression.arguments[0])
    && statement.expression.arguments[0].text === 'a stopped GameScene cannot repaint an old HUD during Menu resize');
  if (!testCall || !ts.isExpressionStatement(testCall) || !ts.isCallExpression(testCall.expression)) throw new Error('Missing world HUD resize test callback');
  const callback = testCall.expression.arguments[1];
  if (!ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) throw new Error('Missing world HUD resize test body');
  const plateDeclaration = callback.body.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => declaration.name.getText(source) === 'plateCount'));
  if (!plateDeclaration || !ts.isVariableStatement(plateDeclaration)) throw new Error('Missing actual HUD plate-count closure');
  const plateCountDeclaration = plateDeclaration.declarationList.declarations.find((declaration) => declaration.name.getText(source) === 'plateCount');
  if (!plateCountDeclaration) throw new Error('Missing actual HUD plate-count initializer');

  const isLaunch = (statement: ts.Statement): boolean => ts.isExpressionStatement(statement)
    && ts.isAwaitExpression(statement.expression)
    && ts.isCallExpression(statement.expression.expression)
    && statement.expression.expression.expression.getText(source) === 'launch';
  const isPlateAssertion = (statement: ts.Statement | undefined): statement is ts.ExpressionStatement =>
    Boolean(statement && ts.isExpressionStatement(statement)
      && statement.getText(source).replace(/\s/g, '') === 'expect(awaitplateCount()).toBe(2);');
  const initialIndex = callback.body.statements.findIndex(isLaunch);
  const initialAssertion = callback.body.statements[initialIndex + 1];
  const loop = callback.body.statements.find((statement) => ts.isForStatement(statement));
  const loopBody = loop && ts.isBlock(loop.statement) ? loop.statement.statements : [];
  const loopIndex = loopBody.findIndex(isLaunch);
  const loopAssertion = loopBody[loopIndex + 1];
  if (initialIndex < 0 || !isPlateAssertion(initialAssertion) || loopIndex < 0 || !isPlateAssertion(loopAssertion)) {
    throw new Error('The actual resize test must assert plate count immediately after each launch');
  }
  return { source, plateCountDeclaration, initialAssertion, loopAssertion };
}

function framing(scrollX: number, scrollY: number) {
  return {
    arena: { width: 768, height: 1344 },
    player: { x: 384, y: 14, bodyRadius: 14 },
    camera: {
      bounds: { x: -384, y: -7.7, width: 1536, height: 1382 },
      viewport: { x: 0, y: 0, width: 1920, height: 1080 },
      scroll: { x: scrollX, y: scrollY },
      zoom: 1.25,
      worldView: { x: -384, y: -440, width: 1536, height: 864 },
      roundPixels: false,
    },
    rootRect: { x: 0, y: 0, width: 1920, height: 1080 },
    canvas: { rect: { x: 0, y: 0, width: 1920, height: 1080 } },
  };
}

class FakeCanvas {
  static encodes = 0;
  toDataURL(): string { FakeCanvas.encodes++; return 'data:image/png;base64,AA=='; }
}

function observerHarness(states: Array<ReturnType<typeof framing> | undefined>, placement = true, capture?: () => Promise<unknown>) {
  const counters = { readbacks: 0 };
  const htmlCanvas = { prototype: { toDataURL: vi.fn(() => { FakeCanvas.encodes++; return 'data:image/png;base64,AA=='; }) } };
  const seam = {
    placePlayerForArenaFraming: vi.fn(() => placement),
    arenaFramingDiagnostics: vi.fn(() => states.shift()),
    captureArenaReadability: vi.fn(async () => {
      counters.readbacks += 4;
      const reference = htmlCanvas.prototype.toDataURL();
      const actual = htmlCanvas.prototype.toDataURL();
      const result = {
        timings: {}, actorAlpha: 1, actorPixels: 30, referenceEnergy: 100,
        actualEnergy: 100, retainedContribution: 1, reference, actual,
      };
      return capture ? capture() : result;
    }),
  };
  const evaluate = vi.fn(async (callback: (arg: { x: number; y: number; place: boolean }) => Promise<unknown>, arg: { x: number; y: number; place: boolean }) => callback(arg));
  const observe = actualHelper('observeArenaPosition', {
    __MEOWCENARY_VISUAL_TEST__: seam,
    HTMLCanvasElement: htmlCanvas,
  });
  const capturePosition = actualHelper('captureArenaPosition', {
    __MEOWCENARY_VISUAL_TEST__: seam,
    HTMLCanvasElement: htmlCanvas,
  });
  FakeCanvas.encodes = 0;
  const page = { evaluate: vi.fn(async (callback: () => Promise<unknown>) => callback()) };
  return {
    seam, counters, evaluate, page,
    observe: (x = 384, y = 14, place = true) => observe({ evaluate }, x, y, place),
    capturePosition: () => capturePosition(page),
  };
}

describe('world readability browser observation batching', () => {
  it('places once, keeps the original negative camera predicate, then captures after the settle poll', async () => {
    const h = observerHarness([framing(-576, -115), framing(-576, -115.7), framing(-576, -115.7)]);
    const first = await h.observe();
    expect(h.evaluate).toHaveBeenCalledTimes(1);
    expect(h.seam.placePlayerForArenaFraming).toHaveBeenCalledOnce();
    expect(first).toMatchObject({ accepted: true, settled: false });
    expect(h.seam.captureArenaReadability).not.toHaveBeenCalled();

    const second = await h.observe(384, 14, false);
    expect(h.evaluate).toHaveBeenCalledTimes(2);
    expect(h.seam.placePlayerForArenaFraming).toHaveBeenCalledOnce();
    expect(second).toMatchObject({ accepted: true, settled: true });
    expect(h.seam.arenaFramingDiagnostics).toHaveBeenCalledTimes(2);
    expect(h.seam.captureArenaReadability).not.toHaveBeenCalled();
    const captured = await h.capturePosition();
    expect(captured).toMatchObject({ framing: framing(-576, -115.7), encodes: 2 });
    expect(h.seam.captureArenaReadability).toHaveBeenCalledOnce();
    expect(h.counters.readbacks).toBe(4);
    expect(FakeCanvas.encodes).toBe(2);
  });

  it('does not make the settle sample wait for slow pixel capture and captures only after accepted settlement', async () => {
    let releaseCapture!: () => void;
    let captureStarted!: () => void;
    const started = new Promise<void>(resolve => { captureStarted = resolve; });
    const deferredCapture = new Promise<unknown>(resolve => { releaseCapture = () => resolve({ timings: {}, actorAlpha: 1, actorPixels: 30, referenceEnergy: 100, actualEnergy: 100, retainedContribution: 1, reference: 'reference', actual: 'actual' }); });
    const h = observerHarness([framing(-576, -115.7), framing(-576, -115.7)], true, () => {
      captureStarted();
      return deferredCapture;
    });

    const sample = await h.observe();
    expect(sample).toMatchObject({ accepted: true, settled: true });
    expect(h.seam.captureArenaReadability).not.toHaveBeenCalled();

    let completed = false;
    const capturePromise = (h.capturePosition() as Promise<unknown>).then((value: unknown) => { completed = true; return value; });
    await started;
    expect(h.seam.captureArenaReadability).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    releaseCapture();
    await expect(capturePromise).resolves.toMatchObject({ encodes: 2 });
    expect(h.seam.captureArenaReadability).toHaveBeenCalledOnce();
  });

  it('cannot report success or read pixels when the owner is missing, placement is rejected, or framing is absent', async () => {
    const missing = actualHelper('observeArenaPosition', { HTMLCanvasElement: { prototype: {} } });
    const missingPage = { evaluate: async (callback: (arg: { x: number; y: number; place: boolean }) => Promise<unknown>, arg: { x: number; y: number; place: boolean }) => callback(arg) };
    await expect(missing(missingPage, 384, 14, true)).resolves.toMatchObject({ accepted: false, settled: false });

    const rejected = observerHarness([framing(-576, -115.7)], false);
    await expect(rejected.observe()).resolves.toMatchObject({ accepted: false, settled: false });
    expect(rejected.seam.arenaFramingDiagnostics).not.toHaveBeenCalled();
    expect(rejected.seam.captureArenaReadability).not.toHaveBeenCalled();

    const absentFrame = observerHarness([undefined]);
    await expect(absentFrame.observe()).resolves.toMatchObject({ accepted: false, settled: false });
    expect(absentFrame.seam.captureArenaReadability).not.toHaveBeenCalled();
  });

  it('executes the real post-launch HUD assertion and rejects plates injected during Start', async () => {
    const parts = resizePlateAssertions();
    const hudLayers = [{ type: 'Rectangle' }, { type: 'NineSlice' }];
    const seam = { arenaFramingDiagnostics: vi.fn(() => ({ hudLayers })) };
    const page = { evaluate: async (callback: () => unknown) => callback() };
    const plateCount = runInNewContext(ts.transpileModule(
      `const ${parts.plateCountDeclaration.getText(parts.source)}; plateCount;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText, { page, __MEOWCENARY_VISUAL_TEST__: seam }) as () => Promise<number | undefined>;
    const executeAssertion = (statement: ts.Statement) => runInNewContext(ts.transpileModule(
      `async function assertAfterLaunch(plateCount) { ${statement.getText(parts.source)} }\nassertAfterLaunch;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText, { expect }) as (plateCount: () => Promise<number | undefined>) => Promise<void>;

    await expect(executeAssertion(parts.initialAssertion)(plateCount)).resolves.toBeUndefined();
    // Simulate a listener that adds two visible plates during real Start.
    hudLayers.push({ type: 'Rectangle' }, { type: 'NineSlice' });
    await expect(executeAssertion(parts.loopAssertion)(plateCount)).rejects.toThrow();
    expect(seam.arenaFramingDiagnostics).toHaveBeenCalledTimes(2);
  });

  it('requires literal true admission from placement, summary and Menu closure', async () => {
    const pending = observerHarness([framing(-576, -115.7)]);
    pending.seam.placePlayerForArenaFraming.mockReturnValueOnce('stale' as unknown as boolean);
    await expect(pending.observe()).resolves.toMatchObject({ accepted: false, settled: false });
    expect(pending.seam.captureArenaReadability).not.toHaveBeenCalled();

    const seam = {
      showRunSummary: vi.fn(() => 'stale'),
      waitForInputFrame: vi.fn(async () => true),
      summaryMenuTarget: vi.fn(() => ({ x: 280, y: 510 })),
      waitForMenuPresentation: vi.fn(async () => 'stale'),
    };
    const evaluate = async (callback: (outcome?: 'won' | 'lost') => Promise<unknown>, outcome?: 'won' | 'lost') => callback(outcome);
    const context = { __MEOWCENARY_VISUAL_TEST__: seam, localStorage: {} };
    await expect(actualHelper('observeSummaryTarget', context)({ evaluate }, 'lost')).resolves.toEqual({ accepted: false });
    expect(seam.waitForInputFrame).not.toHaveBeenCalled();
    expect(seam.summaryMenuTarget).not.toHaveBeenCalled();
    await expect(actualHelper('observeMenuStorage', context)({ evaluate })).resolves.toEqual({ ready: false });
  });

  it('joins a rendered summary target to one real owner frame and rejects a false frame', async () => {
    const target = Object.freeze({ x: 280, y: 510 });
    const seam = {
      showRunSummary: vi.fn(() => true),
      waitForInputFrame: vi.fn(async () => true),
      summaryMenuTarget: vi.fn(() => target),
    };
    const evaluate = vi.fn(async (callback: (outcome: 'won' | 'lost') => Promise<unknown>, outcome: 'won' | 'lost') => callback(outcome));
    const observe = actualHelper('observeSummaryTarget', { __MEOWCENARY_VISUAL_TEST__: seam });
    await expect(observe({ evaluate }, 'lost')).resolves.toEqual({ accepted: true, target });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(seam.showRunSummary).toHaveBeenCalledOnce();
    expect(seam.waitForInputFrame).toHaveBeenCalledOnce();
    expect(seam.summaryMenuTarget).toHaveBeenCalledOnce();

    seam.waitForInputFrame.mockResolvedValueOnce(false);
    await expect(observe({ evaluate }, 'lost')).resolves.toEqual({ accepted: false });
    expect(seam.summaryMenuTarget).toHaveBeenCalledOnce();
  });

  it('joins Menu closure with its same-generation save snapshot and the resize frames with the post-resize snapshot', async () => {
    const seam = { waitForMenuPresentation: vi.fn(async () => true) };
    const localStorage = { entries: { save: 'same' } };
    const context = { __MEOWCENARY_VISUAL_TEST__: seam, localStorage };
    const readyEval = vi.fn(async (callback: () => Promise<unknown>) => callback());
    const observeReady = actualHelper('observeMenuStorage', context);
    await expect(observeReady({ evaluate: readyEval })).resolves.toEqual({ ready: true, storage: JSON.stringify([['entries', localStorage.entries]]) });
    expect(readyEval).toHaveBeenCalledOnce();
    expect(seam.waitForMenuPresentation).toHaveBeenCalledOnce();

    let frameCount = 0;
    const resizeContext = {
      localStorage,
      requestAnimationFrame: (callback: () => void) => { frameCount++; callback(); },
    };
    const resizeEval = vi.fn(async (callback: () => Promise<unknown>) => callback());
    const observeResize = actualHelper('observeTwoFramesAndStorage', resizeContext);
    await expect(observeResize({ evaluate: resizeEval })).resolves.toBe(JSON.stringify([['entries', localStorage.entries]]));
    expect(resizeEval).toHaveBeenCalledOnce();
    expect(frameCount).toBe(2);
  });
});
