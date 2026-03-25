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
  /**
   * Path aliases configuration. Maps alias prefixes to their actual paths.
   * Example: { '@': 'src', '@widgets': 'src/widgets' }
   */
  alias?: Record<string, string>;
  /**
   * Barrel file names to recognize (default: ['index.ts', 'index.tsx', 'index.js', 'index.jsx'])
   * Example: ['index.ts', 'api.ts', 'models.ts']
   */
  barrelFiles?: string[];
  /**
   * Root directory to scan for barrel files (default: 'src')
   * Can be a single directory or array of directories
   * Example: 'lib' or ['src', 'lib', 'components']
   */
  rootDir?: string[] | string;
  /**
   * Preserve file extensions in resolved imports (default: false)
   * When true, imports like './module.ts' will keep the .ts extension
   */
  preserveExtensions?: boolean;
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
  const aliases = options.alias ?? {};
  const barrelFiles = options.barrelFiles ?? ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
  const rootDirs = Array.isArray(options.rootDir) ? options.rootDir : [options.rootDir ?? 'src'];
  const preserveExtensions = options.preserveExtensions ?? false;

  // build cache per run
  let projectRoot = process.cwd();
  const maps = new Map<string, Map<string, string>>(); // dir -> exportMap
  let logsBuffer: string[] = [];
  let resolvedLogFilePath: string | null = null;

  /**
   * Resolves an import specifier if it uses a configured alias.
   * Returns { resolved: true, path: 'resolved/path' } if alias was found and resolved,
   * or { resolved: false, path: originalSpec } if no alias matched.
   * The returned path is relative to rootDir directory (rootDir prefix is stripped if present).
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  const resolveAlias = (spec: string): { resolved: boolean; path: string } => {
    // Sort aliases by length (descending) to match longest first
    const sortedAliases = Object.keys(aliases).sort((a, b) => b.length - a.length);

    for (const alias of sortedAliases) {
      if (spec === alias || spec.startsWith(`${alias}/`)) {
        const aliasPath = aliases[alias];
        if (!aliasPath) continue; // Skip if alias path is not defined

        const remainder = spec.slice(alias.length);
        let resolvedPath = remainder.startsWith('/') ? aliasPath + remainder : `${aliasPath}/${remainder}`;

        // Remove leading './' if present and normalize
        resolvedPath = resolvedPath.replace(/^\.\//, '').replace(/\/+/g, '/');

        // Strip rootDir prefix if present, since the plugin assumes paths are relative to rootDir
        for (const rootDir of rootDirs) {
          const rootDirWithSlash = `${rootDir}/`;
          if (resolvedPath.startsWith(rootDirWithSlash)) {
            resolvedPath = resolvedPath.slice(rootDirWithSlash.length);
            break;
          } else if (resolvedPath === rootDir) {
            resolvedPath = '';
            break;
          }
        }

        return {
          resolved: true,
          path: resolvedPath,
        };
      }
    }

    return { resolved: false, path: spec };
  };

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
        // Try each rootDir until we find the directory
        for (const rootDir of rootDirs) {
          const dirPath = path.join(projectRoot, rootDir, d);
          if (fs.existsSync(dirPath)) {
            maps.set(d, buildExportMap(path.join(projectRoot, rootDir), d));
            break;
          }
        }
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

          // Try to resolve alias first
          const { path: resolvedSpec, resolved: isAliased } = resolveAlias(spec);

          // check if import matches one of the directories
          for (const dir of options.directories) {
            // Accept imports like 'widgets/authentication/createShopLayout' or 'widgets/CreateShopLayout'
            // Also accept aliased imports like '@/widgets/authentication/createShopLayout'
            const specToCheck = isAliased ? resolvedSpec : spec;

            if (specToCheck === dir || specToCheck.startsWith(`${dir}/`)) {
              // compute target directory inside rootDir(s)
              const relToRoot = specToCheck; // e.g. widgets/authentication/createShopLayout

              // Try to find barrel file in one of the rootDirs and barrel file patterns
              let foundRootDir: string | null = null;
              let barrelFilePath: string | null = null;

              outerLoop: for (const rootDir of rootDirs) {
                for (const barrelFile of barrelFiles) {
                  const candidatePath = path.resolve(projectRoot, rootDir, relToRoot, barrelFile);
                  if (fs.existsSync(candidatePath)) {
                    foundRootDir = rootDir;
                    barrelFilePath = candidatePath;
                    break outerLoop;
                  }
                }
              }

              if (!barrelFilePath || !foundRootDir) continue;

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
                    path.resolve(projectRoot, foundRootDir, relToRoot),
                    originalName,
                    dirMap,
                    barrelFiles
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
                      // Only strip extensions if preserveExtensions is false
                      if (!preserveExtensions) {
                        relPath = relPath.replace(/\.(ts|tsx|js|jsx)$/, '');
                      }
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
