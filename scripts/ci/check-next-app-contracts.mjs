import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(repositoryRoot, 'apps/web/src/app');
const pageFiles = new Set(['page.tsx', 'layout.tsx']);
const routeFile = 'route.ts';
const proxyFile = path.join(repositoryRoot, 'apps/web/src/proxy.ts');
const sharedExports = new Set([
  'dynamic',
  'dynamicParams',
  'fetchCache',
  'generateStaticParams',
  'maxDuration',
  'preferredRegion',
  'revalidate',
  'runtime',
]);
const pageExports = new Set([
  ...sharedExports,
  'default',
  'generateMetadata',
  'generateViewport',
  'metadata',
  'viewport',
]);
const routeExports = new Set([
  ...sharedExports,
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);
const proxyExports = new Set(['config', 'default', 'proxy']);
const failures = [];

async function collectFiles(directory) {
  const files = [];

  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (pageFiles.has(entry.name) || entry.name === routeFile) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function exportedNames(sourceFile) {
  const names = [];

  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      names.push('default');
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        names.push(statement.name.text);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push(declaration.name.text);
        }
      }
    }
  }

  return names;
}

function resolveObjectType(sourceFile, typeNode) {
  if (!typeNode) {
    return null;
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeNode;
  }
  if (!ts.isTypeReferenceNode(typeNode) || !ts.isIdentifier(typeNode.typeName)) {
    return null;
  }

  const name = typeNode.typeName.text;
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
      return statement;
    }
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === name &&
      ts.isTypeLiteralNode(statement.type)
    ) {
      return statement.type;
    }
  }

  return null;
}

function propertyType(objectType, propertyName) {
  if (!objectType) {
    return null;
  }

  for (const member of objectType.members) {
    if (!ts.isPropertySignature(member)) {
      continue;
    }

    const name = member.name;
    if (
      (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) &&
      name.text === propertyName
    ) {
      return member.type ?? null;
    }
  }

  return null;
}

function isPromiseType(typeNode) {
  return Boolean(
    typeNode &&
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName) &&
      typeNode.typeName.text === 'Promise',
  );
}

function validateAsyncRequestProps(sourceFile, file) {
  const functions = sourceFile.statements.filter((statement) => {
    if (
      !ts.isFunctionDeclaration(statement) ||
      !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      return false;
    }

    if (path.basename(file) === routeFile) {
      return Boolean(statement.name && routeExports.has(statement.name.text));
    }

    return hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
  });

  for (const declaration of functions) {
    const parameterIndex = path.basename(file) === routeFile ? 1 : 0;
    const parameter = declaration.parameters[parameterIndex];
    if (!parameter) {
      continue;
    }

    const objectType = resolveObjectType(sourceFile, parameter.type);
    for (const propertyName of ['params', 'searchParams']) {
      const typeNode = propertyType(objectType, propertyName);
      if (typeNode && !isPromiseType(typeNode)) {
        failures.push({
          file: path.relative(repositoryRoot, file),
          issue: `${propertyName} must be typed as Promise<...> for the Next.js 16 App Router`,
        });
      }
    }
  }
}

const proxySource = await fs.readFile(proxyFile, 'utf8');
const proxySourceFile = ts.createSourceFile(
  proxyFile,
  proxySource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
for (const exportName of exportedNames(proxySourceFile)) {
  if (!proxyExports.has(exportName)) {
    failures.push({
      file: path.relative(repositoryRoot, proxyFile),
      issue: `unsupported proxy-module export: ${exportName}`,
    });
  }
}

const files = await collectFiles(appRoot);
for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const allowed = path.basename(file) === routeFile ? routeExports : pageExports;

  for (const exportName of exportedNames(sourceFile)) {
    if (!allowed.has(exportName)) {
      failures.push({
        file: path.relative(repositoryRoot, file),
        issue: `unsupported route-module export: ${exportName}`,
      });
    }
  }

  validateAsyncRequestProps(sourceFile, file);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ failures, ok: false }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        checkedFiles: files.length + 1,
        ok: true,
      },
      null,
      2,
    ),
  );
}
