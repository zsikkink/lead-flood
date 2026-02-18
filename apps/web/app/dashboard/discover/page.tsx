'use client';

import type { DiscoveryProvider, IcpProfileResponse, PipelineRunStatus } from '@lead-flood/contracts';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  Rocket,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CustomSelect } from '../../../src/components/custom-select.js';
import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

const PROVIDER_OPTIONS = [
  { value: '', label: 'Auto (Best Match)' },
  { value: 'APOLLO', label: 'Apollo' },
  { value: 'GOOGLE_SEARCH', label: 'Google Search' },
  { value: 'LINKEDIN_SCRAPE', label: 'LinkedIn Scrape' },
  { value: 'COMPANY_SEARCH_FREE', label: 'Company Search' },
];

const LIMIT_OPTIONS = [
  { value: '25', label: '25 leads' },
  { value: '50', label: '50 leads' },
  { value: '100', label: '100 leads' },
  { value: '250', label: '250 leads' },
  { value: '500', label: '500 leads' },
  { value: '1000', label: '1000 leads' },
];

interface RunState {
  runId: string;
  status: PipelineRunStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
}

function StatusIcon({ status }: { status: PipelineRunStatus }) {
  switch (status) {
    case 'QUEUED':
      return <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />;
    case 'RUNNING':
      return <Loader2 className="h-5 w-5 animate-spin text-zbooni-teal" />;
    case 'SUCCEEDED':
      return <CheckCircle2 className="h-5 w-5 text-zbooni-green" />;
    case 'FAILED':
      return <AlertCircle className="h-5 w-5 text-red-400" />;
    case 'PARTIAL':
      return <AlertCircle className="h-5 w-5 text-yellow-400" />;
  }
}

function ProgressBar({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          {processed} / {total} processed
        </span>
        <span className="font-bold text-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zbooni-dark/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-zbooni-green to-zbooni-teal transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IcpPreviewCard({ icp }: { icp: IcpProfileResponse }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zbooni-teal/10">
          <Target className="h-5 w-5 text-zbooni-teal" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{icp.name}</p>
          {icp.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{icp.description}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Industries</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {icp.targetIndustries.length > 0 ? (
              icp.targetIndustries.map((i) => (
                <span key={i} className="rounded-full bg-zbooni-dark/60 px-2 py-0.5 text-xs text-muted-foreground">{i}</span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground/40">Any</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Countries</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {icp.targetCountries.length > 0 ? (
              icp.targetCountries.map((c) => (
                <span key={c} className="rounded-full bg-zbooni-teal/10 px-2 py-0.5 text-xs text-zbooni-teal">{c}</span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground/40">Any</span>
            )}
          </div>
        </div>
        {icp.minCompanySize !== null || icp.maxCompanySize !== null ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Company Size</p>
            <p className="mt-1 text-xs font-medium">
              {icp.minCompanySize ?? 0} - {icp.maxCompanySize ?? '10,000+'}
            </p>
          </div>
        ) : null}
        {icp.requiredTechnologies.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Technologies</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {icp.requiredTechnologies.map((t) => (
                <span key={t} className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">{t}</span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const { apiClient, user } = useAuth();

  // Form state
  const [selectedIcpId, setSelectedIcpId] = useState('');
  const [provider, setProvider] = useState('');
  const [limit, setLimit] = useState('25');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Run tracking
  const [activeRun, setActiveRun] = useState<RunState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load ICPs
  const icps = useApiQuery(
    useCallback(() => apiClient.listIcps({ page: 1, pageSize: 50, isActive: true }), [apiClient]),
  );

  const selectedIcp = icps.data?.items.find((i) => i.id === selectedIcpId) ?? null;

  const icpOptions = [
    { value: '', label: 'Select an ICP Profile...' },
    ...(icps.data?.items.map((icp) => ({ value: icp.id, label: icp.name })) ?? []),
  ];

  // Recent discovery records
  const records = useApiQuery(
    useCallback(
      () =>
        apiClient.listDiscoveryRecords({
          page: 1,
          pageSize: 10,
          includeQualityMetrics: true,
          ...(selectedIcpId ? { icpProfileId: selectedIcpId } : {}),
        }),
      [apiClient, selectedIcpId],
    ),
    [selectedIcpId],
  );

  // Poll for run status
  useEffect(() => {
    if (!activeRun || activeRun.status === 'SUCCEEDED' || activeRun.status === 'FAILED') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const status = await apiClient.getDiscoveryRunStatus(activeRun.runId);
        setActiveRun({
          runId: status.runId,
          status: status.status,
          totalItems: status.totalItems,
          processedItems: status.processedItems,
          failedItems: status.failedItems,
          startedAt: status.startedAt,
          endedAt: status.endedAt,
          errorMessage: status.errorMessage,
        });

        if (status.status === 'SUCCEEDED' || status.status === 'FAILED' || status.status === 'PARTIAL') {
          records.refetch();
        }
      } catch {
        // silently retry
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeRun, apiClient, records]);

  const handleStartDiscovery = async () => {
    if (!selectedIcpId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await apiClient.createDiscoveryRun({
        icpProfileId: selectedIcpId,
        ...(provider ? { provider: provider as DiscoveryProvider } : {}),
        limit: parseInt(limit, 10),
        ...(user?.id ? { requestedByUserId: user.id } : {}),
      });

      setActiveRun({
        runId: result.runId,
        status: result.status,
        totalItems: 0,
        processedItems: 0,
        failedItems: 0,
        startedAt: null,
        endedAt: null,
        errorMessage: null,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start discovery');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRunning = activeRun && (activeRun.status === 'QUEUED' || activeRun.status === 'RUNNING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zbooni-green to-zbooni-teal">
            <Rocket className="h-5 w-5 text-zbooni-dark" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Discover Leads</h1>
            <p className="text-sm text-muted-foreground">
              Find new prospects matching your Ideal Customer Profiles
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 text-base font-bold tracking-tight">
          <Search className="h-4 w-4 text-zbooni-teal" />
          Configure Search
        </h2>

        <div className="space-y-5">
          {/* Step 1: Select ICP */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zbooni-teal/10 text-xs font-bold text-zbooni-teal">
                1
              </span>
              <label className="text-sm font-semibold">Select ICP Profile</label>
            </div>
            <CustomSelect
              value={selectedIcpId}
              onChange={setSelectedIcpId}
              options={icpOptions}
              placeholder="Select an ICP Profile..."
            />
          </div>

          {/* ICP Preview */}
          {selectedIcp ? <IcpPreviewCard icp={selectedIcp} /> : null}

          {/* Step 2: Provider */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zbooni-teal/10 text-xs font-bold text-zbooni-teal">
                2
              </span>
              <label className="text-sm font-semibold">Data Source</label>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <CustomSelect
              value={provider}
              onChange={setProvider}
              options={PROVIDER_OPTIONS}
              placeholder="Auto (Best Match)"
            />
          </div>

          {/* Step 3: Limit */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zbooni-teal/10 text-xs font-bold text-zbooni-teal">
                3
              </span>
              <label className="text-sm font-semibold">Number of Leads</label>
            </div>
            <CustomSelect
              value={limit}
              onChange={setLimit}
              options={LIMIT_OPTIONS}
              placeholder="25 leads"
            />
          </div>

          {/* Error */}
          {submitError ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {submitError}
            </div>
          ) : null}

          {/* Launch button */}
          <button
            type="button"
            onClick={handleStartDiscovery}
            disabled={!selectedIcpId || isSubmitting || !!isRunning}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-zbooni-green to-zbooni-teal px-6 py-3 text-sm font-bold text-zbooni-dark shadow-lg shadow-zbooni-green/20 transition-all hover:shadow-xl hover:shadow-zbooni-green/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isSubmitting ? 'Starting...' : isRunning ? 'Discovery Running...' : 'Start Discovery'}
          </button>
        </div>
      </div>

      {/* Active Run Status */}
      {activeRun ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Zap className="h-4 w-4 text-zbooni-green" />
              Discovery Run
            </h2>
            <div className="flex items-center gap-2">
              <StatusIcon status={activeRun.status} />
              <span
                className={`text-sm font-semibold ${
                  activeRun.status === 'SUCCEEDED'
                    ? 'text-zbooni-green'
                    : activeRun.status === 'FAILED'
                      ? 'text-red-400'
                      : 'text-zbooni-teal'
                }`}
              >
                {activeRun.status}
              </span>
            </div>
          </div>

          {/* Progress */}
          {activeRun.totalItems > 0 || activeRun.status === 'RUNNING' ? (
            <ProgressBar processed={activeRun.processedItems} total={activeRun.totalItems || parseInt(limit, 10)} />
          ) : null}

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Total</p>
              <p className="mt-0.5 text-lg font-bold">{activeRun.totalItems}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Processed</p>
              <p className="mt-0.5 text-lg font-bold text-zbooni-green">{activeRun.processedItems}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Failed</p>
              <p className="mt-0.5 text-lg font-bold text-red-400">{activeRun.failedItems}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Duration</p>
              <p className="mt-0.5 text-lg font-bold">
                {activeRun.startedAt
                  ? activeRun.endedAt
                    ? `${Math.round((new Date(activeRun.endedAt).getTime() - new Date(activeRun.startedAt).getTime()) / 1000)}s`
                    : 'Running...'
                  : 'Queued'}
              </p>
            </div>
          </div>

          {/* Error message */}
          {activeRun.errorMessage ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {activeRun.errorMessage}
            </div>
          ) : null}

          {/* Success message */}
          {activeRun.status === 'SUCCEEDED' ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-zbooni-green/10 px-3 py-2 text-sm text-zbooni-green">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Discovery complete! {activeRun.processedItems} leads found. Check the Leads page to review them.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Recent Discovery Records */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
            <Users className="h-4 w-4 text-zbooni-teal" />
            Recent Discoveries
          </h2>
          {records.data?.qualityMetrics ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Emails: <strong className="text-foreground">{records.data.qualityMetrics.validEmailCount}</strong>
              </span>
              <span>
                Industry match:{' '}
                <strong className="text-foreground">
                  {Math.round(records.data.qualityMetrics.industryMatchRate * 100)}%
                </strong>
              </span>
              <span>
                Geo match:{' '}
                <strong className="text-foreground">
                  {Math.round(records.data.qualityMetrics.geoMatchRate * 100)}%
                </strong>
              </span>
            </div>
          ) : null}
        </div>

        {records.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
            Loading records...
          </div>
        ) : null}

        {!records.isLoading && records.data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-zbooni-dark/60">
              <Search className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-muted-foreground/60">No discoveries yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground/40">
              Select an ICP profile above and start discovering leads matching your criteria.
            </p>
          </div>
        ) : null}

        {records.data && records.data.items.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-zbooni-dark/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lead</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {records.data.items.map((record) => (
                  <tr key={record.id} className="border-b border-border/20 last:border-0 transition-colors hover:bg-accent/30">
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-zbooni-teal/10 px-2 py-0.5 text-xs font-medium text-zbooni-teal">
                        {record.provider.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          record.status === 'DISCOVERED'
                            ? 'bg-zbooni-green/15 text-zbooni-green'
                            : record.status === 'DUPLICATE'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : record.status === 'ERROR'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-gray-500/15 text-gray-400'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {record.leadId.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(record.discoveredAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {records.data && records.data.total > 10 ? (
          <p className="mt-3 text-center text-xs text-muted-foreground/60">
            Showing 10 of {records.data.total} records. View all in the Leads page.
          </p>
        ) : null}
      </div>

      {/* How it Works */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold tracking-tight">How Discovery Works</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[
            { step: 1, title: 'Select ICP', desc: 'Choose which customer profile to target', icon: Target },
            { step: 2, title: 'Search & Discover', desc: 'AI scans multiple data sources for matching leads', icon: Search },
            { step: 3, title: 'Enrich & Score', desc: 'Each lead is enriched and scored automatically', icon: TrendingUp },
            { step: 4, title: 'Message & Follow-up', desc: 'Approved messages are sent via email or WhatsApp', icon: Zap },
          ].map(({ step, title, desc, icon: Icon }, idx) => (
            <div key={step} className="relative flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zbooni-teal/10">
                <Icon className="h-5 w-5 text-zbooni-teal" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Step {step}</p>
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">{desc}</p>
              </div>
              {idx < 3 ? (
                <ChevronRight className="absolute -right-2 top-3 hidden h-4 w-4 text-muted-foreground/20 sm:block" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
