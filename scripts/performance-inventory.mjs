#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);

function argumentValue(name) {
  const index = argumentsList.indexOf(name);
  if (index < 0) return undefined;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (!['--dist', '--out'].includes(argument)) throw new Error(`Unknown option or unexpected argument: ${argument}`);
  if (!argumentsList[index + 1] || argumentsList[index + 1].startsWith('--')) {
    throw new Error(`${argument} requires a value`);
  }
  index += 1;
}

const distArgument = argumentValue('--dist');
if (distArgument && !isAbsolute(distArgument)) throw new Error('--dist must be an absolute path');
const distRoot = distArgument ? resolve(distArgument) : join(repositoryRoot, 'dist');
const outputArgument = argumentValue('--out');
const outputPath = outputArgument ? resolve(outputArgument) : undefined;

function jsonFile(path) {
  return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function compress(buffer) {
  return {
    bytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: 9, mtime: 0 }).length,
    brotliBytes: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
    sha256: sha256(buffer),
  };
}

function checkedDistPath(urlPath) {
  if (typeof urlPath !== 'string' || urlPath.length === 0 || urlPath.includes('\\')) {
    throw new Error(`Invalid asset URL in manifest: ${String(urlPath)}`);
  }
  const resolved = resolve(distRoot, urlPath.replace(/^\/+/, ''));
  const fromDist = relative(distRoot, resolved);
  if (fromDist === '..' || fromDist.startsWith(`..${sep}`) || isAbsolute(fromDist)) {
    throw new Error(`Asset URL escapes the dist directory: ${urlPath}`);
  }
  return resolved;
}

const measuredFiles = new Map();
function measureDistFile(urlPath) {
  if (measuredFiles.has(urlPath)) return measuredFiles.get(urlPath);
  const diskPath = checkedDistPath(urlPath);
  const measured = { urlPath: `/${urlPath.replace(/^\/+/, '')}`, ...compress(readFileSync(diskPath)) };
  measuredFiles.set(urlPath, measured);
  return measured;
}

function sumFiles(files) {
  const unique = new Map(files.map((file) => [file.urlPath, file]));
  const entries = [...unique.values()];
  return {
    fileCount: entries.length,
    bytes: entries.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: entries.reduce((sum, file) => sum + file.gzipBytes, 0),
    brotliBytes: entries.reduce((sum, file) => sum + file.brotliBytes, 0),
    files: entries.sort((a, b) => a.urlPath.localeCompare(b.urlPath)),
  };
}

function urlsForResource(resource) {
  const load = resource.load;
  return [load.imageUrl, ...(load.dataUrl ? [load.dataUrl] : [])];
}

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return undefined;
  let position = 12;
  let format;
  let dataBytes = 0;
  while (position + 8 <= buffer.length) {
    const id = buffer.toString('ascii', position, position + 4);
    const size = buffer.readUInt32LE(position + 4);
    const content = position + 8;
    if (content + size > buffer.length) break;
    if (id === 'fmt ' && size >= 16) {
      format = {
        formatCode: buffer.readUInt16LE(content),
        channels: buffer.readUInt16LE(content + 2),
        sampleRate: buffer.readUInt32LE(content + 4),
        byteRate: buffer.readUInt32LE(content + 8),
        blockAlign: buffer.readUInt16LE(content + 12),
        bitsPerSample: buffer.readUInt16LE(content + 14),
      };
    }
    if (id === 'data') dataBytes = size;
    position = content + size + (size % 2);
  }
  if (!format || format.byteRate === 0) return undefined;
  return { ...format, dataBytes, durationSeconds: Number((dataBytes / format.byteRate).toFixed(6)) };
}

function publicSourceHash(path) {
  return sha256(readFileSync(join(repositoryRoot, path)));
}

const buildMeta = JSON.parse(readFileSync(join(distRoot, 'build-meta.json'), 'utf8'));
const sourceCommit = git(['rev-parse', 'HEAD']);
const comparisonPaths = buildMeta.commit && sourceCommit && buildMeta.commit !== sourceCommit
  ? git(['diff', '--name-only', buildMeta.commit, sourceCommit])?.split('\n').filter(Boolean) ?? []
  : [];
const workingTreePaths = gitLines(['status', '--porcelain']).map((line) => line.slice(3));

const visualResources = jsonFile('src/data/visual-resources.json');
const artBindings = jsonFile('src/data/visual-art.json').bindings;
const bundleDefinitions = jsonFile('src/data/asset-bundles.json');
const audioManifest = jsonFile('src/data/audio-assets.json');
const resourceById = new Map(visualResources.map((resource) => [resource.id, resource]));

if (resourceById.size !== visualResources.length) throw new Error('Duplicate visual resource IDs found');
for (const bundle of bundleDefinitions) {
  for (const resourceId of bundle.resourceIds) {
    if (!resourceById.has(resourceId)) throw new Error(`${bundle.id} references missing ${resourceId}`);
  }
}

const allResourceFiles = [];
const physicalResources = visualResources.map((resource) => {
  const files = urlsForResource(resource).map(measureDistFile);
  allResourceFiles.push(...files);
  return {
    id: resource.id,
    textureKey: resource.textureKey,
    sampling: resource.sampling,
    type: resource.load.type,
    files,
  };
});
const physicalById = new Map(physicalResources.map((resource) => [resource.id, resource]));

const assetBundles = bundleDefinitions.map((bundle) => {
  const resources = bundle.resourceIds.map((id) => physicalById.get(id));
  return {
    id: bundle.id,
    physicalResourceCount: resources.length,
    uniqueTextureKeyCount: new Set(resources.map((resource) => resource.textureKey)).size,
    ...sumFiles(resources.flatMap((resource) => resource.files)),
    resources,
  };
});

const allVisualFiles = sumFiles(allResourceFiles);
const audioFiles = [...audioManifest.sfx, ...audioManifest.music].map((asset) => {
  const file = measureDistFile(asset.url);
  const diskPath = checkedDistPath(asset.url);
  return { key: asset.key, type: audioManifest.sfx.includes(asset) ? 'sfx' : 'music', ...file, wav: parseWav(readFileSync(diskPath)) };
});
const audioSummary = {
  sfxCount: audioManifest.sfx.length,
  musicCount: audioManifest.music.length,
  bytes: audioFiles.reduce((sum, file) => sum + file.bytes, 0),
  durationSeconds: Number(audioFiles.reduce((sum, file) => sum + (file.wav?.durationSeconds ?? 0), 0).toFixed(6)),
  files: audioFiles,
};

const fontCss = readFileSync(join(repositoryRoot, 'src/styles.css'), 'utf8');
const mainSource = readFileSync(join(repositoryRoot, 'src/main.ts'), 'utf8');
const fontUrlMatch = fontCss.match(/src:\s*url\(["']?([^"')]+)["']?\)\s*format\(["']woff2["']\)/);
const fontWeightMatch = fontCss.match(/font-weight:\s*([\d ]+);/);
const fontPreloadWeights = [...mainSource.matchAll(/document\.fonts\.load\(['"](\d+)\s+16px\s+"Nunito"['"]\)/g)]
  .map((match) => Number(match[1]));
const fontUrl = fontUrlMatch?.[1]?.replace(/^\//, '');
const fontRecord = fontUrl ? measureDistFile(fontUrl) : undefined;

const html = readFileSync(join(distRoot, 'index.html'), 'utf8');
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const preloadSources = [...html.matchAll(/<link\b(?=[^>]*\brel=["']modulepreload["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const stylesheets = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const fontPreloads = [...html.matchAll(/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']font["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const entryUrl = scriptSources[0];
const entryPath = entryUrl?.replace(/^\//, '');
const entryText = entryPath ? readFileSync(checkedDistPath(entryPath), 'utf8') : '';
const staticImports = [...entryText.matchAll(/(?:from|import\()\s*["']([^"']+\.js)["']/g)]
  .map((match) => match[1]);

const distFilePaths = [];
function visitDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) visitDirectory(fullPath);
    else if (entry.isFile()) distFilePaths.push(fullPath);
  }
}
visitDirectory(distRoot);
const distFiles = distFilePaths.map((path) => {
  const urlPath = relative(distRoot, path).split(sep).join('/');
  return { urlPath: `/${urlPath}`, ...compress(readFileSync(path)) };
});
const distSummary = {
  fileCount: distFiles.length,
  bytes: distFiles.reduce((sum, file) => sum + file.bytes, 0),
  gzipBytes: distFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
  brotliBytes: distFiles.reduce((sum, file) => sum + file.brotliBytes, 0),
  files: distFiles.sort((a, b) => a.urlPath.localeCompare(b.urlPath)),
};

const bootBundle = assetBundles.find((bundle) => bundle.id === 'bundle:boot-core');
const sourceFiles = [
  'src/data/visual-art.json',
  'src/data/visual-resources.json',
  'src/data/asset-bundles.json',
  'src/data/audio-assets.json',
  'src/scenes/BootScene.ts',
  'src/scenes/MenuScene.ts',
  'src/scenes/GameScene.ts',
  'src/systems/resourceLoader.ts',
  'src/systems/audio.ts',
  'src/main.ts',
  'src/styles.css',
];

const report = {
  format: 'meowcenary-performance-inventory-v1',
  generatedAt: new Date().toISOString(),
  source: {
    repositoryRoot,
    commit: sourceCommit,
    dirtyPaths: workingTreePaths,
    comparedWithBuildCommit: buildMeta.commit,
    pathsChangedSinceBuild: comparisonPaths,
    sourceFileSha256: Object.fromEntries(sourceFiles.map((path) => [path, publicSourceHash(path)])),
  },
  build: {
    distRoot,
    buildMeta,
    shaMatchesSourceHead: Boolean(sourceCommit && buildMeta.commit === sourceCommit),
    entryScriptUrls: scriptSources,
    modulePreloadUrls: preloadSources,
    stylesheetUrls: stylesheets,
    fontPreloadUrls: fontPreloads,
    appStaticImports: staticImports,
    appAndEngineChunks: [
      ...scriptSources,
      ...preloadSources,
      ...stylesheets,
    ].map((url) => {
      const file = measureDistFile(url.replace(/^\//, ''));
      return { url, ...file };
    }),
    fullDist: distSummary,
  },
  identityCounts: {
    logicalVisualArtBindings: artBindings.length,
    physicalVisualResourceEntries: visualResources.length,
    uniquePhaserTextureKeys: new Set(visualResources.map((resource) => resource.textureKey)).size,
    uniqueVisualAssetUrls: allVisualFiles.fileCount,
    productionDistFiles: distSummary.fileCount,
    interpretation: 'Art binding IDs are logical menu/game references; visual-resource entries map those to physical Phaser textures; atlas image and atlas JSON are separate asset URLs; built files are not equivalent to files fetched on an ordinary Home visit.',
  },
  boot: {
    source: 'src/scenes/BootScene.ts',
    sourceBehavior: 'Queues every audio-manifest SFX/music entry at Boot and only bundle:boot-core visual resources.',
    visualBundle: bootBundle,
    audioCount: audioFiles.length,
    audioRawBytes: audioSummary.bytes,
    font: fontRecord ? {
      url: `/${fontUrl}`,
      ...fontRecord,
      cssWeightRange: fontWeightMatch?.[1]?.trim().replace(/\s+/g, ' '),
      preloadedWeightsBeforeGameConstruction: fontPreloadWeights,
      sourceWait: 'Promise.all(document.fonts.load(...)) before Phaser.Game construction in src/main.ts',
    } : undefined,
  },
  assetBundles,
  allPhysicalVisualResources: physicalResources,
  allVisualAssets: allVisualFiles,
  runResourceScope: {
    source: 'src/systems/resourceLoader.ts:212-291',
    derivation: 'Chosen character and ability; selected arena floors, boundary, decor, obstacle/hazard skins; encounter and boss actors plus recursively reachable child actors; every weapon held/projectile/icon art; all drop kinds; upgrade icons; achievement icons.',
    policy: 'Required logical art bindings are resolved to physical resources and de-duplicated by resource ID before load.',
  },
  menuResourceScopes: {
    source: 'src/scenes/MenuScene.ts:2029-2245',
    policy: 'Lazy panel-specific closure. Requests are de-duplicated by resource ID, serialized on the scene loader, guarded by generation/liveness, and repaint only after loaded art settles.',
    scopes: [
      { panel: 'home', inputs: 'selected backdrop, character portrait, home command icons, threat preview actor art' },
      { panel: 'character', inputs: 'data-owned roster portrait and weapon icon art' },
      { panel: 'loadout', inputs: 'selected character/starting weapon, navigation icons, common native chrome, equipped-item/set art, Gunsmith art required by summary' },
      { panel: 'equipment', inputs: 'visible equipped item icons/set emblems plus return/navigation icons' },
      { panel: 'gunsmith', inputs: 'family/build and part icons needed by current snapshot' },
      { panel: 'achievements/career/compendium/training', inputs: 'requested catalog badge, actor, or training art' },
    ],
  },
  audio: audioSummary,
  compression: {
    method: 'Node zlib gzip level 9 and Brotli quality 11, independently per file then summed.',
    limitation: 'These are reproducible local compression estimates, not CDN response headers, HTTP transfer sizes, cache behavior, or cold-start measurements. PNG/WOFF2 are already compressed formats and can slightly grow under recompression.',
  },
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, serialized);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    sourceCommit,
    buildCommit: buildMeta.commit,
    shaMatchesSourceHead: report.build.shaMatchesSourceHead,
    logicalArtBindings: artBindings.length,
    physicalResources: visualResources.length,
    distinctAssetUrls: allVisualFiles.fileCount,
    distFileCount: distSummary.fileCount,
  })}\n`);
} else {
  process.stdout.write(serialized);
}
