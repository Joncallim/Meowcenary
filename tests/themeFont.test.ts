import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeFont } from '../src/ui/theme';

describe('production UI typeface', () => {
  it('uses the self-hosted Nunito face throughout Phaser and the document shell', () => {
    const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const shell = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const entry = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

    expect(ThemeFont.family).toMatch(/^"Nunito"/);
    expect(styles).toContain('font-family: "Nunito"');
    expect(styles).toContain('/assets/fonts/nunito-latin-variable.woff2');
    expect(shell).toContain('rel="preload" href="/assets/fonts/nunito-latin-variable.woff2"');
    expect(entry).toContain('document.fonts.load');
    expect(existsSync(join(process.cwd(), 'public/assets/fonts/nunito-latin-variable.woff2'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'assets-src/fonts/nunito/OFL.txt'))).toBe(true);
  });
});
