import { MutationForm } from '@/components/mutation-form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMaterialDetail } from '@capsicum/application';
import { DefinitionList, ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { formatDate, humanize, queryError, text } from '../../../lib/presentation';
import { getDatabasePool } from '../../../lib/database';
import { requirePrincipal } from '../../../lib/session';
import { recordGenotypeCallAction } from '../../actions';

export const dynamic = 'force-dynamic';
export default async function PlantDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ error?: string }> }) {
  const principal = await requirePrincipal(); const { id } = await params; const query = await searchParams;
  const record = await getMaterialDetail(getDatabasePool(), principal, id) as (Record<string, unknown> & { genotypeCalls?: Record<string, unknown>[] }) | null;
  if (!record || record.kind !== 'plant') notFound();
  return <><PageHeader eyebrow="Plant" title={String(record.material_code)} description="Individual plant identity, inventory-backed origin, location history, deterministic labels, and immutable versioned genotype evidence." />
    <ErrorNotice message={queryError(query.error)} />
    <section className="card"><DefinitionList entries={[["Status", humanize(record.status)], ["Source seed lot", <Link className="inline-link" href={`/seed-lots/${String(record.source_seed_lot_material_id)}`} key="lot">{text(record.source_seed_lot_material_id)}</Link>], ["Created", formatDate(record.created_at)]]} /></section>
    <section className="card section-gap"><h2>Current genotype calls</h2>{record.genotypeCalls?.length ? <div className="table-wrap"><table><thead><tr><th>Locus</th><th>Alleles</th><th>Basis</th><th>Version</th><th>Assay</th></tr></thead><tbody>{record.genotypeCalls.map((call) => <tr key={String(call.id)}><td>{text(call.locus_catalog_id)}</td><td className="mono">{text(call.allele_one)} / {text(call.allele_two)}</td><td>{humanize(call.call_basis ?? call.evidence_state)}</td><td>{text(call.call_version)}</td><td>{text(call.assay_method)}</td></tr>)}</tbody></table></div> : <p className="muted">No genotype evidence has been recorded.</p>}</section>
    <section className="card section-gap"><h2>Record genotype evidence</h2><p className="muted">A new call supersedes the current call at the same locus; history remains immutable.</p><MutationForm intent="genotype.record" className="form-grid" action={recordGenotypeCallAction}><input type="hidden" name="materialId" value={id} />
      <div className="field"><label htmlFor="locusCatalogId">Locus identifier</label><input id="locusCatalogId" name="locusCatalogId" required /></div>
      <div className="field"><label htmlFor="evidenceState">Evidence state</label><select id="evidenceState" name="evidenceState"><option value="unknown">Unknown</option><option value="assumed">Assumed</option><option value="inferred">Inferred</option><option value="verified">Verified assay</option><option value="conflicting">Conflicting</option></select></div>
      <div className="field"><label htmlFor="evidenceBasis">Evidence basis</label><select id="evidenceBasis" name="evidenceBasis"><option value="user_assumption">User assumption</option><option value="pedigree_inference">Pedigree inference</option><option value="phenotype_inference">Phenotype inference</option><option value="marker_supported">Marker supported</option><option value="verified_genotype">Verified genotype</option><option value="imported_claim">Imported claim</option><option value="unknown">Unknown</option><option value="conflicting">Conflicting</option></select></div>
      <div className="field"><label htmlFor="alleleOne">Historical allele notation 1</label><input id="alleleOne" name="alleleOne" required /></div><div className="field"><label htmlFor="alleleTwo">Historical allele notation 2</label><input id="alleleTwo" name="alleleTwo" required /></div>
      <div className="field"><label htmlFor="phaseState">Phase</label><select id="phaseState" name="phaseState"><option value="unknown">Unknown</option><option value="known_unphased">Known, unphased</option><option value="known_phased">Known and phased</option><option value="conflicting">Conflicting</option></select></div><div className="field"><label htmlFor="ploidy">Ploidy</label><input id="ploidy" name="ploidy" type="number" min="1" max="16" defaultValue="2" /></div>
      <div className="field"><label htmlFor="assayMethod">Assay method</label><input id="assayMethod" name="assayMethod" /></div><div className="field"><label htmlFor="assayIdentifier">Assay identifier</label><input id="assayIdentifier" name="assayIdentifier" /></div>
      <div className="notice full">This form records unresolved historical notation unless a reviewed catalog release and normalized allele identifiers are selected through the governed catalog workflow. It does not silently promote free text to an approved allele.</div>
      <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={3} /></div><div className="full"><button className="button" type="submit">Record call</button></div></MutationForm></section>
    <p><Link className="inline-link" href={`/pedigrees/${id}`}>View pedigree</Link></p></>;
}
