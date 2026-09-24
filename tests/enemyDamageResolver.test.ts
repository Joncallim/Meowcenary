import { describe, expect, it, vi, beforeEach } from 'vitest';
import './__mocks__/phaser';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { RunState } from '../src/gameplay/runState';
import { applyEnemyDamage } from '../src/gameplay/enemyDamageResolver';

function createMockEnemy(overrides: Record<string, unknown> = {}) {
  const enemy: Record<string, unknown> = {
    instanceId: 1,
    defId: 'test-enemy',
    xpValue: 10,
    scrapValue: 5,
    definition: { lootTableId: 'test-loot' },
    x: 100,
    y: 200,
    health: 100,
    maxHealth: 100,
    active: true,
    state: 'pursuing',
    shielded: false,
  };
  Object.assign(enemy, overrides);
  enemy.takeDamage = vi.fn((amount: number, source?: { x: number; y: number }) => {
    const e = enemy as any;
    if (e.state === 'dead' || !e.active) return false;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (e.shielded && source) return false;
    const applied = Math.min(amount, e.health);
    e.health -= applied;
    if (e.health <= 0) {
      e.state = 'dead';
      e.active = false;
      return true;
    }
    return false;
  });
  return enemy as any;
}

function createRunState(overrides: Partial<RunState> = {}): RunState {
  return { kills: 0, status: 'active', ...overrides } as any;
}

describe('applyEnemyDamage (universal lethal settlement)', () => {
  let bus: EventBus;
  let runState: RunState;
  let killedHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bus = createEventBus();
    runState = createRunState();
    killedHandler = vi.fn();
    bus.on('enemy:killed', killedHandler);
  });

  // ---- LETHAL ----

  it('applies lethal damage and increments kills exactly once', () => {
    const enemy = createMockEnemy({ health: 50 });
    const result = applyEnemyDamage(enemy, 100, runState, bus);
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(true);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);
    expect(killedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 1, enemyId: 'test-enemy', xpValue: 10, scrapValue: 5 }),
    );
  });

  it('handles overkill without double-counting kills', () => {
    const enemy = createMockEnemy({ health: 10 });
    const result = applyEnemyDamage(enemy, 999, runState, bus);
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(true);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);
  });

  it('emits killed event with correct position', () => {
    const enemy = createMockEnemy({ health: 10, x: 150, y: 250 });
    applyEnemyDamage(enemy, 10, runState, bus);
    expect(killedHandler).toHaveBeenCalledWith(expect.objectContaining({ x: 150, y: 250 }));
  });

  it('includes lootTableId when present', () => {
    const enemy = createMockEnemy({ health: 10, definition: { lootTableId: 'enemy-test' } });
    applyEnemyDamage(enemy, 10, runState, bus);
    expect(killedHandler).toHaveBeenCalledWith(expect.objectContaining({ lootTableId: 'enemy-test' }));
  });

  it('omits lootTableId when absent', () => {
    const enemy = createMockEnemy({ health: 10, definition: {} });
    applyEnemyDamage(enemy, 10, runState, bus);
    const payload = killedHandler.mock.calls[0][0];
    expect(payload.lootTableId).toBeUndefined();
  });

  // ---- NON-LETHAL ----

  it('applies non-lethal damage without incrementing kills', () => {
    const enemy = createMockEnemy({ health: 100 });
    const result = applyEnemyDamage(enemy, 30, runState, bus);
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(0);
    expect(killedHandler).not.toHaveBeenCalled();
  });

  // ---- POST-DEATH ----

  it('does not count repeated damage after death', () => {
    const enemy = createMockEnemy({ health: 10 });
    applyEnemyDamage(enemy, 10, runState, bus);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);

    const result = applyEnemyDamage(enemy, 10, runState, bus);
    expect(result.applied).toBe(false);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);
  });

  // ---- SHIELD ----

  it('blocks damage when shield is active and source is provided', () => {
    const enemy = createMockEnemy({ health: 50, shielded: true });
    const result = applyEnemyDamage(enemy, 30, runState, bus, { x: 0, y: 0 });
    // Hit connected with live target — shield blocked health loss but the
    // resolver reports applied=true (the enemy was targetable).
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(0);
    expect(killedHandler).not.toHaveBeenCalled();
  });

  it('allows damage when shield is active but no source provided', () => {
    const enemy = createMockEnemy({ health: 50, shielded: true });
    const result = applyEnemyDamage(enemy, 30, runState, bus);
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(false);
  });

  // ---- INVALID INPUT ----

  it('returns applied=false for already-dead enemy', () => {
    const enemy = createMockEnemy({ health: 0, state: 'dead', active: false });
    const result = applyEnemyDamage(enemy, 10, runState, bus);
    expect(result.applied).toBe(false);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(0);
  });

  it('reports non-finite damage as hit-connected but no kill', () => {
    const enemy = createMockEnemy({ health: 100 });
    const result = applyEnemyDamage(enemy, NaN, runState, bus);
    // Enemy.takeDamage rejects NaN, enemy is still active → applied=true
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(0);
  });

  it('reports zero damage as hit-connected but no kill', () => {
    const enemy = createMockEnemy({ health: 100 });
    const result = applyEnemyDamage(enemy, 0, runState, bus);
    expect(result.applied).toBe(true);
    expect(result.killed).toBe(false);
    expect(runState.kills).toBe(0);
  });

  // ---- EXACT-ONCE ----

  it('emits enemy:killed exactly once per alive→dead transition', () => {
    const enemy = createMockEnemy({ health: 50 });
    applyEnemyDamage(enemy, 30, runState, bus);
    applyEnemyDamage(enemy, 30, runState, bus);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent enemies', () => {
    const enemy1 = createMockEnemy({ instanceId: 1, health: 10, defId: 'enemy-a' });
    const enemy2 = createMockEnemy({ instanceId: 2, health: 10, defId: 'enemy-b' });
    applyEnemyDamage(enemy1, 10, runState, bus);
    applyEnemyDamage(enemy2, 10, runState, bus);
    expect(runState.kills).toBe(2);
    expect(killedHandler).toHaveBeenCalledTimes(2);
    expect(killedHandler.mock.calls[0][0].enemyId).toBe('enemy-a');
    expect(killedHandler.mock.calls[1][0].enemyId).toBe('enemy-b');
  });

  // ---- ABILITIES SEAM ----

  it('works correctly through the abilities damageEnemy seam', () => {
    const enemy = createMockEnemy({ health: 10 });
    const abilityDamageEnemy = (e: any, amount: number) => applyEnemyDamage(e, amount, runState, bus);
    abilityDamageEnemy(enemy, 10);
    expect(runState.kills).toBe(1);
    expect(killedHandler).toHaveBeenCalledTimes(1);
  });
});
