/** Emits Lua contracts from V4 physical resources plus logical clip semantics. */
import { pngDimensions, loadVisualManifest, resolveProductionChain } from './lib/visual-manifest.mjs';
import { relative } from 'node:path';
import { readFileSync } from 'node:fs';

const manifest = loadVisualManifest();
if (manifest.errors.length) throw new Error(manifest.errors.join('\n'));
const bindingsByResource = new Map();
for (const binding of manifest.bindings) {
  const rows = bindingsByResource.get(binding.resourceId) ?? []; rows.push(binding); bindingsByResource.set(binding.resourceId, rows);
}
const quote = (value) => JSON.stringify(value);
const entries = manifest.resources.map((resource) => {
  const chain = resolveProductionChain(manifest.root, resource); const dimensions = pngDimensions(chain.exportPath, [], resource.id);
  if (!dimensions) throw new Error(`${resource.id}: cannot derive PNG dimensions`);
  const load = resource.load; const spritesheet = load.type === 'spritesheet';
  const frames = spritesheet ? dimensions.width / load.frameWidth : 1;
  if (!Number.isInteger(frames)) throw new Error(`${resource.id}: PNG does not divide into resource frames`);
  const tags = Object.assign({}, ...((bindingsByResource.get(resource.id) ?? []).map((binding) => Object.fromEntries(Object.entries(binding.clips ?? {}).map(([name, clip]) => [name, [clip.start + 1, clip.end + 1]])))));
  const pairs = Object.entries(tags).map(([name, range]) => `[${quote(name)}]={${range[0]},${range[1]}}`).join(',');
  const externalImporter = readFileSync(chain.builderPath, 'utf8').includes('import-imagegen-enemy-sheet.mjs');
  return `{manifestDriven=true,externalImporter=${externalImporter},script=${quote(relative(manifest.root, chain.builderPath))},width=${spritesheet ? load.frameWidth : dimensions.width},height=${spritesheet ? load.frameHeight : dimensions.height},frames=${frames},layers={},hidden={},populated={},tags={${pairs}},savedAs=${quote(relative(manifest.root, chain.sourcePath))}}`;
});
process.stdout.write(`{${entries.join(',')}}`);
