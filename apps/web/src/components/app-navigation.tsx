'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavigationGroup {
  label: string;
  links: readonly { href: string; label: string; description?: string }[];
}

function NavigationLinks({ groups }: { groups: readonly NavigationGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary navigation">
      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <span className="nav-label">{group.label}</span>
          {group.links.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} title={link.description}>
                <span>{link.label}</span>
                {link.description ? <small>{link.description}</small> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppNavigation({ groups }: { groups: readonly NavigationGroup[] }) {
  return (
    <>
      <div className="desktop-navigation"><NavigationLinks groups={groups} /></div>
      <details className="mobile-navigation">
        <summary>Open navigation</summary>
        <NavigationLinks groups={groups} />
      </details>
    </>
  );
}
