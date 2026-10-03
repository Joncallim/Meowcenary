import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import type { GunsmithAssembledPreview } from '../gunsmithController';
import type { MenuSurfaceControls } from './surface';

export function collectGunsmithArtIds(snapshot: MainMenuSnapshot): readonly string[] {
    return [
      ...snapshot.gunsmith.families.map((family) => family.iconArtId),
      ...snapshot.gunsmith.families.flatMap((family) => family.previewBaseArtId ? [family.previewBaseArtId] : []),
      ...(snapshot.gunsmith.selectedBuild?.preview ? [
        snapshot.gunsmith.selectedBuild.preview.baseArtId,
        ...snapshot.gunsmith.selectedBuild.preview.layers.map((layer) => layer.artId),
        ...snapshot.gunsmith.selectedBuild.preview.traitCores.map((core) => core.iconArtId),
        ...snapshot.gunsmith.selectedBuild.preview.traitEmblems.map((trait) => trait.iconArtId),
      ] : []),
      ...snapshot.gunsmith.slots.flatMap((slot) => [
        slot.iconArtId,
        ...slot.candidates.flatMap((part) => [part.iconArtId, ...part.traitIcons.map((trait) => trait.iconArtId)]),
      ]),
      ...snapshot.gunsmith.catalog.flatMap((part) => [part.iconArtId, ...part.traitIcons.map((trait) => trait.iconArtId)]),
    ];
  }

/** Both surfaces consume the authoritative assembly, with one authored canvas. */
export function renderAssembledWeapon(controls: MenuSurfaceControls, root: Phaser.GameObjects.Container, preview: GunsmithAssembledPreview, x: number, y: number, size = 176): void {
    controls.addCatalogIcon(root, x, y, preview.baseArtId, size);
    preview.layers.forEach((layer) => controls.addCatalogIcon(root, x, y, layer.artId, size));
  }
