# V9 build, typecheck, and lint remediation

Date: 2026-07-24

## Verdict

The source defects that could be reproduced without a registry-enabled frozen install were corrected. The repository now passes every dependency-independent source, package, worker, migration, scientific-runtime, and repository gate available in the review environment.

This is **not** evidence that the exact production build has passed. The repository still lacks a genuine `pnpm-lock.yaml`, so the declared Next.js, ESLint, TypeScript, React, Vitest, and native dependency graph could not be installed and executed exactly.

## Build blockers corrected

### Duplicate TypeScript ESLint plugin authority

The previous flat configuration combined `eslint-config-next/core-web-vitals` with a separately loaded, older `typescript-eslint` instance. Next.js 16 already registers its own TypeScript parser and plugin through `eslint-config-next`. Under pnpm isolation, the two versions can be loaded as distinct plugin objects and cause configuration or rule-resolution failures.

The configuration now uses:

- `eslint-config-next/core-web-vitals`;
- `eslint-config-next/typescript`;
- one project-service configuration for type-aware rules;
- no separately imported or declared root `typescript-eslint` package.

### Undeclared web-layer PostgreSQL import

`apps/web/src/lib/database.ts` imported `pg` directly even though `apps/web/package.json` did not declare `pg`. That can appear to work in a hoisted or synthetic environment but fail under pnpm's strict workspace isolation.

The web application now consumes the `DatabasePool` type exported by `@capsicum/database`. The web package no longer reaches through the database package boundary.

### React runtime/type skew

React and React DOM are pinned to 19.2.7, while the web project previously used 19.1 type packages. The web project now uses `@types/react` 19.2.17 and `@types/react-dom` 19.2.3.

### Non-blocking lint warnings

Every workspace lint script now includes `--max-warnings=0`. CI cannot pass while Next.js, React, accessibility, import, or TypeScript rules still emit warnings.

### Invalid Next.js proxy export surface

`apps/web/src/proxy.ts` exported an internal response-header helper alongside the required `proxy` function and optional `config`. Next.js 16 treats `proxy.ts` as a special file and permits one proxy function plus optional configuration. The helper is now private to the module, and the App Router contract validator checks the proxy export surface permanently.

### Incomplete browser-worker build graph

The browser CI job previously built the worker package directly, bypassing Turbo's upstream dependency build graph. It now runs `pnpm build:worker`, ensuring required package artifacts are built before the worker starts.

## Permanent regression gates

Three new pre-build validators are wired into the root validation command and the primary CI job:

1. `pnpm validate:toolchain`
   - requires exact Next.js and `eslint-config-next` alignment;
   - requires React and React DOM alignment;
   - requires React runtime/type major-minor alignment;
   - verifies workspace TypeScript, Vitest, and Node type versions;
   - rejects a second root `typescript-eslint` plugin instance;
   - verifies pinned pnpm and Node 24 CI contracts.

2. `pnpm validate:workspace-dependencies`
   - parses imports, exports, dynamic imports, and `require` calls with TypeScript;
   - validates all 19 app/package workspaces;
   - rejects undeclared external or workspace dependencies;
   - understands Node built-ins and workspace subpath exports.

3. `pnpm validate:next-contracts`
   - validates all 72 App Router page, layout, and route modules plus the root proxy module;
   - rejects unsupported named exports that would fail Next.js generated route types;
   - requires Promise-based `params` and `searchParams` where declared under Next.js 16.

The dependency and Next.js contract gates were also challenged with temporary negative fixtures and correctly rejected them before the fixtures were removed.

## Validation completed

| Gate | Result |
|---|---:|
| TypeScript/TSX parser | 184 files, 0 failures |
| Strict package/application type configurations | 19 passed |
| Runtime package builds | 17 passed |
| Node worker build | Passed |
| Compiled artifact verification | 17 packages plus worker passed |
| Workspace dependency contract | 19 workspaces passed |
| Next.js App Router and proxy contract | 73 modules passed |
| Toolchain alignment contract | Passed |
| Migration manifest | 31 migrations verified |
| Routine grant manifest | 29 runtime / 27 worker verified |
| Authentication runtime smoke | 7 passed |
| Genetics runtime smoke | 8 passed |
| Laboratory export smoke | 5 passed |
| Storage/runtime smoke | 11 passed |
| Migration utility tests | 3 passed |
| Python worker tests | 8 passed |
| Repository validator | 906 checks, 0 source issues |

## Exact commands still required on a clean release host

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --lockfile-only
pnpm validate:lockfile
pnpm install --frozen-lockfile
pnpm validate:toolchain
pnpm validate:workspace-dependencies
pnpm validate:next-contracts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:runtime-artifacts
```

Do not weaken the lint, typecheck, lockfile, or build gates to obtain a green result. Any remaining failure from this exact command sequence must be treated as new evidence and corrected at its source.
