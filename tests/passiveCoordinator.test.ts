import { describe, expect, it, vi } from 'vitest';
import { PassiveCoordinator } from '../src/systems/PassiveCoordinator';
import { createPassiveHandlerRegistry } from '../src/gameplay/characterPassives';
import type { PassiveHandler } from '../src/gameplay/characterPassives';
import type { CharacterPassiveEvent, CharacterDefinition } from '../src/systems/types';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import type { RunState } from '../src/gameplay/runState';

function character(overrides: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id: 'test-cat',
    name: 'Test Cat',
    description: 'Test.',
    baseStats: { maxHealth: 100, moveSpeed: 175 },
    startingWeaponIds: [],
    passives: [],
    unlock: { type: 'default' },
    cosmeticSkinIds: [],
    ...overrides,
  } as CharacterDefinition;
}

function reactivePassive(id: string, event: CharacterPassiveEvent, handlerId: string) {
  return {
    id,
    kind: 'reactive' as const,
    name: id,
    description: 'Test reactive passive.',
    event,
    handlerId,
  };
}

function activeRun(): RunState {
  const run = createRunState({ seed: 1, characterId: 'test-cat', arenaId: 'arena' });
  run.status = 'active';
  return run;
}

describe('PassiveCoordinator', () => {
  it('installs subscriptions and dispatches on declared event', () => {
    const bus = createEventBus();
    const run = activeRun();
    const calls: Array<{ sourceId: string; payload: unknown }> = [];
    const handler: PassiveHandler<CharacterPassiveEvent> = (ctx, payload) => {
      calls.push({ sourceId: ctx.sourceId, payload });
    };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('test-passive', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });

    expect(calls).toHaveLength(1);
    expect(calls[0].sourceId).toBe('character:test-cat:test-passive');
    expect(calls[0].payload).toMatchObject({ instanceId: 1, enemyId: 'd' });

    coord.destroy();
  });

  it('sourceId uses character:<characterId>:<passiveId> format', () => {
    const bus = createEventBus();
    const run = activeRun();
    const sources: string[] = [];
    const handler: PassiveHandler<CharacterPassiveEvent> = (ctx) => {
      sources.push(ctx.sourceId);
    };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      id: 'bolt-hound',
      passives: [reactivePassive('quick-tail', 'level:up', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('level:up', { level: 2 });
    expect(sources).toEqual(['character:bolt-hound:quick-tail']);
    coord.destroy();
  });

  it('dispatches in deterministic order across multiple reactive passives on same event', () => {
    const bus = createEventBus();
    const run = activeRun();
    const order: string[] = [];
    const handlerA: PassiveHandler<CharacterPassiveEvent> = (ctx) => {
      order.push(ctx.sourceId);
    };
    const handlerB: PassiveHandler<CharacterPassiveEvent> = (ctx) => {
      order.push(ctx.sourceId);
    };
    const handlers = createPassiveHandlerRegistry({ a: handlerA, b: handlerB });
    const c = character({
      passives: [
        reactivePassive('first', 'enemy:killed', 'a'),
        reactivePassive('second', 'enemy:killed', 'b'),
      ],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });

    expect(order).toEqual([
      'character:test-cat:first',
      'character:test-cat:second',
    ]);
    coord.destroy();
  });

  it('blocks reentrancy and logs an error', () => {
    const bus = createEventBus();
    const run = activeRun();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reentered = false;

    const handler: PassiveHandler<CharacterPassiveEvent> = (_ctx, _payload) => {
      bus.emit('enemy:killed', { instanceId: 3, enemyId: 'e', xpValue: 20, scrapValue: 0, x: 10, y: 10 });
      reentered = true;
    };

    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('reentry', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });

    expect(reentered).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('reentrant dispatch blocked'),
    );

    coord.destroy();
    consoleSpy.mockRestore();
  });

  it('isolates a throwing handler via EventBus existing try/catch, sibling handlers still fire', () => {
    const bus = createEventBus();
    const run = activeRun();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let siblingFired = false;
    const throwingHandler: PassiveHandler<CharacterPassiveEvent> = () => {
      throw new Error('handler exploded');
    };
    const safeHandler: PassiveHandler<CharacterPassiveEvent> = () => {
      siblingFired = true;
    };

    const handlers = createPassiveHandlerRegistry({ thrower: throwingHandler, safe: safeHandler });
    const c = character({
      passives: [
        reactivePassive('thrower', 'enemy:killed', 'thrower'),
        reactivePassive('safe-one', 'enemy:killed', 'safe'),
      ],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });

    expect(siblingFired).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('EventBus listener failed'),
      expect.any(Error),
    );

    coord.destroy();
    consoleSpy.mockRestore();
  });

  it('second coordinator for the same RunState stays inert (no double dispatch)', () => {
    const bus = createEventBus();
    const run = activeRun();
    const calls: string[] = [];
    const handler: PassiveHandler<CharacterPassiveEvent> = (ctx) => {
      calls.push(ctx.sourceId);
    };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('first', 'enemy:killed', 'test')],
    });

    const coord1 = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    const coord2 = new PassiveCoordinator({ runState: run, bus, character: c, handlers });

    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });
    expect(calls).toHaveLength(1);

    coord1.destroy();
    coord2.destroy();
  });

  it('destroy() is idempotent', () => {
    const bus = createEventBus();
    const run = activeRun();
    const handler: PassiveHandler<CharacterPassiveEvent> = () => {};
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('test', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    coord.destroy();
    expect(() => coord.destroy()).not.toThrow();
    expect(() => coord.destroy()).not.toThrow();
  });

  it('unsubscribes from events on destroy', () => {
    const bus = createEventBus();
    const run = activeRun();
    let callCount = 0;
    const handler: PassiveHandler<CharacterPassiveEvent> = () => { callCount += 1; };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('test', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });
    expect(callCount).toBe(1);

    coord.destroy();
    bus.emit('enemy:killed', { instanceId: 2, enemyId: 'e', xpValue: 20, scrapValue: 0, x: 10, y: 10 });
    expect(callCount).toBe(1);
  });

  it('suppresses dispatch when RunState is not active', () => {
    const bus = createEventBus();
    const run = activeRun();
    let callCount = 0;
    const handler: PassiveHandler<CharacterPassiveEvent> = () => { callCount += 1; };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('test', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });

    run.status = 'paused';
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });
    expect(callCount).toBe(0);

    run.status = 'won';
    bus.emit('enemy:killed', { instanceId: 2, enemyId: 'e', xpValue: 20, scrapValue: 0, x: 10, y: 10 });
    expect(callCount).toBe(0);

    run.status = 'active';
    bus.emit('enemy:killed', { instanceId: 3, enemyId: 'f', xpValue: 30, scrapValue: 0, x: 20, y: 20 });
    expect(callCount).toBe(1);

    coord.destroy();
  });

  it('throws on construction with an unknown handlerId', () => {
    const bus = createEventBus();
    const run = activeRun();
    const handlers = createPassiveHandlerRegistry({});
    const c = character({
      passives: [reactivePassive('test', 'enemy:killed', 'nonexistent')],
    });

    expect(() => new PassiveCoordinator({ runState: run, bus, character: c, handlers }))
      .toThrow('Unknown passive handler "nonexistent"');
  });

  it('handler receives only run, sourceId, and bus (no GameContext or MetaState)', () => {
    const bus = createEventBus();
    const run = activeRun();
    let ctxKeys: string[] = [];
    const handler: PassiveHandler<CharacterPassiveEvent> = (ctx) => {
      ctxKeys = Object.keys(ctx).sort();
    };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [reactivePassive('test', 'enemy:killed', 'test')],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });
    expect(ctxKeys).toEqual(['bus', 'run', 'sourceId']);
    coord.destroy();
  });

  it('filters out static passives and only installs reactive ones', () => {
    const bus = createEventBus();
    const run = activeRun();
    let callCount = 0;
    const handler: PassiveHandler<CharacterPassiveEvent> = () => { callCount += 1; };
    const handlers = createPassiveHandlerRegistry({ test: handler });
    const c = character({
      passives: [
        {
          id: 'static-one',
          kind: 'static',
          name: 'Static',
          description: 'Static.',
          effects: [{ stat: 'damage', op: 'add', value: 5 }],
        },
        reactivePassive('reactive-one', 'enemy:killed', 'test'),
      ],
    });

    const coord = new PassiveCoordinator({ runState: run, bus, character: c, handlers });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'd', xpValue: 10, scrapValue: 0, x: 0, y: 0 });
    expect(callCount).toBe(1);
    coord.destroy();
  });
});
