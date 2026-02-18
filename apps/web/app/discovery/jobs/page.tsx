'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobRunListQuery, ListJobRunsResponse } from '@lead-flood/contracts';

import {
  fetchJobRequests,
  fetchJobRuns,
  queryFromJobRequestFilters,
  queryFromJobRunFilters,
  triggerDiscoveryRun,
  triggerDiscoverySeed,
  type JobRequestListResponse,
} from '../../../src/lib/discovery-admin';

const DEFAULT_JOBS_QUERY: JobRunListQuery = {
  page: 1,
  pageSize: 20,
};

const DEFAULT_REQUESTS_QUERY = {
  page: 1,
  pageSize: 20,
};

function statusClassName(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'status-pill status-running';
    case 'SUCCESS':
      return 'status-pill status-success';
    case 'DONE':
      return 'status-pill status-done';
    case 'FAILED':
      return 'status-pill status-failed';
    case 'CANCELED':
      return 'status-pill status-canceled';
    default:
      return 'status-pill status-pending';
  }
}

export default function JobsPage() {
  const [jobsQuery, setJobsQuery] = useState<JobRunListQuery>(DEFAULT_JOBS_QUERY);
  const [jobsData, setJobsData] = useState<ListJobRunsResponse | null>(null);
  const [requestsData, setRequestsData] = useState<JobRequestListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTriggeredRequestId, setLastTriggeredRequestId] = useState<number | null>(null);

  const [seedProfile, setSeedProfile] = useState<'default' | 'small'>('small');
  const [seedMaxTasks, setSeedMaxTasks] = useState(40);
  const [seedMaxPages, setSeedMaxPages] = useState(1);
  const [seedBucket, setSeedBucket] = useState('');
  const [seedTaskTypes, setSeedTaskTypes] = useState('SERP_MAPS_LOCAL,SERP_GOOGLE_LOCAL');
  const [seedCountries, setSeedCountries] = useState('AE,SA,JO,EG');
  const [seedLanguages, setSeedLanguages] = useState('en,ar');

  const [runMaxTasks, setRunMaxTasks] = useState(40);
  const [runConcurrency, setRunConcurrency] = useState(1);
  const [runTimeBucket, setRunTimeBucket] = useState('');

  const [autoRefreshIntervalMs, setAutoRefreshIntervalMs] = useState<number>(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsResult, requestsResult] = await Promise.all([
        fetchJobRuns(queryFromJobRunFilters(jobsQuery)),
        fetchJobRequests(queryFromJobRequestFilters(DEFAULT_REQUESTS_QUERY)),
      ]);
      setJobsData(runsResult);
      setRequestsData(requestsResult);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [jobsQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (autoRefreshIntervalMs <= 0) {
      return;
    }

    const timer = setInterval(() => {
      void loadData();
    }, autoRefreshIntervalMs);

    return () => clearInterval(timer);
  }, [autoRefreshIntervalMs, loadData]);

  const runSeed = async () => {
    setError(null);
    try {
      const taskTypes = seedTaskTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as Array<'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL'>;
      const countries = seedCountries
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const languages = seedLanguages
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const result = await triggerDiscoverySeed({
        profile: seedProfile,
        maxTasks: seedMaxTasks,
        maxPages: seedMaxPages,
        bucket: seedBucket || undefined,
        taskTypes,
        countries,
        languages,
      });
      setLastTriggeredRequestId(result.jobRequestId);
      await loadData();
    } catch (runError: unknown) {
      setError(runError instanceof Error ? runError.message : 'Failed to request seed job');
    }
  };

  const runDiscovery = async () => {
    setError(null);
    try {
      const result = await triggerDiscoveryRun({
        maxTasks: runMaxTasks,
        concurrency: runConcurrency,
        timeBucket: runTimeBucket || undefined,
      });
      setLastTriggeredRequestId(result.jobRequestId);
      await loadData();
    } catch (runError: unknown) {
      setError(runError instanceof Error ? runError.message : 'Failed to request discovery run');
    }
  };

  const totalJobPages = jobsData ? Math.max(1, Math.ceil(jobsData.total / jobsData.pageSize)) : 1;

  const liveRefreshLabel = useMemo(() => {
    if (autoRefreshIntervalMs <= 0) {
      return 'Off';
    }

    return `${autoRefreshIntervalMs / 1000}s`;
  }, [autoRefreshIntervalMs]);

  return (
    <section className="jobs-grid">
      <div className="card">
        <h2>Job Controls</h2>
        <p className="muted">Create DB-backed job requests. Worker will claim and execute them.</p>

        <div className="toolbar" style={{ marginTop: 10 }}>
          <label>
            Auto-refresh
            <select
              value={String(autoRefreshIntervalMs)}
              onChange={(event) => setAutoRefreshIntervalMs(Number(event.target.value))}
            >
              <option value="0">Off</option>
              <option value="2000">2s</option>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="30000">30s</option>
            </select>
          </label>
          <span className="muted">Current: {liveRefreshLabel}</span>
          <button type="button" onClick={() => void loadData()} disabled={loading}>
            Refresh now
          </button>
        </div>

        <h3 style={{ marginTop: 12 }}>Request Discovery Seed</h3>
        <div className="form-grid">
          <label>
            Profile
            <select
              value={seedProfile}
              onChange={(event) => setSeedProfile(event.target.value as 'default' | 'small')}
            >
              <option value="small">small</option>
              <option value="default">default</option>
            </select>
          </label>
          <label>
            Max Tasks
            <input
              type="number"
              min={1}
              value={seedMaxTasks}
              onChange={(event) => setSeedMaxTasks(Number(event.target.value) || 1)}
            />
          </label>
          <label>
            Max Pages
            <input
              type="number"
              min={1}
              value={seedMaxPages}
              onChange={(event) => setSeedMaxPages(Number(event.target.value) || 1)}
            />
          </label>
          <label>
            Seed Bucket
            <input
              value={seedBucket}
              onChange={(event) => setSeedBucket(event.target.value)}
              placeholder="small-validation"
            />
          </label>
          <label>
            Task Types (CSV)
            <input value={seedTaskTypes} onChange={(event) => setSeedTaskTypes(event.target.value)} />
          </label>
          <label>
            Countries (CSV)
            <input value={seedCountries} onChange={(event) => setSeedCountries(event.target.value)} />
          </label>
          <label>
            Languages (CSV)
            <input value={seedLanguages} onChange={(event) => setSeedLanguages(event.target.value)} />
          </label>
        </div>
        <button style={{ marginTop: 10 }} onClick={() => void runSeed()}>
          Request Seed
        </button>

        <h3 style={{ marginTop: 16 }}>Request Discovery Run (Bounded)</h3>
        <div className="form-grid">
          <label>
            Max Tasks
            <input
              type="number"
              min={1}
              value={runMaxTasks}
              onChange={(event) => setRunMaxTasks(Number(event.target.value) || 1)}
            />
          </label>
          <label>
            Concurrency Hint
            <input
              type="number"
              min={1}
              max={10}
              value={runConcurrency}
              onChange={(event) => setRunConcurrency(Number(event.target.value) || 1)}
            />
          </label>
          <label>
            Time Bucket Filter
            <input
              value={runTimeBucket}
              onChange={(event) => setRunTimeBucket(event.target.value)}
              placeholder="2026-W08:small-validation"
            />
          </label>
        </div>
        <button style={{ marginTop: 10 }} onClick={() => void runDiscovery()}>
          Request Run
        </button>

        {lastTriggeredRequestId !== null ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Last requested job id: <span className="mono">{lastTriggeredRequestId}</span>
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Job Requests</h2>

        {error ? (
          <p style={{ color: '#b91c1c' }}>
            <strong>Error:</strong> {error}
          </p>
        ) : null}

        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                <th>Status</th>
                <th>Requested At</th>
                <th>Claimed By</th>
                <th>Job Run</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {!requestsData && loading ? (
                <tr>
                  <td colSpan={7}>Loading requests...</td>
                </tr>
              ) : requestsData && requestsData.items.length > 0 ? (
                requestsData.items.map((request) => (
                  <tr key={request.id}>
                    <td className="mono">{request.id}</td>
                    <td>{request.requestType}</td>
                    <td>
                      <span className={statusClassName(request.status)}>{request.status}</span>
                    </td>
                    <td>{new Date(request.createdAt).toLocaleString()}</td>
                    <td className="mono">{request.claimedBy ?? '-'}</td>
                    <td>
                      {request.jobRunId ? (
                        <Link className="row-link mono" href={`/discovery/jobs/${request.jobRunId}`}>
                          {request.jobRunId}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="mono">{request.errorText ?? '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>No job requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Job Runs</h2>

        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Job Name</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Counters</th>
              </tr>
            </thead>
            <tbody>
              {!jobsData && loading ? (
                <tr>
                  <td colSpan={6}>Loading runs...</td>
                </tr>
              ) : jobsData && jobsData.items.length > 0 ? (
                jobsData.items.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link className="row-link mono" href={`/discovery/jobs/${run.id}`}>
                        {run.id}
                      </Link>
                    </td>
                    <td>{run.jobName}</td>
                    <td>
                      <span className={statusClassName(run.status)}>{run.status}</span>
                    </td>
                    <td>{run.durationMs ?? '-'} ms</td>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="mono">{run.countersJson ? JSON.stringify(run.countersJson) : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No runs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination" style={{ marginTop: 10 }}>
          <span className="muted">
            Page {jobsQuery.page} of {totalJobPages} ({jobsData?.total ?? 0} total)
          </span>
          <button
            type="button"
            className="secondary"
            disabled={(jobsQuery.page ?? 1) <= 1}
            onClick={() =>
              setJobsQuery((prev) => ({
                ...prev,
                page: Math.max(1, (prev.page ?? 1) - 1),
              }))
            }
          >
            Previous
          </button>
          <button
            type="button"
            className="secondary"
            disabled={(jobsQuery.page ?? 1) >= totalJobPages}
            onClick={() =>
              setJobsQuery((prev) => ({
                ...prev,
                page: (prev.page ?? 1) + 1,
              }))
            }
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
