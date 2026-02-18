'use client';

import type { DiscoveryLiveSettings } from '../lib/discovery-live';

const INTERVAL_PRESETS = [2000, 5000, 10000, 30000, 60000];

function formatIntervalLabel(intervalMs: number): string {
  return `${Math.round(intervalMs / 1000)}s`;
}

interface LiveUpdatesControlProps {
  settings: DiscoveryLiveSettings;
  isUpdating: boolean;
  lastUpdatedAt: Date | null;
}

export function LiveUpdatesControl({
  settings,
  isUpdating,
  lastUpdatedAt,
}: LiveUpdatesControlProps) {
  const customIntervalSeconds = Math.round(settings.intervalMs / 1000);

  let status = 'Live updates off';
  if (settings.enabled && settings.pausedForIdle) {
    status = 'Paused (no running jobs)';
  } else if (settings.enabled && isUpdating) {
    status = 'Updating...';
  } else if (settings.enabled && settings.shouldPoll) {
    status = 'Live polling active';
  }

  return (
    <div className="live-control" aria-live="polite">
      <div className="live-inline">
        <label className="live-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => settings.setEnabled(event.target.checked)}
          />
          Live updates
        </label>

        <label>
          Interval
          <select
            value={settings.intervalMs}
            disabled={!settings.enabled}
            onChange={(event) => settings.setIntervalMs(Number(event.target.value))}
          >
            {INTERVAL_PRESETS.map((value) => (
              <option key={value} value={value}>
                {formatIntervalLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Custom (seconds)
          <input
            type="number"
            min={2}
            max={60}
            disabled={!settings.enabled}
            value={customIntervalSeconds}
            onChange={(event) => {
              const raw = Number(event.target.value);
              settings.setIntervalMs(raw * 1000);
            }}
          />
        </label>
      </div>

      <div className="live-inline">
        <label className="live-toggle">
          <input
            type="checkbox"
            checked={settings.onlyWhenRunning}
            disabled={!settings.enabled}
            onChange={(event) => settings.setOnlyWhenRunning(event.target.checked)}
          />
          Only while jobs running
        </label>

        <span className="muted live-meta">{status}</span>
        <span className="muted live-meta">
          Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '-'}
        </span>
      </div>
    </div>
  );
}

