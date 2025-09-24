import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { isRelativeImport } from './isRelativeImport.js';
import { parseExportsFromFile } from './parseExportsFromFile.js';
import { resolveModuleFile } from './resolveModuleFile.js';

type ResolveResult = { resolved: string; importName: string; chain: string[]; external?: boolean } | null;
type ExportInfo = { name: string; local?: string; isReexport?: boolean; module?: string };

export function resolveExportThroughBarrel(
  barrelDir: string,
  exportName: string,
  exportMap: Map<string, string>
): ResolveResult {
  // First try: read the barrel index and follow re-exports recursively (safer, avoids cross-barrel collisions)
  const visited = new Set<string>();

  function checkExternalReexport(exports: ExportInfo[], targetExportName: string, idx: string): ResolveResult {
    for (const ex of exports) {
      if (ex.name === targetExportName && ex.isReexport && ex.module && !isRelativeImport(ex.module)) {
        return { resolved: ex.module, importName: ex.local ?? targetExportName, chain: [idx], external: true };
      }
    }
    return null;
  }

  function checkDirectExport(exports: ExportInfo[], targetExportName: string, idx: string): ResolveResult {
    for (const ex of exports) {
      if (ex.name === targetExportName && !ex.isReexport) {
        return { resolved: idx.replace(/index\.(ts|tsx|js|jsx)$/, ''), importName: targetExportName, chain: [idx] };
      }
    }
    return null;
  }

  function checkRelativeReexport(
    exports: ExportInfo[],
    targetExportName: string,
    dir: string,
    idx: string
  ): ResolveResult {
    for (const ex of exports) {
      if (ex.name === targetExportName && ex.isReexport && ex.module) {
        // if module specifier is non-relative, treat as external re-export
        if (!isRelativeImport(ex.module)) {
          return { resolved: ex.module, importName: ex.local ?? targetExportName, chain: [idx], external: true };
        }

        const target = resolveModuleFile(dir, ex.module);
        if (target && fs.statSync(target).isFile()) {
          // if target is a file, parse its exports
          const fileExports = parseExportsFromFile(target);
          // if the barrel re-export uses a local name (alias), check that local name in the target file
          const localName = ex.local ?? targetExportName;
          if (fileExports.some((fe) => fe.name === localName && !fe.isReexport)) {
            return { resolved: target, importName: localName, chain: [idx, target] };
          }
        }
      }
    }
    return null;
  }

  function checkWildcardReexport(
    exports: ExportInfo[],
    targetExportName: string,
    dir: string,
    idx: string
  ): ResolveResult {
    for (const ex of exports) {
      if (ex.name === '*' && ex.module && typeof ex.module === 'string') {
        const target = resolveModuleFile(dir, ex.module);
        if (target && fs.statSync(target).isFile()) {
          const fileExports = parseExportsFromFile(target);
          if (fileExports.some((fe) => fe.name === targetExportName)) {
            return { resolved: target, importName: targetExportName, chain: [idx, target] };
          }
        }
      }
    }
    return null;
  }

  function processIndexFile(dir: string, idx: string): ResolveResult {
    const key = idx;
    if (visited.has(key)) return null;
    visited.add(key);

    const exports = parseExportsFromFile(idx);

    // Quick check: non-relative export-from
    const externalResult = checkExternalReexport(exports, exportName, idx);
    if (externalResult) return externalResult;

    // Direct exports
    const directResult = checkDirectExport(exports, exportName, idx);
    if (directResult) return directResult;

    // Relative re-exports
    const relativeResult = checkRelativeReexport(exports, exportName, dir, idx);
    if (relativeResult) return relativeResult;

    // Wildcard re-exports
    const wildcardResult = checkWildcardReexport(exports, exportName, dir, idx);
    if (wildcardResult) return wildcardResult;

    return null;
  }

  function processParentReexports(dir: string): ResolveResult {
    const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

    for (const f of indexFiles) {
      const idx = path.join(dir, f);
      if (!fs.existsSync(idx)) continue;

      // Check if this index file was already visited to prevent infinite recursion
      if (visited.has(idx)) continue;

      const source = fs.readFileSync(idx, 'utf8');
      const sourceFile = ts.createSourceFile(idx, source, ts.ScriptTarget.ESNext, true);

      const result = processSourceFileForReexports(sourceFile, dir, idx);
      if (result) return result;
    }

    return null;
  }

  function processSourceFileForReexports(sourceFile: ts.SourceFile, dir: string, idx: string): ResolveResult {
    let found: ResolveResult = null;

    sourceFile.forEachChild((node) => {
      if (found) return; // Early exit if already found

      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const mod = node.moduleSpecifier.text;
        const target = resolveModuleFile(dir, mod);
        if (target) {
          const candidateDir = fs.statSync(target).isFile() ? path.dirname(target) : target;
          // Only recurse if the candidate directory is different from current directory
          if (candidateDir !== dir) {
            const res = walkIndex(candidateDir);
            if (res) {
              found = {
                resolved: res.resolved,
                importName: res.importName,
                chain: [idx, ...res.chain],
              };
            }
          }
        }
      }
    });

    return found;
  }

  function walkIndex(dir: string): ResolveResult {
    const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

    // Process index files first
    for (const f of indexFiles) {
      const idx = path.join(dir, f);
      if (!fs.existsSync(idx)) continue;

      const result = processIndexFile(dir, idx);
      if (result) return result;
    }

    // Process parent re-exports
    return processParentReexports(dir);
  }

  const r = walkIndex(barrelDir);
  // If walkIndex found a result, return it
  if (r) return r;

  // Fallback quick path: if exportMap has it globally (scoped to the directory)
  if (exportMap.has(exportName)) {
    const candidate = exportMap.get(exportName);
    // only accept quick-path when candidate resides under the barrelDir (to avoid cross-barrel collisions)
    if (candidate?.startsWith(path.resolve(barrelDir))) {
      return { resolved: candidate, importName: exportName, chain: ['<exportMap>'] };
    }
  }
  // nothing found by index traversal or quick-map
  return null;
}
