'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AppShell } from '../../src/components/app-shell.js';
import { cn } from '../../src/lib/utils.js';

import './discovery.css';

const DISCOVERY_NAV = [
  { href: '/discovery', label: 'Leads' },
  { href: '/discovery/search-tasks', label: 'Search Tasks' },
  { href: '/discovery/jobs', label: 'Jobs' },
] as const;

export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zbooni-teal/80">Lead Flood</p>
              <h1 className="text-2xl font-extrabold tracking-tight">Discovery Console</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Real Supabase-backed discovery leads, tasks, and job requests.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {DISCOVERY_NAV.map((item) => {
                const isActive =
                  item.href === '/discovery'
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/20 text-primary'
                        : 'border-border/50 bg-zbooni-dark/30 text-muted-foreground hover:border-primary/25 hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <section className="discovery-content">{children}</section>
      </div>
    </AppShell>
  );
}
