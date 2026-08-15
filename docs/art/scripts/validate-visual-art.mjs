import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const manifestPath = join(root, 'src/data/visual-art.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const errors = [];

function fail(id, message) {
  errors.push(`${id}: ${message}`);
}

function readJson(path, id) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(id, `cannot read metadata ${path.slice(root.length + 1)} (${error.message})`);
    return undefined;
  }
}

function pngDimensions(path, id) {
  try {
    const bytes = readFileSync(path);
    const signature = '89504e470d0a1a0a';
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature ||
        bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
      fail(id, 'export is not a PNG with an IHDR header');
      return undefined;
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } catch (error) {
    fail(id, `cannot read PNG (${error.message})`);
    return undefined;
  }
}

for (const binding of manifest.bindings ?? []) {
  const id = typeof binding.id === 'string' ? binding.id : '<unknown binding>';
  const publicPath = join(root, 'public', binding.url ?? '');
  const exportName = basename(publicPath, '.png');
  const relativeAssetDirectory = dirname(binding.url ?? '').replace(/^assets\//, '');
  const metadataPath = join(dirname(publicPath), `${exportName}.json`);
  const sourcePath = join(root, 'assets-src', relativeAssetDirectory, 'source', `${exportName}.pxo`);
  const builderPath = join(root, 'docs/art/scripts', `build-${exportName}.lua`);

  for (const [label, path] of [
    ['PNG export', publicPath],
    ['Pixelorama metadata', metadataPath],
    ['editable Pixelorama source', sourcePath],
    ['deterministic builder', builderPath],
  ]) {
    if (!existsSync(path)) fail(id, `missing ${label}: ${path.slice(root.length + 1)}`);
  }
  if (!existsSync(publicPath) || !existsSync(metadataPath)) continue;

  const dimensions = pngDimensions(publicPath, id);
  const metadata = readJson(metadataPath, id);
  if (dimensions === undefined || metadata === undefined) continue;

  if (metadata.export_directory_path !== '') {
    fail(id, 'metadata export_directory_path must be normalized to an empty string');
  }
  if (metadata.export_file_name !== exportName) {
    fail(id, `metadata export_file_name must be "${exportName}"`);
  }
  const notes = Array.isArray(metadata.layers)
    ? metadata.layers.find((layer) => layer?.name === 'notes')
    : undefined;
  if (notes !== undefined && notes.visible !== false) {
    fail(id, 'notes layer must be hidden from production exports');
  }

  if (binding.load?.type === 'image') {
    if (metadata.size_x !== dimensions.width || metadata.size_y !== dimensions.height) {
      fail(id, `image metadata size ${metadata.size_x}x${metadata.size_y} does not match PNG ${dimensions.width}x${dimensions.height}`);
    }
    if (!Array.isArray(metadata.frames) || metadata.frames.length !== 1) {
      fail(id, 'static image source must contain exactly one frame');
    }
    continue;
  }

  const frameWidth = binding.load?.frame?.width;
  const frameHeight = binding.load?.frame?.height;
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) continue;
  if (metadata.size_x !== frameWidth || metadata.size_y !== frameHeight) {
    fail(id, `metadata frame size ${metadata.size_x}x${metadata.size_y} does not match manifest ${frameWidth}x${frameHeight}`);
  }
  if (dimensions.height !== frameHeight || dimensions.width % frameWidth !== 0) {
    fail(id, `PNG ${dimensions.width}x${dimensions.height} is not a horizontal ${frameWidth}x${frameHeight} spritesheet`);
    continue;
  }
  const frameCount = dimensions.width / frameWidth;
  if (!Array.isArray(metadata.frames) || metadata.frames.length !== frameCount) {
    fail(id, `metadata frame count ${metadata.frames?.length ?? '<missing>'} does not match PNG frame count ${frameCount}`);
  }
  const tags = new Map((metadata.tags ?? []).map((tag) => [tag.name, tag]));
  for (const [clipName, clip] of Object.entries(binding.clips ?? {})) {
    if (clip.end >= frameCount) {
      fail(id, `clip ${clipName} ends at ${clip.end}, outside ${frameCount} exported frames`);
    }
    const tag = tags.get(clipName);
    if (tag === undefined) {
      fail(id, `metadata is missing declared clip tag ${clipName}`);
    } else if (tag.from !== clip.start + 1 || tag.to !== clip.end + 1) {
      fail(id, `clip ${clipName} range ${clip.start}-${clip.end} does not match metadata tag ${tag.from}-${tag.to}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Visual art validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${manifest.bindings.length} visual-art source/export chains.`);
}
