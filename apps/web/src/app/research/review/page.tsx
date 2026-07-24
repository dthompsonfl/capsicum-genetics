import { MutationForm } from '@/components/mutation-form';
import {
  listCatalogRecords,
  type CatalogEntityType,
} from '@capsicum/application';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { getDatabasePool } from '../../../lib/database';
import { humanize, queryError, text } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';
import { reviewCatalogRecordAction, submitCatalogRecordAction } from '../../actions';

export const dynamic = 'force-dynamic';

type QueueRecord = Record<string, unknown> & {
  entityType: CatalogEntityType;
  id: unknown;
  review_state?: unknown;
  authored_by?: unknown;
};

function label(record: QueueRecord): string {
  return text(record.catalog_id ?? record.allele_key ?? record.variant_key ?? record.marker_key ?? record.assay_key ?? record.claim_id ?? record.source_id ?? record.rule_key ?? record.protocol_key ?? record.method_key ?? record.quality_key ?? record.schema_key ?? record.trait_id ?? record.title ?? record.document_title ?? record.id);
}

export default async function ResearchReviewPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; saved?: string }> }) {
  const principal = await requirePrincipal();
  const pool = getDatabasePool();
  const entityTypes: CatalogEntityType[] = ['scientific_source', 'reference_assembly', 'research_document', 'research_passage', 'locus', 'allele', 'variant', 'marker', 'assay', 'evidence_assertion', 'phenotype_rule', 'capture_protocol', 'observation_method', 'observation_quality_term', 'observation_device_schema', 'observation_definition'];
  const inReview = (await Promise.all(entityTypes.map(async (entityType) =>
    (await listCatalogRecords(pool, principal, entityType, 'in_review', 100)).map((record): QueueRecord => ({ ...record, entityType, id: record.id })),
  ))).flat();
  const editable = (await Promise.all(entityTypes.map(async (entityType) => {
    const [draft, changes] = await Promise.all([
      listCatalogRecords(pool, principal, entityType, 'draft', 100),
      listCatalogRecords(pool, principal, entityType, 'changes_requested', 100),
    ]);
    return [...draft, ...changes].map((record): QueueRecord => ({ ...record, entityType, id: record.id }));
  }))).flat();
  const params = await searchParams;
  const canCurate = ['owner', 'catalog_curator'].includes(principal.role);
  const canReview = ['owner', 'scientific_reviewer'].includes(principal.role);
  return (
    <>
      <PageHeader
        eyebrow="Evidence governance"
        title="Independent review queue"
        description="Submission and decision workflows enforce distinct author/reviewer identities. Approval is stored as an append-only review and revalidated by deferred PostgreSQL constraints."
        action={{ href: '/scientific-catalog', label: 'Browse catalog' }}
      />
      <ErrorNotice message={queryError(params.error)} />
      {params.saved ? <div className="notice">The governed review transition completed.</div> : null}
      <div className="grid two section-gap">
        <section className="card">
          <h2>Ready to submit</h2>
          <p className="muted">Draft and changes-requested records must be submitted before an independent reviewer can decide them.</p>
          {!canCurate ? <div className="notice">Your role can inspect this queue but cannot submit catalog records.</div> : null}
          {editable.length ? <div className="stack">
            {editable.map((record) => <article className="record-card" key={`${record.entityType}:${String(record.id)}`}>
              <div><strong>{label(record)}</strong><br /><span className="muted">{humanize(record.entityType)} · {humanize(record.review_state)}</span></div>
              {canCurate ? <MutationForm intent="catalog.submit" action={submitCatalogRecordAction}>
                <input type="hidden" name="entityType" value={record.entityType} />
                <input type="hidden" name="entityId" value={String(record.id)} />
                <button className="button secondary" type="submit">Submit for review</button>
              </MutationForm> : null}
            </article>)}
          </div> : <p className="muted">No draft records are waiting for submission.</p>}
        </section>
        <section className="card">
          <h2>Awaiting independent decision</h2>
          <p className="muted">The database rejects self-approval even if a client attempts to bypass this interface.</p>
          {!canReview ? <div className="notice">Your role can inspect but cannot issue scientific review decisions.</div> : null}
          {inReview.length ? <div className="stack">
            {inReview.map((record) => <article className="record-card" key={`${record.entityType}:${String(record.id)}`}>
              <div><strong>{label(record)}</strong><br /><span className="muted">Author: <code>{text(record.authored_by)}</code></span></div>
              {canReview ? <MutationForm intent="catalog.review" action={reviewCatalogRecordAction} className="form-grid">
                <input type="hidden" name="entityType" value={record.entityType} />
                <input type="hidden" name="entityId" value={String(record.id)} />
                <input type="hidden" name="authorUserId" value={String(record.authored_by)} />
                <label className="field"><span>Decision</span><select name="decision" required defaultValue="approved"><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option></select></label>
                <label className="field"><span>Scientific rationale</span><textarea name="rationale" required minLength={10} maxLength={4000} rows={4} /></label>
                <button className="button" type="submit">Record independent decision</button>
              </MutationForm> : null}
            </article>)}
          </div> : <p className="muted">No records are currently in review.</p>}
        </section>
      </div>
      <section className="card section-gap">
        <h2>What approval does not mean</h2>
        <ul className="list">
          <li>Approval does not infer genotype from a cultivar name, phenotype, vendor description, or AI answer.</li>
          <li>Approved source prose is not executable code.</li>
          <li>Phenotype rules require their own versioned contract, approved evidence, independent review, and release scope.</li>
          <li>Quantitative heat, yield, disease, genomic, G×E, and learned-vision predictions remain unavailable without validated promoted models.</li>
        </ul>
      </section>
    </>
  );
}
