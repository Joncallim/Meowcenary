import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { LoadoutPanelSurface } from './loadoutChrome';
import { type MenuSurfaceLayout, type EquipmentSurfaceCommands, type MenuSurfaceControls } from './surface';
import { edgeMargin } from '../layout';

export class EquipmentSurface extends LoadoutPanelSurface<EquipmentSurfaceCommands> {
  readonly panel = 'equipment' as const;
  private equipmentSetBrowserOpen = false;
  private selectionInvariant?: string;
  private detailTop = 0;
  private selectionGeneration = 0;
  private drawingSelection = false;
  private tailObjects: Phaser.GameObjects.GameObject[] = [];

  get selectionObjects(): readonly Phaser.GameObjects.GameObject[] { return this.tailObjects; }

  canUpdateSelection(snapshot: MainMenuSnapshot, scrap: number): boolean {
    return !!this.root && this.layout.width === this.environment.scene.scale.width
      && this.layout.height === this.environment.scene.scale.height && snapshot.panel === this.panel
      && this.selectionInvariant === this.prefixInvariant(snapshot, scrap);
  }

  updateSelection(scrollRoot: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, scrap: number): void {
    this.selectionGeneration += 1;
    const old = this.tailObjects;
    this.tailObjects = [];
    for (const object of old) object.destroy();
    this.drawSelection(scrollRoot, this.root!, snapshot, scrap);
  }

  override unmount(): void {
    this.selectionGeneration += 1;
    this.selectionInvariant = undefined;
    this.tailObjects = [];
    super.unmount();
  }

  override dispose(): void {
    this.unmount();
    super.dispose();
  }

  protected override button(...args: Parameters<MenuSurfaceControls['addButton']>): Phaser.GameObjects.Text {
    const action = args[5];
    if (this.drawingSelection && action) {
      const generation = this.selectionGeneration;
      args[5] = () => { if (generation === this.selectionGeneration) action(); };
    }
    return super.button(...args);
  }

  /** Compare only immutable model facts, never row positions or live objects.
   * The selected hero can change with a blueprint, requiring a full rebuild. */
  private prefixInvariant(snapshot: MainMenuSnapshot, scrap: number): string {
    const equipment = snapshot.equipment;
    const emblem = equipment.blueprints.find(piece => piece.equipmentId === equipment.selectedBlueprintId)?.setEmblemArtId;
    const hero = equipment.presentation.sets.find(set => set.emblemArtId === emblem)
      ?? equipment.presentation.sets.find(set => set.equippedCount > 0);
    return JSON.stringify([snapshot.notice, scrap, equipment.selectedSlot,
      this.equipmentSetBrowserOpen, hero, equipment.presentation, equipment.blueprints, equipment.acquisition, equipment.unavailable,
      snapshot.stage.stages.find(stage => stage.selected)?.menuBackdropArtId]);
  }

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    const { top, hitTarget } = layout;
    const equipment = snapshot.equipment;
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    const selectedSetEmblem = equipment.blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId)?.setEmblemArtId;
    const activeSet = equipment.presentation.sets.find((set) => set.emblemArtId === selectedSetEmblem)
      ?? equipment.presentation.sets.find((set) => set.equippedCount > 0);
    this.loadoutHeader(root, left, 'EQUIPMENT', activeSet
      ? `${activeSet.name.toUpperCase()} SET • ${activeSet.equippedCount}/4 EQUIPPED` : '0/4 PIECES EQUIPPED');
    let y = top + 26;
    this.environment.controls.beginScrollableRegion(y, this.layout.scrollBottom);
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
      const row = this.button(root, left, y, `${item.name}\nT${item.tier} • ${item.state}`, Math.max(hitTarget, this.equipmentMediaExtent() + 24), () => {
        this.environment.controls.focusNext(`equipment-detail:${item.instanceId}`, true);
        this.environment.onSnapshot(this.commands.selectEquipmentCandidate(item.instanceId), 'equipment-selection');
      }, 'ui:confirm', contentWidth, undefined, 0, this.equipmentMediaExtent() + 24, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-candidate:${item.instanceId}`);
      this.environment.controls.addLoadoutArt(root, left + 12 + this.equipmentMediaExtent() / 2, y + row.height / 2, item.iconArtId, this.equipmentMediaExtent(), this.equipmentMediaExtent(), this.environment.controls.buttonIndex(row));
      y += row.height + 8;
    }
    for (const route of equipment.acquisition.filter((row) => row.slot === equipment.selectedSlot && !row.available && !row.owned)) put(`${route.name}: ${route.summary}`);
    if (!selectedSlot.candidates.length) put(`No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`);
    const blueprints = equipment.blueprints.filter((piece) => piece.slot === equipment.selectedSlot);
    if (blueprints.length) put('AVAILABLE BLUEPRINTS');
    for (const blueprint of blueprints) {
      const row = this.button(root, left, y, `${blueprint.name}\nBLUEPRINT • NOT OWNED • ${blueprint.fabricationCost} Scrap`, Math.max(hitTarget, this.equipmentMediaExtent() + 24), () => {
        this.environment.controls.focusNext(`equipment-blueprint-detail:${blueprint.equipmentId}`, true);
        this.environment.onSnapshot(this.commands.selectEquipmentBlueprint(blueprint.equipmentId), 'equipment-selection');
      }, 'ui:confirm', contentWidth, undefined, 48, this.equipmentMediaExtent() + 24, true, 'left');
      this.rememberLoadoutFocus(row, `equipment-blueprint:${blueprint.equipmentId}`);
      const index = this.environment.controls.buttonIndex(row);
      this.environment.controls.addLoadoutArt(root, left + 12 + this.equipmentMediaExtent() / 2, y + row.height / 2, blueprint.iconArtId, this.equipmentMediaExtent(), this.equipmentMediaExtent(), index);
      this.environment.controls.addCatalogIcon(root, left + contentWidth - 24, y + row.height / 2, blueprint.setEmblemArtId, 34, index);
      y += row.height + 8;
    }
    this.detailTop = y;
    this.selectionInvariant = this.prefixInvariant(snapshot, scrap);
    this.drawSelection(root, root, snapshot, scrap);
  }

  private drawSelection(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot, scrap: number): void {
    const equipment = snapshot.equipment;
    const { hitTarget } = this.layout;
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    let y = this.detailTop;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot)!;
    const blueprints = equipment.blueprints.filter(piece => piece.slot === equipment.selectedSlot);
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    const before = new Set([...root.list, ...fixedRoot.list]);
    this.drawingSelection = true;
    try {
    const selected = selectedSlot.candidates.find((item) => item.instanceId === equipment.selectedInstanceId);
    const selectedBlueprint = blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId);
    if (selected) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selected.equipmentId)?.summary ?? '';
      const set = equipment.presentation.sets.find((row) => row.setId === selected.setId)!;
      const detail = this.equipmentInspection(root, left, y, contentWidth,
        `${selected.name} • T${selected.tier}\n${selectedSlot.label} • ${set.name} Set • ${selected.state}\n${source}`, selected.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-detail:${selected.instanceId}`);
      y += detail.height + 16;
      y = this.renderScopedLoadoutEffects(root, selected.effects, left, y, contentWidth, 22);
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
        const cost = upgrade.upgradePreview.cost;
        put(`UPGRADE • T${selected.tier} → T${selected.tier + 1} • ${cost} Scrap\n${equipped ? 'EQUIPPED: improved values apply immediately after upgrade.' : 'STORED: no active Loadout value changes until equipped.'}`);
        if (cost !== undefined) put(upgrade.upgradeLockReason ? `No Scrap spent • balance remains ${scrap}`
          : scrap < cost ? `Need ${cost - scrap} more Scrap • balance remains ${scrap}`
            : `Balance after: ${scrap - cost} Scrap`);
        const afterItem = upgrade.upgradePreview.after.slots.find((slot) => slot.slot === selected.slot)!.candidates.find((item) => item.instanceId === selected.instanceId)!;
        const pairWidth = (contentWidth - 16) / 2;
        const extent = Math.min(this.equipmentMediaExtent(), pairWidth - 24);
        const framing = [selected.iconArtId, afterItem.iconArtId];
        this.loadoutMaterial(root, left, y, pairWidth, extent + 56);
        this.loadoutMaterial(root, left + pairWidth + 16, y, pairWidth, extent + 56);
        this.environment.controls.addLoadoutArt(root, left + pairWidth / 2, y + 12 + extent / 2,
          selected.iconArtId, extent, extent, undefined, framing);
        this.environment.controls.addLoadoutArt(root, left + pairWidth + 16 + pairWidth / 2, y + 12 + extent / 2,
          afterItem.iconArtId, extent, extent, undefined, framing);
        this.loadoutCopy(root, left + 12, y + extent + 24, `TIER ${selected.tier}`, pairWidth - 24, '#24cec7');
        this.loadoutCopy(root, left + pairWidth + 28, y + extent + 24, `TIER ${afterItem.tier}`, pairWidth - 24, '#24cec7');
        y += extent + 72;
        put(`ITEM NOW\n${this.loadoutEffectCopy(selected.effects)}\nITEM AFTER UPGRADE\n${this.loadoutEffectCopy(afterItem.effects)}`);
        if (cost !== undefined) {
          const action = this.button(root, left, y, upgrade.upgradeLockReason ? `LOCKED • ${upgrade.upgradeLockReason}` : `Upgrade for ${cost} Scrap`, hitTarget, () => this.environment.onSnapshot(this.commands.upgradeEquipment(selected.instanceId, selected.tier)), 'ui:confirm', contentWidth);
          this.rememberLoadoutFocus(action, `equipment-upgrade:${selected.instanceId}`);
          if (upgrade.upgradeLocked || scrap < cost) this.environment.controls.disableButton(action);
          y += action.height + 8;
        }
      }
      if (upgrade.upgradeLockReason) put(`LOCKED • ${upgrade.upgradeLockReason}`, '#fbbf24');
      else if (selected.tier >= 4) put('Maximum Equipment tier');
    } else if (selectedBlueprint) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selectedBlueprint.equipmentId)?.summary ?? '';
      const detail = this.equipmentInspection(root, left, y, contentWidth,
        `${selectedBlueprint.name}\n${selectedBlueprint.setName} Set • ${selectedSlot.label}\n${source}`, selectedBlueprint.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`);
      y += detail.height + 16;
      y = this.renderScopedLoadoutEffects(root, selectedBlueprint.effects, left, y, contentWidth, 22);
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
    const fabricate = this.loadoutFooter(fixedRoot, left, contentWidth, hitTarget,
      selectedBlueprint ? `Fabricate for ${selectedBlueprint.fabricationCost} Scrap` : 'Fabricate Selected', () => {
        if (!selectedBlueprint) return;
        const next = this.commands.fabricateEquipment(selectedBlueprint.equipmentId);
        this.environment.controls.focusNext(next.equipment.selectedInstanceId ? `equipment-detail:${next.equipment.selectedInstanceId}` : `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`, true);
        this.environment.onSnapshot(next);
      });
    // Create the bounded fixed Back control last: slots remain the first four
    // semantic focus entries for the shared grid navigator.
    this.button(fixedRoot, left + contentWidth - 72, edgeMargin(this.layout.viewport, 'top') - 12 + 7, 'Back', hitTarget,
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
    } finally {
      this.drawingSelection = false;
      this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !before.has(object));
    }
  }
}
