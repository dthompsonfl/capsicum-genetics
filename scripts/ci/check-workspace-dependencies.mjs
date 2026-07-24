import { promises as fs } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoots = ['apps', 'packages'];
const sourceExtensions = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);
const excludedDirectories = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  '.turbo',
]);
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function externalPackageName(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('#') ||
    specifier.includes('!') ||
    specifier.startsWith('node:') ||
    builtins.has(specifier)
  ) {
    return null;
  }

  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return scope && name ? `${scope}/${name}` : specifier;
  }

  return specifier.split('/')[0] ?? specifier;
}

async function findWorkspaceManifests() {
  const manifests = [];

  for (const rootName of workspaceRoots) {
    const root = path.join(repositoryRoot, rootName);
    const entries = await fs.readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = path.join(root, entry.name, 'package.json');

      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        manifests.push({
          directory: path.dirname(manifestPath),
          manifest,
          manifestPath,
        });
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  return manifests;
}

async function collectSourceFiles(directory) {
  const files = [];

  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) {
          await visit(path.join(current, entry.name));
        }
        continue;
      }

      if (sourceExtensions.has(path.extname(entry.name))) {
        files.push(path.join(current, entry.name));
      }
    }
  }

  await visit(directory);
  return files;
}

function importSpecifiers(sourceFile) {
  const values = [];
  const add = (value) => {
    if (typeof value === 'string') {
      values.push(value);
    }
  };

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        add(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (
        ts.isExternalModuleReference(reference) &&
        reference.expression &&
        ts.isStringLiteralLike(reference.expression)
      ) {
        add(reference.expression.text);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          add(argument.text);
        }
        if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          add(argument.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

const workspaces = await findWorkspaceManifests();
const violations = [];

for (const workspace of workspaces) {
  const declared = new Set([
    ...Object.keys(workspace.manifest.dependencies ?? {}),
    ...Object.keys(workspace.manifest.devDependencies ?? {}),
    ...Object.keys(workspace.manifest.peerDependencies ?? {}),
    ...Object.keys(workspace.manifest.optionalDependencies ?? {}),
  ]);

  for (const file of await collectSourceFiles(workspace.directory)) {
    const text = await fs.readFile(file, 'utf8');
    const scriptKind =
      file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    for (const specifier of importSpecifiers(sourceFile)) {
      const packageName = externalPackageName(specifier);
      if (packageName && !declared.has(packageName)) {
        violations.push({
          file: path.relative(repositoryRoot, file),
          packageName,
          specifier,
          workspace:
            workspace.manifest.name ?? path.relative(repositoryRoot, workspace.directory),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ ok: false, violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        checkedWorkspaces: workspaces.length,
        ok: true,
      },
      null,
      2,
    ),
  );
}
