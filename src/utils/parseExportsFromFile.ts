import fs from 'fs';
import ts from 'typescript';

type ExportInfo = { name: string; local?: string; isReexport?: boolean; module?: string };

function handleExportDeclaration(node: ts.ExportDeclaration): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let moduleSpec: string | undefined;

  if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    moduleSpec = node.moduleSpecifier.text;
  }

  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    node.exportClause.elements.forEach((e) => {
      const name = ts.isIdentifier(e.name) ? e.name.text : e.name.getText();
      const local = e.propertyName && ts.isIdentifier(e.propertyName) ? e.propertyName.text : name;
      exports.push({ name, local, isReexport: !!moduleSpec, module: moduleSpec });
    });
  } else if (!node.exportClause && moduleSpec) {
    // export * from './x'
    exports.push({ name: '*', isReexport: true, module: moduleSpec });
  }

  return exports;
}

function handleVariableStatement(node: ts.VariableStatement): ExportInfo[] {
  const exports: ExportInfo[] = [];

  node.declarationList.declarations.forEach((d) => {
    // handle simple identifier: export const X = ...
    if (ts.isIdentifier(d.name)) {
      exports.push({ name: d.name.text });
      return;
    }

    // handle array destructuring: export const [A, B] = ...
    if (ts.isArrayBindingPattern(d.name)) {
      d.name.elements.forEach((el) => {
        // BindingElement may have a name or propertyName that's an Identifier
        let elName: ts.Node | undefined;
        if (ts.isBindingElement(el)) elName = el.name;
        // some shapes may put a propertyName on the element
        if (!(elName && ts.isIdentifier(elName)) && ts.isBindingElement(el) && el.propertyName) {
          const pn = el.propertyName;
          if (ts.isIdentifier(pn)) elName = pn;
        }
        if (elName && ts.isIdentifier(elName)) exports.push({ name: elName.text });
      });
      return;
    }

    // handle object destructuring: export const { A, B } = ...
    if (ts.isObjectBindingPattern(d.name)) {
      d.name.elements.forEach((el) => {
        if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
          exports.push({ name: el.name.text });
        }
      });
    }
  });

  return exports;
}

function handleTypeDeclaration(
  node: ts.ClassDeclaration | ts.EnumDeclaration | ts.FunctionDeclaration | ts.InterfaceDeclaration
): ExportInfo[] {
  if (node.name && ts.isIdentifier(node.name)) {
    return [{ name: node.name.text }];
  }
  return [];
}

export function parseExportsFromFile(filePath: string): ExportInfo[] {
  try {
    const src = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, src, ts.ScriptTarget.ESNext, true);
    const exports: ExportInfo[] = [];

    sourceFile.forEachChild((node) => {
      if (ts.isExportDeclaration(node)) {
        exports.push(...handleExportDeclaration(node));
      } else if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        exports.push(...handleVariableStatement(node));
      } else if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        exports.push(...handleTypeDeclaration(node));
      }
    });

    return exports;
  } catch {
    return [];
  }
}
