import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhaserMock, { MockInputPlugin } from './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createRunState, tickRun } from '../src/gameplay/runState';
import { createEventBus } from '../src/engine/eventBus';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';
import { loadGameData } from '../src/systems/validation';
import { resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { RunStartIntroController } from '../src/ui/runStartIntroController';
import { createGameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';

// Composition tests use real request/model/controller/input/run/stage/save
// owners. Rendering/combat collaborators are lifecycle spies, separately
// tested in their own suites; they do not simulate real browser geometry.
const composition = vi.hoisted(() => {
  const state = { failAt: '', owned: [] as any[] };
  const owner = (name: string) => class {
    name = name; x = 100; y = 100; health = 100; maxHealth = 100; bodyRadius = 12;
    sprite = {}; activeProjectileCount = 0; allocatedProjectileCount = 0;
    obstacleGroup = { children: { size: 0 } }; options: any;
    update = vi.fn(); destroy = vi.fn(); render = vi.fn(); refreshInputPresentation = vi.fn();
    setAbilityUiState = vi.fn(); setAbilityPresentation = vi.fn(); setExtractionState = vi.fn(); updateWorldReadability = vi.fn();
    writeCompletePresentationBounds = vi.fn((bounds: any) => Object.assign(bounds, { x: 88, y: 88, width: 24, height: 24 }));
    writePresentationBounds = this.writeCompletePresentationBounds;
    applyPresentationBounds = vi.fn(); focusedCommand = vi.fn(() => 'start'); restoreFocus = vi.fn(); invalidateGestures = vi.fn();
    spawnEncounterEnemy = vi.fn(() => true);
    constructor(...args: any[]) {
      if (state.failAt === name) throw new Error(`injected ${name} construction failure`);
      this.options = args[0]; state.owned.push(this);
    }
  };
  return { state, owner };
});
vi.mock('../src/entities/Player', () => ({ Player: composition.owner('player') }));
vi.mock('../src/systems/debug', async original => ({ ...await original<any>(), DebugOverlay: composition.owner('debug') }));
vi.mock('../src/systems/abilityPresentation', () => ({ AbilityPresentationSystem: composition.owner('ability-presentation') }));
vi.mock('../src/ui/hud', async original => ({ ...await original<any>(), PhaserHudView: composition.owner('hud-view') }));
vi.mock('../src/ui/controls', () => ({ ControlsView: composition.owner('controls') }));
vi.mock('../src/ui/pause', async original => ({ ...await original<any>(), PhaserPauseView: composition.owner('pause-view') }));
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
vi.mock('../src/ui/runSummary', async original => ({ ...await original<any>(), PhaserRunSummaryView: composition.owner('summary') }));
vi.mock('../src/ui/runStartIntroView', () => ({ RunStartIntroView: class extends composition.owner('intro-view') {
  state: any;
  render = vi.fn((state: any) => { this.state = state; });
  confirmFocused = vi.fn(() => {
    if (this.options.canInteract()) this.options.onCommand(this.state.phase === 'brief' && this.options.model.boss ? 'continue' : 'start', this.state.revision);
  });
} }));
beforeEach(() => { composition.state.failAt = ''; composition.state.owned.length = 0; });

function harness(stageId = 'stage:junkyard-06') {
  const data = loadGameData(); const bus = createEventBus();
  const request = { kind: 'stage' as const, characterId: 'scrap-tabby', stageId, seed: 71 };
  const plan = resolveRunPlan(request, data as any);
  const model = resolveRunStartIntroModel({ data, request, plan });
  const scene = new GameScene() as any;
  scene.getContext = () => ({ data, bus });
  scene.runState = createRunState({ seed: 71, characterId: 'scrap-tabby', arenaId: plan.arenaId });
  scene.launchRequest = request; scene.stageRuntime = createStageRuntime(plan);
  scene.introModel = model; scene.introController = new RunStartIntroController(model);
  scene.introView = { render: vi.fn(), destroy: vi.fn(), refreshInputPresentation: vi.fn(), invalidateGestures: vi.fn(),
    confirmFocused: vi.fn(() => scene.handleIntroCommand(model.boss ? 'continue' : 'start', scene.introController.snapshot().revision)), moveFocus: vi.fn() };
  let quarantined = false;
  scene.inputController = { isQuarantined: () => quarantined, quarantineUntilNeutral: vi.fn(() => { quarantined = true; }), update: vi.fn() };
  scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
  scene.scene = { start: vi.fn() };
  scene.game = { renderer: new EventEmitter(), events: new EventEmitter() };
  scene.player = { update: vi.fn() };
  return { scene, data, bus, neutral: () => { quarantined = false; } };
}
describe('GameScene introduction ownership', () => {
  it('holds all simulation owners, objective time, ability and persistence behind intro', () => {
    const { scene } = harness();
    const tick = vi.fn(); scene.systems = [{ update: tick }];
    scene.tickAbility = vi.fn(); scene.updateStageObjective = vi.fn();
    scene.trySettleTerminal = vi.fn(); scene.retryPendingAchievementFacts = vi.fn();
    for (let frame = 0; frame < 3; frame++) scene.update(frame * 5000, 5000);
    expect(scene.runState.status).toBe('intro'); expect(scene.runState.timeMs).toBe(0);
    expect(scene.stageRuntime.state.status).toBe('intro');
    for (const spy of [tick, scene.tickAbility, scene.updateStageObjective, scene.trySettleTerminal, scene.retryPendingAchievementFacts]) expect(spy).not.toHaveBeenCalled();
  });
  it('consumes a boss Start exactly once and delays simulation until the following update', () => {
    const { scene, bus, neutral } = harness(); const started = vi.fn(); bus.on('run:start', started);
    const spawn = vi.fn(() => true); scene.pendingBossStart = spawn;
    scene.handleIntroCommand('continue', 0);
    expect(scene.runState.status).toBe('intro');
    scene.handleIntroCommand('start', 1); // Held input is quarantined.
    expect(scene.runState.status).toBe('intro'); neutral();
    scene.inputController.update = () => scene.handleIntroCommand('start', 1);
    scene.update(16, 16);
    expect(scene.runState.status).toBe('active'); expect(scene.runState.timeMs).toBe(0);
    expect(started).toHaveBeenCalledOnce(); expect(spawn).not.toHaveBeenCalled();
    scene.handleIntroCommand('start', 1); expect(started).toHaveBeenCalledOnce();
    expect(scene.introView).toBeUndefined();
  });
  it('drops injected facts and terminal events before explicit Start', () => {
    const { scene, bus } = harness();
    const context = { ...scene.getContext(), discoverEnemy: vi.fn(), settleRunTerminal: vi.fn() };
    scene.installAuthoritativeFactListeners(context);
    bus.emit('enemy:spawned', { enemyId: 'boss-forge', x: 0, y: 0 } as any);
    bus.emit('enemy:killed', { enemyId: 'boss-forge', x: 0, y: 0 } as any);
    bus.emit('drop:collected', { kind: 'scrap', amount: 100, x: 0, y: 0 });
    scene.trySettleTerminal(context, 'win'); scene.trySettleTerminal(context, 'loss');
    expect(context.discoverEnemy).not.toHaveBeenCalled(); expect(context.settleRunTerminal).not.toHaveBeenCalled();
    expect(scene.pendingAchievementFacts).toEqual({});
    expect(scene.stageRuntime.state.status).toBe('intro');
  });
  it('blocks all commands during renderer loss and background independently', () => {
    const { scene, neutral } = harness();
    scene.handleIntroContextLost(); neutral(); scene.handleIntroFocus(); neutral();
    scene.handleIntroCommand('return-menu', 0); expect(scene.scene.start).not.toHaveBeenCalled();
    scene.handleIntroBlur(); scene.mountIntroView = vi.fn(() => true);
    scene.handleIntroContextRestored(); neutral();
    scene.handleIntroCommand('skip-dialogue', 0); expect(scene.runState.status).toBe('intro');
    scene.handleIntroFocus(); neutral(); scene.handleIntroCommand('skip-dialogue', 0);
    expect(scene.runState.status).toBe('active');
  });
  it('cancels to Menu without settlement and revokes listeners and late commands', () => {
    const { scene } = harness(); const controller = scene.introController;
    scene.pendingBossStart = vi.fn();
    scene.game.renderer.on('restorewebgl', scene.handleIntroContextRestored);
    scene.handleIntroCommand('return-menu', 0);
    expect(scene.scene.start).not.toHaveBeenCalled(); scene.game.events.emit('poststep');
    expect(scene.scene.start).toHaveBeenCalledWith('MenuScene', { quarantineInput: true });
    expect(controller.snapshot().phase).toBe('cancelled');
    expect(scene.introController).toBeUndefined(); expect(scene.pendingBossStart).toBeUndefined();
    expect(scene.game.renderer.listenerCount('restorewebgl')).toBe(0);
    scene.handleIntroContextRestored(); expect(scene.scene.start).toHaveBeenCalledOnce();
  });
  it('sends captured launch identity back to the retry surface on presentation failure', () => {
    const { scene } = harness(); const request = scene.launchRequest;
    scene.returnFromIntro('fixture missing art');
    scene.game.events.emit('poststep');
    expect(scene.scene.start).toHaveBeenCalledWith('MenuScene', expect.objectContaining({ failedRunRequest: request, failedRunError: 'fixture missing art' }));
    expect(scene.runState.status).toBe('intro');
  });
});

describe('create preparation failure boundary', () => {
  it('queues one recovery before RunState, input or entities exist and preserves the captured request', () => {
    const scene = new GameScene() as any;
    const request = { kind: 'stage', characterId: 'scrap-tabby', stageId: 'stage:junkyard-06', seed: 731 };
    scene.getContext = () => ({ captureRunPresentationBaseline: () => ({}), stages: { runPlanCatalog: () => { throw new Error('injected plan failure'); } } });
    scene.events = new EventEmitter(); scene.game = { events: new EventEmitter() };
    scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    scene.scene = { start: vi.fn() };
    expect(() => scene.create({ runRequest: request, isTraining: true })).not.toThrow();
    expect(scene.scene.start).not.toHaveBeenCalled();
    expect(scene.runState).toBeUndefined(); expect(scene.inputController).toBeUndefined(); expect(scene.player).toBeUndefined();
    expect(() => scene.update(0, 5000)).not.toThrow();
    scene.game.events.emit('poststep'); scene.game.events.emit('poststep');
    expect(scene.scene.start).toHaveBeenCalledExactlyOnceWith('MenuScene', expect.objectContaining({ failedRunRequest: request, isTraining: true, failedRunError: 'injected plan failure' }));
  });
});

function preparedScene(options: { absent?: boolean; training?: boolean; stageId?: string } = {}) {
  const data = structuredClone(loadGameData());
  if (options.absent) delete (data.characters[0] as { abilityId?: string }).abilityId;
  const context = createGameContext({ data, bus: createEventBus(), menuRng: createRng(53),
    arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'intro-create-proof') });
  const request = options.training
    ? { kind: 'legacy-arena' as const, characterId: data.characters[0].id, arenaId: 'junkyard-lot', seed: 73 }
    : { kind: 'stage' as const, characterId: data.characters[0].id, stageId: options.stageId ?? 'stage:junkyard-06', seed: 73 };
  const plan = request.kind === 'stage' ? resolveRunPlan(request, context.stages.runPlanCatalog()) : undefined;
  const arenaId = plan?.arenaId ?? 'junkyard-lot';
  const arena = context.arenas.arenaById(arenaId)!;
  const model = resolveRunStartIntroModel({ data, request, plan });
  const scene = new GameScene() as any;
  (PhaserMock as any).Geom = { Rectangle: class { x = 0; y = 0; width = 0; height = 0; } };
  scene.events = new MockInputPlugin(); scene.input = new MockInputPlugin({ keyboard: true });
  scene.game = { events: new EventEmitter(), renderer: new EventEmitter() };
  scene.scale = Object.assign(new EventEmitter(), { width: 360, height: 640 });
  scene.physics = { add: { group: () => ({ destroy: vi.fn() }) }, world: { pause: vi.fn(), resume: vi.fn(), setBounds: vi.fn() } };
  scene.textures = { exists: () => true, get: () => ({ has: () => true }) };
  scene.cameras = { main: { zoom: 1.25, setZoom: vi.fn(), setBounds: vi.fn(), startFollow: vi.fn(), stopFollow: vi.fn(), centerOn: vi.fn() } };
  scene.registry = { get: () => undefined };
  scene.scene = { start: vi.fn() }; scene.getContext = () => context;
  const payload = { runRequest: request, stagePlan: plan, introModel: model, isTraining: options.training === true };
  return { scene, context, request, plan, arena, model, payload };
}

describe('actual GameScene create transaction', () => {
  it.each(['model', 'plan', 'missing-arena', 'wrong-content-version', 'missing-texture', 'missing-frame', 'debug', 'player', 'summary', 'intro-view'])('recovers an injected %s failure without leaking Start authority', failure => {
    const h = preparedScene(); const payload: any = { ...h.payload };
    if (failure === 'model') payload.introModel = { ...h.model, identity: { ...h.model.identity, seed: 999 } };
    else if (failure === 'plan') payload.stagePlan = { ...h.plan, seed: 999 };
    else if (failure === 'missing-arena') vi.spyOn(h.context.arenas, 'arenaById').mockReturnValue(undefined);
    else if (failure === 'wrong-content-version') payload.introModel = { ...h.model, identity: { ...h.model.identity, contentVersion: 'stale-content' } };
    else if (failure === 'missing-texture') h.scene.textures.exists = () => false;
    else if (failure === 'missing-frame') h.scene.textures.get = () => ({ has: () => false });
    else composition.state.failAt = failure;
    const saved = JSON.stringify(h.context.saveData); const start = vi.fn(); h.context.bus.on('run:start', start);
    expect(() => h.scene.create(payload)).not.toThrow();
    expect(h.scene.recovering).toBe(true);
    expect(h.scene.scene.start).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) h.scene.update(i, 50000);
    h.context.bus.emit('enemy:spawned', { enemyId: 'boss-forge', x: 0, y: 0 } as any);
    h.context.bus.emit('run:won', {} as any); h.context.bus.emit('run:lost', {} as any);
    expect(start).not.toHaveBeenCalled(); expect(JSON.stringify(h.context.saveData)).toBe(saved);
    h.scene.game.events.emit('poststep'); h.scene.game.events.emit('poststep');
    expect(h.scene.scene.start).toHaveBeenCalledOnce();
    const result = h.scene.scene.start.mock.calls[0][1]; expect(result.failedRunRequest).toBe(h.request);
    expect(result).not.toHaveProperty('failedArenaLayout');
    expect(result.isTraining).toBe(false);
    h.scene.events.emit('shutdown'); h.scene.events.emit('destroy');
    expect(h.scene.inputController).toBeUndefined(); expect(h.scene.runState).toBeUndefined();
    expect(h.scene.game.events.listenerCount('poststep')).toBe(0);
    for (const owned of composition.state.owned.filter(row => !['held-weapon', 'feedback-renderer'].includes(row.name))) expect(owned.destroy, owned.name).toHaveBeenCalledOnce();
  });
  it('revokes queued recovery on shutdown and on a newer create of the same Scene', () => {
    const h = preparedScene(); composition.state.failAt = 'debug'; h.scene.create(h.payload);
    h.scene.events.emit('shutdown'); h.scene.game.events.emit('poststep');
    expect(h.scene.scene.start).not.toHaveBeenCalled();
    h.scene.create(h.payload); composition.state.failAt = ''; h.scene.create(h.payload);
    expect(h.scene.recovering).toBe(false); expect(h.scene.runState.status).toBe('intro');
    h.scene.game.events.emit('poststep'); expect(h.scene.scene.start).not.toHaveBeenCalled();
    expect(h.scene.input.listenerCount('pointerdown')).toBe(1);
    h.scene.events.emit('shutdown'); h.scene.events.emit('destroy');
  });
  it.each([{ stageId: 'stage:junkyard-01' }, { stageId: 'stage:junkyard-06' }, { training: true }])('creates an ability-absent explicit intro and begins once: %j', options => {
    const h = preparedScene({ ...options, absent: true }); const saved = JSON.stringify(h.context.saveData);
    const start = vi.fn(); h.context.bus.on('run:start', start); h.scene.create(h.payload);
    expect(h.scene.recovering, h.scene.scene.start.mock.calls[0]?.[1]).toBe(false);
    expect(h.scene.runState.status).toBe('intro'); expect(h.scene.introModel.ability).toBeUndefined();
    expect(h.scene.abilityDefinition).toBeUndefined();
    const before = JSON.stringify({ run: h.scene.runState, stage: h.scene.stageRuntime?.state, ability: h.scene.abilityState });
    for (let i = 0; i < 100; i++) h.scene.update(i, 50000);
    expect(JSON.stringify({ run: h.scene.runState, stage: h.scene.stageRuntime?.state, ability: h.scene.abilityState })).toBe(before);
    expect(JSON.stringify(h.context.saveData)).toBe(saved); expect(start).not.toHaveBeenCalled();
    const spawn = composition.state.owned.find(row => row.name === 'spawns')!.spawnEncounterEnemy;
    expect(spawn).not.toHaveBeenCalled();
    if (h.model.boss) { h.scene.handleIntroCommand('continue', 0); h.scene.update(0, 16); }
    h.scene.input.keyboard.keydown('Enter'); h.scene.update(0, 16);
    expect(h.scene.runState.status).toBe('active'); expect(h.scene.runState.timeMs).toBe(0); expect(start).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
    h.scene.input.keyboard.keyup('Enter'); h.scene.update(0, 16); h.scene.update(16, 16);
    expect(spawn).toHaveBeenCalledTimes(h.plan?.encounter.bossId ? 1 : 0);
    if (h.plan?.encounter.bossId) expect(spawn).toHaveBeenCalledWith(h.plan.encounter.bossId, h.arena.size.width / 2, Math.max(80, h.arena.size.height * 0.2));
    expect(JSON.stringify(h.context.saveData)).toBe(saved);
    h.scene.events.emit('shutdown'); h.scene.events.emit('destroy');
  });
});


describe('intro presentation interruption recovery', () => {
  it('queues recovery when the boss-card render throws after Continue', () => {
    const { scene } = harness(); scene.introView.render.mockImplementation(() => { throw new Error('boss draw'); });
    expect(() => scene.handleIntroCommand('continue', 0)).not.toThrow();
    expect(scene.recovering).toBe(true); expect(scene.scene.start).not.toHaveBeenCalled();
    scene.game.events.emit('poststep'); expect(scene.scene.start).toHaveBeenCalledOnce();
  });
  it('keeps an already-lost renderer frozen, rejects bad restoration frames and never resurrects after shutdown', () => {
    const h = preparedScene(); h.scene.game.renderer.contextLost = true; h.scene.create(h.payload);
    expect(h.scene.introView).toBeUndefined();
    h.scene.inputController.update(16); h.scene.handleIntroCommand('skip-dialogue', 0);
    expect(h.scene.runState.status).toBe('intro');
    h.scene.textures.get = () => ({ has: () => false }); h.scene.game.renderer.emit('restorewebgl');
    expect(h.scene.recovering).toBe(true); h.scene.events.emit('shutdown');
    h.scene.game.renderer.emit('restorewebgl'); h.scene.game.events.emit('poststep');
    expect(h.scene.introView).toBeUndefined(); expect(h.scene.scene.start).not.toHaveBeenCalled();
  });
});


// Main #238's four logical-boundary assertions, migrated to the sole controller.
describe('accepted main intro boundary compatibility', () => {
  it('Confirm quarantines before one Start publication and destroys the single view', () => {
    const { scene, bus } = harness('stage:junkyard-01'); const view = scene.introView;
    const start = vi.fn(() => expect(scene.inputController.quarantineUntilNeutral).toHaveBeenCalled()); bus.on('run:start', start);
    scene.routeAction('confirm'); scene.routeAction('confirm');
    expect(scene.runState.status).toBe('active'); expect(start).toHaveBeenCalledOnce(); expect(view.destroy).toHaveBeenCalledOnce();
  });
  it('discards combat, manual pause and inventory while intro keeps the run clock frozen', () => {
    const { scene } = harness('stage:junkyard-01'); const ability = vi.spyOn(scene, 'activateCharacterAbility');
    scene.pauseController = { pause: vi.fn() };
    for (const action of ['ability', 'pause', 'inventory']) scene.routeAction(action);
    tickRun(scene.runState, 9000); expect(scene.runState.timeMs).toBe(0); expect(scene.runState.status).toBe('intro');
    expect(ability).not.toHaveBeenCalled(); expect(scene.pauseController.pause).not.toHaveBeenCalled();
  });
  it('the real frame suspends player, combat, ability and physics but ticks the existing audio presentation clock', () => {
    const { scene } = harness('stage:junkyard-01'); const combat = { update: vi.fn() }; scene.systems = [combat];
    const ability = vi.spyOn(scene, 'tickAbility'); scene.audioManager = { update: vi.fn() }; scene.physicsPausedByRun = true;
    scene.update(0, 5000);
    expect(scene.runState.timeMs).toBe(0); expect(scene.player.update).not.toHaveBeenCalled(); expect(combat.update).not.toHaveBeenCalled();
    expect(ability).not.toHaveBeenCalled(); expect(scene.physics.world.resume).not.toHaveBeenCalled(); expect(scene.audioManager.update).toHaveBeenCalledWith(5000);
  });
  it('logical Back queues Menu without terminal/start facts and revokes stale Start', () => {
    const { scene, bus } = harness('stage:junkyard-01'); const emit = vi.spyOn(bus, 'emit'); const view = scene.introView;
    scene.routeAction('back'); expect(scene.scene.start).not.toHaveBeenCalled(); scene.game.events.emit('poststep');
    expect(scene.scene.start).toHaveBeenCalledWith('MenuScene', { quarantineInput: true }); expect(view.destroy).toHaveBeenCalledOnce();
    for (const event of ['run:start', 'run:won', 'run:lost']) expect(emit).not.toHaveBeenCalledWith(event, expect.anything());
    scene.beginRunFromIntro(); expect(scene.runState.status).toBe('intro');
  });
});

it('observes the exact test-only semantic diagnostic without becoming an intro or receipt owner', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const ts = await import('typescript');
  const source = readFileSync('src/main.ts', 'utf8');
  const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  let diagnostic: import('typescript').ArrowFunction | undefined;
  const find = (node: import('typescript').Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'runStartIntroDiagnostics' && ts.isArrowFunction(node.initializer)) diagnostic = node.initializer;
    ts.forEachChild(node, find);
  };
  find(ast); expect(diagnostic).toBeDefined();
  const js = ts.transpileModule(`let abilityObservedRun, stopAbilityObservation, abilityResolution, observedIntroIdentity, observedIntroObjective;
    let observedRunStart = { count: 0 }, observedTerminalEvents = 0;
    const read = ${diagnostic!.getText(ast)}; read;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const data = loadGameData();
  const request = { kind: 'stage' as const, stageId: 'stage:junkyard-05', characterId: 'scrap-tabby', seed: 99 };
  const plan = resolveRunPlan(request, { stages: data.stages!, encounterProfiles: data.encounterProfiles!, difficultyProfiles: data.difficultyProfiles!, rewardProfiles: data.rewardProfiles! });
  const model = resolveRunStartIntroModel({ data, request, plan });
  const controller = new RunStartIntroController(model); const bus = createEventBus();
  class Text { text = 'Nested objective'; x = 0; y = 0; width = 70; height = 20; displayOriginX = 0; displayOriginY = 0; parentContainer: any; }
  const content = { list: [] as any[], getWorldTransformMatrix: () => ({}) }; const text = new Text(); text.parentContainer = content; content.list.push(text);
  const target = { width: 120, height: 44, displayOriginX: 0, displayOriginY: 0, parentContainer: content };
  let active = true, physicalNeutral = false, quarantined = true;
  const run = createRunState({ ...request, arenaId: plan.arenaId });
  const scene: any = { runState: run, getContext: () => ({ bus }), introModel: model, introController: controller,
    introView: { root: { list: [content] }, content, contentBounds: { x: 2, y: 3, width: 150, height: 220 },
      scrollOffset: 7, maxScroll: 80, focusedCommand: () => 'continue', buttons: [{ command: 'continue', label: 'Continue', rect: target }] },
    inputController: { getInputMode: () => 'keyboard', isNeutral: () => physicalNeutral, isQuarantined: () => quarantined },
    canInteractWithIntro: () => active && run.status === 'intro' && !quarantined, cameras: { main: {} },
    abilityPresentationSystem: { banner: { text: 'Actual receipt' }, transient: { kind: 'loot-pulse', radius: 160 } },
  };
  const game = { scene: { getScene: () => scene, isActive: () => active },
    canvas: { getBoundingClientRect: () => ({ left: 5, top: 7, width: 200, height: 320 }) }, scale: { gameSize: { width: 400, height: 640 } } };
  const read = runInNewContext(js, { game, performance: { now: () => 123 }, Phaser: { GameObjects: { Text,
    GetCalcMatrix: () => ({ calc: { transformPoint: (x: number, y: number) => ({ x: 2 * x + 10, y: 2 * y + 20 }) } }) } } });
  expect(read()).toMatchObject({ phase: 'brief', revision: 0, inputNeutral: false, inputQuarantined: true, ready: false,
    runStart: { count: 0 }, commands: [{ command: 'continue', label: 'Continue', enabled: false, bounds: { x: 10, y: 17, width: 120, height: 44 } }],
    introText: [{ text: 'Nested objective', inScrollBody: true }], body: { x: 12, y: 20, width: 150, height: 220 }, scroll: { offset: 7, max: 80 } });
  physicalNeutral = true; quarantined = false;
  expect(read()).toMatchObject({ inputNeutral: true, inputQuarantined: false, ready: true });
  controller.command('continue', 0);
  expect(read()).toMatchObject({ phase: 'boss', revision: 1, status: 'intro', timeMs: 0, identity: model.identity, objective: model.objective, runStart: { count: 0 } });
  controller.command('start', 1); scene.introController = undefined; scene.introView = undefined; scene.introModel = undefined;
  run.status = 'active'; bus.emit('run:start', { characterId: run.characterId, arenaId: run.arenaId, seed: run.seed }); run.timeMs = 16;
  bus.emit('ability:resolved', { abilityId: 'ability:scavenge-pulse', activationId: 1, name: 'Scavenge Pulse', origin: { x: 0, y: 0 }, resolution: { kind: 'loot-pulse', radius: 160, collected: 3 } });
  expect(read()).toMatchObject({ visible: false, phase: 'consumed', revision: null, timeMs: 16, identity: model.identity,
    runStart: { count: 1, timeMs: 0, atMs: 123 }, activationId: 1, latestResolution: { kind: 'loot-pulse', collected: 3 }, abilityFx: { transient: { radius: 160 } } });
  active = false; expect(read()).toMatchObject({ status: 'menu', phase: 'consumed', runStart: { count: 1 }, terminalEvents: 0 });
  active = true; scene.runState = createRunState({ ...request, arenaId: plan.arenaId }); scene.introModel = model;
  scene.introController = new RunStartIntroController(model); read(); active = false;
  expect(read()).toMatchObject({ phase: 'cancelled', revision: null, runStart: { count: 0 }, terminalEvents: 0 });
  expect(source).toContain("if (import.meta.env.VITE_VISUAL_TEST === '1'");
});
