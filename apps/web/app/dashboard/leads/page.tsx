'use client';

import type { LeadScoreBand, LeadStatus } from '@lead-flood/contracts';
import { Check, Eye, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { CustomSelect } from '../../../src/components/custom-select.js';
import { LeadStatusBadge } from '../../../src/components/lead-status-badge.js';
import { Pagination } from '../../../src/components/pagination.js';
import { ScoreBandBadge } from '../../../src/components/score-band-badge.js';
import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'processing', label: 'Processing' },
  { value: 'enriched', label: 'Enriched' },
  { value: 'messaged', label: 'Messaged' },
  { value: 'replied', label: 'Replied' },
  { value: 'cold', label: 'Cold' },
  { value: 'failed', label: 'Failed' },
];

const SCORE_OPTIONS = [
  { value: '', label: 'All scores' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

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
        <CustomSelect
          value={statusFilter ?? ''}
          onChange={(v) => {
            setStatusFilter((v || undefined) as LeadStatus | undefined);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
        <CustomSelect
          value={scoreBandFilter ?? ''}
          onChange={(v) => {
            setScoreBandFilter((v || undefined) as LeadScoreBand | undefined);
            setPage(1);
          }}
          options={SCORE_OPTIONS}
          placeholder="All scores"
        />
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
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.data?.items.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border/30 transition-colors last:border-0 hover:bg-accent/50"
              >
                <td
                  className="cursor-pointer px-4 py-3 font-medium"
                  onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                >
                  {lead.firstName} {lead.lastName}
                </td>
                <td
                  className="cursor-pointer px-4 py-3 text-muted-foreground"
                  onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                >
                  {lead.email}
                </td>
                <td className="px-4 py-3">
                  <LeadStatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.latestScoreBand ? (
                    <ScoreBandBadge band={lead.latestScoreBand} />
                  ) : (
                    <span className="text-muted-foreground/40">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                      title="View details"
                      className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {lead.status === 'enriched' || lead.status === 'new' ? (
                      <>
                        <button
                          type="button"
                          title="Approve for messaging"
                          className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-zbooni-green/15 hover:text-zbooni-green"
                          onClick={() => router.push(`/dashboard/messages?lead=${lead.id}`)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Reject lead"
                          className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-red-500/15 hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {leads.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
                    Loading leads...
                  </div>
                </td>
              </tr>
            ) : null}
            {!leads.isLoading && leads.data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
