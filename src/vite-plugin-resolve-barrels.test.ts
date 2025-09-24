import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveBarrelsPlugin } from './index.js';

global.console.log = jest.fn();

let tmpDir: string;
let origCwd: string;

// Helper function to call plugin methods without context issues
function callPluginMethod(plugin: ReturnType<typeof resolveBarrelsPlugin>, method: 'buildEnd' | 'buildStart'): void;
function callPluginMethod(
  plugin: ReturnType<typeof resolveBarrelsPlugin>,
  method: 'transform',
  code: string,
  id: string
): ReturnType<typeof plugin.transform>;
function callPluginMethod(plugin: ReturnType<typeof resolveBarrelsPlugin>, method: string, ...args: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  return (plugin[method as keyof typeof plugin] as any)(...args);
}

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-barrels-'));
  fs.mkdirSync(path.join(tmpDir, 'src', 'widgets'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'src', 'consumer'), { recursive: true });
});

afterEach(() => {
  try {
    process.chdir(origCwd);
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

test('resolves named import from barrel to file', () => {
  const fooPath = path.join(tmpDir, 'src', 'widgets', 'foo.ts');
  fs.writeFileSync(fooPath, 'export const Component = 42;\n');

  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, "export { Component } from './foo';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { Component } from 'widgets';\nconsole.log(Component);\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);

  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);

  expect(res).not.toBeNull();

  expect(res!.code).toContain("import { Component } from '");
  expect(res!.code).toContain('widgets/foo');

  callPluginMethod(plugin, 'buildEnd');
});

test('keeps original import when symbol not found', () => {
  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, '// empty barrel\n');

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { Bar } from 'widgets';\nconsole.log(Bar);\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);

  // plugin returns a transform even when it doesn't change the import (it replaces with original)
  expect(res).not.toBeNull();
  expect(res!.code).toBe(originalCode);

  callPluginMethod(plugin, 'buildEnd');
});

test('resolves destructured and declared exports via exportMap fallback', () => {
  // create a file with destructured and object exports plus function/class/interface/enum
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  const implPath = path.join(srcDir, 'many.ts');
  const implCode = [
    'export const [A, B] = [1, 2];',
    'export const { C, D } = { C: 3, D: 4 };',
    'export function Fn() {}',
    'export class Cls {}',
    'export interface IVal { a: number }',
    'export enum E { X = 1 }',
  ].join('\n');
  fs.writeFileSync(implPath, `${implCode}\n`);

  // empty index so transform still considers this a barrel
  const indexPath = path.join(srcDir, 'index.ts');
  fs.writeFileSync(indexPath, '// barrel\n');

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'many-consumer.ts');
  const originalCode = "import { A, C, Fn, Cls, IVal, E } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  expect(code).toContain("import { A } from '");
  expect(code).toContain("import { C } from '");
  expect(code).toContain("import { Fn } from '");
  expect(code).toContain("import { Cls } from '");
  expect(code).toContain("import { IVal } from '");
  expect(code).toContain("import { E } from '");

  callPluginMethod(plugin, 'buildEnd');
});

test('follows re-export alias and export * and external re-export', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  // sub files
  const subA = path.join(srcDir, 'subA.ts');
  fs.writeFileSync(subA, 'export const Real = 42;\n');

  const subB = path.join(srcDir, 'subB.ts');
  fs.writeFileSync(subB, 'export const Star = 100;\n');

  // index re-exports: alias, star, and external
  const indexPath = path.join(srcDir, 'index.ts');
  const idxCode = [
    "export { Real as Alias } from './subA';",
    "export * from './subB';",
    "export { External as Ext } from 'external-pkg';",
  ].join('\n');
  fs.writeFileSync(indexPath, `${idxCode}\n`);

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'reexport-consumer.ts');
  const originalCode = "import { Alias, Star, Ext } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};

  // Alias should import Real as Alias from subA
  expect(code).toMatch(/import \{ Real as Alias \} from '.*subA'/);
  // Star should import from subB
  expect(code).toMatch(/import \{ Star \} from '.*subB'/);
  // Ext should import from external package specifier
  expect(code).toMatch(/import \{ External as Ext \} from 'external-pkg'/);

  callPluginMethod(plugin, 'buildEnd');
});

test('resolves through nested barrel indexes (parent re-exports)', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  // nested structure: widgets/level1/index.ts -> './level2'
  const level2Dir = path.join(srcDir, 'level2');
  const leafPath = path.join(level2Dir, 'leaf.ts');
  fs.mkdirSync(level2Dir, { recursive: true });
  fs.writeFileSync(leafPath, 'export const Leaf = 9;\n');

  const level2Index = path.join(level2Dir, 'index.ts');
  fs.writeFileSync(level2Index, "export { Leaf } from './leaf';\n");

  const level1Index = path.join(srcDir, 'index.ts');
  fs.writeFileSync(level1Index, "export { Leaf } from './level2';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'nested-consumer.ts');
  const originalCode = "import { Leaf } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  expect(code).toMatch(/import \{ Leaf \} from '.*leaf'/);

  callPluginMethod(plugin, 'buildEnd');
});

test('writes logs to file when logToFile enabled', () => {
  const fooPath = path.join(tmpDir, 'src', 'widgets', 'foo.ts');
  fs.writeFileSync(fooPath, 'export const Widget = 123;\n');
  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, "export { Widget } from './foo';\n");
  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { Widget } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const logFile = path.join(tmpDir, 'resolve.log');
  const plugin = resolveBarrelsPlugin({
    directories: ['widgets'],
    enable: true,
    logReplacements: true,
    logToFile: true,
    logFilePath: logFile,
  });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  callPluginMethod(plugin, 'buildEnd');
  const txt = fs.readFileSync(logFile, 'utf8');
  expect(txt).toContain('[resolve-barrels]');
  expect(txt).toContain('transform:');
});

test('disabled plugin returns null and non-ts files are skipped', () => {
  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: false });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(
    plugin,
    'transform',
    "import { X } from 'widgets'",
    path.join(tmpDir, 'src', 'consumer', 'a.css')
  );
  expect(res).toBeNull();
  callPluginMethod(plugin, 'buildEnd');
});

test('internal behavior covered via plugin: module and re-exports', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  fs.mkdirSync(srcDir, { recursive: true });

  // a.ts exports A
  const aPath = path.join(srcDir, 'a.ts');
  fs.writeFileSync(aPath, 'export const A = 1;\n');

  // re.ts re-exports A as Y and export *
  const rePath = path.join(srcDir, 're.ts');
  fs.writeFileSync(rePath, "export { A as Y } from './a';\nexport * from './a';\n");

  // index exports from re (simulate barrel)
  const indexPath = path.join(srcDir, 'index.ts');
  fs.writeFileSync(indexPath, "export { Y } from './re';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'int-consumer.ts');
  const originalCode = "import { A, Y } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  // should resolve to the file that defines A
  expect(code).toContain('a');
  expect(code).toContain('import');
  callPluginMethod(plugin, 'buildEnd');
});

test('buildStart handles writeFileSync errors gracefully', () => {
  process.chdir(tmpDir);
  const orig = fs.writeFileSync;
  try {
    fs.writeFileSync = () => {
      throw new Error('nope');
    };
    const plugin = resolveBarrelsPlugin({
      directories: ['widgets'],
      enable: true,
      logToFile: true,
      logFilePath: 'some/path',
    });
    // should not throw
    callPluginMethod(plugin, 'buildStart');
    callPluginMethod(plugin, 'buildEnd');
  } finally {
    fs.writeFileSync = orig;
  }
});

test('array/object binding with propertyName in export is parsed and resolved', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  fs.mkdirSync(srcDir, { recursive: true });

  // Create a file that uses array/object binding with property names
  const complex = path.join(srcDir, 'complex.ts');
  const complexCode = ['export const [{ x: Foo }, B] = [{ x: 1 }, 2];', 'export const { C: CLocal } = { C: 3 };'].join(
    '\n'
  );
  fs.writeFileSync(complex, `${complexCode}\n`);

  // barrel index exporting Foo and CLocal
  fs.writeFileSync(path.join(srcDir, 'index.ts'), "export { Foo, CLocal } from './complex';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'complex-consumer.ts');
  const originalCode = "import { Foo, CLocal } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  expect(code).toContain('complex');
  expect(code).toContain('import');
  callPluginMethod(plugin, 'buildEnd');
});

test('resolveExportThroughBarrel follows candidateDir when module spec is directory', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  const subdir = path.join(srcDir, 'subdir');
  fs.mkdirSync(subdir, { recursive: true });

  // leaf file inside subdir
  const leaf = path.join(subdir, 'leaf.ts');
  fs.writeFileSync(leaf, 'export const Deep = 5;\n');

  // subdir/index.ts exporting Deep
  fs.writeFileSync(path.join(subdir, 'index.ts'), "export { Deep } from './leaf';\n");

  // root index re-exports from './subdir'
  fs.writeFileSync(path.join(srcDir, 'index.ts'), "export { Deep } from './subdir';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'deep-consumer.ts');
  const originalCode = "import { Deep } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  expect(code).toMatch(/import \{ Deep \} from '.*leaf'/);
  callPluginMethod(plugin, 'buildEnd');
});

test('external re-export with same name imports from package specifier', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'index.ts'), "export { External } from 'external-pkg';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'ext-consumer.ts');
  const originalCode = "import { External } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};
  expect(code).toContain("import { External } from 'external-pkg'");
  callPluginMethod(plugin, 'buildEnd');
});

test('logs to console when logReplacements is enabled', () => {
  const fooPath = path.join(tmpDir, 'src', 'widgets', 'foo.ts');
  fs.writeFileSync(fooPath, 'export const Element = 999;\n');
  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, "export { Element } from './foo';\n");
  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { Element } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {
    // intentionally empty
  });
  const plugin = resolveBarrelsPlugin({
    directories: ['widgets'],
    enable: true,
    logReplacements: true,
  });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  callPluginMethod(plugin, 'buildEnd');

  expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[resolve-barrels]'));
  consoleSpy.mockRestore();
});

test('skips transformation when barrel index does not exist', () => {
  // Create a consumer file that imports from a directory without index.ts
  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { NonExistent } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);

  // Should return null because no barrel index exists
  expect(res).toBeNull();

  callPluginMethod(plugin, 'buildEnd');
});

test('skips transformation for default and namespace imports', () => {
  const fooPath = path.join(tmpDir, 'src', 'widgets', 'foo.ts');
  fs.writeFileSync(fooPath, 'export const Module = 777;\nexport default 42;\n');
  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, "export { Module } from './foo';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode1 = "import widgets from 'widgets';\n"; // default import
  const originalCode2 = "import * as widgets from 'widgets';\n"; // namespace import
  fs.writeFileSync(consumerPath, originalCode1);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  // Test default import
  const res1 = callPluginMethod(plugin, 'transform', originalCode1, consumerPath);
  expect(res1).toBeNull();

  // Test namespace import
  const res2 = callPluginMethod(plugin, 'transform', originalCode2, consumerPath);
  expect(res2).toBeNull();

  callPluginMethod(plugin, 'buildEnd');
});

test('handles import aliases (as keyword) correctly', () => {
  const fooPath = path.join(tmpDir, 'src', 'widgets', 'foo.ts');
  fs.writeFileSync(fooPath, 'export const Original = 1;\n');
  const indexPath = path.join(tmpDir, 'src', 'widgets', 'index.ts');
  fs.writeFileSync(indexPath, "export { Original } from './foo';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'file.ts');
  const originalCode = "import { Original as Renamed } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');

  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};

  // Should preserve the alias in the direct import
  expect(code).toMatch(/import \{ Original as Renamed \} from '.*foo'/);

  callPluginMethod(plugin, 'buildEnd');
});

test('handles external import aliases correctly', () => {
  const srcDir = path.join(tmpDir, 'src', 'widgets');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'index.ts'), "export { ExternalItem as LocalAlias } from 'external-pkg';\n");

  const consumerPath = path.join(tmpDir, 'src', 'consumer', 'ext-alias-consumer.ts');
  const originalCode = "import { LocalAlias as MyName } from 'widgets';\n";
  fs.writeFileSync(consumerPath, originalCode);

  process.chdir(tmpDir);
  const plugin = resolveBarrelsPlugin({ directories: ['widgets'], enable: true });
  callPluginMethod(plugin, 'buildStart');
  const res = callPluginMethod(plugin, 'transform', originalCode, consumerPath);
  expect(res).not.toBeNull();
  const { code } = res ?? {};

  // Should import from external package with correct aliasing
  expect(code).toContain("import { ExternalItem as MyName } from 'external-pkg'");
  callPluginMethod(plugin, 'buildEnd');
});
