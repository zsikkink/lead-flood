'use client';

import {
  ArrowLeft,
  Brain,
  Building2,
  Check,
  ExternalLink,
  Globe,
  Hash,
  Linkedin,
  Mail,
  MapPin,
  Pencil,
  Phone,
  User,
  Users,
  Briefcase,
  AlertCircle,
  TrendingUp,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { LeadStatusBadge } from '../../../../src/components/lead-status-badge.js';
import { ScoreBandBadge } from '../../../../src/components/score-band-badge.js';
import { useApiQuery } from '../../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../../src/hooks/use-auth.js';

interface EnrichmentField {
  label: string;
  value: string | number | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  href?: string | undefined;
}

interface ScoreInfo {
  blendedScore?: number | undefined;
  scoreBand?: string | undefined;
  reasoning?: string[] | undefined;
}

// ── Editable field component ───────────────────────────────────
interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (val: string) => void;
}

function EditableField({ label, value, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 flex-1 rounded-lg border border-border/50 bg-zbooni-dark/60 px-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          />
          <button type="button" onClick={save} className="rounded-lg p-1 text-zbooni-green hover:bg-zbooni-green/10">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={cancel} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="text-sm font-medium">{value || <span className="text-muted-foreground/30 italic">—</span>}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function extractEnrichmentFields(data: unknown): EnrichmentField[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const fields: EnrichmentField[] = [];

  if (d.email) fields.push({ label: 'Email', value: String(d.email), icon: Mail, href: `mailto:${d.email}` });
  if (d.phone || d.mobile_phone || d.phone_number)
    fields.push({ label: 'Phone', value: String(d.phone ?? d.mobile_phone ?? d.phone_number), icon: Phone, href: `tel:${d.phone ?? d.mobile_phone ?? d.phone_number}` });
  if (d.linkedinUrl || d.linkedin_url || d.linkedin)
    fields.push({ label: 'LinkedIn', value: String(d.linkedinUrl ?? d.linkedin_url ?? d.linkedin), icon: Linkedin, href: String(d.linkedinUrl ?? d.linkedin_url ?? d.linkedin) });
  if (d.companyName || d.company_name || d.organization_name)
    fields.push({ label: 'Company', value: String(d.companyName ?? d.company_name ?? d.organization_name), icon: Building2 });
  if (d.industry)
    fields.push({ label: 'Industry', value: String(d.industry), icon: Briefcase });
  if (d.title || d.job_title || d.position)
    fields.push({ label: 'Position', value: String(d.title ?? d.job_title ?? d.position), icon: User });
  if (d.country)
    fields.push({ label: 'Country', value: String(d.country), icon: MapPin });
  if (d.city)
    fields.push({ label: 'City', value: String(d.city), icon: MapPin });
  if (d.employeeCount || d.employee_count || d.company_size)
    fields.push({ label: 'Company Size', value: String(d.employeeCount ?? d.employee_count ?? d.company_size), icon: Users });
  if (d.domain || d.website)
    fields.push({ label: 'Website', value: String(d.domain ?? d.website), icon: Globe, href: `https://${String(d.domain ?? d.website).replace(/^https?:\/\//, '')}` });
  if (d.avgDealSize)
    fields.push({ label: 'Avg Deal Size', value: String(d.avgDealSize), icon: TrendingUp });
  if (d.whatsappUsage)
    fields.push({ label: 'WhatsApp Usage', value: String(d.whatsappUsage), icon: Phone });

  return fields;
}

function extractScoreInfo(data: unknown): ScoreInfo | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const info = d._scoreInfo;
  if (!info || typeof info !== 'object') return null;
  const s = info as Record<string, unknown>;
  return {
    blendedScore: typeof s.blendedScore === 'number' ? s.blendedScore : undefined,
    scoreBand: typeof s.scoreBand === 'string' ? s.scoreBand : undefined,
    reasoning: Array.isArray(s.reasoning) ? (s.reasoning as string[]) : undefined,
  };
}

function extractRawDetails(data: unknown): Array<{ key: string; value: string }> {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const skipKeys = new Set([
    'email', 'phone', 'mobile_phone', 'phone_number', 'linkedinUrl', 'linkedin_url', 'linkedin',
    'companyName', 'company_name', 'organization_name', 'industry', 'title', 'job_title', 'position',
    'country', 'city', 'employeeCount', 'employee_count', 'company_size', 'domain', 'website',
    'avgDealSize', 'whatsappUsage', '_scoreInfo', 'seasonalPeaks', 'internationalGuests',
    'medicalTourism', 'cohortModel', 'paymentMethod',
  ]);

  return Object.entries(d)
    .filter(([key, val]) => !skipKeys.has(key) && val !== null && val !== undefined && val !== '')
    .map(([key, val]) => ({
      key: key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim(),
      value: typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val),
    }));
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();

  const lead = useApiQuery(
    useCallback(() => apiClient.getLead(id), [apiClient, id]),
    [id],
  );

  const sends = useApiQuery(
    useCallback(() => apiClient.listSends({ leadId: id, page: 1, pageSize: 50 }), [apiClient, id]),
    [id],
  );

  if (lead.error) {
    return <p className="text-sm text-destructive">{lead.error}</p>;
  }

  if (lead.isLoading || !lead.data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        Loading lead...
      </div>
    );
  }

  const l = lead.data;
  const enrichmentFields = extractEnrichmentFields(l.enrichmentData);
  const scoreInfo = extractScoreInfo(l.enrichmentData);
  const additionalDetails = extractRawDetails(l.enrichmentData);

  const scorePercent = scoreInfo?.blendedScore ? Math.round(scoreInfo.blendedScore * 100) : null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {l.firstName} {l.lastName}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{l.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <LeadStatusBadge status={l.status} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <EditableField label="Source" value={l.source.replace(/_/g, ' ')} onSave={() => {}} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Created</p>
            <p className="mt-0.5 font-medium">{new Date(l.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Updated</p>
            <p className="mt-0.5 font-medium">{new Date(l.updatedAt).toLocaleString()}</p>
          </div>
          {/* Score in bottom-right of header */}
          {scoreInfo?.scoreBand ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Lead Score</p>
              <div className="mt-1 flex items-center gap-2">
                <ScoreBandBadge band={scoreInfo.scoreBand as 'HIGH' | 'MEDIUM' | 'LOW'} />
                {scorePercent !== null ? (
                  <span className="text-lg font-bold tabular-nums tracking-tight">{scorePercent}%</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {l.error ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Error</p>
            <p className="mt-0.5 font-medium text-destructive">{l.error}</p>
          </div>
        ) : null}
      </div>

      {/* Score Reasoning */}
      {scoreInfo?.reasoning && scoreInfo.reasoning.length > 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-4 w-4 text-zbooni-teal" />
            Score Reasoning
            {scorePercent !== null ? (
              <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                scoreInfo.scoreBand === 'HIGH' ? 'bg-zbooni-green/15 text-zbooni-green'
                  : scoreInfo.scoreBand === 'MEDIUM' ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-red-500/15 text-red-400'
              }`}>
                {scorePercent}% — {scoreInfo.scoreBand}
              </span>
            ) : null}
          </h2>
          <div className="space-y-2">
            {scoreInfo.reasoning.map((reason, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border/20 bg-zbooni-dark/30 px-3.5 py-2.5"
              >
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < 2 ? 'bg-zbooni-green/20 text-zbooni-green' : 'bg-zbooni-teal/15 text-zbooni-teal'
                }`}>
                  {i + 1}
                </div>
                <p className="text-sm text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Contact & Company Details */}
      {enrichmentFields.length > 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
            <User className="h-4 w-4 text-zbooni-teal" />
            Contact & Company Details
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enrichmentFields.map((field) => {
              const Icon = field.icon;
              return (
                <div
                  key={field.label}
                  className="flex items-start gap-3 rounded-xl border border-border/30 bg-zbooni-dark/40 p-3.5"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zbooni-teal/10">
                    <Icon className="h-4 w-4 text-zbooni-teal" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {field.label}
                    </p>
                    {field.href ? (
                      <a
                        href={field.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 text-sm font-medium text-zbooni-teal transition-colors hover:text-zbooni-green"
                      >
                        <span className="truncate">{field.value}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="mt-0.5 truncate text-sm font-medium">{field.value}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Additional Enrichment Details */}
      {additionalDetails.length > 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
            <Hash className="h-4 w-4 text-zbooni-green" />
            Additional Details
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {additionalDetails.map((detail) => (
              <div
                key={detail.key}
                className="flex items-start gap-3 rounded-lg border border-border/20 bg-zbooni-dark/30 px-3.5 py-2.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 min-w-[100px]">
                  {detail.key}
                </p>
                <p className="text-sm text-muted-foreground break-all">
                  {detail.value.length > 200 ? detail.value.slice(0, 200) + '...' : detail.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* No enrichment data at all */}
      {!l.enrichmentData ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground/60">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">No enrichment data available yet. This lead may still be processing.</p>
          </div>
        </div>
      ) : null}

      {/* Message History */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
          <Mail className="h-4 w-4 text-zbooni-green" />
          Message History
        </h2>

        {sends.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
            Loading messages...
          </div>
        ) : null}

        {!sends.isLoading && sends.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">No messages sent yet.</p>
        ) : null}

        <div className="space-y-0">
          {sends.data?.items.map((send) => (
            <div key={send.id} className="border-b border-border/30 py-3 last:border-0">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    send.status === 'SENT' || send.status === 'DELIVERED'
                      ? 'bg-zbooni-green/15 text-zbooni-green'
                      : send.status === 'FAILED' || send.status === 'BOUNCED'
                        ? 'bg-red-500/15 text-red-400'
                        : send.status === 'REPLIED'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                  }`}
                >
                  {send.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {send.channel} via {send.provider}
                </span>
                {send.sentAt ? (
                  <span className="text-xs text-muted-foreground/60">
                    {new Date(send.sentAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
              {send.failureReason ? (
                <p className="mt-1 text-xs text-destructive">{send.failureReason}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
