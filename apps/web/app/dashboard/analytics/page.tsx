'use client';

import {
  BarChart3,
  Brain,
  Lightbulb,
  MessageSquare,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useCallback } from 'react';

import { useApiQuery } from '../../../src/hooks/use-api-query.js';
import { useAuth } from '../../../src/hooks/use-auth.js';

// ── Stat card ──────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string | undefined; accent: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-zbooni-dark/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${accent}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground/50">{sub}</p> : null}
    </div>
  );
}

// ── Fake ICP performance data for demo ─────────────────────────
const ICP_PERFORMANCE = [
  { name: 'Luxury & High-Ticket', messaged: 2, replied: 1, meetings: 1, replyRate: 50, bestFeature: 'Multi-MID Retry', channel: 'WhatsApp' },
  { name: 'Gifting & Corporate', messaged: 2, replied: 0, meetings: 0, replyRate: 0, bestFeature: 'Catalog (CShop)', channel: 'Email' },
  { name: 'Events & Weddings', messaged: 2, replied: 1, meetings: 0, replyRate: 50, bestFeature: 'Ticketing Solution', channel: 'WhatsApp' },
  { name: 'Home & Design', messaged: 1, replied: 0, meetings: 0, replyRate: 0, bestFeature: 'Milestone Payments', channel: 'Email' },
  { name: 'Boutique Hospitality', messaged: 1, replied: 0, meetings: 0, replyRate: 0, bestFeature: 'International Cards', channel: 'WhatsApp' },
  { name: 'Premium Wellness', messaged: 0, replied: 0, meetings: 0, replyRate: 0, bestFeature: 'Package Payments', channel: 'Email' },
  { name: 'Coaching & Advisory', messaged: 1, replied: 1, meetings: 0, replyRate: 100, bestFeature: 'Staged Payments', channel: 'WhatsApp' },
  { name: 'Education & Training', messaged: 0, replied: 0, meetings: 0, replyRate: 0, bestFeature: 'Promo Codes', channel: 'Email' },
];

// ── Feature effectiveness data ─────────────────────────────────
const FEATURE_EFFECTIVENESS = [
  { feature: 'WhatsApp Payment Links', pitched: 5, replies: 2, rate: 40 },
  { feature: 'Multi-MID Retry', pitched: 3, replies: 2, rate: 67 },
  { feature: 'Catalog (CShop)', pitched: 4, replies: 1, rate: 25 },
  { feature: 'Milestone Payments', pitched: 2, replies: 1, rate: 50 },
  { feature: 'Promo Codes', pitched: 3, replies: 0, rate: 0 },
  { feature: 'International Cards', pitched: 2, replies: 1, rate: 50 },
];

// ── Agent learning log entries ─────────────────────────────────
const AGENT_INSIGHTS = [
  { type: 'pattern' as const, text: 'WhatsApp outreach gets 2.3x higher reply rate than email for P1 segments', confidence: 'HIGH', date: '2 days ago' },
  { type: 'recommendation' as const, text: 'Shift Events & Weddings to WhatsApp-first — email reply rate is 0% for this segment', confidence: 'MEDIUM', date: '1 day ago' },
  { type: 'pattern' as const, text: 'Leads mentioning "bank transfers" in enrichment data convert 40% higher — they have active payment pain', confidence: 'HIGH', date: '1 day ago' },
  { type: 'recommendation' as const, text: 'Lead Multi-MID Retry as the opening feature for high-ticket segments (AED 5K+) — highest reply correlation', confidence: 'HIGH', date: '12 hours ago' },
  { type: 'observation' as const, text: 'Coaching & Advisory segment shows 100% reply rate but sample size is only 1 — need more data before adjusting scoring weights', confidence: 'LOW', date: '6 hours ago' },
  { type: 'recommendation' as const, text: 'Deprioritize Promo Codes as lead feature in initial outreach — 0% reply rate across 3 pitches', confidence: 'MEDIUM', date: '3 hours ago' },
];

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

  const totalMessaged = funnel.data?.messagesSentCount ?? 0;
  const totalReplied = funnel.data?.repliesCount ?? 0;
  const overallReplyRate = totalMessaged > 0 ? Math.round((totalReplied / totalMessaged) * 100) : 0;
  const totalMeetings = funnel.data?.meetingsCount ?? 0;
  const meetingRate = totalReplied > 0 ? Math.round((totalMeetings / totalReplied) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Agent Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What the self-improving agent is learning from outreach performance
        </p>
      </div>

      {/* Top-level outreach metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Messaged" value={String(totalMessaged)} accent="text-foreground" />
        <StatCard label="Total Replies" value={String(totalReplied)} accent="text-zbooni-green" />
        <StatCard label="Reply Rate" value={`${overallReplyRate}%`} sub="agent target: 15%" accent="text-zbooni-teal" />
        <StatCard label="Meeting Rate" value={`${meetingRate}%`} sub="of replies → meetings" accent="text-purple-400" />
      </div>

      {/* ICP Segment Performance */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center gap-2 p-6 pb-4">
          <Users className="h-4 w-4 text-zbooni-teal" />
          <h2 className="text-base font-bold tracking-tight">Performance by ICP Segment</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Segment</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Messaged</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Replied</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Meetings</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reply Rate</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Best Feature</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Channel</th>
              </tr>
            </thead>
            <tbody>
              {ICP_PERFORMANCE.map((icp) => (
                <tr key={icp.name} className="border-b border-border/30 last:border-0">
                  <td className="px-6 py-3 font-medium">{icp.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{icp.messaged}</td>
                  <td className="px-4 py-3 text-muted-foreground">{icp.replied}</td>
                  <td className="px-4 py-3 text-muted-foreground">{icp.meetings}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${
                      icp.replyRate >= 50 ? 'text-zbooni-green'
                        : icp.replyRate > 0 ? 'text-yellow-400'
                        : 'text-muted-foreground/40'
                    }`}>
                      {icp.messaged > 0 ? `${icp.replyRate}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zbooni-teal/10 px-2 py-0.5 text-[11px] font-semibold text-zbooni-teal">
                      {icp.bestFeature}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      icp.channel === 'WhatsApp' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>
                      {icp.channel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Effectiveness */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zbooni-green" />
          <h2 className="text-base font-bold tracking-tight">Feature Effectiveness</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground/60">
          Which Zbooni features resonate most when pitched in outreach
        </p>
        <div className="space-y-3">
          {FEATURE_EFFECTIVENESS.sort((a, b) => b.rate - a.rate).map((f) => (
            <div key={f.feature} className="flex items-center gap-4">
              <p className="w-44 shrink-0 text-sm font-medium">{f.feature}</p>
              <div className="flex-1">
                <div className="h-6 overflow-hidden rounded-full bg-zbooni-dark/60">
                  <div
                    className="flex h-full items-center rounded-full px-2.5 text-[11px] font-bold"
                    style={{
                      width: `${Math.max(f.rate, 8)}%`,
                      background: f.rate >= 50
                        ? 'linear-gradient(90deg, #7BFF6B, #3CC8E0)'
                        : f.rate > 0
                          ? 'linear-gradient(90deg, #eab308, #f59e0b)'
                          : 'hsl(240 8% 25%)',
                    }}
                  >
                    {f.rate > 0 ? `${f.rate}%` : ''}
                  </div>
                </div>
              </div>
              <p className="w-20 shrink-0 text-right text-xs text-muted-foreground/50">
                {f.replies}/{f.pitched} replies
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Learning Log */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <h2 className="text-base font-bold tracking-tight">Agent Learning Log</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground/60">
          Patterns, observations, and recommendations identified by the self-improving agent
        </p>
        <div className="space-y-3">
          {AGENT_INSIGHTS.map((insight, i) => {
            const typeConfig = {
              pattern: { icon: TrendingUp, label: 'Pattern', color: 'text-zbooni-green bg-zbooni-green/15' },
              recommendation: { icon: Lightbulb, label: 'Recommendation', color: 'text-yellow-400 bg-yellow-500/15' },
              observation: { icon: Target, label: 'Observation', color: 'text-zbooni-teal bg-zbooni-teal/15' },
            }[insight.type];
            const Icon = typeConfig.icon;

            return (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/20 bg-zbooni-dark/30 px-4 py-3">
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${typeConfig.color}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${typeConfig.color}`}>
                      {typeConfig.label}
                    </span>
                    <span className={`text-[10px] font-semibold ${
                      insight.confidence === 'HIGH' ? 'text-zbooni-green'
                        : insight.confidence === 'MEDIUM' ? 'text-yellow-400'
                        : 'text-muted-foreground/50'
                    }`}>
                      {insight.confidence} confidence
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">{insight.date}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Status */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-zbooni-teal" />
            <h2 className="text-sm font-bold tracking-tight">Scoring Model</h2>
          </div>
          {retrainStatus.data ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Active model</span>
                <span className="font-mono text-xs">
                  {retrainStatus.data.activeModelVersionId
                    ? retrainStatus.data.activeModelVersionId.slice(0, 12) + '...'
                    : 'Deterministic only'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Status</span>
                <span className="font-medium">
                  {retrainStatus.data.currentRun ? retrainStatus.data.currentRun.status : 'Idle'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Last trained</span>
                <span>
                  {retrainStatus.data.lastSuccessfulRun
                    ? new Date(retrainStatus.data.lastSuccessfulRun.endedAt).toLocaleDateString()
                    : 'Not yet'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground/60">Next scheduled</span>
                <span>
                  {retrainStatus.data.nextScheduledAt
                    ? new Date(retrainStatus.data.nextScheduledAt).toLocaleDateString()
                    : 'After 50+ labels'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50">Loading...</p>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-zbooni-green" />
            <h2 className="text-sm font-bold tracking-tight">Channel Split</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground/60">WhatsApp outreach</span>
              <span className="font-semibold text-emerald-400">60%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground/60">Email outreach</span>
              <span className="font-semibold text-blue-400">40%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-zbooni-dark/60">
              <div className="flex h-full">
                <div className="h-full rounded-l-full bg-emerald-500/60" style={{ width: '60%' }} />
                <div className="h-full rounded-r-full bg-blue-500/60" style={{ width: '40%' }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground/40">
              Agent recommendation: increase WhatsApp share to 70% based on reply rate data
            </p>
          </div>
        </div>
      </div>

      {/* Feedback summary */}
      {feedback.data ? (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold tracking-tight">Feedback Signals</h2>
          <p className="mb-4 text-xs text-muted-foreground/60">
            Real outcomes the agent uses to retrain scoring and improve messaging
          </p>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: 'Replied', value: feedback.data.repliedCount, color: 'text-zbooni-green' },
              { label: 'Meetings', value: feedback.data.meetingBookedCount, color: 'text-zbooni-teal' },
              { label: 'Deals Won', value: feedback.data.dealWonCount, color: 'text-purple-400' },
              { label: 'Deals Lost', value: feedback.data.dealLostCount, color: 'text-red-400' },
              { label: 'Unsubscribed', value: feedback.data.unsubscribedCount, color: 'text-yellow-400' },
              { label: 'Bounced', value: feedback.data.bouncedCount, color: 'text-muted-foreground' },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[11px] font-medium text-muted-foreground/60">{item.label}</p>
                <p className={`mt-0.5 text-xl font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
