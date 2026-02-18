'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminListSearchTasksQuery, AdminListSearchTasksResponse } from '@lead-flood/contracts';

import {
  fetchAdminSearchTasks,
  queryFromSearchTaskFilters,
} from '../../../src/lib/discovery-admin';

const DEFAULT_QUERY: AdminListSearchTasksQuery = {
  page: 1,
  pageSize: 20,
  sortBy: 'updated_desc',
};

function statusClassName(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'status-pill status-running';
    case 'DONE':
      return 'status-pill status-done';
    case 'FAILED':
      return 'status-pill status-failed';
    case 'SKIPPED':
      return 'status-pill status-skipped';
    default:
      return 'status-pill status-pending';
  }
}

export default function SearchTasksPage() {
  const [query, setQuery] = useState<AdminListSearchTasksQuery>(DEFAULT_QUERY);
  const [data, setData] = useState<AdminListSearchTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdminSearchTasks(queryFromSearchTaskFilters(query));
        setData(result);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load search tasks');
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="card">
      <h2>Search Tasks Explorer</h2>
      <p className="muted">Inspect frontier tasks, request params, state transitions, and errors.</p>
      {/* Live updates control disabled for now. */}

      <div className="filters" style={{ marginTop: 10 }}>
        <label>
          Status
          <select
            value={query.status ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                status: event.target.value
                  ? (event.target.value as AdminListSearchTasksQuery['status'])
                  : undefined,
              }))
            }
          >
            <option value="">Any</option>
            <option value="PENDING">PENDING</option>
            <option value="RUNNING">RUNNING</option>
            <option value="DONE">DONE</option>
            <option value="FAILED">FAILED</option>
            <option value="SKIPPED">SKIPPED</option>
          </select>
        </label>
        <label>
          Task Type
          <select
            value={query.taskType ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                taskType: event.target.value
                  ? (event.target.value as AdminListSearchTasksQuery['taskType'])
                  : undefined,
              }))
            }
          >
            <option value="">Any</option>
            <option value="SERP_GOOGLE">SERP_GOOGLE</option>
            <option value="SERP_GOOGLE_LOCAL">SERP_GOOGLE_LOCAL</option>
            <option value="SERP_MAPS_LOCAL">SERP_MAPS_LOCAL</option>
          </select>
        </label>
        <label>
          Country
          <select
            value={query.countryCode ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                countryCode: event.target.value || undefined,
              }))
            }
          >
            <option value="">Any</option>
            <option value="AE">AE</option>
            <option value="SA">SA</option>
            <option value="JO">JO</option>
            <option value="EG">EG</option>
          </select>
        </label>
        <label>
          Time Bucket
          <input
            value={query.timeBucket ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                timeBucket: event.target.value || undefined,
              }))
            }
            placeholder="2026-W08:small-validation"
          />
        </label>
        <label>
          Sort
          <select
            value={query.sortBy}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                sortBy: event.target.value as AdminListSearchTasksQuery['sortBy'],
              }))
            }
          >
            <option value="updated_desc">Updated (desc)</option>
            <option value="run_after_asc">Run after (asc)</option>
            <option value="attempts_desc">Attempts (desc)</option>
          </select>
        </label>
      </div>

      {error ? (
        <p style={{ color: '#b91c1c', marginTop: 10 }}>
          <strong>Error:</strong> {error}
        </p>
      ) : null}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Country / City / Lang</th>
              <th>Query</th>
              <th>Bucket</th>
              <th>Attempts</th>
              <th>Run After</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {!data && loading ? (
              <tr>
                <td colSpan={8}>Loading search tasks...</td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link className="row-link mono" href={`/discovery/search-tasks/${task.id}`}>
                      {task.id}
                    </Link>
                    <div className="muted">{task.taskType}</div>
                  </td>
                  <td>
                    <span className={statusClassName(task.status)}>{task.status}</span>
                  </td>
                  <td>
                    {task.countryCode} / {task.city ?? '-'} / {task.language}
                  </td>
                  <td className="mono">{task.queryText}</td>
                  <td className="mono">{task.timeBucket}</td>
                  <td>{task.attempts}</td>
                  <td>{new Date(task.runAfter).toLocaleString()}</td>
                  <td className="mono">{task.error ?? '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>No search tasks found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination" style={{ marginTop: 10 }}>
        <span className="muted">
          Page {query.page} of {totalPages} ({data?.total ?? 0} total)
        </span>
        <button
          type="button"
          className="secondary"
          disabled={(query.page ?? 1) <= 1}
          onClick={() =>
            setQuery((prev) => ({
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
          disabled={(query.page ?? 1) >= totalPages}
          onClick={() =>
            setQuery((prev) => ({
              ...prev,
              page: (prev.page ?? 1) + 1,
            }))
          }
        >
          Next
        </button>
      </div>
    </section>
  );
}
