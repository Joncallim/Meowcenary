import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { LoadoutPanelSurface } from './loadoutChrome';
import { type MenuSurfaceLayout, type EquipmentSurfaceCommands } from './surface';
import { edgeMargin } from '../layout';

export class EquipmentSurface extends LoadoutPanelSurface<EquipmentSurfaceCommands> {
  readonly panel = 'equipment' as const;
  private equipmentSetBrowserOpen = false;

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    const { width, top, margin, hitTarget } = layout;
    const equipment = snapshot.equipment;
    const contentWidth = Math.min(840, width - margin - this.layout.rightMargin);
    const left = this.layout.centerX - contentWidth / 2;
    this.loadoutHeader(root, left, 'EQUIPMENT', 'SETS + PIECES');
    let y = top + 26;
    this.environment.controls.beginScrollableRegion(y, this.layout.scrollBottom);
    const selectedSetEmblem = equipment.blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId)?.setEmblemArtId;
    const activeSet = equipment.presentation.sets.find((set) => set.emblemArtId === selectedSetEmblem)
      ?? equipment.presentation.sets.find((set) => set.equippedCount > 0);
    this.loadoutSection(root, left, y, activeSet ? activeSet.equippedCount > 0 ? 'ACTIVE SET' : 'SELECTED SET' : 'NO ACTIVE SET');
    y += 20;
    const heroHeight = this.layout.height >= 760 ? 142 : 64;
    this.loadoutMaterial(root, left, y, contentWidth, heroHeight, true);
    this.loadoutCopy(root, left + (activeSet ? 94 : 16), y + (heroHeight > 100 ? 36 : 12), activeSet ? `${activeSet.name} Set\n${activeSet.equippedCount}/4 equipped` : '0 pieces equipped', contentWidth - (activeSet ? 110 : 32));
    if (activeSet) this.environment.controls.addCatalogIcon(root, left + 42, y + heroHeight / 2, activeSet.emblemArtId, Math.min(68, heroHeight - 12));
    y += heroHeight + (this.layout.height >= 760 ? 38 : 4);
    this.loadoutSection(root, left, y, 'EQUIPPED SLOTS');
    y += 20;
    y = this.renderEquipmentSlots(root, snapshot, left, y, contentWidth, hitTarget);
    const browse = this.button(root, left, y, this.equipmentSetBrowserOpen ? 'CLOSE SETS' : 'BROWSE SETS', hitTarget, () => {
      this.equipmentSetBrowserOpen = !this.equipmentSetBrowserOpen;
      this.environment.controls.focusNext('equipment:browse-sets');
      this.environment.onSnapshot(this.commands.snapshot());
    }, 'ui:confirm', contentWidth, undefined, 0, 0, false, 'left', 'section');
    this.rememberLoadoutFocus(browse, 'equipment:browse-sets');
    y += browse.height + 12;
    // The structured catalog supplies the visible Set row and its exact IDs.
    // Browsing expands threshold detail without implying an equipped Set.
    const setColumns = Math.min(4, equipment.presentation.sets.length);
    const setWidth = contentWidth / Math.max(1, setColumns);
    equipment.presentation.sets.forEach((set, index) => {
      this.environment.controls.addCatalogIcon(root, left + (index % setColumns + 0.5) * setWidth,
        y + Math.floor(index / setColumns) * 52 + 22, set.emblemArtId, 44, this.environment.controls.buttonIndex(browse));
    });
    y += Math.ceil(equipment.presentation.sets.length / Math.max(1, setColumns)) * 52;
    if (this.equipmentSetBrowserOpen) {
      for (const set of equipment.presentation.sets) {
        const copy = this.loadoutCopy(root, left + 46, y, this.setProgressCopy(set), contentWidth - 46);
        this.environment.controls.addCatalogIcon(root, left + 20, y + 22, set.emblemArtId, 36);
        y += copy.height + 12;
      }
    }
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    const selectedSlot = equipment.presentation.slots.find((slot) => slot.slot === equipment.selectedSlot)!;
    put(`${selectedSlot.label.toUpperCase()} CANDIDATES • ${scrap} Scrap`);
    for (const item of selectedSlot.candidates) {
      const row = this.button(root, left, y, `${item.name}\nT${item.tier} • ${item.state}`, Math.max(hitTarget, 76), () => {
        this.environment.controls.focusNext(`equipment-detail:${item.instanceId}`, true);
        this.environment.onSnapshot(this.commands.selectEquipmentCandidate(item.instanceId));
      }, 'ui:confirm', contentWidth, undefined, 0, 76, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-candidate:${item.instanceId}`);
      this.environment.controls.addCatalogIcon(root, left + 34, y + row.height / 2, item.iconArtId, 60, this.environment.controls.buttonIndex(row));
      y += row.height + 8;
    }
    if (!selectedSlot.candidates.length) put(`No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`);
    const blueprints = equipment.blueprints.filter((piece) => piece.slot === equipment.selectedSlot);
    if (blueprints.length) put('AVAILABLE BLUEPRINTS');
    for (const blueprint of blueprints) {
      const row = this.button(root, left, y, `${blueprint.name}\nFABRICABLE • ${blueprint.fabricationCost} Scrap`, Math.max(hitTarget, 76), () => {
        this.environment.controls.focusNext(`equipment-blueprint-detail:${blueprint.equipmentId}`, true);
        this.environment.onSnapshot(this.commands.selectEquipmentBlueprint(blueprint.equipmentId));
      }, 'ui:confirm', contentWidth, undefined, 0, 76, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-blueprint:${blueprint.equipmentId}`);
      const index = this.environment.controls.buttonIndex(row);
      this.environment.controls.addCatalogIcon(root, left + 34, y + row.height / 2, blueprint.iconArtId, 60, index);
      this.environment.controls.addCatalogIcon(root, left + contentWidth - 24, y + row.height / 2, blueprint.setEmblemArtId, 34, index);
      y += row.height + 8;
    }
    const selected = selectedSlot.candidates.find((item) => item.instanceId === equipment.selectedInstanceId);
    const selectedBlueprint = blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId);
    if (selected) {
      const set = equipment.presentation.sets.find((row) => row.setId === selected.setId)!;
      const detail = this.button(root, left, y, `${selected.name} • T${selected.tier}\n${selectedSlot.label} • ${set.name} Set • ${selected.state}`, Math.max(hitTarget, 100), () => undefined, 'ui:confirm', contentWidth, undefined, 0, 82, true, 'left');
      this.rememberLoadoutFocus(detail, `equipment-detail:${selected.instanceId}`);
      this.environment.controls.disableButton(detail);
      this.environment.controls.addCatalogIcon(root, left + 38, y + 48, selected.iconArtId, 72, this.environment.controls.buttonIndex(detail));
      y += detail.height + 10;
      y = this.renderScopedLoadoutEffects(root, selected.effects, left, y, contentWidth);
      const equipped = selected.state === 'EQUIPPED';
      const comparison = equipped ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot }) : equipment.comparison;
      put(equipped ? 'IF UNEQUIPPED' : comparison?.displaced ? `Replaces ${comparison.displaced.name}` : `Fills empty ${selectedSlot.label.toLowerCase()} slot`);
      if (comparison) y = this.renderEquipmentComparison(root, comparison, left, y, contentWidth, new Map(snapshot.gunsmith.families.map((family) => [family.id, family.name])));
      const equip = this.button(root, left, y, equipped ? `Unequip ${selected.name}` : `Equip ${selected.name}`, hitTarget, () => this.environment.onSnapshot(equipped
        ? this.commands.unequipEquipment(selectedSlot.slot)
        : this.commands.equipEquipment(selected.instanceId)), 'ui:confirm', contentWidth);
      this.rememberLoadoutFocus(equip, `equipment-equip:${selected.instanceId}`);
      y += equip.height + 10;
      const upgrade = equipment.owned.find((item) => item.instanceId === selected.instanceId)!;
      if (upgrade.upgradePreview) {
        put(`UPGRADE • T${selected.tier} → T${selected.tier + 1} • ${upgrade.upgradePreview.cost} Scrap\n${equipped ? 'EQUIPPED: improved values apply immediately after upgrade.' : 'STORED: no active Loadout value changes until equipped.'}`);
        const afterItem = upgrade.upgradePreview.after.slots.find((slot) => slot.slot === selected.slot)!.candidates.find((item) => item.instanceId === selected.instanceId)!;
        this.environment.controls.addCatalogIcon(root, left + 40, y + 40, selected.iconArtId, 72);
        this.environment.controls.addCatalogIcon(root, left + 136, y + 40, afterItem.iconArtId, 72);
        y += 88;
        put(`ITEM NOW\n${this.loadoutEffectCopy(selected.effects)}\nITEM AFTER UPGRADE\n${this.loadoutEffectCopy(afterItem.effects)}`);
        if (upgrade.upgradeCost !== undefined) {
          const action = this.button(root, left, y, `Upgrade for ${upgrade.upgradeCost} Scrap`, hitTarget, () => this.environment.onSnapshot(this.commands.upgradeEquipment(selected.instanceId, selected.tier)), 'ui:confirm', contentWidth);
          this.rememberLoadoutFocus(action, `equipment-upgrade:${selected.instanceId}`);
          if (scrap < upgrade.upgradeCost) this.environment.controls.disableButton(action);
          y += action.height + 8;
        }
      }
      if (upgrade.upgradeLockReason) put(`LOCKED • ${upgrade.upgradeLockReason}`, '#fbbf24');
      else if (selected.tier >= 4) put('Maximum Equipment tier');
    } else if (selectedBlueprint) {
      const detail = this.button(root, left, y, `${selectedBlueprint.name}\n${selectedBlueprint.setName} Set • ${selectedSlot.label}\nFABRICABLE`, Math.max(hitTarget, 100), () => undefined, 'ui:confirm', contentWidth, undefined, 0, 82, true, 'left');
      this.rememberLoadoutFocus(detail, `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`);
      this.environment.controls.disableButton(detail);
      this.environment.controls.addCatalogIcon(root, left + 38, y + 48, selectedBlueprint.iconArtId, 72, this.environment.controls.buttonIndex(detail));
      y += detail.height + 10;
      y = this.renderScopedLoadoutEffects(root, selectedBlueprint.effects, left, y, contentWidth);
      put('Creates a stored T1 item. Equip it separately to change your Loadout.');
    }
    put('ACTIVE SETS');
    const activeSets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    if (!activeSets.length) put('No Set pieces equipped');
    for (const set of activeSets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.environment.controls.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    if (equipment.unavailable.length) put('A legacy Equipment item is unavailable in this version.', '#fbbf24');
    this.environment.controls.endScrollableRegion();
    const fabricate = this.loadoutFooter(root, left, contentWidth, hitTarget,
      selectedBlueprint ? `Fabricate for ${selectedBlueprint.fabricationCost} Scrap` : 'Fabricate Selected', () => {
        if (!selectedBlueprint) return;
        const next = this.commands.fabricateEquipment(selectedBlueprint.equipmentId);
        this.environment.controls.focusNext(next.equipment.selectedInstanceId ? `equipment-detail:${next.equipment.selectedInstanceId}` : `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`, true);
        this.environment.onSnapshot(next);
      });
    // Create the bounded fixed Back control last: slots remain the first four
    // semantic focus entries for the shared vertical navigator.
    this.button(root, left + contentWidth - 72, edgeMargin(this.layout.viewport, 'top') - 12 + 7, 'Back', hitTarget,
      () => this.environment.onSnapshot(this.commands.open('loadout')), 'ui:back', 72);
    if (selectedBlueprint) this.rememberLoadoutFocus(fabricate, `equipment-fabricate:${selectedBlueprint.equipmentId}`);
    if (!selectedBlueprint || scrap < selectedBlueprint.fabricationCost) this.environment.controls.disableButton(fabricate);
    this.environment.resources.equipment([
      ...equipment.presentation.slots.map((slot) => slot.placeholderArtId),
      ...equipment.presentation.slots.flatMap((slot) => slot.equipped ? [slot.equipped.iconArtId] : []),
      ...selectedSlot.candidates.map((item) => item.iconArtId),
      ...blueprints.flatMap((piece) => [piece.iconArtId, piece.setEmblemArtId]),
      ...equipment.presentation.sets.map((set) => set.emblemArtId),
      ...equipment.owned.flatMap((item) => item.instanceId === equipment.selectedInstanceId && item.upgradePreview
        ? item.upgradePreview.after.slots.flatMap((slot) => slot.candidates.filter((candidate) => candidate.instanceId === item.instanceId).map((candidate) => candidate.iconArtId)) : []),
    ]);
    this.environment.resources.panel('equipment', ['nav-icon:mercenary', 'nav-icon:gunsmith']);
  }
}
