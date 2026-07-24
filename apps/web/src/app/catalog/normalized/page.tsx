import Link from 'next/link';
import { listCatalogRecords, listObservationInputOptions } from '@capsicum/application';
import { MutationForm } from '../../../components/mutation-form';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { getDatabasePool } from '../../../lib/database';
import { humanize, queryError, text } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';
import { createNormalizedCatalogDraftAction } from '../../actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
function optionLabel(row: Row): string {
  return text(row.catalog_id ?? row.assembly_key ?? row.allele_key ?? row.marker_key ?? row.id);
}
function options(rows: readonly Row[], selectedLabel = 'Select approved record') {
  return <><option value="">{selectedLabel}</option>{rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{optionLabel(row)} · {text(row.record_version ?? '')}</option>)}</>;
}
const applicabilityPlaceholder = 'State the species, population, assay conditions, reference context, exclusions, and limits under which this record is valid.';

export default async function NormalizedCatalogPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; saved?: string }> }) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const [loci, assemblyRows, alleles, markers, observationOptions] = await Promise.all([
    listCatalogRecords(pool, principal, 'locus', 'approved', 250),
    listCatalogRecords(pool, principal, 'reference_assembly', 'approved', 250),
    listCatalogRecords(pool, principal, 'allele', 'approved', 250),
    listCatalogRecords(pool, principal, 'marker', 'approved', 250),
    listObservationInputOptions(pool),
  ]);
  const protocols = observationOptions.protocols as Row[];
  const methods = observationOptions.methods as Row[];
  const qualityTerms = observationOptions.qualityTerms as Row[];
  const units = observationOptions.units as Row[];
  const vocabularies = observationOptions.vocabularies as Row[];
  const params = await searchParams;
  const canCurate = ['owner', 'catalog_curator'].includes(principal.role);
  return <>
    <PageHeader
      eyebrow="Normalized scientific authority"
      title="Author normalized catalog records"
      description="Create content-addressed drafts for assemblies, alleles, variants, markers, and assays. Every dependency must already be approved; every draft requires a different human reviewer before it can enter a release."
      action={{ href: '/catalog', label: 'Back to release governance' }}
    />
    <ErrorNotice message={queryError(params.error)} />
    {params.saved ? <div className="notice">The {humanize(params.saved)} draft was created and is ready for submission to independent review.</div> : null}
    {!canCurate ? <div className="notice">Your role may inspect scientific records but cannot author normalized drafts.</div> : null}
    <div className="notice section-gap-sm"><strong>No inference shortcut:</strong> a cultivar name, phenotype, vendor description, or historical symbol does not establish a normalized allele. Use unresolved source notation when molecular identity is uncertain.</div>

    <div className="grid two section-gap">
      <section className="card">
        <h2>Reference assembly</h2>
        <p className="muted">Coordinates are meaningless without an exact assembly and version.</p>
        {canCurate ? <MutationForm intent="catalog.normalized.assembly" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="reference_assembly" />
          <label className="field"><span>Assembly key</span><input name="assemblyKey" required placeholder="capsicum-annuum-reference" /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Species scope</span><input name="speciesScope" required placeholder="Capsicum annuum" /></label>
          <label className="field"><span>Assembly name</span><input name="assemblyName" required /></label>
          <label className="field"><span>Accession</span><input name="accession" /></label>
          <label className="field"><span>Source locator</span><input name="sourceLocator" required placeholder="DOI, repository accession, or immutable source locator" /></label>
          <button className="button" type="submit">Create assembly draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Allele</h2>
        <p className="muted">Bind a symbol to one approved locus and preserve unresolved historical notation separately.</p>
        {canCurate ? <MutationForm intent="catalog.normalized.allele" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="allele" />
          <label className="field"><span>Allele key</span><input name="alleleKey" required /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Approved locus</span><select name="locusId" required>{options(loci)}</select></label>
          <label className="field"><span>Canonical symbol</span><input name="canonicalSymbol" required /></label>
          <label className="field"><span>Functional class</span><input name="functionalClass" /></label>
          <label className="field"><span>Unresolved source notation</span><input name="unresolvedSourceNotation" /></label>
          <label className="field full"><span>Molecular definition JSON</span><textarea name="molecularDefinition" rows={4} placeholder='{"definition":"Only enter reviewed molecular evidence"}' /></label>
          <label className="field full"><span>Aliases JSON</span><textarea name="aliases" rows={4} defaultValue="[]" aria-describedby="alias-help" /></label>
          <p className="muted" id="alias-help">Format: [{`{"alias":"symbol","notationContext":"paper or database context","sourceId":"approved-source-uuid"}`}]</p>
          <label className="field full"><span>Applicability and limits</span><textarea name="applicability" required minLength={10} rows={4} placeholder={applicabilityPlaceholder} /></label>
          <button className="button" type="submit">Create allele draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Sequence variant</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.sequence-variant" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="sequence_variant" />
          <label className="field"><span>Variant key</span><input name="variantKey" required /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Approved assembly</span><select name="assemblyId" required>{options(assemblyRows)}</select></label>
          <label className="field"><span>Chromosome</span><input name="chromosome" required /></label>
          <label className="field"><span>Start coordinate</span><input name="positionStart" type="number" min="1" required /></label>
          <label className="field"><span>End coordinate</span><input name="positionEnd" type="number" min="1" required /></label>
          <label className="field"><span>Reference allele</span><input name="referenceAllele" required /></label>
          <label className="field"><span>Alternate allele</span><input name="alternateAllele" required /></label>
          <label className="field"><span>Approved locus</span><select name="locusId">{options(loci, 'Optional approved locus')}</select></label>
          <label className="field"><span>Approved normalized allele</span><select name="alleleId">{options(alleles, 'Optional approved allele')}</select></label>
          <label className="field full"><span>Applicability and limits</span><textarea name="applicability" required minLength={10} rows={4} placeholder={applicabilityPlaceholder} /></label>
          <button className="button" type="submit">Create sequence-variant draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Structural variant</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.structural-variant" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="structural_variant" />
          <label className="field"><span>Variant key</span><input name="variantKey" required /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Approved assembly</span><select name="assemblyId" required>{options(assemblyRows)}</select></label>
          <label className="field"><span>Chromosome</span><input name="chromosome" required /></label>
          <label className="field"><span>Start coordinate</span><input name="positionStart" type="number" min="1" required /></label>
          <label className="field"><span>End coordinate</span><input name="positionEnd" type="number" min="1" required /></label>
          <label className="field"><span>Variant type</span><select name="variantType" required><option value="deletion">Deletion</option><option value="insertion">Insertion</option><option value="duplication">Duplication</option><option value="inversion">Inversion</option><option value="translocation">Translocation</option><option value="copy_number">Copy number</option><option value="other">Other</option></select></label>
          <label className="field"><span>Approved locus</span><select name="locusId">{options(loci, 'Optional approved locus')}</select></label>
          <label className="field"><span>Approved normalized allele</span><select name="alleleId">{options(alleles, 'Optional approved allele')}</select></label>
          <label className="field full"><span>Applicability and limits</span><textarea name="applicability" required minLength={10} rows={4} placeholder={applicabilityPlaceholder} /></label>
          <button className="button" type="submit">Create structural-variant draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Marker</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.marker" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="marker" />
          <label className="field"><span>Marker key</span><input name="markerKey" required /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Approved locus</span><select name="locusId">{options(loci, 'Optional approved locus')}</select></label>
          <label className="field"><span>Approved assembly</span><select name="assemblyId">{options(assemblyRows, 'Optional approved assembly')}</select></label>
          <label className="field"><span>Marker type</span><input name="markerType" required placeholder="SNP, indel, SSR, diagnostic amplicon…" /></label>
          <label className="field full"><span>Target definition JSON</span><textarea name="targetDefinition" required rows={4} defaultValue="{}" /></label>
          <label className="field full"><span>Applicability and limits</span><textarea name="applicability" required minLength={10} rows={4} placeholder={applicabilityPlaceholder} /></label>
          <button className="button" type="submit">Create marker draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Assay</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.assay" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="assay" />
          <label className="field"><span>Assay key</span><input name="assayKey" required /></label>
          <label className="field"><span>Record version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Approved marker</span><select name="markerId">{options(markers, 'Optional approved marker')}</select></label>
          <label className="field"><span>Approved locus</span><select name="locusId">{options(loci, 'Optional approved locus')}</select></label>
          <label className="field"><span>Assay type</span><input name="assayType" required /></label>
          <label className="field"><span>Protocol locator</span><input name="protocolLocator" required /></label>
          <label className="field full"><span>Result contract JSON</span><textarea name="resultContract" required rows={4} defaultValue="{}" /></label>
          <label className="field full"><span>Applicability and limits</span><textarea name="applicability" required minLength={10} rows={4} placeholder={applicabilityPlaceholder} /></label>
          <button className="button" type="submit">Create assay draft</button>
        </MutationForm> : null}
      </section>
    </div>
    <div className="grid two section-gap">
      <section className="card">
        <h2>Observation protocol</h2>
        <p className="muted">Define the governed capture procedure, required context, timing, and execution constraints. Approval does not make results predictive.</p>
        {canCurate ? <MutationForm intent="catalog.normalized.capture-protocol" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="capture_protocol" />
          <label className="field"><span>Protocol key</span><input name="protocolKey" required /></label>
          <label className="field"><span>Version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field full"><span>Protocol contract JSON</span><textarea name="contract" required rows={6} defaultValue={'{"purpose":"Describe the biological measurement purpose","requiredContext":[],"steps":[],"exclusions":[]}'} /></label>
          <button className="button" type="submit">Create protocol draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Observation method</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.observation-method" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="observation_method" />
          <label className="field"><span>Method key</span><input name="methodKey" required /></label>
          <label className="field"><span>Version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field full"><span>Display name</span><input name="displayName" required /></label>
          <label className="field full"><span>Applicable approved protocol</span><select name="protocolId"><option value="">Method applies independently of one protocol</option>{protocols.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row.protocol_key)} · v{text(row.version)}</option>)}</select></label>
          <label className="field full"><span>Method contract JSON</span><textarea name="contract" required rows={5} defaultValue={'{"procedure":[],"precision":null,"deviceRequirements":[]}'} /></label>
          <label className="field full"><span>Applicability JSON</span><textarea name="applicability" required rows={4} defaultValue={'{"species":"Capsicum","limits":[]}'} /></label>
          <button className="button" type="submit">Create method draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Quality-control term</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.quality-term" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="observation_quality_term" />
          <label className="field"><span>Quality key</span><input name="qualityKey" required /></label>
          <label className="field"><span>Version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field"><span>Display name</span><input name="displayName" required /></label>
          <label className="field"><span>Severity</span><select name="severity"><option value="information">Information</option><option value="warning">Warning</option><option value="invalidating">Invalidating</option></select></label>
          <label className="field full"><span>Scientific definition</span><textarea name="definition" required minLength={10} rows={4} /></label>
          <label className="field full"><span>Applicability JSON</span><textarea name="applicability" required rows={3} defaultValue={'{"limits":[]}'} /></label>
          <button className="button" type="submit">Create quality-term draft</button>
        </MutationForm> : null}
      </section>

      <section className="card">
        <h2>Device-provenance schema</h2>
        {canCurate ? <MutationForm intent="catalog.normalized.device-schema" action={createNormalizedCatalogDraftAction} className="form-grid">
          <input type="hidden" name="entityType" value="observation_device_schema" />
          <label className="field"><span>Schema key</span><input name="schemaKey" required /></label>
          <label className="field"><span>Version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
          <label className="field full"><span>Display name</span><input name="displayName" required /></label>
          <label className="field full"><span>Bounded JSON schema</span><textarea name="jsonSchema" required rows={6} defaultValue={'{"type":"object","required":["deviceId"],"properties":{"deviceId":{"type":"string"}},"additionalProperties":false}'} /></label>
          <label className="field full"><span>Applicability JSON</span><textarea name="applicability" required rows={3} defaultValue={'{"limits":[]}'} /></label>
          <button className="button" type="submit">Create device-schema draft</button>
        </MutationForm> : null}
      </section>
    </div>

    <section className="card section-gap">
      <h2>Observation definition</h2>
      <p className="muted">An authoritative trait definition binds one exact protocol and method, optional exact unit or vocabulary, an explicit missing-value policy, and the only quality terms allowed for that measurement.</p>
      {canCurate ? <MutationForm intent="catalog.normalized.observation-definition" action={createNormalizedCatalogDraftAction} className="form-grid">
        <input type="hidden" name="entityType" value="observation_definition" />
        <label className="field"><span>Trait key</span><input name="traitId" required /></label>
        <label className="field"><span>Version</span><input name="recordVersion" required placeholder="1.0.0" /></label>
        <label className="field full"><span>Display name</span><input name="displayName" required /></label>
        <label className="field"><span>Approved protocol</span><select name="protocolId" required><option value="">Select protocol</option>{protocols.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row.protocol_key)} · v{text(row.version)}</option>)}</select></label>
        <label className="field"><span>Approved method</span><select name="methodId" required><option value="">Select method</option>{methods.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row.display_name)} · v{text(row.method_version)}</option>)}</select></label>
        <label className="field"><span>Approved unit</span><select name="unitId"><option value="">No unit</option>{units.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row.symbol)} · v{text(row.unit_version)}</option>)}</select></label>
        <label className="field"><span>Approved vocabulary</span><select name="vocabularyVersionId"><option value="">No controlled vocabulary</option>{vocabularies.map((row) => <option key={String(row.id)} value={String(row.id)}>{text(row.title)} · v{text(row.vocabulary_version)}</option>)}</select></label>
        <label className="field full"><span>Allowed quality terms</span><select name="allowedQualityTermIds" multiple size={Math.min(8, Math.max(2, qualityTerms.length))}>{qualityTerms.map((row) => <option key={String(row.id)} value={String(row.id)}>{humanize(row.severity)} · {text(row.display_name)} · v{text(row.quality_version)}</option>)}</select></label>
        <label className="field full"><span>Value contract JSON</span><textarea name="valueContract" required rows={5} defaultValue={'{"type":"number","minimum":0,"maximum":100,"precision":1}'} /></label>
        <label className="field full"><span>Missing-value policy JSON</span><textarea name="missingPolicy" required rows={4} defaultValue={'{"allowed":false,"allowedReasons":[]}'} /></label>
        <label className="field full"><span>Applicability JSON</span><textarea name="applicability" required rows={4} defaultValue={'{"allowedAuthorities":["research_draft","authoritative"],"limits":[]}'} /></label>
        <button className="button" type="submit" disabled={!protocols.length || !methods.length}>Create observation-definition draft</button>
      </MutationForm> : null}
    </section>

    <section className="card section-gap">
      <h2>Approval path</h2>
      <ol className="list"><li>Create a content-addressed draft.</li><li>Submit it from the <Link href="/research/review">independent review queue</Link>.</li><li>A distinct scientific reviewer approves, rejects, or requests changes with rationale.</li><li>Create a release draft that snapshots exact approved versions and hashes.</li><li>Independently review and owner-publish the release.</li></ol>
      <p className="muted">Approved records are immutable. Corrections require a new version and explicit supersession; no historical simulation is rewritten.</p>
    </section>
  </>;
}
