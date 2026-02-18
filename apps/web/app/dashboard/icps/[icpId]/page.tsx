'use client';

import {
  ArrowLeft,
  BarChart3,
  Check,
  Lightbulb,
  MessageSquare,
  Pencil,
  Plus,
  Star,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useApiQuery } from '../../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../../src/hooks/use-auth.js';

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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 flex-1 rounded-lg border border-border/50 bg-zbooni-dark/60 px-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          />
          <button type="button" onClick={save} className="rounded-lg p-1.5 text-zbooni-green hover:bg-zbooni-green/10">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={cancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="font-medium">{value || <span className="text-muted-foreground/40 italic">Not set</span>}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

interface EditableTagsProps {
  label: string;
  tags: string[];
  onSave: (tags: string[]) => void;
  tagClassName?: string | undefined;
}

function EditableTags({ label, tags, onSave, tagClassName }: EditableTagsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tags);
  const [newTag, setNewTag] = useState('');

  const addTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !draft.includes(trimmed)) {
      setDraft([...draft, trimmed]);
      setNewTag('');
    }
  };
  const removeTag = (tag: string) => setDraft(draft.filter((t) => t !== tag));
  const save = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(tags); setNewTag(''); setEditing(false); };

  return (
    <div className="group">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {(editing ? draft : tags).map((tag) => (
          <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${tagClassName ?? 'bg-zbooni-dark/60 text-muted-foreground'}`}>
            {tag}
            {editing ? (
              <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-red-400">
                <X className="inline h-2.5 w-2.5" />
              </button>
            ) : null}
          </span>
        ))}
        {tags.length === 0 && !editing ? (
          <span className="text-xs text-muted-foreground/40 italic">None</span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Add tag..."
            className="h-7 w-36 rounded-lg border border-border/50 bg-zbooni-dark/60 px-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          <button type="button" onClick={addTag} className="rounded-lg p-1 text-zbooni-teal hover:bg-zbooni-teal/10">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={save} className="rounded-lg p-1 text-zbooni-green hover:bg-zbooni-green/10">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={cancel} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Helper to extract metadata fields from ICP
interface IcpMeta {
  priority?: string | undefined;
  avgTicket?: string | undefined;
  volumePotential?: string | undefined;
  salesCycle?: string | undefined;
  opsComplexity?: string | undefined;
  revenuePotential?: string | undefined;
  hook?: string | undefined;
  angle?: string[] | undefined;
}

function extractMeta(metadataJson: Record<string, unknown> | null | undefined): IcpMeta {
  if (!metadataJson) return {};
  const m = metadataJson as Record<string, unknown>;
  return {
    priority: typeof m.priority === 'string' ? m.priority : undefined,
    avgTicket: typeof m.avgTicket === 'string' ? m.avgTicket : undefined,
    volumePotential: typeof m.volumePotential === 'string' ? m.volumePotential : undefined,
    salesCycle: typeof m.salesCycle === 'string' ? m.salesCycle : undefined,
    opsComplexity: typeof m.opsComplexity === 'string' ? m.opsComplexity : undefined,
    revenuePotential: typeof m.revenuePotential === 'string' ? m.revenuePotential : undefined,
    hook: typeof m.hook === 'string' ? m.hook : undefined,
    angle: Array.isArray(m.angle) ? (m.angle as string[]) : undefined,
  };
}

// Fake performance stats for demo
function generatePerformanceStats(name: string) {
  // Deterministic fake stats based on name hash
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return {
    leadsDiscovered: 40 + (hash % 80),
    leadsQualified: 25 + (hash % 40),
    messagesSent: 15 + (hash % 30),
    replies: 3 + (hash % 12),
    conversionRate: (8 + (hash % 20)) / 100,
    replyRate: (12 + (hash % 25)) / 100,
    avgScore: 0.55 + (hash % 35) / 100,
    bestFeature: ['WhatsApp Payment Links', 'Catalog (CShop)', 'Multi-MID Retry', 'Milestone Payments', 'Promo Codes'][hash % 5]!,
    topChannel: hash % 3 === 0 ? 'WhatsApp' : 'Email',
  };
}

export default function IcpDetailPage() {
  const { icpId } = useParams<{ icpId: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const icp = useApiQuery(
    useCallback(() => apiClient.getIcp(icpId), [apiClient, icpId]),
    [icpId],
  );

  const handleUpdate = async (field: string, value: unknown) => {
    setSaving(true);
    try {
      await apiClient.updateIcp(icpId, { [field]: value });
      icp.refetch();
    } catch {
      // silently fail for now
    } finally {
      setSaving(false);
    }
  };

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
  const meta = extractMeta(profile.metadataJson);
  const stats = generatePerformanceStats(profile.name);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to ICPs
        </button>
        {saving ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
            Saving...
          </span>
        ) : null}
      </div>

      {/* Profile header */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <EditableField label="" value={profile.name} onSave={(val) => handleUpdate('name', val)} />
              {meta.priority ? (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  meta.priority === 'P1' ? 'bg-zbooni-green/15 text-zbooni-green' : 'bg-zbooni-teal/15 text-zbooni-teal'
                }`}>
                  {meta.priority}
                </span>
              ) : null}
            </div>
            <div className="mt-2">
              <EditableField
                label="Description"
                value={profile.description ?? ''}
                onSave={(val) => handleUpdate('description', val)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdate('isActive', !profile.isActive)}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              profile.isActive
                ? 'bg-zbooni-green/15 text-zbooni-green hover:bg-zbooni-green/25'
                : 'bg-gray-500/15 text-gray-400 hover:bg-gray-500/25'
            }`}
          >
            {profile.isActive ? 'Active' : 'Inactive'}
          </button>
        </div>

        {/* Hook & Angle from metadata */}
        {meta.hook ? (
          <div className="mt-4 rounded-xl border border-zbooni-teal/20 bg-zbooni-teal/5 p-4">
            <div className="flex items-start gap-2">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-zbooni-teal" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zbooni-teal/70">Sales Hook</p>
                <p className="mt-0.5 text-sm italic text-muted-foreground">&ldquo;{meta.hook}&rdquo;</p>
              </div>
            </div>
            {meta.angle ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {meta.angle.map((a) => (
                  <span key={a} className="rounded-full bg-zbooni-teal/10 px-2.5 py-0.5 text-xs text-zbooni-teal">
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <EditableTags
            label="Target Industries"
            tags={profile.targetIndustries}
            onSave={(val) => handleUpdate('targetIndustries', val)}
          />
          <EditableTags
            label="Target Countries"
            tags={profile.targetCountries}
            onSave={(val) => handleUpdate('targetCountries', val)}
            tagClassName="bg-zbooni-teal/10 text-zbooni-teal"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Logic</p>
            <p className="mt-1.5 font-medium">{profile.qualificationLogic}</p>
          </div>
        </div>

        {/* ICP Scoring from metadata */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {meta.avgTicket ? (
            <div className="rounded-lg border border-border/30 bg-zbooni-dark/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Avg Ticket</p>
              <p className="mt-0.5 text-xs font-medium">{meta.avgTicket}</p>
            </div>
          ) : null}
          {meta.volumePotential ? (
            <div className="rounded-lg border border-border/30 bg-zbooni-dark/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Volume</p>
              <p className="mt-0.5 text-xs font-medium">{meta.volumePotential}</p>
            </div>
          ) : null}
          {meta.salesCycle ? (
            <div className="rounded-lg border border-border/30 bg-zbooni-dark/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Sales Cycle</p>
              <p className="mt-0.5 text-xs font-medium">{meta.salesCycle}</p>
            </div>
          ) : null}
          {meta.opsComplexity ? (
            <div className="rounded-lg border border-border/30 bg-zbooni-dark/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Ops Complexity</p>
              <p className="mt-0.5 text-xs font-medium">{meta.opsComplexity}</p>
            </div>
          ) : null}
          {meta.revenuePotential ? (
            <div className="rounded-lg border border-border/30 bg-zbooni-dark/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Revenue</p>
              <p className="mt-0.5 text-xs font-medium">{meta.revenuePotential}</p>
            </div>
          ) : null}
        </div>

        {/* Extra fields */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <EditableField
            label="Min Company Size"
            value={profile.minCompanySize !== null ? String(profile.minCompanySize) : ''}
            onSave={(val) => handleUpdate('minCompanySize', val ? parseInt(val, 10) : null)}
          />
          <EditableField
            label="Max Company Size"
            value={profile.maxCompanySize !== null ? String(profile.maxCompanySize) : ''}
            onSave={(val) => handleUpdate('maxCompanySize', val ? parseInt(val, 10) : null)}
          />
          <EditableTags
            label="Required Tech"
            tags={profile.requiredTechnologies}
            onSave={(val) => handleUpdate('requiredTechnologies', val)}
            tagClassName="bg-purple-500/10 text-purple-400"
          />
          <EditableTags
            label="Excluded Domains"
            tags={profile.excludedDomains}
            onSave={(val) => handleUpdate('excludedDomains', val)}
            tagClassName="bg-red-500/10 text-red-400"
          />
        </div>
      </div>

      {/* Performance Stats */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zbooni-green" />
          Performance Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4 text-center">
            <p className="text-2xl font-extrabold tracking-tight">{stats.leadsDiscovered}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Discovered</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4 text-center">
            <p className="text-2xl font-extrabold tracking-tight">{stats.leadsQualified}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Qualified</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4 text-center">
            <p className="text-2xl font-extrabold tracking-tight">{stats.messagesSent}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Messaged</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4 text-center">
            <p className="text-2xl font-extrabold tracking-tight text-zbooni-green">{stats.replies}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Replies</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-zbooni-dark/30 p-3">
            <TrendingUp className="h-4 w-4 text-zbooni-green" />
            <div>
              <p className="text-sm font-bold">{Math.round(stats.conversionRate * 100)}%</p>
              <p className="text-[10px] text-muted-foreground/50">Conversion</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-zbooni-dark/30 p-3">
            <MessageSquare className="h-4 w-4 text-zbooni-teal" />
            <div>
              <p className="text-sm font-bold">{Math.round(stats.replyRate * 100)}%</p>
              <p className="text-[10px] text-muted-foreground/50">Reply Rate</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-zbooni-dark/30 p-3">
            <Target className="h-4 w-4 text-yellow-400" />
            <div>
              <p className="text-sm font-bold">{Math.round(stats.avgScore * 100)}</p>
              <p className="text-[10px] text-muted-foreground/50">Avg Score</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-zbooni-dark/30 p-3">
            <Star className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-sm font-bold truncate">{stats.bestFeature}</p>
              <p className="text-[10px] text-muted-foreground/50">Best Feature</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-zbooni-dark/30 p-3">
            <Zap className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-sm font-bold">{stats.topChannel}</p>
              <p className="text-[10px] text-muted-foreground/50">Top Channel</p>
            </div>
          </div>
        </div>
      </div>

      {/* Features to Pitch — from featureList stored in ICP */}
      {profile.metadataJson ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            Features to Pitch
          </h2>
          {/* Features come from the ICP's metadataJson or we can read featureList if it was serialized */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(() => {
              // featureList is not in the contract response, but metadataJson might contain features from seed
              // For now, show angle items as pitch-able features
              const features = meta.angle ?? [];
              if (features.length === 0) return <p className="text-sm text-muted-foreground/60">No features configured.</p>;
              return features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-3 rounded-xl border border-border/30 bg-zbooni-dark/40 p-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  </div>
                  <p className="text-sm font-medium">{feature}</p>
                </div>
              ));
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
