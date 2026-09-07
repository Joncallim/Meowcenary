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
import { assertRunPhysicalResourcesLoaded, loadTextureResources, resolveRunPhysicalResources } from '../systems/resourceLoader';
import { DataVisualArtRegistry } from '../systems/visualArt';

const MENU_DEPTH = ThemeDepth.pauseSummary;
/** 44 physical px at the smallest promised FIT (844×390 → 0.462085). */
const MIN_MENU_BUTTON_LOGICAL_WIDTH = 44 / 0.462085;

/** The two audible command events a menu button can produce. */
type MenuAudioEvent = 'ui:confirm' | 'ui:back';

export class MenuScene extends Phaser.Scene {
  private controller?: MainMenuController;
  private root?: Phaser.GameObjects.Container;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusRings: Phaser.GameObjects.Rectangle[] = [];
  private readonly navigator = new FocusNavigator('linear');
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
  /** A run never starts against the boot bundle alone. This state remains in
   * Menu so a load failure has a usable Retry/Back surface rather than a
   * partially constructed GameScene. */
  private runLaunchState: 'idle' | 'loading' | 'failed' = 'idle';
  private runLaunchError?: string;
  /** Number of committed render attempts; resize tests assert one per event. */
  get renderRebuildCount(): number {
    return this.rebuildCount;
  }

  constructor() {
    super(SceneKey.Menu);
  }

  create(data?: { readonly initialPanel?: import('../ui/menus').MenuPanel }): void {
    const ctx = this.getContext();
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
    this.inputController?.update(delta);
    this.refreshInputPresentation();
    this.audioManager?.update(delta);
  }

  private render(snapshot: MainMenuSnapshot): void {
    this.rebuildCount += 1;
    const panelChanged = this.committedPanel !== undefined && this.committedPanel !== snapshot.panel;
    // The display is uncommitted from the moment teardown begins until a
    // successful publication below (F1 committed-display gate).
    this.committedDisplay = false;
    this.root?.destroy(true);
    this.root = undefined;
    this.focusables = [];
    this.focusRings = [];
    this.scrollRegion = undefined;
    this.collectingScrollItems = false;
    this.scrollItemIndexes.clear();
    this.scrollLocalIndexByFocusIndex.clear();
    this.scrollObjects = [];
    this.hoveredIndex = -1;
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

      this.navigator.setCount(this.focusables.length);
      if (panelChanged) this.navigator.reset();
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
    const selectedStage = snapshot.stage.stages.find((s) => s.selected);
    const infoLines = [
      `Character: ${selectedCharacter?.name ?? snapshot.character.selectedCharacterId}`,
      `Contract: ${selectedStage?.name ?? snapshot.stage.selectedStageId}`,
      `Scrap: ${this.getContext().saveData.progression.scrap}`,
    ];

    const info = this.own(root, createUiText(this,margin, top, infoLines.join('\n'), {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      lineSpacing: 4,
      wordWrap: { width: width - margin - this.safeRightMargin },
    }));
    info.setScrollFactor(0);

    const buttons: ReadonlyArray<{ readonly label: string; readonly action: () => void }> = [
      {
        label: this.runLaunchState === 'failed' ? 'Retry Loading Contract' : 'Play Contract',
        action: () => { void this.startContractWithResources(); },
      },
      { label: 'Mercenary', action: () => this.render(this.requireController().open('character')) },
      { label: 'Loadout: Equipment', action: () => this.render(this.requireController().open('equipment')) },
      { label: 'Loadout: Gunsmith', action: () => this.render(this.requireController().open('gunsmith')) },
      { label: 'Career', action: () => this.render(this.requireController().open('career')) },
      { label: 'Training', action: () => this.render(this.requireController().open('training')) },
      { label: 'Settings', action: () => this.render(this.requireController().open('settings')) },
    ];
    let y = top + info.height + 24;
    buttons.forEach(({ label, action }) => {
      const button = this.addButton(root, this.safeCenterX, y, label, hitTarget, action);
      y += button.height + 12;
    });

    const hints = this.own(root, createUiText(this,margin, this.scale.height - edgeMargin(this.currentViewport!, 'bottom') - 14, this.menuHintCopy(), {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.bodyMin}px`,
    }));
    hints.setScrollFactor(0);
    this.hint = hints;
    if (this.runLaunchState === 'failed') {
      const detail = this.own(root, createUiText(this, margin, top + info.height + 4,
        `Unable to load the contract. Retry or choose another menu option. ${this.runLaunchError ?? ''}`,
        {
          color: '#f87171',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin },
        }));
      detail.setScrollFactor(0);
    }
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
    if (this.runLaunchState === 'loading') return;
    this.runLaunchState = 'loading';
    this.runLaunchError = undefined;
    this.render(this.requireController().snapshot());
    try {
      const ctx = this.getContext();
      const plan = request.kind === 'stage'
        ? resolveRunPlan({ characterId: request.characterId, stageId: request.stageId, seed: request.seed }, ctx.stages.runPlanCatalog())
        : undefined;
      const arenaId = plan?.arenaId ?? (request.kind === 'legacy-arena' ? request.arenaId : undefined);
      const arena = arenaId === undefined ? undefined : ctx.arenas.arenaById(arenaId);
      if (!arena) throw new Error('Selected contract arena is unavailable');
      const legacyEnemyIds = request.kind === 'legacy-arena'
        ? (ctx.data.spawnCurves.find((curve) => curve.id === arena.spawnCurveId)?.waves.map((wave) => wave.enemyId) ?? [])
        : [];
      const resources = resolveRunPhysicalResources({
        data: ctx.data,
        characterId: request.characterId,
        arena,
        encounterEnemyIds: plan?.encounter.enemyIds ?? legacyEnemyIds,
        bossId: plan?.encounter.bossId,
      });
      const result = await loadTextureResources(this, resources);
      if (result.failed.length > 0) throw new Error(`Failed resources: ${result.failed.map((entry) => entry.resourceId).join(', ')}`);
      const art = new DataVisualArtRegistry(ctx.data);
      const resourceIds = new Set(resources.map((resource) => resource.id));
      assertRunPhysicalResourcesLoaded(this.textures, art.all().filter((binding) =>
        binding.resourceId !== undefined && resourceIds.has(binding.resourceId)));
      this.scene.start(SceneKey.Game, { runRequest: request, isTraining });
    } catch (error) {
      this.runLaunchState = 'failed';
      this.runLaunchError = error instanceof Error ? error.message : 'Unknown loading error';
      this.render(this.requireController().snapshot());
    }
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
      const button = this.addButton(root, margin, y, label, hitTarget, () => {
        const next = this.requireController().selectCharacter(character.id, snapshot.character.revision);
        this.render(next);
      });
      if (character.description || character.abilityName) {
        const details = [
          character.description,
          `Base: ${character.baseStatsSummary}`,
          character.passiveSummary,
          character.abilityName ? `${character.abilityName}: ${character.abilityDescription}` : undefined,
          character.locked ? character.unlockRequirement : undefined,
        ]
          .filter(Boolean).join('\n');
        const desc = this.own(root, createUiText(this,margin + 12, y + button.height + 2, details, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.safeRightMargin - 12 },
        }));
        desc.setScrollFactor(0);
        this.registerScrollObject(desc);
        y += desc.height + 8;
      }
      y += button.height + 16;
    });

    this.endScrollableRegion();
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
    snapshot.stage.stages.forEach((stage) => {
      const label = `${stage.selected ? '✓ ' : ''}${stage.name}${stage.locked ? ' 🔒' : ''}`;
      this.addButton(root, margin, y, label, hitTarget, () => {
        this.render(this.requireController().selectStage(stage.id));
      });
      y += hitTarget + 16;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
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
      const row = this.own(root, createUiText(this, margin, y, `${goal.title}\n${goal.detail}`, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      y += row.height + 12;
    });
    this.addButton(root, margin, y, 'Choose Contract', hitTarget, () => this.render(this.requireController().open('stage')));
    this.addBackButton(root, width, margin, hitTarget);
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
      const row = this.addButton(root, margin, y, `${name}\n${detail}`, hitTarget, () => undefined, 'ui:confirm', width - margin - this.safeRightMargin);
      row.setStyle({
        color: entry.status === 'unseen' ? '#94a3b8' : '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin },
      });
      y += row.height + 12;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderTraining(root: Phaser.GameObjects.Container, width: number, top: number, margin: number, hitTarget: number): void {
    const heading = this.addHeading(root, this.safeCenterX, top, 'Training');
    const copy = this.own(root, createUiText(this, margin, top + heading.height + 20,
      'Practice movement and auto-fire here. Training does not award progression or Compendium discovery.',
      { color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, wordWrap: { width: width - margin - this.safeRightMargin } }));
    this.addButton(root, margin, top + heading.height + copy.height + 36, 'Start Training', hitTarget, () => { void this.startTrainingWithResources(); });
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
    let y = top + heading.height + 16;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    snapshot.achievements.achievements.forEach((achievement) => {
      const row = this.addButton(root, margin, y, `${achievement.name} — ${achievement.status} ${achievement.progress}/${achievement.target}\n${achievement.description}\nReward: ${achievement.rewardSummary}`, hitTarget, () => undefined, 'ui:confirm', width - margin - this.safeRightMargin);
      row.setStyle({
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      });
      y += row.height + 12;
    });
    this.endScrollableRegion();
    this.addBackButton(root, width, margin, hitTarget);
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
    const selected = snapshot.gunsmith.builds.find((build) => build.id === snapshot.gunsmith.selectedBuildId);
    if (!selected) {
      this.own(root, createUiText(this, margin, y, 'Choose a main weapon chassis.', {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      y += hitTarget;
      for (const family of ['pistol', 'smg', 'shotgun']) {
        this.addButton(root, margin, y, `Build ${family.toUpperCase()}`, hitTarget, () => {
          this.render(this.requireController().createGunBuild(family));
        });
        y += hitTarget + 8;
      }
    } else {
      this.own(root, createUiText(this, margin, y, `${selected.name} (${selected.baseWeaponFamily})\nFitted: ${Object.values(selected.fitted).filter(Boolean).length} • Traits: ${selected.traitParts.length}`, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      y += hitTarget + 12;
      snapshot.gunsmith.builds.filter((build) => build.id !== selected.id).forEach((build) => {
        this.addButton(root, margin, y, `Use ${build.name}`, hitTarget, () => this.render(this.requireController().selectGunBuild(build.id)));
        y += hitTarget + 8;
      });
      const actions: Array<{ label: string; action: () => void; iconArtId?: string }> = snapshot.gunsmith.parts.map((part) => ({
        label: `${part.fitted ? 'Fitted' : part.compatible ? 'Fit' : 'Incompatible'} ${part.name} T${part.tier}${part.traits.length ? ` [${part.traits.join(', ')}]` : ''}\n${part.comparisonSummary}`,
        action: () => this.render(part.fitted
          ? this.requireController().unequipGunPart(part.instanceId)
          : part.compatible ? this.requireController().fitGunPart(part.instanceId) : this.requireController().snapshot()),
        iconArtId: part.iconArtId,
      }));
      const mergePairs = snapshot.gunsmith.parts.flatMap((part, index) => snapshot.gunsmith.parts
        .slice(index + 1)
        .filter((candidate) => candidate.partId === part.partId && candidate.tier === part.tier)
        .map((candidate) => ({ first: part, second: candidate })));
      actions.push(...mergePairs.map(({ first, second }) => ({
        label: `Merge ${first.name} T${first.tier}`,
        action: () => this.render(this.requireController().mergeGunParts(first.instanceId, second.instanceId)),
      })));
      const infusionPairs = snapshot.gunsmith.parts.flatMap((target) => snapshot.gunsmith.parts
        .filter((trait) => target.slot !== 'trait' && trait.slot === 'trait' && trait.instanceId !== target.instanceId)
        .map((trait) => ({ target, trait })));
      actions.push(...infusionPairs.map(({ target, trait }) => ({
        label: `Infuse ${target.name} with ${trait.name}`,
        action: () => this.render(this.requireController().infuseGunPart(target.instanceId, trait.instanceId)),
      })));
      // Save migration intentionally retains stale instances.  Normal fitted
      // rows already provide unequip; only expose this recovery action when a
      // catalog-missing instance would otherwise keep a slot permanently full.
      const visiblePartIds = new Set(snapshot.gunsmith.parts.map((part) => part.instanceId));
      for (const instanceId of [...Object.values(selected.fitted), ...selected.traitParts]) {
        if (instanceId && !visiblePartIds.has(instanceId)) {
          actions.push({ label: `Remove unavailable part ${instanceId}`, action: () => this.render(this.requireController().unequipGunPart(instanceId)) });
        }
      }
      this.own(root, createUiText(this, margin, y, 'Owned parts and crafting:', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      y += hitTarget * 0.7;
      this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
      actions.forEach((item) => {
        const iconColumn = item.iconArtId ? 38 : 0;
        const actionText = this.addButton(root, margin, y, item.label, hitTarget, item.action, 'ui:confirm', iconColumn > 0 ? width - margin - this.safeRightMargin - iconColumn : undefined);
        if (item.iconArtId) this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, item.iconArtId);
        y += actionText.height + 8;
      });
      this.endScrollableRegion();
    }
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
      const active = snapshot.equipment.activeSets.map((set) => `${set.name} Set • ${set.pieces}/4 equipped${set.activeThresholds.length ? ` (${set.activeThresholds.join('+')}-piece active)` : ''}\n${set.bonusSummary.join(' • ')}`).join('\n');
      const activeText = this.own(root, createUiText(this, margin, y, `Active sets — ${active}`, {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      y += activeText.height + 12;
    }
    this.own(root, createUiText(this, margin, y, 'Owned equipment:', {
      color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
    }));
    y += hitTarget * 0.7;
    this.beginScrollableRegion(y, this.scrollViewportBottomFor(hitTarget));
    snapshot.equipment.owned.forEach((item) => {
      const equippedHere = equipped[item.slot] === item.instanceId;
      const iconColumn = 38;
      const equipmentButton = this.addButton(root, margin, y, `${equippedHere ? '✓ ' : ''}${item.name}\n${item.setName} Set • ${item.setPieces}/4 equipped • Tier ${item.tier}\n${equippedHere ? 'Equipped' : 'Tap to equip'}`, hitTarget, () => {
        this.render(equippedHere
          ? this.requireController().unequipEquipment(item.slot as 'helmet' | 'armour' | 'gloves' | 'boots')
          : this.requireController().equipEquipment(item.instanceId));
      }, 'ui:confirm', width - margin - this.safeRightMargin - iconColumn);
      this.addCatalogIcon(root, width - this.safeRightMargin - margin - 13, y + hitTarget / 2, item.iconArtId);
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
    this.endScrollableRegion();
    if (snapshot.equipment.owned.length === 0) {
      this.own(root, createUiText(this, margin, y, 'Complete bosses and achievements to earn persistent equipment.', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      y += hitTarget;
    }
    snapshot.equipment.unavailable.forEach(() => {
      this.own(root, createUiText(this, margin, y, 'A legacy equipment item is unavailable in this version.', {
        color: '#fbbf24', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.safeRightMargin },
      }));
      y += hitTarget * 0.75;
    });
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
  private addCatalogIcon(root: Phaser.GameObjects.Container, x: number, y: number, iconArtId: string): void {
    const binding = this.getContext().data.visualArt.bindings.find((candidate) => candidate.id === iconArtId);
    if (!binding || binding.kind !== 'upgrade-icon' || !this.textures?.exists(binding.textureKey)) return;
    const icon = this.own(root, this.add.image(x, y, binding.textureKey, binding.frameKey));
    icon.setDisplaySize(Math.min(26, binding.display.width), Math.min(26, binding.display.height));
    icon.setScrollFactor(0);
    this.registerScrollObject(icon);
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
      if (visible) text.setInteractive({ useHandCursor: true });
      else text.disableInteractive();
    }
  }

  private handleScroll(delta: number): void {
    if (!this.committedDisplay || !this.scrollRegion) return;
    this.scrollRegion.scrollBy(delta);
    this.applyScrollViewport();
    this.applyFocus();
  }

  private readonly handleWheel = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void => {
    this.handleScroll(deltaY);
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.isDown) {
      this.touchScrollY = undefined;
      return;
    }
    if (this.touchScrollY !== undefined) {
      const delta = this.touchScrollY - pointer.y;
      this.touchDragDistance += Math.abs(delta);
      if (this.touchDragDistance >= 8) this.touchDidScroll = true;
      this.handleScroll(delta);
    }
    this.touchScrollY = pointer.y;
  };

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.touchScrollY = pointer.y;
    this.touchDragDistance = 0;
    this.touchDidScroll = false;
  };

  private readonly handlePointerUp = (): void => {
    this.touchScrollY = undefined;
    this.touchDragDistance = 0;
  };

  private handleBack(): void {
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
    if (!this.committedDisplay) return;
    const focused = this.focusables[this.navigator.index];
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
    // The manager is game-scoped and Boot-owned: shutdown only drops this
    // scene's reference — never destroy/stopMusic/stopAll.
    this.audioManager = undefined;
  }

  private getContext(): GameContext {
    return getGameContext(this);
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
