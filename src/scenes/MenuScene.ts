import Phaser from 'phaser';
import { getGameContext, type GameContext } from '../engine/context';
import type { EventBus } from '../engine/eventBus';

import { SceneKey } from '../engine/sceneKeys';
import { AudioManager, getAudioManager } from '../systems/audio';
import { edgeMargin, logicalCanvasViewport, minimumHitTarget, type UiViewport } from '../ui/layout';
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
import { DataVisualArtRegistry, DataVisualResourceRegistry, resolveAchievementIconBinding } from '../systems/visualArt';
import { isPortraitOrientationBlocked } from '../platform/orientation';

const MENU_DEPTH = ThemeDepth.pauseSummary;
/** 44 physical px at the smallest promised FIT (844×390 → 0.462085). */
const MIN_MENU_BUTTON_LOGICAL_WIDTH = 44 / 0.462085;

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
  private focusRings: Phaser.GameObjects.Rectangle[] = [];
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
  private scrollObjects: Array<{ object: Phaser.GameObjects.GameObject; x: number; y: number }> = [];
  private scrollViewportTop = 0;
  private scrollViewportBottom = 0;
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
  private readonly pendingPanelArtIds = new Set<string>();
  private readonly pendingPanelArtRepaints = new Set<MainMenuSnapshot['panel']>();
  private panelArtGeneration = 0;
  /** Scene-lifetime physical binding resolver. Career can render a large
   * gallery repeatedly, so per-badge catalog cloning/validation is invalid. */
  private visualArt?: DataVisualArtRegistry;
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
    this.pendingPanelArtIds.clear();
    this.pendingPanelArtRepaints.clear();
    this.isLive = true;
    const ctx = this.getContext();
    this.visualArt = new DataVisualArtRegistry(ctx.data);
    this.bus = ctx.bus;
    this.controller = new MainMenuController(ctx);

    this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        ThemeColor.background,
      )
      .setScrollFactor(0);

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
    this.scrollRegion = undefined;
    this.collectingScrollItems = false;
    this.scrollItemIndexes.clear();
    this.scrollLocalIndexByFocusIndex.clear();
    this.scrollObjects = [];
    this.hoveredIndex = -1;
    this.focusIndexAfterRender = undefined;
    this.hint = undefined;

    const root = this.add.container(0, 0);
    root.setDepth(MENU_DEPTH).setScrollFactor(0);

    const width = this.scale.width;
    const viewport: UiViewport = logicalCanvasViewport(
      this.scale.displaySize.width,
      this.scale.displaySize.height,
      this.scale.parentSize?.width ?? this.scale.displaySize.width,
      this.scale.parentSize?.height ?? this.scale.displaySize.height,
    );
    this.currentViewport = viewport;
    const leftMargin = edgeMargin(viewport, 'left');
    const topMargin = edgeMargin(viewport, 'top');
    this.safeRightMargin = edgeMargin(viewport, 'right');
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
      this.finishScrollableRegion();
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
    const infoLines = [
      `${selectedCharacter?.name ?? snapshot.character.selectedCharacterId} • ${this.getContext().saveData.progression.scrap} Scrap`,
      `${campaignComplete ? 'CAMPAIGN COMPLETE — REPLAY' : selectedStage?.completed ? 'REPLAY CONTRACT' : 'NEXT CONTRACT'} • ${selectedStage?.chapterName ?? ''} ${selectedStage?.displayOrder ?? ''}`,
      `${selectedStage?.name ?? snapshot.stage.selectedStageId} • ${selectedStage?.locationName ?? ''}`,
      selectedStage?.objective.copy ?? '',
      selectedStage ? `Threats: ${selectedStage.threats.map((threat) => threat.name).join(' • ')}` : '',
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

    const buttons: ReadonlyArray<{ readonly label: string; readonly action: () => void }> = [
      {
        label: this.runLaunchState === 'failed' ? 'Retry Loading Contract' : selectedStage?.completed ? 'Replay Contract' : 'Play Contract',
        action: () => { void this.startContractWithResources(); },
      },
      { label: 'Change Contract', action: () => this.render(this.requireController().open('stage')) },
      { label: 'Mercenary', action: () => this.render(this.requireController().open('character')) },
      { label: 'Loadout', action: () => this.render(this.requireController().open('loadout')) },
      { label: 'Career', action: () => this.render(this.requireController().open('career')) },
      { label: 'Training', action: () => this.render(this.requireController().open('training')) },
      { label: 'Settings', action: () => this.render(this.requireController().open('settings')) },
    ];
    const artX = width - this.safeRightMargin - 28;
    if (selectedCharacter) this.addPanelArt(root, artX, top + 18, selectedCharacter.actorArtId, 40);
    if (selectedStage) {
      this.addPanelArt(root, artX, top + 54, selectedStage.locationArtId, 34);
      this.addPanelArt(root, artX - 34, top + 54, selectedStage.objective.artId, 26);
      selectedStage.threats.forEach((threat, index) => {
        this.addPanelArt(root, artX - (index % 2) * 30, top + 88 + Math.floor(index / 2) * 28, threat.actorArtId, 24);
      });
    }
    let y = top + info.height + 12;
    const compactLandscape = this.scale.height < 500 && width >= 700;
    if (compactLandscape) {
      const gap = 4;
      const buttonWidth = (width - margin - this.safeRightMargin - gap * (buttons.length - 1)) / buttons.length;
      buttons.forEach(({ label, action }, index) => {
        this.addButton(root, margin + index * (buttonWidth + gap), y, label, hitTarget, action, 'ui:confirm', buttonWidth);
      });
    } else {
      buttons.slice(0, 2).forEach(({ label, action }) => {
        const button = this.addButton(root, this.safeCenterX, y, label, hitTarget, action);
        y += button.height + 6;
      });
      const secondary = buttons.slice(2);
      const columnGap = 8;
      const columns = 2;
      const columnWidth = (width - margin - this.safeRightMargin - columnGap) / columns;
      secondary.forEach(({ label, action }, index) => {
        const column = index % columns;
        this.addButton(root, margin + column * (columnWidth + columnGap), y, label, hitTarget, action, 'ui:confirm', columnWidth);
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
    if (this.runLaunchState === 'failed') {
      const detail = this.own(root, createUiText(this, margin, top + info.height + 4,
        `Couldn't load this Contract. Retry or go Back.`,
        {
          color: '#f87171',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
      detail.setScrollFactor(0);
    }
    void this.ensurePanelPresentation('home', [
      selectedCharacter?.actorArtId,
      selectedStage?.locationArtId,
      selectedStage?.objective.artId,
      ...(selectedStage?.threats.map((threat) => threat.actorArtId) ?? []),
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
      await prepareRunPresentation(this, ctx.data, resources, (progress) => {
        if (this.isLive && generation === this.runLaunchGeneration && this.runLaunchState === 'loading') {
          this.runLaunchProgress = progress;
          this.render(this.requireController().snapshot());
        }
      });
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
    const text = this.own(root, createUiText(this, this.safeCenterX, this.scale.height / 2, copy, {
      color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin + 4}px`, align: 'center',
      wordWrap: { width: width - 32 },
    }).setOrigin(0.5).setDepth(MENU_DEPTH + 11).setScrollFactor(0));
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
      const artColumn = 68;
      const button = this.addButton(root, margin + artColumn, y, label, hitTarget, () => {
        const next = this.requireController().selectCharacter(character.id, snapshot.character.revision);
        this.render(next);
      }, 'ui:confirm', width - margin - this.safeRightMargin - artColumn);
      const rowHeaderHeight = Math.max(56, button.height);
      this.addMercenaryActor(root, margin + 28, y + rowHeaderHeight / 2, character.actorArtId, 56, character.locked);
      this.addCatalogIcon(root, width - this.safeRightMargin - 18, y + rowHeaderHeight / 2, character.startingWeaponIconArtId, 32);
      if (character.description || character.abilityName) {
        const details = [
          `${character.description} • Starts: ${character.startingWeaponSummary}`,
          `Base: ${character.baseStatsSummary}`,
          character.passiveSummary,
          character.abilityName ? `${character.abilityName}: ${character.abilityDescription}` : undefined,
          character.locked ? character.unlockRequirement : undefined,
        ]
          .filter(Boolean).join('\n');
        const desc = this.own(root, createUiText(this,margin + artColumn, y + rowHeaderHeight + 2, details, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - artColumn },
        }));
        desc.setScrollFactor(0);
        this.registerScrollObject(desc);
        y += rowHeaderHeight + desc.height + 10;
      } else {
        y += rowHeaderHeight + 16;
      }
    });

    this.endScrollableRegion();
    void this.ensureMercenaryPresentation(snapshot.character.characters.flatMap((character) => [
      character.actorArtId, character.startingWeaponIconArtId,
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
      if (stage.locked) this.disableButton(button);
      this.addPanelArt(root, margin + 18, y + Math.min(button.height, 52) / 2, stage.objective.artId, 32, stage.locked);
      y += button.height + 10;
      if (stage.selected && !stage.locked) {
        const detail = this.own(root, createUiText(this, margin + 42, y,
          `Threats: ${stage.threats.map((threat) => threat.name).join(' • ')}\nFirst clear: ${stage.reward.headline}`,
          { color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin - 42 } },
        ));
        this.registerScrollObject(detail);
        y += detail.height + 12;
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
      row.setStyle({
        color: entry.status === 'unseen' ? '#94a3b8' : '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      });
      if (entry.actorArtId) this.addPanelArt(root, margin + 26, y + Math.min(row.height, 58) / 2, entry.actorArtId, 50);
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
      button.setStyle({ color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px` });
      this.addAchievementIcon(root, x + cardWidth - 18, y + 20, achievement.iconArtId, 28);
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
          if (!enabled) this.disableButton(row);
          this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, part.iconArtId);
          part.traitIcons.forEach((trait, index) => {
            this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41 - index * 28, y + hitTarget / 2, trait.iconArtId, 22);
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
        if (!part.canFabricate) this.disableButton(row);
        this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, part.iconArtId);
        part.traitIcons.forEach((trait, index) => {
          this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41 - index * 28, y + hitTarget / 2, trait.iconArtId, 22);
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
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, item.iconArtId);
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41, y + hitTarget / 2, item.setEmblemArtId, 22);
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
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, blueprint.iconArtId);
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 41, y + hitTarget / 2, blueprint.setEmblemArtId, 22);
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
    const rows: Array<{ label: string; action: () => MainMenuSnapshot }> = [
      {
        label: `Mute: ${settings.muted ? 'On' : 'Off'}`,
        action: () => this.requireController().setSettings({ muted: !settings.muted }),
      },
      {
        label: `Music Volume: ${Math.round(settings.musicVolume * 100)}%`,
        action: () => this.requireController().setSettings({ musicVolume: cycleVolumeStep(settings.musicVolume) }),
      },
      {
        label: `SFX Volume: ${Math.round(settings.sfxVolume * 100)}%`,
        action: () => this.requireController().setSettings({ sfxVolume: cycleVolumeStep(settings.sfxVolume) }),
      },
      {
        label: `Reduced Motion: ${settings.reducedMotion ? 'On' : 'Off'}`,
        action: () => this.requireController().setSettings({ reducedMotion: !settings.reducedMotion }),
      },
    ];

    rows.forEach((row) => {
      this.addButton(root, margin, y, row.label, hitTarget, () => {
        const next = row.action();
        this.render(next);
      });
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
  ): Phaser.GameObjects.Text {
    const text = this.own(root, createUiText(this,x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      backgroundColor: 'rgba(23, 48, 59, 0.86)',
      padding: { x: 10, y: 8 },
      ...(maxLabelWidth === undefined ? {} : { wordWrap: { width: Math.max(1, maxLabelWidth - 20) } }),
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

    text.setInteractive({ useHandCursor: true });
    text.on(Phaser.Input.Events.POINTER_OVER, () => {
      text.setStyle({ backgroundColor: 'rgba(33, 71, 86, 0.92)' });
    });
    text.on(Phaser.Input.Events.POINTER_OUT, () => {
      text.setStyle({ backgroundColor: 'rgba(23, 48, 59, 0.86)' });
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
    const ring = this.add.rectangle(ringBounds.centerX, ringBounds.centerY, ringBounds.width, ringBounds.height, 0, 0);
    root.add(ring);
    ring.setStrokeStyle?.(FocusStroke.width, FocusStroke.color, 0);
    ring.setScrollFactor(0);
    this.focusRings.push(ring);
    const index = this.focusables.length - 1;
    if (this.scrollRegion && this.collectingScrollItems) {
      this.scrollItemIndexes.add(index);
      this.scrollObjects.push({ object: text, x: text.x, y: text.y });
      this.scrollObjects.push({ object: ring, x: ring.x, y: ring.y });
      // The shared region receives real rendered bounds, not a screen-local
      // row estimate, so wrapped labels and future content remain correct.
      this.scrollRegion.setItems([
        ...Array.from(this.scrollItemIndexes).map((itemIndex, localIndex) => {
          this.scrollLocalIndexByFocusIndex.set(itemIndex, localIndex);
          const item = this.focusables[itemIndex]!;
          const itemBounds = item.getBounds();
          return { index: localIndex, top: itemBounds.top, bottom: itemBounds.bottom };
        }),
      ]);
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
  private addCatalogIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string, maxSize = 26): void {
    const binding = this.requireVisualArt().bindingById(iconArtId);
    if (!binding || (binding.kind !== 'icon' && binding.kind !== 'upgrade-icon' && binding.kind !== 'achievement-icon' && binding.kind !== 'weapon-icon') || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    icon.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
    icon.setScrollFactor(0);
    this.registerScrollObject(icon);
  }

  /** Shared art anchor for Contract, Career and Compendium cards. Semantic IDs
   * come from their read models; this renderer only understands physical
   * binding capabilities. */
  private addPanelArt(root: Phaser.GameObjects.Container, x: number, y: number, artId: string, maxSize: number, subdued = false): void {
    const binding = this.requireVisualArt().bindingById(artId);
    if (!binding || !this.textures?.exists(binding.textureKey)) return;
    const frame = binding.load.type === 'spritesheet' ? binding.clips?.idle?.start ?? 0 : binding.frameKey;
    const image = this.own(root, this.add.image(x, y, binding.textureKey, frame));
    if (binding.load.type === 'spritesheet') {
      const scale = Math.min(maxSize / binding.load.frame.width, maxSize / binding.load.frame.height);
      image.setScale(scale);
    } else {
      image.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
    }
    image.setAlpha(subdued ? 0.35 : 1).setScrollFactor(0);
    this.registerScrollObject(image);
  }

  /** One guarded lazy-loading lifecycle for the growing visual panels. A
   * completion can repaint only the panel that requested it; pending IDs are
   * drained afterwards so rapid navigation cannot drop a resource closure. */
  private async ensurePanelPresentation(
    panel: MainMenuSnapshot['panel'],
    artIds: readonly string[],
    repaintWhenCached = false,
  ): Promise<void> {
    if (!this.textures?.exists) return;
    if (this.panelArtLoading) {
      artIds.forEach((id) => this.pendingPanelArtIds.add(id));
      this.pendingPanelArtRepaints.add(panel);
      return;
    }
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
      loadedAny = (await loadTextureResources(this, [...missing.values()])).loaded.length > 0;
    } finally {
      if (generation === this.panelArtGeneration) this.panelArtLoading = false;
    }
    if (generation !== this.panelArtGeneration || !this.isLive) return;
    if (loadedAny && this.committedPanel === panel && this.controller) this.render(this.controller.snapshot());
    if (this.pendingPanelArtIds.size > 0) {
      const pending = [...this.pendingPanelArtIds];
      const repaintPanels = new Set(this.pendingPanelArtRepaints);
      this.pendingPanelArtIds.clear();
      this.pendingPanelArtRepaints.clear();
      const targetPanel = this.committedPanel ?? panel;
      await this.ensurePanelPresentation(targetPanel, pending, repaintPanels.has(targetPanel));
    }
  }

  /** Mercenary thumbnails use the actor's authoritative first idle frame.
   * Locked entries stay identifiable but are visibly subdued; text remains
   * the authority for their exact unlock requirement. */
  private addMercenaryActor(root: Phaser.GameObjects.Container, x: number, y: number, actorArtId: string, maxSize = 56, locked = false): void {
    const binding = this.requireVisualArt().bindingById(actorArtId);
    if (!binding || binding.kind !== 'character' || binding.load.type !== 'spritesheet' || !this.textures?.exists(binding.textureKey)) return;
    const actor = this.own(root, this.add.image(x, y, binding.textureKey, binding.clips?.idle?.start ?? 0));
    const targetWidth = Math.min(maxSize, binding.display.width * 2);
    const targetHeight = Math.min(maxSize, binding.display.height * 2);
    actor.setScale(targetWidth / binding.load.frame.width, targetHeight / binding.load.frame.height);
    actor.setAlpha(locked ? 0.42 : 1);
    actor.setScrollFactor(0);
    this.registerScrollObject(actor);
  }

  /** Career shares terminal Achievement badge identity while retaining its
   * own gallery layout. Missing textures intentionally preserve text/focus. */
  private addAchievementIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string, maxSize = 26): void {
    const binding = resolveAchievementIconBinding(this.requireVisualArt(), iconArtId);
    if (!binding || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    icon.setDisplaySize(Math.min(maxSize, binding.display.width), Math.min(maxSize, binding.display.height));
    icon.setScrollFactor(0);
    this.registerScrollObject(icon);
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
      const result = await loadTextureResources(this, [...missing.values()]);
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
      const result = await loadTextureResources(this, [...missing.values()]);
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
      const result = await loadTextureResources(this, [...missing.values()]);
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
      const result = await loadTextureResources(this, [...missing.values()]);
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

  private registerScrollObject(object: Phaser.GameObjects.GameObject): void {
    if (!this.scrollRegion || !this.collectingScrollItems) return;
    const positioned = object as unknown as { x: number; y: number };
    this.scrollObjects.push({ object, x: positioned.x, y: positioned.y });
  }

  private finishScrollableRegion(): void {
    if (!this.scrollRegion || this.scrollItemIndexes.size === 0) return;
    const focused = this.navigator.index;
    if (this.scrollItemIndexes.has(focused)) {
      this.syncScrollFocus(focused);
    } else {
      this.scrollRegion.handleResize();
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
    for (const entry of this.scrollObjects) {
      const object = entry.object as unknown as {
        setPosition?(x: number, y: number): unknown;
        setVisible?(visible: boolean): unknown;
        getBounds?(): { top: number; bottom: number };
      };
      object.setPosition?.(entry.x, entry.y - offset);
      const bounds = object.getBounds?.();
      if (bounds) object.setVisible?.(bounds.top >= this.scrollViewportTop && bounds.bottom <= this.scrollViewportBottom);
    }
    for (const index of this.scrollItemIndexes) {
      const text = this.focusables[index];
      if (!text) continue;
      const bounds = text.getBounds();
      const visible = bounds.top >= this.scrollViewportTop && bounds.bottom <= this.scrollViewportBottom;
      text.setVisible(visible);
      const ring = this.focusRings[index];
      ring?.setVisible(visible);
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
