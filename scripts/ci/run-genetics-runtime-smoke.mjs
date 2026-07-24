import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadTypeScript() {
  try {
    return await import('typescript');
  } catch {
    const configured = process.env.TYPESCRIPT_MODULE_PATH;
    if (!configured) throw new Error('typescript package or TYPESCRIPT_MODULE_PATH is required.');
    return import(pathToFileURL(configured).href);
  }
}

const ts = await loadTypeScript();

async function compileDirectory(sourceRoot, outputRoot, replacements = []) {
  const names = (await readdir(sourceRoot)).filter((name) => extname(name) === '.ts' && !name.endsWith('.test.ts'));
  for (const name of names) {
    const sourcePath = join(sourceRoot, name);
    const source = await readFile(sourcePath, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        verbatimModuleSyntax: true,
      },
      fileName: sourcePath,
      reportDiagnostics: true,
    });
    const failures = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    assert.equal(failures.length, 0, `${sourcePath} has transpile diagnostics.`);
    let output = result.outputText.replace(/from ['"](\.\.?\/[^'"]+?)(?<!\.mjs)['"]/g, (_match, specifier) => `from '${specifier}.mjs'`);
    for (const [pattern, value] of replacements) output = output.replaceAll(pattern, value);
    await writeFile(join(outputRoot, name.replace(/\.ts$/, '.mjs')), output, { mode: 0o600, flag: 'wx' });
  }
}

const work = await mkdtemp(join(tmpdir(), 'capsicum-genetics-smoke-'));
try {
  const coreOutput = join(work, 'core');
  const advancedOutput = join(work, 'advanced');
  await (await import('node:fs/promises')).mkdir(coreOutput, { mode: 0o700 });
  await (await import('node:fs/promises')).mkdir(advancedOutput, { mode: 0o700 });
  await compileDirectory('packages/genetics-core/src', coreOutput);
  await compileDirectory('packages/genetics-advanced/src', advancedOutput, [
    ["from '@capsicum/genetics-core'", "from '../core/index.mjs'"],
  ]);
  const core = await import(pathToFileURL(join(coreOutput, 'index.mjs')).href);
  const advanced = await import(pathToFileURL(join(advancedOutput, 'index.mjs')).href);

  const genotype = (locusId, first, second, evidenceState = 'verified') => ({ locusId, alleles: [first, second], evidenceState });
  const self = core.crossSingleLocus(genotype('L1', 'A1', 'A2'), genotype('L1', 'A1', 'A2'));
  assert.deepEqual(self.map((item) => item.probability.toString()), ['1/4', '1/2', '1/4']);

  const multi = core.crossIndependentLoci(
    [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
    [genotype('L1', 'A', 'B'), genotype('L2', 'C', 'D')],
  );
  assert.equal(multi.length, 9);
  assert.equal(multi.reduce((sum, item) => sum.add(item.probability), core.Rational.ZERO).toString(), '1/1');

  const uncertain = core.crossUncertainParents([
    { loci: [genotype('L1', 'A', 'A')], probability: new core.Rational(1, 2), basis: 'user_prior', evidenceIds: [] },
    { loci: [genotype('L1', 'A', 'B')], probability: new core.Rational(1, 2), basis: 'user_prior', evidenceIds: [] },
  ], [
    { loci: [genotype('L1', 'B', 'B')], probability: core.Rational.ONE, basis: 'assay', evidenceIds: ['assay-1'] },
  ]);
  assert.deepEqual(uncertain.map((item) => item.probability.toString()), ['3/4', '1/4']);

  const phased = {
    firstLocusId: 'L1', secondLocusId: 'L2',
    homologOne: { firstLocusAllele: 'A', secondLocusAllele: 'B' },
    homologTwo: { firstLocusAllele: 'a', secondLocusAllele: 'b' },
    phaseEvidence: 'verified',
  };
  assert.equal(advanced.linkedTwoLocusGametes(phased, core.Rational.ZERO).length, 2);
  assert.deepEqual(
    advanced.linkedTwoLocusGametes(phased, new core.Rational(1, 2)).map((item) => item.probability.toString()),
    ['1/4', '1/4', '1/4', '1/4'],
  );

  const maternal = advanced.transmitMaternalState({
    maternalPlantId: 'maternal-plant', paternalPlantId: 'paternal-plant',
    maternalState: { systemId: 'cytoplasm', stateId: 'state-1', evidenceState: 'verified' },
  });
  assert.equal(maternal.maternalPlantId, 'maternal-plant');
  assert.equal(maternal.inheritedState.stateId, 'state-1');

  const monteCarlo = advanced.runCategoricalMonteCarlo({
    states: [
      { value: 'A', probability: new core.Rational(1, 4) },
      { value: 'B', probability: new core.Rational(3, 4) },
    ],
    key: (value) => value,
    seed: 42,
    sampleCount: 100_000,
    fallbackReason: 'exact_state_limit',
  });
  assert.equal(monteCarlo.authority, 'stochastic_estimate');
  assert.ok(monteCarlo.diagnostics.maximumAbsoluteError < 0.01);

  const segregation = advanced.reconcileObservedSegregation({
    categories: [
      { categoryId: 'AA', observedCount: 24, expectedProbability: new core.Rational(1, 4) },
      { categoryId: 'AB', observedCount: 52, expectedProbability: new core.Rational(1, 2) },
      { categoryId: 'BB', observedCount: 24, expectedProbability: new core.Rational(1, 4) },
    ],
  });
  assert.equal(segregation.method, 'chi_square');
  assert.equal(segregation.assumptionsMet, true);

  const disease = advanced.evaluateHostPathogenInteraction({
    hostGenotypes: [genotype('R-locus', 'R1', 'R1')],
    context: {},
    rules: [],
  });
  assert.equal(disease.authority, 'unsupported');
  assert.equal(disease.outcome, 'insufficient_evidence');

  console.log(JSON.stringify({
    schemaVersion: '1.0',
    passed: true,
    checks: [
      'exact-single-locus', 'exact-multi-locus', 'weighted-parent-uncertainty', 'linkage-endpoints',
      'maternal-direction', 'direct-categorical-monte-carlo', 'observed-segregation', 'host-pathogen-abstention',
    ],
    monteCarloMaximumAbsoluteError: monteCarlo.diagnostics.maximumAbsoluteError,
  }, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}
