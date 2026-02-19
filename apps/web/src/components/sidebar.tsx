'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Rocket,
  Search,
  Target,
  Users,
} from 'lucide-react';

import { cn } from '../lib/utils.js';

const DASHBOARD_NAV_ITEMS = [
  { href: '/dashboard', label: 'Pipeline', icon: LayoutDashboard },
  { href: '/dashboard/discover', label: 'Discover', icon: Rocket },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/dashboard/inbox', label: 'Inbox', icon: Inbox },
  { href: '/dashboard/icps', label: 'ICP Profiles', icon: Target },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
] as const;

const DISCOVERY_NAV_ITEMS = [
  { href: '/discovery', label: 'Discovery Leads', icon: Search },
  { href: '/discovery/search-tasks', label: 'Search Tasks', icon: ListChecks },
  { href: '/discovery/jobs', label: 'Jobs', icon: ClipboardList },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <Image
          src="/zbooni-icon.png"
          alt="Zbooni"
          width={32}
          height={32}
          className="rounded-lg"
          aria-hidden="true"
        />
        <div className="flex flex-col">
          <span className="text-[15px] font-bold leading-tight tracking-tight text-sidebar-foreground">
            Zbooni
          </span>
          <span className="text-[11px] font-medium leading-tight text-muted-foreground">
            Sales OS
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-2 p-3">
        <p className="mb-1 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Dashboard
        </p>
        {DASHBOARD_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px] transition-colors',
                  isActive ? 'text-zbooni-green' : 'text-muted-foreground group-hover:text-sidebar-foreground',
                )}
              />
              {label}
              {isActive ? (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-zbooni-green" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}
        <p className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Discovery Console
        </p>
        {DISCOVERY_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/discovery'
              ? pathname === '/discovery'
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px] transition-colors',
                  isActive ? 'text-zbooni-teal' : 'text-muted-foreground group-hover:text-sidebar-foreground',
                )}
              />
              {label}
              {isActive ? (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-zbooni-teal" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-xl bg-sidebar-accent/50 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Workflow</p>
          <p className="mt-0.5 text-xs font-semibold text-sidebar-foreground">Use Discovery Jobs to populate data</p>
        </div>
      </div>
    </aside>
  );
}
