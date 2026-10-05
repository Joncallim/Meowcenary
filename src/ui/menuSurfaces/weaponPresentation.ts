import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import type { GunsmithAssembledPreview } from '../gunsmithController';
import type { MenuSurfaceControls } from './surface';
import { loadoutArtBounds } from '../../presentation/loadoutArtFraming';

export function assemblyArtIds(preview: GunsmithAssembledPreview): readonly string[] {
  return [preview.baseArtId, ...preview.layers.map(layer => layer.artId)];
}

/** Size the workbench from prepared visible bounds, so tall chassis do not
 * shrink when the SMG reference's aspect ratio is applied to another family. */
export function assemblyMediaHeight(framingIds: readonly string[], width: number): number {
  const bounds = framingIds.map(loadoutArtBounds);
  const first = bounds[0];
  if (!first || bounds.some(row => !row || row.frameWidth !== first.frameWidth || row.frameHeight !== first.frameHeight)) return width * 0.56;
  const rows = bounds.filter(row => row !== undefined);
  const unionWidth = Math.max(...rows.map(row => row.left + row.width)) - Math.min(...rows.map(row => row.left));
  const unionHeight = Math.max(...rows.map(row => row.top + row.height)) - Math.min(...rows.map(row => row.top));
  return width * unionHeight / unionWidth;
}

export function collectGunsmithArtIds(snapshot: MainMenuSnapshot): readonly string[] {
  const state = snapshot.gunsmith;
  const previews = [state.selectedBuild?.preview, state.unconfiguredBuild?.preview, state.candidatePreview];
  return [...new Set([
    ...state.families.flatMap(family => [family.iconArtId, ...(family.previewBaseArtId ? [family.previewBaseArtId] : [])]),
    ...previews.flatMap(preview => preview ? [...assemblyArtIds(preview),
      ...preview.traitCores.map(core => core.iconArtId), ...preview.traitEmblems.map(trait => trait.iconArtId)] : []),
    ...state.slots.map(slot => slot.iconArtId),
    ...state.parts.flatMap(part => [part.iconArtId, ...part.traitIcons.map(trait => trait.iconArtId)]),
    ...state.catalog.flatMap(part => [part.iconArtId, ...part.traitIcons.map(trait => trait.iconArtId)]),
    ...(state.confirmation ? [...state.confirmation.inputs, state.confirmation.output]
      .flatMap(part => [part.iconArtId, ...part.traitIcons.map(trait => trait.iconArtId)]) : []),
  ])];
}

/** The prepared union gives chassis and every layer one co-registered transform.
 * Current/candidate callers pass their combined IDs to keep identical framing. */
export function renderAssembledWeapon(controls: MenuSurfaceControls, root: Phaser.GameObjects.Container,
  preview: GunsmithAssembledPreview, x: number, y: number, width = 326, height?: number,
  framingIds: readonly string[] = assemblyArtIds(preview), ownerIndex?: number): void {
  for (const id of assemblyArtIds(preview)) controls.addLoadoutArt(root, x, y, id, width, height ?? assemblyMediaHeight(framingIds, width), ownerIndex, framingIds);
}
