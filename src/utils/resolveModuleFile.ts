import fs from 'fs';
import path from 'path';

export function resolveModuleFile(baseDir: string, moduleSpecifier: string) {
  const candidates = [
    moduleSpecifier,
    `${moduleSpecifier}.ts`,
    `${moduleSpecifier}.tsx`,
    `${moduleSpecifier}.js`,
    `${moduleSpecifier}.jsx`,
    path.join(moduleSpecifier, 'index.ts'),
    path.join(moduleSpecifier, 'index.tsx'),
    path.join(moduleSpecifier, 'index.js'),
    path.join(moduleSpecifier, 'index.jsx'),
  ];

  for (const cand of candidates) {
    const full = path.resolve(baseDir, cand);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }

  return null;
}
