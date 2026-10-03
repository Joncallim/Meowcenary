import type Phaser from 'phaser';
import { edgeMargin } from '../layout';
import { loadoutFooterPadding } from './layout';
import { createUiText } from '../text';
import { ThemeFont } from '../theme';
import type { MainMenuSnapshot } from '../menus';
import { presentLoadoutModifier, type LoadoutEffectPresentation } from '../loadoutPresentation';
import type { EquipmentComparison, EquipmentLoadoutPresentation, EquipmentSetProgressPresentation } from '../equipmentPresentation';
import { MenuPanelSurface, type MenuSurfaceEnvironment, type LoadoutSurfaceCommands } from './surface';

/** Shared presentation language for Loadout and Equipment, consuming domain
 * read models without moving Set/modifier/equip truth into presentation. */
export abstract class LoadoutPanelSurface<C extends LoadoutSurfaceCommands> extends MenuPanelSurface {
  constructor(environment: MenuSurfaceEnvironment, protected readonly commands: C) { super(environment); }

  protected loadoutEffectCopy(effects: readonly LoadoutEffectPresentation[]): string {
    return effects.map((effect) => `${effect.kind === 'modifier' ? effect.text : effect.label} [${effect.target.label}]`).join(' • ');
  }

  protected renderScopedLoadoutEffects(root: Phaser.GameObjects.Container, effects: readonly LoadoutEffectPresentation[], left: number, top: number, width: number): number {
    let y = top;
    for (const effect of effects) {
      const copy = this.loadoutCopy(root, left + 30, y, this.loadoutEffectCopy([effect]), width - 30);
      this.environment.controls.addPanelArt(root, left + 12, y + 12,
        effect.target.kind === 'mercenary' ? 'nav-icon:mercenary' : 'nav-icon:gunsmith', 22);
      y += Math.max(26, copy.height) + 6;
    }
    return y;
  }

  protected loadoutCopy(root: Phaser.GameObjects.Container, x: number, y: number, text: string, width: number, color = '#d6f7ff'): Phaser.GameObjects.Text {
    const copy = this.own(root, createUiText(this.environment.scene, x, y, text, {
      color, fontFamily: ThemeFont.family, fontSize: `${ThemeFont.bodyMin}px`, lineSpacing: 4,
      wordWrap: { width },
    }));
    this.environment.controls.registerScrollObject(copy);
    return copy;
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
      color: '#e5d8c5', fontFamily: ThemeFont.family, fontSize: '12px', fontStyle: '700',
    })).setScrollFactor(0);
    this.own(root, createUiText(this.environment.scene, left + 12, top + 36, subtitle, {
      color: '#82949d', fontFamily: ThemeFont.family, fontSize: '8px',
    })).setScrollFactor(0);
  }

  protected loadoutSection(root: Phaser.GameObjects.Container, left: number, y: number, label: string): void {
    const text = this.own(root, createUiText(this.environment.scene, left + 4, y, label, {
      color: '#f78003', fontFamily: ThemeFont.family, fontSize: '10px', fontStyle: '700',
    })).setScrollFactor(0);
    this.environment.controls.registerScrollObject(text);
  }

  protected loadoutRouter(root: Phaser.GameObjects.Container, left: number, y: number, width: number, hitTarget: number, label: string, action: () => void, accent: number): Phaser.GameObjects.Text {
    const button = this.button(root, left, y, label, hitTarget, action, 'ui:confirm', width, undefined, 52, 12, false, 'left');
    button.setStyle({ fontSize: '10px' });
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

  protected loadoutFooter(root: Phaser.GameObjects.Container, left: number, width: number, hitTarget: number, label: string, action: () => void): Phaser.GameObjects.Text {
    const y = this.layout.height - edgeMargin(this.layout.viewport, 'bottom', 16) - hitTarget - this.loadoutFooterPadding();
    this.own(root, this.environment.scene.add.rectangle(left + width / 2, y + hitTarget / 2, width, hitTarget + 16, 0x101b22)).setScrollFactor(0);
    const button = this.button(root, left, y, label, hitTarget, action, 'ui:confirm', width, undefined, 52, 12, false, 'left');
    button.setStyle({ fontSize: '10px' });
    const bounds = button.getBounds();
    const chrome = this.environment.visuals?.addPanel(this.environment.scene, bounds.centerX, bounds.centerY, bounds.width, bounds.height, 'figma-card');
    this.own(root, this.environment.scene.add.rectangle(bounds.centerX, bounds.centerY, bounds.width, bounds.height, 0x2ec4b6, 0)).setStrokeStyle(1, 0x2ec4b6);
    this.own(root, this.environment.scene.add.rectangle(left + 4, y + hitTarget / 2, 4, 24, 0x2ec4b6));
    this.own(root, this.environment.scene.add.rectangle(left + width - 22, y + hitTarget / 2, 40, hitTarget - 4, 0x2ec4b6));
    this.environment.controls.addCatalogIcon(root, left + width - 22, y + hitTarget / 2, 'ui-chrome:figma-arrow', 18);
    if (chrome) { this.own(root, chrome); root.moveTo(chrome, Math.max(0, root.list.indexOf(button))); }
    return button;
  }

  protected renderEquipmentSlots(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, left: number, top: number, contentWidth: number, hitTarget: number, overview = false): number {
    const columns = overview ? 4 : 1;
    this.environment.controls.equipmentSlotColumns(columns);
    const gap = overview || this.layout.height < 760 ? 8 : 12;
    const slotWidth = (contentWidth - gap * (columns - 1)) / columns;
    let y = top;
    for (let row = 0; row < 4 / columns; row += 1) {
      let rowHeight = Math.max(hitTarget, overview ? 98 : this.layout.height >= 760 ? 64 : 56);
      snapshot.equipment.presentation.slots.slice(row * columns, (row + 1) * columns).forEach((slot, column) => {
        const x = left + column * (slotWidth + gap);
        const item = slot.equipped;
        const label = `${slot.label.toUpperCase()}\n${item ? overview ? `T${item.tier} • Fitted` : `${item.name}\nT${item.tier} • EQUIPPED` : 'Empty'}`;
        const button = this.button(root, x, y, label, rowHeight, () => {
          const next = this.commands.selectEquipmentSlot(slot.slot);
          this.environment.controls.focusNext(`equipment-slot:${slot.slot}`);
          this.environment.onSnapshot(overview ? this.commands.open('equipment') : next);
        }, 'ui:confirm', slotWidth, undefined, 0, !overview ? 50 : 0, true, overview ? 'center' : 'left');
        if (overview) button.setPadding(4, item ? 66 : 34, 4, 8).setFixedSize(slotWidth, rowHeight);
        this.rememberLoadoutFocus(button, `equipment-slot:${slot.slot}`);
        const index = this.environment.controls.buttonIndex(button);
        if (item) this.environment.controls.addCatalogIcon(root, overview ? x + slotWidth / 2 : x + 26, y + (overview ? 32 : Math.min(button.height / 2, 50)), item.iconArtId, overview ? Math.min(48, slotWidth - 12) : 44, index);
        else if (!overview) this.environment.controls.addPanelArt(root, x + 26, y + Math.min(button.height / 2, 50), slot.placeholderArtId, 44, true, false, index);
        rowHeight = Math.max(rowHeight, button.height);
      });
      y += rowHeight + gap;
    }
    return y + 6;
  }

  protected renderEquipmentComparison(root: Phaser.GameObjects.Container, comparison: EquipmentComparison, left: number, top: number, contentWidth: number, familyNames: ReadonlyMap<string, string>): number {
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

}
