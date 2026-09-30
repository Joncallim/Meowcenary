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
import { loadTextureResources, prepareRunPresentation, resolveRunPhysicalResources, type ResourceLoadProgress, type ResourceLoadResult } from '../systems/resourceLoader';
import { DataVisualArtRegistry, DataVisualResourceRegistry, ensureVisualAnimations, resolveAchievementIconBinding, visualAnimationKey } from '../systems/visualArt';
import { isPortraitOrientationBlocked } from '../platform/orientation';
import { createUiVisualChrome, type UiVisualChrome } from '../ui/visualChrome';
import { presentLoadoutModifier, type LoadoutEffectPresentation } from '../ui/loadoutPresentation';
import type { EquipmentComparison, EquipmentLoadoutPresentation, EquipmentSetProgressPresentation } from '../ui/equipmentPresentation';
import type { GunsmithAssembledPreview } from '../ui/gunsmithController';

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

/** Player verbs live at the presentation boundary; gameplay command reasons
 * stay out of normal UI copy. */
function gunsmithPartActionCopy(part: import('../ui/gunsmithController').GunsmithPartView): string {
  switch (part.state) {
    case 'fitted-here': return 'UNEQUIP';
    case 'owned-unfitted': return 'FIT';
    case 'fitted-elsewhere': return `MOVE FROM ${part.assignedBuildName?.toUpperCase() ?? 'OTHER BUILD'}`;
    case 'incompatible': return part.comparisonSummary;
  }
}

export class MenuScene extends Phaser.Scene {
  private controller?: MainMenuController;
  private root?: Phaser.GameObjects.Container;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusKeyByButton = new Map<Phaser.GameObjects.Text, string>();
  private nextFocusKey?: string;
  private nextFocusAlignTop = false;
  private equipmentSlotColumns = 2;
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
  private safeCenterX = 0;
  private safeRightMargin = 16;
  private currentViewport?: UiViewport;
  private touchScrollY?: number;
  private touchDragDistance = 0;
  private touchDidScroll = false;
  private achievementArtLoading = false;
  private mercenaryArtLoading = false;
  private equipmentArtLoading = false;
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
  private buttonChrome: Phaser.GameObjects.GameObject[] = [];
  /** A run never starts against the boot bundle alone. This state remains in
   * Menu so a load failure has a usable Retry/Back surface rather than a
   * partially constructed GameScene. */
  private runLaunchState: 'idle' | 'loading' | 'failed' = 'idle';
  private runLaunchProgress?: ResourceLoadProgress;
  private runLaunchPresentation?: { readonly heading: string; readonly subject: string; readonly mercenary: string };
  private runLaunchGeneration = 0;
  private isLive = false;
  /** Number of committed render attempts; resize tests assert one per event. */
  get renderRebuildCount(): number {
    return this.rebuildCount;
  }

  /** Read-only browser acceptance seam: observes production focus, geometry
   * and presentation state without invoking commands or resolving rules. */
  loadoutUiDiagnostics() {
    const snapshot = this.controller?.snapshot();
    return {
      panel: this.committedPanel,
      focusedKey: this.focusKeyByButton.get(this.focusables[this.navigator.index]!),
      copy: (this.root?.list ?? []).flatMap((object) => {
        const text = object as Phaser.GameObjects.Text;
        return typeof text.text === 'string' ? [text.text] : [];
      }),
      buttons: this.focusables.map((button, index) => {
        const bounds = button.getBounds();
        return { key: this.focusKeyByButton.get(button) ?? (button.text === 'Back' ? 'back' : undefined),
          text: button.text, focused: index === this.navigator.index, visible: button.visible,
          interactive: button.input?.enabled === true,
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
      }),
      scroll: this.scrollRegion ? { top: this.scrollViewportTop, bottom: this.scrollViewportBottom,
        offset: this.scrollRegion.scrollOffset, contentHeight: this.scrollRegion.contentHeight } : undefined,
      equipment: snapshot && (snapshot.panel === 'equipment' || snapshot.panel === 'loadout') ? {
        selectedSlot: snapshot.equipment.selectedSlot,
        selectedInstanceId: snapshot.equipment.selectedInstanceId,
        selectedBlueprintId: snapshot.equipment.selectedBlueprintId,
        equipped: snapshot.equipment.equipped,
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
    this.achievementArtLoading = false;
    this.pendingGunsmithArtIds.clear();
    this.panelArtGeneration += 1;
    this.panelArtLoading = false;
    this.panelArtInFlight = undefined;
    this.pendingPanelArtIds.clear();
    this.pendingPanelArtRepaints.clear();
    this.isLive = true;
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

  private render(snapshot: MainMenuSnapshot): void {
    this.rebuildCount += 1;
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

    const width = this.scale.width;
    const viewport: UiViewport = responsiveUiViewport(this.scale.width, this.scale.height);
    this.currentViewport = viewport;
    const contentInsets = responsiveContentInsets(
      width,
      edgeMargin(viewport, 'left'),
      edgeMargin(viewport, 'right'),
      840,
    );
    const leftMargin = contentInsets.left;
    const topMargin = edgeMargin(viewport, 'top');
    this.safeRightMargin = contentInsets.right;
    this.safeCenterX = (leftMargin + width - this.safeRightMargin) / 2;
    const margin = leftMargin;
    const hitTarget = minimumHitTarget(viewport);

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
      if (lockupBinding && this.textures?.exists?.(lockupBinding.textureKey) && typeof this.add.image === 'function') {
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

      const contentTop = (snapshot.notice ? 96 : 76) + topMargin;
      const contentPanel = this.uiVisuals?.addPanel(
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
          this.renderLoadout(root, snapshot, width, contentTop, margin, hitTarget);
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
          this.renderGunsmith(root, snapshot, width, contentTop, margin, hitTarget);
          break;
        case 'equipment':
          this.renderEquipment(root, snapshot, width, contentTop, margin, hitTarget);
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
      this.finishScrollableRegion(root);
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

  private loadoutEffectCopy(effects: readonly LoadoutEffectPresentation[]): string {
    return effects.map((effect) => `${effect.kind === 'modifier' ? effect.text : effect.label} [${effect.target.label}]`).join(' • ');
  }

  private renderScopedLoadoutEffects(root: Phaser.GameObjects.Container, effects: readonly LoadoutEffectPresentation[], left: number, top: number, width: number): number {
    let y = top;
    for (const effect of effects) {
      const copy = this.loadoutCopy(root, left + 30, y, this.loadoutEffectCopy([effect]), width - 30);
      this.addPanelArt(root, left + 12, y + 12,
        effect.target.kind === 'mercenary' ? 'nav-icon:mercenary' : 'nav-icon:gunsmith', 22);
      y += Math.max(26, copy.height) + 6;
    }
    return y;
  }

  private loadoutCopy(root: Phaser.GameObjects.Container, x: number, y: number, text: string, width: number, color = '#d6f7ff'): Phaser.GameObjects.Text {
    const copy = this.own(root, createUiText(this, x, y, text, {
      color, fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: 4,
      wordWrap: { width },
    }));
    this.registerScrollObject(copy);
    return copy;
  }

  private rememberLoadoutFocus(button: Phaser.GameObjects.Text, key: string): Phaser.GameObjects.Text {
    this.focusKeyByButton.set(button, key);
    return button;
  }

  private setProgressCopy(set: EquipmentSetProgressPresentation): string {
    const pips = set.pips.map((equipped) => equipped ? '●' : '○').join('');
    return `${set.name}  ${pips}  ${set.equippedCount}/4${set.nextThreshold ? ` • Next bonus at ${set.nextThreshold}` : ''}\n${set.thresholds.map((threshold) =>
      `${threshold.count}-piece ${threshold.active ? 'ACTIVE' : 'INACTIVE'}: ${this.loadoutEffectCopy(threshold.effects)}`).join('\n')}`;
  }

  private renderLoadout(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Loadout');
    const contentWidth = Math.min(840, width - margin - this.safeRightMargin);
    const left = this.safeCenterX - contentWidth / 2;
    let y = top + heading.height + 12;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    const equipment = snapshot.equipment;
    const gunsmith = snapshot.gunsmith;
    const selectedCharacter = snapshot.character.characters.find((row) => row.selected);
    const character = this.loadoutCopy(root, left + 76, y, `${selectedCharacter?.name ?? 'Mercenary'}\n${this.getContext().saveData.progression.scrap} Scrap`, contentWidth - 76);
    if (selectedCharacter) this.addPanelArt(root, left + 34, y + 36, selectedCharacter.portraitArtId, 68);
    y += Math.max(76, character.height + 12);
    const title = this.loadoutCopy(root, left, y, 'EQUIPMENT • WHOLE LOADOUT', contentWidth);
    y += title.height + 8;
    y = this.renderEquipmentSlots(root, snapshot, left, y, contentWidth, hitTarget, true);
    const equippedEffects = equipment.presentation.slots.flatMap((slot) => slot.equipped?.effects ?? []);
    if (equippedEffects.length) {
      const effectHeading = this.loadoutCopy(root, left, y, 'EQUIPPED EFFECTS', contentWidth);
      y += effectHeading.height + 6;
      y = this.renderScopedLoadoutEffects(root, equippedEffects, left, y, contentWidth);
    }
    const sets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    const setHeading = this.loadoutCopy(root, left, y, 'ACTIVE SETS', contentWidth);
    y += setHeading.height + 6;
    if (sets.length === 0) y += this.loadoutCopy(root, left, y, 'No Set pieces equipped', contentWidth).height + 8;
    for (const set of sets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    const selected = gunsmith.selectedBuild;
    const family = gunsmith.families.find((row) => row.id === selected?.familyId);
    const gunsmithHeading = this.loadoutCopy(root, left, y, 'GUNSMITH • ENGINEERED WEAPON FAMILY', contentWidth);
    y += gunsmithHeading.height + 10;
    if (selected) {
      const previewHeight = 100;
      if (selected.preview) {
        this.renderAssembledWeapon(root, selected.preview, this.safeCenterX, y + 40);
        selected.preview.traitEmblems.forEach((trait, index) => this.addCatalogIcon(root, left + 22 + index * 40, y + 40, trait.iconArtId, 34));
      }
      y += previewHeight;
      const familyCopy = this.loadoutCopy(root, left, y, `${family?.name ?? selected.familyId} • ACTIVE\n${selected.activation.toUpperCase()}\n${selected.summary}`, contentWidth);
      y += familyCopy.height + 8;
      const scoped = equipment.presentation.runTruth.modifiers.filter((modifier) => modifier.scope?.kind === 'weapon-family' && modifier.scope.family === selected.familyId);
      if (scoped.length) y = this.renderScopedLoadoutEffects(root, scoped.map((modifier) => presentLoadoutModifier(modifier)), left, y, contentWidth);
      const truth = equipment.presentation.runTruth.families.find((entry) => entry.familyId === selected.familyId);
      for (const trait of truth?.traits ?? []) {
        y += this.loadoutCopy(root, left, y, `${trait.trait} [${family?.name ?? selected.familyId}]${trait.deduplicated ? ' • Does not stack' : ''}\nSources: ${trait.sourceLabels.join(' • ')}`, contentWidth).height + 6;
      }
    } else y += this.loadoutCopy(root, left, y, 'Choose a weapon family to engineer', contentWidth).height + 8;
    const actionWidth = Math.min(560, contentWidth);
    const actionX = this.safeCenterX - actionWidth / 2;
    this.rememberLoadoutFocus(this.addButton(root, actionX, y, 'Equipment', Math.max(hitTarget, 60), () => this.render(this.requireController().open('equipment')), 'ui:confirm', actionWidth, 'nav-icon:equipment'), 'loadout:equipment');
    y += Math.max(hitTarget, 60) + 10;
    this.rememberLoadoutFocus(this.addButton(root, actionX, y, 'Gunsmith', Math.max(hitTarget, 60), () => this.render(this.requireController().open('gunsmith')), 'ui:confirm', actionWidth, 'nav-icon:gunsmith'), 'loadout:gunsmith');
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('loadout', selectedCharacter ? [selectedCharacter.portraitArtId, 'nav-icon:equipment', 'nav-icon:gunsmith'] : ['nav-icon:equipment', 'nav-icon:gunsmith']);
    void this.ensureEquipmentPresentation(equipment.owned.flatMap((item) => [item.iconArtId, item.setEmblemArtId]));
    void this.ensureGunsmithPresentation(this.collectGunsmithArtIds(snapshot));
  }

  private renderEquipmentSlots(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, left: number, top: number, contentWidth: number, hitTarget: number, overview = false): number {
    const columns = contentWidth >= 650 ? 4 : 2;
    this.equipmentSlotColumns = columns;
    const gap = 8;
    const slotWidth = (contentWidth - gap * (columns - 1)) / columns;
    let y = top;
    for (let row = 0; row < 4 / columns; row += 1) {
      let rowHeight = Math.max(hitTarget, 102);
      snapshot.equipment.presentation.slots.slice(row * columns, (row + 1) * columns).forEach((slot, column) => {
        const x = left + column * (slotWidth + gap);
        const item = slot.equipped;
        const label = `${slot.label.toUpperCase()}\n${item ? `${item.name}\nT${item.tier} • EQUIPPED` : 'Empty'}`;
        const button = this.addButton(root, x, y, label, rowHeight, () => {
          const next = this.requireController().selectEquipmentSlot(slot.slot);
          this.nextFocusKey = `equipment-slot:${slot.slot}`;
          this.render(overview ? this.requireController().open('equipment') : next);
        }, 'ui:confirm', slotWidth, undefined, 0, item ? 50 : 0, true, 'left');
        this.rememberLoadoutFocus(button, `equipment-slot:${slot.slot}`);
        const index = this.focusables.indexOf(button);
        if (item) this.addCatalogIcon(root, x + 26, y + Math.min(button.height / 2, 50), item.iconArtId, 44, index);
        rowHeight = Math.max(rowHeight, button.height);
      });
      y += rowHeight + gap;
    }
    return y + 6;
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
          this.render(this.requireController().snapshot());
        }
      }), undefined);
      if (!this.isLive || generation !== this.runLaunchGeneration || this.runLaunchState !== 'loading') return;
      this.scene.start(SceneKey.Game, { runRequest: request, runStartPresentation, isTraining });
    } catch (error) {
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
    const presentation = this.runLaunchPresentation;
    const copy = [presentation?.heading ?? 'PREPARING CONTRACT', presentation?.subject, presentation?.mercenary,
      this.runLaunchProgress && `Loading ${this.runLaunchProgress.completed} / ${this.runLaunchProgress.total}`].filter(Boolean).join('\n');
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

  private renderGunsmith(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Gunsmith');
    let y = top + heading.height + 14;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    const chassis = this.own(root, createUiText(this, margin, y, 'Weapon builds', {
      color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
    }));
    this.registerScrollObject(chassis);
    y += hitTarget * 0.7;
    snapshot.gunsmith.families.forEach((family) => {
      const label = `${family.name} Build`;
      const status = family.selected ? 'SELECTED' : family.existingBuildId ? 'CONFIGURED' : 'EMPTY — TAP TO CREATE';
      const familyCard = this.addButton(root, margin, y, label, 100, () => this.render(family.existingBuildId
        ? this.requireController().selectGunBuild(family.existingBuildId)
        : this.requireController().createGunBuild(family.id)), 'ui:confirm', width - margin - this.safeRightMargin, undefined, 8, 176, true);
      const rowOwnerIndex = this.focusables.length - 1;
      this.addCatalogIcon(root, margin + 78, y + 50, family.previewBaseArtId ?? family.iconArtId, 146, rowOwnerIndex);
      const statusCopy = this.own(root, createUiText(this, margin + 176, y + 50, status, {
        color: family.selected ? '#86efac' : '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, fontStyle: '700',
      }));
      statusCopy.setScrollFactor(0);
      this.registerScrollObject(statusCopy, rowOwnerIndex);
      y += familyCard.height + 10;
    });
    const selected = snapshot.gunsmith.selectedBuild;
    if (!selected) {
      const prompt = this.own(root, createUiText(this, margin, y, 'Choose a weapon build to inspect its engineering.', {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      this.registerScrollObject(prompt);
    } else {
      const buildHeader = this.own(root, createUiText(this, margin, y, `${selected.title.toUpperCase()}\n${selected.status} • ${selected.activation}`, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      this.registerScrollObject(buildHeader);
      y += buildHeader.height + 12;
      if (selected.preview) {
        const previewHeight = 142;
        const previewWidth = width - margin - this.safeRightMargin;
        const previewPanel = this.uiVisuals?.addPanel(this, this.safeCenterX, y + previewHeight / 2, previewWidth, previewHeight, 'card', { alpha: 0.82 });
        if (previewPanel) {
          this.own(root, previewPanel);
          this.registerScrollObject(previewPanel);
        }
        const weaponX = this.safeCenterX;
        const weaponY = y + 48;
        this.renderAssembledWeapon(root, selected.preview, weaponX, weaponY);
        selected.preview.traitCores.forEach((core, index) => {
          this.addCatalogIcon(root, margin + 30 + index * 52, y + 30, core.iconArtId, 44);
        });
        selected.preview.traitEmblems.forEach((trait, index) => {
          this.addCatalogIcon(root, width - this.safeRightMargin - 24 - index * 40, y + 30, trait.iconArtId, 34);
        });
        const summary = this.own(root, createUiText(this, this.safeCenterX, y + 100, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          align: 'center', wordWrap: { width: previewWidth - 24 },
        })).setOrigin(0.5, 0);
        this.registerScrollObject(summary);
        y += Math.max(previewHeight, 104 + summary.height) + 12;
      } else {
        const summary = this.own(root, createUiText(this, margin, y, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
        this.registerScrollObject(summary);
        y += summary.height + 10;
      }
      snapshot.gunsmith.slots.forEach((slot) => {
        const slotHeading = this.own(root, createUiText(this, margin + 42, y + 4, slot.slot === 'trait'
          ? `${slot.label.toUpperCase()} ${slot.candidates.filter((part) => part.state === 'fitted-here').length} / 2`
          : slot.label.toUpperCase(), {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.registerScrollObject(slotHeading);
        this.addCatalogIcon(root, margin + 18, y + 16, slot.iconArtId, 32);
        y += Math.max(slotHeading.height + 8, 36);
        if (slot.unavailableFitted) {
          const row = this.addButton(root, margin, y, `${slot.unavailableFitted.label}\nREMOVE UNAVAILABLE PART`, hitTarget,
            () => this.render(this.requireController().removeUnavailableGunPart(slot.unavailableFitted!.instanceId)), 'ui:confirm', width - margin - this.safeRightMargin);
          y += row.height + 8;
        }
        if (slot.candidates.length === 0 && slot.fitted === undefined && slot.unavailableFitted === undefined) {
          const empty = this.own(root, createUiText(this, margin, y, slot.slot === 'trait' ? 'No Trait Core fitted' : 'Empty', {
            color: '#94a3b8', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          }));
          this.registerScrollObject(empty);
          y += empty.height + 8;
          return;
        }
        slot.candidates.forEach((part) => {
          const action = part.state === 'incompatible' && slot.fitted !== undefined
            ? `${slot.label} occupied — unequip ${slot.fitted.name} first`
            : gunsmithPartActionCopy(part);
          const label = `${part.name} T${part.tier} • ${part.state === 'fitted-here' ? 'FITTED' : part.state === 'fitted-elsewhere' ? `FITTED TO ${part.assignedBuildName?.toUpperCase() ?? 'ANOTHER BUILD'}` : part.state === 'owned-unfitted' ? 'OWNED' : 'UNAVAILABLE'}\n${[...part.effectLines, ...part.traitLines.map((trait) => `${trait} trait`)].join(' • ') || 'No stat change'}\n${action}`;
          const enabled = part.state !== 'incompatible';
          const iconColumn = 68 + part.traitIcons.length * 38;
          const partRowHeight = Math.max(hitTarget, 76);
          const row = this.addButton(root, margin, y, label, partRowHeight, () => this.render(part.state === 'fitted-here'
            ? this.requireController().unequipGunPart(part.instanceId)
            : this.requireController().fitGunPart(part.instanceId)), 'ui:confirm', width - margin - this.safeRightMargin, undefined, 0, iconColumn);
          const rowOwnerIndex = this.focusables.length - 1;
          if (!enabled) this.disableButton(row);
          this.addCatalogIcon(root, margin + 30, y + partRowHeight / 2, part.iconArtId, 52, rowOwnerIndex);
          part.traitIcons.forEach((trait, index) => {
            this.addCatalogIcon(root, width - this.safeRightMargin - 24 - index * 38, y + partRowHeight / 2, trait.iconArtId, 32, rowOwnerIndex);
          });
          y += row.height + 8;
        });
      });
      if (snapshot.gunsmith.workshop.length > 0) {
        const workshop = this.own(root, createUiText(this, margin, y, 'WORKSHOP', {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.registerScrollObject(workshop);
        y += workshop.height + 4;
        snapshot.gunsmith.workshop.forEach((recipe) => {
          const row = this.addButton(root, margin, y, recipe.label, Math.max(hitTarget, 62),
            () => this.render(recipe.kind === 'merge'
              ? this.requireController().beginGunMerge(recipe.groupId)
              : this.requireController().requestGunWorkshop({ kind: 'infuse', targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId })), 'ui:confirm', width - margin - this.safeRightMargin, 'ui-chrome:merge');
          y += row.height + 8;
        });
      }
      if (snapshot.gunsmith.mergeSelection && !snapshot.gunsmith.confirmation) {
        const selection = snapshot.gunsmith.mergeSelection;
        const selectionHeading = this.own(root, createUiText(this, margin, y, selection.title.toUpperCase(), {
          color: '#f7d774', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.registerScrollObject(selectionHeading);
        y += selectionHeading.height + 4;
        selection.choices.forEach((choice) => {
          const row = this.addButton(root, margin, y, `${choice.recommended ? 'RECOMMENDED • ' : ''}${choice.label}`, hitTarget,
            () => this.render(this.requireController().selectGunMergeInput(choice.instanceId)), 'ui:confirm', width - margin - this.safeRightMargin);
          y += row.height + 8;
        });
      }
      if (snapshot.gunsmith.confirmation) {
        const confirmation = snapshot.gunsmith.confirmation;
        const detail = [
          confirmation.title.toUpperCase(),
          'INPUTS', ...confirmation.inputLines,
          'OUTPUT', confirmation.outputLine,
          ...confirmation.mechanicalDelta,
        ].join('\n');
        const panel = this.own(root, createUiText(this, margin, y, detail, {
          color: '#f7d774', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
        this.registerScrollObject(panel);
        y += panel.height + 6;
        const actionWidth = Math.max(120, (width - margin - this.safeRightMargin - 8) / 2);
        const confirm = this.addButton(root, margin, y, confirmation.confirmLabel, hitTarget,
          () => this.render(this.requireController().confirmGunWorkshop()), 'ui:confirm', actionWidth);
        this.focusIndexAfterRender = this.focusables.indexOf(confirm);
        const cancel = this.addButton(root, margin + actionWidth + 8, y, 'Cancel', hitTarget,
          () => this.render(this.requireController().cancelGunWorkshop()), 'ui:back', actionWidth);
        y += Math.max(confirm.height, cancel.height) + 12;
      }
      const catalogHeading = this.own(root, createUiText(this, margin, y, 'PART CATALOG', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      this.registerScrollObject(catalogHeading);
      y += catalogHeading.height + 4;
      snapshot.gunsmith.catalog.forEach((part) => {
        const iconColumn = 68 + part.traitIcons.length * 38;
        const detail = [part.lockReason, part.sourceLabel].filter((line) => line !== undefined).join(' ');
        const label = `${part.name} • ${part.rarity.toUpperCase()}\n${part.stateLabel}\n${part.effectLines.join(' • ') || 'Trait engineering'}\n${part.comparisonSummary}\n${detail}${part.fabricationActionLabel === undefined ? '' : `\n${part.fabricationActionLabel}`}`;
        const catalogRowHeight = Math.max(hitTarget, 92);
        const row = this.addButton(root, margin, y, label, catalogRowHeight,
          () => this.render(this.requireController().fabricateGunPart(part.partId)), 'ui:confirm', width - margin - this.safeRightMargin, undefined, 0, iconColumn);
        const rowOwnerIndex = this.focusables.length - 1;
        if (!part.canFabricate) this.disableButton(row);
        this.addCatalogIcon(root, margin + 30, y + catalogRowHeight / 2, part.iconArtId, 52, rowOwnerIndex);
        part.traitIcons.forEach((trait, index) => {
          this.addCatalogIcon(root, width - this.safeRightMargin - 24 - index * 38, y + catalogRowHeight / 2, trait.iconArtId, 32, rowOwnerIndex);
        });
        y += row.height + 8;
      });
    }
    this.endScrollableRegion();
    void this.ensureGunsmithPresentation(this.collectGunsmithArtIds(snapshot));
    this.addBackButton(root, width, margin, hitTarget);
  }

  private collectGunsmithArtIds(snapshot: MainMenuSnapshot): readonly string[] {
    return [
      ...snapshot.gunsmith.families.map((family) => family.iconArtId),
      ...snapshot.gunsmith.families.flatMap((family) => family.previewBaseArtId ? [family.previewBaseArtId] : []),
      ...(snapshot.gunsmith.selectedBuild?.preview ? [
        snapshot.gunsmith.selectedBuild.preview.baseArtId,
        ...snapshot.gunsmith.selectedBuild.preview.layers.map((layer) => layer.artId),
        ...snapshot.gunsmith.selectedBuild.preview.traitCores.map((core) => core.iconArtId),
        ...snapshot.gunsmith.selectedBuild.preview.traitEmblems.map((trait) => trait.iconArtId),
      ] : []),
      ...snapshot.gunsmith.slots.flatMap((slot) => [
        slot.iconArtId,
        ...slot.candidates.flatMap((part) => [part.iconArtId, ...part.traitIcons.map((trait) => trait.iconArtId)]),
      ]),
      ...snapshot.gunsmith.catalog.flatMap((part) => [part.iconArtId, ...part.traitIcons.map((trait) => trait.iconArtId)]),
    ];
  }

  private renderEquipmentComparison(root: Phaser.GameObjects.Container, comparison: EquipmentComparison, left: number, top: number, contentWidth: number, familyNames: ReadonlyMap<string, string>): number {
    let y = top;
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    for (const change of comparison.setChanges) {
      const set = comparison.after.sets.find((row) => row.setId === change.setId)!;
      put(`${set.name} ${change.before}/4 → ${change.after}/4`);
      for (const count of change.lost) put(`LOSE ${count}-piece: ${this.loadoutEffectCopy(comparison.before.sets.find((row) => row.setId === change.setId)!.thresholds.find((threshold) => threshold.count === count)!.effects)}`, '#fbbf24');
      for (const count of change.gained) put(`GAIN ${count}-piece: ${this.loadoutEffectCopy(set.thresholds.find((threshold) => threshold.count === count)!.effects)}`, '#86efac');
    }
    const effectCopy = (model: EquipmentLoadoutPresentation) => this.loadoutEffectCopy(model.runTruth.modifiers.map((modifier) => presentLoadoutModifier(modifier))) || 'No persistent stat modifiers';
    put(`CURRENT LOADOUT\n${effectCopy(comparison.before)}\nAFTER CHANGE\n${effectCopy(comparison.after)}`);
    for (const after of comparison.after.runTruth.families) {
      const before = comparison.before.runTruth.families.find((family) => family.familyId === after.familyId)!;
      if (before.traits.length || after.traits.length) {
        put(`${familyNames.get(after.familyId) ?? after.familyId} traits\n${before.traits.map((entry) => entry.trait).join(' • ') || 'None'} → ${after.traits.map((entry) => entry.trait).join(' • ') || 'None'}`);
        for (const trait of after.traits) put(`${trait.trait} [${familyNames.get(after.familyId) ?? after.familyId}]${trait.deduplicated ? ' • Does not stack' : ''}\nSources: ${trait.sourceLabels.join(' • ')}`);
      }
    }
    return y;
  }

  /** The existing atlas layers share one authored canvas/anchor. Both menu
   * surfaces consume the same composition so family previews stay aligned. */
  private renderAssembledWeapon(root: Phaser.GameObjects.Container, preview: GunsmithAssembledPreview, x: number, y: number): void {
    this.addCatalogIcon(root, x, y, preview.baseArtId, 176);
    preview.layers.forEach((layer) => this.addCatalogIcon(root, x, y, layer.artId, 176));
  }

  private renderEquipment(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Equipment');
    const equipment = snapshot.equipment;
    const contentWidth = Math.min(840, width - margin - this.safeRightMargin);
    const left = this.safeCenterX - contentWidth / 2;
    let y = top + heading.height + 12;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    y = this.renderEquipmentSlots(root, snapshot, left, y, contentWidth, hitTarget);
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    const selectedSlot = equipment.presentation.slots.find((slot) => slot.slot === equipment.selectedSlot)!;
    put(`${selectedSlot.label.toUpperCase()} CANDIDATES • ${this.getContext().saveData.progression.scrap} Scrap`);
    for (const item of selectedSlot.candidates) {
      const row = this.addButton(root, left, y, `${item.name}\nT${item.tier} • ${item.state}`, Math.max(hitTarget, 76), () => {
        this.nextFocusKey = `equipment-detail:${item.instanceId}`;
        this.nextFocusAlignTop = true;
        this.render(this.requireController().selectEquipmentCandidate(item.instanceId));
      }, 'ui:confirm', contentWidth, undefined, 0, 76, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-candidate:${item.instanceId}`);
      this.addCatalogIcon(root, left + 34, y + row.height / 2, item.iconArtId, 60, this.focusables.indexOf(row));
      y += row.height + 8;
    }
    if (!selectedSlot.candidates.length) put(`No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`);
    const blueprints = equipment.blueprints.filter((piece) => piece.slot === equipment.selectedSlot);
    if (blueprints.length) put('AVAILABLE BLUEPRINTS');
    for (const blueprint of blueprints) {
      const row = this.addButton(root, left, y, `${blueprint.name}\nFABRICABLE • ${blueprint.fabricationCost} Scrap`, Math.max(hitTarget, 76), () => {
        this.nextFocusKey = `equipment-blueprint-detail:${blueprint.equipmentId}`;
        this.nextFocusAlignTop = true;
        this.render(this.requireController().selectEquipmentBlueprint(blueprint.equipmentId));
      }, 'ui:confirm', contentWidth, undefined, 0, 76, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-blueprint:${blueprint.equipmentId}`);
      const index = this.focusables.indexOf(row);
      this.addCatalogIcon(root, left + 34, y + row.height / 2, blueprint.iconArtId, 60, index);
      this.addCatalogIcon(root, left + contentWidth - 24, y + row.height / 2, blueprint.setEmblemArtId, 34, index);
      y += row.height + 8;
    }
    const selected = selectedSlot.candidates.find((item) => item.instanceId === equipment.selectedInstanceId);
    const selectedBlueprint = blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId);
    if (selected) {
      const set = equipment.presentation.sets.find((row) => row.setId === selected.setId)!;
      const detail = this.addButton(root, left, y, `${selected.name} • T${selected.tier}\n${selectedSlot.label} • ${set.name} Set • ${selected.state}`, Math.max(hitTarget, 100), () => undefined, 'ui:confirm', contentWidth, undefined, 0, 82, true, 'left');
      this.rememberLoadoutFocus(detail, `equipment-detail:${selected.instanceId}`);
      this.disableButton(detail);
      this.addCatalogIcon(root, left + 38, y + 48, selected.iconArtId, 72, this.focusables.indexOf(detail));
      y += detail.height + 10;
      y = this.renderScopedLoadoutEffects(root, selected.effects, left, y, contentWidth);
      const equipped = selected.state === 'EQUIPPED';
      const comparison = equipped ? this.requireController().equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot }) : equipment.comparison;
      put(equipped ? 'IF UNEQUIPPED' : comparison?.displaced ? `Replaces ${comparison.displaced.name}` : `Fills empty ${selectedSlot.label.toLowerCase()} slot`);
      if (comparison) y = this.renderEquipmentComparison(root, comparison, left, y, contentWidth, new Map(snapshot.gunsmith.families.map((family) => [family.id, family.name])));
      const equip = this.addButton(root, left, y, equipped ? `Unequip ${selected.name}` : `Equip ${selected.name}`, hitTarget, () => this.render(equipped
        ? this.requireController().unequipEquipment(selectedSlot.slot)
        : this.requireController().equipEquipment(selected.instanceId)), 'ui:confirm', contentWidth);
      this.rememberLoadoutFocus(equip, `equipment-equip:${selected.instanceId}`);
      y += equip.height + 10;
      const upgrade = equipment.owned.find((item) => item.instanceId === selected.instanceId)!;
      if (upgrade.upgradePreview) {
        put(`UPGRADE • T${selected.tier} → T${selected.tier + 1} • ${upgrade.upgradePreview.cost} Scrap\n${equipped ? 'EQUIPPED: improved values apply immediately after upgrade.' : 'STORED: no active Loadout value changes until equipped.'}`);
        const afterItem = upgrade.upgradePreview.after.slots.find((slot) => slot.slot === selected.slot)!.candidates.find((item) => item.instanceId === selected.instanceId)!;
        put(`ITEM NOW\n${this.loadoutEffectCopy(selected.effects)}\nITEM AFTER UPGRADE\n${this.loadoutEffectCopy(afterItem.effects)}`);
        if (upgrade.upgradeCost !== undefined) {
          const action = this.addButton(root, left, y, `Upgrade for ${upgrade.upgradeCost} Scrap`, hitTarget, () => this.render(this.requireController().upgradeEquipment(selected.instanceId, selected.tier)), 'ui:confirm', contentWidth);
          this.rememberLoadoutFocus(action, `equipment-upgrade:${selected.instanceId}`);
          if (this.getContext().saveData.progression.scrap < upgrade.upgradeCost) this.disableButton(action);
          y += action.height + 8;
        }
      }
      if (upgrade.upgradeLockReason) put(`LOCKED • ${upgrade.upgradeLockReason}`, '#fbbf24');
      else if (selected.tier >= 4) put('Maximum Equipment tier');
    } else if (selectedBlueprint) {
      const detail = this.addButton(root, left, y, `${selectedBlueprint.name}\n${selectedBlueprint.setName} Set • ${selectedSlot.label}\nFABRICABLE`, Math.max(hitTarget, 100), () => undefined, 'ui:confirm', contentWidth, undefined, 0, 82, true, 'left');
      this.rememberLoadoutFocus(detail, `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`);
      this.disableButton(detail);
      this.addCatalogIcon(root, left + 38, y + 48, selectedBlueprint.iconArtId, 72, this.focusables.indexOf(detail));
      y += detail.height + 10;
      y = this.renderScopedLoadoutEffects(root, selectedBlueprint.effects, left, y, contentWidth);
      put('Creates a stored T1 item. Equip it separately to change your Loadout.');
      const action = this.addButton(root, left, y, `Fabricate for ${selectedBlueprint.fabricationCost} Scrap`, hitTarget, () => {
        const next = this.requireController().fabricateEquipment(selectedBlueprint.equipmentId);
        this.nextFocusKey = next.equipment.selectedInstanceId ? `equipment-detail:${next.equipment.selectedInstanceId}` : `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`;
        this.nextFocusAlignTop = true;
        this.render(next);
      }, 'ui:confirm', contentWidth);
      this.rememberLoadoutFocus(action, `equipment-fabricate:${selectedBlueprint.equipmentId}`);
      if (this.getContext().saveData.progression.scrap < selectedBlueprint.fabricationCost) this.disableButton(action);
      y += action.height + 8;
    }
    put('ACTIVE SETS');
    const activeSets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    if (!activeSets.length) put('No Set pieces equipped');
    for (const set of activeSets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    if (equipment.unavailable.length) put('A legacy Equipment item is unavailable in this version.', '#fbbf24');
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensureEquipmentPresentation([
      ...(this.getContext().data.equipment ?? []).map((piece) => piece.icon),
      ...(this.getContext().data.equipmentSets ?? []).map((set) => set.emblem),
    ]);
    void this.ensurePanelPresentation('equipment', ['nav-icon:mercenary', 'nav-icon:gunsmith']);
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
  ): Phaser.GameObjects.Text {
    const hasNavigationChevron = artId !== undefined && !artId.startsWith('settings-icon:') && !artId.startsWith('action-icon:');
    const effectiveTrailingReserve = Math.max(trailingReserve, hasNavigationChevron ? 34 : 0);
    const contentArt = artId !== undefined && !/^(settings-icon|action-icon|ui-chrome):/.test(artId);
    const contentArtCap = maxLabelWidth !== undefined && maxLabelWidth < 190 ? 50 : 56;
    const artSize = artId === undefined ? 0 : contentArt
      ? Math.min(contentArtCap, Math.max(36, minHeight - 12))
      : Math.min(40, Math.max(28, minHeight - 24));
    const leftInset = Math.max(artId ? artSize + 16 : 12, leadingReserve);
    const rightInset = Math.max(topAligned ? 10 : 12, effectiveTrailingReserve);
    const text = this.own(root, createUiText(this,x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${maxLabelWidth !== undefined && maxLabelWidth < 190 ? ThemeFont.bodyMin : ThemeFont.labelMin}px`,
      fontStyle: '600',
      align: horizontalAlign ?? (topAligned ? 'left' : 'center'),
      padding: { left: leftInset, right: rightInset, top: 0, bottom: 0 },
      ...(maxLabelWidth === undefined ? {} : { wordWrap: { width: Math.max(1, maxLabelWidth - leftInset - rightInset) } }),
    }));
    text.setOrigin(x === this.safeCenterX ? 0.5 : 0, 0);
    text.setScrollFactor(0);

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
      text.setFixedSize(Math.max(MIN_MENU_BUTTON_LOGICAL_WIDTH, maxLabelWidth), Math.max(targetHeight, measured.height));
    }
    const framedBounds = text.getBounds();
    const chrome = this.uiVisuals?.addPanel(
      this,
      framedBounds.centerX,
      framedBounds.centerY,
      framedBounds.width,
      framedBounds.height,
      'card',
      { alpha: 0.96 },
    );
    if (chrome) {
      root.add(chrome);
      (root as Phaser.GameObjects.Container & { moveBelow?: (child: Phaser.GameObjects.GameObject, sibling: Phaser.GameObjects.GameObject) => unknown })
        .moveBelow?.(chrome, text);
      this.buttonChrome.push(chrome);
    }
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
        this.render(this.controller.snapshot());
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
    if (loadedAny && this.committedPanel === panel && this.controller) this.render(this.controller.snapshot());
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
        this.render(this.controller.snapshot());
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
        this.render(this.controller.snapshot());
      }
    } finally {
      if (generation === this.menuTextureLoadGeneration) this.mercenaryArtLoading = false;
    }
  }

  /** Equipment/sets use the same physical-resource resolver as Career badges,
   * but stay out of Boot because they are not needed to reach the Home panel. */
  private async ensureEquipmentPresentation(iconArtIds: readonly string[]): Promise<void> {
    if (this.equipmentArtLoading || !this.textures?.exists) return;
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
    try {
      const result = await this.serializeTextureLoad(
        () => loadTextureResources(this, [...missing.values()]),
        EMPTY_RESOURCE_LOAD_RESULT,
      );
      if (generation === this.menuTextureLoadGeneration && result.loaded.length > 0 && (this.committedPanel === 'equipment' || this.committedPanel === 'loadout') && this.controller) {
        this.render(this.controller.snapshot());
      }
    } finally {
      if (generation === this.menuTextureLoadGeneration) this.equipmentArtLoading = false;
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
      this.render(this.controller.snapshot());
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
    const maxScroll = Math.max(0, this.scrollRegion.contentHeight - this.scrollRegion.viewportHeight);
    if (maxScroll > 0 && this.uiVisuals) {
      const x = this.scale.width - Math.max(7, this.safeRightMargin / 2);
      const centerY = (this.scrollViewportTop + this.scrollViewportBottom) / 2;
      const track = this.uiVisuals.addPanel(this, x, centerY, 8, this.scrollRegion.viewportHeight, 'scroll-track', { alpha: 0.92 });
      if (track) this.own(root, track);
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
    this.createScrollMask(root);
    this.applyScrollViewport();
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
    const content = this.own(root, this.add.container(0, 0));
    content.add(paintOrder);
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
    return this.scale.height - edgeMargin(this.currentViewport!, 'bottom') - hitTarget - 12;
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
    this.render(this.controller.snapshot());
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
      text.setStyle({ color: '#f7f1d5' });
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
