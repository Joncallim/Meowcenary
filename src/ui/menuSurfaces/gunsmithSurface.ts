import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { edgeMargin } from '../layout';
import { createUiText } from '../text';
import { ThemeFont } from '../theme';
import { MenuPanelSurface, type MenuSurfaceLayout, type GunsmithSurfaceCommands, type MenuSurfaceEnvironment, type MenuSurfaceControls } from './surface';
import { collectGunsmithArtIds, renderAssembledWeapon } from './weaponPresentation';

export class GunsmithSurface extends MenuPanelSurface {
  readonly panel = 'gunsmith' as const;
  private prefixInvariant?: string;
  private bodyTop = 0;
  private bodyGeneration = 0;
  private drawingBody = false;
  private tailObjects: Phaser.GameObjects.GameObject[] = [];
  private familyStatuses: Array<{ readonly id: string; readonly text: Phaser.GameObjects.Text }> = [];

  get bodyObjects(): readonly Phaser.GameObjects.GameObject[] { return this.tailObjects; }

  canUpdateBody(snapshot: MainMenuSnapshot, scrap: number): boolean {
    return !!this.root && this.layout.width === this.environment.scene.scale.width
      && this.layout.height === this.environment.scene.scale.height && snapshot.panel === this.panel
      && this.tailObjects.length > 0 && this.familyStatuses.length === snapshot.gunsmith.families.length
      && this.prefixInvariant === this.prefixFacts(snapshot, scrap);
  }

  updateBody(scrollRoot: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, scrap: number): void {
    if (!this.canUpdateBody(snapshot, scrap)) throw new Error('Gunsmith prefix changed during local update');
    this.bodyGeneration += 1;
    const old = this.tailObjects;
    this.tailObjects = [];
    for (const object of old) object.destroy();
    snapshot.gunsmith.families.forEach((family, index) => {
      const statusCopy = this.familyStatuses[index]!;
      if (statusCopy.id !== family.id) throw new Error('Gunsmith family order changed during local update');
      const copy = statusCopy.text;
      const status = family.selected ? 'SELECTED' : family.existingBuildId ? 'CONFIGURED' : 'EMPTY — TAP TO CREATE';
      const color = family.selected ? '#86efac' : '#a5f3fc';
      if (copy.text !== status) copy.setText(status);
      if (copy.style.color !== color) copy.setStyle({ color });
    });
    this.drawBody(scrollRoot, this.root!, snapshot);
  }

  override unmount(): void {
    this.bodyGeneration += 1;
    this.prefixInvariant = undefined;
    this.familyStatuses = [];
    this.tailObjects = [];
    super.unmount();
  }

  override dispose(): void {
    this.unmount();
    super.dispose();
  }

  protected override button(...args: Parameters<MenuSurfaceControls['addButton']>): Phaser.GameObjects.Text {
    const action = args[5];
    if (this.drawingBody && action) {
      const generation = this.bodyGeneration;
      args[5] = () => { if (generation === this.bodyGeneration) action(); };
    }
    return super.button(...args);
  }

  private prefixFacts(snapshot: MainMenuSnapshot, scrap: number): string {
    return JSON.stringify([snapshot.notice, scrap,
      snapshot.stage.stages.find(stage => stage.selected)?.menuBackdropArtId,
      snapshot.gunsmith.families.map(family => [
        family.id, family.name, family.iconArtId, family.previewBaseArtId, family.existingBuildId,
      ])]);
  }

  constructor(environment: MenuSurfaceEnvironment, private readonly commands: GunsmithSurfaceCommands) { super(environment); }

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    // A direct remount also revokes callbacks from the previous body.
    this.bodyGeneration += 1;
    this.familyStatuses = [];
    this.tailObjects = [];
    const { width, top, margin, hitTarget } = layout;
    const heading = this.environment.controls.addHeading(root, this.layout.centerX, top, 'Gunsmith');
    let y = top + heading.height + 14;
    this.environment.controls.beginScrollableRegion(y, this.layout.scrollBottom);
    const chassis = this.own(root, createUiText(this.environment.scene, margin, y, 'Weapon builds', {
      color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
    }));
    this.environment.controls.registerScrollObject(chassis);
    y += hitTarget * 0.7;
    snapshot.gunsmith.families.forEach((family) => {
      const label = `${family.name} Build`;
      const status = family.selected ? 'SELECTED' : family.existingBuildId ? 'CONFIGURED' : 'EMPTY — TAP TO CREATE';
      const familyCard = this.button(root, margin, y, label, 100, () => {
        if (family.existingBuildId) this.environment.onSnapshot(this.commands.selectGunBuild(family.existingBuildId), 'gunsmith-body');
        else this.environment.onSnapshot(this.commands.createGunBuild(family.id));
      }, 'ui:confirm', width - margin - this.layout.rightMargin, undefined, 8, 176, true);
      this.environment.controls.rememberFocus(familyCard, `gunsmith-family:${family.id}`);
      const rowOwnerIndex = this.environment.controls.buttonIndex(familyCard);
      this.environment.controls.addCatalogIcon(root, margin + 78, y + 50, family.previewBaseArtId ?? family.iconArtId, 146, rowOwnerIndex);
      const statusCopy = this.own(root, createUiText(this.environment.scene, margin + 176, y + 50, status, {
        color: family.selected ? '#86efac' : '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, fontStyle: '700',
      }));
      statusCopy.setScrollFactor(0);
      this.environment.controls.registerScrollObject(statusCopy, rowOwnerIndex);
      this.familyStatuses.push({ id: family.id, text: statusCopy });
      y += familyCard.height + 10;
    });
    this.bodyTop = y;
    this.prefixInvariant = this.prefixFacts(snapshot, scrap);
    this.drawBody(root, root, snapshot);
  }

  private drawBody(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot): void {
    const { width, margin, hitTarget } = this.layout;
    let y = this.bodyTop;
    const before = new Set([...root.list, ...fixedRoot.list]);
    this.drawingBody = true;
    try {
    const selected = snapshot.gunsmith.selectedBuild;
    if (!selected) {
      const prompt = this.own(root, createUiText(this.environment.scene, margin, y, 'Choose a weapon build to inspect its engineering.', {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.layout.rightMargin },
      }));
      this.environment.controls.registerScrollObject(prompt);
    } else {
      const buildHeader = this.own(root, createUiText(this.environment.scene, margin, y, `${selected.title.toUpperCase()}\n${selected.status} • ${selected.activation}`, {
        color: '#d6f7ff', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin - this.layout.rightMargin },
      }));
      this.environment.controls.registerScrollObject(buildHeader);
      y += buildHeader.height + 12;
      if (selected.preview) {
        const previewHeight = 142;
        const previewWidth = width - margin - this.layout.rightMargin;
        const previewPanel = this.environment.visuals?.addPanel(this.environment.scene, this.layout.centerX, y + previewHeight / 2, previewWidth, previewHeight, 'card', { alpha: 0.82 });
        if (previewPanel) {
          this.own(root, previewPanel);
          this.environment.controls.registerScrollObject(previewPanel);
        }
        const weaponX = this.layout.centerX;
        const weaponY = y + 48;
        renderAssembledWeapon(this.environment.controls, root, selected.preview, weaponX, weaponY);
        selected.preview.traitCores.forEach((core, index) => {
          this.environment.controls.addCatalogIcon(root, margin + 30 + index * 52, y + 30, core.iconArtId, 44);
        });
        selected.preview.traitEmblems.forEach((trait, index) => {
          this.environment.controls.addCatalogIcon(root, width - this.layout.rightMargin - 24 - index * 40, y + 30, trait.iconArtId, 34);
        });
        const summary = this.own(root, createUiText(this.environment.scene, this.layout.centerX, y + 100, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          align: 'center', wordWrap: { width: previewWidth - 24 },
        })).setOrigin(0.5, 0);
        this.environment.controls.registerScrollObject(summary);
        y += Math.max(previewHeight, 104 + summary.height) + 12;
      } else {
        const summary = this.own(root, createUiText(this.environment.scene, margin, y, selected.summary, {
          color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.layout.rightMargin },
        }));
        this.environment.controls.registerScrollObject(summary);
        y += summary.height + 10;
      }
      snapshot.gunsmith.slots.forEach((slot) => {
        const slotHeading = this.own(root, createUiText(this.environment.scene, margin + 42, y + 4, slot.slot === 'trait'
          ? `${slot.label.toUpperCase()} ${slot.candidates.filter((part) => part.state === 'fitted-here').length} / 2`
          : slot.label.toUpperCase(), {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.environment.controls.registerScrollObject(slotHeading);
        this.environment.controls.addCatalogIcon(root, margin + 18, y + 16, slot.iconArtId, 32);
        y += Math.max(slotHeading.height + 8, 36);
        if (slot.unavailableFitted) {
          const row = this.button(root, margin, y, `${slot.unavailableFitted.label}\nREMOVE UNAVAILABLE PART`, hitTarget,
            () => this.environment.onSnapshot(this.commands.removeUnavailableGunPart(slot.unavailableFitted!.instanceId)), 'ui:confirm', width - margin - this.layout.rightMargin);
          this.environment.controls.rememberFocus(row, `gunsmith-unavailable:${slot.unavailableFitted.instanceId}`);
          y += row.height + 8;
        }
        if (slot.candidates.length === 0 && slot.fitted === undefined && slot.unavailableFitted === undefined) {
          const empty = this.own(root, createUiText(this.environment.scene, margin, y, slot.slot === 'trait' ? 'No Trait Core fitted' : 'Empty', {
            color: '#94a3b8', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          }));
          this.environment.controls.registerScrollObject(empty);
          y += empty.height + 8;
          return;
        }
        slot.candidates.forEach((part) => {
          const action = part.actionLabel;
          const consequence = part.displacedInstanceId === undefined ? ''
            : `\n${part.displacementSummary}\n${part.comparisonSummary}`;
          const label = `${part.name} T${part.tier} • ${part.state === 'fitted-here' ? 'FITTED' : part.state === 'fitted-elsewhere' ? `FITTED TO ${part.assignedBuildName?.toUpperCase() ?? 'ANOTHER BUILD'}` : part.state === 'owned-unfitted' ? 'OWNED' : 'UNAVAILABLE'}\n${[...part.effectLines, ...part.traitLines.map((trait) => `${trait} trait`)].join(' • ') || 'No stat change'}${consequence}\n${action}`;
          const enabled = part.state !== 'incompatible';
          const iconColumn = 68 + part.traitIcons.length * 38;
          const partRowHeight = Math.max(hitTarget, 76);
          const row = this.button(root, margin, y, label, partRowHeight, () => this.environment.onSnapshot(part.state === 'fitted-here'
            ? this.commands.unequipGunPart(part.instanceId)
            : this.commands.fitGunPart(part.instanceId), 'gunsmith-body'), 'ui:confirm', width - margin - this.layout.rightMargin,
          undefined, part.displacedInstanceId === undefined ? 0 : 12, iconColumn, part.displacedInstanceId !== undefined, 'center');
          this.environment.controls.rememberFocus(row, `gunsmith-part:${part.instanceId}`);
          const rowOwnerIndex = this.environment.controls.buttonIndex(row);
          if (!enabled) this.environment.controls.disableButton(row);
          this.environment.controls.addCatalogIcon(root, margin + 30, y + row.height / 2, part.iconArtId, 52, rowOwnerIndex);
          part.traitIcons.forEach((trait, index) => {
            this.environment.controls.addCatalogIcon(root, width - this.layout.rightMargin - 24 - index * 38, y + row.height / 2, trait.iconArtId, 32, rowOwnerIndex);
          });
          y += row.height + 8;
        });
      });
      if (snapshot.gunsmith.workshop.length > 0) {
        const workshop = this.own(root, createUiText(this.environment.scene, margin, y, 'WORKSHOP', {
          color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.environment.controls.registerScrollObject(workshop);
        y += workshop.height + 4;
        snapshot.gunsmith.workshop.forEach((recipe) => {
          const row = this.button(root, margin, y, recipe.label, Math.max(hitTarget, 62),
            () => this.environment.onSnapshot(recipe.kind === 'merge'
              ? this.commands.beginGunMerge(recipe.groupId)
              : this.commands.requestGunWorkshop({ kind: 'infuse', targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId })), 'ui:confirm', width - margin - this.layout.rightMargin, 'ui-chrome:merge');
          this.environment.controls.rememberFocus(row, recipe.kind === 'merge'
            ? `gunsmith-workshop:merge:${recipe.groupId}`
            : `gunsmith-workshop:infuse:${recipe.targetInstanceId}:${recipe.traitInstanceId}`);
          y += row.height + 8;
        });
      }
      if (snapshot.gunsmith.mergeSelection && !snapshot.gunsmith.confirmation) {
        const selection = snapshot.gunsmith.mergeSelection;
        const selectionHeading = this.own(root, createUiText(this.environment.scene, margin, y, selection.title.toUpperCase(), {
          color: '#f7d774', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
        }));
        this.environment.controls.registerScrollObject(selectionHeading);
        y += selectionHeading.height + 4;
        selection.choices.forEach((choice) => {
          const row = this.button(root, margin, y, `${choice.recommended ? 'RECOMMENDED • ' : ''}${choice.label}`, hitTarget,
            () => this.environment.onSnapshot(this.commands.selectGunMergeInput(choice.instanceId)), 'ui:confirm', width - margin - this.layout.rightMargin);
          this.environment.controls.rememberFocus(row, `gunsmith-merge-input:${choice.instanceId}`);
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
        const panel = this.own(root, createUiText(this.environment.scene, margin, y, detail, {
          color: '#f7d774', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin - this.layout.rightMargin },
        }));
        this.environment.controls.registerScrollObject(panel);
        y += panel.height + 6;
        const actionWidth = Math.max(120, (width - margin - this.layout.rightMargin - 8) / 2);
        const confirm = this.button(root, margin, y, confirmation.confirmLabel, hitTarget,
          () => this.environment.onSnapshot(this.commands.confirmGunWorkshop()), 'ui:confirm', actionWidth);
        this.environment.controls.rememberFocus(confirm, 'gunsmith-confirm');
        this.environment.controls.focusAfterRender(confirm);
        const cancel = this.button(root, margin + actionWidth + 8, y, 'Cancel', hitTarget,
          () => this.environment.onSnapshot(this.commands.cancelGunWorkshop()), 'ui:back', actionWidth);
        this.environment.controls.rememberFocus(cancel, 'gunsmith-cancel');
        y += Math.max(confirm.height, cancel.height) + 12;
      }
      const catalogHeading = this.own(root, createUiText(this.environment.scene, margin, y, 'PART CATALOG', {
        color: '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`,
      }));
      this.environment.controls.registerScrollObject(catalogHeading);
      y += catalogHeading.height + 4;
      snapshot.gunsmith.catalog.forEach((part) => {
        const iconColumn = 68 + part.traitIcons.length * 38;
        const detail = [part.lockReason, part.sourceLabel].filter((line) => line !== undefined).join(' ');
        const label = `${part.name} • ${part.rarity.toUpperCase()}\n${part.stateLabel}\n${part.effectLines.join(' • ') || 'Trait engineering'}\n${part.comparisonSummary}\n${detail}${part.fabricationActionLabel === undefined ? '' : `\n${part.fabricationActionLabel}`}`;
        const catalogRowHeight = Math.max(hitTarget, 92);
        const row = this.button(root, margin, y, label, catalogRowHeight,
          () => this.environment.onSnapshot(this.commands.fabricateGunPart(part.partId)), 'ui:confirm', width - margin - this.layout.rightMargin, undefined, 0, iconColumn);
        this.environment.controls.rememberFocus(row, `gunsmith-catalog:${part.partId}`);
        const rowOwnerIndex = this.environment.controls.buttonIndex(row);
        if (!part.canFabricate) this.environment.controls.disableButton(row);
        this.environment.controls.addCatalogIcon(root, margin + 30, y + catalogRowHeight / 2, part.iconArtId, 52, rowOwnerIndex);
        part.traitIcons.forEach((trait, index) => {
          this.environment.controls.addCatalogIcon(root, width - this.layout.rightMargin - 24 - index * 38, y + catalogRowHeight / 2, trait.iconArtId, 32, rowOwnerIndex);
        });
        y += row.height + 8;
      });
    }
    this.environment.controls.endScrollableRegion();
    this.environment.resources.gunsmith(collectGunsmithArtIds(snapshot));
    const compactLandscape = this.layout.height < 500 && width >= 700;
    const backY = compactLandscape ? edgeMargin(this.layout.viewport, 'top') + 8
      : this.layout.height - edgeMargin(this.layout.viewport, 'bottom') - hitTarget;
    const back = this.button(fixedRoot, margin, backY, 'Back', hitTarget,
      () => this.environment.onSnapshot(this.commands.back()), 'ui:back', 120, 'action-icon:back');
    this.environment.controls.rememberFocus(back, 'gunsmith-back');
    } finally {
      this.drawingBody = false;
      this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !before.has(object));
    }
  }
}
