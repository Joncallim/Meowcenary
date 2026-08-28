import type { Settings } from '../systems/save';
import { ArenaSelectionController, type ArenaSelectionSnapshot } from './arenaSelectionController';
import { CharacterSelectionController, type CharacterSelectionSnapshot } from './characterSelectionController';
import { ProgressionController, type ProgressionSnapshot } from './progressionController';
import { SettingsController, type SettingsSnapshot } from './settings';
import { StageSelectionController, type StageSelectionSnapshot } from './stageSelectionController';
import { AchievementsController, type AchievementsSnapshot } from './achievementsController';
import { GunsmithController, type GunsmithSnapshot } from './gunsmithController';
import { DataAchievementRegistry } from '../systems/achievements';
import type { GameContext } from '../engine/context';

export type MenuPanel =
  | 'home'
  | 'character'
  | 'arena'
  | 'stage'
  | 'achievements'
  | 'gunsmith'
  | 'progression'
  | 'settings'
  | 'reset-confirmation';

type NonResetPanel = Exclude<MenuPanel, 'reset-confirmation'>;

export interface MainMenuSnapshot {
  readonly panel: MenuPanel;
  readonly character: CharacterSelectionSnapshot;
  readonly arena: ArenaSelectionSnapshot;
  readonly stage: StageSelectionSnapshot;
  readonly achievements: AchievementsSnapshot;
  readonly gunsmith: GunsmithSnapshot;
  readonly progression: ProgressionSnapshot;
  readonly settings: SettingsSnapshot;
  readonly notice?: string;
}

export class MainMenuController {
  private readonly characterController: CharacterSelectionController;
  private readonly arenaController: ArenaSelectionController;
  private readonly stageController: StageSelectionController;
  private readonly progressionController: ProgressionController;
  private readonly achievementsController: AchievementsController;
  private readonly gunsmithController: GunsmithController;
  private readonly settingsController: SettingsController;
  private panel: MenuPanel = 'home';
  private previousPanel: NonResetPanel = 'home';
  private notice?: string;

  constructor(context: GameContext) {
    this.characterController = new CharacterSelectionController(context);
    this.arenaController = new ArenaSelectionController(context);
    this.stageController = new StageSelectionController(context);
    this.progressionController = new ProgressionController(context);
    this.achievementsController = new AchievementsController(context, new DataAchievementRegistry({ achievements: context.data.achievements ?? [] }));
    this.gunsmithController = new GunsmithController(context);
    this.settingsController = new SettingsController(context);
  }

  snapshot(): MainMenuSnapshot {
    return Object.freeze({
      panel: this.panel,
      character: this.characterController.snapshot(),
      arena: this.arenaController.snapshot(),
      stage: this.stageController.snapshot(),
      achievements: this.achievementsController.snapshot(),
      gunsmith: this.gunsmithController.snapshot(),
      progression: this.progressionController.snapshot(),
      settings: this.settingsController.snapshot(),
      notice: this.notice,
    });
  }

  open(panel: NonResetPanel): MainMenuSnapshot {
    this.previousPanel = panel === 'home' ? this.previousPanel : panel;
    this.panel = panel;
    this.notice = undefined;
    return this.snapshot();
  }

  back(): MainMenuSnapshot {
    if (this.panel === 'reset-confirmation') {
      this.panel = 'progression';
      this.notice = undefined;
      return this.snapshot();
    }

    if (this.panel !== 'home') {
      this.panel = 'home';
    }
    this.notice = undefined;
    return this.snapshot();
  }

  selectCharacter(id: string, expectedRevision: number): MainMenuSnapshot {
    const result = this.characterController.select(id, expectedRevision);
    this.notice = result.ok ? undefined : this.noticeForSelectionFailure(result.reason);
    return this.snapshot();
  }

  selectArena(id: string, expectedRevision: number): MainMenuSnapshot {
    const result = this.arenaController.select(id, expectedRevision);
    this.notice = result.ok ? undefined : this.noticeForSelectionFailure(result.reason);
    return this.snapshot();
  }

  selectStage(id: string): MainMenuSnapshot {
    const result = this.stageController.select(id);
    this.notice = result.ok ? undefined : 'Selection is locked';
    return this.snapshot();
  }

  purchase(upgradeId: string): MainMenuSnapshot {
    const result = this.progressionController.purchase(upgradeId);
    if (!result.ok) {
      this.notice = this.noticeForPurchaseFailure(result.reason);
      return this.snapshot();
    }
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    return this.snapshot();
  }

  requestReset(): MainMenuSnapshot {
    this.previousPanel = 'progression';
    this.panel = 'reset-confirmation';
    this.notice = undefined;
    return this.snapshot();
  }

  cancelReset(): MainMenuSnapshot {
    if (this.panel === 'reset-confirmation') {
      this.panel = 'progression';
    }
    this.notice = undefined;
    return this.snapshot();
  }

  confirmReset(): MainMenuSnapshot {
    if (this.panel !== 'reset-confirmation') {
      this.notice = 'Reset confirmation required';
      return this.snapshot();
    }
    const result = this.progressionController.reset(true);
    if (!result.ok) {
      this.notice = 'Reset failed';
      return this.snapshot();
    }
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    this.panel = 'progression';
    return this.snapshot();
  }

  setSettings(patch: Readonly<Partial<Settings>>): MainMenuSnapshot {
    const result = this.settingsController.set(patch);
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    return this.snapshot();
  }

  createGunBuild(family: string): MainMenuSnapshot {
    const result = this.gunsmithController.createBuild(family);
    this.notice = result.ok ? undefined : `Gunsmith: ${result.reason}`;
    return this.snapshot();
  }

  selectGunBuild(id: string): MainMenuSnapshot {
    const result = this.gunsmithController.selectBuild(id);
    this.notice = result.ok ? undefined : `Gunsmith: ${result.reason}`;
    return this.snapshot();
  }

  fitGunPart(instanceId: string): MainMenuSnapshot {
    const result = this.gunsmithController.fitPart(instanceId);
    this.notice = result.ok ? undefined : `Gunsmith: ${result.reason}`;
    return this.snapshot();
  }

  unequipGunPart(instanceId: string): MainMenuSnapshot {
    const result = this.gunsmithController.unequipPart(instanceId);
    this.notice = result.ok ? undefined : `Gunsmith: ${result.reason}`;
    return this.snapshot();
  }

  private noticeForSelectionFailure(
    reason: 'unknown-character' | 'locked' | 'stale-selection' | 'unknown-arena' | string,
  ): string {
    switch (reason) {
      case 'locked':
        return 'Selection is locked';
      case 'stale-selection':
        return 'Selection changed; please retry';
      case 'unknown-character':
      case 'unknown-arena':
        return 'Selection not found';
      default:
        return 'Selection failed';
    }
  }

  private noticeForPurchaseFailure(reason: string): string {
    switch (reason) {
      case 'insufficient-scrap':
        return 'Not enough scrap';
      case 'max-level':
        return 'Already at max level';
      case 'unknown-upgrade':
        return 'Upgrade not found';
      default:
        return 'Purchase failed';
    }
  }
}
