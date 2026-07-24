import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';
import { ErrorNotice, PageHeader } from '../../../components/page-primitives';
import { queryError } from '../../../lib/presentation';
import { requirePrincipal } from '../../../lib/session';
import { createGermplasmAction } from '../../actions';

export default async function NewGermplasmPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePrincipal();
  const query = await searchParams;
  return <><PageHeader eyebrow="Identity first" title="Add germplasm accession" description="Record the named biological accession and where it came from. This does not assert any genotype." />
    <ErrorNotice message={queryError(query.error)} />
    <MutationForm intent="germplasm.create" className="card form-grid" action={createGermplasmAction}>
      <div className="field"><label htmlFor="materialCode">Accession code</label><input id="materialCode" name="materialCode" placeholder="ACC-2026-001" required /></div>
      <div className="field"><label htmlFor="displayName">Display name</label><input id="displayName" name="displayName" required /></div>
      <div className="field"><label htmlFor="taxon">Taxon</label><input id="taxon" name="taxon" defaultValue="Capsicum annuum" required /></div>
      <div className="field"><label htmlFor="sourceType">Source type</label><select id="sourceType" name="sourceType" defaultValue="vendor"><option value="breeder">Breeder</option><option value="genebank">Genebank</option><option value="vendor">Vendor</option><option value="wild_collection">Wild collection</option><option value="exchange">Exchange</option><option value="unknown">Unknown</option></select></div>
      <div className="field"><label htmlFor="sourceName">Source name</label><input id="sourceName" name="sourceName" /></div>
      <div className="field"><label htmlFor="sourceIdentifier">Source identifier</label><input id="sourceIdentifier" name="sourceIdentifier" /></div>
      <div className="field"><label htmlFor="acquiredAt">When did you receive it?</label><LocalDateTimeInput id="acquiredAt" name="acquiredAt" /><small>Use the best known date. Record uncertainty in the notes.</small></div>
      <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={4} /></div>
      <div className="full"><button className="button" type="submit">Create accession</button></div>
    </MutationForm></>;
}
