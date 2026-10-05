import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { LoadoutPanelSurface } from './loadoutChrome';
import { type MenuSurfaceLayout, type LoadoutSurfaceCommands } from './surface';
import { collectGunsmithArtIds, renderAssembledWeapon } from './weaponPresentation';
import { presentLoadoutModifier } from '../loadoutPresentation';

export class LoadoutSurface extends LoadoutPanelSurface<LoadoutSurfaceCommands> {
  readonly panel = 'loadout' as const;

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    const { top, hitTarget } = layout;
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    this.loadoutHeader(root, left, 'LOADOUT', 'PRE-RUN ENGINEERING');
    let y = top + 26;
    this.environment.controls.beginScrollableRegion(y, this.layout.scrollBottom);
    const equipment = snapshot.equipment;
    const gunsmith = snapshot.gunsmith;
    const selected = gunsmith.selectedBuild;
    const family = gunsmith.families.find((row) => row.id === selected?.familyId);
    const selectedCharacter = snapshot.character.characters.find((row) => row.selected);
    this.loadoutSection(root, left, y, 'MERCENARY');
    y += 20;
    this.loadoutMaterial(root, left, y, contentWidth, 114, true);
    this.loadoutCopy(root, left + 112, y + 20, `${selectedCharacter?.name ?? 'Mercenary'}\n${scrap} Scrap`, contentWidth - 128);
    if (selectedCharacter) this.environment.controls.addPanelArt(root, left + 54, y + 57, selectedCharacter.portraitArtId, 88);
    y += 150;
    this.loadoutSection(root, left, y, 'STOCK WEAPON');
    y += 16;
    this.loadoutMaterial(root, left, y, contentWidth, 90);
    this.loadoutCopy(root, left + 94, y + 28, selectedCharacter?.startingWeaponSummary ?? 'No starting weapon selected', contentWidth - 108);
    if (selectedCharacter?.startingWeaponIconArtId) this.environment.controls.addPanelArt(root, left + 46, y + 45, selectedCharacter.startingWeaponIconArtId, 70);
    y += 122;
    this.loadoutSection(root, left, y, 'EQUIPMENT • WHOLE LOADOUT');
    y += 22;
    y = this.renderEquipmentSlots(root, snapshot, left, y, contentWidth, hitTarget, true);
    y += 18;
    const actionWidth = (contentWidth - 10) / 2;
    this.rememberLoadoutFocus(this.loadoutRouter(root, left, y, actionWidth, hitTarget, 'Equipment', () => this.environment.onSnapshot(this.commands.open('equipment')), 0x2ec4b6), 'loadout:equipment');
    this.rememberLoadoutFocus(this.loadoutRouter(root, left + actionWidth + 10, y, actionWidth, hitTarget, 'Gunsmith', () => this.environment.onSnapshot(this.commands.open('gunsmith')), 0xf78003), 'loadout:gunsmith');
    y += hitTarget + 32;
    this.loadoutMaterial(root, left, y, contentWidth, 114);
    this.loadoutCopy(root, left + 16, y + 16, 'RUN READINESS', contentWidth - 32, '#82949d');
    this.loadoutCopy(root, left + 16, y + 44, `${equipment.presentation.slots.filter((slot) => slot.equipped).length}/4 Equipment slots equipped\n${selected ? `${family?.name ?? selected.familyId} Build configured\n${selected.activation}` : 'Gunsmith: Unconfigured'}`, contentWidth - 32);
    y += 130;
    const equippedEffects = equipment.presentation.slots.flatMap((slot) => slot.equipped?.effects ?? []);
    if (equippedEffects.length) {
      const effectHeading = this.loadoutCopy(root, left, y, 'EQUIPPED EFFECTS', contentWidth);
      y += effectHeading.height + 6;
      y = this.renderScopedLoadoutEffects(root, equippedEffects, left, y, contentWidth);
    }
    const sets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    const setHeading = this.loadoutCopy(root, left, y, 'ACTIVE SETS', contentWidth);
    y += setHeading.height + 6;
    if (sets.length === 0) y += this.loadoutCopy(root, left, y, 'No Set pieces equipped', contentWidth).height + 8;
    for (const set of sets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.environment.controls.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    const gunsmithHeading = this.loadoutCopy(root, left, y, 'GUNSMITH • ENGINEERED WEAPON FAMILY', contentWidth);
    y += gunsmithHeading.height + 10;
    if (selected) {
      const previewWidth = 88;
      const previewHeight = 100;
      if (selected.preview) {
        renderAssembledWeapon(this.environment.controls, root, selected.preview, this.layout.centerX, y + previewHeight / 2, previewWidth, previewHeight);
        selected.preview.traitEmblems.forEach((trait, index) => this.environment.controls.addCatalogIcon(root, left + 22 + index * 40, y + previewHeight + 20, trait.iconArtId, 34));
      }
      y += previewHeight + (selected.preview?.traitEmblems.length ? 48 : 16);
      const familyCopy = this.loadoutCopy(root, left, y, `${family?.name ?? selected.familyId} • ACTIVE\n${selected.activation.toUpperCase()}\n${selected.summary}`, contentWidth);
      y += familyCopy.height + 8;
      const scoped = equipment.presentation.runTruth.modifiers.filter((modifier) => modifier.scope?.kind === 'weapon-family' && modifier.scope.family === selected.familyId);
      if (scoped.length) y = this.renderScopedLoadoutEffects(root, scoped.map((modifier) => presentLoadoutModifier(modifier)), left, y, contentWidth);
      const truth = equipment.presentation.runTruth.families.find((entry) => entry.familyId === selected.familyId);
      for (const trait of truth?.traits ?? []) {
        y += this.loadoutCopy(root, left, y, `${trait.trait} [${family?.name ?? selected.familyId}]${trait.deduplicated ? ' • Does not stack' : ''}\nSources: ${trait.sourceLabels.join(' • ')}`, contentWidth).height + 6;
      }
    } else y += this.loadoutCopy(root, left, y, 'Choose a weapon family to engineer', contentWidth).height + 8;
    this.environment.controls.endScrollableRegion();
    this.loadoutFooter(root, left, contentWidth, hitTarget, 'Return to Contract', () => this.environment.onSnapshot(this.commands.open('stage')));
    this.environment.resources.panel('loadout', selectedCharacter ? [selectedCharacter.portraitArtId, selectedCharacter.startingWeaponIconArtId, 'nav-icon:equipment', 'nav-icon:gunsmith'] : ['nav-icon:equipment', 'nav-icon:gunsmith']);
    this.environment.resources.equipment([
      ...equipment.presentation.slots.flatMap((slot) => slot.equipped ? [slot.equipped.iconArtId] : []),
      ...equipment.presentation.sets.filter((set) => set.equippedCount > 0).map((set) => set.emblemArtId),
    ]);
    this.environment.resources.gunsmith(collectGunsmithArtIds(snapshot));
  }
}
