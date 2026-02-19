'use client';

import { BarChart3, Brain, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { useCallback } from 'react';

import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string | undefined; accent: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${accent}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground/50">{sub}</p> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const { apiClient } = useAuth();

  const funnel = useApiQuery(
    useCallback(() => apiClient.getFunnel(), [apiClient]),
  );

  const feedback = useApiQuery(
    useCallback(() => apiClient.getFeedbackSummary(), [apiClient]),
  );

  const retrainStatus = useApiQuery(
    useCallback(() => apiClient.getRetrainStatus(), [apiClient]),
  );

  const scoreDistribution = useApiQuery(
    useCallback(() => apiClient.getScoreDistribution(), [apiClient]),
  );

  const modelMetrics = useApiQuery(
    useCallback(() => apiClient.getModelMetrics(), [apiClient]),
  );

  const totalMessaged = funnel.data?.messagesSentCount ?? 0;
  const totalReplied = funnel.data?.repliesCount ?? 0;
  const overallReplyRate = totalMessaged > 0 ? Math.round((totalReplied / totalMessaged) * 100) : 0;
  const totalMeetings = funnel.data?.meetingsCount ?? 0;
  const meetingRate = totalReplied > 0 ? Math.round((totalMeetings / totalReplied) * 100) : 0;

  const distributionMax = Math.max(...(scoreDistribution.data?.bands.map((band) => band.count) ?? [0]), 1);
  const metricsItems = [...(modelMetrics.data?.items ?? [])]
    .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Agent Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live analytics from your current database state
        </p>
      </div>

      {funnel.error || feedback.error || retrainStatus.error || scoreDistribution.error || modelMetrics.error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {funnel.error ?? feedback.error ?? retrainStatus.error ?? scoreDistribution.error ?? modelMetrics.error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Messaged" value={String(totalMessaged)} accent="text-foreground" />
        <StatCard label="Total Replies" value={String(totalReplied)} accent="text-zbooni-green" />
        <StatCard label="Reply Rate" value={`${overallReplyRate}%`} accent="text-zbooni-teal" />
        <StatCard label="Meeting Rate" value={`${meetingRate}%`} sub="of replies → meetings" accent="text-purple-400" />
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-zbooni-teal" />
          <h2 className="text-base font-bold tracking-tight">Funnel Stages</h2>
        </div>
        {funnel.data ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <StatCard label="Discovered" value={String(funnel.data.discoveredCount)} accent="text-foreground" />
            <StatCard label="Qualified" value={String(funnel.data.qualifiedCount)} accent="text-zbooni-teal" />
            <StatCard label="Enriched" value={String(funnel.data.enrichedCount)} accent="text-zbooni-green" />
            <StatCard label="Scored" value={String(funnel.data.scoredCount)} accent="text-yellow-400" />
            <StatCard label="Deals Won" value={String(funnel.data.dealsWonCount)} accent="text-purple-400" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60">Loading funnel metrics...</p>
        )}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zbooni-green" />
          <h2 className="text-base font-bold tracking-tight">Score Distribution</h2>
        </div>
        {scoreDistribution.data && scoreDistribution.data.bands.length > 0 ? (
          <div className="space-y-3">
            {scoreDistribution.data.bands.map((band) => {
              const pct = Math.round((band.count / distributionMax) * 100);
              return (
                <div key={band.scoreBand} className="flex items-center gap-3">
                  <p className="w-16 text-xs font-semibold text-muted-foreground">{band.scoreBand}</p>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-zbooni-dark/60">
                    <div
                      className="h-full rounded-full bg-zbooni-teal/70"
                      style={{ width: `${Math.max(pct, band.count > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                  <p className="w-12 text-right text-sm font-bold">{band.count}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60">No score distribution rows yet.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-bold tracking-tight">Scoring Model Status</h2>
          </div>
          {retrainStatus.data ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Active model</span>
                <span className="font-mono text-xs">
                  {retrainStatus.data.activeModelVersionId
                    ? `${retrainStatus.data.activeModelVersionId.slice(0, 12)}...`
                    : 'Deterministic only'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Current run</span>
                <span className="font-medium">
                  {retrainStatus.data.currentRun ? retrainStatus.data.currentRun.status : 'Idle'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Last successful run</span>
                <span>
                  {retrainStatus.data.lastSuccessfulRun
                    ? new Date(retrainStatus.data.lastSuccessfulRun.endedAt).toLocaleString()
                    : 'Not yet'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Next scheduled</span>
                <span>
                  {retrainStatus.data.nextScheduledAt
                    ? new Date(retrainStatus.data.nextScheduledAt).toLocaleString()
                    : 'Not scheduled'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">Loading model status...</p>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-zbooni-green" />
            <h2 className="text-sm font-bold tracking-tight">Feedback Signals</h2>
          </div>
          {feedback.data ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground/60">Replied</p>
                <p className="text-lg font-bold text-zbooni-green">{feedback.data.repliedCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/60">Meetings</p>
                <p className="text-lg font-bold text-zbooni-teal">{feedback.data.meetingBookedCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/60">Deals Won</p>
                <p className="text-lg font-bold text-purple-400">{feedback.data.dealWonCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/60">Deals Lost</p>
                <p className="text-lg font-bold text-red-400">{feedback.data.dealLostCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/60">Unsubscribed</p>
                <p className="text-lg font-bold text-yellow-400">{feedback.data.unsubscribedCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/60">Bounced</p>
                <p className="text-lg font-bold text-muted-foreground">{feedback.data.bouncedCount}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">Loading feedback summary...</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-zbooni-teal" />
          <h2 className="text-base font-bold tracking-tight">Recent Model Metrics</h2>
        </div>
        {metricsItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Split</th>
                  <th className="py-2 pr-4">AUC</th>
                  <th className="py-2 pr-4">PR AUC</th>
                  <th className="py-2 pr-4">F1</th>
                  <th className="py-2 pr-0">Evaluated</th>
                </tr>
              </thead>
              <tbody>
                {metricsItems.map((item) => (
                  <tr key={`${item.modelVersionId}:${item.split}:${item.evaluatedAt}`} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-4">{item.versionTag}</td>
                    <td className="py-2 pr-4">{item.split}</td>
                    <td className="py-2 pr-4">{item.auc.toFixed(3)}</td>
                    <td className="py-2 pr-4">{item.prAuc.toFixed(3)}</td>
                    <td className="py-2 pr-4">{item.f1.toFixed(3)}</td>
                    <td className="py-2 pr-0">{new Date(item.evaluatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60">No model metrics rows found yet.</p>
        )}
      </div>

      {funnel.isLoading && !funnel.data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          Loading analytics data...
        </div>
      ) : null}

      {!funnel.data && !funnel.isLoading && !funnel.error ? (
        <div className="rounded-xl border border-border/30 bg-card px-4 py-3 text-sm text-muted-foreground/70">
          No analytics data found in the current database.
        </div>
      ) : null}
    </div>
  );
}
