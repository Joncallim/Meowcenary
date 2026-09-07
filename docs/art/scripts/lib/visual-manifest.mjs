/** Validator-only interpretation of the V4 logical-art/physical-resource split. */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const PNG_SIGNATURE = '89504e470d0a1a0a';

export function readJson(path, errors, id) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { errors.push(`${id}: cannot read JSON ${path} (${error.message})`); return undefined; }
}

export function pngDimensions(path, errors, id) {
  try {
    const bytes = readFileSync(path);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
      errors.push(`${id}: export is not a PNG with an IHDR header`); return undefined;
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } catch (error) { errors.push(`${id}: cannot read PNG (${error.message})`); return undefined; }
}

export function loadVisualManifest(root = repositoryRoot) {
  const errors = [];
  const art = readJson(join(root, 'src/data/visual-art.json'), errors, 'visual-art.json');
  const resources = readJson(join(root, 'src/data/visual-resources.json'), errors, 'visual-resources.json');
  return { root, bindings: art?.bindings ?? [], resources: Array.isArray(resources) ? resources : [], errors };
}

/** Canonical production paths are a property of a physical resource, never a binding. */
export function resolveProductionChain(root, resource) {
  const imageUrl = resource?.load?.imageUrl;
  if (typeof imageUrl !== 'string') return {};
  const exportPath = join(root, 'public', imageUrl);
  const exportName = basename(exportPath, '.png');
  const assetDirectory = dirname(imageUrl).replace(/^assets\//, '');
  const inferred = {
    exportPath,
    metadataPath: join(dirname(exportPath), `${exportName}.json`),
    sourcePath: join(root, 'assets-src', assetDirectory, 'source', `${exportName}.pxo`),
    builderPath: join(root, 'docs/art/scripts', `build-${exportName}.lua`),
    exportName,
  };
  // `production` is intentionally resource-owned. The fallback preserves the
  // existing canonical path convention while V4 catalogs are being expanded;
  // no logical binding participates in this resolution.
  const production = resource?.production;
  return {
    ...inferred,
    sourcePath: typeof production?.sourceUrl === 'string' ? join(root, production.sourceUrl) : inferred.sourcePath,
    builderPath: typeof production?.builderPath === 'string' ? join(root, production.builderPath) : inferred.builderPath,
  };
}

export function resourceById(resources) {
  const byId = new Map();
  for (const resource of resources) {
    if (typeof resource?.id === 'string' && !byId.has(resource.id)) byId.set(resource.id, resource);
  }
  return byId;
}

export function atlasFrames(data) {
  const rows = Array.isArray(data?.frames)
    ? data.frames.map((entry) => [entry?.filename ?? entry?.name, entry])
    : Object.entries(data?.frames ?? {});
  return rows.map(([name, entry]) => ({ name, rect: entry?.frame ?? entry }));
}

export function fileExists(path) { return typeof path === 'string' && existsSync(path); }
