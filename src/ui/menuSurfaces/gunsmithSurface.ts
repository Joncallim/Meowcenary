import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import type { PartSlot } from '../../gameplay/gunsmith';
import type { GunsmithAssembledPreview, GunsmithPartView } from '../gunsmithController';
import { edgeMargin } from '../layout';
import { createUiText } from '../text';
import { ThemeFont } from '../theme';
import { MenuPanelSurface, type MenuSurfaceLayout, type GunsmithSurfaceCommands, type MenuSurfaceEnvironment, type MenuSurfaceControls } from './surface';
import { assemblyArtIds, assemblyMediaHeight, collectGunsmithArtIds, renderAssembledWeapon } from './weaponPresentation';
import { presentLoadoutModifier } from '../loadoutPresentation';
import type { EquipmentLoadoutPresentation } from '../equipmentPresentation';

type RunTruth = EquipmentLoadoutPresentation['runTruth'];
type ArtPart = Pick<GunsmithPartView, 'instanceId' | 'name' | 'tier' | 'iconArtId' | 'traitIcons' | 'statChips' | 'stateLabel' | 'effectScope'>;

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
    this.drawBody(scrollRoot, this.root!, snapshot);
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
  private get mediaSize(): number { return this.wide ? 240 : this.layout.width < 380 ? 128 : 144; }
  private copy(root: Phaser.GameObjects.Container, x: number, y: number, value: string,
    width = this.laneWidth, color = '#adc1c7', size: number = ThemeFont.bodyMin): Phaser.GameObjects.Text {
    const text = this.own(root, createUiText(this.environment.scene, x, y, value, {
      color, fontFamily: ThemeFont.family, fontSize: `${size}px`, wordWrap: { width },
    })).setScrollFactor(0);
    this.environment.controls.registerScrollObject(text);
    return text;
  }
  private backdrop(root: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number): void {
    const panel = this.environment.visuals?.addPanel(this.environment.scene, x + width / 2, y + height / 2, width, height, 'figma-card', { alpha: 0.96 });
    if (panel) { this.own(root, panel); root.sendToBack(panel); this.environment.controls.registerScrollObject(panel); }
  }
  private action(root: Phaser.GameObjects.Container, x: number, y: number, label: string, key: string,
    callback: () => void, width = this.laneWidth, enabled = true): Phaser.GameObjects.Text {
    const button = this.button(root, x, y, label, this.layout.hitTarget, callback, 'ui:confirm', width);
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
    this.drawBody(root, root, snapshot);
  }
  private drawBody(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot): void {
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
        case 'workshop': this.drawWorkshop(root, snapshot, y); break;
        case 'parts': this.drawParts(root, snapshot, y); break;
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
    framing: readonly string[], caption: string): number {
    const width = Math.min(700, this.laneWidth - 32);
    const artHeight = assemblyMediaHeight(framing, width);
    const header = this.copy(root, this.layout.margin + 16, y + 16, title, this.laneWidth - 32);
    const captionY = y + 16 + header.height + 12 + artHeight + 12;
    const summary = this.copy(root, this.layout.margin + 16, captionY, caption, this.laneWidth - 32, '#f7f1d5', 13);
    const height = captionY - y + summary.height + 16;
    this.backdrop(root, this.layout.margin, y, this.laneWidth, height);
    renderAssembledWeapon(this.environment.controls, root, preview, this.layout.centerX,
      y + 16 + header.height + 12 + artHeight / 2, width, artHeight, framing);
    let traitsY = y + height;
    const traits = [...preview.traitCores.map(core => ({ iconArtId: core.iconArtId, trait: `Trait Core T${core.tier}` })), ...preview.traitEmblems];
    traits.forEach((trait, index) => {
      const column = index % 2;
      if (column === 0 && index > 0) traitsY += 40;
      this.environment.controls.addCatalogIcon(root, this.layout.margin + 18 + column * (this.laneWidth / 2), traitsY + 18, trait.iconArtId, 32);
      this.copy(root, this.layout.margin + 42 + column * (this.laneWidth / 2), traitsY + 8, trait.trait, this.laneWidth / 2 - 48, '#24cec7', 13);
    });
    return traitsY + (traits.length ? 40 : 0) + 12;
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
    if (current) y = this.assembly(root, y, 'Your assembled weapon', current, framing, selected?.summary ?? 'Stock weapon • no persistent engineering fitted');
    if (!selected) return;
    const inspected = state.parts.find(part => part.instanceId === this.inspectedInstanceId);
    if (inspected) { this.drawInspection(root, snapshot, inspected, y); return; }
    if (state.candidatePreview && state.selectedCandidateInstanceId) {
      const candidate = state.parts.find(part => part.instanceId === state.selectedCandidateInstanceId);
      y = this.assembly(root, y, 'Preview • after this change', state.candidatePreview, framing, candidate?.actionLabel ?? 'Candidate build');
      if (candidate) {
        y += this.copy(root, this.layout.margin, y, `${candidate.name} T${candidate.tier} • ${candidate.stateLabel}
${candidate.effectScope}
${candidate.effectLines.join(' • ')}
${candidate.sourceLabel}`, this.laneWidth, '#f7f1d5').height + 12;
      }
      if (state.candidateComparison) y = this.comparison(root, snapshot, y, state.candidateComparison.before, state.candidateComparison.after, state.candidateComparison.stats);
      if (candidate) {
        if (candidate.displacementSummary) y += this.copy(root, this.layout.margin, y, candidate.displacementSummary, this.laneWidth, '#f7d774').height + 8;
        if (candidate.assignedBuildName && candidate.state === 'fitted-elsewhere') y += this.copy(root, this.layout.margin, y, `Moves from ${candidate.assignedBuildName}. Its source slot becomes empty.`, this.laneWidth, '#f7d774').height + 8;
        const commit = this.action(root, this.layout.margin, y, candidate.actionLabel, 'gunsmith-commit', () => this.redraw(this.commands.commitGunPartPreview(), `gunsmith-inspect:${candidate.instanceId}`));
        y += commit.height + 8;
        const cancel = this.action(root, this.layout.margin, y, 'Cancel preview', 'gunsmith-preview-cancel', () => this.redraw(this.commands.cancelGunPartPreview(), `gunsmith-part:${candidate.instanceId}`));
        y += cancel.height + 12;
      }
    }
    y += this.copy(root, this.layout.margin, y, 'ENGINEERING SLOTS', this.laneWidth, '#24cec7').height + 8;
    const columns = this.wide ? 4 : 2;
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
    y += rowHeight + 12;
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
  private partCard(root: Phaser.GameObjects.Container, y: number, part: ArtPart, status: string,
    key: string, callback: () => void, size = this.mediaSize, actionLabel = 'Inspect this part'): number {
    const stacked = !this.wide;
    const height = stacked ? size + 128 : Math.max(size + 32, 160);
    const label = `${part.name} T${part.tier}\n${status}\n${part.effectScope} • ${part.statChips.slice(0, 2).join(' • ') || 'Trait engineering'}\n${actionLabel}`;
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
    y += this.copy(root, this.layout.margin, y, `${part.name.toUpperCase()}\n${part.stateLabel} • T${part.tier}`, this.laneWidth, '#24cec7', 20).height + 12;
    this.backdrop(root, this.layout.margin, y, this.laneWidth, size + 32);
    this.environment.controls.addLoadoutArt(root, this.layout.centerX, y + 16 + size / 2, part.iconArtId, size, size);
    y += size + 44;
    y += this.copy(root, this.layout.margin, y, `${part.effectScope} • ${part.slot} slot\n${part.effectLines.join(' • ')}\n${part.traitLines.join(' • ')}\n${part.sourceLabel}`, this.laneWidth, '#f7f1d5').height + 12;
    this.action(root, this.layout.margin, y, 'Back to Gunsmith', `gunsmith-inspection-back:${part.instanceId}`, () => {
      this.inspectedInstanceId = undefined; this.redraw(snapshot, `gunsmith-inspect:${part.instanceId}`);
    });
  }
  private comparison(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number, before: RunTruth, after: RunTruth,
    stats: readonly import('../loadoutPresentation').LoadoutWeaponStatDelta[] = []): number {
    let y = start;
    y += this.copy(root, this.layout.margin, y, 'CURRENT / PREVIEW • RUN EFFECTS', this.laneWidth, '#24cec7').height + 8;
    for (const stat of stats) {
      const color = stat.direction === 'better' ? '#86efac' : stat.direction === 'worse' ? '#fca5a5' : '#adc1c7';
      y += this.copy(root, this.layout.margin, y, `${stat.label} • ${stat.displayBefore} to ${stat.displayAfter}`, this.laneWidth, color).height + 6;
    }
    const group = (truth: RunTruth) => {
      const duplicates = new Map<string, number>();
      return new Map(truth.modifiers.map(modifier => {
        const base = JSON.stringify([modifier.sourceId, modifier.stat, modifier.op, modifier.scope]);
        const index = duplicates.get(base) ?? 0; duplicates.set(base, index + 1);
        return [`${base}:${index}`, modifier] as const;
      }));
    };
    const beforeMods = group(before); const afterMods = group(after);
    let changes = 0;
    for (const key of new Set([...beforeMods.keys(), ...afterMods.keys()])) {
      const a = beforeMods.get(key); const b = afterMods.get(key);
      if (a?.value === b?.value) continue;
      changes += 1;
      const sample = b ?? a!;
      const presentation = presentLoadoutModifier(sample);
      const display = (modifier: typeof sample | undefined) => modifier ? presentLoadoutModifier(modifier).value : '—';
      y += this.copy(root, this.layout.margin, y, `${presentation.target.label} • ${presentation.label}\n${display(a)} to ${display(b)}`, this.laneWidth, '#f7f1d5').height + 8;
    }
    for (const family of after.families) {
      const previous = before.families.find(row => row.familyId === family.familyId);
      const name = snapshot.gunsmith.families.find(row => row.id === family.familyId)?.name ?? family.familyId;
      for (const trait of new Set([...(previous?.traits.map(row => row.trait) ?? []), ...family.traits.map(row => row.trait)])) {
        const a = previous?.traits.find(row => row.trait === trait); const b = family.traits.find(row => row.trait === trait);
        if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
        changes += 1;
        const icon = snapshot.gunsmith.parts.flatMap(row => row.traitIcons).find(row => row.trait === trait)
          ?? snapshot.gunsmith.catalog.flatMap(row => row.traitIcons).find(row => row.trait === trait);
        if (icon) this.environment.controls.addCatalogIcon(root, this.layout.margin + 18, y + 18, icon.iconArtId, 32);
        y += this.copy(root, this.layout.margin + 42, y, `${name} • ${trait}\n${a ? 'ACTIVE' : '—'} to ${b ? b.deduplicated ? 'ACTIVE • SHARED, APPLIED ONCE' : 'ACTIVE' : 'REMOVED'}`, this.laneWidth - 42, '#24cec7').height + 8;
      }
      if (JSON.stringify(previous?.projectileEffects ?? []) !== JSON.stringify(family.projectileEffects)) {
        changes += 1;
        const effects = (truth: readonly RunTruth['families'][number]['projectileEffects'][number][]) => truth.map(effect => effect.kind === 'burn'
          ? `Burn ${effect.damageMultiplier * 100}% • ${effect.durationMs}ms • every ${effect.tickIntervalMs}ms`
          : `Explosion ${effect.radius} radius • ${effect.damageMultiplier * 100}% splash`).join(' • ') || '—';
        y += this.copy(root, this.layout.margin, y, `${name} • projectile effects\n${effects(previous?.projectileEffects ?? [])} to ${effects(family.projectileEffects)}`, this.laneWidth, '#f7f1d5').height + 8;
      }
    }
    const mechanicsChanged = stats.some(stat => stat.before !== stat.after) || after.families.some(family => {
      const previous = before.families.find(row => row.familyId === family.familyId);
      return JSON.stringify(previous?.projectileEffects ?? []) !== JSON.stringify(family.projectileEffects)
        || JSON.stringify(previous?.traits.map(row => row.trait).sort() ?? []) !== JSON.stringify(family.traits.map(row => row.trait).sort());
    });
    if ((stats.length > 0 && !mechanicsChanged) || (!stats.length && !changes)) {
      y += this.copy(root, this.layout.margin, y, 'No mechanical change • effects already shared or clamped.').height + 8;
    }
    return y;
  }
  private drawWorkshop(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number): void {
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
        y += this.copy(root, x + 16, y, `${part.name} T${part.tier}\n${part.stateLabel} • ${part.effectScope}\n${part.statChips.join(' • ') || 'Trait engineering'}`, cardWidth - 32, '#f7f1d5').height + 8;
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
      y += this.copy(root, this.layout.margin, y, confirmation.mechanicalDelta.join('\n'), this.laneWidth, '#f7f1d5').height + 8;
      y = this.comparison(root, snapshot, y, confirmation.comparison.before, confirmation.comparison.after, confirmation.comparison.stats);
      const confirm = this.action(root, this.layout.margin, y, confirmation.confirmLabel, 'gunsmith-confirm', () => this.redraw(this.commands.confirmGunWorkshop()));
      y += confirm.height + 8;
      this.action(root, this.layout.margin, y, 'Cancel', 'gunsmith-cancel', () => this.redraw(this.commands.cancelGunWorkshop()));
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
        y = this.partCard(root, y, target, `TARGET • ${target.stateLabel} + ${core.name} T${core.tier}`, `gunsmith-workshop:infuse:${recipe.targetInstanceId}:${recipe.traitInstanceId}`,
          () => this.redraw(this.commands.requestGunWorkshop({ kind: 'infuse', targetInstanceId: recipe.targetInstanceId, traitInstanceId: recipe.traitInstanceId }), 'gunsmith-confirm'), this.mediaSize, 'Preview infusion');
      }
    }
  }
  private drawParts(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, start: number): void {
    const catalog = snapshot.gunsmith.catalog;
    let y = start;
    const selected = catalog.find(part => part.partId === this.selectedCatalogPartId);
    if (!selected) { this.selectedCatalogPartId = undefined; this.fabricationConfirmation = undefined; }
    if (selected) {
      const size = this.wide ? 400 : Math.min(264, this.laneWidth - 32);
      y += this.copy(root, this.layout.margin, y, `${selected.name.toUpperCase()}\n${selected.stateLabel} • ${selected.slot} • ${selected.effectScope}`, this.laneWidth, '#24cec7', 20).height + 12;
      this.environment.controls.addLoadoutArt(root, this.layout.centerX, y + size / 2, selected.iconArtId, size, size);
      y += size + 12;
      y += this.copy(root, this.layout.margin, y, [...selected.effectLines, selected.comparisonSummary, selected.sourceLabel, selected.lockReason, selected.affordable === false ? 'Insufficient Scrap for fabrication.' : undefined].filter(Boolean).join('\n'), this.laneWidth, '#f7f1d5').height + 12;
      for (const trait of selected.traitIcons) {
        this.environment.controls.addCatalogIcon(root, this.layout.margin + 18, y + 16, trait.iconArtId, 32);
        y += this.copy(root, this.layout.margin + 42, y, trait.trait, this.laneWidth - 42, '#24cec7').height + 12;
      }
      if (this.fabricationConfirmation?.partId === selected.partId && this.fabricationConfirmation.cost !== selected.fabricationCost) this.fabricationConfirmation = undefined;
      if (this.fabricationConfirmation?.partId === selected.partId) {
        y += this.copy(root, this.layout.margin, y, `Spend ${this.fabricationConfirmation.cost} Scrap?\nFabricates one T1 ${selected.name} into STORED inventory.`, this.laneWidth, '#f7d774').height + 8;
        const confirm = this.action(root, this.layout.margin, y, `Confirm fabrication • ${this.fabricationConfirmation.cost} Scrap`, `gunsmith-fabricate-confirm:${selected.partId}`, () => {
          this.fabricationConfirmation = undefined;
          this.redraw(this.commands.fabricateGunPart(selected.partId), `gunsmith-catalog:${selected.partId}`);
        }, this.laneWidth, selected.canFabricate);
        y += confirm.height + 8;
        const cancel = this.action(root, this.layout.margin, y, 'Cancel fabrication', `gunsmith-fabricate-cancel:${selected.partId}`, () => {
          this.fabricationConfirmation = undefined; this.redraw(snapshot, `gunsmith-fabricate-request:${selected.partId}`);
        });
        y += cancel.height + 12;
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
    const columns = this.wide ? 4 : 2;
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
    for (const part of catalog.filter(part => !this.catalogSlot || part.slot === this.catalogSlot)) {
      const size = this.mediaSize;
      const stacked = !this.wide;
      const label = `${part.name}\n${part.slot.toUpperCase()} • ${part.stateLabel} • ${part.effectScope}\n${part.statChips.slice(0, 2).join(' • ') || 'Trait engineering'}${part.fabricationCost === undefined ? '' : `\n${part.fabricationCost} Scrap`}`;
      const row = this.button(root, this.layout.margin, y, label, stacked ? size + 144 : size + 32, () => {
        this.selectedCatalogPartId = part.partId; this.fabricationConfirmation = undefined;
        this.redraw(snapshot, `gunsmith-catalog-close:${part.partId}`);
      }, 'ui:confirm', this.laneWidth, undefined, part.traitIcons.length * 38, stacked ? 12 : size + 32, true, 'left', 'card', stacked ? size + 24 : 12);
      this.environment.controls.rememberFocus(row, `gunsmith-catalog:${part.partId}`);
      const owner = this.environment.controls.buttonIndex(row);
      this.environment.controls.addLoadoutArt(root, stacked ? this.layout.centerX : this.layout.margin + size / 2 + 16,
        y + size / 2 + 16, part.iconArtId, size, size, owner);
      part.traitIcons.forEach((trait, index) => this.environment.controls.addCatalogIcon(root,
        this.layout.margin + this.laneWidth - 24 - index * 38, y + size + 16, trait.iconArtId, 32, owner));
      y += row.height + 12;
    }
  }
}
