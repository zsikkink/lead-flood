'use client';

import type { MessageDraftResponse } from '@lead-flood/contracts';
import { Check, Send, X } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../hooks/use-auth.js';

interface MessageDraftCardProps {
  draft: MessageDraftResponse;
  onAction: () => void;
}

export function MessageDraftCard({ draft, onAction }: MessageDraftCardProps) {
  const { apiClient, user } = useAuth();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? 'unknown';

  const handleApprove = async (variantId?: string | undefined) => {
    setActionInProgress('approve');
    setError(null);
    try {
      await apiClient.approveDraft(draft.id, {
        approvedByUserId: userId,
        selectedVariantId: variantId,
      });
      onAction();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionInProgress('reject');
    setError(null);
    try {
      await apiClient.rejectDraft(draft.id, {
        rejectedByUserId: userId,
        rejectedReason: rejectReason,
      });
      onAction();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActionInProgress(null);
      setShowReject(false);
    }
  };

  const handleSend = async (variantId: string) => {
    setActionInProgress('send');
    setError(null);
    try {
      await apiClient.sendMessage({
        messageDraftId: draft.id,
        messageVariantId: variantId,
        idempotencyKey: `ui:${draft.id}:${variantId}:${Date.now()}`,
      });
      onAction();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const isPending = draft.approvalStatus === 'PENDING';
  const isApproved = draft.approvalStatus === 'APPROVED' || draft.approvalStatus === 'AUTO_APPROVED';

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-mono text-xs">{draft.leadId.slice(0, 12)}...</span>
          </p>
          <p className="text-xs text-muted-foreground/60">
            Model: {draft.generatedByModel} · Prompt: {draft.promptVersion}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isPending
              ? 'bg-yellow-500/15 text-yellow-400'
              : isApproved
                ? 'bg-zbooni-green/15 text-zbooni-green'
                : 'bg-red-500/15 text-red-400'
          }`}
        >
          {draft.approvalStatus}
        </span>
      </div>

      {/* Variants */}
      <div className="grid gap-4 md:grid-cols-2">
        {draft.variants.map((variant) => (
          <div key={variant.id} className="rounded-xl border border-border/50 bg-zbooni-dark/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {variant.variantKey} ({variant.channel})
              </span>
              {variant.qualityScore !== null ? (
                <span className="text-xs text-muted-foreground">
                  Q: {(variant.qualityScore * 100).toFixed(0)}%
                </span>
              ) : null}
            </div>
            {variant.subject ? (
              <p className="mb-1 text-sm font-medium">Subject: {variant.subject}</p>
            ) : null}
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{variant.bodyText}</p>

            <div className="mt-3 flex gap-2">
              {isPending ? (
                <button
                  type="button"
                  disabled={!!actionInProgress}
                  onClick={() => handleApprove(variant.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-zbooni-green/20 px-3 py-1.5 text-xs font-semibold text-zbooni-green transition-colors hover:bg-zbooni-green/30 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
              ) : null}
              {isApproved ? (
                <button
                  type="button"
                  disabled={!!actionInProgress}
                  onClick={() => handleSend(variant.id)}
                  className="zbooni-gradient-bg inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-zbooni-dark transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> Send
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Reject controls */}
      {isPending ? (
        <div className="mt-4">
          {showReject ? (
            <div className="flex gap-2">
              <label htmlFor={`reject-reason-${draft.id}`} className="sr-only">
                Rejection reason
              </label>
              <input
                id={`reject-reason-${draft.id}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                className="flex-1 rounded-lg border border-border/50 bg-zbooni-dark/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                disabled={!rejectReason.trim() || !!actionInProgress}
                onClick={handleReject}
                className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/80 disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowReject(true)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="h-3 w-3" /> Reject draft
            </button>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
