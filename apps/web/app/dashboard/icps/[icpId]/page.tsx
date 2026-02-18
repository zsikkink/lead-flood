'use client';

import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useApiQuery } from '../../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../../src/hooks/use-auth.js';

export default function IcpDetailPage() {
  const { icpId } = useParams<{ icpId: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();

  const icp = useApiQuery(
    useCallback(() => apiClient.getIcp(icpId), [apiClient, icpId]),
    [icpId],
  );

  const rules = useApiQuery(
    useCallback(() => apiClient.getIcpRules(icpId), [apiClient, icpId]),
    [icpId],
  );

  if (icp.error) {
    return <p className="text-sm text-destructive">{icp.error}</p>;
  }

  if (icp.isLoading || !icp.data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        Loading ICP profile...
      </div>
    );
  }

  const profile = icp.data;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to ICPs
      </button>

      {/* Profile header */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{profile.name}</h1>
            {profile.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              profile.isActive
                ? 'bg-zbooni-green/15 text-zbooni-green'
                : 'bg-gray-500/15 text-gray-400'
            }`}
          >
            {profile.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Target Industries</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.targetIndustries.map((i) => (
                <span key={i} className="rounded-full bg-zbooni-dark/60 px-2 py-0.5 text-xs text-muted-foreground">{i}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Target Countries</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.targetCountries.map((c) => (
                <span key={c} className="rounded-full bg-zbooni-teal/10 px-2 py-0.5 text-xs text-zbooni-teal">{c}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Logic</p>
            <p className="mt-1.5 font-medium">{profile.qualificationLogic}</p>
          </div>
        </div>
      </div>

      {/* Qualification Rules */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold tracking-tight">
          Qualification Rules ({rules.data?.items.length ?? 0})
        </h2>

        {rules.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
            Loading rules...
          </div>
        ) : null}

        <div className="space-y-3">
          {rules.data?.items
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-zbooni-dark/40 p-4"
              >
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {rule.fieldKey} {rule.operator}{' '}
                    {JSON.stringify(rule.valueJson)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      rule.ruleType === 'HARD_FILTER'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-zbooni-teal/15 text-zbooni-teal'
                    }`}
                  >
                    {rule.ruleType}
                  </span>
                  {rule.weight !== null ? (
                    <span className="text-xs text-muted-foreground">
                      w={rule.weight}
                    </span>
                  ) : null}
                  <span
                    className={`h-2 w-2 rounded-full ${
                      rule.isActive ? 'bg-zbooni-green' : 'bg-gray-500'
                    }`}
                    role="img"
                    aria-label={rule.isActive ? 'Active' : 'Inactive'}
                    title={rule.isActive ? 'Active' : 'Inactive'}
                  />
                </div>
              </div>
            ))}
        </div>

        {!rules.isLoading && rules.data?.items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground/60">No qualification rules configured.</p>
        ) : null}
      </div>
    </div>
  );
}
