'use client';

import type { MessageApprovalStatus } from '@lead-flood/contracts';
import { useCallback, useState } from 'react';

import { CustomSelect } from '../../../src/components/custom-select.js';
import { MessageDraftCard } from '../../../src/components/message-draft-card.js';
import { Pagination } from '../../../src/components/pagination.js';
import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

const APPROVAL_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'AUTO_APPROVED', label: 'Auto-Approved' },
];

export default function MessagesPage() {
  const { apiClient } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<MessageApprovalStatus | undefined>('PENDING');

  const drafts = useApiQuery(
    useCallback(
      () =>
        apiClient.listDrafts({
          page,
          pageSize: 10,
          ...(statusFilter ? { approvalStatus: statusFilter } : {}),
        }),
      [apiClient, page, statusFilter],
    ),
    [page, statusFilter],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Message Queue</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {drafts.data ? `${drafts.data.total} drafts` : 'Loading...'}
          </p>
        </div>
        <CustomSelect
          value={statusFilter ?? ''}
          onChange={(v) => {
            setStatusFilter((v || undefined) as MessageApprovalStatus | undefined);
            setPage(1);
          }}
          options={APPROVAL_OPTIONS}
          placeholder="All statuses"
        />
      </div>

      {drafts.error ? (
        <p className="text-sm text-destructive">{drafts.error}</p>
      ) : null}

      {drafts.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          Loading drafts...
        </div>
      ) : null}

      <div className="space-y-4">
        {drafts.data?.items.map((draft) => (
          <MessageDraftCard key={draft.id} draft={draft} onAction={drafts.refetch} />
        ))}
      </div>

      {!drafts.isLoading && drafts.data?.items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground/60">
            {statusFilter === 'PENDING'
              ? 'No pending messages to review.'
              : 'No messages found.'}
          </p>
        </div>
      ) : null}

      {drafts.data && drafts.data.total > 10 ? (
        <Pagination
          page={drafts.data.page}
          pageSize={drafts.data.pageSize}
          total={drafts.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
