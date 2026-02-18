'use client';

import type { ScoreDistributionResponse } from '@lead-flood/contracts';
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
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-base font-bold tracking-tight">Score Distribution</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.bands} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 20%)" />
          <XAxis
            dataKey="scoreBand"
            tick={{ fontSize: 12, fill: 'hsl(240 5% 55%)' }}
            axisLine={{ stroke: 'hsl(240 10% 20%)' }}
            tickLine={{ stroke: 'hsl(240 10% 20%)' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'hsl(240 5% 55%)' }}
            axisLine={{ stroke: 'hsl(240 10% 20%)' }}
            tickLine={{ stroke: 'hsl(240 10% 20%)' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 15% 13%)',
              border: '1px solid hsl(240 10% 20%)',
              borderRadius: '0.75rem',
              color: 'hsl(0 0% 96%)',
            }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.bands.map((entry) => (
              <Cell key={entry.scoreBand} fill={BAND_COLORS[entry.scoreBand] ?? '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
