import { readFile, writeFile } from 'node:fs/promises';

const [path] = process.argv.slice(2);
if (!path) {
  throw new Error('Usage: node normalize-pixelorama-metadata.mjs <metadata.json>');
}

const metadata = JSON.parse(await readFile(path, 'utf8'));

// Pixelorama records the machine-specific absolute output directory when the
// CLI's --output option is used. It has no runtime meaning and would make the
// checked-in metadata differ between developers, so keep the field but remove
// the workstation path after Pixelorama has authored the JSON.
metadata.export_directory_path = '';

await writeFile(path, `${JSON.stringify(metadata)}\n`);
