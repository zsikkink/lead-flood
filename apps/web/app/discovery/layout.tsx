import type { ReactNode } from 'react';
import Link from 'next/link';

import './discovery.css';

export default function DiscoveryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="discovery-shell">
      <header className="discovery-header">
        <div className="discovery-title-group">
          <p className="discovery-kicker">Lead Flood</p>
          <h1 className="discovery-title">Discovery Console</h1>
        </div>
        <nav className="discovery-nav">
          <Link href="/discovery/lead-form">Lead Intake</Link>
          <Link href="/discovery">Leads</Link>
          <Link href="/discovery/search-tasks">Search Tasks</Link>
          <Link href="/discovery/jobs">Jobs</Link>
        </nav>
      </header>
      <section className="discovery-content">{children}</section>
    </main>
  );
}
