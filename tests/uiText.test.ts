import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

describe('createUiText', () => {
  it('forces UI text resolution to 2 after caller style merging', async () => {
    const created = { marker: 'text' };
    const text = vi.fn(() => created);
    const { UI_TEXT_RESOLUTION, createUiText } = await import('../src/ui/text');

    expect(createUiText({ add: { text } } as never, 10, 20, 'Sharp', {
      color: '#ffffff',
      resolution: 1,
    })).toBe(created);
    expect(UI_TEXT_RESOLUTION).toBe(2);
    expect(text).toHaveBeenCalledWith(10, 20, 'Sharp', { color: '#ffffff', resolution: 2 });
  });

  it('migrates exactly 28 production sites through the sole centralized constructor', () => {
    const root = join(process.cwd(), 'src');
    const files = sourceFiles(root);
    const bypasses = files
      .filter((file) => !file.endsWith(join('ui', 'text.ts')))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        // `\s*` catches factory chains split over multiple lines, while the
        // second branch catches both `new Text` and Phaser-qualified forms.
        return /\.text\s*\(|new\s+(?:Phaser\.GameObjects\.)?Text\b/.test(source) ? [file] : [];
      });
    expect(bypasses).toEqual([]);

    const constructorSource = readFileSync(join(root, 'ui', 'text.ts'), 'utf8');
    const constructorMatches = constructorSource.match(/\.text\s*\(/g) ?? [];
    expect(constructorMatches).toHaveLength(1);

    const migratedSites = files
      .filter((file) => !file.endsWith(join('ui', 'text.ts')))
      .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/createUiText\s*\(/g)]);
    expect(migratedSites).toHaveLength(28);
  });
});

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    return entry.isDirectory() ? sourceFiles(next) : entry.name.endsWith('.ts') ? [next] : [];
  });
}
