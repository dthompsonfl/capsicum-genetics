import type { Metadata } from 'next';
import Link from 'next/link';
import { getMultiFactorStatus } from '@capsicum/application';
import { hasPermission, isPrivilegedWorkspaceRole, type Permission } from '@capsicum/auth';
import { getDatabasePool } from '../lib/database';
import { getOptionalPrincipal } from '../lib/session';
import { signOutAction } from './actions';
import './globals.css';
import { MutationCompletionListener } from '../components/mutation-form';
import { AppNavigation, type NavigationGroup } from '../components/app-navigation';

export const metadata: Metadata = {
  title: {
    default: 'Capsicum Breeding Intelligence',
    template: '%s · Capsicum Breeding Intelligence',
  },
  description: 'Evidence-governed Capsicum breeding records and exact inheritance simulations.',
};

type NavigationItem = {
  href: string;
  label: string;
  description: string;
  permission?: Permission;
};

const navigation: readonly { label: string; links: readonly NavigationItem[] }[] = [
  {
    label: 'Start here',
    links: [
      { href: '/', label: 'Home and next steps', description: 'See what to do next in your breeding program.' },
      { href: '/quick-genetics', label: 'Quick genetics calculator', description: 'Learn and calculate a single-locus cross without creating records.' },
      { href: '/help', label: 'Learn the system', description: 'Plain-language genetics and workflow guidance.' },
    ],
  },
  {
    label: 'Your breeding program',
    links: [
      { href: '/germplasm', label: 'Varieties and accessions', description: 'Record named starting material and its source.', permission: 'material.read' },
      { href: '/seed-lots', label: 'Seed inventory', description: 'Track seed lots, quantities, and storage.', permission: 'material.read' },
      { href: '/plants', label: 'Individual plants', description: 'Track the exact plants used for crosses and observations.', permission: 'material.read' },
      { href: '/crosses', label: 'Crosses', description: 'Plan and document directed pollinations.', permission: 'cross.read' },
      { href: '/selection-plans', label: 'Selection plans', description: 'Define what you will select and how success is measured.', permission: 'cross.read' },
      { href: '/experiments', label: 'Experiments', description: 'Organize repeatable trials and protocols.', permission: 'observation.read' },
    ],
  },
  {
    label: 'Genetics and evidence',
    links: [
      { href: '/simulation-lab', label: 'Simulation lab', description: 'Run exact, evidence-labeled inheritance calculations.', permission: 'simulation.run' },
      { href: '/simulations', label: 'Saved simulations', description: 'Review reproducible simulation results.', permission: 'simulation.read' },
      { href: '/phenotype-capture', label: 'Record traits', description: 'Capture structured phenotype measurements.', permission: 'observation.write' },
      { href: '/phenotypes/images', label: 'Plant and fruit media', description: 'Manage inspected scientific images.', permission: 'media.read' },
      { href: '/scientific-catalog', label: 'Scientific catalog', description: 'Review approved loci, alleles, claims, and rules.', permission: 'catalog.read' },
      { href: '/research/review', label: 'Evidence review', description: 'Review scientific sources before they become authoritative.', permission: 'catalog.review' },
      { href: '/research-assistant', label: 'Research assistant', description: 'Ask questions against approved evidence with abstention.', permission: 'research.ask' },
    ],
  },
  {
    label: 'Records and administration',
    links: [
      { href: '/breeding-ledger', label: 'Breeding ledger', description: 'Audit the biological chain of custody.', permission: 'material.read' },
      { href: '/reports', label: 'Reports and exports', description: 'Create portable records and breeding ledgers.', permission: 'export.create' },
      { href: '/settings/security', label: 'Account security', description: 'Manage multi-factor authentication and sessions.' },
      { href: '/settings/workspace', label: 'Workspace', description: 'Switch workspaces and review your active role.' },
      { href: '/settings/users', label: 'People and access', description: 'Invite people and manage responsibilities.', permission: 'workspace.manage' },
      { href: '/admin/jobs', label: 'Background work', description: 'Review durable imports, exports, and media processing.', permission: 'job.read' },
      { href: '/admin/audit', label: 'Audit history', description: 'Inspect privileged and scientific record changes.', permission: 'audit.read' },
      { href: '/admin/system', label: 'System health', description: 'Review private deployment and dependency readiness.', permission: 'system.read' },
    ],
  },
];

function navigationForRole(role: Parameters<typeof hasPermission>[0]): NavigationGroup[] {
  return navigation
    .map((group) => ({
      label: group.label,
      links: group.links
        .filter((link) => !link.permission || hasPermission(role, link.permission))
        .map(({ href, label, description }) => ({ href, label, description })),
    }))
    .filter((group) => group.links.length > 0);
}

function roleLabel(role: string): string {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const principal = await getOptionalPrincipal();
  const privilegedMfaRequired = Boolean(
    principal
      && process.env.REQUIRE_PRIVILEGED_MFA === 'true'
      && isPrivilegedWorkspaceRole(principal.role),
  );
  const multiFactorStatus = privilegedMfaRequired && principal
    ? await getMultiFactorStatus(getDatabasePool(), principal)
    : null;
  const privilegedMfaMissing = Boolean(
    privilegedMfaRequired
      && principal
      && (!multiFactorStatus?.enabled || !principal.mfaVerifiedAt),
  );
  return (
    <html lang="en">
      <body>
        <MutationCompletionListener />
        <a className="skip-link" href="#main-content">Skip to content</a>
        {principal ? (
          <div className="shell">
            <aside className="sidebar">
              <Link className="brand" href="/">
                <strong>Capsicum Intelligence</strong>
                <span>From seed source to defensible selection decision</span>
              </Link>
              <AppNavigation groups={navigationForRole(principal.role)} />
            </aside>
            <div className="main">
              <header className="topbar">
                <div>
                  <strong>{principal.displayName}</strong>
                  <p>{roleLabel(principal.role)} · protected workspace</p>
                </div>
                <div className="topbar-actions">
                  <Link className="badge exact" href="/help">Science-aware guidance</Link>
                  <form action={signOutAction}><button className="button secondary" type="submit">Sign out</button></form>
                </div>
              </header>
              {privilegedMfaMissing ? (
                <div className="critical-banner" role="alert">
                  <div><strong>{multiFactorStatus?.enabled ? 'Verify this browser session before continuing.' : 'Protect this privileged account before continuing.'}</strong><p>{multiFactorStatus?.enabled ? 'Your account has MFA, but this browser has not completed the second factor for the current session.' : 'Your deployment requires multi-factor authentication. Complete authenticator setup now; protected screens remain closed until setup succeeds.'}</p></div>
                  <Link className="button" href="/settings/security">{multiFactorStatus?.enabled ? 'Verify session' : 'Set up MFA'}</Link>
                </div>
              ) : null}
              <main className="content" id="main-content">
                {children}
                <footer className="support-footer" aria-label="Help and scientific-use guidance">
                  <div><strong>Need help with this screen?</strong><p>Use the plain-language guide for the recommended workflow. Keep facts, assumptions, measurements, and predictions separate.</p></div>
                  <div className="button-row"><Link className="button secondary" href="/help">Open user guide</Link><Link className="button secondary" href="/quick-genetics">Practice genetics</Link></div>
                </footer>
              </main>
            </div>
          </div>
        ) : (
          <main className="auth-shell" id="main-content">{children}</main>
        )}
      </body>
    </html>
  );
}
