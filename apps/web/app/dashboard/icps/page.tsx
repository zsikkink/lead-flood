'use client';

import Link from 'next/link';
import { useCallback } from 'react';

import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

export default function IcpsPage() {
  const { apiClient } = useAuth();

  const icps = useApiQuery(
    useCallback(() => apiClient.listIcps({ page: 1, pageSize: 50 }), [apiClient]),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">ICP Profiles</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {icps.data ? `${icps.data.items.length} profiles configured` : 'Loading...'}
        </p>
      </div>

      {icps.error ? (
        <p className="text-sm text-destructive">{icps.error}</p>
      ) : null}

      {icps.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          Loading ICP profiles...
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {icps.data?.items.map((icp) => (
          <Link
            key={icp.id}
            href={`/dashboard/icps/${icp.id}`}
            className="group rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">{icp.name}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  icp.isActive
                    ? 'bg-zbooni-green/15 text-zbooni-green'
                    : 'bg-gray-500/15 text-gray-400'
                }`}
              >
                {icp.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {icp.description ? (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{icp.description}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              {icp.targetIndustries.map((industry) => (
                <span
                  key={industry}
                  className="rounded-full bg-zbooni-dark/60 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {industry}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {icp.targetCountries.map((country) => (
                <span
                  key={country}
                  className="rounded-full bg-zbooni-teal/10 px-2 py-0.5 text-xs text-zbooni-teal"
                >
                  {country}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {!icps.isLoading && icps.data?.items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground/60">No ICP profiles configured.</p>
        </div>
      ) : null}
    </div>
  );
}
