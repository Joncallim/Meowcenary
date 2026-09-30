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
  await Promise.all([
    globalThis.document.fonts.load('400 16px "Nunito"'),
    globalThis.document.fonts.load('600 16px "Nunito"'),
    globalThis.document.fonts.load('700 16px "Nunito"'),
    globalThis.document.fonts.load('800 16px "Nunito"'),
  ]);
}

// Exported as a narrow ESM browser lifecycle/smoke seam. Upgrade selection now
// uses the visible chooser; gameplay ownership remains in scenes and systems.
export const game = new Phaser.Game(config);
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
    };
    return Boolean(scene)
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
    };
    return {
      active: game.scene.isActive('MenuScene'),
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
  const freezeVisualFrame = async (): Promise<void> => {
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
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    game.loop.sleep();
  };
  Object.defineProperty(globalThis, '__MEOWCENARY_VISUAL_TEST__', {
    configurable: true,
    value: Object.freeze({
      freeze: freezeVisualFrame,
      resume: () => {
        game.anims.resumeAll();
        game.loop.wake();
      },
      isSceneActive: (key: string): boolean => game.scene.isActive(key),
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
          player?: { sprite: Phaser.GameObjects.GameObject & { x: number; y: number; body?: Phaser.Physics.Arcade.Body } };
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
          player: {
            x: player.sprite.x,
            y: player.sprite.y,
            bodyRadius: Math.max(player.sprite.body?.halfWidth ?? 0, player.sprite.body?.halfHeight ?? 0),
          },
          hudLayers,
          safeArea: {
            top: styles.getPropertyValue('--safe-top'), right: styles.getPropertyValue('--safe-right'),
            bottom: styles.getPropertyValue('--safe-bottom'), left: styles.getPropertyValue('--safe-left'),
          },
          fullscreen: document.fullscreenElement?.id,
        });
      },
      isMenuPresentationSettled,
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
