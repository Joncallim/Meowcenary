import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

const SOURCE_ROOT = join(process.cwd(), 'src');
const UI_TEXT_FILE = resolve(SOURCE_ROOT, 'ui', 'text.ts');

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

  it('uses the type-aware Phaser audit for computed factories and constructor aliases', () => {
    // These calls are all semantically Phaser Text creation even though none
    // contains the old audit's literal `.text(` or `new Phaser...Text` form.
    const adversarial = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      scene.add['text'](0, 0, 'computed');
      scene['add'].text(0, 0, 'computed receiver');
      const factory = scene.add;
      factory['text'](0, 0, 'factory alias');
      const makeText = scene.add.text;
      makeText(0, 0, 'method alias');
      const GameObjectsAlias = PhaserAlias.GameObjects;
      new GameObjectsAlias.Text(scene, 0, 0, 'constructor alias');
      const { Text: TextAlias } = PhaserAlias.GameObjects;
      new TextAlias(scene, 0, 0, 'destructured alias');
    `;

    const adversarialPath = join(process.cwd(), 'virtual-ui-text-audit.ts');
    expect(findForbiddenPhaserTextCreation(new Map([[adversarialPath, adversarial]])))
      .toEqual([
        `${adversarialPath}:4`,
        `${adversarialPath}:5`,
        `${adversarialPath}:7`,
        `${adversarialPath}:9`,
        `${adversarialPath}:11`,
        `${adversarialPath}:13`,
      ]);
  });

  it('migrates exactly 28 production sites through the sole centralized constructor', () => {
    const files = sourceFiles(SOURCE_ROOT);
    expect(findForbiddenPhaserTextCreation()).toEqual([]);

    const migratedSites = files
      .filter((file) => resolve(file) !== UI_TEXT_FILE)
      .flatMap((file) => findCreateUiTextCalls(file));
    expect(migratedSites).toHaveLength(28);

    const constructorCalls = findCreateUiTextCalls(UI_TEXT_FILE);
    expect(constructorCalls).toHaveLength(0);
    expect(readFileSync(UI_TEXT_FILE, 'utf8')).toMatch(/\.text\s*\(/);
  }, 15_000);
});

/** Type-aware source audit. A resolved Phaser factory signature catches
 * bracket/property access and aliases, while a resolved instance type catches
 * constructor aliases. The scan is intentionally limited to production src. */
function findForbiddenPhaserTextCreation(extraSources = new Map<string, string>()): string[] {
  const files = extraSources.size > 0 ? [...extraSources.keys()] : sourceFiles(SOURCE_ROOT);
  // The AST prefilter is conservative for all syntactic routes to Phaser's
  // Text factory/constructor. It avoids initializing a full compiler Program
  // on a clean tree, while every candidate is still decided by the type checker
  // below (aliases are never accepted from spelling alone).
  const candidates = files.filter((file) =>
    resolve(file) !== UI_TEXT_FILE && hasTextCreationSyntax(file, extraSources),
  );
  if (candidates.length === 0) return [];
  const program = createProgram(candidates, extraSources);
  const checker = program.getTypeChecker();
  const forbidden: string[] = [];

  for (const file of candidates) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error(`audit source missing: ${file}`);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isPhaserTextFactoryCall(node, checker)) {
        forbidden.push(location(sourceFile, node));
      }
      if (ts.isNewExpression(node) && isPhaserTextInstance(node, checker)) {
        forbidden.push(location(sourceFile, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return forbidden;
}

function hasTextCreationSyntax(file: string, extraSources: ReadonlyMap<string, string>): boolean {
  const source = ts.createSourceFile(
    file,
    extraSources.get(file) ?? readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isPropertyAccessExpression(node) && node.name.text === 'text')
      || (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'text')
      || (ts.isImportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === 'Text')
      || (ts.isBindingElement(node) && node.propertyName !== undefined
        && ts.isIdentifier(node.propertyName) && node.propertyName.text === 'Text')
      || (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Text')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function createProgram(files: readonly string[], extraSources: ReadonlyMap<string, string>): ts.Program {
  const configPath = join(process.cwd(), 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const virtual = extraSources.get(fileName);
    return virtual === undefined
      ? originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(fileName, virtual, languageVersion, true);
  };
  host.fileExists = (fileName) => extraSources.has(fileName) || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => extraSources.get(fileName) ?? ts.sys.readFile(fileName);
  return ts.createProgram([...files], options, host);
}

function isPhaserTextFactoryCall(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const declaration = checker.getResolvedSignature(node)?.declaration;
  return declaration !== undefined
    && declarationName(declaration) === 'text'
    && isPhaserDeclaration(declaration);
}

function isPhaserTextInstance(node: ts.NewExpression, checker: ts.TypeChecker): boolean {
  const symbol = checker.getTypeAtLocation(node).getSymbol();
  return symbol?.getName() === 'Text'
    && symbol.declarations?.some(isPhaserDeclaration) === true;
}

function declarationName(declaration: ts.Node): string | undefined {
  const name = (declaration as ts.NamedDeclaration).name;
  return name === undefined ? undefined : ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function isPhaserDeclaration(declaration: ts.Node): boolean {
  return /[\\/]node_modules[\\/]phaser[\\/]/.test(declaration.getSourceFile().fileName);
}

function findCreateUiTextCalls(file: string): ts.CallExpression[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createUiText') {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function location(source: ts.SourceFile, node: ts.Node): string {
  return `${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
}

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    return entry.isDirectory() ? sourceFiles(next) : entry.name.endsWith('.ts') ? [next] : [];
  });
}
