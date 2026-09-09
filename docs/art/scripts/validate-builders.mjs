/**
 * Manifest-driven builder-family gate.  The Lua harness below remains the
 * deep Pixelorama drawing-contract verifier for the established families;
 * this file is the authority for deciding which production builders exist.
 * Adding an ordinary resource therefore changes only visual-resources.json.
 */
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { loadVisualManifest, resolveProductionChain } from './lib/visual-manifest.mjs';

const manifest = loadVisualManifest();
const errors = [...manifest.errors];
const supportedFamilies = new Set(['image', 'spritesheet', 'atlas']);
for (const resource of manifest.resources) {
  const id = resource?.id ?? '<unknown resource>';
  const family = resource?.load?.type;
  if (!supportedFamilies.has(family)) { errors.push(`${id}: no reusable builder family for ${String(family)}`); continue; }
  const chain = resolveProductionChain(manifest.root, resource);
  if (!existsSync(chain.sourcePath)) errors.push(`${id}: missing editable source ${relative(manifest.root, chain.sourcePath)}`);
  if (!existsSync(chain.builderPath)) errors.push(`${id}: missing deterministic ${family} builder ${relative(manifest.root, chain.builderPath)}`);
}
if (errors.length) { console.error(`Builder family validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`); process.exitCode = 1; }
else console.log(`Validated ${manifest.resources.length} production resources against reusable image/spritesheet/atlas builder families.`);
