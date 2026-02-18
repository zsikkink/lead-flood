'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJobRuns, queryFromJobRunFilters } from './discovery-admin';

const LIVE_ENABLED_KEY = 'discovery.live.enabled';
const LIVE_INTERVAL_MS_KEY = 'discovery.live.intervalMs';
const LIVE_ONLY_WHILE_RUNNING_KEY = 'discovery.live.onlyWhenRunning';

export const DISCOVERY_LIVE_MIN_INTERVAL_MS = 2000;
export const DISCOVERY_LIVE_MAX_INTERVAL_MS = 60000;
export const DISCOVERY_LIVE_DEFAULT_INTERVAL_MS = 5000;

function clampIntervalMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DISCOVERY_LIVE_DEFAULT_INTERVAL_MS;
  }

  return Math.min(
    DISCOVERY_LIVE_MAX_INTERVAL_MS,
    Math.max(DISCOVERY_LIVE_MIN_INTERVAL_MS, Math.round(value)),
  );
}

function parseStoredBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }

  return value === 'true';
}

function parseStoredInterval(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampIntervalMs(parsed);
}

export interface DiscoveryLiveSettingsState {
  enabled: boolean;
  intervalMs: number;
  onlyWhenRunning: boolean;
}

export interface DiscoveryLiveSettings extends DiscoveryLiveSettingsState {
  hydrated: boolean;
  hasRunningJobs: boolean;
  shouldPoll: boolean;
  pausedForIdle: boolean;
  setEnabled: (enabled: boolean) => void;
  setIntervalMs: (intervalMs: number) => void;
  setOnlyWhenRunning: (onlyWhenRunning: boolean) => void;
}

interface UseDiscoveryLiveSettingsOptions {
  apiBaseUrl: string;
  adminApiKey: string;
}

export function useDiscoveryLiveSettings({
  apiBaseUrl,
  adminApiKey,
}: UseDiscoveryLiveSettingsOptions): DiscoveryLiveSettings {
  const [enabled, setEnabledState] = useState(false);
  const [intervalMs, setIntervalMsState] = useState(DISCOVERY_LIVE_DEFAULT_INTERVAL_MS);
  const [onlyWhenRunning, setOnlyWhenRunningState] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [hasRunningJobs, setHasRunningJobs] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setEnabledState(parseStoredBoolean(window.localStorage.getItem(LIVE_ENABLED_KEY), false));
    setIntervalMsState(
      parseStoredInterval(
        window.localStorage.getItem(LIVE_INTERVAL_MS_KEY),
        DISCOVERY_LIVE_DEFAULT_INTERVAL_MS,
      ),
    );
    setOnlyWhenRunningState(
      parseStoredBoolean(window.localStorage.getItem(LIVE_ONLY_WHILE_RUNNING_KEY), true),
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LIVE_ENABLED_KEY, String(enabled));
    window.localStorage.setItem(LIVE_INTERVAL_MS_KEY, String(intervalMs));
    window.localStorage.setItem(LIVE_ONLY_WHILE_RUNNING_KEY, String(onlyWhenRunning));
  }, [enabled, hydrated, intervalMs, onlyWhenRunning]);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
  }, []);

  const setIntervalMs = useCallback((value: number) => {
    setIntervalMsState(clampIntervalMs(value));
  }, []);

  const setOnlyWhenRunning = useCallback((value: boolean) => {
    setOnlyWhenRunningState(value);
  }, []);

  const checkRunningJobs = useCallback(async () => {
    if (!apiBaseUrl || !adminApiKey) {
      setHasRunningJobs(false);
      return;
    }

    try {
      const result = await fetchJobRuns(
        apiBaseUrl,
        adminApiKey,
        queryFromJobRunFilters({
          page: 1,
          pageSize: 1,
          status: 'RUNNING',
        }),
      );
      setHasRunningJobs(result.total > 0);
    } catch {
      setHasRunningJobs(false);
    }
  }, [adminApiKey, apiBaseUrl]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!enabled || !onlyWhenRunning) {
      setHasRunningJobs(false);
      return;
    }

    if (!adminApiKey) {
      setHasRunningJobs(false);
      return;
    }

    void checkRunningJobs();
    const timer = setInterval(() => {
      void checkRunningJobs();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [adminApiKey, checkRunningJobs, enabled, hydrated, intervalMs, onlyWhenRunning]);

  const shouldPoll = useMemo(() => {
    if (!hydrated || !enabled) {
      return false;
    }

    if (!onlyWhenRunning) {
      return true;
    }

    return hasRunningJobs;
  }, [enabled, hasRunningJobs, hydrated, onlyWhenRunning]);

  const pausedForIdle = hydrated && enabled && onlyWhenRunning && !hasRunningJobs;

  return {
    enabled,
    intervalMs,
    onlyWhenRunning,
    hydrated,
    hasRunningJobs,
    shouldPoll,
    pausedForIdle,
    setEnabled,
    setIntervalMs,
    setOnlyWhenRunning,
  };
}

