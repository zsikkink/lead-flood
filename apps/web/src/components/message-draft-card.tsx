'use client';

import type { MessageDraftResponse, MessageVariantResponse } from '@lead-flood/contracts';
import { Check, ChevronDown, ChevronUp, Pencil, Send, X } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../hooks/use-auth.js';

interface MessageDraftCardProps {
  draft: MessageDraftResponse;
  leadName?: string | undefined;
  leadEmail?: string | undefined;
  onAction: () => void;
}

function VariantEditor({
  variant,
  isPending,
  isApproved,
  actionInProgress,
  onApprove,
  onSend,
}: {
  variant: MessageVariantResponse;
  isPending: boolean;
  isApproved: boolean;
  actionInProgress: string | null;
  onApprove: (variantId: string) => void;
  onSend: (variantId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(variant.subject ?? '');
  const [editBody, setEditBody] = useState(variant.bodyText);
  const [savedSubject, setSavedSubject] = useState(variant.subject ?? '');
  const [savedBody, setSavedBody] = useState(variant.bodyText);

  const handleSave = () => {
    setSavedSubject(editSubject);
    setSavedBody(editBody);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditSubject(savedSubject);
    setEditBody(savedBody);
    setIsEditing(false);
  };

  const displaySubject = isEditing ? editSubject : savedSubject;
  const displayBody = isEditing ? editBody : savedBody;

  return (
    <div className="rounded-xl border border-border/50 bg-zbooni-dark/40 p-4 transition-colors hover:border-border/70">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {variant.variantKey}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              variant.channel === 'WHATSAPP'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-blue-500/15 text-blue-400'
            }`}
          >
            {variant.channel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {variant.qualityScore !== null ? (
            <span className="text-xs text-muted-foreground">
              Q: {(variant.qualityScore * 100).toFixed(0)}%
            </span>
          ) : null}
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-muted-foreground"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          {variant.channel === 'EMAIL' ? (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground/60">Subject</label>
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground/60">Body</label>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={6}
              className="w-full resize-y rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-lg bg-zbooni-green/20 px-3 py-1.5 text-xs font-semibold text-zbooni-green transition-colors hover:bg-zbooni-green/30"
            >
              <Check className="h-3 w-3" /> Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1 rounded-lg bg-muted/20 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/30"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {displaySubject ? (
            <p className="mb-1.5 text-sm font-medium text-foreground/90">Subject: {displaySubject}</p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{displayBody}</p>
        </>
      )}

      {!isEditing ? (
        <div className="mt-3 flex gap-2">
          {isPending ? (
            <button
              type="button"
              disabled={!!actionInProgress}
              onClick={() => onApprove(variant.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-zbooni-green/20 px-3 py-1.5 text-xs font-semibold text-zbooni-green transition-colors hover:bg-zbooni-green/30 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Approve
            </button>
          ) : null}
          {isApproved ? (
            <button
              type="button"
              disabled={!!actionInProgress}
              onClick={() => onSend(variant.id)}
              className="zbooni-gradient-bg inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-zbooni-dark transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-3 w-3" /> Send
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MessageDraftCard({ draft, leadName, leadEmail, onAction }: MessageDraftCardProps) {
  const { apiClient, user } = useAuth();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  // Extract a preview from the first variant
  const previewVariant = draft.variants[0];
  const previewText = previewVariant
    ? previewVariant.bodyText.length > 120
      ? `${previewVariant.bodyText.slice(0, 120)}...`
      : previewVariant.bodyText
    : 'No variants';

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-sm transition-all">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-muted/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">
              {previewVariant?.subject ?? 'WhatsApp message'}
            </p>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
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
          <p className="mt-1 text-xs text-muted-foreground/60">
            {leadName || leadEmail ? `${leadName ?? ''} ${leadEmail ? `(${leadEmail})` : ''}`.trim() + ' · ' : ''}
            {draft.variants.length} variant{draft.variants.length !== 1 ? 's' : ''}
            {' · '}{draft.generatedByModel}
          </p>
          {!expanded ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground/80">{previewText}</p>
          ) : null}
        </div>
        <div className="ml-4 shrink-0 text-muted-foreground/40">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded ? (
        <div className="border-t border-border/30 p-5 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {draft.variants.map((variant) => (
              <VariantEditor
                key={variant.id}
                variant={variant}
                isPending={isPending}
                isApproved={isApproved}
                actionInProgress={actionInProgress}
                onApprove={handleApprove}
                onSend={handleSend}
              />
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
      ) : null}
    </div>
  );
}
