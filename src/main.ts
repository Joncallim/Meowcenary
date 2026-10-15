import Phaser from 'phaser';
import { RuntimeConfig } from './engine/config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import './styles.css';
import { physicsDebugEnabled } from './systems/debug';
import { installDiagnostics } from './engine/diagnostics';
import { bindVisualViewportRefresh, isGestureActive } from './platform/visualViewport';
import { installPortraitOrientationGuard, isPortraitOrientationBlocked } from './platform/orientation';
import { responsiveScaleConfig } from './platform/gameScale';
import { performanceProbe } from './platform/performanceProbe';
import { collectDisplayObjects, type DisplayNode } from './platform/performanceDisplay';
import type { EventBus, GameEventMap } from './engine/eventBus';
import { resolveAbilityEffectPresentation } from './presentation/abilityEffectPresentation';
import type { GameContext } from './engine/context';
import type { ComposedRunRequest } from './gameplay/runRequest';
import { responsiveArenaPresentationBounds } from './gameplay/responsiveArenaPresentation';
import { createWeaponInstance, type WeaponRegistry } from './gameplay/weapons';
import { grantWeaponToRack, WEAPON_RACK_CAPACITY } from './gameplay/weaponRack';
import type { RunState } from './gameplay/runState';
import type { ResolvedArenaLayout } from './gameplay/arenaLayout';
import type { ArenaWorldView } from './systems/arenaScenery';
import type { HazardSystem } from './systems/HazardSystem';
import type { UpgradeSystem } from './systems/UpgradeSystem';
import type { UpgradeChooser } from './ui/UpgradeChooser';
import { DataVisualArtRegistry } from './systems/visualArt';
import type { Drop } from './entities/Drop';
import type { LootGrant } from './gameplay/loot';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#101820',
  scale: responsiveScaleConfig(),
  input: {
    activePointers: 3,
    gamepad: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: physicsDebugEnabled(globalThis.location?.search ?? '', RuntimeConfig.isDev),
    },
  },
  scene: [BootScene, MenuScene, GameScene],
};

// Phaser rasterises Text objects into canvas textures when they are created.
// Wait for the self-hosted UI face so those textures never capture a transient
// system fallback and then keep it for the rest of the session.
if (globalThis.document?.fonts) {
  const started = performanceProbe?.now();
  const fontRequests = [
    globalThis.document.fonts.load('400 16px "Nunito"'),
    globalThis.document.fonts.load('600 16px "Nunito"'),
    globalThis.document.fonts.load('700 16px "Nunito"'),
    globalThis.document.fonts.load('800 16px "Nunito"'),
  ];
  await Promise.all(performanceProbe ? fontRequests.map(async (request, index) => {
    const weightStart = performanceProbe!.now();
    await request;
    performanceProbe!.record('boot.font-weight', weightStart, { weight: [400, 600, 700, 800][index] });
  }) : fontRequests);
  if (started !== undefined) performanceProbe?.record('boot.fonts', started, { weights: 4 });
}

// Exported as a narrow ESM browser lifecycle/smoke seam. Upgrade selection now
// uses the visible chooser; gameplay ownership remains in scenes and systems.
export const game = new Phaser.Game(config);
if (performanceProbe) {
  const probe = performanceProbe;
  // Raw Phaser loop cadence includes browser/renderer work, unlike the
  // smoothed simulation delta. Reads are explicit, outside the update loop.
  let stepStarted = 0;
  let renderStarted = 0;
  let presentedMenu: { panel: string; rebuildCount: number; revision: number; atMs: number } | undefined;
  let presentedRun: { seed: number; status: string; atMs: number } | undefined;
  const startStep = (): void => { stepStarted = probe.now(); };
  const startRender = (): void => { renderStarted = probe.now(); };
  const finishRender = (): void => {
    const ended = probe.now();
    // POST_STEP is emitted before rendering in Phaser3.90. Whole step CPU
    // therefore ends at POST_RENDER; render span alone excludes preRender.
    probe.recordFrameOwner('frame.cpu', ended - stepStarted);
    probe.recordFrameOwner('frame.render', ended - renderStarted);
    if (game.scene.isActive('MenuScene')) {
      const menu = game.scene.getScene('MenuScene') as unknown as {
        committedPanel?: string; committedDisplay?: boolean; renderRebuildCount: number; renderRevisionCount: number;
        panelArtLoading?: boolean; panelArtInFlight?: Promise<void>;
        mercenaryArtLoading?: boolean; achievementArtLoading?: boolean;
        equipmentArtLoading?: boolean; gunsmithArtLoading?: boolean; menuTextureLoadPending?: number;
        pendingPanelArtIds?: { size: number }; pendingPanelArtRepaints?: { size: number }; pendingGunsmithArtIds?: { size: number };
      };
      if (menu.committedPanel && menu.committedDisplay && !menu.panelArtLoading && !menu.panelArtInFlight
        && !menu.mercenaryArtLoading && !menu.achievementArtLoading && !menu.equipmentArtLoading && !menu.gunsmithArtLoading
        && !menu.menuTextureLoadPending && !menu.pendingPanelArtIds?.size && !menu.pendingPanelArtRepaints?.size && !menu.pendingGunsmithArtIds?.size
        && presentedMenu?.revision !== menu.renderRevisionCount) {
        presentedMenu = Object.freeze({ panel: menu.committedPanel, rebuildCount: menu.renderRebuildCount, revision: menu.renderRevisionCount, atMs: ended });
      }
    }
    if (game.scene.isActive('GameScene')) {
      const run = (game.scene.getScene('GameScene') as unknown as { runState?: { seed: number; status: string } }).runState;
      if (run && (presentedRun?.seed !== run.seed || presentedRun.status !== run.status)) presentedRun = Object.freeze({ seed: run.seed, status: run.status, atMs: ended });
    }
  };
  const recordFrame = (): void => {
    probe.recordFrame(game.loop.rawDelta);
  };
  game.events.on(Phaser.Core.Events.PRE_STEP, startStep);
  game.events.on(Phaser.Core.Events.PRE_RENDER, startRender);
  game.events.on(Phaser.Core.Events.POST_RENDER, finishRender);
  game.events.on(Phaser.Core.Events.POST_STEP, recordFrame);
  const handle = Object.freeze({
    resetMeasurement: () => { probe.resetMeasurement(); presentedMenu = undefined; presentedRun = undefined; },
    snapshot: () => {
      const menu = game.scene.getScenes(true).find(scene => scene.scene.key === 'MenuScene') as unknown as {
        committedPanel?: string; committedDisplay?: boolean; renderRebuildCount?: number; renderRevisionCount?: number;
        panelArtLoading?: boolean; panelArtInFlight?: Promise<void>;
        mercenaryArtLoading?: boolean; achievementArtLoading?: boolean;
        equipmentArtLoading?: boolean; gunsmithArtLoading?: boolean;
        menuTextureLoadPending?: number;
        pendingPanelArtIds?: { size: number }; pendingPanelArtRepaints?: { size: number };
        pendingGunsmithArtIds?: { size: number };
      } | undefined;
      const active = game.scene.getScenes(true);
      const gameplay = active.find(scene => scene.scene.key === 'GameScene') as unknown as { performanceDiagnostics?(): unknown } | undefined;
      return {
        ...probe.snapshot(),
        activeScenes: active.map(scene => scene.scene.key),
        presentedMenu, presentedRun,
        menu: menu ? { panel: menu.committedPanel, committed: menu.committedDisplay === true,
          rebuildCount: menu.renderRebuildCount, revision: menu.renderRevisionCount,
          settled: menu.committedDisplay === true && !menu.panelArtLoading && !menu.panelArtInFlight
            && !menu.mercenaryArtLoading && !menu.achievementArtLoading && !menu.equipmentArtLoading && !menu.gunsmithArtLoading
            && !menu.menuTextureLoadPending && !menu.pendingPanelArtIds?.size && !menu.pendingPanelArtRepaints?.size && !menu.pendingGunsmithArtIds?.size } : undefined,
        objects: active.reduce((sum, scene) => sum + collectDisplayObjects(scene.children.list as unknown as readonly DisplayNode[]).size, 0),
        textures: game.textures.getTextureKeys().length,
        run: gameplay?.performanceDiagnostics?.(),
      };
    },
  });
  Object.defineProperty(globalThis, '__MEOWCENARY_PERFORMANCE__', { configurable: true, value: handle });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    game.events.off(Phaser.Core.Events.POST_STEP, recordFrame);
    game.events.off(Phaser.Core.Events.PRE_STEP, startStep);
    game.events.off(Phaser.Core.Events.PRE_RENDER, startRender);
    game.events.off(Phaser.Core.Events.POST_RENDER, finishRender);
    if ((globalThis as Record<string, unknown>).__MEOWCENARY_PERFORMANCE__ === handle) delete (globalThis as Record<string, unknown>).__MEOWCENARY_PERFORMANCE__;
  });
}
// Screenshot acceptance gets a dedicated build-time seam. Vite eliminates
// this entire branch from ordinary production builds; the query alone can
// never expose mutable scene internals in a deployed game.
if (import.meta.env.VITE_VISUAL_TEST === '1'
    && new URLSearchParams(globalThis.location?.search ?? '').get('visual-test') === '1') {
  let abilityObservedRun: object | undefined;
  let stopAbilityObservation: (() => void) | undefined;
  let abilityResolution: GameEventMap['ability:resolved'] | undefined;
  let observedIntroIdentity: import('./presentation/runStartIntro').RunStartIntroModel['identity'] | undefined;
  let observedIntroObjective: import('./presentation/runStartIntro').RunStartIntroModel['objective'] | undefined;
  let observedRunStart: { count: number; timeMs?: number; atMs?: number } = { count: 0 };
  let observedTerminalEvents = 0;
  game.events.once(Phaser.Core.Events.DESTROY, () => { stopAbilityObservation?.(); abilityObservedRun=undefined; abilityResolution=undefined; });
  type UpgradeFixtureScene = Phaser.Scene & {
    runState?: RunState;
    upgradeSystem?: UpgradeSystem;
    upgradeChooser?: UpgradeChooser;
    getContext(): GameContext;
    inputController?: { getInputMode(): string; core?: { isNeutral(): boolean } };
  };
  let upgradeObservedRun: RunState | undefined;
  let stopUpgradeObservation: (() => void) | undefined;
  let upgradeChosen: string[] = [];
  let upgradeFixtureLevel = 100;
  const upgradeFixtureScene = (): UpgradeFixtureScene | undefined => {
    if (!game.scene.isActive('GameScene')) return undefined;
    return game.scene.getScene('GameScene') as UpgradeFixtureScene;
  };
  const prepareUpgradeOffer = (
    ids: readonly string[], owned: Readonly<Record<string, number>> = {}, pendingLevels = 1,
  ): boolean => {
    const scene = upgradeFixtureScene();
    const run = scene?.runState;
    const system = scene?.upgradeSystem;
    if (!scene || !run || !system || run.status !== 'active' || system.currentOfferSnapshot
      || ids.length === 0 || ids.length > RuntimeConfig.gameplay.upgrades.offerCount
      || new Set(ids).size !== ids.length || !Number.isSafeInteger(pendingLevels) || pendingLevels < 1 || pendingLevels > 5) return false;
    const ctx = scene.getContext();
    const definitions = ctx.data.upgrades;
    if (ids.some(id => !definitions.some(definition => definition.id === id))) return false;
    for (const [id, stacks] of Object.entries(owned)) {
      const definition = definitions.find(row => row.id === id);
      if (!ids.includes(id) || !definition || !Number.isSafeInteger(stacks) || stacks < 0 || stacks >= definition.maxStacks) return false;
    }
    const familyDefinitions = ['pistol', 'smg', 'shotgun'].map(family => ctx.data.weapons.find(row => row.family === family && row.mergeTier === 1));
    if (familyDefinitions.some(definition => !definition)) return false;
    // Isolated visual-test fixture state controls eligibility only. The real
    // coordinator still rolls its named stream, publishes the frozen offer,
    // acquires its pause lease, and applies only real player input commands.
    for (const definition of definitions) {
      run.upgradeStacks[definition.id] = ids.includes(definition.id) ? owned[definition.id] ?? 0 : definition.maxStacks;
    }
    run.equipped = familyDefinitions.map((definition, index) => createWeaponInstance(definition!, `upgrade-browser:${index}`));
    if (upgradeObservedRun !== run) {
      stopUpgradeObservation?.();
      upgradeObservedRun = run;
      stopUpgradeObservation = ctx.bus.on('card:chosen', ({ upgradeId }) => { upgradeChosen.push(upgradeId); });
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (upgradeObservedRun !== run) return;
        stopUpgradeObservation?.();
        stopUpgradeObservation = undefined;
        upgradeObservedRun = undefined;
        upgradeChosen = [];
      });
    }
    upgradeChosen = [];
    for (let index = 0; index < pendingLevels; index++) ctx.bus.emit('level:up', { level: upgradeFixtureLevel++ });
    return system.currentOfferSnapshot !== undefined;
  };
  const upgradeChooserDiagnostics = (): Record<string, unknown> | undefined => {
    const scene = upgradeFixtureScene();
    const chooser = scene?.upgradeChooser;
    if (!scene || !chooser || !scene.runState) return undefined;
    const view = (chooser as unknown as { view: {
      root?: Phaser.GameObjects.Container;
      cardBackgrounds: Phaser.GameObjects.Rectangle[];
      cardEdges: Phaser.GameObjects.Rectangle[];
      renderedText: Array<{ role: string; object: Phaser.GameObjects.Text }>;
    } }).view;
    const camera = scene.cameras.main;
    const canvasRect = game.canvas.getBoundingClientRect();
    const screenBounds = (object: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Image) => {
      const matrix = Phaser.GameObjects.GetCalcMatrix(object, camera, object.parentContainer?.getWorldTransformMatrix()).calc;
      const topLeft = matrix.transformPoint(-object.displayOriginX, -object.displayOriginY);
      const bottomRight = matrix.transformPoint(object.width - object.displayOriginX, object.height - object.displayOriginY);
      return {
        x: canvasRect.left + topLeft.x * canvasRect.width / game.scale.gameSize.width,
        y: canvasRect.top + topLeft.y * canvasRect.height / game.scale.gameSize.height,
        width: (bottomRight.x - topLeft.x) * canvasRect.width / game.scale.gameSize.width,
        height: (bottomRight.y - topLeft.y) * canvasRect.height / game.scale.gameSize.height,
      };
    };
    const diagnostics = chooser.diagnostics;
    const screenScale = camera.zoom * canvasRect.height / game.scale.gameSize.height;
    const images = (view.root?.list ?? []).filter((node): node is Phaser.GameObjects.Image => node instanceof Phaser.GameObjects.Image);
    return {
      ...diagnostics,
      catalogIds: scene.getContext().data.upgrades.map(definition => definition.id),
      cards: diagnostics.cards.map((card, index) => ({
        ...card, ...screenBounds(view.cardBackgrounds[index]),
        stroke: {
          visible: view.cardEdges[index].visible && view.root?.visible === true,
          isStroked: view.cardEdges[index].isStroked,
          color: view.cardEdges[index].strokeColor,
          alpha: view.cardEdges[index].strokeAlpha * view.cardEdges[index].alpha * (view.root?.alpha ?? 1) * camera.alpha,
          width: view.cardEdges[index].lineWidth,
          physicalWidth: view.cardEdges[index].lineWidth * screenScale,
        },
      })),
      text: diagnostics.text.map((row, index) => ({
        ...row, ...screenBounds(view.renderedText[index].object),
        physicalFontSize: Number.parseFloat(String(view.renderedText[index].object.style.fontSize)) * screenScale,
        physicalNaturalHeight: row.naturalHeight * screenScale,
        // Phaser 3.90's cropped WebGL batch replaces logical Text size with
        // backing-pixel crop size. At resolution 2 that magnifies glyphs 2x
        // while metadata bounds still look valid; expose this independent
        // renderer fact so unsupported crop use cannot pass the fit oracle.
        rasterScale: view.renderedText[index].object.isCropped ? view.renderedText[index].object.style.resolution : 1,
      })),
      icons: diagnostics.icons.map((icon, index) => ({ ...icon, ...screenBounds(images[index]), frameKey: images[index].frame.name, visible: images[index].visible })),
      status: scene.runState.status,
      pauseReason: scene.runState.pauseReason,
      stacks: { ...scene.runState.upgradeStacks },
      chosenIds: [...upgradeChosen],
      pendingCount: scene.upgradeSystem?.pendingCount,
      inputMode: scene.inputController?.getInputMode(),
      inputNeutral: scene.inputController?.core?.isNeutral() === true,
      orientationBlocked: isPortraitOrientationBlocked(),
      canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
      devicePixelRatio,
    };
  };
  let focusedActorWorldPoint: { x: number; y: number } | undefined;
  const isMenuPresentationSettled = (): boolean => {
    const scene = game.scene.getScene('MenuScene') as unknown as {
      panelArtLoading?: boolean;
      panelArtInFlight?: Promise<void>;
      mercenaryArtLoading?: boolean;
      achievementArtLoading?: boolean;
      equipmentArtLoading?: boolean;
      gunsmithArtLoading?: boolean;
      menuTextureLoadPending?: number;
      pendingPanelArtIds?: { size: number };
      pendingPanelArtRepaints?: { size: number };
      pendingGunsmithArtIds?: { size: number };
      committedPanel?: string;
      committedDisplay?: boolean;
    };
    return Boolean(scene)
      && game.scene.isActive('MenuScene')
      && scene.committedDisplay === true
      && scene.committedPanel !== undefined
      && !scene.panelArtLoading
      && !scene.panelArtInFlight
      && !scene.mercenaryArtLoading
      && !scene.achievementArtLoading
      && !scene.equipmentArtLoading
      && !scene.gunsmithArtLoading
      && (scene.menuTextureLoadPending ?? 0) === 0
      && (scene.pendingPanelArtIds?.size ?? 0) === 0
      && (scene.pendingPanelArtRepaints?.size ?? 0) === 0
      && (scene.pendingGunsmithArtIds?.size ?? 0) === 0;
  };
  const menuPresentationDiagnostics = (): Record<string, unknown> => {
    const scene = game.scene.getScene('MenuScene') as unknown as {
      panelArtLoading?: boolean;
      panelArtInFlight?: Promise<void>;
      mercenaryArtLoading?: boolean;
      achievementArtLoading?: boolean;
      equipmentArtLoading?: boolean;
      gunsmithArtLoading?: boolean;
      menuTextureLoadPending?: number;
      pendingPanelArtIds?: { size: number };
      pendingPanelArtRepaints?: { size: number };
      pendingGunsmithArtIds?: { size: number };
      menuTextureLoadSnapshot?(): Readonly<{ generation: number; pending: Promise<void> }>;
      committedPanel?: string;
      committedDisplay?: boolean;
    };
    return {
      active: game.scene.isActive('MenuScene'),
      committedPanel: scene?.committedPanel,
      committedDisplay: Boolean(scene?.committedDisplay),
      loadedTextureKeys: game.textures.getTextureKeys(),
      generation: scene?.menuTextureLoadSnapshot?.().generation,
      panelArtLoading: Boolean(scene?.panelArtLoading),
      panelArtInFlight: Boolean(scene?.panelArtInFlight),
      mercenaryArtLoading: Boolean(scene?.mercenaryArtLoading),
      achievementArtLoading: Boolean(scene?.achievementArtLoading),
      equipmentArtLoading: Boolean(scene?.equipmentArtLoading),
      gunsmithArtLoading: Boolean(scene?.gunsmithArtLoading),
      menuTextureLoadPending: scene?.menuTextureLoadPending ?? 0,
      pendingPanelArtIds: scene?.pendingPanelArtIds?.size ?? 0,
      pendingPanelArtRepaints: scene?.pendingPanelArtRepaints?.size ?? 0,
      pendingGunsmithArtIds: scene?.pendingGunsmithArtIds?.size ?? 0,
    };
  };
  // Tests observe the owning physical/logical boundary after a real input
  // frame, including keys, pointers and native pad state across scene handoff.
  const isMenuInputNeutral = (): boolean => {
    const scene = game.scene.getScene('MenuScene') as unknown as {
      inputController?: { isNeutral(): boolean; isQuarantined(): boolean };
    };
    return !game.scene.isActive('MenuScene') || (scene.inputController?.isNeutral() === true && !scene.inputController.isQuarantined());
  };
  const waitBeforeDeadline = (pending: Promise<unknown>, deadline: number): Promise<boolean> => new Promise((resolve) => {
    let completed = false;
    const finish = (result: boolean): void => {
      if (completed) return;
      completed = true;
      globalThis.clearTimeout(timeout);
      resolve(result);
    };
    const timeout = globalThis.setTimeout(() => finish(false), Math.max(0, deadline - performance.now()));
    pending.then(() => finish(true), () => finish(false));
  });
  const pauseVisualAnimations = (): void => {
    for (const scene of game.scene.getScenes(false)) {
      const pending = [...scene.children.list] as Array<Phaser.GameObjects.GameObject & { list?: Phaser.GameObjects.GameObject[] }>;
      while (pending.length > 0) {
        const child = pending.pop()!;
        if (child.list) pending.push(...child.list);
        const animated = child as unknown as {
          anims?: {
            currentAnim?: { frames?: readonly unknown[] };
            isPlaying: boolean;
            setCurrentFrame?(frame: unknown): void;
          };
        };
        const firstFrame = animated.anims?.currentAnim?.frames?.[0];
        // Phaser retains currentAnim after stop(). Rewinding that metadata
        // would overwrite a reused static texture or a cleared pooled view.
        if (firstFrame && animated.anims?.isPlaying) animated.anims.setCurrentFrame?.(firstFrame);
      }
    }
    game.anims.pauseAll();
  };
  const freezeVisualFrame = async (): Promise<void> => {
    pauseVisualAnimations();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    game.loop.sleep();
  };
  const renderVisualFrame = (): void => {
    // Render explicitly frozen fixture state without running input or simulation.
    game.renderer.preRender();
    game.scene.render(game.renderer);
    game.renderer.postRender();
  };
  Object.defineProperty(globalThis, '__MEOWCENARY_VISUAL_TEST__', {
    configurable: true,
    value: Object.freeze({
      prepareUpgradeOffer,
      upgradeChooserDiagnostics,
      setUpgradeTestReducedMotion: (reducedMotion: boolean): boolean => {
        const scene = upgradeFixtureScene();
        if (!scene) return false;
        return scene.getContext().updateSettings({ reducedMotion }).persisted;
      },
      removeUpgradeTestArt: (id: string, kind: 'texture' | 'frame'): boolean => {
        const scene = upgradeFixtureScene();
        if (!scene) return false;
        const ctx = scene.getContext();
        const definition = ctx.data.upgrades.find(row => row.id === id);
        const binding = definition && new DataVisualArtRegistry(ctx.data).bindingById(definition.presentation.iconArtId);
        if (!binding || !game.textures.exists(binding.textureKey)) return false;
        if (kind === 'texture') game.textures.remove(binding.textureKey);
        else game.textures.get(binding.textureKey).remove(String(binding.frameKey ?? '__BASE'));
        return true;
      },
      freeze: freezeVisualFrame,
      focusArtBackdrop: (): boolean => {
        // Explicit synthetic transient-art fixture, never a runtime command.
        const scene = game.scene.getScene('GameScene') as unknown as {
          player?: { x: number; y: number }; scene?: { pause(): void };
        };
        if ((!game.scene.isActive('GameScene') && !game.scene.isPaused('GameScene')) || !scene.player) return false;
        focusedActorWorldPoint = { x: scene.player.x, y: scene.player.y };
        if (game.scene.isActive('GameScene')) scene.scene?.pause();
        return true;
      },
      useAuthoredArenaArtReference: (): boolean => {
        // Dedicated art references explicitly pose/pause actors or backdrops.
        // Never pause a live scene or change production input/lifecycle here.
        const scene = game.scene.getScene('GameScene') as unknown as {
          scale?: { width: number; height: number };
          cameras?: { main?: Phaser.Cameras.Scene2D.Camera };
          arenaDimensions?: { width: number; height: number };
          arenaScenery?: { applyPresentationBounds(bounds: ReturnType<typeof responsiveArenaPresentationBounds>): void };
        };
        const camera = scene.cameras?.main;
        const arena = scene.arenaDimensions;
        if (!game.scene.isPaused('GameScene') || !focusedActorWorldPoint || !camera || !arena || !scene.scale) return false;
        const bounds = responsiveArenaPresentationBounds(arena.width, arena.height,
          scene.scale.width, scene.scale.height, camera.zoom);
        camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
        scene.arenaScenery?.applyPresentationBounds(bounds);
        camera.stopFollow();
        camera.centerOn(focusedActorWorldPoint.x, focusedActorWorldPoint.y);
        return true;
      },
      resume: () => {
        game.anims.resumeAll();
        game.loop.wake();
      },
      isSceneActive: (key: string): boolean => game.scene.isActive(key),
      pickupPresentationFixture: (command:
        | { kind: 'spawn'; grant: LootGrant }
        | { kind: 'reset' | 'inspect'; debugId: number }
        | { kind: 'blocked'; debugId: number; blocked: boolean }): Record<string, unknown> | undefined => {
        // Synchronous, Training-only proof through the real pool. Retain no
        // entity, listener or asynchronous completion between fixture calls.
        const scene = game.scene.getScene('GameScene') as unknown as {
          isTraining?: boolean; runState?: RunState; player?: { x: number; y: number };
          dropSystem?: { spawnDrop(x: number, y: number, grant: LootGrant): Drop;
            releaseDrop(drop: Drop): void; ownedDrops: readonly Drop[]; weaponRegistry: WeaponRegistry;
            activeDropCount: number; allocatedDropCount: number };
        };
        const owner = scene.dropSystem;
        if (!game.scene.isActive('GameScene') || !scene.isTraining
          || scene.runState?.status !== 'active' || !scene.player || !owner) return undefined;
        const drop = command.kind === 'spawn'
          ? owner.spawnDrop(scene.player.x + 64, scene.player.y + 64, command.grant)
          : owner.ownedDrops.find(candidate => candidate.debugId === command.debugId);
        if (!drop) return undefined;
        if (command.kind === 'reset') owner.releaseDrop(drop);
        if (command.kind === 'blocked') {
          if (!drop.active || drop.grant?.kind !== 'weapon') return undefined;
          // Establish a real full-rack precondition; otherwise the normal
          // next update correctly clears this presentation pose.
          if (command.blocked) {
            while (scene.runState.equipped.length < WEAPON_RACK_CAPACITY) {
              if (grantWeaponToRack(scene.runState, drop.grant.definitionId,
                owner.weaponRegistry).status !== 'added') return undefined;
            }
          } else if (scene.runState.equipped.length === WEAPON_RACK_CAPACITY) {
            scene.runState.equipped.pop();
          }
          drop.setPickupBlocked(command.blocked);
        }
        const view = (drop as unknown as { artSprite?: Phaser.GameObjects.Sprite;
          glint: Phaser.GameObjects.Arc });
        const art = view.artSprite;
        return {
          debugId: drop.debugId, active: drop.active, blocked: drop.pickupBlocked,
          grant: drop.grant ? { ...drop.grant } : undefined,
          allocated: owner.allocatedDropCount, activeCount: owner.activeDropCount,
          rackCount: scene.runState.equipped.length,
          configuredRadius: RuntimeConfig.gameplay.drop.radius,
          artNodes: owner.ownedDrops.filter(candidate =>
            Boolean((candidate as unknown as { artSprite?: unknown }).artSprite)).length,
          body: { radius: drop.body.radius, enabled: drop.body.enable,
            isCircle: drop.body.isCircle, velocity: { x: drop.body.velocity.x, y: drop.body.velocity.y } },
          art: art ? { texture: art.texture.key, frame: art.frame.name,
            animation: art.anims.currentAnim?.key, playing: art.anims.isPlaying,
            width: art.displayWidth, height: art.displayHeight, alpha: art.alpha,
            tint: art.tintTopLeft, flipX: art.flipX, flipY: art.flipY,
            rotation: art.rotation, originX: art.originX, originY: art.originY,
            x: art.x, y: art.y, visible: art.visible, active: art.active } : undefined,
          marker: { visible: view.glint.visible, active: view.glint.active,
            colour: view.glint.fillColor },
        };
      },
      waitForInputFrame: (): Promise<boolean> => new Promise((resolve) => {
        if (!game.isRunning || !game.loop.running) { resolve(false); return; }
        const finish = (result: boolean): void => {
          game.events.off(Phaser.Core.Events.POST_STEP, sampled);
          game.events.off(Phaser.Core.Events.DESTROY, destroyed);
          resolve(result);
        };
        const sampled = (): void => finish(true);
        const destroyed = (): void => finish(false);
        // Scene input owners sample during update, before POST_STEP. Observe
        // one real sample without stepping/waking the game or altering input.
        game.events.once(Phaser.Core.Events.POST_STEP, sampled);
        game.events.once(Phaser.Core.Events.DESTROY, destroyed);
      }),
      selectAbilityTestCharacter: (id:string): boolean => {
        const menu=game.scene.getScene('MenuScene') as unknown as {getContext():GameContext};
        if (!game.scene.isActive('MenuScene')) return false;
        const ctx=menu.getContext();return ctx.selectCharacter(id,ctx.selectionRevision).ok;
      },
      prepareAbilityTestConsequences: (levelUp=false, crowded=false): boolean => {
        const scene=game.scene.getScene('GameScene') as unknown as {
          runState?:RunState; player?:{x:number;y:number;takeDamage(amount:number):void};
          systems:Array<{spawnEncounterEnemy?(id:string,x:number,y:number):boolean}>;
          dropSystem?:{spawnDrop(x:number,y:number,grant:{kind:'xp'|'scrap';amount:number}):unknown};
        };
        if (!scene.player || scene.runState?.status!=='active') return false;
        scene.player.takeDamage(13);
        const spawn=scene.systems.find(system=>typeof system.spawnEncounterEnemy==='function');
        // Fixture uses normal closed encounter assets and normal entity/drop owners.
        const count=crowded?32:4;
        for(let index=0;index<count;index++) {
          const angle=index*Math.PI*2/count;
          spawn?.spawnEncounterEnemy?.('dust-mite',scene.player.x+(crowded?Math.cos(angle)*80:24+index*10),scene.player.y+(crowded?Math.sin(angle)*80:0));
        }
        scene.dropSystem?.spawnDrop(scene.player.x+48,scene.player.y,{kind:'xp',amount:levelUp?scene.runState.xpToNext:1});
        scene.dropSystem?.spawnDrop(scene.player.x+52,scene.player.y,{kind:'scrap',amount:7});
        return true;
      },
      runStartIntroDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          runState?: { status: string; timeMs: number; characterId: string }; player?: { x: number; y: number; health: number };
          getContext(): { bus: EventBus }; inputController?: { getInputMode(): string; isNeutral(): boolean; isQuarantined(): boolean };
          orientationBlocked: boolean; recovering?: boolean; enemies?: readonly unknown[]; abilityState?: unknown; abilityDefinition?: unknown;
          controlsView?: { abilityUiState: unknown; abilityButton?: Phaser.GameObjects.Rectangle; hintText?: Phaser.GameObjects.Text };
          abilityPresentationSystem?: { banner: Phaser.GameObjects.Text; persistent?: unknown; transient?: unknown };
          introModel?: import('./presentation/runStartIntro').RunStartIntroModel;
          introController?: { snapshot(): import('./ui/runStartIntroController').IntroSnapshot };
          introView?: {
            root?: Phaser.GameObjects.Container; content?: Phaser.GameObjects.Container;
            contentBounds: { x: number; y: number; width: number; height: number }; scrollOffset: number; maxScroll: number;
            focusedCommand(): import('./ui/runStartIntroController').IntroCommand | undefined;
            buttons: Array<{ command: import('./ui/runStartIntroController').IntroCommand; label: string; rect: Phaser.GameObjects.Rectangle }>;
          };
          canInteractWithIntro(): boolean; cameras: Phaser.Cameras.Scene2D.CameraManager;
        };
        const active = game.scene.isActive('GameScene');
        if (!active || !scene.runState) {
          return abilityObservedRun ? { visible: false, status: 'menu', phase: observedRunStart.count > 0 ? 'consumed' : 'cancelled', revision: null,
            identity: observedIntroIdentity, objective: observedIntroObjective, runStart: { ...observedRunStart }, terminalEvents: observedTerminalEvents, commands: [] } : undefined;
        }
        if (abilityObservedRun !== scene.runState) {
          stopAbilityObservation?.(); abilityObservedRun = scene.runState; abilityResolution = undefined;
          observedIntroIdentity = scene.introModel?.identity; observedIntroObjective = scene.introModel?.objective;
          observedRunStart = { count: 0 }; observedTerminalEvents = 0;
          const run = scene.runState; const bus = scene.getContext().bus;
          const stops = [
            bus.on('ability:resolved', event => { if (scene.runState === run) abilityResolution = event; }),
            bus.on('run:start', () => { if (scene.runState === run) observedRunStart = { count: observedRunStart.count + 1, timeMs: run.timeMs, atMs: performance.now() }; }),
            bus.on('run:won', () => { if (scene.runState === run) observedTerminalEvents += 1; }),
            bus.on('run:lost', () => { if (scene.runState === run) observedTerminalEvents += 1; }),
          ];
          stopAbilityObservation = () => stops.forEach(stop => stop());
        }
        const camera = scene.cameras.main, canvas = game.canvas.getBoundingClientRect();
        const project = (matrix: Phaser.GameObjects.Components.TransformMatrix, x: number, y: number, width: number, height: number) => {
          const first = matrix.transformPoint(x, y), last = matrix.transformPoint(x + width, y + height);
          return { x: canvas.left + first.x * canvas.width / game.scale.gameSize.width,
            y: canvas.top + first.y * canvas.height / game.scale.gameSize.height,
            width: (last.x - first.x) * canvas.width / game.scale.gameSize.width,
            height: (last.y - first.y) * canvas.height / game.scale.gameSize.height };
        };
        const bounds = (target: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text) => project(
          Phaser.GameObjects.GetCalcMatrix(target, camera, target.parentContainer?.getWorldTransformMatrix()).calc,
          -target.displayOriginX, -target.displayOriginY, target.width, target.height);
        const view = scene.introView, state = scene.introController?.snapshot();
        const ready = scene.canInteractWithIntro();
        const commands = (view?.buttons ?? []).map(({ command, label, rect }) => ({ command, label, bounds: bounds(rect), enabled: ready }));
        const text: Array<Record<string, unknown>> = [];
        const walk = (node: Phaser.GameObjects.GameObject): void => {
          if (node instanceof Phaser.GameObjects.Text) text.push({ text: node.text, ...bounds(node), inScrollBody: node.parentContainer === view?.content });
          for (const child of (node as Phaser.GameObjects.Container).list ?? []) walk(child);
        };
        if (view?.root) walk(view.root);
        const body = view?.root ? project(Phaser.GameObjects.GetCalcMatrix(view.root, camera, view.root.parentContainer?.getWorldTransformMatrix()).calc,
          view.contentBounds.x, view.contentBounds.y, view.contentBounds.width, view.contentBounds.height) : undefined;
        const fx = scene.abilityPresentationSystem;
        // Read-only physical evidence at this exact diagnostic call. Never
        // refresh an adapter or alter held/quarantine state while observing.
        const controller = scene.inputController as typeof scene.inputController & {
          core?: { isNeutral(): boolean; isEffectiveHeld?(action: 'ability' | 'confirm'): boolean }; keyboardAdapter?: { isNeutral(): boolean };
          pointerAdapter?: { isNeutral(): boolean }; gamepadAdapter?: { isNeutral(): boolean };
        };
        const actualScene = game.scene.getScene('GameScene');
        const inputPhysicalEvidence = {
          core: controller?.core?.isNeutral(), keyboard: controller?.keyboardAdapter?.isNeutral(),
          pointer: controller?.pointerAdapter?.isNeutral(), gamepad: controller?.gamepadAdapter?.isNeutral(),
          nativePads: Array.from(navigator.getGamepads?.() ?? [], pad => pad ? {
            index: pad.index, connected: pad.connected, axes: [...pad.axes],
            buttons: pad.buttons.map(button => ({ value: button.value, pressed: button.pressed })),
          } : null),
          phaserPads: (actualScene.input.gamepad?.gamepads ?? []).map(pad => pad ? {
            index: pad.index, connected: pad.connected, axes: pad.axes.map(axis => axis.value),
            buttons: pad.buttons.map(button => ({ value: button.value, pressed: button.pressed })),
          } : null),
        };
        return { inputPhysicalEvidence, visible: Boolean(view?.root), phase: state?.phase ?? (scene.recovering ? 'cancelled' : 'consumed'), revision: state?.revision ?? null,
          status: scene.runState.status, timeMs: scene.runState.timeMs, identity: observedIntroIdentity, objective: observedIntroObjective,
          focusedCommand: view?.focusedCommand(), ready, commands, body, scroll: view ? { offset: view.scrollOffset, max: view.maxScroll } : undefined,
          runStart: { ...observedRunStart }, terminalEvents: observedTerminalEvents,
          characterId: scene.runState.characterId, player: scene.player ? { x: scene.player.x, y: scene.player.y, health: scene.player.health } : undefined,
          enemies: scene.enemies?.length, abilityState: scene.abilityState, abilityDefinition: scene.abilityDefinition, model: scene.introModel,
          inputMode: scene.inputController?.getInputMode(), inputNeutral: scene.inputController?.isNeutral() === true,
          abilityHeld: controller?.core?.isEffectiveHeld?.('ability') === true, confirmHeld: controller?.core?.isEffectiveHeld?.('confirm') === true,
          inputQuarantined: scene.inputController?.isQuarantined() !== false, orientationBlocked: scene.orientationBlocked,
          abilityUiState: scene.controlsView?.abilityUiState, abilityButton: scene.controlsView?.abilityButton ? bounds(scene.controlsView.abilityButton) : undefined,
          controlsHint: scene.controlsView?.hintText ? { text: scene.controlsView.hintText.text, ...bounds(scene.controlsView.hintText), visible: scene.controlsView.hintText.visible && scene.controlsView.hintText.alpha > 0 } : undefined,
          abilityBanner: fx?.banner.text, abilityFx: { persistent: fx?.persistent, transient: fx?.transient }, activationId: abilityResolution?.activationId ?? 0,
          latestResolution: abilityResolution?.resolution, introText: text };
      },
      waitForPreparedGame: async (): Promise<boolean> => {
        // Join the owning serialized loader rather than imposing a synthetic
        // launch-time performance limit. The caller's test budget still bounds
        // this diagnostic, and a failed/cancelled handoff remains observable.
        const menu = game.scene.getScene('MenuScene') as unknown as {
          runLaunchState?: string;
          runLaunchGeneration?: number;
          menuTextureLoadSnapshot?(): Readonly<{ generation: number; pending: Promise<void> }>;
        };
        let launchGeneration: number | undefined;
        let pending: Promise<void> | undefined;
        let resourcesClosed = false;
        let loadFailed = false;
        while (!game.scene.isActive('GameScene')) {
          if (!game.scene.isActive('MenuScene') || menu.runLaunchState === 'failed') return false;
          if (menu.runLaunchState === 'loading') launchGeneration ??= menu.runLaunchGeneration;
          if (launchGeneration !== undefined && launchGeneration !== menu.runLaunchGeneration) return false;
          const snapshot = menu.menuTextureLoadSnapshot?.();
          if (!snapshot) return false;
          if (snapshot.pending !== pending) {
            pending = snapshot.pending;
            resourcesClosed = false;
            // Observe each queue promise once. Loader shutdown may leave its
            // old promise unresolved, so cancellation must remain independent
            // of that promise. Late completion only changes diagnostic locals.
            void pending.then(
              () => { if (pending === snapshot.pending) resourcesClosed = true; },
              () => { if (pending === snapshot.pending) loadFailed = true; },
            );
          }
          if (loadFailed) return false;
          // A completed load queues the scene transition at the next Phaser
          // frame; input sampling and scene creation retain their real owners.
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }
        return resourcesClosed || pending === undefined;
      },
      stopPreparingMenu: (): boolean => {
        const menu = game.scene.getScene('MenuScene') as unknown as { runLaunchState?: string };
        if (!game.scene.isActive('MenuScene') || menu.runLaunchState !== 'loading') return false;
        // Exercise the real Phaser shutdown while a resource request is held.
        // This seam exists only in the explicitly opted-in visual test build.
        game.scene.stop('MenuScene');
        return true;
      },
      placePlayerForArenaFraming: (x: number, y: number): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          player?: {
            sprite: Phaser.GameObjects.GameObject & {
              setPosition(x: number, y: number): unknown;
              body?: Phaser.Physics.Arcade.Body;
            };
            grantInvulnerability?(durationMs: number): void;
          };
          arenaDimensions?: { width: number; height: number };
        };
        const player = scene?.player;
        const arena = scene?.arenaDimensions;
        if (!player || !arena) return false;
        const body = player.sprite.body;
        const radiusX = body?.halfWidth ?? 0;
        const radiusY = body?.halfHeight ?? 0;
        const safeX = Phaser.Math.Clamp(x, radiusX, arena.width - radiusX);
        const safeY = Phaser.Math.Clamp(y, radiusY, arena.height - radiusY);
        body?.reset(safeX, safeY);
        player.sprite.setPosition(safeX, safeY);
        player.grantInvulnerability?.(60_000);
        return true;
      },
      arenaFramingDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          scale?: { width: number; height: number };
          cameras?: { main?: Phaser.Cameras.Scene2D.Camera };
          player?: {
            sprite: Phaser.GameObjects.GameObject & { x: number; y: number; body?: Phaser.Physics.Arcade.Body };
            writePresentationBounds(output: Phaser.Geom.Rectangle): void;
            writeCompletePresentationBounds(output: Phaser.Geom.Rectangle): void;
            view?: { sprite?: Phaser.GameObjects.Sprite; shadow?: { node: Phaser.GameObjects.Arc } };
          };
          physics?: { world: { bounds: Phaser.Geom.Rectangle } };
          arenaScenery?: { overscanInspection?(): {
            overscanBounds?: { x: number; y: number; width: number; height: number };
            overscanResource?: { width: number; height: number; canvasWidth: number; canvasHeight: number };
          } };
          arenaDimensions?: { width: number; height: number };
          children?: { list: Phaser.GameObjects.GameObject[] };
        };
        const camera = scene?.cameras?.main;
        const player = scene?.player;
        const arena = scene?.arenaDimensions;
        if (!camera || !player || !arena || !scene.scale) return undefined;
        const plainRect = (rect: DOMRect | Phaser.Geom.Rectangle) => ({
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        });
        const root = document.getElementById('game-root');
        const canvas = root?.querySelector('canvas');
        const styles = getComputedStyle(document.documentElement);
        const actorBounds = new Phaser.Geom.Rectangle();
        player.writePresentationBounds(actorBounds);
        const completeBounds = new Phaser.Geom.Rectangle();
        player.writeCompletePresentationBounds(completeBounds);
        // Observe the real camera transform, not rounded worldView metadata.
        const cameraMatrix = Phaser.GameObjects.GetCalcMatrix(player.sprite, camera).camera;
        const screenRect = (bounds: Phaser.Geom.Rectangle) => {
          const topLeft = cameraMatrix.transformPoint(bounds.x - camera.scrollX, bounds.y - camera.scrollY);
          const bottomRight = cameraMatrix.transformPoint(bounds.right - camera.scrollX, bounds.bottom - camera.scrollY);
          return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
        };
        // Inspect real nodes independently of the composition's union method.
        const layers = [player.view?.sprite, player.view?.shadow?.node].filter((node) => node?.visible)
          .map((node) => { const bounds = node!.getBounds(); return { type: node!.type, worldBounds: plainRect(bounds), screenBounds: screenRect(bounds) }; });
        const scenery = scene.arenaScenery?.overscanInspection?.();
        const hudLayers = ((scene.children?.list ?? []) as Array<Phaser.GameObjects.GameObject & {
          depth: number; visible: boolean; alpha: number; fillAlpha?: number;
        }>)
          .filter((node) => node.depth >= 90 && node.depth < 100 && node.visible)
          .map((node) => ({
            type: node.type,
            depth: node.depth,
            alpha: node.alpha,
            ...(node.fillAlpha === undefined ? {} : { fillAlpha: node.fillAlpha }),
          }));
        return Object.freeze({
          loop: { frame: game.loop.frame, actualFps: game.loop.actualFps },
          window: { innerWidth, innerHeight, devicePixelRatio },
          visualViewport: globalThis.visualViewport ? {
            width: globalThis.visualViewport.width,
            height: globalThis.visualViewport.height,
            offsetTop: globalThis.visualViewport.offsetTop,
            offsetLeft: globalThis.visualViewport.offsetLeft,
          } : undefined,
          rootRect: root ? plainRect(root.getBoundingClientRect()) : undefined,
          canvas: canvas ? {
            width: canvas.width,
            height: canvas.height,
            rect: plainRect(canvas.getBoundingClientRect()),
          } : undefined,
          scale: { width: scene.scale.width, height: scene.scale.height },
          camera: {
            viewport: { x: camera.x, y: camera.y, width: camera.width, height: camera.height },
            zoom: camera.zoom,
            scroll: { x: camera.scrollX, y: camera.scrollY },
            worldView: plainRect(camera.worldView),
            bounds: plainRect(camera.getBounds()),
            roundPixels: camera.roundPixels,
          },
          arena,
          physicsBounds: scene.physics ? plainRect(scene.physics.world.bounds) : undefined,
          overscanBounds: scenery?.overscanBounds,
          overscanResource: scenery?.overscanResource,
          player: {
            x: player.sprite.x,
            y: player.sprite.y,
            bodyRadius: Math.max(player.sprite.body?.halfWidth ?? 0, player.sprite.body?.halfHeight ?? 0),
            presentationBounds: plainRect(actorBounds),
            completePresentationBounds: plainRect(completeBounds),
            screenBounds: screenRect(completeBounds),
            layers,
          },
          hudLayers,
          safeArea: {
            top: styles.getPropertyValue('--safe-top'), right: styles.getPropertyValue('--safe-right'),
            bottom: styles.getPropertyValue('--safe-bottom'), left: styles.getPropertyValue('--safe-left'),
          },
          fullscreen: document.fullscreenElement?.id,
        });
      },
      captureArenaReadability: async (): Promise<Record<string, unknown> | undefined> => {
        // A finite, visual-build-only diagnostic. Compare identical world/pose
        // pixels with and without UI paint; geometry/alpha checks alone cannot
        // detect a translucent plate or a control erasing the actor beneath it.
        const scene = game.scene.getScene('GameScene') as unknown as {
          player?: { view?: { sprite?: Phaser.GameObjects.Sprite } };
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
          children: { list: Phaser.GameObjects.GameObject[] };
        };
        const actor = scene?.player?.view?.sprite;
        if (!game.scene.isActive('GameScene') || !actor) return undefined;
        const wasRunning = game.loop.running;
        const animationsWerePaused = game.anims.paused;
        const restoreLoop = () => {
          if (!game.isRunning) return;
          if (!animationsWerePaused) game.anims.resumeAll();
          if (wasRunning) game.loop.wake();
        };
        // The settled pose is rendered explicitly four times below. Freeze
        // synchronously so two incidental full-scene renders do not precede
        // every diagnostic. Screenshot callers retain their rendered freeze.
        pauseVisualAnimations();
        game.loop.sleep();
        if (!game.scene.isActive('GameScene') || !actor.active) { restoreLoop(); return undefined; }
        const camera = scene.cameras.main;
        const scrollX = camera.scrollX;
        const scrollY = camera.scrollY;
        const ui = (scene.children.list as Array<Phaser.GameObjects.GameObject & {
          depth: number; visible: boolean; setVisible(value: boolean): unknown;
        }>).filter((node) => node.depth >= 90);
        const visible = ui.map((node) => node.visible);
        const actorVisible = actor.visible;
        const canvas = document.createElement('canvas');
        canvas.width = game.canvas.width;
        canvas.height = game.canvas.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) { restoreLoop(); return undefined; }
        const timings: Record<string, number> = {};
        const capture = (withUi: boolean, withActor: boolean) => {
          const started = performance.now();
          ui.forEach((node, index) => node.setVisible(withUi && visible[index]));
          actor.setVisible(withActor && actorVisible);
          // Camera.preRender normally advances follow. Start each diagnostic
          // render from the same scroll so four captures share one transform.
          camera.setScroll(scrollX, scrollY);
          game.renderer.preRender();
          game.scene.render(game.renderer);
          game.renderer.postRender();
          const rendered = performance.now();
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(game.canvas, 0, 0);
          // Actor-absent frames are pixel controls, never returned image
          // artifacts. Keep their full readbacks; avoid two unused HD encodes.
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const read = performance.now();
          const image = withActor ? canvas.toDataURL('image/png') : undefined;
          const label = `${withUi ? 'ui' : 'plain'}-${withActor ? 'actor' : 'empty'}`;
          timings[`${label}:render`] = rendered - started;
          timings[`${label}:read`] = read - rendered;
          timings[`${label}:encode`] = performance.now() - read;
          return { image, pixels };
        };
        try {
          const plain = capture(false, false);
          const reference = capture(false, true);
          const covered = capture(true, false);
          const actual = capture(true, true);
          let referenceEnergy = 0;
          let actualEnergy = 0;
          let actorPixels = 0;
          for (let index = 0; index < plain.pixels.length; index += 4) {
            let referenceDifference = 0;
            let actualDifference = 0;
            for (let channel = 0; channel < 3; channel++) {
              referenceDifference += Math.abs(reference.pixels[index + channel] - plain.pixels[index + channel]);
              actualDifference += Math.abs(actual.pixels[index + channel] - covered.pixels[index + channel]);
            }
            if (referenceDifference < 12) continue;
            actorPixels++;
            referenceEnergy += referenceDifference;
            actualEnergy += actualDifference;
          }
          return {
            timings,
            actorAlpha: actor.alpha,
            actorPixels,
            referenceEnergy,
            actualEnergy,
            retainedContribution: referenceEnergy > 0 ? actualEnergy / referenceEnergy : 0,
            reference: reference.image,
            actual: actual.image,
          };
        } finally {
          ui.forEach((node, index) => node.setVisible(visible[index]));
          actor.setVisible(actorVisible);
          camera.setScroll(scrollX, scrollY);
          restoreLoop();
        }
      },
      menuFocusedKey: (): string | undefined => {
        const scene = game.scene.getScene('MenuScene') as unknown as { readonly focusedButtonKey?: string };
        return scene?.focusedButtonKey;
      },
      menuLoadoutDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('MenuScene') as unknown as {
          loadoutUiDiagnostics?(): Record<string, unknown>;
        };
        return scene?.loadoutUiDiagnostics?.();
      },
      menuArtDiagnostics: () => {
        const scene = game.scene.getScene('MenuScene') as unknown as {
          artUiDiagnostics?(): readonly Record<string, unknown>[];
        };
        return scene?.artUiDiagnostics?.();
      },
      isMenuPresentationSettled,
      menuPresentationDiagnostics,
      isMenuInputNeutral,
      waitForMenuPresentation: async (): Promise<boolean> => {
        const deadline = performance.now() + 60_000;
        // A completed load may synchronously repaint and enqueue the next
        // closure. Observe the scene-owned queue at each frame boundary until
        // the complete read-model/resource generation is closed.
        while (performance.now() < deadline) {
          const scene = game.scene.getScene('MenuScene') as unknown as {
            menuTextureLoadSnapshot?(): Readonly<{ generation: number; pending: Promise<void> }>;
          };
          if (!scene?.menuTextureLoadSnapshot) {
            if (!await waitBeforeDeadline(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), deadline)) break;
            continue;
          }
          const snapshot = scene.menuTextureLoadSnapshot();
          if (!await waitBeforeDeadline(snapshot.pending, deadline)) {
            throw new Error(`Menu presentation loader deadline exceeded: ${JSON.stringify(menuPresentationDiagnostics())}`);
          }
          if (!await waitBeforeDeadline(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), deadline)) {
            throw new Error(`Menu presentation frame deadline exceeded: ${JSON.stringify(menuPresentationDiagnostics())}`);
          }
          if (scene !== game.scene.getScene('MenuScene')) continue;
          if (snapshot.generation !== scene.menuTextureLoadSnapshot().generation) continue;
          if (isMenuPresentationSettled()) return true;
        }
        throw new Error(`Menu presentation did not reach closure: ${JSON.stringify(menuPresentationDiagnostics())}`);
      },
      focusFirstEnemy: (bossOnly = false): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          cameras?: { main?: {
            x: number; y: number; zoom: number; worldView: { x: number; y: number };
            stopFollow(): void; centerOn(x: number, y: number): void;
          } };
          enemies?: Array<{
            definition?: { archetype?: string };
            sprite: { x: number; y: number; active?: boolean; setPosition(x: number, y: number): unknown };
            view?: { update(pose: { x: number; y: number; facing: 1; moving: boolean; alpha: number }): void };
          }>;
          scene?: { pause(): void };
        };
        const enemy = scene?.enemies?.find((candidate) => !bossOnly || candidate.definition?.archetype === 'boss');
        if (!enemy || !scene.cameras?.main) return false;
        if (enemy.sprite.active === false) return false;
        scene.scene?.pause();
        // Normalize only the dedicated visual-build fixture. This is the real
        // production actor view and animation binding, posed at a stable world
        // point so contact timing cannot weaken pixel comparisons.
        const x = 640; const y = 360;
        enemy.sprite.setPosition(x, y);
        enemy.view?.update({ x, y, facing: 1, moving: false, alpha: 1 });
        focusedActorWorldPoint = { x, y };
        scene.cameras.main.stopFollow();
        scene.cameras.main.centerOn(x, y);
        return true;
      },
      focusPlayer: (): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          cameras?: { main?: {
            stopFollow(): void; centerOn(x: number, y: number): void;
          } };
          player?: {
            sprite: { x: number; y: number; active?: boolean; setPosition(x: number, y: number): unknown };
            view?: { update(pose: { x: number; y: number; facing: 1; moving: boolean; alpha: number }): void };
          };
          scene?: { pause(): void };
        };
        const player = scene?.player;
        if (!player || !scene.cameras?.main || player.sprite.active === false) return false;
        scene.scene?.pause();
        const x = 640; const y = 360;
        player.sprite.setPosition(x, y);
        player.view?.update({ x, y, facing: 1, moving: false, alpha: 1 });
        focusedActorWorldPoint = { x, y };
        scene.cameras.main.stopFollow();
        scene.cameras.main.centerOn(x, y);
        return true;
      },
      showAbilityEffect: (): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          player?: { x: number; y: number };
          runState?: { timeMs: number };
          hudController?: { update(deltaMs: number): void };
          abilityPresentationSystem?: { update(deltaMs: number, reducedMotion: boolean): void };
          getContext?(): GameContext;
        };
        if (!scene.player || !scene.abilityPresentationSystem || !scene.getContext) return false;
        const ctx = scene.getContext();
        const definition = ctx.data.abilities?.find(ability => ability.effect.kind === 'knockback');
        if (!definition || definition.effect.kind !== 'knockback') return false;
        const explanation = resolveAbilityEffectPresentation(definition);
        // This paused, synthetic art reference owns its clock just as it owns
        // the posed actor and effect age. Enemy-load scheduling is not timer
        // authority. Real run timing remains covered by the runtime journeys.
        if (!game.scene.isPaused('GameScene') || !scene.runState) return false;
        scene.runState.timeMs = 0;
        scene.hudController?.update(0);
        ctx.bus.emit('ability:activated', {
          abilityId: 'ability:visual-test', activationId: 0, cue: definition.presentation.cue, mechanicKind: definition.effect.kind,
          headline: explanation.headline, detail: explanation.detail,
          x: scene.player.x, y: scene.player.y,
          durationMs: definition.durationMs, color: definition.presentation.color, radius: definition.effect.radius,
        });
        scene.abilityPresentationSystem.update(100, false);
        scene.abilityPresentationSystem.update(0, false);
        return true;
      },
      focusedActorScreenPoint: (): { x: number; y: number } | undefined => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          cameras?: { main?: { x: number; y: number; zoom: number; worldView: { x: number; y: number } } };
        };
        const camera = scene?.cameras?.main;
        if (!camera || !focusedActorWorldPoint) return undefined;
        return {
          x: camera.x + (focusedActorWorldPoint.x - camera.worldView.x) * camera.zoom,
          y: camera.y + (focusedActorWorldPoint.y - camera.worldView.y) * camera.zoom,
        };
      },
      showUpgradeChooser: (): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          runState?: { status: string };
          getContext?(): { bus: { emit(event: string, payload: unknown): void } };
        };
        if (scene.runState?.status !== 'active' || !scene.getContext) return false;
        scene.getContext().bus.emit('level:up', { level: 2 });
        return true;
      },
      showExtraction: (): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          controlsView?: { setExtractionState(active: boolean): void };
          scene?: { pause(): void };
        };
        if (!scene.controlsView) return false;
        scene.controlsView.setExtractionState(true);
        scene.scene?.pause();
        return true;
      },
      summaryActionDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          runSummaryView?: { root?: Phaser.GameObjects.Container; visible: boolean;
            navigator: { index: number }; buttons: Array<{ target: Phaser.GameObjects.Rectangle; enabled: boolean }> };
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
        };
        const view = scene.runSummaryView;
        if (!game.scene.isActive('GameScene') || !view?.visible || !view.root?.active) return undefined;
        const canvas = game.canvas.getBoundingClientRect();
        const actions = view.buttons.map(({ target, enabled }, index) => {
          const labels = view.root!.list.filter((child): child is Phaser.GameObjects.Text =>
            child instanceof Phaser.GameObjects.Text && child.x === target.x && child.y === target.y && child.visible);
          const matrix = Phaser.GameObjects.GetCalcMatrix(target, scene.cameras.main,
            target.parentContainer?.getWorldTransformMatrix()).calc;
          const first = matrix.transformPoint(-target.displayOriginX, -target.displayOriginY);
          const last = matrix.transformPoint(target.width - target.displayOriginX, target.height - target.displayOriginY);
          return { label: labels.length === 1 ? labels[0]!.text : undefined, enabled,
            focused: view.navigator.index === index, bounds: {
              x: canvas.left + first.x * canvas.width / game.scale.gameSize.width,
              y: canvas.top + first.y * canvas.height / game.scale.gameSize.height,
              width: (last.x - first.x) * canvas.width / game.scale.gameSize.width,
              height: (last.y - first.y) * canvas.height / game.scale.gameSize.height } };
        });
        return { actions, focusedLabel: actions.find(action => action.focused)?.label };
      },
      summaryMenuTarget: (): Readonly<{ x: number; y: number }> | undefined => {
        // Read the rendered semantic action, never invoke its command or set
        // focus. The browser test still activates the real pointer/touch hit
        // target and follows the scene-owned shutdown/Menu handoff.
        const scene = game.scene.getScene('GameScene') as unknown as {
          runSummaryView?: { root?: Phaser.GameObjects.Container };
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
        };
        const root = scene?.runSummaryView?.root;
        if (!game.scene.isActive('GameScene') || !root?.active || !root.visible) return undefined;
        const labels = root.list.filter((child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.active && child.visible && child.text === 'Main Menu');
        if (labels.length !== 1) return undefined;
        const label = labels[0];
        const matrix = Phaser.GameObjects.GetCalcMatrix(label, scene.cameras.main,
          label.parentContainer?.getWorldTransformMatrix()).calc;
        const point = matrix.transformPoint(0, 0);
        const rect = game.canvas.getBoundingClientRect();
        return Object.freeze({
          x: rect.left + point.x * rect.width / game.scale.gameSize.width,
          y: rect.top + point.y * rect.height / game.scale.gameSize.height,
        });
      },
      showRunSummary: (outcome: 'won' | 'lost'): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          runState?: {
            status: string;
            timeMs: number;
            level: number;
            kills: number;
            currency: number;
          };
          terminalSettlement?: unknown;
          completedAchievementNames?: string[];
          completedAchievements?: unknown[];
          newlyAvailableNames?: string[];
          getContext?(): { bus: { emit(event: string, payload: unknown): void } };
        };
        const run = scene.runState;
        if (!run || !scene.getContext) return false;
        Object.assign(run, { status: outcome, timeMs: 83_420, level: 6, kills: 47, currency: 86 });
        scene.terminalSettlement = Object.freeze({
          ok: true,
          terminalApplied: true,
          runScrapBanked: 86,
          firstClear: outcome === 'won',
          bestTimeImproved: outcome === 'won',
          firstClearScrap: outcome === 'won' ? 35 : 0,
          persistentGrantIds: Object.freeze(outcome === 'won' ? ['part:standard-barrel:t1'] : []),
          achievementIdsCompleted: Object.freeze([]),
        });
        scene.completedAchievementNames = [];
        scene.completedAchievements = [];
        scene.newlyAvailableNames = outcome === 'won' ? ['Standard Barrel T1'] : [];
        scene.getContext().bus.emit(outcome === 'won' ? 'run:won' : 'run:lost', {});
        return true;
      },
      showMenu: (panel: string): boolean => {
        const scene = game.scene.getScene('MenuScene') as unknown as {
          controller?: { open(panel: string): unknown };
          render?(snapshot: unknown): void;
        };
        // A direct test seam must not mutate the read model while the prior
        // panel still owns the one scene-wide loader. Real navigation can
        // remain responsive; visual authority waits for a closed resource
        // generation before opening the next independently captured surface.
        if (!scene?.controller || !scene.render || !isMenuPresentationSettled()) return false;
        scene.render(scene.controller.open(panel));
        return true;
      },
      runPreparationDiagnostics: (): Record<string, unknown> => {
        const menu = game.scene.getScene('MenuScene') as unknown as {
          runLaunchState?: string; capturedLaunch?: { request: ComposedRunRequest; isTraining: boolean };
          preparedArenaLayout?: ResolvedArenaLayout;
        };
        return { active: game.scene.isActive('MenuScene'), state: menu.runLaunchState,
          request: menu.capturedLaunch?.request, isTraining: menu.capturedLaunch?.isTraining,
          layout: menu.preparedArenaLayout };
      },
      startRecordedRunTest: async (request: ComposedRunRequest, isTraining = false): Promise<boolean> => {
        if (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 0xffff_ffff || !isMenuPresentationSettled()) return false;
        const menu = game.scene.getScene('MenuScene') as unknown as {
          runLaunchState?: string;
          getContext(): GameContext; controller: { open(panel: string): unknown };
          render(snapshot: unknown): void;
          startRunWithResources(request: ComposedRunRequest, isTraining: boolean): Promise<void>;
        };
        const ctx = menu.getContext();
        if (!ctx.characters.characterById(request.characterId)) return false;
        if (request.kind === 'stage' ? !ctx.stages.stageById(request.stageId) || isTraining : !ctx.arenas.arenaById(request.arenaId) || !isTraining) return false;
        // Recorded fixture composition only; real serialized preparation,
        // immutable resource closure and logical intro commands still own entry.
        menu.render(menu.controller.open(isTraining ? 'training' : 'home'));
        await menu.startRunWithResources(Object.freeze({ ...request }), isTraining);
        return menu.runLaunchState !== 'failed';
      },
      startArenaTestRun: async (arenaId: string, seed: number): Promise<boolean> => {
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff || !isMenuPresentationSettled()) return false;
        const menu = game.scene.getScene('MenuScene') as unknown as {
          getContext(): GameContext;
          controller: { open(panel: string): unknown };
          render(snapshot: unknown): void;
          startRunWithResources(request: ComposedRunRequest, isTraining: boolean): Promise<void>;
        };
        const ctx = menu.getContext();
        if (!ctx.data.arenas.some(arena => arena.id === arenaId)) return false;
        // Exercise the real Training owner, serialized preparation and intro.
        menu.render(menu.controller.open('training'));
        await menu.startRunWithResources(Object.freeze({ kind: 'legacy-arena',
          characterId: ctx.selectedCharacterId, arenaId, seed }), true);
        return true;
      },
      arenaLayoutDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          resolvedArenaLayout?: ResolvedArenaLayout;
          arenaScenery?: ArenaWorldView;
          systems: unknown[];
          player?: { health: number; x: number; y: number; writePresentationBounds(bounds: Phaser.Geom.Rectangle): void };
          runState: RunState;
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
          physics: { world: { isPaused: boolean } };
        };
        const layout = scene.resolvedArenaLayout;
        if (!layout || !scene.arenaScenery || !scene.player) return undefined;
        const playerPresentationBounds = new Phaser.Geom.Rectangle();
        scene.player.writePresentationBounds(playerPresentationBounds);
        const hazard = scene.systems.find(system => system !== null && typeof system === 'object' && 'phaseVisuals' in system);
        const internals = hazard as unknown as { elapsedMs: number; phaseVisuals: Map<string, Phaser.GameObjects.TileSprite> } | undefined;
        const spawning = scene.systems.find(system => system !== null && typeof system === 'object' && 'enemyProjectiles' in system) as {
          enemyProjectiles: Array<{ active: boolean; x: number; y: number; traveled: number;
            body: { center: { x: number; y: number }; velocity: { x: number; y: number } } }>;
        } | undefined;
        return { layout, status: scene.runState.status, timeMs: scene.runState.timeMs,
          camera: { zoom: scene.cameras.main.zoom, worldView: {
            x: scene.cameras.main.worldView.x, y: scene.cameras.main.worldView.y,
            width: scene.cameras.main.worldView.width, height: scene.cameras.main.worldView.height } },
          player: { x: scene.player.x, y: scene.player.y, health: scene.player.health,
            presentationBounds: { x: playerPresentationBounds.x, y: playerPresentationBounds.y,
              width: playerPresentationBounds.width, height: playerPresentationBounds.height } },
          enemyProjectiles: spawning?.enemyProjectiles.filter(projectile => projectile.active).length ?? 0,
          projectileSimulation: { loopRunning: game.loop.running, physicsPaused: scene.physics.world.isPaused,
            visibility: document.visibilityState,
            active: spawning?.enemyProjectiles.flatMap((projectile, index) => projectile.active ? [{ index,
              x: projectile.x, y: projectile.y, traveled: projectile.traveled,
              centerX: projectile.body.center.x, centerY: projectile.body.center.y,
              velocityX: projectile.body.velocity.x, velocityY: projectile.body.velocity.y }] : []) ?? [] },
          bodies: scene.arenaScenery.obstacleGroup.getChildren().map(object => {
            const body = object.body as Phaser.Physics.Arcade.StaticBody;
            return { x: body.x, y: body.y, w: body.width, h: body.height };
          }),
          presentation: scene.arenaScenery.presentationInspection(),
          hazard: internals ? { elapsedMs: internals.elapsedMs,
            nodes: [...internals.phaseVisuals.entries()].map(([id, node]) => ({ id, x: node.x, y: node.y,
              width: node.width, height: node.height, alpha: node.alpha, tint: node.tintTopLeft,
              visible: node.visible, active: node.active })) } : undefined };
      },
      fireArenaTestShot: (x: number, y: number, targetX: number, targetY: number): boolean => {
        if (!game.scene.isActive('GameScene') || ![x, y, targetX, targetY].every(Number.isFinite)) return false;
        const scene = game.scene.getScene('GameScene') as unknown as {
          runState: RunState; getContext(): GameContext;
          player: { sprite: Phaser.GameObjects.Sprite & { body: Phaser.Physics.Arcade.Body } };
        };
        if (scene.runState.status !== 'active') return false;
        scene.player.sprite.body.reset(targetX, targetY); scene.player.sprite.setPosition(targetX, targetY);
        scene.getContext().bus.emit('enemy:ranged-shot', { enemyId: 'scrap-sniper', x, y,
          dirX: targetX - x, dirY: targetY - y, damage: 6 });
        return true;
      },
      stepArenaHazardTest: (dtMs: number, x: number, y: number): boolean => {
        if (game.loop.running || !Number.isFinite(dtMs) || dtMs < 0) return false;
        const scene = game.scene.getScene('GameScene') as unknown as {
          systems: HazardSystem[]; resolvedArenaLayout?: ResolvedArenaLayout;
          hudController?: { update(dtMs: number): void };
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
          player?: { bodyRadius: number; update(dtMs: number): void; sprite: Phaser.GameObjects.Sprite & { body: Phaser.Physics.Arcade.Body } };
        };
        const hazard = scene.systems.find(system => 'phaseVisuals' in system);
        const arena = scene.resolvedArenaLayout?.arena;
        if (!hazard || !arena || !scene.player || !Number.isFinite(x) || !Number.isFinite(y)
          || x < scene.player.bodyRadius || y < scene.player.bodyRadius
          || x > arena.size.width - scene.player.bodyRadius || y > arena.size.height - scene.player.bodyRadius) return false;
        // Advance the actual owner; never fabricate another phase clock or damage calculation.
        scene.player.sprite.body.reset(x, y); scene.player.sprite.setPosition(x, y);
        scene.cameras.main.centerOn(x, y);
        hazard.update(dtMs);
        // The hidden collision proxy and production actor view are separate.
        // Synchronize presentation at zero elapsed time after the real damage
        // command; otherwise a frozen capture retains the old actor position.
        scene.player.update(0);
        scene.hudController?.update(0);
        renderVisualFrame();
        return true;
      },
      showArenaTestOverview: (): boolean => {
        const scene = game.scene.getScene('GameScene') as unknown as {
          resolvedArenaLayout?: ResolvedArenaLayout; scale: { width: number; height: number };
          cameras: { main: Phaser.Cameras.Scene2D.Camera };
        };
        const layout = scene.resolvedArenaLayout;
        if (!layout || game.loop.running) return false;
        const camera = scene.cameras.main;
        // Evidence-only overview. Normal-camera captures are taken first.
        camera.stopFollow(); camera.removeBounds();
        camera.setZoom(Math.min(scene.scale.width / layout.arena.size.width, scene.scale.height / layout.arena.size.height));
        camera.centerOn(layout.arena.size.width / 2, layout.arena.size.height / 2);
        camera.preRender();
        renderVisualFrame();
        return true;
      },
      startPerformanceTraining: async (seed: number): Promise<boolean> => {
        if (!performanceProbe || !Number.isSafeInteger(seed) || !isMenuPresentationSettled()) return false;
        const menu = game.scene.getScene('MenuScene') as unknown as {
          getContext(): GameContext;
          startRunWithResources(request: ComposedRunRequest, isTraining: boolean): Promise<void>;
        };
        const context = menu.getContext();
        await menu.startRunWithResources(Object.freeze({ kind: 'legacy-arena',
          characterId: context.selectedCharacterId, arenaId: context.selectedArenaId, seed }), true);
        return true;
      },
      preparePerformanceCombat: (seed: number, count: number): boolean => {
        if (!performanceProbe) return false;
        const scene = game.scene.getScene('GameScene') as unknown as { preparePerformanceFixture?(seed: number, count: number): boolean };
        return scene.preparePerformanceFixture?.(seed, count) === true;
      },
    }),
  });
}
// The DOM-owned guard remains reliable even when the fitted canvas cannot lay
// out its authored portrait UI on a phone rotated into landscape.
const portraitOrientationGuard = installPortraitOrientationGuard();
game.events.once(Phaser.Core.Events.DESTROY, portraitOrientationGuard.dispose);
// Install #164 diagnostic trace ring buffer (development only)
if (import.meta.env.DEV) installDiagnostics();
// P1: the gesture gate consults the PRODUCTION isGestureActive lambda — a
// scene without an inputController (e.g. the always-active BootScene) must
// not read as an active gesture, or scale.refresh() would never run and the
// refresh arming would re-arm into a per-frame rAF loop.
const disposeVisualViewport = bindVisualViewportRefresh(game, () => game.scene.getScenes(true).some(isGestureActive));
game.events.once(Phaser.Core.Events.DESTROY, disposeVisualViewport);
