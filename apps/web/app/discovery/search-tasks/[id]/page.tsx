'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AdminSearchTaskDetailResponse } from '@lead-flood/contracts';

import { fetchAdminSearchTaskDetail } from '../../../../src/lib/discovery-admin';

export default function SearchTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [data, setData] = useState<AdminSearchTaskDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!taskId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminSearchTaskDetail(taskId);
      setData(result);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load task detail');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }
    void loadDetail();
  }, [taskId, loadDetail]);

  return (
    <section className="split">
      <div className="card">
        <h2>Search Task Detail</h2>
        <p className="muted">
          <Link href="/discovery/search-tasks">Back to tasks</Link>
        </p>
        {loading ? <p>Loading task detail...</p> : null}
        {error ? (
          <p style={{ color: '#b91c1c' }}>
            <strong>Error:</strong> {error}
          </p>
        ) : null}

        {data ? (
          <>
            <p className="mono">id: {data.task.id}</p>
            <p>
              <strong>{data.task.taskType}</strong> · {data.task.status}
            </p>
            <p className="mono">
              {data.task.countryCode} / {data.task.city ?? '-'} / {data.task.language}
            </p>
            <p className="mono">time_bucket: {data.task.timeBucket}</p>
            <p className="mono">page/start: {data.task.page}</p>
            <p className="mono">attempts: {data.task.attempts}</p>
            <p className="mono">query: {data.task.queryText}</p>
            <p className="mono">last_result_hash: {data.task.lastResultHash ?? '-'}</p>
            <p className="mono">error: {data.task.error ?? '-'}</p>
            <p className="mono">
              derived: engine={data.task.derivedParams.engine ?? '-'} q=
              {data.task.derivedParams.q ?? '-'}
            </p>
            <p className="mono">
              location={data.task.derivedParams.location ?? '-'} gl=
              {data.task.derivedParams.gl ?? '-'} hl={data.task.derivedParams.hl ?? '-'}
            </p>
            <p className="mono">
              z={String(data.task.derivedParams.z ?? '-')} m={String(data.task.derivedParams.m ?? '-')}
              {' '}start={String(data.task.derivedParams.start ?? '-')}
            </p>

            <details>
              <summary>params_json</summary>
              <pre className="json">{JSON.stringify(data.task.paramsJson, null, 2)}</pre>
            </details>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2>Leads Produced by This Task</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Country / City</th>
                <th>Category</th>
                <th>Score</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data && data.linkedLeads.length > 0 ? (
                data.linkedLeads.map((lead) => (
                  <tr key={lead.evidenceId}>
                    <td>
                      <Link className="row-link" href={`/discovery/leads/${lead.businessId}`}>
                        {lead.name}
                      </Link>
                      <div className="mono">{lead.businessId}</div>
                    </td>
                    <td>
                      {lead.countryCode} / {lead.city ?? '-'}
                    </td>
                    <td>{lead.category ?? '-'}</td>
                    <td>{lead.score.toFixed(3)}</td>
                    <td>
                      <span className="mono">{lead.evidenceId}</span>
                      <br />
                      <span className="muted">
                        {new Date(lead.evidenceCreatedAt).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No leads linked to this task yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
