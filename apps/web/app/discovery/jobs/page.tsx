'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { JobRunListQuery, ListJobRunsResponse } from '@lead-flood/contracts';

import {
  fetchJobRuns,
  queryFromJobRunFilters,
  triggerDiscoveryRun,
  triggerDiscoverySeed,
} from '../../../src/lib/discovery-admin';

const DEFAULT_JOBS_QUERY: JobRunListQuery = {
  page: 1,
  pageSize: 20,
};

function statusClassName(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'status-pill status-running';
    case 'SUCCESS':
      return 'status-pill status-success';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTriggeredRunId, setLastTriggeredRunId] = useState<string | null>(null);

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

  const loadRuns = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchJobRuns(queryFromJobRunFilters(jobsQuery));
        setJobsData(result);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load job runs');
      } finally {
        setLoading(false);
      }
    },
    [jobsQuery],
  );

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

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
      setLastTriggeredRunId(result.jobRunId);
      await loadRuns();
    } catch (runError: unknown) {
      setError(runError instanceof Error ? runError.message : 'Failed to trigger seed job');
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
      setLastTriggeredRunId(result.jobRunId);
      await loadRuns();
    } catch (runError: unknown) {
      setError(runError instanceof Error ? runError.message : 'Failed to trigger run job');
    }
  };

  const totalPages = jobsData ? Math.max(1, Math.ceil(jobsData.total / jobsData.pageSize)) : 1;

  return (
    <section className="jobs-grid">
      <div className="card">
        <h2>Job Controls</h2>
        <p className="muted">Trigger seed and bounded discovery runs directly from UI.</p>
        {/* Live updates control disabled for now. */}

        <h3 style={{ marginTop: 12 }}>Seed Discovery Tasks</h3>
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
          Trigger Seed
        </button>

        <h3 style={{ marginTop: 16 }}>Run Discovery (Bounded)</h3>
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
            Concurrency
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
          Trigger Run
        </button>

        {lastTriggeredRunId ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Last triggered run:{' '}
            <Link href={`/discovery/jobs/${lastTriggeredRunId}`} className="mono">
              {lastTriggeredRunId}
            </Link>
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Job Runs</h2>

        {error ? (
          <p style={{ color: '#b91c1c' }}>
            <strong>Error:</strong> {error}
          </p>
        ) : null}

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
            Page {jobsQuery.page} of {totalPages} ({jobsData?.total ?? 0} total)
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
            disabled={(jobsQuery.page ?? 1) >= totalPages}
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
