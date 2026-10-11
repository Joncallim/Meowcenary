import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { checkStage } from '../src/systems/validation/stages';
import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { RunStartIntroView } from '../src/ui/runStartIntroView';
import { resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { loadGameData } from '../src/systems/validation';

// Exercise the exact installed wrapping algorithms with deterministic widths.
// This catches basic-wrap token overflow without claiming browser font rendering.
const textSource = readFileSync(createRequire(import.meta.url).resolve('phaser/src/gameobjects/text/Text.js'), 'utf8');
const phaserWrap: Record<string, (...args: any[]) => string> = {};
for (const name of ['basicWordWrap', 'advancedWordWrap']) {
  const body = textSource.match(new RegExp(`${name}: (function \\(text, context, wordWrapWidth\\)[\\s\\S]*?return (?:result|output);\\s*})`))?.[1];
  if (!body) throw new Error(`Installed Phaser ${name} implementation unavailable`);
  phaserWrap[name] = runInNewContext(`(${body})`);
}

// Geometry is approximate; these tests certify ownership and bounded footer
// arithmetic, never browser text rasterization or physical device behavior.
class Node extends EventEmitter {
  list: Node[] = []; parent?: Node; destroyed = false; scaleX = 1; originX = 0; originY = 0; height = 0; width = 0; text = ''; wrappedText = ''; style: any = {};
  constructor(readonly kind: string, public x = 0, public y = 0) { super(); }
  add(node: Node | Node[]) { for (const child of Array.isArray(node) ? node : [node]) { this.list.push(child); child.parent = this; } return this; }
  setScrollFactor() { return this; } setDepth() { return this; } setScale(scale: number) { this.scaleX = scale; return this; }
  setInteractive() { return this; } setStrokeStyle() { return this; } setOrigin(x = .5, y = x) { this.originX = x; this.originY = y; return this; }
  setDisplaySize(w: number, h: number) { this.width = w; this.height = h; return this; }
  setMask() { return this; } clearMask() { return this; } setText(text: string) { this.text = text; return this; }
  destroy(deep = true) { if (this.destroyed) throw new Error('double destroy'); this.destroyed = true; if (deep) this.list.forEach(child => child.destroy()); this.removeAllListeners(); }
}
function harness(width = 360, height = 640, absent = false, longTokens = false) {
  const data = structuredClone(loadGameData());
  if (absent) delete (data.characters[0] as { abilityId?: string }).abilityId;
  const request = { kind: 'stage' as const, characterId: data.characters[0].id, stageId: 'stage:junkyard-06', seed: 11 };
  if (longTokens) {
    const stage = data.stages!.find(row => row.id === request.stageId)!;
    (stage.openingDialogue as any).lines = ['W'.repeat(100), 'W'.repeat(60)];
    (stage as any).name = 'N'.repeat(60);
    expect(checkStage(stage, 0)).toEqual([]);
  }
  const plan = resolveRunPlan(request, data as any);
  const model = structuredClone(resolveRunStartIntroModel({ data, request, plan }));
  if (longTokens) { (model.mercenary as any).characterName = 'M'.repeat(60); (model.boss as any).name = 'B'.repeat(60); }
  if (model.ability) (model.ability.effect as any).detail = Array(12).fill(model.ability.effect.detail).join(' ');
  const nodes: Node[] = []; const make = (kind: string, x: number, y: number) => { const node = new Node(kind, x, y); nodes.push(node); return node; };
  const mask = { destroy: vi.fn() }; const graphics = { fillStyle() { return this; }, fillRect() { return this; }, setScrollFactor() { return this; }, createGeometryMask: () => mask, destroy: vi.fn() };
  const scene = {
    scale: Object.assign(new EventEmitter(), { width, height }), input: new EventEmitter(), game: { events: new EventEmitter() },
    textures: { exists: () => true }, make: { graphics: () => graphics },
    add: {
      container: (x: number, y: number) => make('container', x, y),
      rectangle: (x: number, y: number, w: number, h: number) => make('rectangle', x, y).setDisplaySize(w, h),
      image: (x: number, y: number) => make('image', x, y),
      text: (x: number, y: number, copy: string, style: any) => {
        const node = make('text', x, y); node.text = copy; node.style = style;
        const size = parseInt(style.fontSize); const measure = (value: string) => value.length * size * .6;
        node.wrappedText = style.wordWrap?.width
          ? phaserWrap[style.wordWrap.useAdvancedWrap ? 'advancedWordWrap' : 'basicWordWrap'].call(
            { splitRegExp: /\r\n|\r|\n/, letterSpacing: 0 }, copy, { measureText: (value: string) => ({ width: measure(value) }) }, style.wordWrap.width)
          : copy;
        const lines = node.wrappedText.split(/\r\n|\r|\n/);
        node.width = Math.max(...lines.map(measure)); node.height = lines.length * (size + 3); return node;
      },
    },
  };
  const command = vi.fn(); const view = new RunStartIntroView({ scene: scene as any, model, art: new DataVisualArtRegistry(data), onCommand: command, canInteract: () => true, readInputMode: () => 'keyboard', onError: vi.fn() });
  view.render({ phase: 'brief', revision: 0 });
  return { view, scene, model, nodes, command, mask, graphics };
}
describe('bounded intro view', () => {
  it.each([[360, 640], [390, 844], [844, 390], [1280, 720]])('keeps readable text and every action inside %s x %s', (width, height) => {
    const { view, nodes } = harness(width, height);
    const actions = (view as any).buttons as { rect: Node }[];
    expect(actions.length).toBeGreaterThan(0);
    for (const { rect } of actions) { expect(rect.height).toBeGreaterThanOrEqual(48); expect(rect.y - rect.height / 2).toBeGreaterThanOrEqual(16); expect(rect.y + rect.height / 2).toBeLessThanOrEqual(height - 16); }
    for (const node of nodes.filter(row => row.kind === 'text')) expect(parseInt(node.style.fontSize)).toBeGreaterThanOrEqual(14);
    view.destroy();
  });
});

describe('intro overflow and gesture lifetime', () => {
  it('makes overflow reachable by wheel, drag and keyboard without changing the focused command or controller', () => {
    const { view, scene, command } = harness(); const live = view as any;
    expect(live.maxScroll).toBeGreaterThan(0); const focus = view.focusedCommand();
    const p = { id: 1, x: live.contentBounds.x + 2, y: live.contentBounds.y + 10, isDown: true };
    scene.input.emit('wheel', p, [], 0, 100000);
    expect(live.scrollOffset).toBe(live.maxScroll); expect(command).not.toHaveBeenCalled();
    view.moveFocus('up'); expect(live.scrollOffset).toBeLessThan(live.maxScroll);
    expect(view.focusedCommand()).toBe(focus);
    scene.input.emit('pointerdown', p); scene.input.emit('pointermove', { ...p, y: p.y + 100000 });
    expect(live.scrollOffset).toBe(0); expect(command).not.toHaveBeenCalled();
    view.moveFocus('right'); expect(view.focusedCommand()).not.toBe(focus);
    const selected = view.focusedCommand(); scene.scale.emit('resize'); expect(view.focusedCommand()).toBe(selected);
    view.destroy(); expect(scene.input.listenerCount('wheel')).toBe(0); expect(scene.scale.listenerCount('resize')).toBe(0);
  });
  it('expires pre-resize, scrolled, pointer-out, blur and two-finger gestures; fresh same-card release works once', () => {
    for (const interruption of ['resize', 'scroll', 'out', 'blur', 'other-finger', 'outside', 'cancel']) {
      const { view, scene, command } = harness(); const live = view as any;
      const button = live.buttons[0].rect as Node; const pointer = { id: 1, x: button.x, y: button.y, isDown: true };
      button.emit('pointerdown', pointer);
      if (interruption === 'resize') scene.scale.emit('resize');
      if (interruption === 'scroll') view.moveFocus('down');
      if (interruption === 'out') button.emit('pointerout');
      if (interruption === 'blur') scene.game.events.emit('blur');
      if (interruption === 'outside') scene.input.emit('pointerupoutside', pointer);
      button.emit('pointerup', { ...pointer, id: interruption === 'other-finger' ? 2 : 1, isDown: false, wasCanceled: interruption === 'cancel' });
      expect(command).not.toHaveBeenCalled();
      const current = live.buttons[0].rect as Node;
      current.emit('pointerdown', pointer); current.emit('pointerup', { ...pointer, isDown: false }); current.emit('pointerup', pointer);
      expect(command).toHaveBeenCalledOnce(); view.destroy(); view.destroy();
      expect(scene.input.listenerCount('pointerdown')).toBe(0);
    }
  });
  it('renders an absent ability as mercenary and objective with explicit Continue/Skip/Return', () => {
    const { view, model, nodes } = harness(360, 640, true);
    expect(model.ability).toBeUndefined(); expect(nodes.some(row => row.text === model.mercenary.characterName)).toBe(true);
    expect(nodes.some(row => row.text === 'Start · Skip dialogue')).toBe(true);
    expect(nodes.some(row => row.text.startsWith('Cooldown'))).toBe(false);
    expect(nodes.filter(row => row.kind === 'image')).toHaveLength(1);
    view.destroy();
  });
});


describe('intro usable safe area', () => {
  it('keeps the footer within nonzero top/bottom insets and retains boss focus during reflow', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => ({ '--safe-top': '44px', '--safe-bottom': '34px', '--safe-left': '8px', '--safe-right': '8px' }[name] ?? '0px') }));
    try {
      const { view } = harness(); view.render({ phase: 'boss', revision: 1 }); view.restoreFocus('return-menu'); view.reflow();
      for (const { rect } of (view as any).buttons) {
        expect(rect.y - rect.height / 2).toBeGreaterThanOrEqual(60);
        expect(rect.y + rect.height / 2).toBeLessThanOrEqual(640 - 50);
      }
      expect(view.focusedCommand()).toBe('return-menu'); view.destroy();
    } finally { vi.unstubAllGlobals(); }
  });
});


it('wraps every character of valid long-token boss copy, titles and names inside the scroll body', () => {
  const { view, nodes, model } = harness(360, 640, false, true); const live = view as any;
  for (const phase of ['brief', 'boss'] as const) {
    view.render({ phase, revision: phase === 'brief' ? 0 : 1 });
    const content = nodes.filter(node => !node.destroyed && node.parent === live.content && node.kind === 'text');
    for (const node of content) {
      expect(node.x + node.width, node.text).toBeLessThanOrEqual(live.contentBounds.width);
      expect(parseInt(node.style.fontSize)).toBeGreaterThanOrEqual(14);
      expect(node.wrappedText.replace(/\s/g, '')).toBe(node.text.replace(/\s/g, ''));
    }
    if (phase === 'boss') {
      const dialogue = content.find(node => node.text === model.boss!.lines.join('\n\n'))!;
      expect(dialogue.wrappedText).toContain('\n\n');
      expect(dialogue.wrappedText.replace(/\s/g, '')).toHaveLength(160);
    }
    const last = content.at(-1)!; live.scrollBy(1e8);
    expect(live.contentTop + last.y + last.height - live.scrollOffset).toBeLessThanOrEqual(live.contentBounds.y + live.contentBounds.height);
  }
  view.destroy();
});


it('retains main ability and confirmation teaching before a modality is established', () => {
  const { view, nodes } = harness();
  const copy = nodes.filter(node => node.kind === 'text').map(node => node.text).join('\n');
  for (const binding of ['Q', 'left face', 'tap card', 'Enter/Space', 'bottom face']) expect(copy).toContain(binding);
  view.destroy();
});

it('routes matching touch and logical choices through semantic commands while keeping Back navigable', () => {
  const { view, command } = harness(); const first = (view as any).buttons.find((row: any) => row.command === 'continue').rect;
  const pointer = { id: 41, x: first.x, y: first.y, isDown: true };
  first.emit('pointerdown', pointer); first.emit('pointerup', { ...pointer, isDown: false });
  expect(command).toHaveBeenCalledExactlyOnceWith('continue', 0);
  view.restoreFocus('return-menu'); view.confirmFocused(); expect(command).toHaveBeenLastCalledWith('return-menu', 0);
  view.render({ phase: 'cancelled', revision: 1 }); view.confirmFocused(); expect(command).toHaveBeenCalledTimes(2);
  view.destroy();
});

it('shutdown disposes every old-view successor object/listener and captured callbacks cannot resurrect it', () => {
  const { view, nodes, scene, command } = harness(); const target = (view as any).buttons[0].rect;
  const pointer = { id: 42, x: target.x, y: target.y, isDown: true };
  target.emit('pointerdown', pointer); const queued = target.listeners('pointerup')[0];
  view.destroy(); view.destroy(); queued({ ...pointer, isDown: false }); scene.scale.emit('resize'); view.confirmFocused(); view.refreshInputPresentation();
  expect(command).not.toHaveBeenCalled(); expect(scene.scale.listenerCount('resize')).toBe(0);
  expect(nodes.every(node => node.destroyed)).toBe(true);
});

/** Execute the shipped browser oracle and semantic-target checker, not a
 * second approximation of their predicates. This remains headless geometry. */
async function browserLayoutOracle(): Promise<(state: any, viewport: { width: number; height: number }) => void> {
  const ts = await import('typescript');
  const extract = (path: string, name: string) => {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!fn) throw new Error(`Missing browser function ${name}`);
    return fn.getText(source).replace(/^export\s+/, '');
  };
  const code = extract('browser-tests/run-start-helpers.ts', 'introCommand')
    + '\n' + extract('browser-tests/ability-comprehension.pw.ts', 'assertBriefFits') + '\nassertBriefFits;';
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { expect });
}
function browserGeometry(h: ReturnType<typeof harness>) {
  const live = h.view as any;
  return {
    body: { ...live.contentBounds }, scroll: { offset: live.scrollOffset, max: live.maxScroll },
    commands: live.buttons.map(({ command, label, rect }: any) => ({ command, label, enabled: true,
      bounds: { x: rect.x - rect.width / 2, y: rect.y - rect.height / 2, width: rect.width, height: rect.height } })),
    introText: h.nodes.filter(node => !node.destroyed && node.kind === 'text').map(node => ({
      text: node.text, width: node.width, height: node.height, inScrollBody: node.parent === live.content,
      x: node.x - node.originX * node.width + (node.parent === live.content ? live.content.x : 0),
      y: node.y - node.originY * node.height + (node.parent === live.content ? live.content.y : 0),
    })),
  };
}

describe('exact browser intro layout oracle', () => {
  it.each([[360, 640], [390, 844], [844, 390], [1280, 720], [1114, 720]])(
    'accepts actual %sx%s portrait or side-by-side geometry and reachable full copy', async (width, height) => {
      const oracle = await browserLayoutOracle();
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => ({ '--safe-top': '44px', '--safe-bottom': '34px', '--safe-left': '8px', '--safe-right': '8px' }[name] ?? '0px') }));
      const h = harness(width, height, false, true); const live = h.view as any;
      try {
        for (const phase of ['brief', 'boss'] as const) {
          h.view.render({ phase, revision: phase === 'brief' ? 0 : 1 });
          const state = browserGeometry(h);
          expect(() => oracle(state, { width, height })).not.toThrow();
          const body = state.body, first = state.commands[0].bounds;
          if (width === 844) expect(body.x + body.width).toBeLessThan(first.x);
          else expect(body.y + body.height).toBeLessThan(first.y);
          for (const rect of [body, ...state.commands.map((row: any) => row.bounds)]) {
            expect(rect.x).toBeGreaterThanOrEqual(8); expect(rect.y).toBeGreaterThanOrEqual(44);
            expect(rect.x + rect.width).toBeLessThanOrEqual(width - 8); expect(rect.y + rect.height).toBeLessThanOrEqual(height - 34);
          }
          const copy = h.nodes.filter(node => !node.destroyed && node.parent === live.content && node.kind === 'text');
          expect(copy.length).toBeGreaterThan(2);
          for (const node of copy) {
            expect(parseInt(node.style.fontSize)).toBeGreaterThanOrEqual(14);
            expect(node.wrappedText.replace(/\s/g, '')).toBe(node.text.replace(/\s/g, ''));
          }
          live.scrollBy(Number.MAX_SAFE_INTEGER);
          const after = browserGeometry(h); oracle(after, { width, height });
          const last = after.introText.filter(row => row.inScrollBody).at(-1)!;
          expect(last.y + last.height).toBeLessThanOrEqual(body.y + body.height + .01);
          expect(live.scrollOffset).toBe(live.maxScroll);
        }
      } finally { h.view.destroy(); vi.unstubAllGlobals(); }
    },
  );
  it.each((['body-overlap', 'action-overlap', 'body-outside', 'action-outside', 'empty-body', 'short-target', 'narrow-target', 'text-outside', 'text-before-scroll-top'] as const).flatMap(defect => [[defect, 360, 640], [defect, 844, 390]] as const))(
    'rejects %s at %sx%s while preserving its positive control', async (defect, width, height) => {
      const oracle = await browserLayoutOracle(); const h = harness(width, height);
      try {
        const state = browserGeometry(h); oracle(state, { width, height });
        if (defect === 'body-overlap') {
          if (width === 844) state.body.width = state.commands[0].bounds.x + 10 - state.body.x;
          else state.body.height = state.commands[0].bounds.y + 10 - state.body.y;
        }
        if (defect === 'action-overlap') state.commands[1].bounds = { ...state.commands[0].bounds };
        if (defect === 'body-outside') state.body.y = -1;
        if (defect === 'action-outside') state.commands[0].bounds.x = -1;
        if (defect === 'empty-body') state.body.height = 0;
        if (defect === 'short-target') state.commands[0].bounds.height = 43;
        if (defect === 'narrow-target') state.commands[0].bounds.width = 43;
        const text = state.introText.find(row => row.inScrollBody)!;
        if (defect === 'text-outside') text.x = state.body.x - 1;
        if (defect === 'text-before-scroll-top') text.y = state.body.y - state.scroll.offset - 1;
        expect(() => oracle(state, { width, height })).toThrow();
      } finally { h.view.destroy(); }
    },
  );
});
