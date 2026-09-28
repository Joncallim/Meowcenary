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

// Exported as a narrow ESM browser lifecycle/smoke seam. Upgrade selection now
// uses the visible chooser; gameplay ownership remains in scenes and systems.
export const game = new Phaser.Game(config);
// Screenshot acceptance gets a dedicated build-time seam. Vite eliminates
// this entire branch from ordinary production builds; the query alone can
// never expose mutable scene internals in a deployed game.
if (import.meta.env.VITE_VISUAL_TEST === '1'
    && new URLSearchParams(globalThis.location?.search ?? '').get('visual-test') === '1') {
  let focusedActorWorldPoint: { x: number; y: number } | undefined;
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
      isMenuPresentationSettled: (): boolean => {
        const scene = game.scene.getScene('MenuScene') as unknown as {
          panelArtLoading?: boolean;
          mercenaryArtLoading?: boolean;
          achievementArtLoading?: boolean;
          equipmentArtLoading?: boolean;
          gunsmithArtLoading?: boolean;
          pendingPanelArtIds?: { size: number };
          pendingPanelArtRepaints?: { size: number };
        };
        return Boolean(scene)
          && !scene.panelArtLoading
          && !scene.mercenaryArtLoading
          && !scene.achievementArtLoading
          && !scene.equipmentArtLoading
          && !scene.gunsmithArtLoading
          && (scene.pendingPanelArtIds?.size ?? 0) === 0
          && (scene.pendingPanelArtRepaints?.size ?? 0) === 0;
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
        if (!scene?.controller || !scene.render) return false;
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
