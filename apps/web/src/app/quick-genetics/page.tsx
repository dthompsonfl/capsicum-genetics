import type { Metadata } from 'next';
import { PageHeader } from '../../components/page-primitives';
import { requirePrincipal } from '../../lib/session';
import { QuickGeneticsCalculator } from './quick-genetics-calculator';

export const metadata: Metadata = { title: 'Quick Genetics Calculator' };

export default async function QuickGeneticsPage() {
  await requirePrincipal();
  return (
    <>
      <PageHeader eyebrow="Learn by calculating" title="Quick genetics calculator" description="Explore a single-locus cross in plain language before creating permanent breeding records. Results use exact fractions and keep every assumption visible." />
      <QuickGeneticsCalculator />
    </>
  );
}
