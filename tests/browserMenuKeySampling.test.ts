import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { MockInputPlugin } from './__mocks__/phaser';
import type Phaser from 'phaser';
import { InputController } from '../src/systems/input';

// Execute the owning closures without importing Playwright's test registration
// or copying their behavior into another helper implementation.
const source = ts.createSourceFile('responsive.pw.ts',
  readFileSync(new URL('../browser-tests/responsive.pw.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const helpers: Array<{ title: string; expression: string }> = [];
for (const statement of source.statements) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
  const call = statement.expression;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'test') continue;
  const [title, callback] = call.arguments;
  if (!title || !ts.isStringLiteral(title) || !callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) continue;
  for (const child of callback.body.statements) {
    if (!ts.isVariableStatement(child)) continue;
    for (const declaration of child.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'press' && declaration.initializer) {
        helpers.push({ title: title.text, expression: declaration.initializer.getText(source) });
      }
    }
  }
}

type Fault = 'frame-false' | 'frame-throw' | 'evaluate-throw';
function harness(fault?: Fault) {
  const events = new EventEmitter(), gameEvents = new EventEmitter();
  const manager = { events, keyboard: { queue: [] as object[] }, pointers: [], game: { events: gameEvents } };
  const input = new MockInputPlugin({ keyboard: true });
  (input as unknown as { manager: typeof manager }).manager = manager;
  const controller = new InputController({ input } as unknown as Phaser.Scene);
  const timeline: Array<{ event: string; held: boolean; quarantined: boolean }> = [];
  let held = false, frameFailurePending = fault !== undefined;
  const failure = new Error(`intentional ${fault}`);
  const record = (event: string) => timeline.push({ event, held, quarantined: controller.isQuarantined() });
  const back = vi.fn(() => { record('back-command'); controller.quarantineUntilNeutral(); });
  controller.onAction('back', back);
  controller.update(16);
  const neutral = () => controller.isNeutral() && !controller.isQuarantined();
  const update = () => { record('owner-update'); controller.update(16); };
  const physical = (type: 'keydown' | 'keyup') => {
    // This is the game-manager physical authority, not scene-local Key flags.
    // Installed Phaser emits process synchronously on native down and up.
    manager.keyboard.queue.push({ type, keyCode: 'ESC' }); events.emit('process');
  };
  const seam = {
    isMenuInputNeutral: neutral,
    isSceneActive: (key: string) => key === 'MenuScene',
    waitForInputFrame: async () => {
      record('frame-wait');
      if (held && frameFailurePending && fault?.startsWith('frame-')) {
        frameFailurePending = false;
        if (fault === 'frame-throw') throw failure;
        return false;
      }
      update(); return true;
    },
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  const page = {
    keyboard: {
      down: async (key: string) => { expect(key).toBe('Escape'); record('keydown'); held = true; physical('keydown'); },
      up: async (key: string) => { expect(key).toBe('Escape'); held = false; physical('keyup'); record('keyup'); },
    },
    evaluate: async (callback: () => unknown) => {
      if (held && frameFailurePending && fault === 'evaluate-throw') { frameFailurePending = false; throw failure; }
      const prior = globals.__MEOWCENARY_VISUAL_TEST__;
      globals.__MEOWCENARY_VISUAL_TEST__ = seam;
      try { return await callback(); } finally {
        if (prior === undefined) delete globals.__MEOWCENARY_VISUAL_TEST__;
        else globals.__MEOWCENARY_VISUAL_TEST__ = prior;
      }
    },
  };
  // First observations deliberately run before an owner update. Only a
  // failed poll advances a real controller update, modeling frames between
  // bounded Playwright retries; this exposes immediately-true false receipts.
  const assertion = new Proxy(expect, { get(target, key) {
    if (key === 'poll') return (read: () => unknown) => ({ toBe: async (value: unknown) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const actual = await read(); if (actual === value) return;
        if (attempt === 3) expect(actual).toBe(value);
        update();
      }
    } });
    return Reflect.get(target, key);
  } });
  const run = (expression: string) => {
    const javascript = ts.transpileModule(`const extracted = ${expression};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const press = new Function('page', 'step', 'expect', `${javascript}\nreturn extracted;`)(
      page, (_label: string, action: () => Promise<void>) => action(), assertion,
    ) as (key: string) => Promise<void>;
    return press('Escape');
  };
  const destroy = () => { controller.destroy(); gameEvents.emit('destroy'); };
  return { controller, timeline, back, neutral, update, physical, run, destroy, failure };
}

it('extracts the three actual responsive keyboard journey press closures', () => {
  expect(helpers.map(helper => helper.title)).toEqual([
    'keyboard player journey reaches Mercenary and returns Home on the real canvas',
    'keyboard player launches the prepared Contract on the real canvas',
    'keyboard player journey reaches Career and Achievements on the real canvas',
  ]);
});

for (const helper of helpers) describe(helper.title, () => {
  it('holds a fresh physical key through owner sampling and releases core/quarantine before resolving', async () => {
    const h = harness();
    try {
      expect(h.neutral()).toBe(true);
      await h.run(helper.expression);
      expect(h.back).toHaveBeenCalledOnce();
      const command = h.timeline.findIndex(row => row.event === 'back-command');
      const up = h.timeline.findIndex(row => row.event === 'keyup');
      expect(command).toBeGreaterThanOrEqual(0); expect(command).toBeLessThan(up);
      expect(h.timeline.slice(0, up).some(row => row.event === 'owner-update' && row.held)).toBe(true);
      expect(h.timeline.slice(up + 1).some(row => row.event === 'owner-update' && !row.held)).toBe(true);
      expect(h.neutral()).toBe(true); expect(h.controller.isQuarantined()).toBe(false);
    } finally { h.destroy(); }
  });

  it('waits for existing quarantine to clear before a new physical down', async () => {
    const h = harness();
    try {
      h.controller.quarantineUntilNeutral();
      await h.run(helper.expression);
      expect(h.timeline.find(row => row.event === 'keydown')?.quarantined).toBe(false);
      expect(h.back).toHaveBeenCalledOnce(); expect(h.neutral()).toBe(true);
    } finally { h.destroy(); }
  });

  it.each(['frame-false', 'frame-throw', 'evaluate-throw'] as const)('releases in finally and preserves %s failures', async fault => {
    const h = harness(fault);
    try {
      const result = await h.run(helper.expression).then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
      expect(h.timeline.filter(row => row.event === 'keyup')).toHaveLength(1);
      expect(h.back).not.toHaveBeenCalled(); expect(h.neutral()).toBe(true);
      expect(result.ok).toBe(false);
      if (!result.ok && fault !== 'frame-false') expect(result.error).toBe(h.failure);
    } finally { h.destroy(); }
  });
});
