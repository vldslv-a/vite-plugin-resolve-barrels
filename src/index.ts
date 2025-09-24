import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { buildExportMap } from './utils/buildExportMap.js';
import { resolveExportThroughBarrel } from './utils/resolveExportThroughBarrel.js';
import type { Plugin } from 'vite';

/**
 * Configuration options for the resolve-barrels plugin.
 */
type Options = {
  /** Directories to process barrel files */
  directories: string[];
  /** Enable/disable plugin (default: true). Use `process.env.NODE_ENV === 'production'` */
  enable?: boolean;
  /** Log replacements to console */
  logReplacements?: boolean;
  /** Save logs to file */
  logToFile?: boolean;
  /** Log file path */
  logFilePath?: string;
};

/**
 * Vite plugin that resolves barrel file imports to direct imports for React projects.
 * Reduces bundle size and improves tree-shaking. Recommended for production only.
 *
 * @see {@link https://github.com/vldslv-a/vite-plugin-resolve-barrels | Documentation}
 */
export function resolveBarrelsPlugin(options: Options) {
  const enabled = options.enable ?? true;
  const log = options.logReplacements ?? false;
  const logToFile = options.logToFile ?? false;
  const logFilePathOption = options.logFilePath ?? '';

  // build cache per run
  let projectRoot = process.cwd();
  const maps = new Map<string, Map<string, string>>(); // dir -> exportMap
  let logsBuffer: string[] = [];
  let resolvedLogFilePath: string | null = null;

  return {
    name: 'vite:resolve-barrels',
    enforce: 'pre',
    buildStart() {
      if (!enabled) return;
      projectRoot = process.cwd();
      // prepare file logging: clear previous content for this run
      logsBuffer = [];
      if (logToFile && logFilePathOption) {
        resolvedLogFilePath = path.isAbsolute(logFilePathOption)
          ? logFilePathOption
          : path.resolve(projectRoot, logFilePathOption);
        try {
          fs.writeFileSync(resolvedLogFilePath, '', 'utf8');
        } catch {
          // ignore write errors here, will attempt to write later
          resolvedLogFilePath = null;
        }
      }
      for (const d of options.directories) {
        maps.set(d, buildExportMap(path.join(projectRoot, 'src'), d));
      }
    },

    buildEnd() {
      if (logToFile && resolvedLogFilePath) {
        try {
          fs.writeFileSync(resolvedLogFilePath, logsBuffer.join('\n\n'), 'utf8');
        } catch {
          // swallow
        }
      }
    },

    transform(code, id) {
      if (!enabled) return null;
      if (!/\.(ts|tsx|js|jsx)$/.test(id)) return null;

      const fileDir = path.dirname(id);

      const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.ESNext, true);
      const importEdits: { start: number; end: number; text: string }[] = [];

      const emitLog = (...lines: string[]) => {
        const text = lines.join('\n');
        logsBuffer.push(text);
        if (log) console.log(text); // eslint-disable-line no-console
      };

      // eslint-disable-next-line sonarjs/cognitive-complexity
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const spec = node.moduleSpecifier.text;

          // check if import matches one of the directories
          for (const dir of options.directories) {
            // Accept imports like 'widgets/authentication/createShopLayout' or 'widgets/CreateShopLayout'
            if (spec === dir || spec.startsWith(`${dir}/`)) {
              // compute target directory inside src
              const relToSrc = spec; // e.g. widgets/authentication/createShopLayout
              const barrelIndexPath = path.resolve(projectRoot, 'src', relToSrc, 'index.ts');

              if (!fs.existsSync(barrelIndexPath)) continue;

              // get named imports
              if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                const { elements } = node.importClause.namedBindings;
                const replacements: (string | null)[] = [];

                for (const el of elements) {
                  // `el.name` is the local name (alias in the importing file),
                  // `el.propertyName` is the original exported name when import uses `as`.
                  const localName = el.name.text;
                  let originalName: string;
                  if (el.propertyName && ts.isIdentifier(el.propertyName)) originalName = el.propertyName.text;
                  else originalName = localName;

                  // resolve where this original exported name comes from by walking re-exports
                  const dirMap = maps.get(dir) ?? new Map<string, string>();
                  const resolved = resolveExportThroughBarrel(
                    path.resolve(projectRoot, 'src', relToSrc),
                    originalName,
                    dirMap
                  );

                  if (resolved) {
                    const abs = resolved.resolved;
                    let relPath = path.relative(fileDir, abs).replace(/\\/g, '/');
                    const actualExportName = resolved.importName || originalName;
                    if (resolved.external) {
                      // import directly from external package specifier
                      if (actualExportName === localName) {
                        replacements.push(`import { ${actualExportName} } from '${abs}';`);
                      } else {
                        replacements.push(`import { ${actualExportName} as ${localName} } from '${abs}';`);
                      }
                    } else {
                      if (!relPath.startsWith('.')) relPath = `./${relPath}`;
                      relPath = relPath.replace(/\.(ts|tsx|js|jsx)$/, '');
                      if (actualExportName === localName) {
                        replacements.push(`import { ${actualExportName} } from '${relPath}';`);
                      } else {
                        replacements.push(`import { ${actualExportName} as ${localName} } from '${relPath}';`);
                      }
                    }
                  } else {
                    // fallback: keep original import symbol grouped in the original import
                    replacements.push(null);
                  }
                }

                // build replacement text: join only resolved ones but keep unresolved grouped import to original
                const resolvedImports = replacements.filter((r): r is string => Boolean(r));
                const unresolvedCount = replacements.filter((r) => !r).length;

                const original = code.slice(node.getStart(), node.getEnd());

                let newText = '';
                if (resolvedImports.length > 0) newText += resolvedImports.join('\n');
                if (unresolvedCount > 0) {
                  newText += (newText ? '\n' : '') + original;
                }

                // log either transform details or a simple 'not transformed' message
                if (resolvedImports.length > 0) {
                  emitLog(`[resolve-barrels] ${id}:`, 'original:', original, 'transform:', newText, '');
                } else {
                  emitLog(`[resolve-barrels] ${id}:`, 'import is not transformed:', original);
                }

                importEdits.push({ start: node.getStart(), end: node.getEnd(), text: newText });
              }
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);

      if (importEdits.length === 0) return null;

      // apply edits from end to start
      let out = code;
      importEdits.sort((a, b) => b.start - a.start);
      for (const e of importEdits) {
        out = `${out.slice(0, e.start)}${e.text}${out.slice(e.end)}`;
      }

      return { code: out, map: { version: 3, names: [], sources: [], mappings: '' } };
    },
  } satisfies Plugin;
}
