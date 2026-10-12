/** Keep ordinary floor quiet and let authored variants form occasional broad
 * material patches. Cycling every tile made the arena read as a test grid and
 * overwhelmed the actors; the coarse hash produces deterministic 4x4 zones
 * while the fine hash breaks their edges without runtime randomness. */
export function floorArtIdForCell(
  artIds: readonly string[],
  column: number,
  row: number,
): string {
  const base = artIds[0];
  if (!base || artIds.length === 1) return base ?? '';
  const coarseColumn = Math.floor(column / 4);
  const coarseRow = Math.floor(row / 4);
  const coarseHash = Math.imul(coarseColumn + 11, 73_856_093) ^ Math.imul(coarseRow + 17, 19_349_663);
  const fineHash = Math.imul(column + 23, 83_492_791) ^ Math.imul(row + 29, 2_971_215_073);
  const inMaterialPatch = Math.abs(coarseHash) % 5 === 0 && Math.abs(fineHash) % 4 !== 0;
  if (!inMaterialPatch) return base;
  return artIds[1 + (Math.abs(coarseHash ^ fineHash) % (artIds.length - 1))]!;
}

