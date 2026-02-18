'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { FunnelResponse } from '@lead-flood/contracts';

interface FunnelChartProps {
  data: FunnelResponse;
}

export function FunnelChart({ data }: FunnelChartProps) {
  const chartData = [
    { stage: 'Discovered', count: data.discoveredCount },
    { stage: 'Qualified', count: data.qualifiedCount },
    { stage: 'Enriched', count: data.enrichedCount },
    { stage: 'Scored', count: data.scoredCount },
    { stage: 'Messaged', count: data.messagesSentCount },
    { stage: 'Replied', count: data.repliesCount },
    { stage: 'Meetings', count: data.meetingsCount },
    { stage: 'Deals Won', count: data.dealsWonCount },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <h2 className="mb-5 text-base font-bold tracking-tight">Pipeline Funnel</h2>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 18%)" vertical={false} />
          <XAxis
            dataKey="stage"
            tick={{ fontSize: 11, fill: 'hsl(240 5% 55%)' }}
            axisLine={{ stroke: 'hsl(240 8% 18%)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(240 5% 55%)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 12% 14%)',
              border: '1px solid hsl(240 8% 20%)',
              borderRadius: '0.75rem',
              fontSize: '12px',
              color: 'hsl(0 0% 96%)',
            }}
            cursor={{ fill: 'hsl(240 8% 14% / 0.5)' }}
          />
          <Bar
            dataKey="count"
            radius={[6, 6, 0, 0]}
            fill="url(#barGradient)"
          />
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7BFF6B" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#3CC8E0" stopOpacity={0.7} />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
