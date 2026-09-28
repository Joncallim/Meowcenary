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
import { loadTextureResources, prepareRunPresentation, resolveRunPhysicalResources, type ResourceLoadProgress } from '../systems/resourceLoader';
import { DataVisualArtRegistry, DataVisualResourceRegistry, ensureVisualAnimations, resolveAchievementIconBinding, visualAnimationKey } from '../systems/visualArt';
import { isPortraitOrientationBlocked } from '../platform/orientation';
import { createUiVisualChrome, type UiVisualChrome } from '../ui/visualChrome';

const MENU_DEPTH = ThemeDepth.pauseSummary;
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
    /** Decorations inherit their owning row's all-or-nothing clipping. */
    ownerIndex?: number;
  }> = [];
  private scrollViewportTop = 0;
  private scrollViewportBottom = 0;
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

  constructor() {
    super(SceneKey.Menu);
  }

  create(data?: { readonly initialPanel?: import('../ui/menus').MenuPanel; readonly replayRequest?: ComposedRunRequest; readonly isTraining?: boolean }): void {
    // Phaser reuses this Scene instance after Game. Loading is transient and
    // must never leave a newly activated Menu permanently inert.
    this.runLaunchState = 'idle';
    this.runLaunchProgress = undefined;
    this.runLaunchPresentation = undefined;
    this.gunsmithArtGeneration += 1;
    this.gunsmithArtLoading = false;
    this.mercenaryArtLoading = false;
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
      ? (this.scale.width >= 760 ? 3 : 2)
      : undefined;
    const preserveFocusIndex = this.navigator.index;
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
    this.root?.destroy(true);
    this.root = undefined;
    this.focusables = [];
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

    const backdropBinding = this.uiVisuals?.binding('brand:menu-backdrop');
    if (backdropBinding && this.textures?.exists?.(backdropBinding.textureKey) && this.add.image) {
      const backdrop = this.own(root, this.add.image(
        this.scale.width / 2,
        this.scale.height / 2,
        backdropBinding.textureKey,
        backdropBinding.frameKey,
      ).setAlpha(0.72).setScrollFactor(0));
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
        lockup.setDisplaySize(lockupWidth, lockupWidth / 5);
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

      const contentTop = (snapshot.notice ? 86 : 64) + topMargin;
      const contentPanel = this.uiVisuals?.addPanel(
        this,
        this.safeCenterX,
        contentTop + (this.scale.height - contentTop - edgeMargin(viewport, 'bottom')) / 2,
        Math.max(120, width - leftMargin - this.safeRightMargin),
        Math.max(80, this.scale.height - contentTop - edgeMargin(viewport, 'bottom')),
        'panel',
        { alpha: 0.28 },
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
          this.renderTraining(root, width, contentTop, margin, hitTarget);
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
      if (this.focusIndexAfterRender !== undefined) this.navigator.setIndex(this.focusIndexAfterRender);
      this.finishScrollableRegion(root);
      this.applyFocus();

      // The root is only published once the display tree is fully built and
      // focused, so a failed render leaves the menu without a published root
      // and the next render can retry from a clean slate.
      this.root = root;
      this.committedPanel = snapshot.panel;
      this.committedDisplay = true;
    } catch (error) {
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
    const threatPreview = selectedStage?.threats.slice(0, HOME_THREAT_PREVIEW_LIMIT) ?? [];
    const omittedThreatCount = Math.max(0, (selectedStage?.threats.length ?? 0) - threatPreview.length);
    const threatPreviewCopy = [
      ...threatPreview.map((threat) => threat.name),
      ...(omittedThreatCount > 0 ? [`+${omittedThreatCount} more`] : []),
    ].join(' • ');
    const infoLines = [
      `${selectedCharacter?.name ?? snapshot.character.selectedCharacterId} • ${this.getContext().saveData.progression.scrap} Scrap`,
      `${campaignComplete ? 'CAMPAIGN COMPLETE — REPLAY' : selectedStage?.completed ? 'REPLAY CONTRACT' : 'NEXT CONTRACT'} • ${selectedStage?.chapterName ?? ''} ${selectedStage?.displayOrder ?? ''}`,
      `${selectedStage?.name ?? snapshot.stage.selectedStageId} • ${selectedStage?.locationName ?? ''}`,
      selectedStage?.objective.copy ?? '',
      selectedStage ? `Threats: ${threatPreviewCopy}` : '',
      selectedStage?.completed
        ? `Best: ${formatDuration(selectedStage.bestTimeMs)}`
        : `First clear: ${selectedStage?.reward.headline ?? ''}`,
    ];

    const info = this.own(root, createUiText(this,margin, top, infoLines.join('\n'), {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.bodyMin}px`,
      lineSpacing: 2,
      wordWrap: { width: Math.max(1, width - margin - this.safeRightMargin - 78) },
    }));
    info.setScrollFactor(0);

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
    const artX = width - this.safeRightMargin - 28;
    if (selectedCharacter) this.addPanelArt(root, artX, top + 28, selectedCharacter.portraitArtId, 56);
    if (selectedStage) {
      this.addPanelArt(root, artX, top + 54, selectedStage.locationArtId, 34);
      this.addPanelArt(root, artX - 34, top + 54, selectedStage.objective.artId, 26);
      threatPreview.forEach((threat, index) => {
        this.addPanelArt(root, artX - (index % 2) * 30, top + 88 + Math.floor(index / 2) * 28, threat.actorArtId, 24);
      });
    }
    let y = top + info.height + 12;
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
    const compactLandscape = this.scale.height < 500 && width >= 700;
    if (compactLandscape) {
      const gap = 4;
      const buttonWidth = (width - margin - this.safeRightMargin - gap * (buttons.length - 1)) / buttons.length;
      buttons.forEach(({ label, artId, action }, index) => {
        this.addButton(root, margin + index * (buttonWidth + gap), y, label, hitTarget, action, 'ui:confirm', buttonWidth, artId);
      });
    } else {
      buttons.slice(0, 2).forEach(({ label, artId, action }) => {
        const button = this.addButton(root, this.safeCenterX, y, label, hitTarget, action, 'ui:confirm', undefined, artId);
        y += button.height + 6;
      });
      const secondary = buttons.slice(2);
      const columnGap = 8;
      const columns = 2;
      const columnWidth = (width - margin - this.safeRightMargin - columnGap) / columns;
      secondary.forEach(({ label, artId, action }, index) => {
        const column = index % columns;
        this.addButton(root, margin + column * (columnWidth + columnGap), y, label, hitTarget, action, 'ui:confirm', columnWidth, artId);
        if (column === columns - 1 || index === secondary.length - 1) y += hitTarget + 6;
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
      selectedStage?.locationArtId,
      selectedStage?.objective.artId,
      ...threatPreview.map((threat) => threat.actorArtId),
    ].filter((id): id is string => id !== undefined));
  }

  private renderLoadout(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Loadout');
    const selectedCharacter = snapshot.character.characters.find((row) => row.selected);
    const equipped = Object.values(snapshot.equipment.equipped).filter(Boolean).length;
    const selectedBuild = snapshot.gunsmith.selectedBuild;
    const summary = this.own(root, createUiText(this, margin, top + heading.height + 18,
      `${selectedCharacter?.name ?? 'Mercenary'}\nEquipment ${equipped}/4 slots • ${snapshot.equipment.activeSets.map((set) => `${set.name} ${set.pieces}/4`).join(' • ') || 'No active Set'}\nGunsmith: ${selectedBuild?.title ?? 'Choose a weapon build'}\n${this.getContext().saveData.progression.scrap} Scrap`,
      { color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: 4, wordWrap: { width: width - margin - this.safeRightMargin } },
    ));
    let y = summary.y + summary.height + 24;
    this.addButton(root, margin, y, 'Equipment', hitTarget, () => this.render(this.requireController().open('equipment')));
    y += hitTarget + 12;
    this.addButton(root, margin, y, 'Gunsmith', hitTarget, () => this.render(this.requireController().open('gunsmith')));
    this.addBackButton(root, width, margin, hitTarget);
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
      }));
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
      const artColumn = 88;
      const button = this.addButton(root, margin + artColumn, y, label, hitTarget, () => {
        const next = this.requireController().selectCharacter(character.id, snapshot.character.revision);
        this.render(next);
      }, 'ui:confirm', width - margin - this.safeRightMargin - artColumn);
      const rowOwnerIndex = this.focusables.length - 1;
      const rowHeaderHeight = Math.max(56, button.height);
      this.addPanelArt(root, margin + 38, y + 38, character.portraitArtId, 76, character.locked, false, rowOwnerIndex);
      this.addCatalogIcon(root, width - this.safeRightMargin - 18, y + rowHeaderHeight / 2, character.startingWeaponIconArtId, 32, rowOwnerIndex);
      if (character.locked) {
        this.addCatalogIcon(root, width - this.safeRightMargin - 52, y + rowHeaderHeight / 2, 'ui-chrome:locked', 24, rowOwnerIndex);
      }
      if (character.description || character.abilityName) {
        const detailX = margin + artColumn;
        const details = [
          `${character.description} • Starts: ${character.startingWeaponSummary}`,
          `Base: ${character.baseStatsSummary}`,
          character.passives.map((passive) => `${passive.name}: ${passive.description}`).join(' • '),
          character.abilityName ? `${character.abilityName.toUpperCase()}: ${character.abilityDescription}` : undefined,
          character.locked ? character.unlockRequirement : undefined,
        ]
          .filter(Boolean).join('\n');
        const desc = this.own(root, createUiText(this, detailX, y + rowHeaderHeight + 2, details, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - artColumn },
        }));
        desc.setScrollFactor(0);
        this.registerScrollObject(desc, rowOwnerIndex);
        if (character.abilityIconArtId) {
          this.addCatalogIcon(root, detailX - 18, y + rowHeaderHeight + desc.height - 10, character.abilityIconArtId, 28, rowOwnerIndex);
        }
        character.passives.slice(0, 2).forEach((passive, index) => {
          this.addCatalogIcon(root, detailX - 18, y + rowHeaderHeight + 46 + index * 26, passive.iconArtId, 22, rowOwnerIndex);
        });
        y += rowHeaderHeight + desc.height + 10;
      } else {
        y += rowHeaderHeight + 16;
      }
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
        const chapterLabel = this.own(root, createUiText(this, margin, y, chapter.toUpperCase(), {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.labelMin}px`, fontStyle: '700',
        }));
        this.registerScrollObject(chapterLabel);
        y += chapterLabel.height + 8;
      }
      const status = stage.locked ? `LOCKED — ${stage.lockCopy}` : stage.completed ? `CLEARED • Best ${formatDuration(stage.bestTimeMs)}` : 'AVAILABLE';
      const label = `${stage.selected ? '✓ ' : ''}${stage.boss ? 'BOSS • ' : ''}${stage.name}\n${stage.locationName} • ${stage.objective.copy}\n${status}`;
      const button = this.addButton(root, margin + 42, y, label, hitTarget, () => {
        this.render(this.requireController().selectStage(stage.id));
      }, 'ui:confirm', width - margin - this.safeRightMargin - 42);
      const rowOwnerIndex = this.focusables.length - 1;
      if (stage.locked) this.disableButton(button);
      this.addPanelArt(root, margin + 18, y + Math.min(button.height, 52) / 2, stage.objective.artId, 32, stage.locked, false, rowOwnerIndex);
      const stateArtId = stage.locked ? 'ui-chrome:locked'
        : stage.completed ? 'ui-chrome:cleared'
          : stage.boss ? 'ui-chrome:boss' : undefined;
      if (stateArtId) {
        // The shared scroll rail owns the rightmost 9px. Keep a physical
        // gutter between it and the 24px state marker so neither can obscure
        // the other on the canonical 390px phone viewport.
        this.addCatalogIcon(root, width - this.safeRightMargin - 30, y + Math.min(button.height, 52) / 2, stateArtId, 24, rowOwnerIndex);
      }
      y += button.height + 10;
      if (stage.selected && !stage.locked) {
        const threatGroups = Array.from({ length: Math.ceil(stage.threats.length / 4) }, (_, index) =>
          stage.threats.slice(index * 4, index * 4 + 4));
        for (const [index, threats] of threatGroups.entries()) {
          const detail = this.own(root, createUiText(this, margin + 42, y,
            `${index === 0 ? 'Threats: ' : ''}${threats.map((threat) => threat.name).join(' • ')}`,
            { color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin - 42 } },
          ));
          this.registerScrollObject(detail);
          y += detail.height + 4;
        }
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
    void this.ensurePanelPresentation('stage', snapshot.stage.stages.map((stage) => stage.objective.artId));
  }

  private renderCareer(root: Phaser.GameObjects.Container, _snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Career');
    let y = top + heading.height + 20;
    for (const [label, panel] of [
      ['Next Goals', 'next-goals'],
      ['Achievements', 'achievements'],
      ['Compendium', 'compendium'],
    ] as const) {
      this.addButton(root, margin, y, label, hitTarget, () => this.render(this.requireController().open(panel)));
      y += hitTarget + 12;
    }
    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderNextGoals(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Next Goals');
    let y = top + heading.height + 16;
    const overview = snapshot.progressionOverview;
    const summary = this.own(root, createUiText(this, margin, y,
      `Contracts ${overview.completedStages}/${overview.totalStages} • Achievements ${overview.completedAchievements}/${overview.totalAchievements}`,
      { color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin } }));
    y += summary.height + 12;
    overview.nextGoals.forEach((goal) => {
      this.addPanelArt(root, margin + 18, y + 22, goal.artId, 32);
      const row = this.own(root, createUiText(this, margin + 42, y, `${goal.title}\n${goal.detail}`, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin - 42 },
      }));
      y += row.height + 12;
    });
    this.addButton(root, margin, y, 'Choose Contract', hitTarget, () => this.render(this.requireController().open('stage')));
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
      const artColumn = entry.actorArtId ? 58 : 0;
      const row = this.addButton(root, margin + artColumn, y, `${name}\n${detail}`, hitTarget, () => undefined, 'ui:confirm', width - margin - this.safeRightMargin - artColumn);
      const rowOwnerIndex = this.focusables.length - 1;
      row.setStyle({
        color: entry.status === 'unseen' ? '#94a3b8' : '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      });
      if (entry.actorArtId) this.addPanelArt(root, margin + 26, y + Math.min(row.height, 58) / 2, entry.actorArtId, 50, false, true, rowOwnerIndex);
      y += row.height + 12;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
    void this.ensurePanelPresentation('compendium', snapshot.compendium.entries.flatMap((entry) => entry.actorArtId ? [entry.actorArtId] : []));
  }

  private renderTraining(root: Phaser.GameObjects.Container, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Training');
    const copy = this.own(root, createUiText(this, margin, top + heading.height + 20,
      'Practice movement and auto-fire here. Training does not award progression or Compendium discovery.',
      { color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin } }));
    const startY = top + heading.height + copy.height + 36;
    this.addButton(root, margin, startY, this.runLaunchState === 'failed' ? 'Retry Training' : 'Start Training', hitTarget, () => { void this.startTrainingWithResources(); });
    if (this.runLaunchState === 'failed') {
      this.own(root, createUiText(this, margin, startY + hitTarget + 8, "Couldn't load this Contract. Retry or go Back.", {
        color: '#f87171', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
    }
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
    const detailTop = top + heading.height + 10;
    if (selected) {
      this.addAchievementIcon(root, margin + 17, detailTop + 22, selected.iconArtId, 34);
      this.own(root, createUiText(this, margin + 42, detailTop,
        `${selected.name}\n${achievementStatusCopy(selected)} • ${selected.progress}/${selected.target}\n${selected.description}\nReward: ${selected.rewardSummary}`,
        {
          color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - 42 },
        },
      )).setScrollFactor(0);
    }
    const detailHeight = selected ? Math.max(hitTarget + 24, 102) : 0;
    const gridTop = detailTop + detailHeight + 12;
    const columns = width >= 760 ? 3 : 2;
    const gap = 8;
    const available = width - margin - this.safeRightMargin;
    const cardWidth = (available - gap * (columns - 1)) / columns;
    const cardHeight = Math.max(hitTarget, 68);
    this.beginScrollableRegion(gridTop, this.scrollViewportBottomFor(hitTarget));
    snapshot.achievements.achievements.forEach((achievement, index) => {
      const column = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = margin + column * (cardWidth + gap);
      const y = gridTop + rowIndex * (cardHeight + gap);
      const button = this.addButton(root, x, y,
        `${achievement.name}\n${achievementStatusCopy(achievement)} • ${achievement.progress}/${achievement.target}`,
        cardHeight,
        () => this.render(this.requireController().selectAchievement(achievement.id)),
        'ui:confirm', cardWidth,
      );
      const rowOwnerIndex = this.focusables.length - 1;
      button.setStyle({ color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px` });
      this.addAchievementIcon(root, x + cardWidth - 18, y + 20, achievement.iconArtId, 28, rowOwnerIndex);
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
      const label = family.selected
        ? `${family.name} Build\nSelected`
        : family.existingBuildId
          ? `${family.name} Build\nConfigured`
          : `${family.name} Build\nEmpty`;
      this.addButton(root, margin, y, label, hitTarget, () => this.render(family.existingBuildId
        ? this.requireController().selectGunBuild(family.existingBuildId)
        : this.requireController().createGunBuild(family.id)));
      y += hitTarget + 10;
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
        const previewHeight = 76;
        const weaponX = margin + 52;
        const weaponY = y + 24;
        this.addCatalogIcon(root, weaponX, weaponY, selected.preview.baseArtId, 96);
        selected.preview.layers.forEach((layer) => this.addCatalogIcon(root, weaponX, weaponY, layer.artId, 96));
        selected.preview.traitCores.forEach((core, index) => {
          this.addCatalogIcon(root, margin + 122 + index * 42, weaponY, core.iconArtId, 34);
        });
        selected.preview.traitEmblems.forEach((trait, index) => {
          this.addCatalogIcon(root, width - this.safeRightMargin - 18 - index * 30, weaponY, trait.iconArtId, 24);
        });
        const summary = this.own(root, createUiText(this, margin, y + 50, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
        this.registerScrollObject(summary);
        y += Math.max(previewHeight, 50 + summary.height) + 10;
      } else {
        const summary = this.own(root, createUiText(this, margin, y, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
        this.registerScrollObject(summary);
        y += summary.height + 10;
      }
      snapshot.gunsmith.slots.forEach((slot) => {
        const slotHeading = this.own(root, createUiText(this, margin, y, slot.slot === 'trait'
          ? `${slot.label.toUpperCase()} ${slot.candidates.filter((part) => part.state === 'fitted-here').length} / 2`
          : slot.label.toUpperCase(), {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.registerScrollObject(slotHeading);
        this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + slotHeading.height / 2, slot.iconArtId, 24);
        y += slotHeading.height + 4;
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
          const iconColumn = 38 + part.traitIcons.length * 28;
          const row = this.addButton(root, margin, y, label, hitTarget, () => this.render(part.state === 'fitted-here'
            ? this.requireController().unequipGunPart(part.instanceId)
            : this.requireController().fitGunPart(part.instanceId)), 'ui:confirm', width - margin - this.safeRightMargin - iconColumn);
          const rowOwnerIndex = this.focusables.length - 1;
          if (!enabled) this.disableButton(row);
          this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, part.iconArtId, 26, rowOwnerIndex);
          part.traitIcons.forEach((trait, index) => {
            this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41 - index * 28, y + hitTarget / 2, trait.iconArtId, 22, rowOwnerIndex);
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
          const row = this.addButton(root, margin, y, recipe.label, hitTarget,
            () => this.render(recipe.kind === 'merge'
              ? this.requireController().beginGunMerge(recipe.groupId)
              : this.requireController().requestGunWorkshop({ kind: 'infuse', targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId })), 'ui:confirm', width - margin - this.safeRightMargin);
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
        const iconColumn = 38 + part.traitIcons.length * 28;
        const detail = [part.lockReason, part.sourceLabel].filter((line) => line !== undefined).join(' ');
        const label = `${part.name} • ${part.rarity.toUpperCase()}\n${part.stateLabel}\n${part.effectLines.join(' • ') || 'Trait engineering'}\n${part.comparisonSummary}\n${detail}${part.fabricationActionLabel === undefined ? '' : `\n${part.fabricationActionLabel}`}`;
        const row = this.addButton(root, margin, y, label, hitTarget,
          () => this.render(this.requireController().fabricateGunPart(part.partId)), 'ui:confirm', width - margin - this.safeRightMargin - iconColumn);
        const rowOwnerIndex = this.focusables.length - 1;
        if (!part.canFabricate) this.disableButton(row);
        this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, part.iconArtId, 26, rowOwnerIndex);
        part.traitIcons.forEach((trait, index) => {
          this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41 - index * 28, y + hitTarget / 2, trait.iconArtId, 22, rowOwnerIndex);
        });
        y += row.height + 8;
      });
    }
    this.endScrollableRegion();
    void this.ensureGunsmithPresentation([
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
    ]);
    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderEquipment(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Equipment');
    let y = top + heading.height + 14;
    const equipped = snapshot.equipment.equipped;
    this.own(root, createUiText(this, margin, y, `Equipped: ${Object.values(equipped).filter(Boolean).length}/4 pieces`, {
      color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      wordWrap: { width: width - margin - this.safeRightMargin },
    }));
    y += hitTarget + 12;
    if (snapshot.equipment.activeSets.length > 0) {
      const activeHeading = this.own(root, createUiText(this, margin, y, 'ACTIVE SETS', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      y += activeHeading.height + 4;
      for (const set of snapshot.equipment.activeSets) {
        const activeText = this.own(root, createUiText(this, margin, y, `${set.name} Set • ${set.pieces}/4 equipped${set.activeThresholds.length ? ` (${set.activeThresholds.join('+')}-piece active)` : ''}\n${set.bonusSummary.join(' • ')}`, {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - 38 },
        }));
        this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + Math.min(activeText.height, hitTarget) / 2, set.emblemArtId);
        y += activeText.height + 8;
      }
      y += 4;
    }
    this.own(root, createUiText(this, margin, y, 'Owned equipment:', {
      color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
    }));
    y += hitTarget * 0.7;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    snapshot.equipment.owned.forEach((item) => {
      const equippedHere = equipped[item.slot] === item.instanceId;
      const iconColumn = 66;
      const equipmentButton = this.addButton(root, margin, y, `${equippedHere ? '✓ ' : ''}${item.name}\n${item.setName} Set • ${item.setPieces}/4 equipped • Tier ${item.tier}\n${equippedHere ? 'Equipped' : 'Tap to equip'}`, hitTarget, () => {
        this.render(equippedHere
          ? this.requireController().unequipEquipment(item.slot as 'helmet' | 'armour' | 'gloves' | 'boots')
          : this.requireController().equipEquipment(item.instanceId));
      }, 'ui:confirm', width - margin - this.safeRightMargin - iconColumn);
      const rowOwnerIndex = this.focusables.length - 1;
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, item.iconArtId, 26, rowOwnerIndex);
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41, y + hitTarget / 2, item.setEmblemArtId, 22, rowOwnerIndex);
      y += equipmentButton.height + 8;
      const effects = this.own(root, createUiText(this, margin, y, item.effectSummary.join(' • '), {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      this.registerScrollObject(effects);
      y += effects.height + 8;
      if (item.upgradeCost !== undefined) {
        this.addButton(root, margin, y, `Upgrade • ${item.upgradeCost} Scrap`, hitTarget, () => {
          this.render(this.requireController().upgradeEquipment(item.instanceId));
        });
        y += hitTarget + 8;
      } else if (item.upgradeLocked) {
        const locked = this.own(root, createUiText(this, margin, y, 'Tier locked — progress through stages, bosses, and achievements.', {
          color: '#fbbf24', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
        this.registerScrollObject(locked);
        y += hitTarget * 0.75;
      }
    });
    if (snapshot.equipment.owned.length === 0) {
      const empty = this.own(root, createUiText(this, margin, y, 'Fabricate a blueprint below or earn equipment from rewards.', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      this.registerScrollObject(empty);
      y += empty.height + 12;
    }
    snapshot.equipment.unavailable.forEach(() => {
      const unavailable = this.own(root, createUiText(this, margin, y, 'A legacy equipment item is unavailable in this version.', {
        color: '#fbbf24', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      this.registerScrollObject(unavailable);
      y += unavailable.height + 12;
    });
    const blueprints = this.own(root, createUiText(this, margin, y, 'AVAILABLE BLUEPRINTS', {
      color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
    }));
    this.registerScrollObject(blueprints);
    y += blueprints.height + 4;
    if (snapshot.equipment.blueprints.length === 0) {
      const complete = this.own(root, createUiText(this, margin, y, 'All currently unlocked equipment has been fabricated.', {
        color: '#94a3b8', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      this.registerScrollObject(complete);
      y += complete.height + 8;
    }
    snapshot.equipment.blueprints.forEach((blueprint) => {
      const slot = `${blueprint.slot.charAt(0).toUpperCase()}${blueprint.slot.slice(1)}`;
      const row = this.addButton(root, margin, y, `${blueprint.name}\n${blueprint.setName} Set • ${slot}\n${blueprint.effectSummary.join(' • ')}\nFabricate — ${blueprint.fabricationCost} Scrap`, hitTarget, () => {
        this.render(this.requireController().fabricateEquipment(blueprint.equipmentId));
      }, 'ui:confirm', width - margin - this.safeRightMargin - 66);
      const rowOwnerIndex = this.focusables.length - 1;
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, blueprint.iconArtId, 26, rowOwnerIndex);
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41, y + hitTarget / 2, blueprint.setEmblemArtId, 22, rowOwnerIndex);
      y += row.height + 8;
    });
    this.endScrollableRegion();
    // Equipment presentation is a menu-only lazy closure. It deliberately
    // follows data-owned art IDs so an ordinary new set/resource does not add
    // a loader list or an Equipment-ID branch here.
    void this.ensureEquipmentPresentation([
      ...(this.getContext().data.equipment ?? []).map((piece) => piece.icon),
      ...(this.getContext().data.equipmentSets ?? []).map((set) => set.emblem),
    ]);
    this.addBackButton(root, width, margin, hitTarget);
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
    let y = top + heading.height + 20;

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
      this.addButton(root, margin, y, row.label, hitTarget, () => {
        const next = row.action();
        this.render(next);
      }, 'ui:confirm', undefined, row.artId);
      y += hitTarget + 12;
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
    callback: () => void,
    audioEvent: MenuAudioEvent = 'ui:confirm',
    maxLabelWidth?: number,
    artId?: string,
  ): Phaser.GameObjects.Text {
    const text = this.own(root, createUiText(this,x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      padding: { left: artId ? 40 : 10, right: 10, top: 8, bottom: 8 },
      ...(maxLabelWidth === undefined ? {} : { wordWrap: { width: Math.max(1, maxLabelWidth - (artId ? 50 : 20)) } }),
    }));
    text.setOrigin(x === this.safeCenterX ? 0.5 : 0, 0);
    text.setScrollFactor(0);

    const bounds = text.getBounds();
    const horizontalPadding = bounds.width < MIN_MENU_BUTTON_LOGICAL_WIDTH
      ? (MIN_MENU_BUTTON_LOGICAL_WIDTH - bounds.width) / 2 + (text.padding.left ?? 10)
      : (text.padding.left ?? 10);
    const verticalPadding = bounds.height < minHeight
      ? (minHeight - bounds.height) / 2 + (text.padding.top ?? 8)
      : (text.padding.top ?? 8);
    // Text bounds include padding. The same correction used for height also
    // applies horizontally: augment padding by half the missing bounds plus
    // the current inset, so short labels meet the 44px physical width floor
    // at the worst promised FIT without narrowing longer labels.
    if (horizontalPadding !== (text.padding.left ?? 10) || verticalPadding !== (text.padding.top ?? 8)) {
      text.setPadding(horizontalPadding, verticalPadding);
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
      icon = this.uiVisuals?.addIcon(this, framedBounds.left + 18, framedBounds.centerY, artId, { size: 22 });
      if (icon) {
        root.add(icon);
      }
    }

    text.setInteractive({ useHandCursor: true });
    text.on(Phaser.Input.Events.POINTER_OVER, () => {
      (chrome as Phaser.GameObjects.NineSlice | undefined)?.setTint?.(ThemeColor.cardHover);
    });
    text.on(Phaser.Input.Events.POINTER_OUT, () => {
      (chrome as Phaser.GameObjects.NineSlice | undefined)?.clearTint?.();
    });
    text.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
      // A drag is a scrolling gesture, never a command activation. Keep the
      // flag through the InputPlugin's pointer-up dispatch so this remains
      // correct regardless of global-vs-object listener ordering.
      if (this.touchDidScroll) {
        this.touchDidScroll = false;
        return;
      }
      this.navigator.setIndex(this.focusables.indexOf(text));
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
      // The shared region receives real rendered bounds, not a screen-local
      // row estimate, so wrapped labels and future content remain correct.
      const itemBounds = text.getBounds();
      this.scrollItemBounds.set(index, { top: itemBounds.top, bottom: itemBounds.bottom });
      this.rebuildScrollItems();
    }
    text.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.syncScrollFocus(index);
      this.applyScrollViewport();
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
    const disabled = this.uiVisuals?.binding('ui-chrome:disabled');
    const chrome = this.buttonChrome[index] as Phaser.GameObjects.GameObject & { setFrame?(frame: string): unknown } | undefined;
    if (disabled?.frameKey) chrome?.setFrame?.(disabled.frameKey);
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
    icon.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
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
      image.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
    }
    if (animate && binding.load.type === 'spritesheet' && binding.clips?.idle) {
      (image as Phaser.GameObjects.Sprite).play(visualAnimationKey(binding.id, 'idle'));
    }
    image.setAlpha(subdued ? 0.35 : 1).setScrollFactor(0);
    this.registerScrollObject(image, scrollOwnerIndex);
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
      loadedAny = (await this.serializeTextureLoad(() => loadTextureResources(this, [...missing.values()]))).loaded.length > 0;
    } finally {
      if (generation === this.panelArtGeneration) this.panelArtLoading = false;
    }
    if (generation !== this.panelArtGeneration || !this.isLive) return;
    const animationScene = this as unknown as { readonly anims?: Phaser.Animations.AnimationManager };
    if (loadedAny && animationScene.anims) ensureVisualAnimations(this, art);
    if (loadedAny && this.committedPanel === panel && this.controller) this.render(this.controller.snapshot());
    if (this.pendingPanelArtIds.size > 0) {
      const pending = [...this.pendingPanelArtIds];
      const repaintPanels = new Set(this.pendingPanelArtRepaints);
      this.pendingPanelArtIds.clear();
      this.pendingPanelArtRepaints.clear();
      const targetPanel = this.committedPanel ?? panel;
      await this.loadPanelPresentation(targetPanel, pending, repaintPanels.has(targetPanel));
    }
  }

  /** Career shares terminal Achievement badge identity while retaining its
   * own gallery layout. Missing textures intentionally preserve text/focus. */
  private addAchievementIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string, maxSize = 26, scrollOwnerIndex?: number): void {
    const binding = resolveAchievementIconBinding(this.requireVisualArt(), iconArtId);
    if (!binding || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    icon.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
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
    this.achievementArtLoading = true;
    try {
      const result = await this.serializeTextureLoad(() => loadTextureResources(this, [...missing.values()]));
      if (result.loaded.length > 0 && this.committedPanel === 'achievements' && this.controller) {
        this.render(this.controller.snapshot());
      }
    } finally {
      this.achievementArtLoading = false;
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
    this.mercenaryArtLoading = true;
    try {
      const result = await this.serializeTextureLoad(() => loadTextureResources(this, [...missing.values()]));
      if (result.loaded.length > 0 && this.committedPanel === 'character' && this.controller) {
        this.render(this.controller.snapshot());
      }
    } finally {
      this.mercenaryArtLoading = false;
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
    this.equipmentArtLoading = true;
    try {
      const result = await this.serializeTextureLoad(() => loadTextureResources(this, [...missing.values()]));
      if (result.loaded.length > 0 && this.committedPanel === 'equipment' && this.controller) {
        this.render(this.controller.snapshot());
      }
    } finally {
      this.equipmentArtLoading = false;
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
      const result = await this.serializeTextureLoad(() => loadTextureResources(this, [...missing.values()]));
      loadedAny = result.loaded.length > 0;
    } finally {
      if (generation === this.gunsmithArtGeneration) this.gunsmithArtLoading = false;
    }
    if (generation !== this.gunsmithArtGeneration || !this.isLive) return;
    if (loadedAny && this.committedPanel === 'gunsmith' && this.controller) {
      this.render(this.controller.snapshot());
    }
    if (!this.gunsmithArtLoading && this.pendingGunsmithArtIds.size > 0) {
      const pending = [...this.pendingGunsmithArtIds];
      this.pendingGunsmithArtIds.clear();
      await this.ensureGunsmithPresentation(pending);
    }
  }

  private serializeTextureLoad<T>(load: () => Promise<T>): Promise<T> {
    const task = this.menuTextureLoadTail.then(load, load);
    this.menuTextureLoadTail = task.then(() => undefined, () => undefined);
    return task;
  }

  private addBackButton(
    root: Phaser.GameObjects.Container,
    _width: number,
    margin: number,
    hitTarget: number,
  ): void {
    this.addButton(root, margin, this.scale.height - edgeMargin(this.currentViewport!, 'bottom') - hitTarget, '< Back', hitTarget, () => {
      const next = this.requireController().back();
      this.render(next);
    }, 'ui:back');
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
      const x = this.scale.width - this.safeRightMargin - 5;
      const centerY = (this.scrollViewportTop + this.scrollViewportBottom) / 2;
      const track = this.uiVisuals.addPanel(
        this, x, centerY, 8, this.scrollRegion.viewportHeight, 'scroll-track', { alpha: 0.72 },
      );
      if (track) this.own(root, track);
      this.scrollThumbHeight = Math.max(32, this.scrollRegion.viewportHeight
        * (this.scrollRegion.viewportHeight / this.scrollRegion.contentHeight));
      const thumb = this.uiVisuals.addPanel(
        this, x, this.scrollViewportTop + this.scrollThumbHeight / 2,
        8, this.scrollThumbHeight, 'scroll-thumb', { alpha: 0.95 },
      ) as (Phaser.GameObjects.GameObject & { setPosition?(x: number, y: number): unknown }) | undefined;
      if (thumb) {
        this.scrollThumb = thumb;
        this.own(root, thumb);
      }
    }
    this.applyScrollViewport();
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
  }

  private applyScrollViewport(): void {
    if (!this.scrollRegion) return;
    const offset = this.scrollRegion.scrollOffset;
    const maxScroll = Math.max(0, this.scrollRegion.contentHeight - this.scrollRegion.viewportHeight);
    if (this.scrollThumb && maxScroll > 0) {
      const travel = this.scrollRegion.viewportHeight - this.scrollThumbHeight;
      this.scrollThumb.setPosition?.(
        this.scale.width - this.safeRightMargin - 5,
        this.scrollViewportTop + this.scrollThumbHeight / 2 + travel * (offset / maxScroll),
      );
    }
    for (const entry of this.scrollObjects) {
      const object = entry.object as unknown as {
        setPosition?(x: number, y: number): unknown;
        setVisible?(visible: boolean): unknown;
        getBounds?(): { top: number; bottom: number };
      };
      object.setPosition?.(entry.x, entry.y - offset);
      const ownerBounds = entry.ownerIndex === undefined ? undefined : this.scrollItemBounds.get(entry.ownerIndex);
      const bounds = ownerBounds === undefined
        ? object.getBounds?.()
        : { top: ownerBounds.top - offset, bottom: ownerBounds.bottom - offset };
      if (bounds) object.setVisible?.(bounds.top >= this.scrollViewportTop && bounds.bottom <= this.scrollViewportBottom);
    }
    for (const index of this.scrollItemIndexes) {
      const text = this.focusables[index];
      if (!text) continue;
      const groupBounds = this.scrollItemBounds.get(index);
      const bounds = groupBounds === undefined
        ? text.getBounds()
        : { top: groupBounds.top - offset, bottom: groupBounds.bottom - offset };
      const visible = bounds.top >= this.scrollViewportTop && bounds.bottom <= this.scrollViewportBottom;
      text.setVisible(visible);
      const ring = this.focusRings[index];
      ring?.setVisible?.(visible);
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
    if (resolved === 'down' && this.scrollRegion && localFocus === this.scrollRegion.itemCount - 1
      && this.scrollRegion.scrollToEnd()) {
      this.applyScrollViewport();
      this.bus?.emit('ui:navigate', {});
      this.applyFocus();
      return;
    }
    const moved = this.navigator.move(resolved);
    if (moved) {
      this.syncScrollFocus(this.navigator.index);
      this.applyScrollViewport();
    }
    if (moved) {
      this.bus?.emit('ui:navigate', {});
    }
    this.applyFocus();
  }

  private handleActivate(): void {
    if (this.runLaunchState === 'loading' || isPortraitOrientationBlocked()) return;
    if (!this.committedDisplay) return;
    const focused = this.focusables[this.navigator.index];
    if (focused && this.disabledFocusables.has(focused)) return;
    focused?.emit(Phaser.Input.Events.POINTER_UP);
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
    this.runLaunchGeneration += 1;
    this.gunsmithArtGeneration += 1;
    this.gunsmithArtLoading = false;
    this.mercenaryArtLoading = false;
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
    this.root?.destroy(true);
    this.root = undefined;
    // Clear the hint reference BEFORE the root destroy: it is the only
    // Phaser.GameObjects field Menu retains across shutdown, and a stale
    // reference would let a later presentation refresh call setText() on
    // destroyed Text (round-9).
    this.hint = undefined;
    this.focusables = [];
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
