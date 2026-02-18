'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminLeadDetailResponse } from '@lead-flood/contracts';

import { fetchAdminLeadDetail, readStoredAdminApiKey } from '../../../../src/lib/discovery-admin';
import { getWebEnv } from '../../../../src/lib/env';

export default function DiscoveryLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const env = getWebEnv();
  const apiBaseUrl = useMemo(() => env.NEXT_PUBLIC_API_BASE_URL, [env.NEXT_PUBLIC_API_BASE_URL]);
  const leadId = params.id;

  const [adminApiKey, setAdminApiKey] = useState('');
  const [data, setData] = useState<AdminLeadDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!leadId || !adminApiKey) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminLeadDetail(apiBaseUrl, adminApiKey, leadId);
      setData(result);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load lead detail');
    } finally {
      setLoading(false);
    }
  }, [adminApiKey, apiBaseUrl, leadId]);

  useEffect(() => {
    const fallback = env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';
    setAdminApiKey(readStoredAdminApiKey() || fallback);
  }, [env.NEXT_PUBLIC_ADMIN_API_KEY]);

  useEffect(() => {
    if (!adminApiKey || !leadId) {
      return;
    }
    void loadDetail();
  }, [adminApiKey, leadId, loadDetail]);

  return (
    <section className="split">
      <div className="card">
        <h2>Lead Profile</h2>
        <p className="muted">
          <Link href="/discovery">Back to leads</Link>
        </p>

        {loading ? <p>Loading lead detail...</p> : null}
        {error ? (
          <p style={{ color: '#b91c1c' }}>
            <strong>Error:</strong> {error}
          </p>
        ) : null}

        {data ? (
          <>
            <div className="kpis" style={{ marginTop: 10 }}>
              <div className="kpi">
                Name
                <strong>{data.lead.name}</strong>
              </div>
              <div className="kpi">
                Country / City
                <strong>
                  {data.lead.countryCode} {data.lead.city ? `· ${data.lead.city}` : ''}
                </strong>
              </div>
              <div className="kpi">
                Industry
                <strong>{data.lead.category ?? '-'}</strong>
              </div>
              <div className="kpi">
                Score
                <strong>{data.lead.score.toFixed(3)}</strong>
                <span className={`tier ${data.lead.scoreTier.toLowerCase()}`}>{data.lead.scoreTier}</span>
              </div>
            </div>

            <h3 style={{ marginTop: 14 }}>Score Breakdown</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Value</th>
                    <th>Weight</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scoreBreakdown.contributions.map((item) => (
                    <tr key={item.code}>
                      <td>{item.label}</td>
                      <td className="mono">{String(item.value)}</td>
                      <td>{item.weight.toFixed(2)}</td>
                      <td>{item.contribution.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: 14 }}>Dedupe Keys</h3>
            <p className="mono">website_domain: {data.dedupeKeys.websiteDomain ?? '-'}</p>
            <p className="mono">phone_e164: {data.dedupeKeys.phoneE164 ?? '-'}</p>
            <p className="mono">instagram_handle: {data.dedupeKeys.instagramHandle ?? '-'}</p>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2>Evidence Timeline</h2>
        <p className="muted">Latest evidence first. Expand any row to inspect raw payload.</p>

        <div className="timeline">
          {data && data.evidenceTimeline.length > 0 ? (
            data.evidenceTimeline.map((item) => (
              <article className="timeline-item" key={item.id}>
                <div className="mono">evidence_id: {item.id}</div>
                <div>
                  <strong>{item.sourceType}</strong> ·{' '}
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceUrl}
                  </a>
                </div>
                <div className="muted">{new Date(item.createdAt).toLocaleString()}</div>
                <div className="mono">serpapi_result_id: {item.serpapiResultId ?? '-'}</div>
                {item.searchTask ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="mono">task: {item.searchTask.id}</div>
                    <div>
                      <strong>{item.searchTask.taskType}</strong> · page {item.searchTask.page}
                    </div>
                    <div className="mono">{item.searchTask.queryText}</div>
                    <div className="mono">
                      {item.searchTask.countryCode} / {item.searchTask.city ?? '-'} /{' '}
                      {item.searchTask.language} · {item.searchTask.timeBucket}
                    </div>
                    <Link className="row-link" href={`/discovery/search-tasks/${item.searchTask.id}`}>
                      Open search task
                    </Link>
                  </div>
                ) : (
                  <div className="muted">No linked search task metadata.</div>
                )}
                <details style={{ marginTop: 8 }}>
                  <summary>Raw JSON</summary>
                  <pre className="json">{JSON.stringify(item.rawJson, null, 2)}</pre>
                </details>
              </article>
            ))
          ) : (
            <p className="muted">No evidence found for this lead.</p>
          )}
        </div>
      </div>
    </section>
  );
}
