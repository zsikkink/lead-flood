'use client';

import { ArrowLeft, Check, Pencil, Plus, X } from 'lucide-react';
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

  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

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
            onKeyDown={(e) => e.key === 'Enter' && save()}
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

export default function IcpDetailPage() {
  const { icpId } = useParams<{ icpId: string }>();
  const { apiClient } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const icp = useApiQuery(
    useCallback(() => apiClient.getIcp(icpId), [apiClient, icpId]),
    [icpId],
  );

  const rules = useApiQuery(
    useCallback(() => apiClient.getIcpRules(icpId), [apiClient, icpId]),
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
            <EditableField
              label=""
              value={profile.name}
              onSave={(val) => handleUpdate('name', val)}
            />
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
