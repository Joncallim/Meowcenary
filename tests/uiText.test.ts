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

  it('finds a standalone qualified Phaser Text constructor', () => {
    const qualified = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      new PhaserAlias.GameObjects.Text(scene, 0, 0, 'qualified direct');
    `;

    const qualifiedPath = join(process.cwd(), 'virtual-ui-text-qualified.ts');
    expect(findForbiddenPhaserTextCreation(new Map([[qualifiedPath, qualified]])))
      .toEqual([`${qualifiedPath}:4`]);
  });

  it('finds a standalone alias for the Phaser Text constructor', () => {
    const aliased = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      const TextConstructor = PhaserAlias.GameObjects.Text;
      new TextConstructor(scene, 0, 0, 'aliased direct');
    `;

    const aliasedPath = join(process.cwd(), 'virtual-ui-text-alias.ts');
    expect(findForbiddenPhaserTextCreation(new Map([[aliasedPath, aliased]])))
      .toEqual([`${aliasedPath}:5`]);
  });

  it('finds a standalone Text factory invoked through Function.call', () => {
    const callWrapped = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      scene.add.text.call(scene.add, 0, 0, 'call');
    `;
    const path = join(process.cwd(), 'virtual-ui-text-call.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, callWrapped]])))
      .toEqual([`${path}:4`]);
  });

  it('finds a standalone Text factory invoked through Function.apply', () => {
    const applyWrapped = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      scene.add.text.apply(scene.add, [0, 0, 'apply']);
    `;
    const path = join(process.cwd(), 'virtual-ui-text-apply.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, applyWrapped]])))
      .toEqual([`${path}:4`]);
  });

  it('finds a standalone Text factory invoked through Reflect.apply', () => {
    const reflectApply = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      Reflect.apply(scene.add.text, scene.add, [0, 0, 'reflect apply']);
    `;
    const path = join(process.cwd(), 'virtual-ui-text-reflect-apply.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, reflectApply]])))
      .toEqual([`${path}:4`]);
  });

  it('finds a standalone Text constructor invoked through Reflect.construct', () => {
    const reflectConstruct = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      Reflect.construct(PhaserAlias.GameObjects.Text, [scene, 0, 0, 'reflect construct']);
    `;
    const path = join(process.cwd(), 'virtual-ui-text-reflect-construct.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, reflectConstruct]])))
      .toEqual([`${path}:4`]);
  });

  it('finds a standalone Text factory invoked through a bound function', () => {
    const bound = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      scene.add.text.bind(scene.add)(0, 0, 'bind');
    `;
    const path = join(process.cwd(), 'virtual-ui-text-bind.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, bound]])))
      .toEqual([`${path}:4`]);
  });

  it('allows only the exact central factory node when text.ts contains a second constructor', () => {
    const secondConstructor = `
      import Phaser from 'phaser';
      export function createUiText(scene: Phaser.Scene) {
        return scene.add.text(0, 0, 'allowed', { resolution: 2 });
      }
      declare const secondScene: Phaser.Scene;
      secondScene.add.text(0, 0, 'forbidden');
    `;

    expect(findForbiddenPhaserTextCreation(new Map([[UI_TEXT_FILE, secondConstructor]])))
      .toEqual([`${UI_TEXT_FILE}:7`]);
  });

  it('uses conservative syntax fallback for unresolved any-cast text factories', () => {
    const anyFactories = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      (scene as any).add.text(0, 0, 'property');
      (scene as any).add['text'](0, 0, 'computed');
    `;
    const path = join(process.cwd(), 'virtual-ui-text-any-factories.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, anyFactories]])))
      .toEqual([`${path}:4`, `${path}:5`]);
  });

  it('uses conservative syntax fallback for direct and aliased any-cast Text constructors', () => {
    const anyConstructors = `
      import PhaserAlias from 'phaser';
      declare const scene: PhaserAlias.Scene;
      new (PhaserAlias as any).GameObjects.Text(scene, 0, 0, 'direct');
      const AnyText = (PhaserAlias as any).GameObjects.Text;
      new AnyText(scene, 0, 0, 'aliased');
    `;
    const path = join(process.cwd(), 'virtual-ui-text-any-constructors.ts');

    expect(findForbiddenPhaserTextCreation(new Map([[path, anyConstructors]])))
      .toEqual([`${path}:4`, `${path}:6`]);
  });

  it('migrates every symbol-resolved production site through the sole centralized constructor', () => {
    const files = sourceFiles(SOURCE_ROOT);
    const audit = auditPhaserTextCreation();
    expect(audit.forbidden).toEqual([]);
    expect(audit.allowlisted).toEqual([`${UI_TEXT_FILE}:15`]);

    const program = createProgram(files, new Map());
    const checker = program.getTypeChecker();
    const migratedSites = files
      .filter((file) => resolve(file) !== UI_TEXT_FILE)
      .flatMap((file) => findCreateUiTextCalls(programSourceFile(program, file), checker));
    expect(migratedSites).toHaveLength(38);

    const constructorCalls = findCreateUiTextCalls(programSourceFile(program, UI_TEXT_FILE), checker);
    expect(constructorCalls).toHaveLength(0);
    expect(readFileSync(UI_TEXT_FILE, 'utf8')).toMatch(/\.text\s*\(/);
  }, 15_000);
});

/** Type-aware source audit with a conservative syntax fallback. Every source,
 * including text.ts, is scanned; exactly one direct return call in the
 * createUiText factory is allowlisted by AST shape rather than by file. */
function findForbiddenPhaserTextCreation(extraSources = new Map<string, string>()): string[] {
  return auditPhaserTextCreation(extraSources).forbidden;
}

function auditPhaserTextCreation(extraSources = new Map<string, string>()): {
  readonly forbidden: string[];
  readonly allowlisted: string[];
} {
  const files = extraSources.size > 0 ? [...extraSources.keys()] : sourceFiles(SOURCE_ROOT);
  if (files.length === 0) return { forbidden: [], allowlisted: [] };
  const program = createProgram(files, extraSources);
  const checker = program.getTypeChecker();
  const forbidden: string[] = [];
  const allowlisted: string[] = [];

  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) throw new Error(`audit source missing: ${file}`);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isTextFactoryCreation(node, checker)) {
        const nodeLocation = location(sourceFile, node);
        if (isExactCreateUiTextFactoryNode(node, sourceFile)) {
          allowlisted.push(nodeLocation);
        } else {
          forbidden.push(nodeLocation);
        }
      }
      if (ts.isNewExpression(node) && isTextConstructorCreation(node, checker)) {
        forbidden.push(location(sourceFile, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { forbidden, allowlisted };
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

function isTextFactoryCreation(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  return isPhaserTextFactoryCall(node, checker)
    || expressionResolvesToMember(node.expression, 'text', checker, false)
    || isWrappedTextCreation(node, checker);
}

function isWrappedTextCreation(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const invoked = unwrapExpression(node.expression);
  const memberName = accessedMemberName(invoked);
  const receiver = accessedMemberReceiver(invoked);

  if (
    receiver !== undefined
    && (memberName === 'call' || memberName === 'apply')
    && expressionResolvesToMember(receiver, 'text', checker, false)
  ) {
    return true;
  }

  const target = node.arguments[0];
  if (target === undefined) return false;
  if (isReflectMethod(invoked, 'apply')) {
    return expressionResolvesToMember(target, 'text', checker, false);
  }
  return isReflectMethod(invoked, 'construct')
    && expressionResolvesToMember(target, 'Text', checker, true);
}

function isReflectMethod(expression: ts.Expression, expectedName: 'apply' | 'construct'): boolean {
  if (accessedMemberName(expression) !== expectedName) return false;
  const receiver = accessedMemberReceiver(expression);
  if (receiver === undefined) return false;
  const unwrappedReceiver = unwrapExpression(receiver);
  return ts.isIdentifier(unwrappedReceiver) && unwrappedReceiver.text === 'Reflect';
}

function isTextConstructorCreation(node: ts.NewExpression, checker: ts.TypeChecker): boolean {
  return isPhaserTextInstance(node, checker)
    || expressionResolvesToMember(node.expression, 'Text', checker, true);
}

function isExactCreateUiTextFactoryNode(node: ts.CallExpression, source: ts.SourceFile): boolean {
  if (resolve(source.fileName) !== UI_TEXT_FILE) return false;
  const expression = unwrapExpression(node.expression);
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'text') return false;
  const addAccess = unwrapExpression(expression.expression);
  if (!ts.isPropertyAccessExpression(addAccess) || addAccess.name.text !== 'add') return false;
  const receiver = unwrapExpression(addAccess.expression);
  if (!ts.isIdentifier(receiver) || receiver.text !== 'scene') return false;
  if (!ts.isReturnStatement(node.parent) || node.parent.expression !== node) return false;
  const block = node.parent.parent;
  if (!ts.isBlock(block) || block.statements.length !== 1 || block.statements[0] !== node.parent) return false;
  const factory = block.parent;
  return ts.isFunctionDeclaration(factory)
    && factory.name?.text === 'createUiText'
    && factory.parameters[0]?.name.getText(source) === 'scene';
}

function expressionResolvesToMember(
  input: ts.Expression,
  expectedName: 'text' | 'Text',
  checker: ts.TypeChecker,
  allowRawIdentifier: boolean,
  seen = new Set<ts.Symbol>(),
): boolean {
  const expression = unwrapExpression(input);
  const memberName = accessedMemberName(expression);
  if (memberName === expectedName) return true;
  if (!ts.isIdentifier(expression)) return false;
  if (allowRawIdentifier && expression.text === expectedName) return true;

  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || seen.has(symbol)) return false;
  seen.add(symbol);
  return symbol.declarations?.some((declaration) => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return expressionResolvesToMember(
        declaration.initializer,
        expectedName,
        checker,
        allowRawIdentifier,
        seen,
      );
    }
    if (ts.isBindingElement(declaration)) {
      const boundName = declaration.propertyName ?? declaration.name;
      return (ts.isIdentifier(boundName) || ts.isStringLiteral(boundName))
        && boundName.text === expectedName;
    }
    return false;
  }) === true;
}

function unwrapExpression(input: ts.Expression): ts.Expression {
  let expression = input;
  while (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function accessedMemberName(expression: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (!ts.isElementAccessExpression(expression)) return undefined;
  const argument = expression.argumentExpression && unwrapExpression(expression.argumentExpression);
  return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ? argument.text
    : undefined;
}

function accessedMemberReceiver(expression: ts.Expression): ts.Expression | undefined {
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
    ? expression.expression
    : undefined;
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

function findCreateUiTextCalls(source: ts.SourceFile, checker: ts.TypeChecker): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && resolvesToCreateUiText(node.expression, checker)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function resolvesToCreateUiText(input: ts.Expression, checker: ts.TypeChecker): boolean {
  const expression = unwrapExpression(input);
  if (!ts.isIdentifier(expression)) return false;
  const symbol = checker.getSymbolAtLocation(expression);
  if (symbol === undefined) return false;
  const resolvedSymbol = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolvedSymbol.declarations?.some((declaration) =>
    ts.isFunctionDeclaration(declaration)
    && declaration.name?.text === 'createUiText'
    && resolve(declaration.getSourceFile().fileName) === UI_TEXT_FILE
  ) === true;
}

function programSourceFile(program: ts.Program, file: string): ts.SourceFile {
  const source = program.getSourceFile(file);
  if (source === undefined) throw new Error(`audit source missing: ${file}`);
  return source;
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
