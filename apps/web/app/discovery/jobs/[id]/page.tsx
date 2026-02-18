'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobRunDetailResponse } from '@lead-flood/contracts';

import { fetchJobRunDetail, readStoredAdminApiKey } from '../../../../src/lib/discovery-admin';
import { getWebEnv } from '../../../../src/lib/env';

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

export default function JobRunDetailPage() {
  const params = useParams<{ id: string }>();
  const env = getWebEnv();
  const apiBaseUrl = useMemo(() => env.NEXT_PUBLIC_API_BASE_URL, [env.NEXT_PUBLIC_API_BASE_URL]);
  const runId = params.id;

  const [adminApiKey, setAdminApiKey] = useState('');
  const [data, setData] = useState<JobRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!runId || !adminApiKey) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobRunDetail(apiBaseUrl, adminApiKey, runId);
      setData(result);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load run detail');
    } finally {
      setLoading(false);
    }
  }, [adminApiKey, apiBaseUrl, runId]);

  useEffect(() => {
    setAdminApiKey(readStoredAdminApiKey() || env.NEXT_PUBLIC_ADMIN_API_KEY || '');
  }, [env.NEXT_PUBLIC_ADMIN_API_KEY]);

  useEffect(() => {
    if (!adminApiKey || !runId) {
      return;
    }
    void loadDetail();
  }, [adminApiKey, loadDetail, runId]);

  return (
    <section className="card">
      <h2>Job Run Detail</h2>
      <p className="muted">
        <Link href="/discovery/jobs">Back to job runs</Link>
      </p>

      {loading ? <p>Loading run detail...</p> : null}
      {error ? (
        <p style={{ color: '#b91c1c' }}>
          <strong>Error:</strong> {error}
        </p>
      ) : null}

      {data ? (
        <>
          <p className="mono">id: {data.run.id}</p>
          <p>
            <strong>{data.run.jobName}</strong> ·{' '}
            <span className={statusClassName(data.run.status)}>{data.run.status}</span>
          </p>
          <p className="mono">started: {new Date(data.run.startedAt).toLocaleString()}</p>
          <p className="mono">
            finished: {data.run.finishedAt ? new Date(data.run.finishedAt).toLocaleString() : '-'}
          </p>
          <p className="mono">duration_ms: {data.run.durationMs ?? '-'}</p>
          <p className="mono">error: {data.run.errorText ?? '-'}</p>

          <details style={{ marginTop: 10 }} open>
            <summary>params_json</summary>
            <pre className="json">{JSON.stringify(data.run.paramsJson, null, 2)}</pre>
          </details>
          <details style={{ marginTop: 10 }} open>
            <summary>counters_json</summary>
            <pre className="json">{JSON.stringify(data.run.countersJson, null, 2)}</pre>
          </details>
          <details style={{ marginTop: 10 }} open>
            <summary>resource_json</summary>
            <pre className="json">{JSON.stringify(data.run.resourceJson, null, 2)}</pre>
          </details>
        </>
      ) : null}
    </section>
  );
}
