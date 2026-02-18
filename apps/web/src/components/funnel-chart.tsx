'use client';

import { useMemo } from 'react';
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

  const maxCount = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.count), 1);
    return Math.ceil(max * 1.2);
  }, [chartData]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <h2 className="mb-5 text-base font-bold tracking-tight">Pipeline Funnel</h2>
      <style>{`
        .recharts-bar-rectangle { transition: filter 0.2s ease; }
        .recharts-bar-rectangle:hover { filter: brightness(1.25); }
        .recharts-wrapper { outline: none !important; }
        .recharts-surface { outline: none !important; }
        .recharts-surface:focus { outline: none !important; }
      `}</style>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 8% 18%)" vertical={false} />
          <XAxis
            dataKey="stage"
            tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(240 5% 65%)' }}
            axisLine={{ stroke: 'hsl(240 8% 18%)' }}
            tickLine={false}
            interval={0}
            dy={8}
          />
          <YAxis
            tick={{ fontSize: 11, fontWeight: 500, fill: 'hsl(240 5% 55%)' }}
            axisLine={false}
            tickLine={false}
            domain={[0, maxCount]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 15% 12%)',
              border: '1px solid hsl(240 8% 22%)',
              borderRadius: '0.75rem',
              fontSize: '13px',
              fontWeight: 500,
              color: 'hsl(0 0% 96%)',
              padding: '8px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
            cursor={false}
            trigger="hover"
            animationDuration={150}
          />
          <Bar
            dataKey="count"
            radius={[6, 6, 0, 0]}
            fill="url(#barGradient)"
            animationDuration={600}
            isAnimationActive={true}
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
