'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { accountSetQuery, useSavedAccounts } from '@/lib/saved-accounts';

type NavKey = 'home' | 'dashboard' | 'example' | 'help';

const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { key: 'example', label: 'Example', href: '/dashboard?example=1' },
  { key: 'help', label: 'Help', href: '/help' },
];

function activeKey(pathname: string, isExample: boolean): NavKey | null {
  if (pathname === '/') return 'home';
  if (pathname === '/help') return 'help';
  if (pathname === '/dashboard' || pathname === '/gcr') return isExample ? 'example' : 'dashboard';
  return null;
}

function NavLinks({ isExample }: { isExample: boolean }) {
  const pathname = usePathname() ?? '/';
  const active = activeKey(pathname, isExample);
  // "Dashboard" carries the visitor's saved accounts (never the example's).
  const { current } = useSavedAccounts();
  const dashboardHref = current ? `/dashboard?${accountSetQuery(current)}` : '/dashboard';

  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 overflow-x-auto -mx-3 px-0 sm:mx-0">
      {NAV_ITEMS.map(item => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.key === 'dashboard' ? dashboardHref : item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm transition-colors sm:min-h-9 ${
              isActive
                ? 'text-zinc-100 bg-zinc-900'
                : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100 active:bg-zinc-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavLinksWithParams() {
  const searchParams = useSearchParams();
  return <NavLinks isExample={searchParams.get('example') === '1'} />;
}

/** Shared site header: logo + main navigation. Rendered once from the root layout. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center self-start text-base font-semibold tracking-tight text-zinc-100 hover:text-white transition-colors sm:self-auto"
          aria-label="GAMER.ID home"
        >
          GAMER.ID
        </Link>
        {/* useSearchParams needs a Suspense boundary on statically rendered pages. */}
        <Suspense fallback={<NavLinks isExample={false} />}>
          <NavLinksWithParams />
        </Suspense>
      </div>
    </header>
  );
}
