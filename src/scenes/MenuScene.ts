import Phaser from 'phaser';
import { getGameContext, type GameContext } from '../engine/context';
import type { EventBus } from '../engine/eventBus';

import { SceneKey } from '../engine/sceneKeys';
import { AudioManager, getAudioManager } from '../systems/audio';
import { edgeMargin, responsiveContentInsets, responsiveUiViewport, minimumHitTarget, type UiViewport } from '../ui/layout';
import { MainMenuController, type MainMenuSnapshot } from '../ui/menus';
import { cycleVolumeStep } from '../ui/settings';
import { ThemeColor, ThemeDepth, ThemeFont } from '../ui/theme';
import { createUiText } from '../ui/text';
import { InputController } from '../systems/input';
import { FocusNavigator, type FocusDirection } from '../ui/focusList';
import { FocusStroke } from '../ui/theme';
import { ScrollableFocusRegion } from '../ui/scrollableFocus';
import { assembleComposedRunRequest, assembleRunRequest, asLegacyComposedRunRequest, type ComposedRunRequest } from '../gameplay/runRequest';
import { resolveRunPlan } from '../gameplay/stage/stageContracts';
import { loadAudioResources, resolveAudioResources } from '../systems/audioResources';
import { loadTextureResources, prepareRunPresentation, resolveRunPhysicalResources, type ResourceLoadProgress, type ResourceLoadResult } from '../systems/resourceLoader';
import { DataVisualArtRegistry, DataVisualResourceRegistry, ensureVisualAnimations, resolveAchievementIconBinding, visualAnimationKey } from '../systems/visualArt';
import { isPortraitOrientationBlocked } from '../platform/orientation';
import { createUiVisualChrome, type UiVisualChrome } from '../ui/visualChrome';
import { LoadoutSurface } from '../ui/menuSurfaces/loadoutSurface';
import { EquipmentSurface } from '../ui/menuSurfaces/equipmentSurface';
import { GunsmithSurface } from '../ui/menuSurfaces/gunsmithSurface';
import { loadoutFooterPadding } from '../ui/menuSurfaces/layout';
import type { LoadoutMenuPanel, MenuPanelSurface, MenuSurfaceEnvironment } from '../ui/menuSurfaces/surface';
import { performanceProbe } from '../platform/performanceProbe';
import { collectDisplayObjects, displayObjectChange, type DisplayNode } from '../platform/performanceDisplay';

const MENU_DEPTH = ThemeDepth.pauseSummary;
const EMPTY_RESOURCE_LOAD_RESULT: ResourceLoadResult = Object.freeze({
  loaded: Object.freeze([]),
  failed: Object.freeze([]),
});
/** 44 physical px at the smallest promised FIT (844×390 → 0.462085). */
const MIN_MENU_BUTTON_LOGICAL_WIDTH = 44 / 0.462085;
/** Home is an above-the-fold launch card, not the complete Contract roster. */
const HOME_THREAT_PREVIEW_LIMIT = 4;

/** The two audible command events a menu button can produce. */
type MenuAudioEvent = 'ui:confirm' | 'ui:back';

export class MenuScene extends Phaser.Scene {
  private controller?: MainMenuController;
  private root?: Phaser.GameObjects.Container;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusKeyByButton = new Map<Phaser.GameObjects.Text, string>();
  private nextFocusKey?: string;
  private nextFocusAlignTop = false;
  private equipmentSlotColumns = 2;
  private loadoutSurface = false;
  private panelSurfaces: Partial<Record<LoadoutMenuPanel, MenuPanelSurface>> = {};
  private activeSurface?: MenuPanelSurface;
  /** Buttons which remain readable/focusable for their lock explanation but
   * must never regain pointer or logical activation when scrolling changes
   * viewport visibility. */
  private disabledFocusables = new Set<Phaser.GameObjects.Text>();
  private focusRings: Array<Phaser.GameObjects.GameObject & {
    x: number;
    y: number;
    setAlpha?(alpha: number): unknown;
    setScrollFactor?(factor: number): unknown;
    setStrokeStyle?(width: number, color: number, alpha: number): unknown;
    setVisible?(visible: boolean): unknown;
  }> = [];
  private navigator = new FocusNavigator('linear');
  /** A modal-like command created during a same-panel rebuild may claim focus
   * only after the rebuilt navigator has received its new item count. */
  private focusIndexAfterRender?: number;
  /** Rendered, not merely desired, Achievement grid width. The navigator
   * must be rebuilt when rotation changes this value. */
  private achievementGridColumns?: number;
  /** The one production owner for any list which can outgrow the safe UI
   * viewport.  `navigator` remains the scene-wide command list (it also owns
   * fixed Back controls); this region owns scrolling, visibility and the
   * contiguous list segment's focus. */
  private scrollRegion?: ScrollableFocusRegion;
  private collectingScrollItems = false;
  private scrollItemIndexes = new Set<number>();
  /** Maps scene-wide focus indexes (which include fixed controls) to the
   * region's contiguous local indexes. */
  private scrollLocalIndexByFocusIndex = new Map<number, number>();
  private scrollItemBounds = new Map<number, { top: number; bottom: number }>();
  private scrollObjects: Array<{
    object: Phaser.GameObjects.GameObject;
    x: number;
    y: number;
    /** Decorations inherit their owning row's shared viewport visibility. */
    ownerIndex?: number;
  }> = [];
  private scrollViewportTop = 0;
  private scrollViewportBottom = 0;
  private scrollMaskGraphics?: Phaser.GameObjects.Graphics;
  private scrollMask?: Phaser.Display.Masks.GeometryMask;
  private scrollMaskContainer?: Phaser.GameObjects.Container;
  private scrollTrack?: Phaser.GameObjects.GameObject;
  private scrollThumb?: Phaser.GameObjects.GameObject & { setPosition?(x: number, y: number): unknown };
  private scrollThumbHeight = 0;
  private hoveredIndex = -1;
  private committedPanel?: MainMenuSnapshot['panel'];
  /** Explicit committed-display gate, retained separately from the root
   *  reference: false before teardown, true only after a render publishes a
   *  usable focus target list. The fallback root carries no focus targets, so
   *  a failed same-panel rebuild must not let nav/activate act on the
   *  retained navigator (round-2 finding F1). */
  private committedDisplay = false;
  private hint?: Phaser.GameObjects.Text;
  private lastInputMode: import('../systems/input').InputMode = 'pointer';
  private bus?: EventBus;
  private audioManager?: AudioManager;
  private inputController?: InputController;
  private audioUnlockUnsub?: () => void;
  private rebuildCount = 0;
  private renderRevision = 0;
  private safeCenterX = 0;
  private safeRightMargin = 16;
  private currentViewport?: UiViewport;
  private touchScrollY?: number;
  private touchDragDistance = 0;
  private touchDidScroll = false;
  private achievementArtLoading = false;
  private mercenaryArtLoading = false;
  private equipmentArtLoading = false;
  private readonly pendingEquipmentArtIds = new Set<string>();
  private gunsmithArtLoading = false;
  private readonly pendingGunsmithArtIds = new Set<string>();
  private gunsmithArtGeneration = 0;
  private panelArtLoading = false;
  private panelArtInFlight?: Promise<void>;
  /** Phaser has one LoaderPlugin per scene. Every menu/run presentation
   * closure enters this tail so rapid panel changes cannot overlap queues. */
  private menuTextureLoadTail: Promise<void> = Promise.resolve();
  /** Queued or active work in the current scene generation. The visual-test
   * seam observes this count instead of trying to inspect Promise state. */
  private menuTextureLoadPending = 0;
  /** Detaches reused scenes from loader promises whose completion event was
   * cancelled when the prior scene generation shut down. */
  private menuTextureLoadGeneration = 0;
  private readonly pendingPanelArtIds = new Set<string>();
  private readonly pendingPanelArtRepaints = new Set<MainMenuSnapshot['panel']>();
  private panelArtGeneration = 0;
  /** Scene-lifetime physical binding resolver. Career can render a large
   * gallery repeatedly, so per-badge catalog cloning/validation is invalid. */
  private visualArt?: DataVisualArtRegistry;
  private uiVisuals?: UiVisualChrome;
  private buttonChrome: Array<Phaser.GameObjects.GameObject | undefined> = [];
  private sectionButtons = new WeakSet<Phaser.GameObjects.Text>();
  /** A run never starts against the boot bundle alone. This state remains in
   * Menu so a load failure has a usable Retry/Back surface rather than a
   * partially constructed GameScene. */
  private runLaunchState: 'idle' | 'loading' | 'failed' = 'idle';
  private runLaunchProgress?: ResourceLoadProgress;
  private runLaunchProgressText?: Phaser.GameObjects.Text;
  private runLaunchProgressLabel = 'Loading';
  private runLaunchPresentation?: { readonly heading: string; readonly subject: string; readonly mercenary: string };
  private runLaunchGeneration = 0;
  private isLive = false;
  /** Number of committed render attempts; resize tests assert one per event. */
  get renderRebuildCount(): number {
    return this.rebuildCount;
  }

  /** Presentation revisions include local updates; rebuilds remain separate. */
  get renderRevisionCount(): number { return this.renderRevision; }

  /** Cheap observation of the committed shared focus owner; no read-model derivation. */
  get focusedButtonKey(): string | undefined {
    if (!this.committedDisplay) return undefined;
    return this.focusKeyByButton.get(this.focusables[this.navigator.index]!);
  }

  /** Read-only browser acceptance seam: observes production focus, geometry
   * and presentation state without invoking commands. Derived read models
   * are resolved at most once per observation and remain lazy off-panel. */
  loadoutUiDiagnostics() {
    const snapshot = this.controller?.snapshot();
    const equipment = snapshot && (snapshot.panel === 'equipment' || snapshot.panel === 'loadout')
      ? snapshot.equipment : undefined;
    const collectCopy = (object: Phaser.GameObjects.GameObject): string[] => {
      const display = object as Phaser.GameObjects.GameObject & {
        text?: unknown; list?: readonly Phaser.GameObjects.GameObject[];
      };
      return typeof display.text === 'string' ? [display.text] : (display.list ?? []).flatMap(collectCopy);
    };
    return {
      panel: this.committedPanel,
      focusedKey: this.focusKeyByButton.get(this.focusables[this.navigator.index]!),
      copy: (this.root?.list ?? []).flatMap(collectCopy),
      buttons: this.focusables.map((button, index) => {
        const bounds = button.getBounds();
        return { key: this.focusKeyByButton.get(button) ?? (button.text === 'Back' ? 'back' : undefined),
          text: button.text, focused: index === this.navigator.index, visible: button.visible,
          interactive: button.input?.enabled === true,
          textInsets: { top: button.padding.top, bottom: button.padding.bottom },
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
      }),
      scroll: this.scrollRegion ? { top: this.scrollViewportTop, bottom: this.scrollViewportBottom,
        offset: this.scrollRegion.scrollOffset, contentHeight: this.scrollRegion.contentHeight } : undefined,
      equipment: equipment ? {
        selectedSlot: equipment.selectedSlot,
        selectedInstanceId: equipment.selectedInstanceId,
        selectedBlueprintId: equipment.selectedBlueprintId,
        equipped: equipment.equipped,
      } : undefined,
    };
  }

  constructor() {
    super(SceneKey.Menu);
  }

  create(data?: { readonly initialPanel?: import('../ui/menus').MenuPanel; readonly replayRequest?: ComposedRunRequest; readonly isTraining?: boolean }): void {
    // Phaser reuses this Scene instance after Game. Loading is transient and
    // must never leave a newly activated Menu permanently inert.
    this.resetMenuTextureLoadQueue();
    this.runLaunchState = 'idle';
    this.runLaunchProgress = undefined;
    this.runLaunchPresentation = undefined;
    this.gunsmithArtGeneration += 1;
    this.gunsmithArtLoading = false;
    this.mercenaryArtLoading = false;
    this.equipmentArtLoading = false;
    this.pendingEquipmentArtIds.clear();
    this.achievementArtLoading = false;
    this.pendingGunsmithArtIds.clear();
    this.panelArtGeneration += 1;
    this.panelArtLoading = false;
    this.panelArtInFlight = undefined;
    this.pendingPanelArtIds.clear();
    this.pendingPanelArtRepaints.clear();
    this.isLive = true;
    this.destroyScrollMask();
    this.disposePanelSurfaces();
    const ctx = this.getContext();
    this.visualArt = new DataVisualArtRegistry(ctx.data);
    this.uiVisuals = createUiVisualChrome(this.visualArt);
    this.bus = ctx.bus;
    this.controller = new MainMenuController(ctx);

    this.inputController = new InputController(this);
    this.inputController.onAction('back', () => this.handleBack());
    this.inputController.onAction('navUp', () => this.handleNavMove(-1));
    this.inputController.onAction('navDown', () => this.handleNavMove(1));
    this.inputController.onAction('navLeft', () => this.handleNavMove('left'));
    this.inputController.onAction('navRight', () => this.handleNavMove('right'));
    this.inputController.onAction('confirm', () => this.handleActivate());
    this.input.on('wheel', this.handleWheel, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);

    this.render(data?.initialPanel && data.initialPanel !== 'home'
      ? this.controller.open(data.initialPanel)
      : this.controller.snapshot());
    if (data?.replayRequest) void this.startRunWithResources(data.replayRequest, data.isTraining === true);

    // FIT changes the physical-to-logical hit-target conversion. Rebuild the
    // committed panel from the real scale event so every live target is sized
    // for the new display; render() preserves/clamps same-panel focus.
    this.scale.on?.(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    // A missing audio registry entry is tolerated; the scene stays
    // functional and silent.
    this.audioManager = this.getAudioManager();
    this.audioManager?.playMusic('music-menu');
    this.installAudioUnlockListeners();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  update(_time: number, delta: number): void {
    if (isPortraitOrientationBlocked()) {
      this.inputController?.quarantineUntilNeutral();
      this.inputController?.update(delta);
      return;
    }
    this.inputController?.update(delta);
    this.refreshInputPresentation();
    this.audioManager?.update(delta);
  }

  private render(snapshot: MainMenuSnapshot, reason?: 'viewport-resize' | 'lazy-art-hydration'): void {
    const before = performanceProbe ? collectDisplayObjects(this.children.list as unknown as readonly DisplayNode[]) : undefined;
    const started = performanceProbe?.now();
    const previousPanel = this.committedPanel;
    const renderReason = reason ?? (this.committedPanel === undefined ? 'initial-mount'
      : this.committedPanel === snapshot.panel ? 'same-panel-state-mutation' : 'panel-transition');
    try {
    this.rebuildCount += 1;
    this.renderRevision += 1;
    const panelChanged = this.committedPanel !== undefined && this.committedPanel !== snapshot.panel;
    const achievementGridColumns = snapshot.panel === 'achievements'
      ? (this.scale.width >= 760 ? 3 : 1)
      : undefined;
    const preserveFocusIndex = this.navigator.index;
    const preserveFocusKey = this.nextFocusKey ?? (!panelChanged ? this.focusKeyByButton.get(this.focusables[preserveFocusIndex]!) : undefined);
    const focusedViewportY = this.scrollItemBounds.get(preserveFocusIndex)?.top;
    const retainedFocusY = focusedViewportY === undefined ? undefined : focusedViewportY - (this.scrollRegion?.scrollOffset ?? 0);
    const alignFocusedStart = this.nextFocusAlignTop;
    this.nextFocusKey = undefined;
    this.nextFocusAlignTop = false;
    const preserveFocusAfterGridRebuild = !panelChanged
      && this.committedPanel !== undefined
      && achievementGridColumns !== this.achievementGridColumns;
    // The gallery is genuinely spatial, not a visual-only two-column list.
    // Rebuild its navigator when the rendered card column count changes;
    // every other panel retains the existing cyclic linear focus contract.
    if (panelChanged || this.committedPanel === undefined
      || achievementGridColumns !== this.achievementGridColumns) {
      this.navigator = snapshot.panel === 'achievements'
        ? new FocusNavigator('grid', achievementGridColumns!)
        : new FocusNavigator('linear');
    }
    this.achievementGridColumns = achievementGridColumns;
    // The display is uncommitted from the moment teardown begins until a
    // successful publication below (F1 committed-display gate).
    this.committedDisplay = false;
    this.destroyScrollMask();
    this.runLaunchProgressText = undefined;
    this.unmountPanelSurface();
    this.root?.destroy(true);
    this.root = undefined;
    this.focusables = [];
    this.focusKeyByButton.clear();
    this.disabledFocusables.clear();
    this.focusRings = [];
    this.buttonChrome = [];
    this.scrollRegion = undefined;
    this.collectingScrollItems = false;
    this.scrollItemIndexes.clear();
    this.scrollLocalIndexByFocusIndex.clear();
    this.scrollObjects = [];
    this.scrollItemBounds.clear();
    this.scrollTrack = undefined;
    this.scrollThumb = undefined;
    this.scrollThumbHeight = 0;
    this.hoveredIndex = -1;
    this.focusIndexAfterRender = undefined;
    this.hint = undefined;

    const root = this.add.container(0, 0);
    root.setDepth(MENU_DEPTH).setScrollFactor(0);

    this.own(root, this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      ThemeColor.background,
    ).setScrollFactor(0));

    const selectedBackdropArtId = snapshot.stage.stages.find((stage) => stage.selected)?.menuBackdropArtId
      ?? 'brand:menu-backdrop';
    const selectedBackdropBinding = this.uiVisuals?.binding(selectedBackdropArtId);
    const fallbackBackdropBinding = this.uiVisuals?.binding('brand:menu-backdrop');
    const backdropBinding = selectedBackdropBinding
      && this.textures?.exists?.(selectedBackdropBinding.textureKey)
      ? selectedBackdropBinding
      : fallbackBackdropBinding;
    if (backdropBinding && this.textures?.exists?.(backdropBinding.textureKey) && this.add.image) {
      const backdrop = this.own(root, this.add.image(
        this.scale.width / 2,
        this.scale.height / 2,
        backdropBinding.textureKey,
        backdropBinding.frameKey,
      ).setAlpha(0.48).setScrollFactor(0));
      const coverScale = Math.max(this.scale.width / backdrop.width, this.scale.height / backdrop.height);
      backdrop.setScale(coverScale);
    }

    this.loadoutSurface = snapshot.panel === 'loadout' || snapshot.panel === 'equipment';
    const width = this.scale.width;
    const viewport: UiViewport = responsiveUiViewport(this.scale.width, this.scale.height);
    this.currentViewport = viewport;
    const contentInsets = responsiveContentInsets(
      width,
      edgeMargin(viewport, 'left', this.loadoutSurface ? 16 : 12),
      edgeMargin(viewport, 'right', this.loadoutSurface ? 16 : 12),
      840,
    );
    const leftMargin = contentInsets.left;
    const topMargin = edgeMargin(viewport, 'top');
    this.safeRightMargin = contentInsets.right;
    this.safeCenterX = (leftMargin + width - this.safeRightMargin) / 2;
    const margin = leftMargin;
    const hitTarget = minimumHitTarget(viewport);

    if (this.loadoutSurface) {
      this.own(root, this.add.rectangle(width / 2, this.scale.height / 2, width, this.scale.height, 0x090e12));
      this.own(root, this.add.rectangle(width / 2, topMargin + 17, width, 58, 0x111d24));
    }
    try {
      const title = this.own(root, createUiText(this,this.safeCenterX, 28 + topMargin, 'Meowcenary', {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: ThemeFont.family,
        fontSize: `${ThemeFont.headingMin}px`,
        fontStyle: '700',
      }));
      title.setOrigin(0.5).setScrollFactor(0);
      title.setAlpha?.(0);
      const lockupBinding = this.uiVisuals?.binding('brand:title-lockup');
      if (!this.loadoutSurface && lockupBinding && this.textures?.exists?.(lockupBinding.textureKey) && typeof this.add.image === 'function') {
        const lockup = this.own(root, this.add.image(
          this.safeCenterX,
          title.y,
          lockupBinding.textureKey,
          lockupBinding.frameKey,
        ).setScrollFactor(0));
        const lockupWidth = Math.min(240, Math.max(168, width - leftMargin - this.safeRightMargin - 24));
        lockup.setDisplaySize(lockupWidth, lockupWidth * lockupBinding.display.height / lockupBinding.display.width);
      }

      if (snapshot.notice) {
        const notice = this.own(root, createUiText(this,this.safeCenterX, 58 + topMargin, snapshot.notice, {
          align: 'center',
          color: '#f87171',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - leftMargin - this.safeRightMargin },
        }));
        notice.setOrigin(0.5, 0).setScrollFactor(0);
      }

      const contentTop = this.loadoutSurface
        ? (snapshot.notice ? 96 : 58) + topMargin - 12
        : (snapshot.notice ? 96 : 76) + topMargin;
      const contentPanel = this.loadoutSurface ? undefined : this.uiVisuals?.addPanel(
        this,
        this.safeCenterX,
        contentTop + (this.scale.height - contentTop - edgeMargin(viewport, 'bottom')) / 2,
        Math.max(120, width - leftMargin - this.safeRightMargin),
        Math.max(80, this.scale.height - contentTop - edgeMargin(viewport, 'bottom')),
        'panel',
        { alpha: 0.86 },
      );
      if (contentPanel) this.own(root, contentPanel);

      switch (snapshot.panel) {
        case 'home':
          this.renderHome(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'character':
          this.renderCharacter(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'arena':
          this.renderArena(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'stage':
          this.renderStage(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'loadout':
          this.presentPanelSurface(root, snapshot, contentTop, margin, hitTarget);
          break;
        case 'career':
          this.renderCareer(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'next-goals':
          this.renderNextGoals(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'achievements':
          this.renderAchievements(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'compendium':
          this.renderCompendium(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'training':
          this.renderTraining(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'gunsmith':
          this.presentPanelSurface(root, snapshot, contentTop, margin, hitTarget);
          break;
        case 'equipment':
          this.presentPanelSurface(root, snapshot, contentTop, margin, hitTarget);
          break;
        // progression panel retired in V4

        case 'settings':
          this.renderSettings(root, snapshot, width, contentTop, margin, hitTarget);
          break;

        default:
          break;
      }
      if (this.runLaunchState === 'loading') this.renderLaunchModal(root, width, hitTarget);

      this.navigator.setCount(this.focusables.length);
      // A new FocusNavigator has no count until the rebuilt card grid has
      // published its focusables; only then can its prior index be clamped.
      if (preserveFocusAfterGridRebuild) this.navigator.setIndex(preserveFocusIndex);
      if (panelChanged) this.navigator.reset();
      if (preserveFocusKey) {
        const semanticIndex = this.focusables.findIndex((button) => this.focusKeyByButton.get(button) === preserveFocusKey);
        const fallbackIndex = snapshot.panel === 'equipment'
          ? this.focusables.findIndex((button) => this.focusKeyByButton.get(button) === `equipment-slot:${snapshot.equipment.selectedSlot}`) : -1;
        if (semanticIndex >= 0 || fallbackIndex >= 0) this.navigator.setIndex(semanticIndex >= 0 ? semanticIndex : fallbackIndex);
      }
      if (this.focusIndexAfterRender !== undefined) this.navigator.setIndex(this.focusIndexAfterRender);
      this.finishScrollableRegion(this.panelContentRoot ?? root);
      const rebuiltRegion = this.scrollRegion as ScrollableFocusRegion | undefined;
      if (preserveFocusKey && this.focusKeyByButton.get(this.focusables[this.navigator.index]!) === preserveFocusKey) {
        const nextBounds = this.scrollItemBounds.get(this.navigator.index);
        if (nextBounds && rebuiltRegion && (alignFocusedStart || (!panelChanged && retainedFocusY !== undefined))) {
          rebuiltRegion.setScrollOffset(nextBounds.top - (alignFocusedStart ? this.scrollViewportTop : retainedFocusY!));
          this.applyScrollViewport();
        }
      }
      this.applyFocus();

      // The root is only published once the display tree is fully built and
      // focused, so a failed render leaves the menu without a published root
      // and the next render can retry from a clean slate.
      this.root = root;
      this.committedPanel = snapshot.panel;
      this.committedDisplay = true;
      if (selectedBackdropArtId !== 'brand:menu-backdrop') {
        void this.ensurePanelPresentation(snapshot.panel, [selectedBackdropArtId]);
      }
    } catch (error) {
      this.destroyScrollMask();
      this.runLaunchProgressText = undefined;
      this.unmountPanelSurface();
      root.destroy(true);
      this.focusables = [];
      this.focusRings = [];
      // The hint was assigned during the failed build and points into the
      // destroyed root; clear it so the next mode transition can't setText()
      // on destroyed Text (round-6 adversarial finding).
      this.hint = undefined;
      // The menu is the whole scene: always leave a visible recovery hint so
      // a failed render never results in a blank screen. Esc retries through
      // handleBack -> render.
      this.renderFallback();
      throw error;
    }
    } finally {
      if (started !== undefined && before) {
        const ended = performanceProbe!.now();
        const after = collectDisplayObjects(this.children.list as unknown as readonly DisplayNode[]);
        performanceProbe!.record('menu.render', started, {
          panel: snapshot.panel, fromPanel: previousPanel ?? '(none)', reason: renderReason, rebuildCount: this.rebuildCount, revision: this.renderRevision,
          ...displayObjectChange(before, after), textures: this.textures.getTextureKeys().length,
          committed: this.committedDisplay,
        }, ended);
      }
    }
  }

  /** Last-resort display when a render fails. Best effort — if even this
   *  fails the scene stays empty rather than throwing a second error. */
  private renderFallback(): void {
    try {
      const fallback = this.add.container(0, 0);
      const own = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        fallback.add(object);
        return object;
      };
      fallback.setDepth(MENU_DEPTH).setScrollFactor(0);
      own(
        createUiText(this,
          this.safeCenterX,
          this.scale.height / 2,
          'Something went wrong — press Esc to retry',
          {
            align: 'center',
            color: '#f87171',
            fontFamily: ThemeFont.family,
            fontSize: `${ThemeFont.bodyMin}px`,
            wordWrap: { width: Math.max(1, this.scale.width - 32) },
          },
        ),
      ).setOrigin(0.5).setScrollFactor(0);
      this.root = fallback;
    } catch {
      this.root = undefined;
    }
  }

  private renderHome(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const selectedCharacter = snapshot.character.characters.find((c) => c.selected);
    const frontier = snapshot.stage.frontier;
    const selectedStage = snapshot.stage.stages.find((s) => s.id === frontier.stageId)
      ?? snapshot.stage.stages.find((s) => s.selected);
    const campaignComplete = frontier.kind === 'campaign-complete';
    const compactLandscape = this.scale.height < 500 && width >= 700;
    const threatPreview = selectedStage?.threats.slice(0, HOME_THREAT_PREVIEW_LIMIT) ?? [];
    const heroWidth = Math.max(1, width - margin - this.safeRightMargin - 82);
    let heroY = top + 4;
    const addHeroLine = (copy: string, color: string, fontSize: number, style?: string): Phaser.GameObjects.Text => {
      const line = this.own(root, createUiText(this, margin + 10, heroY, copy, {
        color, fontFamily: ThemeFont.family, fontSize: `${fontSize}px`,
        ...(style ? { fontStyle: style } : {}),
        wordWrap: { width: heroWidth - 10 },
      }));
      line.setScrollFactor(0);
      heroY += line.height + 1;
      return line;
    };
    if (!compactLandscape) {
      addHeroLine(`${selectedCharacter?.name ?? snapshot.character.selectedCharacterId}  •  ${this.getContext().saveData.progression.scrap} Scrap`, '#a5f3fc', ThemeFont.bodyMin);
    }
    addHeroLine(`${campaignComplete ? 'CAMPAIGN COMPLETE — REPLAY' : selectedStage?.completed ? 'REPLAY CONTRACT' : 'NEXT CONTRACT'}  •  ${selectedStage?.chapterName ?? ''} ${selectedStage?.displayOrder ?? ''}${compactLandscape ? `  •  ${selectedStage?.name ?? snapshot.stage.selectedStageId}` : ''}`, '#fbbf24', ThemeFont.labelMin, '700');
    if (!compactLandscape) addHeroLine(selectedStage?.name ?? snapshot.stage.selectedStageId, '#f7f1d5', ThemeFont.headingMin, '700');
    addHeroLine(`${selectedStage?.locationName ?? ''}  •  ${selectedStage?.objective.copy ?? ''}`, '#d6f7ff', ThemeFont.bodyMin);
    if (threatPreview.length > 0) {
      const iconSize = compactLandscape ? 28 : this.scale.height <= 680 ? 26 : 34;
      this.addThreatIconStrip(root, threatPreview, margin + 10, heroY, heroWidth - 10, iconSize, 8);
      heroY += iconSize + 3;
    }
    addHeroLine(selectedStage?.completed
      ? `BEST  ${formatDuration(selectedStage.bestTimeMs)}`
      : `FIRST CLEAR  ${selectedStage?.reward.headline ?? ''}`, '#86efac', ThemeFont.bodyMin, '700');

    const buttons: ReadonlyArray<{ readonly label: string; readonly artId: string; readonly action: () => void }> = [
      {
        label: this.runLaunchState === 'failed' ? 'Retry Loading Contract' : selectedStage?.completed ? 'Replay Contract' : 'Play Contract',
        artId: 'nav-icon:play-contract',
        action: () => { void this.startContractWithResources(); },
      },
      { label: 'Change Contract', artId: 'nav-icon:change-contract', action: () => this.render(this.requireController().open('stage')) },
      { label: 'Mercenary', artId: 'nav-icon:mercenary', action: () => this.render(this.requireController().open('character')) },
      { label: 'Loadout', artId: 'nav-icon:loadout', action: () => this.render(this.requireController().open('loadout')) },
      { label: 'Career', artId: 'nav-icon:career', action: () => this.render(this.requireController().open('career')) },
      { label: 'Training', artId: 'nav-icon:training', action: () => this.render(this.requireController().open('training')) },
      { label: 'Settings', artId: 'nav-icon:settings', action: () => this.render(this.requireController().open('settings')) },
    ];
    const artX = width - this.safeRightMargin - 44;
    if (selectedCharacter) this.addPanelArt(root, artX, top + 58, selectedCharacter.portraitArtId, 112);
    let y = heroY + (this.scale.height <= 680 ? 2 : 10);
    if (this.runLaunchState === 'failed') {
      const detail = this.own(root, createUiText(this, margin, y,
        `Couldn't load this Contract. Retry or go Back.`,
        {
          color: '#f87171',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
      detail.setScrollFactor(0);
      y += detail.height + 12;
    }
    const actionHeight = Math.max(hitTarget, compactLandscape || this.scale.height <= 680 ? 60 : 68);
    if (compactLandscape) {
      const gap = 6;
      const columns = 4;
      const buttonWidth = (width - margin - this.safeRightMargin - gap * (columns - 1)) / columns;
      const secondRowOffset = (buttonWidth + gap) / 2;
      buttons.forEach(({ label, artId, action }, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const rowOffset = row === 1 ? secondRowOffset : 0;
        this.addButton(root, margin + rowOffset + column * (buttonWidth + gap), y + row * (actionHeight + gap), label, actionHeight, action, 'ui:confirm', buttonWidth, artId);
      });
    } else {
      const primaryWidth = Math.min(440, width - margin - this.safeRightMargin);
      buttons.slice(0, 2).forEach(({ label, artId, action }) => {
        const button = this.addButton(root, this.safeCenterX, y, label, actionHeight, action, 'ui:confirm', primaryWidth, artId);
        y += button.height + 6;
      });
      const secondary = buttons.slice(2);
      const columnGap = 8;
      const columns = 2;
      const columnWidth = (width - margin - this.safeRightMargin - columnGap) / columns;
      secondary.forEach(({ label, artId, action }, index) => {
        const spansRow = index === secondary.length - 1 && secondary.length % columns === 1;
        const column = index % columns;
        this.addButton(
          root,
          spansRow ? margin : margin + column * (columnWidth + columnGap),
          y,
          label,
          actionHeight,
          action,
          'ui:confirm',
          spansRow ? width - margin - this.safeRightMargin : columnWidth,
          artId,
        );
        if (column === columns - 1 || index === secondary.length - 1) y += actionHeight + 6;
      });
    }

    const hints = this.own(root, createUiText(this,margin, this.scale.height - edgeMargin(this.currentViewport!, 'bottom') - 14, this.menuHintCopy(), {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.bodyMin}px`,
    }));
    hints.setScrollFactor(0);
    this.hint = hints;
    void this.ensurePanelPresentation('home', [
      selectedCharacter?.portraitArtId,
      ...buttons.map(({ artId }) => artId),
      ...threatPreview.map(({ actorArtId }) => actorArtId),
    ].filter((id): id is string => id !== undefined));
  }

  /** Surfaces own their object suffix; the Scene remains the one focus/scroll
   * owner. Only explicit commands with unchanged mounted prefixes use this path. */
  private tryUpdateSurfaceMutation(snapshot: MainMenuSnapshot,
    change: 'equipment-selection' | 'gunsmith-body'): boolean {
    const surface = this.activeSurface;
    const scrap = this.getContext().saveData.progression.scrap;
    if (this.committedPanel !== snapshot.panel || !this.committedDisplay || !this.root
      || !this.scrollMaskContainer || !this.scrollRegion || this.runLaunchState !== 'idle') return false;
    let objects: readonly Phaser.GameObjects.GameObject[];
    let fallbackKey: string;
    let update: () => void;
    if (change === 'equipment-selection' && surface instanceof EquipmentSurface) {
      if (!surface.canUpdateSelection(snapshot, scrap)) return false;
      objects = surface.selectionObjects;
      fallbackKey = `equipment-slot:${snapshot.equipment.selectedSlot}`;
      update = () => surface.updateSelection(this.scrollMaskContainer!, snapshot, scrap);
    } else if (change === 'gunsmith-body' && surface instanceof GunsmithSurface) {
      if (!surface.canUpdateBody(snapshot, scrap)) return false;
      objects = surface.bodyObjects;
      fallbackKey = `gunsmith-family:${snapshot.gunsmith.selectedBuild?.familyId}`;
      update = () => surface.updateBody(this.scrollMaskContainer!, snapshot, scrap);
    } else return false;
    const removed = new Set(objects);
    const start = this.focusables.findIndex(button => removed.has(button));
    // Prefix focus indexes are stable; all following controls belong to the
    // replaced detail/footer. Never shift a retained control's captured index.
    if (start < 0 || this.focusables.slice(start).some(button => !removed.has(button))) return false;
    const before = performanceProbe ? collectDisplayObjects(this.children.list as unknown as readonly DisplayNode[]) : undefined;
    const started = performanceProbe?.now();
    const focusKey = this.nextFocusKey ?? this.focusKeyByButton.get(this.focusables[this.navigator.index]!);
    const retainedY = this.scrollItemBounds.get(this.navigator.index)?.top;
    const offset = this.scrollRegion.scrollOffset;
    const alignTop = this.nextFocusAlignTop;
    this.nextFocusKey = undefined;
    this.nextFocusAlignTop = false;
    this.committedDisplay = false;
    this.renderRevision += 1;
    let updated = false;
    try {
      for (const button of this.focusables.slice(start)) {
        this.focusKeyByButton.delete(button);
        this.disabledFocusables.delete(button);
        this.sectionButtons.delete(button);
      }
      this.focusables.length = start;
      this.focusRings.length = start;
      this.buttonChrome.length = start;
      this.scrollObjects = this.scrollObjects.filter(entry => !removed.has(entry.object));
      for (const index of this.scrollItemIndexes) if (index >= start) this.scrollItemIndexes.delete(index);
      for (const index of this.scrollItemBounds.keys()) if (index >= start) this.scrollItemBounds.delete(index);
      this.scrollLocalIndexByFocusIndex.clear();
      this.hoveredIndex = -1;
      this.focusIndexAfterRender = undefined;
      // Restore base geometry synchronously, before remeasuring the surviving
      // prefix. Using its scrolled bounds would accumulate offset drift.
      for (const entry of this.scrollObjects) {
        (entry.object as unknown as { setPosition(x: number, y: number): void }).setPosition(entry.x, entry.y);
      }
      // Replace, rather than grow, the one region's extent: a shorter detail
      // must also shrink the scroll range and its supplemental content tail.
      this.beginScrollableRegion(this.scrollViewportTop, this.scrollViewportBottom);
      this.rebuildScrollItems();
      for (const { object } of this.scrollObjects) {
        const bottom = (object as unknown as { getBounds(): { bottom: number } }).getBounds().bottom;
        this.scrollRegion!.includeContentBottom(bottom);
      }
      update();
      this.navigator.setCount(this.focusables.length);
      if (focusKey) {
        const next = this.focusables.findIndex(button => this.focusKeyByButton.get(button) === focusKey);
        const fallback = this.focusables.findIndex(button => this.focusKeyByButton.get(button) === fallbackKey);
        if (next >= 0 || fallback >= 0) this.navigator.setIndex(next >= 0 ? next : fallback);
      }
      this.scrollRegion!.setScrollOffset(offset);
      this.syncScrollFocus(this.navigator.index);
      const bounds = this.scrollItemBounds.get(this.navigator.index);
      if (bounds && focusKey && this.focusKeyByButton.get(this.focusables[this.navigator.index]!) === focusKey) {
        this.scrollRegion!.setScrollOffset(bounds.top - (alignTop ? this.scrollViewportTop : retainedY === undefined ? bounds.top - offset : retainedY - offset));
      }
      this.refreshScrollRail(surface.root!);
      this.applyScrollViewport();
      this.applyFocus();
      this.committedDisplay = true;
      updated = true;
    } catch {
      // The command has already returned its authoritative snapshot. Recover
      // by rendering it once, never by replaying the gameplay/persistence action.
      this.nextFocusKey = focusKey;
      this.nextFocusAlignTop = alignTop;
      this.render(snapshot);
    } finally {
      if (started !== undefined && before) {
        performanceProbe!.record('menu.update', started, {
          panel: snapshot.panel, reason: 'same-panel-state-mutation', section: change,
          rebuildCount: this.rebuildCount, revision: this.renderRevision, committed: updated,
          ...displayObjectChange(before, collectDisplayObjects(this.children.list as unknown as readonly DisplayNode[])),
          textures: this.textures.getTextureKeys().length,
        });
      }
    }
    return true;
  }

  /** Panel instances retain UI-only state across visits. Mounts do not: every
   * rebuild revokes old commands and owns a fresh content tree. */
  private presentPanelSurface(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot,
    top: number, margin: number, hitTarget: number): void {
    const panel = snapshot.panel;
    if (panel !== 'loadout' && panel !== 'equipment' && panel !== 'gunsmith') {
      throw new Error(`No mounted surface for ${panel}`);
    }
    let surface = this.panelSurfaces[panel];
    if (!surface) {
      const controller = this.requireController();
      const environment: MenuSurfaceEnvironment = {
        scene: this,
        visuals: this.uiVisuals,
        onSnapshot: (next, change) => {
          if (!change || !this.tryUpdateSurfaceMutation(next, change)) this.render(next);
        },
        resources: {
          panel: (owner, ids) => { void this.ensurePanelPresentation(owner, ids); },
          equipment: ids => { void this.ensureEquipmentPresentation(ids); },
          gunsmith: ids => { void this.ensureGunsmithPresentation(ids); },
        },
        controls: {
          addButton: (...args) => this.addButton(...args),
          disableButton: button => this.disableButton(button),
          addHeading: (...args) => this.addHeading(...args),
          addCatalogIcon: (...args) => this.addCatalogIcon(...args),
          addPanelArt: (...args) => this.addPanelArt(...args),
          beginScrollableRegion: (start, bottom) => this.beginScrollableRegion(start, bottom),
          endScrollableRegion: () => this.endScrollableRegion(),
          registerScrollObject: (object, owner) => this.registerScrollObject(object, owner),
          buttonIndex: button => this.focusables.indexOf(button),
          rememberFocus: (button, key) => { this.focusKeyByButton.set(button, key); return button; },
          focusNext: (key, alignTop = false) => { this.nextFocusKey = key; this.nextFocusAlignTop = alignTop; },
          focusAfterRender: button => { this.focusIndexAfterRender = this.focusables.indexOf(button); },
          equipmentSlotColumns: columns => { this.equipmentSlotColumns = columns; },
        },
      };
      surface = panel === 'loadout' ? new LoadoutSurface(environment, controller)
        : panel === 'equipment' ? new EquipmentSurface(environment, controller)
        : new GunsmithSurface(environment, controller);
      this.panelSurfaces[panel] = surface;
    }
    this.activeSurface = surface;
    surface.present(root, snapshot, {
      width: this.scale.width, height: this.scale.height, top, margin, hitTarget,
      centerX: this.safeCenterX, rightMargin: this.safeRightMargin,
      viewport: this.currentViewport!, scrollBottom: this.scrollViewportBottomFor(hitTarget),
    }, this.getContext().saveData.progression.scrap);
  }

  private get panelContentRoot(): Phaser.GameObjects.Container | undefined { return this.activeSurface?.root; }

  private unmountPanelSurface(): void {
    this.activeSurface?.unmount();
    this.activeSurface = undefined;
  }

  private disposePanelSurfaces(): void {
    for (const surface of Object.values(this.panelSurfaces)) surface?.dispose();
    this.panelSurfaces = {};
    this.activeSurface = undefined;
  }

  private async startContractWithResources(): Promise<void> {
    const ctx = this.getContext();
    await this.startRunWithResources(assembleComposedRunRequest(ctx, ctx.menuRng), false);
  }

  /** Training deliberately uses the existing legacy arena composition, but
   * carries an explicit mode to GameScene so it cannot bank progression or
   * Compendium facts. It still waits for the same physical resource closure. */
  private async startTrainingWithResources(): Promise<void> {
    const ctx = this.getContext();
    await this.startRunWithResources(asLegacyComposedRunRequest(assembleRunRequest(ctx, ctx.menuRng)), true);
  }

  private async startRunWithResources(request: ComposedRunRequest, isTraining: boolean): Promise<void> {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    const started = performanceProbe?.now();
    const generation = ++this.runLaunchGeneration;
    const ctx = this.getContext();
    // Result truth belongs to this exact launch, not whatever durable state
    // happens to exist when asynchronous resource loading eventually ends.
    const runStartPresentation = ctx.captureRunPresentationBaseline();
    const stage = request.kind === 'stage' ? ctx.stages.stageById(request.stageId) : undefined;
    const arenaId = stage?.arenaId ?? (request.kind === 'legacy-arena' ? request.arenaId : undefined);
    const arena = arenaId === undefined ? undefined : ctx.arenas.arenaById(arenaId);
    const mercenary = ctx.characters.characterById(request.characterId);
    this.runLaunchPresentation = Object.freeze(isTraining
      ? { heading: 'PREPARING TRAINING', subject: arena?.name ?? 'Training Arena', mercenary: mercenary?.name ?? request.characterId }
      : { heading: 'PREPARING CONTRACT', subject: stage?.name ?? 'Selected Contract', mercenary: mercenary?.name ?? request.characterId });
    this.runLaunchState = 'loading';
    this.runLaunchProgressLabel = 'Loading';
    this.runLaunchProgress = undefined;
    this.render(this.requireController().snapshot());
    try {
      const plan = request.kind === 'stage'
        ? resolveRunPlan({ characterId: request.characterId, stageId: request.stageId, seed: request.seed }, ctx.stages.runPlanCatalog())
        : undefined;
      const resolvedArenaId = plan?.arenaId ?? arenaId;
      const resolvedArena = resolvedArenaId === undefined ? undefined : ctx.arenas.arenaById(resolvedArenaId);
      if (!resolvedArena) throw new Error('Selected contract arena is unavailable');
      const legacyEnemyIds = request.kind === 'legacy-arena'
        ? (ctx.data.spawnCurves.find((curve) => curve.id === resolvedArena.spawnCurveId)?.waves.map((wave) => wave.enemyId) ?? [])
        : [];
      const resources = resolveRunPhysicalResources({
        data: ctx.data,
        characterId: request.characterId,
        arena: resolvedArena,
        encounterEnemyIds: plan?.encounter.enemyIds ?? legacyEnemyIds,
        bossId: plan?.encounter.bossId,
      });
      // Phaser exposes one scene-wide loader. A cold Home render may already
      // own it for the hero closure, so launch must reuse that completion
      // before asking the same loader for the full run closure.
      await this.panelArtInFlight;
      await this.serializeTextureLoad(() => prepareRunPresentation(this, ctx.data, resources, (progress) => {
        if (this.isLive && generation === this.runLaunchGeneration && this.runLaunchState === 'loading') {
          this.runLaunchProgress = progress;
          this.runLaunchProgressText?.setText(this.runLaunchCopy());
        }
      }), undefined);
      if (!this.isLive || generation !== this.runLaunchGeneration) {
        if (started !== undefined) performanceProbe?.record('run.prepare', started, { state: 'cancelled', isTraining });
        return;
      }
      // Optional run audio shares the guarded scene LoaderPlugin queue. Failure
      // preserves silent play; completion must precede GameScene music/events.
      const runAudio = resolveAudioResources(ctx.data.audio.assets, 'run-common');
      this.runLaunchProgressLabel = 'Preparing sound';
      await this.serializeTextureLoad(() => loadAudioResources(this, runAudio, (progress) => {
        if (this.isLive && generation === this.runLaunchGeneration && this.runLaunchState === 'loading') {
          this.runLaunchProgress = progress;
          this.runLaunchProgressText?.setText(this.runLaunchCopy());
        }
      }), undefined);
      if (!this.isLive || generation !== this.runLaunchGeneration || this.runLaunchState !== 'loading') {
        if (started !== undefined) performanceProbe?.record('run.prepare', started, { state: 'cancelled', isTraining });
        return;
      }
      if (started !== undefined) performanceProbe?.record('run.prepare', started, { state: 'ready', isTraining, physicalResources: resources.length, audioFiles: runAudio.length, seed: request.seed });
      this.scene.start(SceneKey.Game, { runRequest: request, runStartPresentation, isTraining });
    } catch (error) {
      if (started !== undefined) performanceProbe?.record('run.prepare', started, { state: 'failed', isTraining });
      if (!this.isLive || generation !== this.runLaunchGeneration) return;
      this.runLaunchState = 'failed';
      this.runLaunchProgress = undefined;
      this.render(this.requireController().snapshot());
    }
  }

  private renderLaunchModal(root: Phaser.GameObjects.Container, width: number, hitTarget: number): void {
    const backdrop = this.own(root, this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x081018, 0.94)
      .setDepth(MENU_DEPTH + 10).setScrollFactor(0).setInteractive());
    backdrop.on(Phaser.Input.Events.POINTER_UP, () => undefined);
    const copy = this.runLaunchCopy();
    const modalWidth = Math.min(520, width - 32);
    const modalFrame = this.uiVisuals?.addPanel(
      this,
      this.safeCenterX,
      this.scale.height / 2,
      modalWidth,
      Math.max(132, hitTarget * 3),
      'modal',
      { alpha: 0.96, depth: MENU_DEPTH + 11 },
    );
    if (modalFrame) this.own(root, modalFrame);
    const text = this.own(root, createUiText(this, this.safeCenterX, this.scale.height / 2, copy, {
      color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin + 4}px`, align: 'center',
      wordWrap: { width: width - 32 },
    }).setOrigin(0.5).setDepth(MENU_DEPTH + 12).setScrollFactor(0));
    text.setPadding(16, hitTarget / 3);
    this.runLaunchProgressText = text;
  }

  private runLaunchCopy(): string {
    const presentation = this.runLaunchPresentation;
    return [presentation?.heading ?? 'PREPARING CONTRACT', presentation?.subject, presentation?.mercenary,
      this.runLaunchProgress && `${this.runLaunchProgressLabel} ${this.runLaunchProgress.completed} / ${this.runLaunchProgress.total}`].filter(Boolean).join('\n');
  }

  private renderCharacter(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Mercenary');
    let y = top + heading.height + 20;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));

    snapshot.character.characters.forEach((character) => {
      const label = `${character.selected ? '✓ ' : ''}${character.name}${character.locked ? ' 🔒' : ''}`;
      const cardWidth = width - margin - this.safeRightMargin;
      const compact = cardWidth < 520;
      const portraitColumn = compact ? 132 : 160;
      const cardHeight = compact ? 236 : 204;
      const button = this.addButton(root, margin, y, label, cardHeight, () => {
        const next = this.requireController().selectCharacter(character.id, snapshot.character.revision);
        this.render(next);
      }, 'ui:confirm', cardWidth, undefined, 62, portraitColumn, true);
      const rowOwnerIndex = this.focusables.length - 1;
      // Locked roster members remain full-colour previews; the lock marker and
      // disabled command communicate availability without making approved
      // character art look muddy or unfinished.
      this.addPanelArt(root, margin + portraitColumn / 2, y + cardHeight / 2, character.portraitArtId, compact ? 204 : 184, false, false, rowOwnerIndex);
      this.addCatalogIcon(root, width - this.safeRightMargin - 22, y + 24, character.startingWeaponIconArtId, 38, rowOwnerIndex);
      if (character.locked) {
        this.addCatalogIcon(root, width - this.safeRightMargin - 52, y + 22, 'ui-chrome:locked', 22, rowOwnerIndex);
      }
      if (character.description || character.abilityName) {
        const detailX = margin + portraitColumn;
        const details = [
          character.description,
          `${character.baseStatsSummary}  •  Starts: ${character.startingWeaponSummary}`,
          character.passives.length > 0 ? `PASSIVE  ${character.passives.map((passive) => `${passive.name} — ${passive.description}`).join(' • ')}` : undefined,
          character.abilityName ? `ABILITY  ${character.abilityName} — ${character.abilityDescription}` : undefined,
          character.locked ? `UNLOCK  ${character.unlockRequirement}` : undefined,
        ]
          .filter(Boolean).join('\n');
        const desc = this.own(root, createUiText(this, detailX, y + 38, details, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          lineSpacing: 2,
          wordWrap: { width: cardWidth - portraitColumn - 12 },
        }));
        desc.setScrollFactor(0);
        this.registerScrollObject(desc, rowOwnerIndex);
        if (character.abilityIconArtId) {
          this.addCatalogIcon(root, margin + 43, y + cardHeight - 31, character.abilityIconArtId, 46, rowOwnerIndex);
        }
        character.passives.slice(0, 2).forEach((passive, index) => {
          this.addCatalogIcon(root, margin + 94 + index * 46, y + cardHeight - 31, passive.iconArtId, 42, rowOwnerIndex);
        });
      }
      y += button.height + 10;
    });

    this.endScrollableRegion();
    void this.ensureMercenaryPresentation(snapshot.character.characters.flatMap((character) => [
      character.portraitArtId,
      character.startingWeaponIconArtId,
      ...(character.abilityIconArtId ? [character.abilityIconArtId] : []),
      ...character.passives.map((passive) => passive.iconArtId),
    ]));
    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderArena(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Choose Arena');
    let y = top + heading.height + 20;

    snapshot.arena.arenas.forEach((arena) => {
      const label = `${arena.selected ? '✓ ' : ''}${arena.name}${arena.locked ? ' 🔒' : ''}`;
      this.addButton(root, margin, y, label, hitTarget, () => {
        const next = this.requireController().selectArena(arena.id, snapshot.arena.revision);
        this.render(next);
      });
      y += hitTarget + 12;
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderStage(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Choose Contract');
    let y = top + heading.height + 20;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    let chapter: string | undefined;
    snapshot.stage.stages.forEach((stage) => {
      if (stage.chapterName !== chapter) {
        chapter = stage.chapterName;
        // Keep the complete illustrated badge comfortably inside the scroll
        // viewport while the shared mask handles continuous edge clipping.
        this.addCatalogIcon(root, margin + 22, y + 22, stage.chapterIconArtId, 38);
        const chapterLabel = this.own(root, createUiText(this, margin + 48, y + 7, chapter.toUpperCase(), {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.labelMin}px`, fontStyle: '700',
        }));
        this.registerScrollObject(chapterLabel);
        y += Math.max(42, chapterLabel.height + 14);
      }
      const status = stage.locked ? `LOCKED — ${stage.lockCopy}` : stage.completed ? `CLEARED • Best ${formatDuration(stage.bestTimeMs)}` : 'AVAILABLE';
      const title = `${stage.selected ? '✓ ' : ''}${stage.boss ? 'BOSS • ' : ''}${stage.name}`;
      const cardWidth = width - margin - this.safeRightMargin;
      const cardHeight = 100;
      const button = this.addButton(root, margin, y, title, cardHeight, () => {
        this.render(this.requireController().selectStage(stage.id));
      }, 'ui:confirm', cardWidth, undefined, 42, 70, true);
      const rowOwnerIndex = this.focusables.length - 1;
      if (stage.locked) this.disableButton(button);
      this.addPanelArt(root, margin + 34, y + cardHeight / 2, stage.objective.artId, 52, stage.locked, false, rowOwnerIndex);
      const metadata = this.own(root, createUiText(this, margin + 70, y + 36,
        `${stage.locationName}  •  ${stage.objective.copy}\n${status}`, {
          color: stage.locked ? '#94a3b8' : stage.completed ? '#86efac' : '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          lineSpacing: 2,
          wordWrap: { width: cardWidth - 116 },
        }));
      metadata.setScrollFactor(0);
      this.registerScrollObject(metadata, rowOwnerIndex);
      const stateArtId = stage.locked ? 'ui-chrome:locked'
        : stage.completed ? 'ui-chrome:cleared'
          : stage.boss ? 'ui-chrome:boss' : undefined;
      if (stateArtId) {
        // The shared scroll rail owns the rightmost 9px. Keep a physical
        // gutter between it and the 24px state marker so neither can obscure
        // the other on the canonical 390px phone viewport.
        this.addCatalogIcon(root, width - this.safeRightMargin - 22, y + 22, stateArtId, 24, rowOwnerIndex);
      }
      y += button.height + 10;
      if (stage.selected && !stage.locked) {
        y += this.addThreatIconStrip(
          root,
          stage.threats,
          margin + 42,
          y,
          width - margin - this.safeRightMargin - 54,
          42,
          8,
        ) + 8;
        const reward = this.own(root, createUiText(this, margin + 42, y,
          `First clear: ${stage.reward.headline}`,
          { color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin - 42 } },
        ));
        this.registerScrollObject(reward);
        y += reward.height + 12;
      }
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('stage', [
      ...new Set(snapshot.stage.stages.map((stage) => stage.chapterIconArtId)),
      ...snapshot.stage.stages.map((stage) => stage.objective.artId),
      ...snapshot.stage.stages.filter((stage) => stage.selected && !stage.locked)
        .flatMap((stage) => stage.threats.map(({ actorArtId }) => actorArtId)),
    ]);
  }

  private renderCareer(root: Phaser.GameObjects.Container, _snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Career');
    const compactLandscape = this.scale.height < 500 && width >= 700;
    const actionWidth = Math.min(560, width - margin - this.safeRightMargin);
    const actionX = this.safeCenterX - actionWidth / 2;
    let y = top + heading.height + (compactLandscape ? 8 : 20);
    const actionHeight = Math.max(hitTarget, compactLandscape ? 52 : 68);
    for (const [label, panel, artId] of [
      ['Next Goals', 'next-goals', 'nav-icon:career'],
      ['Achievements', 'achievements', 'nav-icon:achievements'],
      ['Compendium', 'compendium', 'nav-icon:compendium'],
    ] as const) {
      this.addButton(root, actionX, y, label, actionHeight, () => this.render(this.requireController().open(panel)), 'ui:confirm', actionWidth, artId);
      y += actionHeight + (compactLandscape ? 6 : 12);
    }
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('career', ['nav-icon:career', 'nav-icon:achievements', 'nav-icon:compendium']);
  }

  private renderNextGoals(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Next Goals');
    const compactLandscape = this.scale.height < 500 && width >= 700;
    const actionWidth = Math.min(620, width - margin - this.safeRightMargin);
    const actionX = this.safeCenterX - actionWidth / 2;
    let y = top + heading.height + 16;
    const overview = snapshot.progressionOverview;
    const summary = this.own(root, createUiText(this, actionX, y,
      `Contracts ${overview.completedStages}/${overview.totalStages} • Achievements ${overview.completedAchievements}/${overview.totalAchievements}`,
      { color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: actionWidth } }));
    y += summary.height + (compactLandscape ? 8 : 12);
    const goalGap = compactLandscape ? 6 : 10;
    const compactCardWidth = (actionWidth - goalGap * Math.max(0, overview.nextGoals.length - 1)) / Math.max(1, overview.nextGoals.length);
    overview.nextGoals.forEach((goal, index) => {
      const cardHeight = compactLandscape ? 96 : 94;
      const cardWidth = compactLandscape ? compactCardWidth : actionWidth;
      const cardX = compactLandscape ? actionX + index * (cardWidth + goalGap) : actionX;
      const panel = this.uiVisuals?.addPanel(this, cardX + cardWidth / 2, y + cardHeight / 2, cardWidth, cardHeight, 'card', { alpha: 0.82 });
      if (panel) this.own(root, panel);
      this.addPanelArt(root, cardX + (compactLandscape ? 30 : 42), y + cardHeight / 2, goal.artId, compactLandscape ? 52 : 72);
      const goalCopy = `${goal.title}\n${goal.detail}`;
      this.own(root, createUiText(this, cardX + (compactLandscape ? 60 : 88), y + (compactLandscape ? 9 : 18), goalCopy, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: compactLandscape ? 0 : 3,
        wordWrap: { width: cardWidth - (compactLandscape ? 68 : 100) },
      }));
      if (!compactLandscape) y += cardHeight + goalGap;
    });
    if (compactLandscape) y += 96 + 8;
    this.addButton(root, actionX, y, 'Choose Contract', Math.max(hitTarget, compactLandscape ? 52 : 68), () => this.render(this.requireController().open('stage')), 'ui:confirm', actionWidth, overview.nextGoals[0]?.artId ?? 'objective-icon:kill');
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('next-goals', overview.nextGoals.map((goal) => goal.artId));
  }

  private renderCompendium(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Compendium');
    let y = top + heading.height + 16;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    snapshot.compendium.entries.forEach((entry) => {
      const detail = entry.status === 'unseen'
        ? 'Unknown threat — encounter it in a contract.'
        : entry.status === 'encountered'
          ? `${entry.fieldNote}\nTells: ${entry.tells}`
          : `${entry.fieldNote}\nBehaviour: ${entry.behaviour}\nTells: ${entry.tells}\nCounterplay: ${entry.counterplay}${entry.foundIn.length > 0 ? `\nFound in: ${entry.foundIn[0]}` : ''}`;
      const name = entry.status === 'unseen' ? 'Unknown' : entry.name;
      const leading = entry.actorArtId ? 122 : 58;
      const cardWidth = width - margin - this.safeRightMargin;
      const cardHeight = entry.status === 'defeated' ? 188 : entry.status === 'encountered' ? 148 : 84;
      const row = this.addButton(root, margin, y, name, cardHeight, () => undefined, 'ui:confirm', cardWidth, undefined, 8, leading, true);
      const rowOwnerIndex = this.focusables.length - 1;
      row.setStyle({ color: entry.status === 'unseen' ? '#94a3b8' : '#f7f1d5' });
      const detailCopy = this.own(root, createUiText(this, margin + leading, y + 34, detail, {
        color: entry.status === 'unseen' ? '#94a3b8' : '#a5f3fc', fontFamily: ThemeFont.family,
        fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: 2,
        wordWrap: { width: cardWidth - leading - 24 },
      }));
      detailCopy.setScrollFactor(0);
      this.registerScrollObject(detailCopy, rowOwnerIndex);
      if (entry.actorArtId) this.addPanelArt(root, margin + 57, y + cardHeight / 2, entry.actorArtId, 108, false, true, rowOwnerIndex);
      else this.addCatalogIcon(root, margin + 25, y + cardHeight / 2, 'ui-chrome:locked', 26, rowOwnerIndex);
      y += row.height + 12;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('compendium', snapshot.compendium.entries.flatMap((entry) => entry.actorArtId ? [entry.actorArtId] : []));
  }

  private renderTraining(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Training');
    const actionWidth = Math.min(560, width - margin - this.safeRightMargin);
    const actionX = this.safeCenterX - actionWidth / 2;
    const copy = this.own(root, createUiText(this, actionX, top + heading.height + 20,
      'Practice movement and auto-fire here. Training does not award progression or Compendium discovery.',
      { color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: actionWidth } }));
    const startY = top + heading.height + copy.height + 36;
    const actionHeight = Math.max(hitTarget, 68);
    const trainingArtId = snapshot.character.characters.find((character) => character.selected)?.abilityIconArtId ?? 'ability-icon:scrap-burst';
    this.addButton(root, actionX, startY, this.runLaunchState === 'failed' ? 'Retry Training' : 'Start Training', actionHeight, () => { void this.startTrainingWithResources(); }, 'ui:confirm', actionWidth, trainingArtId);
    if (this.runLaunchState === 'failed') {
      this.own(root, createUiText(this, actionX, startY + actionHeight + 8, "Couldn't load Training. Retry or go Back.", {
        color: '#f87171', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: actionWidth },
      }));
    }
    void this.ensurePanelPresentation('training', [trainingArtId]);
    this.addBackButton(root, width, margin, hitTarget);
  }

  

  private renderAchievements(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, `Achievements ${snapshot.achievements.completedCount}/${snapshot.achievements.totalCount}`);
    const selected = snapshot.achievements.selectedAchievement;
    const showDetail = selected !== undefined && width >= 760;
    const detailTop = top + heading.height + 10;
    if (showDetail) {
      const detailWidth = width - margin - this.safeRightMargin;
      const detailPanel = this.uiVisuals?.addPanel(
        this, this.safeCenterX, detailTop + 68, detailWidth, 136, 'card', { alpha: 0.58 },
      );
      if (detailPanel) this.own(root, detailPanel);
      this.addAchievementIcon(root, margin + 44, detailTop + 68, selected.iconArtId, 76);
      this.own(root, createUiText(this, margin + 88, detailTop + 14,
        `${selected.name}\n${achievementStatusCopy(selected)} • ${selected.progress}/${selected.target}\n${selected.description}\nReward: ${selected.rewardSummary}`,
        {
          color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - 98 },
        },
      )).setScrollFactor(0);
    }
    const detailHeight = showDetail ? Math.max(hitTarget + 64, 148) : 0;
    const gridTop = detailTop + detailHeight + 12;
    const columns = width >= 760 ? 3 : 1;
    const gap = 8;
    const available = width - margin - this.safeRightMargin;
    const cardWidth = (available - gap * (columns - 1)) / columns;
    const cardHeight = Math.max(hitTarget, 112);
    let narrowY = gridTop;
    this.beginScrollableRegion(gridTop, this.scrollViewportBottomFor(hitTarget));
    snapshot.achievements.achievements.forEach((achievement, index) => {
      const column = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = margin + column * (cardWidth + gap);
      const isExpandedNarrowCard = columns === 1 && achievement.id === selected?.id;
      // The expanded phone card can contain a two-line reward (notably the
      // boss achievements). Give the whole copy block breathing room and let
      // addButton centre it vertically instead of pinning it to the top edge.
      const rowHeight = isExpandedNarrowCard ? Math.max(cardHeight, 184) : cardHeight;
      const y = columns === 1 ? narrowY : gridTop + rowIndex * (cardHeight + gap);
      const label = isExpandedNarrowCard
        ? `${achievement.name}\n${achievementStatusCopy(achievement)} • ${achievement.progress}/${achievement.target}\n${achievement.description}\nReward: ${achievement.rewardSummary}`
        : `${achievement.name}\n${achievementStatusCopy(achievement)} • ${achievement.progress}/${achievement.target}`;
      const button = this.addButton(root, x, y,
        label,
        rowHeight,
        () => this.render(this.requireController().selectAchievement(achievement.id)),
        'ui:confirm', cardWidth, undefined, 10, 94, false, 'center',
      );
      const rowOwnerIndex = this.focusables.length - 1;
      button.setStyle({ color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px` });
      this.addAchievementIcon(root, x + 47, y + rowHeight / 2, achievement.iconArtId, 82, rowOwnerIndex);
      if (columns === 1) narrowY += rowHeight + gap;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensureAchievementPresentation(snapshot.achievements.achievements.map((achievement) => achievement.iconArtId));
  }

  private renderSettings(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Settings');
    const compactLandscape = this.scale.height < 500 && width >= 700;
    const actionWidth = Math.min(560, width - margin - this.safeRightMargin);
    const actionX = this.safeCenterX - actionWidth / 2;
    let y = top + heading.height + (compactLandscape ? 8 : 20);
    const actionHeight = Math.max(hitTarget, compactLandscape ? 44 : 64);

    const settings = snapshot.settings;
    const rows: Array<{ label: string; artId: string; action: () => MainMenuSnapshot }> = [
      {
        label: `Mute: ${settings.muted ? 'On' : 'Off'}`,
        artId: 'settings-icon:master-audio',
        action: () => this.requireController().setSettings({ muted: !settings.muted }),
      },
      {
        label: `Music Volume: ${Math.round(settings.musicVolume * 100)}%`,
        artId: 'settings-icon:music',
        action: () => this.requireController().setSettings({ musicVolume: cycleVolumeStep(settings.musicVolume) }),
      },
      {
        label: `SFX Volume: ${Math.round(settings.sfxVolume * 100)}%`,
        artId: 'settings-icon:sfx',
        action: () => this.requireController().setSettings({ sfxVolume: cycleVolumeStep(settings.sfxVolume) }),
      },
      {
        label: `Reduced Motion: ${settings.reducedMotion ? 'On' : 'Off'}`,
        artId: 'settings-icon:reduced-motion',
        action: () => this.requireController().setSettings({ reducedMotion: !settings.reducedMotion }),
      },
    ];

    rows.forEach((row) => {
      this.addButton(root, actionX, y, row.label, actionHeight, () => {
        const next = row.action();
        this.render(next);
      }, 'ui:confirm', actionWidth, row.artId);
      y += actionHeight + (compactLandscape ? 4 : 12);
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  

  /** Parents a freshly created display object immediately, so a mid-chain
   *  failure (setOrigin, setStyle, ...) can never leave it orphaned on the
   *  scene's display list outside the container the failure path destroys. */
  private own<T extends Phaser.GameObjects.GameObject>(
    root: Phaser.GameObjects.Container,
    object: T,
  ): T {
    root.add(object);
    return object;
  }

  private addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    minHeight: number,
    callback?: () => void,
    audioEvent: MenuAudioEvent = 'ui:confirm',
    maxLabelWidth?: number,
    artId?: string,
    trailingReserve = 0,
    leadingReserve = 0,
    topAligned = false,
    horizontalAlign?: 'left' | 'center',
    appearance: 'card' | 'section' = 'card',
  ): Phaser.GameObjects.Text {
    const hasNavigationChevron = artId !== undefined && !artId.startsWith('settings-icon:') && !artId.startsWith('action-icon:');
    const effectiveTrailingReserve = Math.max(trailingReserve, hasNavigationChevron ? 34 : 0);
    const contentArt = artId !== undefined && !/^(settings-icon|action-icon|ui-chrome):/.test(artId);
    const contentArtCap = maxLabelWidth !== undefined && maxLabelWidth < 190 ? 50 : 56;
    const artSize = artId === undefined ? 0 : contentArt
      ? Math.min(contentArtCap, Math.max(36, minHeight - 12))
      : Math.min(40, Math.max(28, minHeight - 24));
    const leftInset = Math.max(artId ? artSize + 16 : appearance === 'section' ? 4 : 12, leadingReserve);
    const rightInset = Math.max(topAligned ? 10 : 12, effectiveTrailingReserve);
    const text = this.own(root, createUiText(this,x, y, label, {
      color: appearance === 'section' ? '#f78003' : '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${appearance === 'section' ? 10 : this.loadoutSurface && maxLabelWidth !== undefined && maxLabelWidth < 110 ? 10 : maxLabelWidth !== undefined && maxLabelWidth < 190 ? ThemeFont.bodyMin : ThemeFont.labelMin}px`,
      fontStyle: appearance === 'section' ? '700' : '600',
      align: horizontalAlign ?? (topAligned ? 'left' : 'center'),
      padding: { left: leftInset, right: rightInset, top: 0, bottom: 0 },
      ...(maxLabelWidth === undefined ? {} : { wordWrap: { width: Math.max(1, maxLabelWidth - leftInset - rightInset) } }),
    }));
    text.setOrigin(x === this.safeCenterX ? 0.5 : 0, 0);
    text.setScrollFactor(0);
    if (appearance === 'section') this.sectionButtons.add(text);

    const bounds = text.getBounds();
    const horizontalPadding = maxLabelWidth === undefined && bounds.width < MIN_MENU_BUTTON_LOGICAL_WIDTH
      ? (MIN_MENU_BUTTON_LOGICAL_WIDTH - bounds.width) / 2 + (text.padding.left ?? 10)
      : (text.padding.left ?? 10);
    const targetHeight = Math.max(minHeight, bounds.height + (topAligned ? 16 : 0));
    const verticalPadding = topAligned ? 8 : Math.max(0, Math.round((targetHeight - bounds.height) / 2));
    // Text bounds include padding. The same correction used for height also
    // applies horizontally: augment padding by half the missing bounds plus
    // the current inset, so short labels meet the 44px physical width floor
    // at the worst promised FIT without narrowing longer labels.
    text.setPadding(horizontalPadding, verticalPadding, rightInset, topAligned ? 8 : verticalPadding);

    if (maxLabelWidth !== undefined) {
      const measured = text.getBounds();
      // A declared card width is a geometry contract, not merely a wrapping
      // hint. Chrome, pointer hit area, focus ring and scroll bounds all read
      // from this same Text object below, so they cannot drift apart.
      text.setFixedSize(Math.max(this.loadoutSurface ? minimumHitTarget(this.currentViewport!) : MIN_MENU_BUTTON_LOGICAL_WIDTH, maxLabelWidth), Math.max(targetHeight, measured.height));
    }
    const framedBounds = text.getBounds();
    const chrome = appearance === 'section' ? undefined : this.uiVisuals?.addPanel(
      this,
      framedBounds.centerX,
      framedBounds.centerY,
      framedBounds.width,
      framedBounds.height,
      this.loadoutSurface ? 'figma-card' : 'card',
      { alpha: 0.96 },
    );
    if (chrome) {
      root.add(chrome);
      (root as Phaser.GameObjects.Container & { moveBelow?: (child: Phaser.GameObjects.GameObject, sibling: Phaser.GameObjects.GameObject) => unknown })
        .moveBelow?.(chrome, text);
    }
    // Keep chrome ownership aligned with every logical button, including
    // plain section controls and textures which have not loaded yet.
    this.buttonChrome.push(chrome);
    let icon: Phaser.GameObjects.Image | undefined;
    if (artId) {
      icon = this.uiVisuals?.addIcon(this, framedBounds.left + 8 + artSize / 2, framedBounds.centerY, artId, { size: artSize });
      if (icon) {
        root.add(icon);
      }
    }
    let trailingIcon: Phaser.GameObjects.Image | undefined;
    if (hasNavigationChevron) {
      trailingIcon = this.uiVisuals?.addIcon(
        this,
        framedBounds.right - 18,
        framedBounds.centerY,
        'ui-chrome:chevron',
        { size: 18 },
      );
      if (trailingIcon) root.add(trailingIcon);
    }

    text.setInteractive({ useHandCursor: true });
    text.on(Phaser.Input.Events.POINTER_OVER, () => {
      (chrome as Phaser.GameObjects.NineSlice | undefined)?.setTint?.(ThemeColor.cardHover);
    });
    text.on(Phaser.Input.Events.POINTER_OUT, () => {
      (chrome as Phaser.GameObjects.NineSlice | undefined)?.clearTint?.();
    });
    text.on(Phaser.Input.Events.POINTER_UP, (pointer?: Phaser.Input.Pointer) => {
      if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
      const focusIndex = this.focusables.indexOf(text);
      if (!this.committedDisplay || focusIndex < 0) return;
      if (!callback || this.disabledFocusables.has(text)) return;
      if (this.scrollItemIndexes.has(focusIndex)
        && pointer
        && (pointer.y < this.scrollViewportTop || pointer.y >= this.scrollViewportBottom)) return;
      // A drag is a scrolling gesture, never a command activation. Keep the
      // flag through the InputPlugin's pointer-up dispatch so this remains
      // correct regardless of global-vs-object listener ordering.
      if (this.touchDidScroll) {
        this.touchDidScroll = false;
        return;
      }
      // Pointer Confirm/Back takes the same transition boundary as logical
      // activation: sampled edges from this frame cannot reach the new panel.
      this.inputController?.quarantineUntilNeutral();
      this.navigator.setIndex(focusIndex);
      this.syncScrollFocus(this.navigator.index);
      this.applyScrollViewport();
      // The single command boundary: pointer clicks and synthetic
      // Enter/Space activation both land here and emit exactly one event.
      this.bus?.emit(audioEvent, {});
      callback();
    });

    this.focusables.push(text);
    const ringBounds = text.getBounds();
    const visualRing = this.uiVisuals?.addPanel(
      this, ringBounds.centerX, ringBounds.centerY, ringBounds.width, ringBounds.height, 'focus', { alpha: 0 },
    );
    // The explicit fallback uses top-left origin so headless layout audits and
    // real Phaser bounds share the same geometry. Production normally takes
    // the authored nine-slice path above.
    const fallbackRing = visualRing ? undefined : this.add
      .rectangle(ringBounds.left, ringBounds.top, ringBounds.width, ringBounds.height, 0, 0)
      .setOrigin(0, 0);
    const ring = (visualRing ?? fallbackRing!) as Phaser.GameObjects.GameObject & {
      x: number;
      y: number;
      setAlpha?(alpha: number): unknown;
      setScrollFactor?(factor: number): unknown;
      setStrokeStyle?(width: number, color: number, alpha: number): unknown;
      setVisible?(visible: boolean): unknown;
    };
    root.add(ring);
    ring.setStrokeStyle?.(FocusStroke.width, FocusStroke.color, 0);
    ring.setScrollFactor?.(0);
    this.focusRings.push(ring);
    const index = this.focusables.length - 1;
    if (this.scrollRegion && this.collectingScrollItems) {
      this.scrollItemIndexes.add(index);
      this.scrollObjects.push({ object: text, x: text.x, y: text.y, ownerIndex: index });
      this.scrollObjects.push({ object: ring, x: ring.x, y: ring.y, ownerIndex: index });
      if (chrome) this.registerScrollObject(chrome, index);
      if (icon) this.registerScrollObject(icon, index);
      if (trailingIcon) this.registerScrollObject(trailingIcon, index);
      // The shared region receives real rendered bounds, not a screen-local
      // row estimate, so wrapped labels and future content remain correct.
      const itemBounds = text.getBounds();
      this.scrollItemBounds.set(index, { top: itemBounds.top, bottom: itemBounds.bottom });
      this.rebuildScrollItems();
    }
    text.on(Phaser.Input.Events.POINTER_OVER, (pointer: Phaser.Input.Pointer) => {
      const focusIndex = this.focusables.indexOf(text);
      if (this.scrollItemIndexes.has(focusIndex)
        && (pointer.y < this.scrollViewportTop || pointer.y >= this.scrollViewportBottom)) return;
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      // Hover follows the pointer without auto-revealing the whole row. Wheel
      // and drag scrolling therefore remain continuous when a row is only
      // partly inside the geometry mask.
      this.applyFocus();
    });
    text.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.applyFocus();
    });
    return text;
  }

  private disableButton(text: Phaser.GameObjects.Text): void {
    this.disabledFocusables.add(text);
    text.disableInteractive();
    const index = this.focusables.indexOf(text);
    const chrome = this.buttonChrome[index] as Phaser.GameObjects.GameObject & {
      setAlpha?(alpha: number): unknown;
      setTint?(tint: number): unknown;
    } | undefined;
    chrome?.setAlpha?.(0.72);
    chrome?.setTint?.(0x526273);
  }

  private addHeading(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): Phaser.GameObjects.Text {
    const heading = this.own(root, createUiText(this,x, y, text, {
      align: 'center',
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.headingMin}px`,
      fontStyle: '700',
    }));
    heading.setOrigin(0.5, 0).setScrollFactor(0);
    return heading;
  }

  /** Render a validated data-owned icon. Missing textures deliberately leave
   * the accessible text label intact rather than turning a catalog problem
   * into an unusable menu action. */
  private addCatalogIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string, maxSize = 26, scrollOwnerIndex?: number): void {
    const binding = this.requireVisualArt().bindingById(iconArtId);
    if (!binding || (binding.kind !== 'icon' && binding.kind !== 'upgrade-icon' && binding.kind !== 'achievement-icon' && binding.kind !== 'weapon-icon') || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    const scale = maxSize / Math.max(binding.display.width, binding.display.height);
    icon.setDisplaySize(binding.display.width * scale, binding.display.height * scale);
    icon.setScrollFactor(0);
    this.registerScrollObject(icon, scrollOwnerIndex);
  }

  /** Shared art anchor for Contract, Career and Compendium cards. Semantic IDs
   * come from their read models; this renderer only understands physical
   * binding capabilities. */
  private addPanelArt(root: Phaser.GameObjects.Container, x: number, y: number, artId: string, maxSize: number, subdued = false, animate = false, scrollOwnerIndex?: number): void {
    const binding = this.requireVisualArt().bindingById(artId);
    if (!binding || !this.textures?.exists(binding.textureKey)) return;
    const frame = binding.load.type === 'spritesheet' ? binding.clips?.idle?.start ?? 0 : binding.frameKey;
    const image = this.own(root, animate && binding.load.type === 'spritesheet'
      ? this.add.sprite(x, y, binding.textureKey, frame)
      : this.add.image(x, y, binding.textureKey, frame));
    if (binding.load.type === 'spritesheet') {
      const scale = Math.min(maxSize / binding.load.frame.width, maxSize / binding.load.frame.height);
      image.setScale(scale);
    } else {
      const scale = Math.min(maxSize / binding.display.width, maxSize / binding.display.height);
      image.setDisplaySize(binding.display.width * scale, binding.display.height * scale);
    }
    if (animate && binding.load.type === 'spritesheet' && binding.clips?.idle) {
      (image as Phaser.GameObjects.Sprite).play(visualAnimationKey(binding.id, 'idle'));
    }
    image.setAlpha(subdued ? 0.35 : 1).setScrollFactor(0);
    this.registerScrollObject(image, scrollOwnerIndex);
  }

  /** Enemy identity is already art-backed in the Stage read model. Menus show
   * that identity directly instead of repeating a dense label such as
   * “THREATS Dust Mite • …”. The renderer only lays out generic actor art. */
  private addThreatIconStrip(
    root: Phaser.GameObjects.Container,
    threats: readonly { readonly actorArtId: string }[],
    x: number,
    y: number,
    maxWidth: number,
    iconSize: number,
    gap: number,
  ): number {
    if (threats.length === 0) return 0;
    const columns = Math.max(1, Math.floor((maxWidth + gap) / (iconSize + gap)));
    threats.forEach((threat, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      this.addPanelArt(
        root,
        x + iconSize / 2 + column * (iconSize + gap),
        y + iconSize / 2 + row * (iconSize + gap),
        threat.actorArtId,
        iconSize,
      );
    });
    const rows = Math.ceil(threats.length / columns);
    return rows * iconSize + (rows - 1) * gap;
  }

  /** One guarded lazy-loading lifecycle for the growing visual panels. A
   * completion can repaint only the panel that requested it; pending IDs are
   * drained afterwards so rapid navigation cannot drop a resource closure. */
  private ensurePanelPresentation(
    panel: MainMenuSnapshot['panel'],
    artIds: readonly string[],
    repaintWhenCached = false,
  ): Promise<void> {
    if (!this.textures?.exists) return Promise.resolve();
    if (this.panelArtLoading) {
      artIds.forEach((id) => this.pendingPanelArtIds.add(id));
      this.pendingPanelArtRepaints.add(panel);
      return Promise.resolve();
    }
    const task = this.loadPanelPresentation(panel, artIds, repaintWhenCached);
    this.panelArtInFlight = task;
    const clearTask = () => {
      if (this.panelArtInFlight === task) this.panelArtInFlight = undefined;
    };
    void task.then(clearTask, clearTask);
    return task;
  }

  private async loadPanelPresentation(
    panel: MainMenuSnapshot['panel'],
    artIds: readonly string[],
    repaintWhenCached: boolean,
  ): Promise<void> {
    const generation = this.panelArtGeneration;
    const art = this.requireVisualArt();
    if (panel === 'loadout' || panel === 'equipment') artIds = [...artIds, 'ui-chrome:figma-card', 'ui-chrome:figma-selected', 'ui-chrome:figma-primary', 'ui-chrome:figma-arrow'];
    const resources = new DataVisualResourceRegistry(this.getContext().data);
    const missing = new Map<string, import('../systems/types').VisualTextureResource>();
    for (const artId of artIds) {
      const binding = art.bindingById(artId);
      if (!binding?.resourceId || this.textures.exists(binding.textureKey)) continue;
      const resource = resources.resourceById(binding.resourceId);
      if (resource) missing.set(resource.id, resource);
    }
    if (missing.size === 0) {
      if (repaintWhenCached && generation === this.panelArtGeneration && this.isLive && this.committedPanel === panel && this.controller) {
        this.render(this.controller.snapshot(), 'lazy-art-hydration');
      }
      return;
    }
    this.panelArtLoading = true;
    let loadedAny = false;
    try {
      loadedAny = (await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      )).loaded.length > 0;
    } finally {
      if (generation === this.panelArtGeneration) this.panelArtLoading = false;
    }
    if (generation !== this.panelArtGeneration || !this.isLive) return;
    const animationScene = this as unknown as { readonly anims?: Phaser.Animations.AnimationManager };
    if (loadedAny && animationScene.anims) ensureVisualAnimations(this, art);
    // Drain every resource requested by the current render before repainting.
    // Repainting first can start a second loader in the small gap between the
    // first request completing and its queued backdrop/icon closure draining,
    // leaving a visually settled menu on its primitive fallback.
    if (this.pendingPanelArtIds.size > 0) {
      const pending = [...this.pendingPanelArtIds];
      const repaintPanels = new Set(this.pendingPanelArtRepaints);
      this.pendingPanelArtIds.clear();
      this.pendingPanelArtRepaints.clear();
      const targetPanel = this.committedPanel ?? panel;
      await this.loadPanelPresentation(targetPanel, pending, repaintPanels.has(targetPanel));
    }
    if (loadedAny && this.committedPanel === panel && this.controller) this.render(this.controller.snapshot(), 'lazy-art-hydration');
  }

  /** Career shares terminal Achievement badge identity while retaining its
   * own gallery layout. Missing textures intentionally preserve text/focus. */
  private addAchievementIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string, maxSize = 26, scrollOwnerIndex?: number): void {
    const binding = resolveAchievementIconBinding(this.requireVisualArt(), iconArtId);
    if (!binding || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    const scale = maxSize / Math.max(binding.display.width, binding.display.height);
    icon.setDisplaySize(binding.display.width * scale, binding.display.height * scale);
    icon.setScrollFactor(0);
    this.registerScrollObject(icon, scrollOwnerIndex);
  }

  /** Achievement badges remain lazy menu presentation: Boot does not load a
   * future collection just to reach Home. On completion rerender only if the
   * gallery is still current, so an old promise cannot resurrect stale nodes. */
  private async ensureAchievementPresentation(iconArtIds: readonly string[]): Promise<void> {
    if (this.achievementArtLoading) return;
    // Narrow test / non-rendering harnesses intentionally omit the Phaser
    // texture manager; their semantic gallery assertions remain valid.
    if (!this.textures?.exists) return;
    const context = this.getContext();
    const art = this.requireVisualArt();
    const resources = new DataVisualResourceRegistry(context.data);
    const missing = new Map<string, import('../systems/types').VisualTextureResource>();
    for (const iconArtId of iconArtIds) {
      const binding = resolveAchievementIconBinding(art, iconArtId);
      if (!binding || !binding.resourceId || this.textures.exists(binding.textureKey)) continue;
      const resource = resources.resourceById(binding.resourceId);
      if (resource) missing.set(resource.id, resource);
    }
    if (missing.size === 0) return;
    const generation = this.menuTextureLoadGeneration;
    this.achievementArtLoading = true;
    try {
      const result = await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      );
      if (generation === this.menuTextureLoadGeneration && result.loaded.length > 0 && this.committedPanel === 'achievements' && this.controller) {
        this.render(this.controller.snapshot(), 'lazy-art-hydration');
      }
    } finally {
      if (generation === this.menuTextureLoadGeneration) this.achievementArtLoading = false;
    }
  }

  /** The roster is a menu-only lazy resource closure. Character and weapon
   * identities arrive from the controller/data; the scene never switches on
   * a Mercenary ID or assumes one physical texture per visual. */
  private async ensureMercenaryPresentation(artIds: readonly string[]): Promise<void> {
    if (this.mercenaryArtLoading || !this.textures?.exists) return;
    const context = this.getContext();
    const art = this.requireVisualArt();
    const resources = new DataVisualResourceRegistry(context.data);
    const missing = new Map<string, import('../systems/types').VisualTextureResource>();
    for (const artId of artIds) {
      const binding = art.bindingById(artId);
      if (!binding || !binding.resourceId || this.textures.exists(binding.textureKey)) continue;
      const resource = resources.resourceById(binding.resourceId);
      if (resource) missing.set(resource.id, resource);
    }
    if (missing.size === 0) return;
    const generation = this.menuTextureLoadGeneration;
    this.mercenaryArtLoading = true;
    try {
      const result = await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      );
      if (generation === this.menuTextureLoadGeneration && result.loaded.length > 0 && this.committedPanel === 'character' && this.controller) {
        this.render(this.controller.snapshot(), 'lazy-art-hydration');
      }
    } finally {
      if (generation === this.menuTextureLoadGeneration) this.mercenaryArtLoading = false;
    }
  }

  /** Equipment/sets use the same physical-resource resolver as Career badges,
   * but stay out of Boot because they are not needed to reach the Home panel. */
  private async ensureEquipmentPresentation(iconArtIds: readonly string[]): Promise<void> {
    if (!this.textures?.exists) return;
    if (this.equipmentArtLoading) {
      iconArtIds.forEach(id => this.pendingEquipmentArtIds.add(id));
      return;
    }
    const context = this.getContext();
    const art = this.requireVisualArt();
    const resources = new DataVisualResourceRegistry(context.data);
    const missing = new Map<string, import('../systems/types').VisualTextureResource>();
    for (const iconArtId of iconArtIds) {
      const binding = art.bindingById(iconArtId);
      if (!binding || !binding.resourceId || this.textures.exists(binding.textureKey)) continue;
      const resource = resources.resourceById(binding.resourceId);
      if (resource) missing.set(resource.id, resource);
    }
    if (missing.size === 0) return;
    const generation = this.menuTextureLoadGeneration;
    this.equipmentArtLoading = true;
    let loadedAny = false;
    try {
      const result = await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      );
      loadedAny = result.loaded.length > 0;
    } finally {
      if (generation === this.menuTextureLoadGeneration) this.equipmentArtLoading = false;
    }
    if (generation !== this.menuTextureLoadGeneration) return;
    // Clear the loading flag before fresh-model hydration. The repaint can
    // require an atlas which was absent when the first closure was captured.
    if (loadedAny && (this.committedPanel === 'equipment' || this.committedPanel === 'loadout') && this.controller) {
      this.render(this.controller.snapshot(), 'lazy-art-hydration');
    }
    if (!this.equipmentArtLoading && this.pendingEquipmentArtIds.size > 0) {
      const pending = [...this.pendingEquipmentArtIds];
      this.pendingEquipmentArtIds.clear();
      await this.ensureEquipmentPresentation(pending);
    }
  }

  /** Gunsmith presentation is a data-owned lazy closure. Physical Part art,
   * neutral slots and reusable traits may share one atlas without the scene
   * knowing that resource identity or constructing a semantic art ID. */
  private async ensureGunsmithPresentation(iconArtIds: readonly string[]): Promise<void> {
    if (!this.textures?.exists) return;
    if (this.gunsmithArtLoading) {
      iconArtIds.forEach((id) => this.pendingGunsmithArtIds.add(id));
      return;
    }
    const generation = this.gunsmithArtGeneration;
    const context = this.getContext();
    const art = this.requireVisualArt();
    const resources = new DataVisualResourceRegistry(context.data);
    const missing = new Map<string, import('../systems/types').VisualTextureResource>();
    for (const iconArtId of iconArtIds) {
      const binding = art.bindingById(iconArtId);
      if (!binding || (binding.kind !== 'icon' && binding.kind !== 'weapon-icon') || !binding.resourceId || this.textures.exists(binding.textureKey)) continue;
      const resource = resources.resourceById(binding.resourceId);
      if (resource) missing.set(resource.id, resource);
    }
    if (missing.size === 0) return;
    this.gunsmithArtLoading = true;
    let loadedAny = false;
    try {
      const result = await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      );
      loadedAny = result.loaded.length > 0;
    } finally {
      if (generation === this.gunsmithArtGeneration) this.gunsmithArtLoading = false;
    }
    if (generation !== this.gunsmithArtGeneration || !this.isLive) return;
    if (loadedAny && (this.committedPanel === 'gunsmith' || this.committedPanel === 'loadout') && this.controller) {
      this.render(this.controller.snapshot(), 'lazy-art-hydration');
    }
    if (!this.gunsmithArtLoading && this.pendingGunsmithArtIds.size > 0) {
      const pending = [...this.pendingGunsmithArtIds];
      this.pendingGunsmithArtIds.clear();
      await this.ensureGunsmithPresentation(pending);
    }
  }

  private serializeTextureLoad<T>(load: () => Promise<T>, cancelledResult: T): Promise<T> {
    const generation = this.menuTextureLoadGeneration;
    this.menuTextureLoadPending += 1;
    const loadCurrentGeneration = (): Promise<T> => generation === this.menuTextureLoadGeneration
      ? load()
      : Promise.resolve(cancelledResult);
    const task = this.menuTextureLoadTail.then(loadCurrentGeneration, loadCurrentGeneration);
    this.menuTextureLoadTail = task.then(
      () => this.finishMenuTextureLoad(generation),
      () => this.finishMenuTextureLoad(generation),
    );
    return task;
  }

  /** Capture the loader queue and lifecycle generation atomically. Visual
   * acceptance uses this observable resource boundary instead of guessing how
   * long a constrained runner needs to decode a particular atlas. */
  menuTextureLoadSnapshot(): Readonly<{ generation: number; pending: Promise<void> }> {
    return {
      generation: this.menuTextureLoadGeneration,
      pending: this.menuTextureLoadTail,
    };
  }

  private finishMenuTextureLoad(generation: number): void {
    if (generation === this.menuTextureLoadGeneration) {
      this.menuTextureLoadPending = Math.max(0, this.menuTextureLoadPending - 1);
    }
  }

  private resetMenuTextureLoadQueue(): void {
    this.menuTextureLoadGeneration += 1;
    this.menuTextureLoadPending = 0;
    this.menuTextureLoadTail = Promise.resolve();
  }

  private addBackButton(
    root: Phaser.GameObjects.Container,
    width: number,
    margin: number,
    hitTarget: number,
  ): void {
    const compactLandscape = this.scale.height < 500 && width >= 700;
    const y = compactLandscape
      ? edgeMargin(this.currentViewport!, 'top') + 8
      : this.scale.height - edgeMargin(this.currentViewport!, 'bottom') - hitTarget;
    this.addButton(root, margin, y, 'Back', hitTarget, () => {
      const next = this.requireController().back();
      this.render(next);
    }, 'ui:back', 120, 'action-icon:back');
  }

  /** Start/finish hooks deliberately sit in MenuScene rather than each
   * surface.  They make pointer eligibility a property of the shared region,
   * not an easy-to-forget per-screen convention. */
  private beginScrollableRegion(viewportTop: number, viewportBottom: number): void {
    this.scrollViewportTop = viewportTop;
    this.scrollViewportBottom = Math.max(viewportTop + 1, viewportBottom);
    this.scrollRegion = new ScrollableFocusRegion({
      viewportTop: this.scrollViewportTop,
      viewportBottom: this.scrollViewportBottom,
      itemMargin: 8,
    });
    this.collectingScrollItems = true;
  }

  private endScrollableRegion(): void {
    this.collectingScrollItems = false;
  }

  private registerScrollObject(object: Phaser.GameObjects.GameObject, ownerIndex?: number): void {
    if (!this.scrollRegion || !this.collectingScrollItems) return;
    const positioned = object as unknown as { x: number; y: number; getBounds?: () => { bottom: number } };
    const validOwnerIndex = ownerIndex !== undefined && this.scrollItemIndexes.has(ownerIndex)
      ? ownerIndex
      : undefined;
    this.scrollObjects.push({
      object,
      x: positioned.x,
      y: positioned.y,
      ...(validOwnerIndex === undefined ? {} : { ownerIndex: validOwnerIndex }),
    });
    const bottom = positioned.getBounds?.().bottom;
    const bounds = (object as unknown as { getBounds?: () => { top: number; bottom: number } }).getBounds?.();
    if (validOwnerIndex !== undefined && bounds) {
      const prior = this.scrollItemBounds.get(validOwnerIndex);
      this.scrollItemBounds.set(validOwnerIndex, {
        top: Math.min(prior?.top ?? bounds.top, bounds.top),
        bottom: Math.max(prior?.bottom ?? bounds.bottom, bounds.bottom),
      });
      this.rebuildScrollItems();
    }
    if (bottom !== undefined) this.scrollRegion.includeContentBottom(bottom);
  }

  private rebuildScrollItems(): void {
    if (!this.scrollRegion) return;
    this.scrollRegion.setItems(Array.from(this.scrollItemIndexes).map((itemIndex, localIndex) => {
      this.scrollLocalIndexByFocusIndex.set(itemIndex, localIndex);
      const bounds = this.scrollItemBounds.get(itemIndex) ?? this.focusables[itemIndex]!.getBounds();
      return { index: localIndex, top: bounds.top, bottom: bounds.bottom };
    }));
  }

  private finishScrollableRegion(root: Phaser.GameObjects.Container): void {
    if (!this.scrollRegion || this.scrollItemIndexes.size === 0) return;
    const focused = this.navigator.index;
    if (this.scrollItemIndexes.has(focused)) {
      this.syncScrollFocus(focused);
    } else {
      this.scrollRegion.handleResize();
    }
    this.refreshScrollRail(root);
    this.createScrollMask(root);
    this.applyScrollViewport();
  }

  private refreshScrollRail(root: Phaser.GameObjects.Container): void {
    this.scrollTrack?.destroy();
    this.scrollThumb?.destroy();
    this.scrollTrack = undefined;
    this.scrollThumb = undefined;
    this.scrollThumbHeight = 0;
    if (!this.scrollRegion) return;
    const maxScroll = Math.max(0, this.scrollRegion.contentHeight - this.scrollRegion.viewportHeight);
    if (maxScroll > 0 && this.uiVisuals) {
      const x = this.scale.width - Math.max(7, this.safeRightMargin / 2);
      const centerY = (this.scrollViewportTop + this.scrollViewportBottom) / 2;
      const track = this.uiVisuals.addPanel(this, x, centerY, 8, this.scrollRegion.viewportHeight, 'scroll-track', { alpha: 0.92 });
      if (track) this.scrollTrack = this.own(root, track);
      this.scrollThumbHeight = Math.max(32, this.scrollRegion.viewportHeight
        * (this.scrollRegion.viewportHeight / this.scrollRegion.contentHeight));
      const thumb = this.uiVisuals.addPanel(
        this,
        x,
        this.scrollViewportTop + this.scrollThumbHeight / 2,
        10,
        this.scrollThumbHeight,
        'scroll-thumb',
        { alpha: 0.98 },
      );
      if (thumb) {
        this.scrollThumb = this.own(root, thumb) as Phaser.GameObjects.GameObject & { setPosition?(x: number, y: number): unknown };
      }
    }
  }

  private createScrollMask(root: Phaser.GameObjects.Container): void {
    this.destroyScrollMask();
    const graphics = this.make?.graphics?.({}, false);
    if (!graphics) return;
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(
      0,
      this.scrollViewportTop,
      this.scale.width,
      this.scrollViewportBottom - this.scrollViewportTop,
    );
    const mask = graphics.createGeometryMask();
    this.scrollMaskGraphics = graphics;
    this.scrollMask = mask;
    // One stencil pass clips the entire shared scroll surface. Applying the
    // same mask to every decoration/text flushes and clears WebGL per child,
    // starving input and resource observation on software-rendered desktops.
    const clippedObjects = new Set(this.scrollObjects.map(({ object }) => object));
    // Registration order can differ from authored paint order (card chrome
    // is moved below its label). Preserve the current display list exactly.
    const paintOrder = root.list.filter(object => clippedObjects.has(object));
    const firstClippedIndex = root.list.findIndex(object => clippedObjects.has(object));
    const content = this.own(root, this.add.container(0, 0));
    content.add(paintOrder);
    // Keep later fixed overlays (including launch feedback) above the group.
    if (firstClippedIndex >= 0) root.moveTo(content, firstClippedIndex);
    content.setMask(mask);
    this.scrollMaskContainer = content;
  }

  private destroyScrollMask(): void {
    if (this.scrollMask) {
      this.scrollMaskContainer?.clearMask(false);
      this.scrollMask.destroy();
      this.scrollMask = undefined;
    }
    // The content remains a child of root; root owns its deep destruction.
    this.scrollMaskContainer = undefined;
    this.scrollMaskGraphics?.destroy();
    this.scrollMaskGraphics = undefined;
  }

  private scrollViewportBottomFor(hitTarget: number): number {
    return this.scale.height - edgeMargin(this.currentViewport!, 'bottom', this.loadoutSurface ? 16 : 12) - hitTarget
      - (this.loadoutSurface ? loadoutFooterPadding(this.scale.height) + 8 : 12);
  }

  private syncScrollFocus(focusedIndex: number): void {
    const localIndex = this.scrollLocalIndexByFocusIndex.get(focusedIndex);
    if (!this.scrollRegion || localIndex === undefined) return;
    // ScrollableFocusRegion intentionally has no mutable-index escape hatch:
    // move it through the same deterministic navigation path as real input.
    while (this.scrollRegion.focusedIndex < localIndex) this.scrollRegion.moveFocus('down');
    while (this.scrollRegion.focusedIndex > localIndex) this.scrollRegion.moveFocus('up');
    // The region and global navigator both begin at zero. Moving between
    // indexes therefore cannot reveal an initially focused first action that
    // follows a tall, non-focusable summary. Apply the same visibility rule
    // even when their indexes already agree; Up can still deliberately reveal
    // that prefix and the next Down restores this retained action.
    this.scrollRegion.ensureVisible(localIndex);
  }

  private applyScrollViewport(): void {
    if (!this.scrollRegion) return;
    const offset = this.scrollRegion.scrollOffset;
    const maxScroll = Math.max(0, this.scrollRegion.contentHeight - this.scrollRegion.viewportHeight);
    if (this.scrollThumb && maxScroll > 0) {
      const travel = this.scrollRegion.viewportHeight - this.scrollThumbHeight;
      this.scrollThumb.setPosition?.(
        this.scale.width - Math.max(7, this.safeRightMargin / 2),
        this.scrollViewportTop + this.scrollThumbHeight / 2 + travel * (offset / maxScroll),
      );
    }
    for (const entry of this.scrollObjects) {
      const object = entry.object as unknown as {
        setPosition?(x: number, y: number): unknown;
        setVisible?(visible: boolean): unknown;
      };
      object.setPosition?.(entry.x, entry.y - offset);
      // Keep every scroll object alive and let the geometry mask crop it at
      // the viewport edge. Hiding a whole card as soon as one grouped child
      // crossed the boundary produced the abrupt, paged-looking scroll the
      // production UI is explicitly meant to avoid.
      object.setVisible?.(true);
    }
    for (const index of this.scrollItemIndexes) {
      const text = this.focusables[index];
      if (!text) continue;
      const groupBounds = this.scrollItemBounds.get(index);
      const bounds = groupBounds === undefined
        ? text.getBounds()
        : { top: groupBounds.top - offset, bottom: groupBounds.bottom - offset };
      const visible = bounds.bottom > this.scrollViewportTop && bounds.top < this.scrollViewportBottom;
      text.setVisible(true);
      const ring = this.focusRings[index];
      ring?.setVisible?.(true);
      if (visible && !this.disabledFocusables.has(text)) text.setInteractive({ useHandCursor: true });
      else text.disableInteractive();
    }
  }

  private handleScroll(delta: number): void {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    if (!this.committedDisplay || !this.scrollRegion) return;
    this.scrollRegion.scrollBy(delta);
    this.applyScrollViewport();
    this.applyFocus();
  }

  private readonly handleWheel = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void => {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    this.handleScroll(deltaY);
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    if (!pointer.isDown) {
      this.touchScrollY = undefined;
      return;
    }
    // Home and other fixed panels do not own a drag gesture. Treating normal
    // touch jitter there as a scroll suppresses the button's pointer-up and
    // makes a command appear to require a second tap.
    if (!this.scrollRegion) return;
    if (this.touchScrollY !== undefined) {
      const delta = this.touchScrollY - pointer.y;
      this.touchDragDistance += Math.abs(delta);
      if (this.touchDragDistance >= 8) this.touchDidScroll = true;
      this.handleScroll(delta);
    }
    this.touchScrollY = pointer.y;
  };

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    if (!this.scrollRegion) {
      this.touchScrollY = undefined;
      this.touchDragDistance = 0;
      this.touchDidScroll = false;
      return;
    }
    this.touchScrollY = pointer.y;
    this.touchDragDistance = 0;
    this.touchDidScroll = false;
  };

  private readonly handlePointerUp = (): void => {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    this.touchScrollY = undefined;
    this.touchDragDistance = 0;
  };

  private handleBack(): void {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    this.inputController?.quarantineUntilNeutral();
    // Home Esc is still a back command; it emits even when the controller
    // refuses (already home).
    this.bus?.emit('ui:back', {});
    const next = this.requireController().back();
    this.render(next);
  }

  private readonly handleResize = (): void => {
    if (!this.controller) return;
    this.render(this.controller.snapshot(), 'viewport-resize');
  };

  private handleNavMove(direction: FocusDirection | number): void {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    // No committed display (never rendered, or a failed rebuild left only the
    // fallback): the retained navigator must not move or emit (F1).
    if (!this.committedDisplay) return;
    const resolved = typeof direction === 'number' ? (direction < 0 ? 'up' : 'down') : direction;
    const localFocus = this.scrollLocalIndexByFocusIndex.get(this.navigator.index);
    if (resolved === 'up' && this.scrollRegion && localFocus === 0
      && this.scrollRegion.scrollToStart()) {
      this.applyScrollViewport();
      this.bus?.emit('ui:navigate', {});
      this.applyFocus();
      return;
    }
    if (resolved === 'down' && this.scrollRegion && localFocus === 0
      && this.scrollRegion.ensureFocusedVisible()) {
      this.applyScrollViewport();
      this.bus?.emit('ui:navigate', {});
      this.applyFocus();
      return;
    }
    if (resolved === 'down' && this.scrollRegion && localFocus === this.scrollRegion.itemCount - 1
      && this.scrollRegion.scrollToEnd()) {
      this.applyScrollViewport();
      this.bus?.emit('ui:navigate', {});
      this.applyFocus();
      return;
    }
    const moved = this.committedPanel === 'home'
      ? this.moveHomeFocus(resolved)
      : this.committedPanel === 'equipment' || this.committedPanel === 'loadout'
        ? this.moveLoadoutFocus(resolved)
        : this.navigator.move(resolved);
    if (moved) {
      this.syncScrollFocus(this.navigator.index);
      this.applyScrollViewport();
    }
    if (moved) {
      this.bus?.emit('ui:navigate', {});
    }
    this.applyFocus();
  }

  /** The slot header is spatial; its full-width candidate/detail body retains
   * the shared linear navigator and scroll owner. */
  private moveLoadoutFocus(direction: FocusDirection): boolean {
    const current = this.navigator.index;
    if (current < 0 || this.focusables.length < 4) return this.navigator.move(direction);
    const columns = this.equipmentSlotColumns;
    let next = current;
    if (current < 4) {
      if (direction === 'left' && current % columns > 0) next = current - 1;
      if (direction === 'right' && current % columns < columns - 1) next = current + 1;
      if (direction === 'up' && current >= columns) next = current - columns;
      if (direction === 'down') next = current + columns < 4 ? current + columns : Math.min(4, this.focusables.length - 1);
    } else if (current === 4 && direction === 'up') next = 4 - columns;
    else return this.navigator.move(direction);
    return this.navigator.setIndex(next);
  }

  /**
   * Home is a mixed layout: two full-width actions, two paired rows, then a
   * full-width Settings action. Keep keyboard/controller movement spatial so
   * vertical input never unexpectedly jumps sideways across a paired row.
   */
  private moveHomeFocus(direction: FocusDirection): boolean {
    // Test seams and recovery displays can temporarily expose fewer targets;
    // retain the navigator's ordinary count-aware behavior in that case.
    if (this.focusables.length !== 7) return this.navigator.move(direction);
    const current = this.navigator.index;
    // Compact landscape uses a roomy 4+3 gallery so destination art remains
    // recognizable. Navigation follows those two rows exactly.
    if (this.scale.height < 500 && this.scale.width >= 700) {
      const vertical: Readonly<Record<number, readonly [number, number]>> = {
        0: [4, 4], 1: [4, 4], 2: [5, 5], 3: [6, 6],
        4: [0, 0], 5: [2, 2], 6: [3, 3],
      };
      const horizontal: Readonly<Record<number, readonly [number, number]>> = {
        0: [3, 1], 1: [0, 2], 2: [1, 3], 3: [2, 0],
        4: [6, 5], 5: [4, 6], 6: [5, 4],
      };
      const next = direction === 'up' || direction === 'down'
        ? vertical[current]?.[direction === 'up' ? 0 : 1]
        : horizontal[current]?.[direction === 'left' ? 0 : 1];
      if (next === undefined || next === current) return false;
      this.navigator.setIndex(next);
      return true;
    }
    const vertical: Readonly<Record<number, readonly [number, number]>> = {
      0: [6, 1],
      1: [0, 2],
      2: [1, 4],
      3: [1, 5],
      4: [2, 6],
      5: [3, 6],
      6: [4, 0],
    };
    const horizontal: Readonly<Record<number, readonly [number, number]>> = {
      0: [0, 0],
      1: [1, 1],
      2: [2, 3],
      3: [2, 3],
      4: [4, 5],
      5: [4, 5],
      6: [6, 6],
    };
    const next = direction === 'up' || direction === 'down'
      ? vertical[current]?.[direction === 'up' ? 0 : 1]
      : horizontal[current]?.[direction === 'left' ? 0 : 1];
    if (next === undefined || next === current) return false;
    this.navigator.setIndex(next);
    return true;
  }

  private handleActivate(): void {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    if (!this.committedDisplay) return;
    const focused = this.focusables[this.navigator.index];
    if (!focused || this.disabledFocusables.has(focused)) return;
    // The destination panel cannot consume other edges sampled for this one.
    this.inputController?.quarantineUntilNeutral();
    focused.emit(Phaser.Input.Events.POINTER_UP);
  }

  private applyFocus(): void {
    this.focusables.forEach((text, index) => {
      const color = this.sectionButtons.has(text) ? '#f78003' : '#f7f1d5';
      // Phaser rerasterizes Text even when setStyle repeats the same colour.
      if (text.style?.color !== color) text.setStyle({ color });
      const visible = this.inputController?.getInputMode() !== 'pointer'
        ? index === this.navigator.index
        : index === this.hoveredIndex;
      this.focusRings[index]?.setAlpha?.(visible ? FocusStroke.alpha : 0);
      this.focusRings[index]?.setStrokeStyle?.(FocusStroke.width, FocusStroke.color, visible ? FocusStroke.alpha : 0);
    });
  }

  private refreshInputPresentation(): void {
    const mode = this.inputController?.getInputMode() ?? 'pointer';
    if (mode === this.lastInputMode) return;
    this.lastInputMode = mode;
    this.hint?.setText?.(this.menuHintCopy());
    this.applyFocus();
  }

  private menuHintCopy(): string {
    switch (this.inputController?.getInputMode() ?? 'pointer') {
      case 'keyboard': return 'Arrows navigate • Enter/Space select • Q ability in run • Esc back';
      case 'gamepad': return 'D-pad/stick • Bottom face select • Left face ability in run • Right face back';
      default: return 'Tap a choice';
    }
  }

  private handleShutdown(): void {
    this.isLive = false;
    this.resetMenuTextureLoadQueue();
    this.runLaunchGeneration += 1;
    this.gunsmithArtGeneration += 1;
    this.gunsmithArtLoading = false;
    this.mercenaryArtLoading = false;
    this.equipmentArtLoading = false;
    this.pendingEquipmentArtIds.clear();
    this.achievementArtLoading = false;
    this.pendingGunsmithArtIds.clear();
    this.panelArtGeneration += 1;
    this.pendingPanelArtIds.clear();
    this.pendingPanelArtRepaints.clear();
    this.panelArtLoading = false;
    this.panelArtInFlight = undefined;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
    this.scale.off?.(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.off('wheel', this.handleWheel, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);
    this.removeAudioUnlockListeners();
    this.inputController?.destroy();
    this.inputController = undefined;
    this.destroyScrollMask();
    this.disposePanelSurfaces();
    this.runLaunchProgressText = undefined;
    this.root?.destroy(true);
    this.root = undefined;
    // Clear the hint reference BEFORE the root destroy: it is the only
    // Phaser.GameObjects field Menu retains across shutdown, and a stale
    // reference would let a later presentation refresh call setText() on
    // destroyed Text (round-9).
    this.hint = undefined;
    this.focusables = [];
    this.focusKeyByButton.clear();
    this.nextFocusKey = undefined;
    this.nextFocusAlignTop = false;
    this.focusRings = [];
    this.scrollRegion?.destroy();
    this.scrollRegion = undefined;
    this.scrollTrack = undefined;
    this.scrollThumb = undefined;
    this.scrollThumbHeight = 0;
    this.collectingScrollItems = false;
    this.scrollItemIndexes.clear();
    this.scrollLocalIndexByFocusIndex.clear();
    this.scrollObjects = [];
    this.scrollItemBounds.clear();
    this.navigator.setCount(0);
    this.committedPanel = undefined;
    this.committedDisplay = false;
    this.hoveredIndex = -1;
    this.controller = undefined;
    this.visualArt = undefined;
    // The manager is game-scoped and Boot-owned: shutdown only drops this
    // scene's reference — never destroy/stopMusic/stopAll.
    this.audioManager = undefined;
  }

  private getContext(): GameContext {
    return getGameContext(this);
  }

  private requireVisualArt(): DataVisualArtRegistry {
    if (!this.visualArt) throw new Error('Visual art registry missing from MenuScene');
    return this.visualArt;
  }

  private requireController(): MainMenuController {
    if (!this.controller) {
      throw new Error('MainMenuController missing from MenuScene');
    }
    return this.controller;
  }

  private readonly handleAudioUnlock = (): void => {
    this.removeAudioUnlockListeners();
    this.audioManager?.unlock();
  };

  private installAudioUnlockListeners(): void {
    if (!this.audioManager) {
      return;
    }
    this.removeAudioUnlockListeners();
    this.audioUnlockUnsub = this.inputController!.onAnyAction(() =>
      this.handleAudioUnlock(),
    );
    this.input.once(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
  }

  private removeAudioUnlockListeners(): void {
    this.audioUnlockUnsub?.();
    this.audioUnlockUnsub = undefined;
    this.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
  }

  private getAudioManager(): AudioManager | undefined {
    return getAudioManager(this);
  }
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '—';
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function achievementStatusCopy(achievement: MainMenuSnapshot['achievements']['achievements'][number]): string {
  switch (achievement.status) {
    case 'completed': return 'Completed';
    case 'in-progress': return 'In progress';
    default: return 'Locked';
  }
}
