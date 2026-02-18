'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '../../src/hooks/use-auth.js';

import './discovery.css';

export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="discovery-shell">
      <header className="discovery-header">
        <div className="discovery-title-group">
          <p className="discovery-kicker">Lead Flood</p>
          <h1 className="discovery-title">Discovery Console</h1>
        </div>
        <nav className="discovery-nav">
          <Link href="/discovery">Leads</Link>
          <Link href="/discovery/search-tasks">Search Tasks</Link>
          <Link href="/discovery/jobs">Jobs</Link>
        </nav>
      </header>
      <section className="discovery-content">{children}</section>
    </main>
  );
}
