'use client';

import { LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '../hooks/use-auth.js';
import { cn } from '../lib/utils.js';

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Pipeline' },
  { href: '/dashboard/discover', label: 'Discover' },
  { href: '/dashboard/leads', label: 'Leads' },
  { href: '/dashboard/messages', label: 'Messages' },
  { href: '/dashboard/icps', label: 'ICP Profiles' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/discovery', label: 'Discovery Leads' },
  { href: '/discovery/search-tasks', label: 'Search Tasks' },
  { href: '/discovery/jobs', label: 'Jobs' },
] as const;

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Pipeline Overview';
  if (pathname === '/dashboard/discover') return 'Discover Leads';
  if (pathname.startsWith('/dashboard/leads/')) return 'Lead Detail';
  if (pathname === '/dashboard/leads') return 'Leads';
  if (pathname === '/dashboard/messages') return 'Message Queue';
  if (pathname.startsWith('/dashboard/icps/')) return 'ICP Profile';
  if (pathname === '/dashboard/icps') return 'ICP Profiles';
  if (pathname === '/dashboard/analytics') return 'Analytics';

  if (pathname === '/discovery') return 'Discovery Leads';
  if (pathname.startsWith('/discovery/leads/')) return 'Discovery Lead';
  if (pathname === '/discovery/jobs') return 'Discovery Jobs';
  if (pathname.startsWith('/discovery/jobs/')) return 'Job Run Detail';
  if (pathname === '/discovery/search-tasks') return 'Search Tasks';
  if (pathname.startsWith('/discovery/search-tasks/')) return 'Search Task Detail';
  if (pathname === '/discovery/lead-form') return 'Lead Intake';

  return 'Dashboard';
}

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {user.firstName}
                </span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileMenuOpen ? (
        <nav className="border-t border-border/50 p-3 lg:hidden">
          {MOBILE_NAV.map(({ href, label }) => {
            const isActive =
              pathname === href ||
              ((href !== '/dashboard' && href !== '/discovery') &&
                pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
