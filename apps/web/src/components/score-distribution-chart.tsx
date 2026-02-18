'use client';

import type { ScoreDistributionResponse } from '@lead-flood/contracts';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const BAND_COLORS: Record<string, string> = {
  LOW: '#ef4444',
  MEDIUM: '#eab308',
  HIGH: '#7BFF6B',
};

interface ScoreDistributionChartProps {
  data: ScoreDistributionResponse;
}

export function ScoreDistributionChart({ data }: ScoreDistributionChartProps) {
  const maxCount = useMemo(() => {
    const max = Math.max(...data.bands.map((b) => b.count), 1);
    return Math.ceil(max * 1.2);
  }, [data.bands]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-base font-bold tracking-tight">Score Distribution</h2>
      <style>{`
        .recharts-bar-rectangle { transition: filter 0.2s ease; }
        .recharts-bar-rectangle:hover { filter: brightness(1.25); }
        .recharts-wrapper { outline: none !important; }
        .recharts-surface { outline: none !important; }
        .recharts-surface:focus { outline: none !important; }
      `}</style>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.bands} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 20%)" vertical={false} />
          <XAxis
            dataKey="scoreBand"
            tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(240 5% 65%)' }}
            axisLine={{ stroke: 'hsl(240 10% 20%)' }}
            tickLine={false}
            dy={4}
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
          <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={600}>
            {data.bands.map((entry) => (
              <Cell
                key={entry.scoreBand}
                fill={BAND_COLORS[entry.scoreBand] ?? '#6b7280'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
