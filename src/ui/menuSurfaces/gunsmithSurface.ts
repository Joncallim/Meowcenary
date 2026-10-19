import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import type { PartSlot } from '../../gameplay/gunsmith';
import type { GunsmithAssembledPreview, GunsmithPartView, GunsmithWorkshopBuildImpact } from '../gunsmithController';
import { edgeMargin } from '../layout';
import { createUiText } from '../text';
import { ThemeFont } from '../theme';
import { MenuPanelSurface, type MenuSurfaceLayout, type GunsmithSurfaceCommands, type MenuSurfaceEnvironment, type MenuSurfaceControls } from './surface';
import { assemblyArtIds, assemblyMediaHeight, collectGunsmithArtIds, renderAssembledWeapon } from './weaponPresentation';
import { presentLoadoutRunTruthComparison, type LoadoutRunTruthComparison } from '../loadoutPresentation';
import type { EquipmentLoadoutPresentation } from '../equipmentPresentation';
import { gunsmithTierLabel } from '../gunsmithPresentation';

type RunTruth = EquipmentLoadoutPresentation['runTruth'];
type ArtPart = Pick<GunsmithPartView, 'instanceId' | 'name' | 'tier' | 'rarity' | 'iconArtId' | 'traitIcons' | 'statChips' | 'stateLabel' | 'effectScope'>;

export class GunsmithSurface extends MenuPanelSurface {
  readonly panel = 'gunsmith' as const;
  private prefixInvariant?: string;
  private bodyTop = 0;
  private bodyGeneration = 0;
  private drawingBody = false;
  private tailObjects: Phaser.GameObjects.GameObject[] = [];
  private familyStatuses: Array<{ readonly id: string; readonly text: Phaser.GameObjects.Text }> = [];
  private selectedCatalogPartId?: string;
  private catalogSlot?: string;
  private fabricationConfirmation?: { readonly partId: string; readonly cost: number };
  private inspectedInstanceId?: string;
  private workshopKind: 'merge' | 'infuse' = 'merge';

  get bodyObjects(): readonly Phaser.GameObjects.GameObject[] { return this.tailObjects; }
  /** Scene routes logical Back here before the controller's parent transition. */
  handleBack(snapshot: MainMenuSnapshot): boolean {
    if (this.inspectedInstanceId) {
      const id = this.inspectedInstanceId; this.inspectedInstanceId = undefined;
      this.redraw(snapshot, `gunsmith-inspect:${id}`); return true;
    }
    if (this.fabricationConfirmation) {
      const id = this.fabricationConfirmation.partId; this.fabricationConfirmation = undefined;
      this.redraw(snapshot, `gunsmith-fabricate-request:${id}`); return true;
    }
    if (snapshot.gunsmith.surface === 'parts' && this.selectedCatalogPartId) {
      const id = this.selectedCatalogPartId; this.selectedCatalogPartId = undefined;
      this.redraw(snapshot, `gunsmith-catalog:${id}`); return true;
    }
    return false;
  }
  canUpdateBody(snapshot: MainMenuSnapshot, scrap: number): boolean {
    return !!this.root && this.layout.width === this.environment.scene.scale.width
      && this.layout.height === this.environment.scene.scale.height && snapshot.panel === this.panel
      && this.tailObjects.length > 0 && this.familyStatuses.length === snapshot.gunsmith.families.length
      && this.familyStatuses.every((status, index) => status.id === snapshot.gunsmith.families[index]?.id)
      && this.prefixInvariant === this.prefixFacts(snapshot, scrap);
  }
  updateBody(scrollRoot: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, scrap: number): void {
    if (!this.canUpdateBody(snapshot, scrap)) throw new Error('Gunsmith prefix changed during local update');
    this.bodyGeneration += 1;
    const old = this.tailObjects;
    this.tailObjects = [];
    for (const object of old) object.destroy();
    snapshot.gunsmith.families.forEach((family, index) => {
      const copy = this.familyStatuses[index]!.text;
      const status = family.selected ? 'ACTIVE' : family.existingBuildId ? 'SELECT' : 'CREATE';
      if (copy.text !== status) copy.setText(status);
      copy.setStyle({ color: family.selected ? '#24cec7' : '#adc1c7' });
    });
    this.drawBody(scrollRoot, this.root!, snapshot, scrap);
  }
  override unmount(): void {
    this.bodyGeneration += 1;
    this.prefixInvariant = undefined;
    this.familyStatuses = [];
    this.tailObjects = [];
    super.unmount();
  }
  override dispose(): void { this.unmount(); super.dispose(); }
  protected override button(...args: Parameters<MenuSurfaceControls['addButton']>): Phaser.GameObjects.Text {
    const action = args[5];
    if (this.drawingBody && action) {
      const generation = this.bodyGeneration;
      args[5] = () => { if (generation === this.bodyGeneration) action(); };
    }
    return super.button(...args);
  }
  private prefixFacts(snapshot: MainMenuSnapshot, scrap: number): string {
    return JSON.stringify([snapshot.notice, scrap, snapshot.stage.stages.find(stage => stage.selected)?.menuBackdropArtId,
      snapshot.gunsmith.families.map(family => [family.id, family.name, family.iconArtId, family.previewBaseArtId, family.existingBuildId])]);
  }
  constructor(environment: MenuSurfaceEnvironment, private readonly commands: GunsmithSurfaceCommands) { super(environment); }
  private get laneWidth(): number { return this.layout.width - this.layout.margin - this.layout.rightMargin; }
  private get wide(): boolean { return this.layout.width >= 1000 && this.laneWidth >= 700; }
  private get compactPhone(): boolean { return this.layout.width < 380; }
  private get mediaSize(): number { return this.wide ? 240 : this.compactPhone ? 104 : 144; }
  private copy(root: Phaser.GameObjects.Container, x: number, y: number, value: string,
    width = this.laneWidth, color = '#adc1c7', size: number = ThemeFont.bodyMin,
    registerScroll = true): Phaser.GameObjects.Text {
    const text = this.own(root, createUiText(this.environment.scene, x, y, value, {
      color, fontFamily: ThemeFont.family, fontSize: `${size}px`, wordWrap: { width },
    })).setScrollFactor(0);
    if (registerScroll) this.environment.controls.registerScrollObject(text);
    return text;
  }
  private backdrop(root: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number): void {
    const panel = this.environment.visuals?.addPanel(this.environment.scene, x + width / 2, y + height / 2, width, height, 'figma-card', { alpha: 0.96 });
    if (panel) { this.own(root, panel); root.sendToBack(panel); this.environment.controls.registerScrollObject(panel); }
  }
  private action(root: Phaser.GameObjects.Container, x: number, y: number, label: string, key: string,
    callback: () => void, width = this.laneWidth, enabled = true): Phaser.GameObjects.Text {
    // Keep a small clearance band around every Gunsmith action's native Text
    // bounds. Short replacement labels otherwise round to a 3px inset at the
    // phone hit target, which lets the focus stroke sit against the card edge.
    const button = this.button(root, x, y, label, this.layout.hitTarget + 4, callback, 'ui:confirm', width);
    this.environment.controls.rememberFocus(button, key);
    if (!enabled) this.environment.controls.disableButton(button);
    return button;
  }
  private redraw(snapshot: MainMenuSnapshot, key?: string): void {
    if (key) this.environment.controls.focusNext(key);
    this.environment.onSnapshot(snapshot, 'gunsmith-body');
  }
  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    this.bodyGeneration += 1;
    this.familyStatuses = [];
    this.tailObjects = [];
    const heading = this.own(root, createUiText(this.environment.scene, layout.margin,
      edgeMargin(layout.viewport, 'top') + 4, 'Gunsmith', {
        color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${layout.width >= 1000 ? 30 : 22}px`, fontStyle: '700',
      })).setScrollFactor(0);
    let y = Math.max(layout.top, heading.y + heading.height + 12);
    this.environment.controls.beginScrollableRegion(y, layout.scrollBottom);
    y += this.copy(root, layout.margin, y, 'ACTIVE BUILD / ENGINEERED FAMILY', this.laneWidth, '#24cec7').height + 8;
    const columns = Math.min(3, snapshot.gunsmith.families.length);
    const cardWidth = (this.laneWidth - (columns - 1) * 8) / columns;
    let rowHeight = 0;
    snapshot.gunsmith.families.forEach((family, index) => {
      if (index > 0 && index % columns === 0) { y += rowHeight + 8; rowHeight = 0; }
      const x = layout.margin + (index % columns) * (cardWidth + 8);
      const card = this.button(root, x, y, family.name, 74, () => {
        this.inspectedInstanceId = undefined;
        this.redraw(family.existingBuildId ? this.commands.selectGunBuild(family.existingBuildId) : this.commands.createGunBuild(family.id));
      }, 'ui:confirm', cardWidth, undefined, 0, 0, true);
      this.environment.controls.rememberFocus(card, `gunsmith-family:${family.id}`);
      const status = this.copy(root, x + 12, y + card.height - 26,
        family.selected ? 'ACTIVE' : family.existingBuildId ? 'SELECT' : 'CREATE', cardWidth - 24,
        family.selected ? '#24cec7' : '#adc1c7', 13);
      this.familyStatuses.push({ id: family.id, text: status });
      rowHeight = Math.max(rowHeight, card.height);
    });
    this.bodyTop = y + rowHeight + 12;
    this.prefixInvariant = this.prefixFacts(snapshot, scrap);
    this.drawBody(root, root, snapshot, scrap);
  }
  private drawBody(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot, scrap: number): void {
    const before = new Set([...root.list, ...fixedRoot.list]);
    this.drawingBody = true;
    try {
      let y = this.bodyTop;
      const tabWidth = (this.laneWidth - 16) / 3;
      let tabsHeight = 0;
      (['build', 'workshop', 'parts'] as const).forEach((surface, index) => {
        const button = this.action(root, this.layout.margin + index * (tabWidth + 8), y,
          `${snapshot.gunsmith.surface === surface ? '• ' : ''}${surface[0]!.toUpperCase()}${surface.slice(1)}`,
          `gunsmith-surface:${surface}`, () => {
            this.inspectedInstanceId = undefined;
            this.fabricationConfirmation = undefined;
            this.redraw(this.commands.openGunsmithSurface(surface), `gunsmith-surface:${surface}`);
          }, tabWidth);
        tabsHeight = Math.max(tabsHeight, button.height);
      });
      y += tabsHeight + 12;
      switch (snapshot.gunsmith.surface) {
        case 'build': this.drawBuild(root, snapshot, y); break;
        case 'workshop': this.drawWorkshop(root, snapshot, y, scrap); break;
        case 'parts': this.drawParts(root, snapshot, y, scrap); break;
      }
      this.environment.controls.endScrollableRegion();
      this.environment.resources.panel('gunsmith', []);
      this.environment.resources.gunsmith(collectGunsmithArtIds(snapshot));
      const compactLandscape = this.layout.height < 500 && this.layout.width >= 700;
      const backY = compactLandscape
        ? edgeMargin(this.layout.viewport, 'top') + 8 : this.layout.height - edgeMargin(this.layout.viewport, 'bottom') - this.layout.hitTarget;
      const backX = compactLandscape ? this.layout.width - this.layout.rightMargin - 120 : this.layout.margin;
      const back = this.button(fixedRoot, backX, backY, 'Back', this.layout.hitTarget, () => {
        if (!this.handleBack(snapshot)) this.environment.onSnapshot(this.commands.back());
      }, 'ui:back', 120, 'action-icon:back');
      this.environment.controls.rememberFocus(back, 'gunsmith-back');
    } finally {
      this.drawingBody = false;
      this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !before.has(object));
    }
  }
  private assembly(root: Phaser.GameObjects.Container, y: number, title: string, preview: GunsmithAssembledPreview,
    framing: readonly string[], caption: string, decisionDetails = '',
    sidePanel?: (root: Phaser.GameObjects.Container, left: number, top: number, width: number) => number): number {
    const wideComposition = this.wide;
    const mediaWidth = wideComposition
      ? Math.min(480, Math.max(360, Math.floor(this.laneWidth * 0.44)))
      : Math.min(700, this.laneWidth - 32);
    const artHeight = assemblyMediaHeight(framing, mediaWidth);
    const traits = [...preview.traitCores.map(core => ({ iconArtId: core.iconArtId, trait: `Trait Core • ${gunsmithTierLabel(core.rarity, core.tier)}` })), ...preview.traitEmblems];
    if (!wideComposition) {
      const header = this.copy(root, this.layout.margin + 16, y + 16, title, this.laneWidth - 32);
      const captionY = y + 16 + header.height + 12 + artHeight + 12;
      const summary = this.copy(root, this.layout.margin + 16, captionY, caption, this.laneWidth - 32, '#f7f1d5', 13);
      const height = captionY - y + summary.height + 16;
      this.backdrop(root, this.layout.margin, y, this.laneWidth, height);
      renderAssembledWeapon(this.environment.controls, root, preview, this.layout.centerX,
        y + 16 + header.height + 12 + artHeight / 2, mediaWidth, artHeight, framing);
      let traitsY = y + height;
      let traitRowHeight = 0;
      traits.forEach((trait, index) => {
        const column = index % 2;
        if (column === 0 && index > 0) { traitsY += traitRowHeight; traitRowHeight = 0; }
        this.environment.controls.addCatalogIcon(root, this.layout.margin + 18 + column * (this.laneWidth / 2), traitsY + 18, trait.iconArtId, 32);
        const label = this.copy(root, this.layout.margin + 42 + column * (this.laneWidth / 2), traitsY + 8, trait.trait, this.laneWidth / 2 - 48, '#24cec7', 13);
        traitRowHeight = Math.max(traitRowHeight, 40, label.height + 16);
      });
      return traitsY + traitRowHeight + 12;
    }

    // On foldable/desktop widths, keep the weapon recognizable while placing
    // its family summary and traits beside it. This brings the engineering
    // decision back into the first view without increasing card height.
    const textLeft = this.layout.margin + mediaWidth + 32;
    const textWidth = this.laneWidth - mediaWidth - 48;
    const header = this.copy(root, textLeft, y + 16, title, textWidth);
    let textY = y + 16 + header.height + 12;
    const wideCaption = decisionDetails ? `${caption}\n${decisionDetails}` : caption;
    const summary = this.copy(root, textLeft, textY, wideCaption, textWidth, '#f7f1d5', 13);
    textY += summary.height + 16;
    if (sidePanel) textY = Math.max(textY, sidePanel(root, textLeft, textY, textWidth) + 8);
    const traitsPerRow = textWidth >= 300 ? 2 : 1;
    let traitRowHeight = 0;
    traits.forEach((trait, index) => {
      const column = index % traitsPerRow;
      if (column === 0 && index > 0) { textY += traitRowHeight; traitRowHeight = 0; }
      const x = textLeft + column * (textWidth / traitsPerRow);
      this.environment.controls.addCatalogIcon(root, x + 16, textY + 18, trait.iconArtId, 32);
      const label = this.copy(root, x + 40, textY + 8, trait.trait, textWidth / traitsPerRow - 48, '#24cec7', 13);
      traitRowHeight = Math.max(traitRowHeight, 42, label.height + 16);
    });
    const height = Math.max(artHeight + 32, textY - y + traitRowHeight + 8);
    this.backdrop(root, this.layout.margin, y, this.laneWidth, height);
    renderAssembledWeapon(this.environment.controls, root, preview, this.layout.margin + 16 + mediaWidth / 2,
      y + 16 + artHeight / 2, mediaWidth, artHeight, framing);
    return y + height + 12;
  }
  private buildSlotPanel(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot,
    left: number, top: number, width: number): number {
    const state = snapshot.gunsmith;
    let y = top;
    y += this.copy(root, left, y, 'ENGINEERING SLOTS', width, '#24cec7').height + 6;
    const columns = width >= 560 ? 3 : 2;
    const gap = 8;
    const slotWidth = (width - gap * (columns - 1)) / columns;
    let rowHeight = 0;
    state.slots.forEach((slot, index) => {
      if (index > 0 && index % columns === 0) { y += rowHeight + gap; rowHeight = 0; }
      const x = left + index % columns * (slotWidth + gap);
      const fitted = slot.slot === 'trait' ? slot.traitFitted ?? [] : slot.fitted ? [slot.fitted] : [];
      const status = slot.unavailableFitted ? 'UNAVAILABLE' : slot.slot === 'trait'
        ? `${fitted.length}/2 EQUIPPED` : fitted.length ? 'EQUIPPED' : 'EMPTY';
      const fittedCopy = fitted.length ? `\n${fitted.map(part => `${part.name} ${gunsmithTierLabel(part.rarity, part.tier)}`).join(' • ')}` : '';
      const label = `${state.selectedSlot === slot.slot ? '• ' : ''}${slot.label}\n${status}${fittedCopy}`;
      const button = this.button(root, x, y, label, 64, () => {
        this.inspectedInstanceId = undefined;
        this.redraw(this.commands.selectGunsmithSlot(slot.slot as PartSlot), `gunsmith-slot:${slot.slot}`);
      }, 'ui:confirm', slotWidth, undefined, 34, 32, true, 'left', 'card');
      this.environment.controls.rememberFocus(button, `gunsmith-slot:${slot.slot}`);
      this.environment.controls.addCatalogIcon(root, x + 18, y + 32, slot.iconArtId, 26, this.environment.controls.buttonIndex(button));
      rowHeight = Math.max(rowHeight, button.height);
    });
    return y + rowHeight;
  }
  private drawBuild(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number): void {
    const state = snapshot.gunsmith;
    let y = start;
    const selected = state.selectedBuild;
    const current = selected?.preview ?? state.unconfiguredBuild?.preview;
    y += this.copy(root, this.layout.margin, y, selected
      ? `${selected.title.toUpperCase()} • ACTIVE\n${selected.activation} • changes ${state.families.find(family => family.id === selected.familyId)?.name ?? selected.familyId}`
      : `${state.unconfiguredBuild?.title ?? 'Stock weapon'} • NO ENGINEERED BUILD\nChoose a family to create its active build.`, this.laneWidth, '#24cec7').height + 12;
    const framing = [...new Set([...(current ? assemblyArtIds(current) : []), ...(state.candidatePreview ? assemblyArtIds(state.candidatePreview) : [])])];
    const fittedDetails = selected
      ? state.slots.flatMap(slot => slot.slot === 'trait'
        ? (slot.traitFitted ?? []).map(part => `${part.name} ${gunsmithTierLabel(part.rarity, part.tier)} • ${part.effectLines.slice(0, 2).join(' • ')}`)
        : slot.fitted ? [`${slot.fitted.name} ${gunsmithTierLabel(slot.fitted.rarity, slot.fitted.tier)} • ${slot.fitted.effectLines.slice(0, 2).join(' • ')}`] : [])
        .join('\n')
      : '';
    if (current && selected && this.compactPhone && !state.candidatePreview && !this.inspectedInstanceId) {
      y = this.drawMobileSlotGrid(root, state, y);
    }
    if (current) y = this.assembly(root, y, 'Your assembled weapon', current, framing,
      selected?.summary ?? 'Stock weapon • no persistent engineering fitted',
      fittedDetails && !this.wide ? `FITTED PARTS\n${fittedDetails}` : '',
      selected && this.wide ? (panelRoot, panelLeft, panelTop, panelWidth) => this.buildSlotPanel(panelRoot, snapshot, panelLeft, panelTop, panelWidth) : undefined);
    if (!selected) return;
    const inspected = state.parts.find(part => part.instanceId === this.inspectedInstanceId);
    if (inspected) { this.drawInspection(root, snapshot, inspected, y); return; }
    if (state.candidatePreview && state.selectedCandidateInstanceId) {
      const candidate = state.parts.find(part => part.instanceId === state.selectedCandidateInstanceId);
      y = this.assembly(root, y, 'Preview • after this change', state.candidatePreview, framing, candidate?.actionLabel ?? 'Candidate build');
      if (candidate) {
        y += this.copy(root, this.layout.margin, y, `${candidate.name} ${gunsmithTierLabel(candidate.rarity, candidate.tier)} • ${candidate.stateLabel}
${candidate.effectScope}
${candidate.effectLines.join(' • ')}
${candidate.sourceLabel}`, this.laneWidth, '#f7f1d5').height + 12;
      }
      if (state.candidateComparison) y = this.comparison(root, snapshot, y, state.candidateComparison.before, state.candidateComparison.after, state.candidateComparison.stats, state.candidateComparison.effects, undefined, snapshot.gunsmith.selectedBuild?.familyId);
      if (candidate) {
        const reviewCopies: Phaser.GameObjects.Text[] = [];
        const addReviewCopy = (value: string): void => {
          const text = this.copy(root, this.layout.margin, y, value, this.laneWidth, '#f7d774', ThemeFont.bodyMin, false);
          reviewCopies.push(text);
          y += text.height + 8;
        };
        if (state.candidateComparison?.decisionSummary) {
          addReviewCopy(state.candidateComparison.decisionSummary.join('\n'));
        } else {
          if (candidate.displacementSummary) addReviewCopy(candidate.displacementSummary);
          if (candidate.assignedBuildName && candidate.state === 'fitted-elsewhere') addReviewCopy(`Moves from ${candidate.assignedBuildName}. Its source slot becomes empty.`);
        }
        const commit = this.action(root, this.layout.margin, y, candidate.actionLabel, 'gunsmith-commit', () => this.redraw(this.commands.commitGunPartPreview(), `gunsmith-inspect:${candidate.instanceId}`));
        y += commit.height + 8;
        const cancel = this.action(root, this.layout.margin, y, 'Cancel preview', 'gunsmith-preview-cancel', () => this.redraw(this.commands.cancelGunPartPreview(), `gunsmith-part:${candidate.instanceId}`));
        y += cancel.height + 12;
        const commitIndex = this.environment.controls.buttonIndex(commit);
        const cancelIndex = this.environment.controls.buttonIndex(cancel);
        const reviewBounds = [
          ...reviewCopies.map(copy => copy.getBounds()),
          commit.getBounds(), cancel.getBounds(),
        ].reduce((bounds, next) => ({ top: Math.min(bounds.top, next.top), bottom: Math.max(bounds.bottom, next.bottom) }),
          { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });
        reviewCopies.forEach(copy => this.environment.controls.registerScrollObject(copy, commitIndex));
        this.environment.controls.includeScrollBounds?.(commitIndex, reviewBounds);
        this.environment.controls.includeScrollBounds?.(cancelIndex, reviewBounds);
      }
    }
    if ((!this.compactPhone && !this.wide) || state.candidatePreview) y = this.drawMobileSlotGrid(root, state, y);
    const slot = state.slots.find(slot => slot.slot === state.selectedSlot);
    if (!slot) return;
    if (slot.unavailableFitted) {
      const missing = slot.unavailableFitted;
      const row = this.action(root, this.layout.margin, y, `${missing.label}\nRemove unavailable part`, `gunsmith-unavailable:${missing.instanceId}`,
        () => this.redraw(this.commands.removeUnavailableGunPart(missing.instanceId)));
      y += row.height + 8;
    }
    const fitted = slot.slot === 'trait' ? slot.traitFitted ?? [] : slot.fitted ? [slot.fitted] : [];
    for (const part of fitted) {
      y = this.partCard(root, y, part, `${slot.label} • EQUIPPED${state.selectedTraitInstanceId === part.instanceId ? ' • REPLACEMENT TARGET' : ''}`,
        `gunsmith-inspect:${part.instanceId}`, () => { this.inspectedInstanceId = part.instanceId; this.redraw(snapshot, `gunsmith-inspection-back:${part.instanceId}`); });
      if (slot.slot === 'trait') {
        const socket = this.action(root, this.layout.margin, y, `Replace this Trait Core • ${part.name}`, `gunsmith-trait-socket:${part.instanceId}`,
          () => this.redraw(this.commands.selectGunsmithTraitSocket(part.instanceId)));
        y += socket.height + 8;
      }
      const unequip = this.action(root, this.layout.margin, y, `Unequip ${part.name}`, `gunsmith-unequip:${part.instanceId}`,
        () => this.redraw(this.commands.unequipGunPart(part.instanceId), `gunsmith-part:${part.instanceId}`));
      y += unequip.height + 8;
    }
    y += this.copy(root, this.layout.margin, y, `${slot.label.toUpperCase()} • COMPATIBLE PARTS`, this.laneWidth, '#24cec7').height + 8;
    const candidates = slot.candidates.filter(part => part.compatible && part.state !== 'incompatible' && part.state !== 'fitted-here');
    if (!candidates.length) this.copy(root, this.layout.margin, y, slot.slot === 'trait' && fitted.length >= 2 && !state.selectedTraitInstanceId
      ? 'Select a Trait Core to replace, or unequip one.' : 'No stored compatible parts. Browse Parts to find a blueprint.');
    for (const part of candidates) y = this.partCard(root, y, part,
      part.state === 'fitted-elsewhere' ? `EQUIPPED • ${part.assignedBuildName}` : 'STORED', `gunsmith-part:${part.instanceId}`,
      () => this.redraw(this.commands.previewGunPart(part.instanceId), 'gunsmith-commit'), this.mediaSize, 'Preview change');
  }
  private drawMobileSlotGrid(root: Phaser.GameObjects.Container, state: MainMenuSnapshot['gunsmith'], start: number): number {
    let y = start + this.copy(root, this.layout.margin, start, 'ENGINEERING SLOTS', this.laneWidth, '#24cec7').height + 8;
    const columns = 2;
    const slotWidth = (this.laneWidth - (columns - 1) * 8) / columns;
    let rowHeight = 0;
    state.slots.forEach((slot, index) => {
      if (index > 0 && index % columns === 0) { y += rowHeight + 8; rowHeight = 0; }
      const x = this.layout.margin + index % columns * (slotWidth + 8);
      const fittedCount = slot.slot === 'trait' ? slot.traitFitted?.length ?? 0 : slot.fitted ? 1 : 0;
      const label = `${state.selectedSlot === slot.slot ? '• ' : ''}${slot.label}\n${slot.unavailableFitted ? 'UNAVAILABLE' : slot.slot === 'trait' ? `${fittedCount}/2 EQUIPPED` : fittedCount ? 'EQUIPPED' : 'EMPTY'}`;
      const button = this.button(root, x, y, label, 76, () => {
        this.inspectedInstanceId = undefined;
        this.redraw(this.commands.selectGunsmithSlot(slot.slot as PartSlot), `gunsmith-slot:${slot.slot}`);
      }, 'ui:confirm', slotWidth, undefined, 0, 42, true);
      this.environment.controls.rememberFocus(button, `gunsmith-slot:${slot.slot}`);
      this.environment.controls.addCatalogIcon(root, x + 22, y + 30, slot.iconArtId, 32, this.environment.controls.buttonIndex(button));
      rowHeight = Math.max(rowHeight, button.height);
    });
    return y + rowHeight + 12;
  }
  private partCard(root: Phaser.GameObjects.Container, y: number, part: ArtPart, status: string,
    key: string, callback: () => void, size = this.mediaSize, actionLabel = 'Inspect this part'): number {
    const stacked = !this.wide;
    const height = stacked ? size + 128 : Math.max(size + 32, 160);
    const label = `${part.name} ${gunsmithTierLabel(part.rarity, part.tier)}\n${status}\n${part.effectScope} • ${part.statChips.slice(0, 2).join(' • ') || 'Trait engineering'}\n${actionLabel}`;
    const row = this.button(root, this.layout.margin, y, label, height, callback, 'ui:confirm', this.laneWidth,
      undefined, part.traitIcons.length * 38, stacked ? 12 : size + 32, true, 'left', 'card', stacked ? size + 24 : 12);
    this.environment.controls.rememberFocus(row, key);
    const owner = this.environment.controls.buttonIndex(row);
    this.environment.controls.addLoadoutArt(root, stacked ? this.layout.centerX : this.layout.margin + size / 2 + 16,
      y + size / 2 + 16, part.iconArtId, size, size, owner);
    part.traitIcons.forEach((trait, index) => this.environment.controls.addCatalogIcon(root,
      this.layout.margin + this.laneWidth - 24 - index * 38, y + size + 16, trait.iconArtId, 32, owner));
    return y + row.height + 12;
  }
  private drawInspection(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, part: GunsmithPartView, start: number): void {
    let y = start;
    const size = this.wide ? 400 : Math.min(264, this.laneWidth - 32);
    y += this.copy(root, this.layout.margin, y, `${part.name.toUpperCase()}\n${part.stateLabel} • ${gunsmithTierLabel(part.rarity, part.tier)}`, this.laneWidth, '#24cec7', 20).height + 12;
    this.backdrop(root, this.layout.margin, y, this.laneWidth, size + 32);
    this.environment.controls.addLoadoutArt(root, this.layout.centerX, y + 16 + size / 2, part.iconArtId, size, size);
    y += size + 44;
    y += this.copy(root, this.layout.margin, y, `${part.effectScope} • ${part.slot} slot\n${part.effectLines.join(' • ')}\n${part.traitLines.join(' • ')}\n${part.sourceLabel}`, this.laneWidth, '#f7f1d5').height + 12;
    this.action(root, this.layout.margin, y, 'Back to Gunsmith', `gunsmith-inspection-back:${part.instanceId}`, () => {
      this.inspectedInstanceId = undefined; this.redraw(snapshot, `gunsmith-inspect:${part.instanceId}`);
    });
  }
  private comparison(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number, before: RunTruth, after: RunTruth,
    stats: readonly import('../loadoutPresentation').LoadoutWeaponStatDelta[] = [], effects?: LoadoutRunTruthComparison,
    noChangeReason?: string, familyId?: string, scenario?: string): number {
    let y = start;
    const familyName = familyId === undefined ? undefined : snapshot.gunsmith.families.find((family) => family.id === familyId)?.name;
    const header = familyName === undefined ? 'CURRENT / PREVIEW • RUN EFFECTS'
      : `CURRENT / PREVIEW • ${scenario ?? `If fitted to ${familyName}`} • RUN EFFECTS`;
    y += this.copy(root, this.layout.margin, y, header, this.laneWidth, '#24cec7').height + 8;
    for (const stat of stats) {
      const color = stat.direction === 'better' ? '#86efac' : stat.direction === 'worse' ? '#fca5a5' : '#adc1c7';
      y += this.copy(root, this.layout.margin, y, `${stat.label} • ${stat.displayBefore} to ${stat.displayAfter}`, this.laneWidth, color).height + 6;
    }
    const resolvedEffects = effects ?? presentLoadoutRunTruthComparison(before, after);
    for (const delta of resolvedEffects.modifiers) {
      y += this.copy(root, this.layout.margin, y, `${delta.target.label} • ${delta.label}\n${delta.beforeValue ?? '—'} to ${delta.afterValue ?? '—'}`, this.laneWidth, '#f7f1d5').height + 8;
    }
    for (const delta of resolvedEffects.traits) {
        const name = snapshot.gunsmith.families.find(row => row.id === delta.familyId)?.name ?? delta.familyId;
        const icon = snapshot.gunsmith.parts.flatMap(row => row.traitIcons).find(row => row.trait === delta.trait)
          ?? snapshot.gunsmith.catalog.flatMap(row => row.traitIcons).find(row => row.trait === delta.trait);
        if (icon) this.environment.controls.addCatalogIcon(root, this.layout.margin + 18, y + 18, icon.iconArtId, 32);
        y += this.copy(root, this.layout.margin + 42, y, `${name} • ${delta.trait}\n${delta.before ? 'ACTIVE' : '—'} to ${delta.after ? delta.afterDeduplicated ? 'ACTIVE • SHARED, APPLIED ONCE' : 'ACTIVE' : 'REMOVED'}`, this.laneWidth - 42, '#24cec7').height + 8;
    }
    for (const delta of resolvedEffects.projectileEffects) {
        const formatEffects = (truth: readonly RunTruth['families'][number]['projectileEffects'][number][]) => truth.map(effect => effect.kind === 'burn'
          ? `Burn ${effect.damageMultiplier * 100}% • ${effect.durationMs}ms • every ${effect.tickIntervalMs}ms`
          : `Explosion ${effect.radius} radius • ${effect.damageMultiplier * 100}% splash`).join(' • ') || '—';
        const name = snapshot.gunsmith.families.find(row => row.id === delta.familyId)?.name ?? delta.familyId;
        y += this.copy(root, this.layout.margin, y, `${name} • projectile effects\n${formatEffects(delta.before)} to ${formatEffects(delta.after)}`, this.laneWidth, '#f7f1d5').height + 8;
    }
    const effectiveMechanicsChanged = stats.some(stat => stat.before !== stat.after)
      || resolvedEffects.modifiers.length > 0
      || resolvedEffects.projectileEffects.length > 0
      || resolvedEffects.traits.some((trait) => trait.before !== trait.after);
    if (!effectiveMechanicsChanged && noChangeReason) y += this.copy(root, this.layout.margin, y, noChangeReason).height + 8;
    return y;
  }

  private workshopImpact(root: Phaser.GameObjects.Container, impact: GunsmithWorkshopBuildImpact, start: number): number {
    let y = start;
    y += this.copy(root, this.layout.margin, y,
      `AFFECTED BUILD • ${impact.buildName} • ${impact.familyId.toUpperCase()} • ${impact.slot.toUpperCase()}`,
      this.laneWidth, '#f7d774').height + 6;
    const part = impact.updatedPart ?? impact.removedPart;
    if (part) y += this.copy(root, this.layout.margin, y,
      `${impact.change === 'updated' ? 'UPDATES FITTED' : 'REMOVES'} ${part.name} ${gunsmithTierLabel(part.rarity, part.tier)}`,
      this.laneWidth, '#f7d774').height + 4;
    const losses = impact.comparison.effects.modifiers
      .filter((delta) => delta.after === undefined)
      .map((delta) => `Loses ${delta.target.label} • ${delta.before?.text ?? delta.beforeValue ?? '—'} (removed)`);
    const traits = impact.comparison.effects.traits
      .filter((delta) => delta.before && !delta.after)
      .map((delta) => `Loses ${delta.target.label} • ${delta.trait}`);
    const gains = impact.comparison.effects.modifiers.filter((delta) => delta.after !== undefined)
      .map((delta) => `${delta.before === undefined ? 'Gains' : 'Changes'} ${delta.target.label} • ${delta.before?.text ?? delta.beforeValue ?? '—'} to ${delta.after?.text ?? delta.afterValue ?? '—'}`);
    const gainedTraits = impact.comparison.effects.traits.filter((delta) => !delta.before && delta.after)
      .map((delta) => `Gains ${delta.target.label} • ${delta.trait}`);
    const projectileChanges = impact.comparison.effects.projectileEffects.map((delta) =>
      `${delta.after.length > delta.before.length ? 'Gains' : 'Changes'} ${delta.familyId.toUpperCase()} • projectile effects`);
    const details = [...losses, ...traits, ...gains, ...gainedTraits, ...projectileChanges];
    y += this.copy(root, this.layout.margin, y,
      details.length ? details.join('\n') : 'Fitting changed; no resolved modifier or trait change.',
      this.laneWidth, '#f7f1d5').height + 8;
    return y;
  }

  private actionPair(root: Phaser.GameObjects.Container, y: number, confirmLabel: string, confirmKey: string,
    confirmCallback: () => void, cancelKey: string, cancelCallback: () => void, confirmEnabled = true): number {
    const gap = 8;
    const width = (this.laneWidth - gap) / 2;
    const confirm = this.action(root, this.layout.margin, y, confirmLabel, confirmKey, confirmCallback, width, confirmEnabled);
    const cancel = this.action(root, this.layout.margin + width + gap, y, 'Cancel', cancelKey, cancelCallback, width);
    return y + Math.max(confirm.height, cancel.height) + 12;
  }
  private drawWorkshop(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number, scrap: number): void {
    const state = snapshot.gunsmith;
    let y = start;
    const kind = state.confirmation?.kind ?? (state.mergeSelection ? 'merge' : this.workshopKind);
    const half = (this.laneWidth - 8) / 2;
    let tabHeight = 0;
    (['merge', 'infuse'] as const).forEach((operation, index) => {
      const tab = this.action(root, this.layout.margin + index * (half + 8), y,
        `${kind === operation ? '• ' : ''}${operation === 'merge' ? 'Merge' : 'Infuse'}`, `gunsmith-workshop-kind:${operation}`, () => {
          this.workshopKind = operation; this.redraw(this.commands.resetGunWorkshop());
        }, half);
      tabHeight = Math.max(tabHeight, tab.height);
    });
    y += tabHeight + 12;
    if (state.confirmation) {
      const confirmation = state.confirmation;
      y += this.copy(root, this.layout.margin, y, confirmation.title.toUpperCase(), this.laneWidth, '#f7d774', 20).height + 12;
      const parts = [...confirmation.inputs, confirmation.output];
      const cardWidth = this.wide ? (this.laneWidth - 48) / 3 : this.laneWidth;
      let rowBottom = y;
      parts.forEach((part, index) => {
        if (!this.wide && index > 0) {
          y = rowBottom + 8;
          y += this.copy(root, this.layout.margin, y, index === parts.length - 1 ? 'OUTPUT' : '+ INPUT B', this.laneWidth, '#f7d774').height + 8;
        }
        const x = this.layout.margin + (this.wide ? index * (cardWidth + 24) : 0);
        const size = Math.min(this.mediaSize, cardWidth - 24);
        const label = index === parts.length - 1 ? 'OUTPUT' : index === 0 ? 'INPUT A' : 'INPUT B';
        const top = y;
        const caption = this.copy(root, x + 16, y + 16, label, cardWidth - 32, '#f7d774');
        const artY = y + 16 + caption.height + 8;
        this.environment.controls.addLoadoutArt(root, x + cardWidth / 2, artY + size / 2, part.iconArtId, size, size);
        y = artY + size + 12;
        y += this.copy(root, x + 16, y, `${part.name} ${gunsmithTierLabel(part.rarity, part.tier)}\n${part.stateLabel} • ${part.effectScope}\n${part.statChips.join(' • ') || 'Trait engineering'}`, cardWidth - 32, '#f7f1d5').height + 8;
        for (const trait of part.traitIcons) {
          this.environment.controls.addCatalogIcon(root, x + 30, y + 16, trait.iconArtId, 32);
          y += this.copy(root, x + 54, y + 4, trait.trait, cardWidth - 70, '#24cec7').height + 12;
        }
        this.backdrop(root, x, top, cardWidth, y - top + 16);
        rowBottom = Math.max(rowBottom, y + 28);
        if (this.wide) y = top;
      });
      y = rowBottom;
      const consequences = [...confirmation.sideEffectLines,
        ...confirmation.clearedFittings.map(fitting => `EMPTIES ${fitting.buildName} • ${fitting.slot}.`),
        ...confirmation.preservedFittings.map(fitting => `KEEPS ${fitting.buildName} • ${fitting.slot} fitted.`),
        ...confirmation.consumedInstanceIds.map(id => `CONSUMES ${confirmation.inputs.find(part => part.instanceId === id)?.name ?? id}.`),
        ...confirmation.preservedInstanceIds.map(id => `PRESERVES ${confirmation.inputs.find(part => part.instanceId === id)?.name ?? id}.`)];
      y += this.copy(root, this.layout.margin, y, consequences.join('\n'), this.laneWidth, '#f7d774').height + 12;
      for (const impact of confirmation.buildImpacts ?? []) y = this.workshopImpact(root, impact, y);
      y += this.copy(root, this.layout.margin, y, confirmation.mechanicalDelta.join('\n'), this.laneWidth, '#f7f1d5').height + 8;
      const noChangeReason = confirmation.output.stateLabel === 'STORED'
        ? 'No active-build change • output remains STORED until you fit it.' : undefined;
      y = this.comparison(root, snapshot, y, confirmation.comparison.before, confirmation.comparison.after,
        confirmation.comparison.stats, confirmation.comparison.effects, noChangeReason);
      const affectedBuildSlots = [...new Set((confirmation.buildImpacts ?? []).map((impact) => `${impact.buildName} • ${impact.slot.toUpperCase()}`))];
      y += this.copy(root, this.layout.margin, y,
        `FINAL CHECK\nInputs: ${confirmation.inputs.map((part) => `${part.name} ${gunsmithTierLabel(part.rarity, part.tier)} • ${part.stateLabel}`).join(' + ')}\nOutput: ${confirmation.output.name} ${gunsmithTierLabel(confirmation.output.rarity, confirmation.output.tier)} • ${confirmation.output.stateLabel}\nOutput destination: ${confirmation.output.stateLabel} • ${confirmation.output.effectScope}\nAffected build/slot: ${affectedBuildSlots.join(' + ') || 'None'}\nCost: 0 Scrap • Balance after: ${scrap} Scrap`,
        this.laneWidth, '#f7d774').height + 8;
      this.actionPair(root, y, confirmation.confirmLabel, 'gunsmith-confirm',
        () => this.redraw(this.commands.confirmGunWorkshop()), 'gunsmith-cancel',
        () => this.redraw(this.commands.cancelGunWorkshop()));
      return;
    }
    if (state.mergeSelection) {
      const selection = state.mergeSelection;
      y += this.copy(root, this.layout.margin, y, selection.title, this.laneWidth, '#f7d774').height + 12;
      const first = state.parts.find(part => part.instanceId === selection.firstInstanceId);
      if (first) y = this.partCard(root, y, first, `INPUT A • SELECTED • ${first.stateLabel}${first.assignedBuildName ? ` • ${first.assignedBuildName}` : ''}`, `gunsmith-merge-first:${first.instanceId}`, () => this.redraw(this.commands.back()));
      for (const choice of selection.choices) {
        const part = state.parts.find(part => part.instanceId === choice.instanceId);
        if (part) y = this.partCard(root, y, part, `${selection.step === 'first' ? 'INPUT A' : 'LEGAL INPUT B'}${choice.recommended ? ' • RECOMMENDED' : ''} • ${part.stateLabel}${part.assignedBuildName ? ` • ${part.assignedBuildName}` : ''}`,
          `gunsmith-merge-input:${choice.instanceId}`, () => this.redraw(this.commands.selectGunMergeInput(choice.instanceId), selection.step === 'second' ? 'gunsmith-confirm' : undefined), this.mediaSize, 'Select input');
      }
      return;
    }
    y += this.copy(root, this.layout.margin, y, kind === 'merge' ? 'TWO MATCHING PARTS / ONE HIGHER TIER' : 'TARGET PART + TRAIT CORE / INFUSED PART', this.laneWidth, '#24cec7').height + 12;
    const recipes = state.workshop.filter(recipe => recipe.kind === kind);
    if (!recipes.length) this.copy(root, this.layout.margin, y, `No legal ${kind} recipes in your inventory.`);
    for (const recipe of recipes) {
      if (recipe.kind === 'merge') {
        const button = this.action(root, this.layout.margin, y, recipe.label, `gunsmith-workshop:merge:${recipe.groupId}`,
          () => this.redraw(this.commands.beginGunMerge(recipe.groupId)));
        y += button.height + 12;
      } else {
        const target = state.parts.find(part => part.instanceId === recipe.targetInstanceId);
        const core = state.parts.find(part => part.instanceId === recipe.traitInstanceId);
        if (!target || !core) continue;
        y = this.partCard(root, y, target, `TARGET • ${target.stateLabel} + ${core.name} ${gunsmithTierLabel(core.rarity, core.tier)}`, `gunsmith-workshop:infuse:${recipe.targetInstanceId}:${recipe.traitInstanceId}`,
          () => this.redraw(this.commands.requestGunWorkshop({ kind: 'infuse', targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId }), 'gunsmith-confirm'), this.mediaSize, 'Preview infusion');
      }
    }
  }
  private drawParts(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number, scrap: number): void {
    const catalog = snapshot.gunsmith.catalog;
    let y = start;
    const selected = catalog.find(part => part.partId === this.selectedCatalogPartId);
    if (!selected) { this.selectedCatalogPartId = undefined; this.fabricationConfirmation = undefined; }
    if (selected) {
      const size = this.wide ? 400 : Math.min(264, this.laneWidth - 32);
      this.environment.controls.addLoadoutArt(root, this.layout.centerX, y + size / 2, selected.iconArtId, size, size);
      y += size + 12;
      y += this.copy(root, this.layout.margin, y, `${selected.name.toUpperCase()}\n${selected.stateLabel} • ${selected.slot} • ${selected.effectScope}`, this.laneWidth, '#24cec7', 20).height + 12;
      y += this.copy(root, this.layout.margin, y, [selected.representativeLabel,
        ...selected.effectLines, selected.comparisonSummary, selected.fabricationOutputLabel, selected.sourceLabel, selected.lockReason,
        selected.affordable === false ? 'Insufficient Scrap for fabrication.' : undefined].filter(Boolean).join('\n'), this.laneWidth, '#f7f1d5').height + 12;
      if (selected.comparison) {
        y = this.comparison(root, snapshot, y, selected.comparison.before, selected.comparison.after, selected.comparison.stats, selected.comparison.effects,
          undefined, snapshot.gunsmith.selectedBuild?.familyId, selected.comparisonScopeLabel);
      }
      for (const trait of selected.traitIcons) {
        this.environment.controls.addCatalogIcon(root, this.layout.margin + 18, y + 16, trait.iconArtId, 32);
        y += this.copy(root, this.layout.margin + 42, y, trait.trait, this.laneWidth - 42, '#24cec7').height + 12;
      }
      if (this.fabricationConfirmation?.partId === selected.partId && this.fabricationConfirmation.cost !== selected.fabricationCost) this.fabricationConfirmation = undefined;
      if (this.fabricationConfirmation?.partId === selected.partId) {
        const confirmation = this.fabricationConfirmation;
        const remaining = scrap >= this.fabricationConfirmation.cost ? `${scrap - this.fabricationConfirmation.cost} Scrap` : `${scrap} Scrap (insufficient)`;
        y += this.copy(root, this.layout.margin, y,
          `FINAL CHECK\n${selected.name} ${gunsmithTierLabel(selected.rarity, 1)}\nAdds one STORED copy only; build remains unchanged.\nOutput destination: STORED inventory\nCost: ${this.fabricationConfirmation.cost} Scrap • Balance after: ${remaining}`,
          this.laneWidth, '#f7d774').height + 8;
        y = this.actionPair(root, y, 'Confirm fabrication', `gunsmith-fabricate-confirm:${selected.partId}`, () => {
          if (this.fabricationConfirmation !== confirmation) return;
          this.fabricationConfirmation = undefined;
          const next = this.commands.fabricateGunPart(selected.partId);
          const current = next.gunsmith.catalog.find(part => part.partId === selected.partId);
          const unchanged = next.panel === 'gunsmith' && next.gunsmith.surface === 'parts'
            && this.selectedCatalogPartId === selected.partId && current?.ownedCount === selected.ownedCount
            && current.fabricationCost === confirmation.cost;
          // A successful fabrication adds one owned copy. An unchanged result
          // keeps the review, with a fresh identity that revokes this callback.
          if (unchanged) this.fabricationConfirmation = { ...confirmation };
          this.redraw(next, unchanged ? `gunsmith-fabricate-confirm:${selected.partId}` : `gunsmith-catalog:${selected.partId}`);
        }, `gunsmith-fabricate-cancel:${selected.partId}`, () => {
          this.fabricationConfirmation = undefined; this.redraw(snapshot, `gunsmith-fabricate-request:${selected.partId}`);
        }, selected.canFabricate);
        return;
      } else if (selected.fabricationCost !== undefined) {
        const request = this.action(root, this.layout.margin, y, selected.fabricationActionLabel ?? `Fabricate • ${selected.fabricationCost} Scrap`, `gunsmith-fabricate-request:${selected.partId}`, () => {
          this.fabricationConfirmation = { partId: selected.partId, cost: selected.fabricationCost! };
          this.redraw(snapshot, `gunsmith-fabricate-confirm:${selected.partId}`);
        }, this.laneWidth, selected.canFabricate);
        y += request.height + 12;
      }
      const close = this.action(root, this.layout.margin, y, 'Back to Parts', `gunsmith-catalog-close:${selected.partId}`, () => {
        this.selectedCatalogPartId = undefined; this.fabricationConfirmation = undefined; this.redraw(snapshot, `gunsmith-catalog:${selected.partId}`);
      });
      y += close.height + 12;
    }
    y += this.copy(root, this.layout.margin, y, 'PARTS • OWNERSHIP / SOURCE / FABRICATION', this.laneWidth, '#24cec7').height + 12;
    const filters = ['All', ...new Set(catalog.map(part => part.slot))];
    const columns = this.wide ? Math.min(6, filters.length) : this.compactPhone ? 3 : 2;
    const filterWidth = (this.laneWidth - (columns - 1) * 8) / columns;
    let rowHeight = 0;
    filters.forEach((slot, index) => {
      if (index > 0 && index % columns === 0) { y += rowHeight + 8; rowHeight = 0; }
      const active = (slot === 'All' && !this.catalogSlot) || slot === this.catalogSlot;
      const filter = this.action(root, this.layout.margin + index % columns * (filterWidth + 8), y,
        `${active ? '• ' : ''}${slot}`, `gunsmith-catalog-filter:${slot}`, () => {
          this.catalogSlot = slot === 'All' ? undefined : slot; this.redraw(snapshot, `gunsmith-catalog-filter:${slot}`);
        }, filterWidth);
      rowHeight = Math.max(rowHeight, filter.height);
    });
    y += rowHeight + 12;
    const filteredCatalog = catalog.filter(part => !this.catalogSlot || part.slot === this.catalogSlot);
    if (!this.wide) {
      for (const part of filteredCatalog) {
        const size = this.mediaSize;
        const compactCard = this.compactPhone;
        const label = `${part.name}\n${part.slot.toUpperCase()} • ${part.stateLabel} • ${part.effectScope}\n${part.statChips.slice(0, 2).join(' • ') || 'Trait engineering'}${part.fabricationCost === undefined ? '' : `\n${part.fabricationCost} Scrap`}`;
        const row = this.button(root, this.layout.margin, y, label, compactCard ? size + 32 : size + 144, () => {
          this.selectedCatalogPartId = part.partId; this.fabricationConfirmation = undefined;
          this.redraw(snapshot, `gunsmith-catalog-close:${part.partId}`);
        }, 'ui:confirm', this.laneWidth, undefined, part.traitIcons.length * 38,
          compactCard ? size + 32 : 12, true, 'left', 'card', compactCard ? 12 : size + 24);
        this.environment.controls.rememberFocus(row, `gunsmith-catalog:${part.partId}`);
        const owner = this.environment.controls.buttonIndex(row);
        this.environment.controls.addLoadoutArt(root, compactCard ? this.layout.margin + size / 2 + 16 : this.layout.centerX,
          y + size / 2 + 16, part.iconArtId, size, size, owner);
        part.traitIcons.forEach((trait, index) => this.environment.controls.addCatalogIcon(root,
          this.layout.margin + this.laneWidth - 24 - index * 38, y + size + 16, trait.iconArtId, 32, owner));
        y += row.height + 12;
      }
      return;
    }

    // Desktop/foldable catalog cards become a comparison grid: multiple
    // parts remain visible with their name, state, scope and stat chips beside
    // a bounded icon. Selection still opens the existing detailed inspector.
    const cardColumns = this.layout.width >= 1280 ? 3 : 2;
    const cardGap = 12;
    const cardWidth = (this.laneWidth - cardGap * (cardColumns - 1)) / cardColumns;
    // The icon is a side anchor, not a second vertical column. A smaller
    // bounded extent leaves the name/effect copy readable beside it and
    // removes the blank middle band in the former art-heavy cards.
    const size = Math.min(116, cardWidth - 24);
    for (let index = 0; index < filteredCatalog.length; index += cardColumns) {
      const rowParts = filteredCatalog.slice(index, index + cardColumns);
      let rowHeight = Math.max(this.layout.hitTarget, size + 28);
      const rows = rowParts.map((part, column) => {
        const x = this.layout.margin + column * (cardWidth + cardGap);
        const label = `${part.name}\n${part.slot.toUpperCase()} • ${part.stateLabel}\n${part.effectScope}\n${part.statChips.slice(0, 2).join(' • ') || 'Trait engineering'}${part.fabricationCost === undefined ? '' : ` • ${part.fabricationCost} Scrap`}`;
        const row = this.button(root, x, y, label, rowHeight, () => {
          this.selectedCatalogPartId = part.partId; this.fabricationConfirmation = undefined;
          this.redraw(snapshot, `gunsmith-catalog-close:${part.partId}`);
        }, 'ui:confirm', cardWidth, undefined, part.traitIcons.length * 30, size + 30, true, 'left', 'card', size + 24);
        this.environment.controls.rememberFocus(row, `gunsmith-catalog:${part.partId}`);
        rowHeight = Math.max(rowHeight, row.height);
        return { part, row, x };
      });
      for (const { part, row, x } of rows) {
        row.setFixedSize(cardWidth, rowHeight);
        const owner = this.environment.controls.buttonIndex(row);
        this.environment.controls.addLoadoutArt(root, x + 16 + size / 2, y + rowHeight / 2,
          part.iconArtId, size, size, owner);
        part.traitIcons.forEach((trait, traitIndex) => this.environment.controls.addCatalogIcon(root,
          x + cardWidth - 20 - traitIndex * 30, y + rowHeight - 22, trait.iconArtId, 26, owner));
      }
      y += rowHeight + cardGap;
    }
  }
}
