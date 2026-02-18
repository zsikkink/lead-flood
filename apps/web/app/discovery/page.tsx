'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminListLeadsQuery, AdminListLeadsResponse } from '@lead-flood/contracts';

import { fetchAdminLeads, queryFromLeadFilters } from '../../src/lib/discovery-admin';

const DEFAULT_QUERY: AdminListLeadsQuery = {
  page: 1,
  pageSize: 20,
  sortBy: 'score_desc',
};

export default function DiscoveryLeadsPage() {
  const [query, setQuery] = useState<AdminListLeadsQuery>(DEFAULT_QUERY);
  const [countriesInput, setCountriesInput] = useState('AE,SA,JO,EG');
  const [industriesInput, setIndustriesInput] = useState('');
  const [data, setData] = useState<AdminListLeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdminLeads(queryFromLeadFilters(query));
        setData(result);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load leads');
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="card">
      <h2>Leads</h2>
      <p className="muted">
        Browse discovered businesses, score them, and inspect evidence provenance.
      </p>
      {/* Live updates control disabled for now. */}

      <div className="toolbar" style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => void loadLeads()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="filters" style={{ marginTop: 12 }}>
        <label>
          Sort
          <select
            value={query.sortBy}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                sortBy: event.target.value as AdminListLeadsQuery['sortBy'],
              }))
            }
          >
            <option value="score_desc">Score (desc)</option>
            <option value="recent">Most recent</option>
            <option value="review_count">Review count</option>
          </select>
        </label>
        <label>
          Countries (CSV)
          <input
            value={countriesInput}
            onChange={(event) => setCountriesInput(event.target.value)}
            onBlur={() =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                countries: countriesInput
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }))
            }
          />
        </label>
        <label>
          City
          <input
            value={query.city ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                city: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label>
          Industry / Category (CSV)
          <input
            value={industriesInput}
            onChange={(event) => setIndustriesInput(event.target.value)}
            onBlur={() =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                industries: industriesInput
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }))
            }
          />
        </label>
        <label>
          Min Score
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={query.scoreMin ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                scoreMin: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
          />
        </label>
        <label>
          Max Score
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={query.scoreMax ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                scoreMax: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
          />
        </label>
        <label>
          Min Reviews
          <input
            type="number"
            min={0}
            value={query.minReviewCount ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                minReviewCount: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
          />
        </label>
        <label>
          Min Followers
          <input
            type="number"
            min={0}
            value={query.minFollowerCount ?? ''}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                minFollowerCount: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
          />
        </label>
      </div>

      <div className="checkbox-row" style={{ marginTop: 10 }}>
        <label>
          <input
            type="checkbox"
            checked={query.hasWhatsapp ?? false}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                hasWhatsapp: event.target.checked ? true : undefined,
              }))
            }
          />
          Has WhatsApp
        </label>
        <label>
          <input
            type="checkbox"
            checked={query.hasInstagram ?? false}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                hasInstagram: event.target.checked ? true : undefined,
              }))
            }
          />
          Has Instagram
        </label>
        <label>
          <input
            type="checkbox"
            checked={query.acceptsOnlinePayments ?? false}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                acceptsOnlinePayments: event.target.checked ? true : undefined,
              }))
            }
          />
          Accepts Online Payments
        </label>
        <label>
          <input
            type="checkbox"
            checked={query.recentlyActive ?? false}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                page: 1,
                recentlyActive: event.target.checked ? true : undefined,
              }))
            }
          />
          Recently Active
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
              <th>Name</th>
              <th>Country / City</th>
              <th>Industry</th>
              <th>Score</th>
              <th>Signals</th>
              <th>Reviews / Followers</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {!data && loading ? (
              <tr>
                <td colSpan={7}>Loading leads...</td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link className="row-link" href={`/discovery/leads/${lead.id}`}>
                      {lead.name}
                    </Link>
                    <div className="mono">{lead.id}</div>
                  </td>
                  <td>
                    {lead.countryCode}
                    <br />
                    <span className="muted">{lead.city ?? '-'}</span>
                  </td>
                  <td>{lead.category ?? '-'}</td>
                  <td>
                    {lead.score.toFixed(3)}
                    <div className={`tier ${lead.scoreTier.toLowerCase()}`}>{lead.scoreTier}</div>
                  </td>
                  <td>
                    {lead.hasWhatsapp ? 'WhatsApp ' : ''}
                    {lead.hasInstagram ? 'Instagram ' : ''}
                    {lead.acceptsOnlinePayments ? 'Payments ' : ''}
                    {lead.recentActivity ? 'Recent' : ''}
                    {!lead.hasWhatsapp &&
                    !lead.hasInstagram &&
                    !lead.acceptsOnlinePayments &&
                    !lead.recentActivity
                      ? '-'
                      : null}
                  </td>
                  <td>
                    {lead.reviewCount ?? '-'} / {lead.followerCount ?? '-'}
                  </td>
                  <td>{new Date(lead.updatedAt).toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>No leads found.</td>
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
