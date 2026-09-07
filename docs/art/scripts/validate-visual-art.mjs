import { existsSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { atlasFrames, loadVisualManifest, pngDimensions, readJson, resolveProductionChain, resourceById } from './lib/visual-manifest.mjs';

export function validateVisualManifest(root) {
  const manifest = loadVisualManifest(root);
  const { bindings, resources, errors } = manifest;
  const fail = (id, message) => errors.push(`${id}: ${message}`);
  const ids = new Set(); const resourceIds = new Set(); const textureKeys = new Set(); const imageUrls = new Set();
  const byId = resourceById(resources);
  const legalKinds = new Set(['character', 'enemy', 'projectile', 'drop', 'weapon-icon', 'weapon-held', 'world', 'upgrade-icon']);
  const references = new Set();
  const resourceFields = new Set(['id', 'textureKey', 'sampling', 'load', 'production']);
  const resourceLoadFields = new Set(['type', 'imageUrl', 'dataUrl', 'frameWidth', 'frameHeight']);
  const bindingFields = new Set(['id', 'kind', 'resourceId', 'frameKey', 'required', 'display', 'clips']);
  const clipFields = new Set(['start', 'end', 'frameRate', 'repeat']);

  for (const resource of resources) {
    const id = typeof resource?.id === 'string' ? resource.id : '<unknown resource>';
    for (const field of Object.keys(resource ?? {})) if (!resourceFields.has(field)) fail(id, `unknown physical resource field ${field}`);
    if (!/^resource:[a-z0-9][a-z0-9-]*$/.test(id) || resourceIds.has(id)) fail(id, 'resource ID must be stable and unique');
    resourceIds.add(id);
    if (typeof resource?.textureKey !== 'string' || !resource.textureKey || textureKeys.has(resource.textureKey)) fail(id, 'textureKey must be present and unique');
    textureKeys.add(resource?.textureKey);
    if (resource?.sampling !== 'nearest' && resource?.sampling !== 'linear') fail(id, 'sampling must be nearest or linear');
    const load = resource?.load;
    if (!load || !['image', 'spritesheet', 'atlas'].includes(load.type)) { fail(id, 'unsupported or missing load type'); continue; }
    for (const field of Object.keys(load)) if (!resourceLoadFields.has(field)) fail(id, `unknown physical load field ${field}`);
    if (typeof load.imageUrl !== 'string' || !/^assets\/[a-z0-9][a-z0-9/-]*\.png$/.test(load.imageUrl)) { fail(id, 'invalid production PNG URL'); continue; }
    if (imageUrls.has(load.imageUrl)) fail(id, 'duplicate physical PNG identity; share one resource instead');
    imageUrls.add(load.imageUrl);
    const chain = resolveProductionChain(manifest.root, resource);
    if (resource.production?.sourceUrl !== undefined && resource.production.sourceUrl !== chain.sourceUrl) fail(id, 'editable source/export path mismatch');
    if (resource.production?.builderPath !== undefined && resource.production.builderPath !== chain.builderUrl) fail(id, 'builder/export path mismatch');
    for (const [label, path] of [['PNG export', chain.exportPath], ['editable Pixelorama source', chain.sourcePath], ['deterministic builder', chain.builderPath]]) {
      if (!existsSync(path)) fail(id, `missing ${label}: ${relative(manifest.root, path)}`);
    }
    const dimensions = pngDimensions(chain.exportPath, errors, id);
    if (!dimensions) continue;
    // Every physical export, including an atlas, has one editable-source
    // metadata record. Validate provenance once per resource before resolving
    // logical frames; atlas bindings must not bypass source normalization.
    const metadata = readJson(chain.metadataPath, errors, id);
    if (!metadata) continue;
    if (metadata.export_directory_path !== '') fail(id, 'metadata export_directory_path must be normalized to an empty string');
    if (metadata.export_file_name !== chain.exportName) fail(id, `metadata export_file_name must be "${chain.exportName}"`);
    const notes = Array.isArray(metadata.layers) ? metadata.layers.find((layer) => layer?.name === 'notes') : undefined;
    if (notes !== undefined && notes.visible !== false) fail(id, 'notes layer must be hidden from production exports');
    if (load.type === 'atlas') {
      if (typeof load.dataUrl !== 'string' || !/^assets\/[a-z0-9][a-z0-9/.-]*\.json$/.test(load.dataUrl)) { fail(id, 'atlas requires a valid dataUrl'); continue; }
      const atlasPath = `${manifest.root}/public/${load.dataUrl}`;
      if (!existsSync(atlasPath)) { fail(id, `missing atlas metadata: ${relative(manifest.root, atlasPath)}`); continue; }
      const atlas = readJson(atlasPath, errors, id); const names = new Set(); const rectangles = [];
      for (const { name, rect } of atlasFrames(atlas)) {
        if (typeof name !== 'string' || !name || names.has(name)) { fail(id, `duplicate or invalid atlas frame identity ${String(name)}`); continue; }
        names.add(name);
        const { x, y, w, h } = rect ?? {};
        if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > dimensions.width || y + h > dimensions.height) fail(id, `atlas frame ${name} is outside PNG bounds`);
        else rectangles.push({ name, x, y, w, h });
      }
      for (let a = 0; a < rectangles.length; a += 1) for (let b = a + 1; b < rectangles.length; b += 1) {
        const left = rectangles[a]; const right = rectangles[b];
        if (left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y) fail(id, `atlas frames ${left.name} and ${right.name} overlap`);
      }
      resource._validatedAtlasFrames = names; // validator-local cache; never written back to data.
      continue;
    }
    if (load.type === 'image') {
      if (metadata.size_x !== dimensions.width || metadata.size_y !== dimensions.height) fail(id, `image metadata size ${metadata.size_x}x${metadata.size_y} does not match PNG ${dimensions.width}x${dimensions.height}`);
      if (!Array.isArray(metadata.frames) || metadata.frames.length !== 1) fail(id, 'static image source must contain exactly one frame');
    } else {
      const { frameWidth, frameHeight } = load;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) { fail(id, 'spritesheet requires integer frame dimensions'); continue; }
      if (metadata.size_x !== frameWidth || metadata.size_y !== frameHeight) fail(id, `metadata frame size ${metadata.size_x}x${metadata.size_y} does not match resource ${frameWidth}x${frameHeight}`);
      if (dimensions.height !== frameHeight || dimensions.width % frameWidth !== 0) fail(id, `PNG ${dimensions.width}x${dimensions.height} is not a horizontal ${frameWidth}x${frameHeight} spritesheet`);
      else if (!Array.isArray(metadata.frames) || metadata.frames.length !== dimensions.width / frameWidth) fail(id, 'metadata frame count does not match PNG frame count');
      resource._validatedMetadata = metadata; resource._validatedFrameCount = dimensions.width / frameWidth;
    }
  }

  for (const binding of bindings) {
    const id = typeof binding?.id === 'string' ? binding.id : '<unknown binding>';
    for (const field of Object.keys(binding ?? {})) if (!bindingFields.has(field)) fail(id, `unknown logical binding field ${field}`);
    if (!/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/.test(id) || ids.has(id)) fail(id, 'logical art ID must be stable and unique');
    ids.add(id);
    if (!legalKinds.has(binding?.kind)) fail(id, `unsupported renderer kind ${String(binding?.kind)}`);
    if (binding?.required !== true && binding?.required !== false) fail(id, 'required must be boolean');
    if (!binding?.display || !Number.isFinite(binding.display.width) || !Number.isFinite(binding.display.height) || binding.display.width <= 0 || binding.display.height <= 0) fail(id, 'display requires positive dimensions');
    if (binding?.clips !== undefined) {
      if (!binding.clips || typeof binding.clips !== 'object' || Array.isArray(binding.clips)) fail(id, 'clips must be an object');
      else for (const [name, clip] of Object.entries(binding.clips)) {
        if (!/^[a-z][a-z0-9-]*$/.test(name) || !clip || typeof clip !== 'object' || Array.isArray(clip)) { fail(id, `invalid clip ${name}`); continue; }
        for (const field of Object.keys(clip)) if (!clipFields.has(field)) fail(id, `clip ${name} has unknown field ${field}`);
        if (!Number.isInteger(clip.start) || !Number.isInteger(clip.end) || clip.start < 0 || clip.end < clip.start || !Number.isFinite(clip.frameRate) || clip.frameRate <= 0 || (clip.repeat !== -1 && clip.repeat !== 0)) fail(id, `invalid clip ${name}`);
      }
    }
    for (const stale of ['url', 'load', 'textureKey', 'sampling', 'source', 'builder', 'width', 'height']) if (Object.hasOwn(binding ?? {}, stale)) fail(id, `obsolete physical field ${stale} is not allowed on a logical binding`);
    const resource = byId.get(binding?.resourceId);
    if (!resource) { fail(id, `resourceId ${String(binding?.resourceId)} does not resolve exactly once`); continue; }
    references.add(resource.id);
    const animatedKind = binding.kind === 'character' || binding.kind === 'enemy';
    if (animatedKind && resource.load?.type !== 'spritesheet') fail(id, `${binding.kind} bindings require a spritesheet resource`);
    if (binding.frameKey !== undefined) {
      if (resource.load?.type !== 'atlas') fail(id, 'named frame requires an atlas resource');
      else if (!resource._validatedAtlasFrames?.has(binding.frameKey)) fail(id, `named atlas frame ${binding.frameKey} does not exist`);
    } else if (resource.load?.type === 'atlas') fail(id, 'atlas resource requires a named frame');
    if (binding.clips !== undefined) {
      if (resource.load?.type !== 'spritesheet') fail(id, 'logical clips require a spritesheet resource');
      const tags = new Map((resource._validatedMetadata?.tags ?? []).map((tag) => [tag.name, tag]));
      for (const [name, clip] of Object.entries(binding.clips)) {
        if (!Number.isInteger(clip?.start) || !Number.isInteger(clip?.end) || clip.start < 0 || clip.end < clip.start || clip.end >= resource._validatedFrameCount) fail(id, `clip ${name} is outside physical frame count`);
        const tag = tags.get(name); if (!tag) fail(id, `metadata is missing declared clip tag ${name}`);
        else if (tag.from !== clip.start + 1 || tag.to !== clip.end + 1) fail(id, `clip ${name} does not match Pixelorama tag range`);
      }
    }
  }
  for (const resource of resources) if (!references.has(resource.id)) fail(resource.id, 'stale physical resource is not referenced by a logical binding');
  if (errors.length) return { ok: false, errors, bindingCount: bindings.length, resourceCount: resources.length };
  return { ok: true, errors: [], bindingCount: bindings.length, resourceCount: resources.length };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const result = validateVisualManifest();
  if (!result.ok) { console.error(`Visual art validation failed:\n${result.errors.map((error) => `- ${error}`).join('\n')}`); process.exitCode = 1; }
  else console.log(`Validated ${result.bindingCount} logical bindings and ${result.resourceCount} physical visual resources.`);
}
