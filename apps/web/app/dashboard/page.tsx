'use client';

import { useCallback, useState } from 'react';

import { FunnelChart } from '../../src/components/funnel-chart.js';
import { KpiCard } from '../../src/components/kpi-card.js';
import { useAuth } from '../../src/hooks/use-auth.js';
import { useApiQuery } from '../../src/hooks/use-api-query.js';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pipeline Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Real-time conversion funnel across all stages
          </p>
        </div>

        <select
          value={icpFilter ?? ''}
          onChange={(e) => setIcpFilter(e.target.value || undefined)}
          className="h-9 rounded-xl border border-border/50 bg-card px-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All ICPs</option>
          {icps.data?.items.map((icp) => (
            <option key={icp.id} value={icp.id}>
              {icp.name}
            </option>
          ))}
        </select>
      </div>

      {funnel.error ? (
        <p className="text-sm text-destructive">{funnel.error}</p>
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
