'use client';

import { useCallback } from 'react';

import { KpiCard } from '../../../src/components/kpi-card.js';
import { ScoreDistributionChart } from '../../../src/components/score-distribution-chart.js';
import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

export default function AnalyticsPage() {
  const { apiClient } = useAuth();

  const scoreDist = useApiQuery(
    useCallback(() => apiClient.getScoreDistribution(), [apiClient]),
  );

  const modelMetrics = useApiQuery(
    useCallback(() => apiClient.getModelMetrics(), [apiClient]),
  );

  const retrainStatus = useApiQuery(
    useCallback(() => apiClient.getRetrainStatus(), [apiClient]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Model performance and scoring distribution
        </p>
      </div>

      {/* Score Distribution */}
      {scoreDist.data ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            {scoreDist.data.bands.map((band) => (
              <KpiCard key={band.scoreBand} label={band.scoreBand} value={band.count} />
            ))}
          </div>
          <ScoreDistributionChart data={scoreDist.data} />
        </>
      ) : null}
      {scoreDist.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          Loading score distribution...
        </div>
      ) : null}
      {scoreDist.error ? (
        <p className="text-sm text-destructive">{scoreDist.error}</p>
      ) : null}

      {/* Model Metrics */}
      {modelMetrics.data && modelMetrics.data.items.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="p-6 pb-4">
            <h2 className="text-base font-bold tracking-tight">Model Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Version</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Split</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AUC</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Precision</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recall</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">F1</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brier</th>
                </tr>
              </thead>
              <tbody>
                {modelMetrics.data.items.map((m, i) => (
                  <tr key={`${m.modelVersionId}-${m.split}-${i}`} className="border-b border-border/30 last:border-0">
                    <td className="px-6 py-3 font-mono text-xs">{m.versionTag}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.split === 'TEST'
                            ? 'bg-zbooni-teal/15 text-zbooni-teal'
                            : m.split === 'VALIDATION'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : 'bg-purple-500/15 text-purple-400'
                        }`}
                      >
                        {m.split}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{m.auc.toFixed(3)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.precision.toFixed(3)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.recall.toFixed(3)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.f1.toFixed(3)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.brierScore.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Retrain Status */}
      {retrainStatus.data ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight">Retrain Status</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Active Model</p>
              <p className="mt-0.5 font-mono text-xs font-medium">
                {retrainStatus.data.activeModelVersionId
                  ? retrainStatus.data.activeModelVersionId.slice(0, 12) + '...'
                  : 'None'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Current Run</p>
              <p className="mt-0.5 font-medium">
                {retrainStatus.data.currentRun
                  ? retrainStatus.data.currentRun.status
                  : 'Idle'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Last Success</p>
              <p className="mt-0.5 font-medium">
                {retrainStatus.data.lastSuccessfulRun
                  ? new Date(retrainStatus.data.lastSuccessfulRun.endedAt).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Next Scheduled</p>
              <p className="mt-0.5 font-medium">
                {retrainStatus.data.nextScheduledAt
                  ? new Date(retrainStatus.data.nextScheduledAt).toLocaleDateString()
                  : 'Not scheduled'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
