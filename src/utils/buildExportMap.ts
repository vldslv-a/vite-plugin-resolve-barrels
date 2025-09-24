import fs from 'fs';
import path from 'path';
import { parseExportsFromFile } from './parseExportsFromFile.js';

export function buildExportMap(rootDir: string, dir: string) {
  const exportMap = new Map<string, string>(); // exportName -> absolute file path

  const dirAbs = path.resolve(rootDir, dir);

  if (!fs.existsSync(dirAbs)) return exportMap;

  const walk = (p: string) => {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(p);
      for (const e of entries) walk(path.join(p, e));
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(p)) {
      const exports = parseExportsFromFile(p);
      exports.forEach((ex) => {
        if (ex.name === '*') return; // skip export * for now
        // only map direct exports (not re-exports)
        if (!ex.isReexport && !exportMap.has(ex.name)) {
          exportMap.set(ex.name, p);
        }
      });
    }
  };

  walk(dirAbs);
  return exportMap;
}
