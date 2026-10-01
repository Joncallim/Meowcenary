import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createRunState } from '../src/gameplay/runState';
import { createPerfSampler, GAMEPLAY_PERF_OWNERS } from '../src/gameplay/perf';
import { loadGameData } from '../src/systems/validation';
import { DataArenaRegistry } from '../src/systems/arenas';

const probe = vi.hoisted(() => ({ enabled: true, clock: 0, now: vi.fn(), releaseGameplay: vi.fn(), attachGameplay: vi.fn(), record: vi.fn() }));
vi.mock('../src/platform/performanceProbe', () => ({ get performanceProbe() { return probe.enabled ? probe : undefined; } }));
vi.mock('../src/platform/orientation', () => ({ isPortraitOrientationBlocked: () => false, onPortraitOrientationChange: () => () => {} }));

// Exercise the real orchestration without duplicating Phaser's scene construction.
function harness() {
  const scene = new GameScene() as any;
  scene.runState = createRunState({ seed: 42, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
  scene.runState.status = 'active';
  scene.getContext = () => ({ settings: { reducedMotion: false } });
  for (const method of ['syncPhysicsPause', 'syncGameplayPointerOwnership', 'updateStageObjective', 'retryPendingAchievementFacts', 'tickAbility']) scene[method] = vi.fn();
  scene.hasPendingTerminalPersistence = () => false;
  scene.inputController = { update: vi.fn(), getMoveVector: () => ({ x: 0, y: 0 }), getPointer: () => null };
  scene.player = { update: vi.fn(), health: 100, maxHealth: 100, grantInvulnerability: vi.fn() };
  scene.hudController = { update: vi.fn() };
  scene.audioManager = { update: vi.fn() };
  scene.perfSampler = createPerfSampler(600, 60, GAMEPLAY_PERF_OWNERS);
  scene.performanceDurations = new Float64Array(11);
  scene.performanceSeen = new Uint8Array(11);
  scene.performanceSystemOwners = new Map();
  return scene;
}

beforeEach(() => {
  vi.clearAllMocks();
  probe.enabled = true;
  probe.clock = 0;
  probe.now.mockImplementation(() => ++probe.clock);
});
afterEach(() => vi.unstubAllEnvs());

describe('GameScene opt-in timing', () => {
  it('aggregates shared owners once per frame while retaining system order and cheap HUD reads', () => {
    const scene = harness();
    const order: string[] = [];
    const first = { update: () => order.push('feedback') };
    const second = { update: () => order.push('defeat') };
    const third = { update: () => order.push('weapons') };
    scene.systems = [first, second, third];
    scene.performanceSystemOwners = new Map([[first, 8], [second, 8], [third, 6]]);
    const detailed = vi.spyOn(scene.perfSampler, 'detailedSnapshot');
    scene.update(0, 16);
    expect(order).toEqual(['feedback', 'defeat', 'weapons']);
    expect(detailed).not.toHaveBeenCalled();
    const owners = scene.perfSampler.detailedSnapshot().owners;
    expect(owners.find((owner: any) => owner.name === 'feedback')).toMatchObject({ sampleCount: 1, averageMs: 2 });
    expect(owners.find((owner: any) => owner.name === 'weapons')).toMatchObject({ sampleCount: 1, averageMs: 1 });
    scene.update(16, 16);
    expect(scene.perfSampler.detailedSnapshot().owners.find((owner: any) => owner.name === 'feedback').sampleCount).toBe(2);
  });

  it('retains objective completion early break and records only owners actually reached', () => {
    const scene = harness();
    scene.stageRuntime = { state: { status: 'active' } };
    const first = { update: () => { scene.stageRuntime.state.status = 'objective-complete'; } };
    const next = { update: vi.fn() };
    scene.systems = [first, next];
    scene.performanceSystemOwners = new Map([[first, 6], [next, 7]]);
    scene.update(0, 16);
    expect(next.update).not.toHaveBeenCalled();
    expect(scene.updateStageObjective).toHaveBeenCalledWith(expect.anything(), 0);
    expect(scene.perfSampler.detailedSnapshot().owners.find((owner: any) => owner.name === 'drops').sampleCount).toBe(0);
  });

  it('leaves pending-clear simulation frozen while continuing HUD and audio measurement', () => {
    const scene = harness();
    scene.stageRuntime = { state: { status: 'objective-complete' }, pendingClear: {} };
    scene.dropSystem = { settlePendingClearLoot: vi.fn() };
    scene.systems = [{ update: vi.fn() }];
    scene.update(0, 16);
    expect(scene.runState.timeMs).toBe(0);
    expect(scene.player.update).not.toHaveBeenCalled();
    expect(scene.systems[0].update).not.toHaveBeenCalled();
    expect(scene.hudController.update).toHaveBeenCalledWith(16);
    expect(scene.audioManager.update).toHaveBeenCalledWith(16);
    const owners = scene.perfSampler.detailedSnapshot().owners;
    expect(owners.find((owner: any) => owner.name === 'hud').sampleCount).toBe(1);
    expect(owners.find((owner: any) => owner.name === 'audio').sampleCount).toBe(1);
    expect(owners.find((owner: any) => owner.name === 'spawning').sampleCount).toBe(0);
  });

  it('does not read any browser clock when profiling is disabled', () => {
    const scene = harness();
    probe.enabled = false;
    scene.update(0, 16);
    expect(probe.now).not.toHaveBeenCalled();
    expect(scene.perfSampler.snapshot().sampleCount).toBe(1);
  });

  it('releases the attached sampler on shutdown before clearing its identity', () => {
    const scene = harness();
    const sampler = scene.perfSampler;
    scene.events = { off: vi.fn() };
    scene.scale = { off: vi.fn() };
    scene.input = { off: vi.fn(), keyboard: { off: vi.fn() } };
    scene.inputController.destroy = vi.fn();
    scene.player.destroy = vi.fn();
    scene.handleShutdown();
    expect(probe.releaseGameplay).toHaveBeenCalledWith(sampler);
    expect(scene.perfSampler).toBeUndefined();
  });

  it('releases the exact sampler identity on persistent-scene restart', () => {
    const scene = harness();
    const sampler = scene.perfSampler;
    scene.resetPerRunState(false);
    expect(probe.releaseGameplay).toHaveBeenCalledWith(sampler);
    expect(scene.performanceSystemOwners).toBeUndefined();
  });
});

describe('guarded real-owner combat fixture', () => {
  function fixtureHarness() {
    const scene = harness();
    const data = loadGameData();
    scene.getContext = () => ({ data, arenas: new DataArenaRegistry(data) });
    scene.isTraining = true;
    scene.arenaDimensions = { width: 390, height: 844 };
    scene.textures = { exists: () => true };
    scene.performanceSpawnSystem = { spawnEncounterEnemy: vi.fn(() => true) };
    return scene;
  }

  it('rejects ordinary builds, disabled probes, non-Training runs and unloaded resources without mutation', () => {
    vi.stubEnv('VITE_VISUAL_TEST', '0');
    const scene = fixtureHarness();
    expect(scene.preparePerformanceFixture(123)).toBe(false);
    vi.stubEnv('VITE_VISUAL_TEST', '1');
    probe.enabled = false;
    expect(scene.preparePerformanceFixture(123)).toBe(false);
    probe.enabled = true;
    scene.isTraining = false;
    expect(scene.preparePerformanceFixture(123)).toBe(false);
    scene.isTraining = true;
    scene.runState.status = 'paused';
    expect(scene.preparePerformanceFixture(123)).toBe(false);
    scene.runState.status = 'active';
    scene.textures.exists = () => false;
    expect(scene.preparePerformanceFixture(123)).toBe(false);
    expect(scene.performanceSpawnSystem.spawnEncounterEnemy).not.toHaveBeenCalled();
    expect(scene.player.grantInvulnerability).not.toHaveBeenCalled();
  });

  it('caps seeded real-owner requests, reports fixture truth and rejects repeat injection', () => {
    vi.stubEnv('VITE_VISUAL_TEST', '1');
    const first = fixtureHarness();
    const second = fixtureHarness();
    expect(first.preparePerformanceFixture(123, 100)).toBe(true);
    expect(second.preparePerformanceFixture(123, 48)).toBe(true);
    expect(first.performanceSpawnSystem.spawnEncounterEnemy.mock.calls).toEqual(second.performanceSpawnSystem.spawnEncounterEnemy.mock.calls);
    expect(first.performanceSpawnSystem.spawnEncounterEnemy).toHaveBeenCalledTimes(48);
    expect(first.player.grantInvulnerability).toHaveBeenCalledWith(60_000);
    expect(first.performanceDiagnostics()).toMatchObject({ seed: 42, training: true,
      fixture: { seed: 123, requested: 48, spawned: 48, invulnerabilityMs: 60_000 } });
    const light = fixtureHarness();
    expect(light.preparePerformanceFixture(123, 0)).toBe(true);
    expect(light.performanceSpawnSystem.spawnEncounterEnemy).not.toHaveBeenCalled();
    expect(light.performanceDiagnostics().fixture).toMatchObject({ seed: 123, requested: 0, spawned: 0 });
    expect(first.preparePerformanceFixture(123)).toBe(false);
    expect(first.performanceSpawnSystem.spawnEncounterEnemy).toHaveBeenCalledTimes(48);
  });
});
