import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { edgeMargin } from '../layout';
import { createUiText } from '../text';
import { ThemeFont } from '../theme';
import { MenuPanelSurface, type MenuSurfaceLayout, type GunsmithSurfaceCommands, type MenuSurfaceEnvironment } from './surface';
import { collectGunsmithArtIds, renderAssembledWeapon } from './weaponPresentation';

export class GunsmithSurface extends MenuPanelSurface {
  readonly panel = 'gunsmith' as const;
  constructor(environment: MenuSurfaceEnvironment, private readonly commands: GunsmithSurfaceCommands) { super(environment); }

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, _scrap: number): void {
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
      const familyCard = this.button(root, margin, y, label, 100, () => this.environment.onSnapshot(family.existingBuildId
        ? this.commands.selectGunBuild(family.existingBuildId)
        : this.commands.createGunBuild(family.id)), 'ui:confirm', width - margin - this.layout.rightMargin, undefined, 8, 176, true);
      const rowOwnerIndex = this.environment.controls.buttonIndex(familyCard);
      this.environment.controls.addCatalogIcon(root, margin + 78, y + 50, family.previewBaseArtId ?? family.iconArtId, 146, rowOwnerIndex);
      const statusCopy = this.own(root, createUiText(this.environment.scene, margin + 176, y + 50, status, {
        color: family.selected ? '#86efac' : '#a5f3fc', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, fontStyle: '700',
      }));
      statusCopy.setScrollFactor(0);
      this.environment.controls.registerScrollObject(statusCopy, rowOwnerIndex);
      y += familyCard.height + 10;
    });
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
            : this.commands.fitGunPart(part.instanceId)), 'ui:confirm', width - margin - this.layout.rightMargin,
          undefined, part.displacedInstanceId === undefined ? 0 : 12, iconColumn, part.displacedInstanceId !== undefined, 'center');
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
        this.environment.controls.focusAfterRender(confirm);
        const cancel = this.button(root, margin + actionWidth + 8, y, 'Cancel', hitTarget,
          () => this.environment.onSnapshot(this.commands.cancelGunWorkshop()), 'ui:back', actionWidth);
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
    const compactLandscape = layout.height < 500 && width >= 700;
    const backY = compactLandscape ? edgeMargin(layout.viewport, 'top') + 8
      : layout.height - edgeMargin(layout.viewport, 'bottom') - hitTarget;
    this.button(root, margin, backY, 'Back', hitTarget,
      () => this.environment.onSnapshot(this.commands.back()), 'ui:back', 120, 'action-icon:back');
  }
}
