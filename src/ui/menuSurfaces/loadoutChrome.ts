import type Phaser from 'phaser';
import { edgeMargin } from '../layout';
import { loadoutFooterPadding } from './layout';
import { createUiText } from '../text';
import { ThemeColor, ThemeFont } from '../theme';
import type { MainMenuSnapshot } from '../menus';
import { presentLoadoutRunTruthComparison, type LoadoutEffectPresentation, type LoadoutModifierDelta } from '../loadoutPresentation';
import type { EquipmentComparison, EquipmentSetProgressPresentation } from '../equipmentPresentation';
import { equipmentGradeCopy } from '../equipmentCatalog';
import { MenuPanelSurface, type MenuSurfaceEnvironment, type LoadoutSurfaceCommands } from './surface';

/** Shared presentation language for Loadout and Equipment, consuming domain
 * read models without moving Set/modifier/equip truth into presentation. */
export abstract class LoadoutPanelSurface<C extends LoadoutSurfaceCommands> extends MenuPanelSurface {
  constructor(environment: MenuSurfaceEnvironment, protected readonly commands: C) { super(environment); }

  protected loadoutEffectCopy(effects: readonly LoadoutEffectPresentation[]): string {
    return effects.map((effect) => `${effect.kind === 'modifier' ? effect.text : effect.label} [${effect.target.label}]`).join(' • ');
  }

  protected signedValue(sign: '+' | '−', value: string): string {
    return `${sign} ${value.trim().replace(/^[+−]\s*/, '')}`;
  }

  protected signedEffectCopy(sign: '+' | '−', effects: readonly LoadoutEffectPresentation[]): string {
    return this.signedValue(sign, this.loadoutEffectCopy(effects) || 'None');
  }

  protected modifierSourceCopy(delta: LoadoutModifierDelta, comparison: EquipmentComparison): { kind: 'item' | 'set' | 'other'; label: string } {
    const sourceId = delta.after?.modifier.sourceId ?? delta.before?.modifier.sourceId;
    if (!sourceId) return { kind: 'other', label: 'Loadout source' };
    const setMatch = /^set-bonus:(.+):(2|4)$/.exec(sourceId);
    if (setMatch) {
      const set = [...comparison.before.sets, ...comparison.after.sets].find((row) => row.setId === setMatch[1]);
      return { kind: 'set', label: `${set?.name ?? setMatch[1]} ${setMatch[2]}-piece bonus` };
    }
    const item = [...comparison.before.slots, ...comparison.after.slots]
      .flatMap((slot) => slot.candidates)
      .find((candidate) => candidate.instanceId === sourceId);
    if (item) return { kind: 'item', label: item.name };
    return { kind: 'other', label: sourceId.startsWith('build:') ? 'Gunsmith build' : 'Loadout source' };
  }

  protected modifierDeltaCopy(sign: '+' | '−', delta: LoadoutModifierDelta, comparison: EquipmentComparison): string {
    const source = this.modifierSourceCopy(delta, comparison);
    return `${this.signedValue(sign, delta.afterValue ?? delta.beforeValue ?? '—')} ${delta.label} [${delta.target.label}] • Source: ${source.label}`;
  }

  protected renderScopedLoadoutEffects(root: Phaser.GameObjects.Container, effects: readonly LoadoutEffectPresentation[], left: number, top: number, width: number, fontSize: number = ThemeFont.bodyMin): number {
    let y = top;
    for (const effect of effects) {
      const copy = this.loadoutCopy(root, left + 30, y, this.loadoutEffectCopy([effect]), width - 30).setStyle({ fontSize: `${fontSize}px` });
      this.environment.controls.addPanelArt(root, left + 12, y + 12,
        effect.target.kind === 'mercenary' ? 'nav-icon:mercenary' : 'nav-icon:gunsmith', 22);
      y += Math.max(fontSize + 12, copy.height) + 6;
    }
    return y;
  }

  protected loadoutCopy(root: Phaser.GameObjects.Container, x: number, y: number, text: string, width: number,
    color = '#d6f7ff', registerScroll = true): Phaser.GameObjects.Text {
    const copy = this.own(root, createUiText(this.environment.scene, x, y, text, {
      color, fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: 4,
      wordWrap: { width },
    }));
    if (registerScroll) this.environment.controls.registerScrollObject(copy);
    return copy;
  }

  /** Measure with the same Phaser text object used by the rendered copy. This
   * keeps fixed decision bands honest when a narrow viewport wraps a long
   * effect line; callers must not advance by a guessed line height. */
  protected measureLoadoutCopyHeight(text: string, width: number, fontSize: number = ThemeFont.bodyMin,
    lineSpacing = 4, fontStyle: string = '600'): number {
    // Reuse the production copy path so the centralized UI-text constructor
    // remains the sole creation site and the measured style matches render.
    const holder = this.environment.scene.add.container(0, 0);
    const measured = this.loadoutCopy(holder, 0, 0, text, width, '#d6f7ff', false);
    measured.setStyle({ fontSize: `${fontSize}px`, lineSpacing, fontStyle });
    const height = measured.height;
    holder.destroy(true);
    return height;
  }

  protected rememberLoadoutFocus(button: Phaser.GameObjects.Text, key: string): Phaser.GameObjects.Text {
    return this.environment.controls.rememberFocus(button, key);
  }

  protected setProgressCopy(set: EquipmentSetProgressPresentation): string {
    const pips = set.pips.map((equipped) => equipped ? '●' : '○').join('');
    return `${set.name}  ${pips}  ${set.equippedCount}/4${set.nextThreshold ? ` • Next bonus at ${set.nextThreshold}` : ''}\n${set.thresholds.map((threshold) =>
      `${threshold.count}-piece ${threshold.active ? 'ACTIVE' : 'INACTIVE'}: ${this.loadoutEffectCopy(threshold.effects)}`).join('\n')}`;
  }

  protected loadoutMaterial(root: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, selected = false): void {
    const panel = this.environment.visuals?.addPanel(this.environment.scene, x + width / 2, y + height / 2, width, height, selected ? 'figma-selected' : 'figma-card');
    if (panel) { this.own(root, panel); this.environment.controls.registerScrollObject(panel); }
  }

  protected loadoutHeader(root: Phaser.GameObjects.Container, left: number, title: string, subtitle: string): void {
    const top = edgeMargin(this.layout.viewport, 'top') - 12;
    this.own(root, this.environment.scene.add.rectangle(left, top + 28, 4, 24, 0xf78003));
    this.own(root, createUiText(this.environment.scene, left + 12, top + 12, title, {
      color: '#e5d8c5', fontFamily: ThemeFont.family, fontSize: `${ThemeFont.headingMin}px`, fontStyle: '700',
    })).setScrollFactor(0);
    this.own(root, createUiText(this.environment.scene, left + 12, top + 42, subtitle, {
      color: '#82949d', fontFamily: ThemeFont.family, fontSize: '12px',
    })).setScrollFactor(0);
  }

  protected loadoutSection(root: Phaser.GameObjects.Container, left: number, y: number, label: string): void {
    const text = this.own(root, createUiText(this.environment.scene, left + 4, y, label, {
      color: '#f78003', fontFamily: ThemeFont.family, fontSize: '14px', fontStyle: '700',
    })).setScrollFactor(0);
    this.environment.controls.registerScrollObject(text);
  }

  protected loadoutRouter(root: Phaser.GameObjects.Container, left: number, y: number, width: number, hitTarget: number, label: string, action: () => void, accent: number): Phaser.GameObjects.Text {
    const button = this.button(root, left, y, label, hitTarget, action, 'ui:confirm', width, undefined, 52, 12, false, 'left');
    button.setStyle({ fontSize: `${ThemeFont.bodyMin}px` });
    const index = this.environment.controls.buttonIndex(button);
    const bounds = button.getBounds();
    const stroke = this.own(root, this.environment.scene.add.rectangle(bounds.centerX, bounds.centerY, bounds.width, bounds.height, accent, 0)).setStrokeStyle(1, accent);
    const mark = this.own(root, this.environment.scene.add.rectangle(left + 4, y + hitTarget / 2, 4, 24, accent));
    const arrow = this.own(root, this.environment.scene.add.rectangle(left + width - 22, y + hitTarget / 2, 40, hitTarget - 4, accent));
    for (const object of [stroke, mark, arrow]) this.environment.controls.registerScrollObject(object, index);
    this.environment.controls.addCatalogIcon(root, left + width - 22, y + hitTarget / 2, 'ui-chrome:figma-arrow', 18, index);
    return button;
  }

  protected loadoutFooterPadding(): number { return loadoutFooterPadding(this.layout.height); }

  protected loadoutFooter(root: Phaser.GameObjects.Container, left: number, width: number, hitTarget: number,
    label: string, action: () => void, disabled = false): Phaser.GameObjects.Text {
    const y = this.layout.height - edgeMargin(this.layout.viewport, 'bottom', 16) - hitTarget - this.loadoutFooterPadding();
    const accent = disabled ? ThemeColor.disabled : 0x2ec4b6;
    const accentAlpha = disabled ? 0.72 : 1;
    this.own(root, this.environment.scene.add.rectangle(left + width / 2, y + hitTarget / 2, width, hitTarget + 16, 0x101b22)).setScrollFactor(0);
    const button = this.button(root, left, y, label, hitTarget, action, 'ui:confirm', width, undefined, 52, 12, false, 'left');
    button.setStyle({ fontSize: `${ThemeFont.bodyMin}px` });
    const bounds = button.getBounds();
    const chrome = this.environment.visuals?.addPanel(this.environment.scene, bounds.centerX, bounds.centerY, bounds.width, bounds.height, 'figma-card');
    const border = this.own(root, this.environment.scene.add.rectangle(bounds.centerX, bounds.centerY, bounds.width, bounds.height, accent, 0));
    border.setStrokeStyle(1, accent, accentAlpha);
    this.own(root, this.environment.scene.add.rectangle(left + 4, y + hitTarget / 2, 4, 24, accent, accentAlpha));
    this.own(root, this.environment.scene.add.rectangle(left + width - 22, y + hitTarget / 2, 40, hitTarget - 4, accent, accentAlpha));
    this.environment.controls.addCatalogIcon(root, left + width - 22, y + hitTarget / 2, 'ui-chrome:figma-arrow', 18);
    if (chrome) { this.own(root, chrome); root.moveTo(chrome, Math.max(0, root.list.indexOf(button))); }
    if (disabled) this.environment.controls.disableButton(button);
    return button;
  }

  protected loadoutContentWidth(): number {
    return Math.min(1360, this.layout.width - this.layout.margin - this.layout.rightMargin);
  }

  protected equipmentMediaExtent(): number {
    if (this.layout.height <= 480) return 128;
    // Equipment is a decision surface, not an art gallery: on desktop the
    // four equipped cards must leave room for set counts and the chooser in
    // the first viewport while retaining a clearly readable item silhouette.
    return this.layout.width < 375 ? 128 : this.layout.width < 600 ? 144 : 176;
  }

  protected equipmentInspectionExtent(contentWidth: number): number {
    const maxExtent = this.layout.height <= 480 ? 128 : this.layout.width <= 375 ? 80 : this.layout.width < 600 ? 136 : 184;
    return Math.min(maxExtent, contentWidth - 24);
  }

  /** The media inset is supplied before button chrome/focus/hit geometry is
   * built. All subsequent art belongs to that same shared scroll owner. */
  protected equipmentInspection(root: Phaser.GameObjects.Container, left: number, top: number,
    width: number, label: string, artId: string, requestedExtent?: number): Phaser.GameObjects.Text {
    const extent = Math.min(requestedExtent ?? this.equipmentInspectionExtent(width), width - 24);
    const wideDecisionLayout = this.layout.width >= 1040 && width >= 560;
    if (wideDecisionLayout) {
      // Desktop has room for the preview and the decision copy to be assessed
      // together. Keep the art recognizable, but keep the identity band
      // compact enough that the comparison remains in the first viewport.
      const artColumn = Math.min(196, Math.max(172, Math.floor(width * 0.2)));
      const artExtent = Math.min(156, Math.max(132, artColumn - 28));
      const textWidth = width - artColumn - 16;
      const bodyHeight = artExtent + 32;
      this.loadoutMaterial(root, left, top, artColumn, bodyHeight);
      this.environment.controls.addLoadoutArt(root, left + artColumn / 2,
        top + 12 + artExtent / 2, artId, artExtent, artExtent,
        undefined, [artId]);
      return this.button(root, left + artColumn + 16, top, label, bodyHeight, undefined,
        undefined, textWidth, undefined, 0, 12, true, 'left', 'card', 12);
    }
    // Detail opens with one genuine reading/focus target. It is deliberately
    // not a command: no save callback, action sound, or pointer activation.
    // Keyboard/controller focus can still page the masked body through the
    // Scene-owned navigation boundary.
    const detailReserve = this.layout.width <= 375 ? 64 : 110;
    const button = this.button(root, left, top, label, extent + detailReserve, undefined,
      undefined, width, undefined, 0, 12, true, 'left', 'card', extent + 24);
    this.environment.controls.addLoadoutArt(root, left + width / 2, top + 12 + extent / 2,
      artId, extent, extent, this.environment.controls.buttonIndex(button));
    return button;
  }

  protected renderEquipmentSlots(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, left: number, top: number, contentWidth: number, hitTarget: number, overview = false, compactTabs = false): number {
    if (compactTabs) {
      const columns = this.layout.width >= 1040
        || (compactTabs && this.layout.height <= 480 && this.layout.width >= 600) ? 4 : 2;
      const gap = 8;
      const slotWidth = (contentWidth - gap * (columns - 1)) / columns;
      // The 360px portrait treatment wraps the equipped-state copy to three
      // lines once the leading art reserve is applied. Give that narrow
      // header a little more vertical room so the last line does not crowd
      // the card border; compact landscape still keeps its 48px touch row.
      const rowHeight = Math.max(hitTarget, compactTabs && this.layout.width <= 375 ? 64 : 48);
      this.environment.controls.equipmentSlotColumns(columns);
      let y = top;
      for (let row = 0; row < Math.ceil(4 / columns); row += 1) {
        snapshot.equipment.presentation.slots.slice(row * columns, (row + 1) * columns).forEach((slot, column) => {
          const item = slot.equipped;
          const label = `${slot.label.toUpperCase()}\n${item ? `${equipmentGradeCopy(item.tier)} • EQUIPPED` : 'Empty'}`;
          const x = left + column * (slotWidth + gap);
          const button = this.button(root, x, y, label, rowHeight, () => {
            const next = this.commands.selectEquipmentSlot(slot.slot);
            this.environment.controls.focusNext(`equipment-slot:${slot.slot}`);
            this.environment.onSnapshot(next);
          }, 'ui:confirm', slotWidth, undefined, 0, item ? 48 : 4, false, item ? 'left' : 'center', 'card');
          this.rememberLoadoutFocus(button, `equipment-slot:${slot.slot}`);
          if (item) {
            const artExtent = Math.min(32, Math.max(24, rowHeight - 16));
            const index = this.environment.controls.buttonIndex(button);
            this.environment.controls.addLoadoutArt(root, x + 8 + artExtent / 2,
              y + rowHeight / 2, item.iconArtId, artExtent, artExtent, index);
          } else {
            const artExtent = Math.min(32, Math.max(24, rowHeight - 16));
            const index = this.environment.controls.buttonIndex(button);
            this.environment.controls.addPanelArt(root, x + 8 + artExtent / 2,
              y + rowHeight / 2, slot.placeholderArtId, artExtent, true, false, index);
          }
        });
        y += rowHeight + gap;
      }
      return y + 6;
    }
    const columns = overview || this.layout.width >= 1040 ? 4 : 2;
    this.environment.controls.equipmentSlotColumns(columns);
    const gap = overview || columns === 4 ? 8 : 12;
    const slotWidth = (contentWidth - gap * (columns - 1)) / columns;
    const media = Math.min(overview ? 48 : this.equipmentMediaExtent(), slotWidth - (overview ? 12 : 24));
    let y = top;
    for (let row = 0; row < 4 / columns; row += 1) {
      let rowHeight = Math.max(hitTarget, overview ? 98 : media + 72);
      snapshot.equipment.presentation.slots.slice(row * columns, (row + 1) * columns).forEach((slot, column) => {
        const x = left + column * (slotWidth + gap);
        const item = slot.equipped;
        const label = `${slot.label.toUpperCase()}\n${item ? overview ? `${equipmentGradeCopy(item.tier)} • EQUIPPED` : `${item.name}\n${equipmentGradeCopy(item.tier)} • EQUIPPED` : 'Empty'}`;
        const button = this.button(root, x, y, label, rowHeight, () => {
          const next = this.commands.selectEquipmentSlot(slot.slot);
          this.environment.controls.focusNext(`equipment-slot:${slot.slot}`);
          this.environment.onSnapshot(overview ? this.commands.open('equipment') : next);
        }, 'ui:confirm', slotWidth, undefined, 0, overview ? 4 : 12, true, overview ? 'center' : 'left', 'card', media + 24);
        this.rememberLoadoutFocus(button, `equipment-slot:${slot.slot}`);
        const index = this.environment.controls.buttonIndex(button);
        if (item) this.environment.controls.addLoadoutArt(root, x + slotWidth / 2,
          y + 12 + media / 2, item.iconArtId, media, media, index);
        else if (!overview) this.environment.controls.addPanelArt(root, x + slotWidth / 2,
          y + 12 + media / 2, slot.placeholderArtId, media, true, false, index);
        rowHeight = Math.max(rowHeight, button.height);
      });
      y += rowHeight + gap;
    }
    return y + 6;
  }

  protected renderEquipmentComparison(root: Phaser.GameObjects.Container, comparison: EquipmentComparison, left: number, top: number, contentWidth: number, familyNames: ReadonlyMap<string, string>): number {
    if (this.layout.width >= 1040 && contentWidth >= 800) {
      return this.renderWideEquipmentComparison(root, comparison, left, top, contentWidth, familyNames);
    }
    let y = top;
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    put('SET CHANGES', '#f78003');
    if (!comparison.setChanges.length) put('None');
    for (const change of comparison.setChanges) {
      const set = comparison.after.sets.find((row) => row.setId === change.setId)!;
      put(`${set.name} ${change.before}/4 → ${change.after}/4`);
      for (const count of change.lost) put(`− SET LOSS • ${set.name} • LOSE ${count}-piece: ${this.loadoutEffectCopy(comparison.before.sets.find((row) => row.setId === change.setId)!.thresholds.find((threshold) => threshold.count === count)!.effects)}`, '#fbbf24');
      for (const count of change.gained) put(`+ NEW ${set.name.toUpperCase()} BONUS • GAIN ${count}-piece: ${this.loadoutEffectCopy(set.thresholds.find((threshold) => threshold.count === count)!.effects)}`, '#86efac');
    }
    const effects = presentLoadoutRunTruthComparison(comparison.before.runTruth, comparison.after.runTruth);
    const gains = effects.modifiers.filter((delta) => delta.state === 'added' || delta.state === 'changed');
    const losses = effects.modifiers.filter((delta) => delta.state === 'removed' || delta.state === 'changed');
    const itemGains = gains.filter((delta) => this.modifierSourceCopy(delta, comparison).kind !== 'set');
    const setGains = gains.filter((delta) => this.modifierSourceCopy(delta, comparison).kind === 'set');
    const itemLosses = losses.filter((delta) => this.modifierSourceCopy(delta, comparison).kind !== 'set');
    const setLosses = losses.filter((delta) => this.modifierSourceCopy(delta, comparison).kind === 'set');
    const projectileGains = effects.projectileEffects.filter((delta) => delta.after.length > delta.before.length);
    const projectileLosses = effects.projectileEffects.filter((delta) => delta.before.length > delta.after.length);
    const projectileCopy = (effects: readonly { readonly kind: string }[]): string => effects.map((effect) => effect.kind).join(', ') || 'None';
    const traitGains = effects.traits.some((trait) => !trait.before && trait.after);
    if (itemGains.length || projectileGains.length || traitGains || !setGains.length) put('ITEM GAIN', '#86efac');
    if (!itemGains.length && !projectileGains.length && !traitGains && !setGains.length) put('None');
    for (const delta of itemGains) put(this.modifierDeltaCopy('+', delta, comparison), '#86efac');
    for (const delta of projectileGains) put(`+ ${familyNames.get(delta.familyId) ?? delta.familyId} projectile effects [All Weapons]: ${projectileCopy(delta.after)}`, '#86efac');
    for (const trait of effects.traits) {
      const family = familyNames.get(trait.familyId) ?? trait.familyId;
      if (!trait.before && trait.after) put(`+ ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${trait.afterSourceLabels.join(' • ') || 'None'}`, '#86efac');
    }
    if (setGains.length) {
      put('SET BONUS GAIN', '#86efac');
      for (const delta of setGains) put(this.modifierDeltaCopy('+', delta, comparison), '#86efac');
    }
    const traitLosses = effects.traits.some((trait) => trait.before && !trait.after);
    if (itemLosses.length || projectileLosses.length || traitLosses || !setLosses.length) put('ITEM LOSS', '#fbbf24');
    if (!itemLosses.length && !projectileLosses.length && !traitLosses && !setLosses.length) put('None');
    for (const delta of itemLosses) put(this.modifierDeltaCopy('−', delta, comparison), '#fbbf24');
    for (const delta of projectileLosses) put(`− ${familyNames.get(delta.familyId) ?? delta.familyId} projectile effects [All Weapons]: ${projectileCopy(delta.before)}`, '#fbbf24');
    for (const trait of effects.traits) {
      const family = familyNames.get(trait.familyId) ?? trait.familyId;
      if (trait.before && !trait.after) put(`− ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${trait.beforeSourceLabels.join(' • ') || 'None'}`, '#fbbf24');
      else if (trait.before && trait.after && trait.sourceChanged) put(`↔ ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${(trait.afterSourceLabels.length ? trait.afterSourceLabels : trait.beforeSourceLabels).join(' • ') || 'None'}`);
    }
    if (setLosses.length) {
      put('SET BONUS LOSS', '#fbbf24');
      for (const delta of setLosses) put(this.modifierDeltaCopy('−', delta, comparison), '#fbbf24');
    }
    return y;
  }

  private renderWideEquipmentComparison(root: Phaser.GameObjects.Container, comparison: EquipmentComparison,
    left: number, top: number, contentWidth: number, familyNames: ReadonlyMap<string, string>): number {
    type ComparisonRow = { readonly text: string; readonly color: string; readonly heading?: boolean };
    const setRows: ComparisonRow[] = [{ text: 'SET CHANGES', color: '#f78003', heading: true }];
    for (const change of comparison.setChanges) {
      const set = comparison.after.sets.find((row) => row.setId === change.setId)!;
      setRows.push({ text: `${set.name} ${change.before}/4 → ${change.after}/4`, color: '#d6f7ff' });
      for (const count of change.lost) setRows.push({
        text: `− SET LOSS • ${set.name} • LOSE ${count}-piece: ${this.loadoutEffectCopy(comparison.before.sets.find((row) => row.setId === change.setId)!.thresholds.find((threshold) => threshold.count === count)!.effects)}`,
        color: '#fbbf24',
      });
      for (const count of change.gained) setRows.push({
        text: `+ NEW ${set.name.toUpperCase()} BONUS • GAIN ${count}-piece: ${this.loadoutEffectCopy(set.thresholds.find((threshold) => threshold.count === count)!.effects)}`,
        color: '#86efac',
      });
    }
    if (!comparison.setChanges.length) setRows.push({ text: 'None', color: '#d6f7ff' });

    const effects = presentLoadoutRunTruthComparison(comparison.before.runTruth, comparison.after.runTruth);
    const gains = effects.modifiers.filter((delta) => delta.state === 'added' || delta.state === 'changed');
    const losses = effects.modifiers.filter((delta) => delta.state === 'removed' || delta.state === 'changed');
    const itemGains = gains.filter((delta) => this.modifierSourceCopy(delta, comparison).kind !== 'set');
    const setGains = gains.filter((delta) => this.modifierSourceCopy(delta, comparison).kind === 'set');
    const itemLosses = losses.filter((delta) => this.modifierSourceCopy(delta, comparison).kind !== 'set');
    const setLosses = losses.filter((delta) => this.modifierSourceCopy(delta, comparison).kind === 'set');
    const projectileGains = effects.projectileEffects.filter((delta) => delta.after.length > delta.before.length);
    const projectileLosses = effects.projectileEffects.filter((delta) => delta.before.length > delta.after.length);
    const projectileCopy = (rows: readonly { readonly kind: string }[]): string => rows.map((effect) => effect.kind).join(', ') || 'None';
    const traitGains = effects.traits.some((trait) => !trait.before && trait.after);
    const gainRows: ComparisonRow[] = [];
    if (itemGains.length || projectileGains.length || traitGains || !setGains.length) {
      gainRows.push({ text: 'ITEM GAIN', color: '#86efac', heading: true });
      if (!itemGains.length && !projectileGains.length && !traitGains && !setGains.length) gainRows.push({ text: 'None', color: '#d6f7ff' });
      for (const delta of itemGains) gainRows.push({ text: this.modifierDeltaCopy('+', delta, comparison), color: '#86efac' });
    }
    for (const delta of projectileGains) gainRows.push({ text: `+ ${familyNames.get(delta.familyId) ?? delta.familyId} projectile effects [All Weapons]: ${projectileCopy(delta.after)}`, color: '#86efac' });
    for (const trait of effects.traits) {
      const family = familyNames.get(trait.familyId) ?? trait.familyId;
      if (!trait.before && trait.after) gainRows.push({ text: `+ ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${trait.afterSourceLabels.join(' • ') || 'None'}`, color: '#86efac' });
    }
    if (setGains.length) {
      gainRows.push({ text: 'SET BONUS GAIN', color: '#86efac', heading: true });
      for (const delta of setGains) gainRows.push({ text: this.modifierDeltaCopy('+', delta, comparison), color: '#86efac' });
    }

    const traitLosses = effects.traits.some((trait) => trait.before && !trait.after);
    const lossRows: ComparisonRow[] = [];
    if (itemLosses.length || projectileLosses.length || traitLosses || !setLosses.length) {
      lossRows.push({ text: 'ITEM LOSS', color: '#fbbf24', heading: true });
      if (!itemLosses.length && !projectileLosses.length && !traitLosses && !setLosses.length) lossRows.push({ text: 'None', color: '#d6f7ff' });
      for (const delta of itemLosses) lossRows.push({ text: this.modifierDeltaCopy('−', delta, comparison), color: '#fbbf24' });
    }
    for (const delta of projectileLosses) lossRows.push({ text: `− ${familyNames.get(delta.familyId) ?? delta.familyId} projectile effects [All Weapons]: ${projectileCopy(delta.before)}`, color: '#fbbf24' });
    for (const trait of effects.traits) {
      const family = familyNames.get(trait.familyId) ?? trait.familyId;
      if (trait.before && !trait.after) lossRows.push({ text: `− ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${trait.beforeSourceLabels.join(' • ') || 'None'}`, color: '#fbbf24' });
      else if (trait.before && trait.after && trait.sourceChanged) lossRows.push({ text: `↔ ${family} • ${trait.trait} [${trait.target.label}]\nSources: ${(trait.afterSourceLabels.length ? trait.afterSourceLabels : trait.beforeSourceLabels).join(' • ') || 'None'}`, color: '#d6f7ff' });
    }
    if (setLosses.length) {
      lossRows.push({ text: 'SET BONUS LOSS', color: '#fbbf24', heading: true });
      for (const delta of setLosses) lossRows.push({ text: this.modifierDeltaCopy('−', delta, comparison), color: '#fbbf24' });
    }

    const columns = [setRows, gainRows, lossRows];
    const gap = 12;
    const columnWidth = (contentWidth - gap * (columns.length - 1)) / columns.length;
    const lineCapacity = Math.max(18, Math.floor(columnWidth / 9));
    const estimate = (row: ComparisonRow): number => Math.max(18, row.text.split('\n').reduce((height, line) => height + Math.max(1, Math.ceil(line.length / lineCapacity)) * 18, 0)) + (row.heading ? 4 : 2);
    const heights = columns.map((rows) => 20 + rows.reduce((height, row) => height + estimate(row), 0) + 12);
    const columnHeight = Math.max(...heights);
    columns.forEach((rows, column) => {
      const x = left + column * (columnWidth + gap);
      const panel = this.environment.visuals?.addPanel(this.environment.scene, x + columnWidth / 2, top + columnHeight / 2,
        columnWidth, columnHeight, 'figma-card');
      if (panel) {
        this.own(root, panel);
        this.environment.controls.registerScrollObject(panel);
      }
      let y = top + 12;
      rows.forEach((row) => {
        const copy = this.loadoutCopy(root, x + 12, y, row.text, columnWidth - 24, row.color);
        if (row.heading) copy.setStyle({ fontStyle: '700' });
        y += copy.height + (row.heading ? 6 : 4);
      });
    });
    return top + columnHeight + 12;
  }

}
