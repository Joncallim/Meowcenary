import Phaser from 'phaser';
import { RuntimeConfig } from './engine/config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import './styles.css';
import { physicsDebugEnabled } from './systems/debug';
import { installDiagnostics } from './engine/diagnostics';
import { bindVisualViewportRefresh, isGestureActive } from './platform/visualViewport';
import { installPortraitOrientationGuard } from './platform/orientation';
import { responsiveScaleConfig } from './platform/gameScale';
import { performanceProbe } from './platform/performanceProbe';
import { collectDisplayObjects, type DisplayNode } from './platform/performanceDisplay';
import type { GameContext } from './engine/context';
import type { ComposedRunRequest } from './gameplay/runRequest';
import { responsiveArenaPresentationBounds } from './gameplay/responsiveArenaPresentation';

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
  // Tests wait for the logical input owner, rather than a generic animation
  // frame, to confirm that a released keyboard key has been polled neutral.
  const isMenuInputNeutral = (): boolean => {
    const scene = game.scene.getScene('MenuScene') as unknown as {
      inputController?: { core?: { isNeutral?(): boolean } };
    };
    return !game.scene.isActive('MenuScene') || scene.inputController?.core?.isNeutral?.() === true;
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
            setCurrentFrame?(frame: unknown): void;
          };
        };
        const firstFrame = animated.anims?.currentAnim?.frames?.[0];
        if (firstFrame) animated.anims?.setCurrentFrame?.(firstFrame);
      }
    }
    game.anims.pauseAll();
  };
  const freezeVisualFrame = async (): Promise<void> => {
    pauseVisualAnimations();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    game.loop.sleep();
  };
  Object.defineProperty(globalThis, '__MEOWCENARY_VISUAL_TEST__', {
    configurable: true,
    value: Object.freeze({
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
      menuLoadoutDiagnostics: (): Record<string, unknown> | undefined => {
        const scene = game.scene.getScene('MenuScene') as unknown as {
          loadoutUiDiagnostics?(): Record<string, unknown>;
        };
        return scene?.loadoutUiDiagnostics?.();
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
          abilityPresentationSystem?: { update(deltaMs: number, reducedMotion: boolean): void };
          getContext?(): { bus: { emit(event: 'ability:activated', payload: {
            abilityId: string; cue: string; x: number; y: number;
            durationMs: number; color: string; radius: number;
          }): void } };
        };
        if (!scene.player || !scene.abilityPresentationSystem || !scene.getContext) return false;
        scene.getContext().bus.emit('ability:activated', {
          abilityId: 'ability:visual-test', cue: 'shockwave',
          x: scene.player.x, y: scene.player.y,
          durationMs: 280, color: '#facc15', radius: 90,
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
