'use client';

import { Calendar, MessageSquare, TrendingUp, Users, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';

import { CustomSelect } from '../../src/components/custom-select.js';
import { FunnelChart } from '../../src/components/funnel-chart.js';
import { KpiCard } from '../../src/components/kpi-card.js';
import { useAuth } from '../../src/hooks/use-auth.js';
import { useApiQuery } from '../../src/hooks/use-api-query.js';

// ── Today summary card ──────────────────────────────────────
interface TodayCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}

function TodayCard({ icon: Icon, label, value, accent }: TodayCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-zbooni-dark/40 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
        <p className="text-lg font-bold tracking-tight">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { apiClient } = useAuth();
  const [icpFilter, setIcpFilter] = useState<string | undefined>(undefined);

  const icps = useApiQuery(
    useCallback(() => apiClient.listIcps(), [apiClient]),
  );

  const funnel = useApiQuery(
    useCallback(
      () => apiClient.getFunnel(icpFilter ? { icpProfileId: icpFilter } : undefined),
      [apiClient, icpFilter],
    ),
    [icpFilter],
  );

  const feedback = useApiQuery(
    useCallback(
      () => apiClient.getFeedbackSummary(icpFilter ? { icpProfileId: icpFilter } : undefined),
      [apiClient, icpFilter],
    ),
    [icpFilter],
  );

  const drafts = useApiQuery(
    useCallback(
      () => apiClient.listDrafts({ approvalStatus: 'PENDING', page: 1, pageSize: 1 }),
      [apiClient],
    ),
  );

  const icpOptions = [
    { value: '', label: 'All ICPs' },
    ...(icps.data?.items.map((icp) => ({ value: icp.id, label: icp.name })) ?? []),
  ];

  // Derive "today" stats from existing data
  const pendingMessages = drafts.data?.total ?? 0;
  const newLeadsToday = funnel.data?.discoveredCount ?? 0;
  const sentToday = funnel.data?.messagesSentCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pipeline Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Real-time conversion funnel across all stages
          </p>
        </div>

        <CustomSelect
          value={icpFilter ?? ''}
          onChange={(v) => setIcpFilter(v || undefined)}
          options={icpOptions}
          placeholder="All ICPs"
        />
      </div>

      {funnel.error ? (
        <p className="text-sm text-destructive">{funnel.error}</p>
      ) : null}

      {/* Today Summary Strip */}
      {funnel.data ? (
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zbooni-teal" />
            <h2 className="text-sm font-bold tracking-tight">Today&apos;s Snapshot</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TodayCard
              icon={Users}
              label="New Leads"
              value={newLeadsToday}
              accent="bg-blue-500/15 text-blue-400"
            />
            <TodayCard
              icon={Zap}
              label="Pending Review"
              value={pendingMessages}
              accent="bg-yellow-500/15 text-yellow-400"
            />
            <TodayCard
              icon={MessageSquare}
              label="Messages Sent"
              value={sentToday}
              accent="bg-zbooni-green/15 text-zbooni-green"
            />
            <TodayCard
              icon={TrendingUp}
              label="Reply Rate"
              value={`${funnel.data.messagesSentCount > 0 ? Math.round((funnel.data.repliesCount / funnel.data.messagesSentCount) * 100) : 0}%`}
              accent="bg-zbooni-teal/15 text-zbooni-teal"
            />
          </div>
        </div>
      ) : null}

      {/* KPI Cards */}
      {funnel.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Discovered" value={funnel.data.discoveredCount} />
          <KpiCard label="Messaged" value={funnel.data.messagesSentCount} />
          <KpiCard label="Replies" value={funnel.data.repliesCount} />
          <KpiCard
            label="Reply Rate"
            value={
              funnel.data.messagesSentCount > 0
                ? Math.round((funnel.data.repliesCount / funnel.data.messagesSentCount) * 100)
                : 0
            }
            sublabel="%"
          />
        </div>
      ) : null}

      {/* Funnel Chart */}
      {funnel.data ? <FunnelChart data={funnel.data} /> : null}

      {/* Feedback Summary */}
      {feedback.data ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight">Feedback Summary</h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: 'Replied', value: feedback.data.repliedCount },
              { label: 'Meetings', value: feedback.data.meetingBookedCount },
              { label: 'Deals Won', value: feedback.data.dealWonCount },
              { label: 'Deals Lost', value: feedback.data.dealLostCount },
              { label: 'Unsubscribed', value: feedback.data.unsubscribedCount },
              { label: 'Bounced', value: feedback.data.bouncedCount },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-0.5 text-xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {funnel.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          Loading pipeline data...
        </div>
      ) : null}
    </div>
  );
}
