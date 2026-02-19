'use client';

import type { ConversationEntry, ConversationResponse, MessageSendResponse } from '@lead-flood/contracts';
import {
  Inbox as InboxIcon,
  Mail,
  MessageSquare,
  Phone,
  Search,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

// ── Classification badge colors ────────────────────
function classificationColor(classification: string | null): string {
  switch (classification) {
    case 'INTERESTED': return 'bg-emerald-500/15 text-emerald-400';
    case 'NOT_INTERESTED': return 'bg-red-500/15 text-red-400';
    case 'OUT_OF_OFFICE': return 'bg-yellow-500/15 text-yellow-400';
    case 'UNSUBSCRIBE': return 'bg-red-500/15 text-red-400';
    default: return 'bg-muted/20 text-muted-foreground';
  }
}

function channelBadge(channel: string): string {
  return channel === 'WHATSAPP'
    ? 'bg-emerald-500/15 text-emerald-400'
    : 'bg-blue-500/15 text-blue-400';
}

// ── Types ────────────────────────────────────────────
interface LeadConversationSummary {
  leadId: string;
  leadName: string;
  leadEmail: string;
  lastMessage: string;
  lastTimestamp: string;
  channel: string;
  replyCount: number;
}

export default function InboxPage() {
  const { apiClient } = useAuth();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');

  // Fetch all recent sends to build conversation list
  const sends = useApiQuery(
    useCallback(() => apiClient.listSends({ page: 1, pageSize: 100 }), [apiClient]),
    [],
  );

  // Fetch conversation for selected lead
  const conversation = useApiQuery(
    useCallback(
      () => (selectedLeadId ? apiClient.getConversation(selectedLeadId) : Promise.resolve({ leadId: '', entries: [] } as ConversationResponse)),
      [apiClient, selectedLeadId],
    ),
    [selectedLeadId],
  );

  // Build conversation summaries grouped by lead
  const summaries = useMemo((): LeadConversationSummary[] => {
    if (!sends.data?.items) return [];

    const byLead = new Map<string, MessageSendResponse[]>();
    for (const send of sends.data.items) {
      const existing = byLead.get(send.leadId) ?? [];
      existing.push(send);
      byLead.set(send.leadId, existing);
    }

    const result: LeadConversationSummary[] = [];
    for (const [leadId, leadSends] of byLead) {
      const sorted = leadSends.sort((a, b) =>
        new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime(),
      );
      const latest = sorted[0];
      if (!latest) continue;

      const replyCount = leadSends.filter((s) => s.status === 'REPLIED').length;

      result.push({
        leadId,
        leadName: leadId.slice(0, 8), // Will be replaced with real lead name when we enrich the data
        leadEmail: '',
        lastMessage: `${latest.channel} — ${latest.status}`,
        lastTimestamp: latest.sentAt ?? latest.createdAt,
        channel: latest.channel,
        replyCount,
      });
    }

    return result.sort((a, b) =>
      new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime(),
    );
  }, [sends.data]);

  // Filter summaries
  const filtered = useMemo(() => {
    let items = summaries;
    if (channelFilter !== 'ALL') {
      items = items.filter((s) => s.channel === channelFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (s) => s.leadName.toLowerCase().includes(q) || s.leadEmail.toLowerCase().includes(q) || s.leadId.toLowerCase().includes(q),
      );
    }
    return items;
  }, [summaries, channelFilter, searchQuery]);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
      {/* Left panel: conversation list */}
      <div className="flex w-[360px] shrink-0 flex-col border-r border-border/50">
        {/* Search + filter */}
        <div className="space-y-2 border-b border-border/50 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-lg border border-border/50 bg-zbooni-dark/40 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-1.5">
            {['ALL', 'EMAIL', 'WHATSAPP'].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannelFilter(ch)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  channelFilter === ch
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {ch === 'ALL' ? 'All' : ch === 'EMAIL' ? 'Email' : 'WhatsApp'}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {sends.isLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
              <span className="ml-2">Loading...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <InboxIcon className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60">No conversations yet</p>
            </div>
          ) : (
            filtered.map((summary) => (
              <button
                key={summary.leadId}
                type="button"
                onClick={() => setSelectedLeadId(summary.leadId)}
                className={`w-full border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-muted/10 ${
                  selectedLeadId === summary.leadId ? 'bg-muted/15' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{summary.leadName}</p>
                  <div className="flex items-center gap-1.5">
                    {summary.replyCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zbooni-green/20 px-1.5 text-[10px] font-bold text-zbooni-green">
                        {summary.replyCount}
                      </span>
                    ) : null}
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${channelBadge(summary.channel)}`}>
                      {summary.channel === 'WHATSAPP' ? <Phone className="h-2.5 w-2.5" /> : <Mail className="h-2.5 w-2.5" />}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{summary.lastMessage}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/40">
                  {new Date(summary.lastTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: conversation thread */}
      <div className="flex flex-1 flex-col">
        {!selectedLeadId ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/60">Select a conversation to view</p>
            </div>
          </div>
        ) : conversation.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="border-b border-border/50 px-6 py-4">
              <h2 className="text-sm font-semibold">Conversation with {selectedLeadId.slice(0, 8)}</h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {conversation.data?.entries.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground/60">No messages in this conversation</p>
              ) : null}

              {conversation.data?.entries.map((entry: ConversationEntry, i: number) => (
                <div
                  key={i}
                  className={`flex ${entry.type === 'sent' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      entry.type === 'sent'
                        ? 'bg-blue-600/20 text-foreground'
                        : 'bg-muted/30 text-foreground'
                    }`}
                  >
                    {entry.subject ? (
                      <p className="mb-1 text-xs font-semibold text-muted-foreground/70">
                        Subject: {entry.subject}
                      </p>
                    ) : null}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.bodyText}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${channelBadge(entry.channel)}`}>
                        {entry.channel}
                      </span>
                      {entry.replyClassification ? (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${classificationColor(entry.replyClassification)}`}>
                          {entry.replyClassification}
                        </span>
                      ) : null}
                      {entry.status ? (
                        <span className="text-[10px] text-muted-foreground/50">{entry.status}</span>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground/40">
                        {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
