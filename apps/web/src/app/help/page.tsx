import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../components/page-primitives';
import { requirePrincipal } from '../../lib/session';

export const metadata: Metadata = { title: 'Learn the System' };

const workflow = [
  ['Add the starting variety', 'Create a variety or accession record for each named source. Record where it came from; do not guess its genotype.', '/germplasm/new', 'Add a variety'],
  ['Create a seed lot', 'Record the physical seeds you received or harvested, their quantity, and where they are stored.', '/seed-lots', 'Manage seed lots'],
  ['Register individual plants', 'Give every plant a unique code and connect it to the seed lot it came from. Crosses must reference actual plants.', '/plants', 'Register plants'],
  ['Plan and perform a cross', 'Choose the seed parent and pollen parent, preserve parent direction, and record what actually happened.', '/crosses/new', 'Plan a cross'],
  ['Calculate expected segregation', 'Use explicit genotype evidence or labeled assumptions. Save the result so another breeder can reproduce it.', '/simulation-lab', 'Open simulation lab'],
  ['Measure and select', 'Use structured observations and a written selection plan. Record failures and unexpected results, not only successes.', '/phenotype-capture', 'Record traits'],
] as const;

const glossary = [
  ['Accession', 'A named biological source received from a breeder, vendor, genebank, exchange, or collection.'],
  ['Allele', 'One identifiable version of a locus. An allele name alone does not prove dominance or phenotype.'],
  ['Cross', 'A documented pollination event. The seed parent is maternal; the pollen parent is paternal.'],
  ['Evidence state', 'How strongly a genotype is known: verified, inferred, assumed, unknown, or conflicting.'],
  ['Genotype', 'The allele combination recorded for a locus, such as allele-1 / allele-2.'],
  ['Germplasm', 'The biological starting material and its identity, source, and chain of custody.'],
  ['Locus', 'A defined location or genetic unit in the genome.'],
  ['Phenotype', 'A measured or observed trait. Environment, measurement method, and plant age can affect it.'],
  ['Population plan', 'The number of seeds or plants needed to reach a chosen probability of recovering a target genotype.'],
  ['Provenance', 'The records showing where a claim, seed lot, plant, image, assay, or calculation came from.'],
] as const;

export default async function HelpPage() {
  await requirePrincipal();
  return (
    <>
      <PageHeader eyebrow="Plain-language guide" title="Use Capsicum Intelligence with confidence" description="The system is designed to preserve what you know, what you only suspect, and what the evidence does not support. Start simple and add scientific detail only when you have it." />

      <section className="card">
        <h2>The shortest useful workflow</h2>
        <ol className="timeline">
          {workflow.map(([title, description, href, label], index) => (
            <li key={title}>
              <div className="badge exact">Step {index + 1}</div>
              <div><h3>{title}</h3><p>{description}</p><Link className="inline-link" href={href}>{label}</Link></div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid two section-gap">
        <section className="card">
          <h2>What the system can calculate</h2>
          <ul className="compact-list">
            <li>Exact offspring genotype probabilities from explicitly entered diploid parent genotypes.</li>
            <li>Independent multi-locus combinations within bounded state-space limits.</li>
            <li>Weighted results when parent genotype uncertainty is stated explicitly.</li>
            <li>Population sizes for a chosen chance of recovering at least one target genotype.</li>
            <li>Operational adjustments for germination, survival, observation, and assay success.</li>
          </ul>
          <p><Link className="button section-gap" href="/quick-genetics">Try a teaching calculation</Link></p>
        </section>
        <section className="card">
          <h2>What it will not pretend to know</h2>
          <ul className="compact-list">
            <li>Exact Scoville heat, flavor, yield, disease resistance, fruit shape, or mature color from a single marker.</li>
            <li>Dominance merely because one allele is capitalized.</li>
            <li>A genotype from a photograph or phenotype unless a reviewed model and scope exist.</li>
            <li>Independent assortment when loci are linked or recombination evidence is missing.</li>
            <li>That a probability guarantees the outcome of a particular seed or plant.</li>
          </ul>
        </section>
      </div>

      <section className="card section-gap">
        <h2>Core genetics terms</h2>
        <dl className="definition-grid">
          {glossary.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}
        </dl>
      </section>

      <section className="card section-gap">
        <h2>Good recordkeeping rules</h2>
        <div className="grid two">
          <div><h3>Do</h3><ul className="compact-list"><li>Give every accession, seed lot, plant, and cross a unique code.</li><li>Record parent direction and dates when the work happens.</li><li>Keep assumptions labeled as assumptions.</li><li>Record methods, units, instruments, and environmental context.</li><li>Preserve negative and unexpected results.</li></ul></div>
          <div><h3>Avoid</h3><ul className="compact-list"><li>Reusing codes for different biological material.</li><li>Treating a cultivar name as proof of genotype.</li><li>Combining measurements taken with incompatible methods.</li><li>Editing history to make results look cleaner.</li><li>Publishing phenotype claims without reviewed evidence and scope.</li></ul></div>
        </div>
      </section>
    </>
  );
}
