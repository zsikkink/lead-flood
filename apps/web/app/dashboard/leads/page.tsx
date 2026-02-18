'use client';

import type { LeadScoreBand, LeadStatus } from '@lead-flood/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { LeadStatusBadge } from '../../../src/components/lead-status-badge.js';
import { Pagination } from '../../../src/components/pagination.js';
import { ScoreBandBadge } from '../../../src/components/score-band-badge.js';
import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

const STATUSES: LeadStatus[] = ['new', 'processing', 'enriched', 'messaged', 'replied', 'cold', 'failed'];
const SCORE_BANDS: LeadScoreBand[] = ['HIGH', 'MEDIUM', 'LOW'];

export default function LeadsPage() {
  const { apiClient } = useAuth();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | undefined>(undefined);
  const [scoreBandFilter, setScoreBandFilter] = useState<LeadScoreBand | undefined>(undefined);
  const pageSize = 20;

  const leads = useApiQuery(
    useCallback(
      () =>
        apiClient.listLeads({
          page,
          pageSize,
          includeQualityMetrics: false,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(scoreBandFilter ? { scoreBand: scoreBandFilter } : {}),
        }),
      [apiClient, page, statusFilter, scoreBandFilter],
    ),
    [page, statusFilter, scoreBandFilter],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Leads</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {leads.data ? `${leads.data.total} total leads` : 'Loading...'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter ?? ''}
          onChange={(e) => {
            setStatusFilter((e.target.value || undefined) as LeadStatus | undefined);
            setPage(1);
          }}
          className="h-9 rounded-xl border border-border/50 bg-card px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={scoreBandFilter ?? ''}
          onChange={(e) => {
            setScoreBandFilter((e.target.value || undefined) as LeadScoreBand | undefined);
            setPage(1);
          }}
          className="h-9 rounded-xl border border-border/50 bg-card px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All scores</option>
          {SCORE_BANDS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {leads.error ? (
        <p className="text-sm text-destructive">{leads.error}</p>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Score</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.data?.items.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className="cursor-pointer border-b border-border/30 transition-colors last:border-0 hover:bg-accent/50"
              >
                <td className="px-4 py-3 font-medium">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead.email}</td>
                <td className="px-4 py-3">
                  <LeadStatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.latestScoreBand ? (
                    <ScoreBandBadge band={lead.latestScoreBand} />
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {leads.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
                    Loading leads...
                  </div>
                </td>
              </tr>
            ) : null}
            {!leads.isLoading && leads.data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No leads found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {leads.data ? (
          <div className="px-4 pb-4">
            <Pagination
              page={leads.data.page}
              pageSize={leads.data.pageSize}
              total={leads.data.total}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
