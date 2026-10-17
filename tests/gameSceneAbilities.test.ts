import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import PhaserMock, { MockInputPlugin } from './__mocks__/phaser';
import abilitiesJson from '../src/data/abilities.json';
import { GameScene } from '../src/scenes/GameScene';
import { createAbilityState, type AbilityDefinition } from '../src/gameplay/abilities';
import { createEventBus } from '../src/engine/eventBus';
import { createGameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { resolveArenaLayout } from '../src/gameplay/arenaLayout';
import { resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { loadGameData } from '../src/systems/validation';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { checkAbility } from '../src/systems/validation/abilities';

const abilities = new Map((abilitiesJson as AbilityDefinition[]).map((ability) => [ability.id, ability]));

// Keep GameScene composition real while replacing unrelated heavyweight
// collaborators. AbilityPresentationSystem is intentionally not mocked: the
// terminal regression below needs the actual graphics/banner state.
const composition = vi.hoisted(() => {
  const state = { owned: [] as any[] };
  const owner = (name: string) => class {
    options: any;
    x = 100; y = 100; health = 100; maxHealth = 100; bodyRadius = 12;
    sprite = {}; activeProjectileCount = 0; allocatedProjectileCount = 0;
    obstacleGroup = { children: { size: 0 } }; active = true; state = 'pursuing';
    update = vi.fn(); destroy = vi.fn(); render = vi.fn(); refreshInputPresentation = vi.fn();
    setAbilityUiState = vi.fn(); setAbilityPresentation = vi.fn(); setExtractionState = vi.fn(); updateWorldReadability = vi.fn();
    writeCompletePresentationBounds = vi.fn((bounds: any) => Object.assign(bounds, { x: 88, y: 88, width: 24, height: 24 }));
    writePresentationBounds = this.writeCompletePresentationBounds;
    applyPresentationBounds = vi.fn(); focusedCommand = vi.fn(() => 'start'); restoreFocus = vi.fn(); invalidateGestures = vi.fn();
    spawnEncounterEnemy = vi.fn(() => true);
    heal = vi.fn(() => 0); grantInvulnerability = vi.fn();
    constructor(...args: any[]) { this.options = args[0]; state.owned.push(this); }
  };
  return { state, owner };
});
vi.mock('../src/entities/Player', () => ({ Player: composition.owner('player') }));
vi.mock('../src/systems/debug', async importOriginal => ({ ...await importOriginal<any>(), DebugOverlay: composition.owner('debug'), DebugCheatSystem: composition.owner('debug-cheats') }));
vi.mock('../src/ui/hud', async importOriginal => ({ ...await importOriginal<any>(), PhaserHudView: composition.owner('hud-view') }));
vi.mock('../src/ui/controls', () => ({ ControlsView: composition.owner('controls') }));
vi.mock('../src/ui/pause', async importOriginal => ({ ...await importOriginal<any>(), PhaserPauseView: composition.owner('pause-view') }));
vi.mock('../src/ui/fullscreen', () => ({ FullscreenController: composition.owner('fullscreen') }));
vi.mock('../src/systems/arenaScenery', () => ({ buildArenaScenery: (...args: any[]) => new (composition.owner('scenery'))(...args) }));
vi.mock('../src/systems/DropSystem', () => ({ DropSystem: composition.owner('drops') }));
vi.mock('../src/systems/WeaponRewardSystem', () => ({ WeaponRewardSystem: composition.owner('weapon-rewards') }));
vi.mock('../src/systems/UpgradeSystem', () => ({ UpgradeSystem: composition.owner('upgrades') }));
vi.mock('../src/ui/UpgradeChooser', () => ({ UpgradeChooser: composition.owner('chooser') }));
vi.mock('../src/systems/playtestSummary', () => ({ PlaytestSummarySystem: composition.owner('playtest-summary') }));
vi.mock('../src/entities/heldWeaponView', () => ({ HeldWeaponView: composition.owner('held-weapon') }));
vi.mock('../src/systems/WeaponSystem', () => ({ WeaponSystem: composition.owner('weapons') }));
vi.mock('../src/systems/feedback', () => ({ FeedbackSystem: composition.owner('feedback'), PhaserFeedbackRenderer: composition.owner('feedback-renderer') }));
vi.mock('../src/systems/defeatPresentation', () => ({ DefeatPresentationSystem: composition.owner('defeats') }));
vi.mock('../src/systems/SpawnSystem', () => ({ SpawnSystem: composition.owner('spawns') }));
vi.mock('../src/systems/PassiveCoordinator', () => ({ PassiveCoordinator: composition.owner('passives') }));
vi.mock('../src/systems/HazardSystem', () => ({ HazardSystem: composition.owner('hazards') }));
vi.mock('../src/ui/runSummary', async importOriginal => ({ ...await importOriginal<any>(), PhaserRunSummaryView: composition.owner('summary') }));
vi.mock('../src/ui/runStartIntroView', () => ({ RunStartIntroView: composition.owner('intro-view') }));

// Mock getGameContext to return a minimal context with a bus
const mockBus = { emit: vi.fn(), on: vi.fn() };
vi.mock('../src/engine/context', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getGameContext: () => ({ bus: mockBus }),
    GAME_CONTEXT_REGISTRY_KEY: 'meowcenary.gameContext',
  };
});

function presentationSurface() {
  const graphics = {
    setDepth: vi.fn(() => graphics), clear: vi.fn(), lineStyle: vi.fn(), fillStyle: vi.fn(),
    fillCircle: vi.fn(), fillTriangle: vi.fn(), strokeCircle: vi.fn(), lineBetween: vi.fn(),
    strokeTriangle: vi.fn(), destroy: vi.fn(),
  };
  const banner = {
    setDepth: vi.fn(() => banner), setScrollFactor: vi.fn(() => banner), setOrigin: vi.fn(() => banner),
    setVisible: vi.fn(() => banner), setText: vi.fn(() => banner), setPosition: vi.fn(() => banner),
    setFontSize: vi.fn(() => banner), setWordWrapWidth: vi.fn(() => banner), destroy: vi.fn(),
  };
  return { graphics, banner, add: { graphics: vi.fn(() => graphics), text: vi.fn(() => banner) } };
}

function preparedScene() {
  const data = structuredClone(loadGameData());
  const bus = createEventBus();
  const context = createGameContext({ data, bus, menuRng: createRng(53),
    arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'ability-terminal-regression') });
  const request = { kind: 'legacy-arena' as const, characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 73 };
  const arena = context.arenas.arenaById(request.arenaId)!;
  const introModel = resolveRunStartIntroModel({ data, request, plan: undefined });
  const layout = resolveArenaLayout(arena, request.seed, data.contentVersion);
  const scene = new GameScene() as any;
  const presentation = presentationSurface();
  (PhaserMock as any).Geom = { Rectangle: class { x = 0; y = 0; width = 0; height = 0; } };
  scene.events = new MockInputPlugin();
  scene.input = new MockInputPlugin({ keyboard: true, gamepad: true });
  scene.game = { events: new EventEmitter(), renderer: new EventEmitter() };
  scene.scale = Object.assign(new EventEmitter(), { width: 390, height: 844 });
  scene.add = presentation.add;
  scene.physics = {
    add: { group: () => ({ children: { size: 0 } }), collider: vi.fn() },
    world: { pause: vi.fn(), resume: vi.fn(), setBounds: vi.fn() },
  };
  scene.textures = { exists: () => true, get: () => ({ has: () => true }) };
  scene.cameras = { main: { zoom: 1.25, setZoom: vi.fn(), setBounds: vi.fn(), startFollow: vi.fn(), stopFollow: vi.fn(), centerOn: vi.fn() } };
  scene.registry = { get: () => undefined };
  scene.scene = { start: vi.fn() };
  scene.getContext = () => context;
  const payload = { runRequest: request, introModel, arenaLayout: layout, isTraining: true };
  return { scene, context, bus, payload, presentation };
}

function activate(id: string) {
  const scene = new GameScene() as any;
  const stats = { add: vi.fn(), remove: vi.fn() };
  const player = { x: 0, y: 0, heal: vi.fn(() => 0), grantInvulnerability: vi.fn() };
  scene.abilityDefinition = abilities.get(id);
  scene.runState = { status: 'active', stats };
  scene.player = player;
  scene.enemies = [];
  scene.activateCharacterAbility();
  return { scene, player, stats };
}

describe('GameScene character ability runtime bridge', () => {
  it('rejects a stat burst whose cleanup source is not its ability identity', () => {
    expect(checkAbility({ id: 'ability:fixture', name: 'Fixture', description: 'Fixture', cooldownMs: 1, durationMs: 1,
      effect: { kind: 'stat-burst', modifiers: [{ stat: 'damage', op: 'mult', value: 2, sourceId: 'ability:other' }] } }, 0))
      .toContain('effect.modifiers[0].sourceId: must equal ability ID');
  });

  it('executes heal and invulnerability through the live player owner exactly once per cooldown', () => {
    const heal = activate('ability:giga-chomp');
    heal.scene.controlsView = { setAbilityUiState: vi.fn() };
    heal.player.heal.mockClear();
    heal.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledWith(40);
    expect(heal.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'cooling',cooldownRemainingMs:18_000,activeRemainingMs:0}));
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledTimes(1);

    const shield = activate('ability:shield-flicker');
    expect(shield.player.grantInvulnerability).toHaveBeenCalledWith(1200);
  });

  it('refreshes ability feedback when an active effect moves to cooling', () => {
    const adrenaline = activate('ability:adrenaline');
    adrenaline.scene.controlsView = { setAbilityUiState: vi.fn() };
    adrenaline.scene.tickAbility(2500);
    expect(adrenaline.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'cooling',cooldownRemainingMs:expect.any(Number)}));
  });

  it('refreshes cooldown feedback as the visible remaining second changes', () => {
    const shield = activate('ability:shield-flicker');
    shield.scene.controlsView = { setAbilityUiState: vi.fn() };
    shield.scene.tickAbility(1_000);
    expect(shield.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'active',cooldownRemainingMs:14_000,activeRemainingMs:200}));
    shield.scene.controlsView.setAbilityUiState.mockClear();
    shield.scene.tickAbility(100);
    expect(shield.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'active',activeRemainingMs:100,cooldownRemainingMs:13900}));
  });

  it('does not advance ability durations or cooldowns behind paused, clear, or terminal UI', () => {
    const adrenaline = activate('ability:adrenaline');
    const initial = adrenaline.scene.abilityState;
    adrenaline.scene.runState.status = 'paused';
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);

    adrenaline.scene.runState.status = 'active';
    adrenaline.scene.stageRuntime = { pendingClear: {} };
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);

    adrenaline.scene.stageRuntime = undefined;
    adrenaline.scene.runState.status = 'won';
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);
  });

  it('executes temporary stat abilities through RunState and removes their exact sources at expiry', () => {
    const adrenaline = activate('ability:adrenaline');
    expect(adrenaline.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:adrenaline', stat: 'moveSpeed' }));
    adrenaline.scene.tickAbility(2500);
    expect(adrenaline.stats.remove).toHaveBeenCalledWith('ability:adrenaline');

    const mark = activate('ability:precision-mark');
    expect(mark.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:precision-mark', stat: 'damage' }));
    expect(mark.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:precision-mark', stat: 'pierce' }));

    const overclock = activate('ability:overclock');
    expect(overclock.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:overclock', stat: 'attackSpeed' }));
    expect(overclock.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:overclock', stat: 'moveSpeed' }));
  });

  it('executes nearby knockback and elemental damage against live enemy instances', () => {
    const knockback = activate('ability:scrap-burst');
    const pushed = { active:true,state:'pursuing', x: 30, y: 40, body: { setVelocity: vi.fn() }, takeDamageWithReceipt: vi.fn(()=>({applied:true,killed:false})) };
    knockback.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    knockback.scene.enemies = [pushed];
    knockback.scene.activateCharacterAbility();
    expect(pushed.body.setVelocity).toHaveBeenCalledWith(156, 208);

    const fire = activate('ability:heat-vent');
    const burned = { active:true,state:'pursuing', x: 10, y: 0, body: { setVelocity: vi.fn() }, takeDamageWithReceipt: vi.fn(()=>({applied:true,killed:false})) };
    fire.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    fire.scene.enemies = [burned];
    fire.scene.activateCharacterAbility();
    // applyEnemyDamage calls enemy.takeDamage internally
    expect(burned.takeDamageWithReceipt).toHaveBeenCalledWith(90, undefined);
  });

  it('rejects new activations at completed-objective and pending-clear boundaries', () => {
    const t=activate('ability:giga-chomp');t.player.heal.mockClear();
    for(const runtime of [{state:{status:'objective-complete'}},{pendingClear:{}}]) {
      t.scene.stageRuntime=runtime;t.scene.abilityState={phase:'ready',activeRemainingMs:0,cooldownRemainingMs:0};
      t.scene.activateCharacterAbility();
    }
    expect(t.player.heal).not.toHaveBeenCalled();
  });

  it('executes Scavenge Pulse through the drop-system collection boundary', () => {
    mockBus.emit.mockClear();
    const scene = new GameScene() as any;
    const collectNearbyConsumables = vi.fn(()=>{scene.runState.status='paused';scene.runState.pauseReason='levelUp';return 3;});
    scene.abilityPresentationSystem={update:vi.fn()};
    scene.abilityDefinition = abilities.get('ability:scavenge-pulse');
    scene.runState = { status: 'active', stats: { add: vi.fn(), remove: vi.fn() } };
    scene.player = { x: 0, y: 0, heal: vi.fn(() => 0), grantInvulnerability: vi.fn() };
    scene.dropSystem = { collectNearbyConsumables };
    scene.activateCharacterAbility();
    expect(collectNearbyConsumables).toHaveBeenCalledWith(160);
    expect(scene.abilityPresentationSystem.update).toHaveBeenCalledWith(0,false);
    expect(scene.runState.pauseReason).toBe('levelUp');
    expect(mockBus.emit).toHaveBeenCalledWith('ability:resolved',expect.objectContaining({resolution:{kind:'loot-pulse',radius:160,collected:3}}));
    const activated = mockBus.emit.mock.calls.find(([event]) => event === 'ability:activated')?.[1];
    const resolved = mockBus.emit.mock.calls.find(([event]) => event === 'ability:resolved')?.[1];
    expect(activated.activationId).toBe(1);
    expect(resolved.activationId).toBe(activated.activationId);
  });

  it('ends a sustained effect with the same activation token that started and resolved it', () => {
    mockBus.emit.mockClear();
    const shield = activate('ability:shield-flicker');
    shield.scene.tickAbility(1_200);
    const activated = mockBus.emit.mock.calls.find(([event]) => event === 'ability:activated')?.[1];
    const resolved = mockBus.emit.mock.calls.find(([event]) => event === 'ability:resolved')?.[1];
    const ended = mockBus.emit.mock.calls.find(([event]) => event === 'ability:ended')?.[1];
    expect(activated.activationId).toBe(1);
    expect(resolved.activationId).toBe(activated.activationId);
    expect(ended).toEqual({ abilityId: 'ability:shield-flicker', activationId: activated.activationId });
  });

  it.each(['run:won', 'run:lost'] as const)(
    'clears actual GameScene ability presentation when %s interrupts applyAbilityEffect',
    terminalEvent => {
      const h = preparedScene();
      h.scene.create(h.payload);
      expect(h.scene.recovering).toBe(false);
      h.scene.trySettleTerminal = vi.fn();
      h.scene.introStartCommitted = true;
      h.scene.runState.status = 'active';
      h.scene.abilityDefinition = abilities.get('ability:giga-chomp');
      h.scene.abilityState = createAbilityState();

      const order: string[] = [];
      h.bus.on(terminalEvent, () => order.push(terminalEvent));
      h.bus.on('ability:resolved', () => order.push('ability:resolved'));
      const endPresentation = vi.spyOn(h.scene, 'endAbilityPresentationForTerminal');
      const textCallsBeforeActivation = h.presentation.banner.setText.mock.calls.length;
      h.scene.player.heal = vi.fn(() => {
        // This is the player operation invoked inside applyAbilityEffect. The
        // terminal fact therefore arrives before GameScene emits resolved.
        order.push('applyAbilityEffect');
        h.scene.runState.status = terminalEvent === 'run:won' ? 'won' : 'lost';
        h.bus.emit(terminalEvent, { timeMs: 1_000, level: 2, kills: 3 });
        order.push('after-terminal');
        return 0;
      });

      h.scene.activateCharacterAbility();

      expect(order).toEqual(['applyAbilityEffect', terminalEvent, 'after-terminal', 'ability:resolved']);
      expect(endPresentation).toHaveBeenCalledOnce();
      expect(h.scene.activeAbilityActivationId).toBeUndefined();
      expect(h.presentation.banner.setText).toHaveBeenCalledTimes(textCallsBeforeActivation + 1);
      expect(h.presentation.banner.setVisible).toHaveBeenLastCalledWith(false);

      h.presentation.graphics.lineBetween.mockClear();
      h.presentation.graphics.strokeCircle.mockClear();
      const textCallsAfterTerminal = h.presentation.banner.setText.mock.calls.length;
      // A later receipt and the zero-delta refresh are the exact follow-up
      // path that used to be able to resurrect a terminal ability banner/FX.
      h.bus.emit('ability:resolved', {
        abilityId: 'ability:giga-chomp', activationId: 1, name: 'Late Chomp', origin: { x: 0, y: 0 },
        resolution: { kind: 'heal', requested: 40, applied: 0 },
      });
      h.scene.abilityPresentationSystem.update(0, false);
      expect(h.presentation.graphics.lineBetween).not.toHaveBeenCalled();
      expect(h.presentation.graphics.strokeCircle).not.toHaveBeenCalled();
      expect(h.presentation.banner.setText).toHaveBeenCalledTimes(textCallsAfterTerminal);
      expect(h.presentation.banner.setVisible).toHaveBeenLastCalledWith(false);
      h.scene.events.emit('shutdown');
    },
  );

  it('clears a composed sustained shield presentation when terminal UI takes ownership', () => {
    const h = preparedScene();
    h.scene.create(h.payload);
    h.scene.trySettleTerminal = vi.fn();
    h.scene.introStartCommitted = true;
    h.scene.runState.status = 'active';
    h.scene.abilityDefinition = abilities.get('ability:shield-flicker');
    h.scene.abilityState = createAbilityState();

    h.scene.activateCharacterAbility();
    expect(h.scene.activeAbilityActivationId).toBe(1);
    expect(h.presentation.graphics.lineBetween).toHaveBeenCalled();

    h.presentation.graphics.lineBetween.mockClear();
    h.presentation.graphics.strokeCircle.mockClear();
    h.bus.emit('run:won', { timeMs: 1_200, level: 2, kills: 3 });
    expect(h.scene.activeAbilityActivationId).toBeUndefined();

    h.bus.emit('ability:resolved', {
      abilityId: 'ability:shield-flicker', activationId: 1, name: 'Late Shield', origin: { x: 0, y: 0 },
      resolution: { kind: 'invulnerable', durationMs: 1_200 },
    });
    h.bus.emit('ability:ended', { abilityId: 'ability:shield-flicker', activationId: 1 });
    h.scene.abilityPresentationSystem.update(0, false);
    expect(h.presentation.graphics.lineBetween).not.toHaveBeenCalled();
    expect(h.presentation.graphics.strokeCircle).not.toHaveBeenCalled();
    expect(h.presentation.banner.setVisible).toHaveBeenLastCalledWith(false);
    h.scene.events.emit('shutdown');
  });

  it('ends and clears an active presentation when terminal UI takes ownership', () => {
    mockBus.emit.mockClear();
    const scene = new GameScene() as any;
    scene.abilityDefinition = abilities.get('ability:shield-flicker');
    scene.activeAbilityActivationId = 7;
    scene.abilityPresentationSystem = { clear: vi.fn() };
    scene.endAbilityPresentationForTerminal();
    expect(mockBus.emit).toHaveBeenCalledWith('ability:ended', { abilityId: 'ability:shield-flicker', activationId: 7 });
    expect(scene.abilityPresentationSystem.clear).toHaveBeenCalledOnce();
    expect(scene.activeAbilityActivationId).toBeUndefined();
  });
});
