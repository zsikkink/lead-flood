'use client';

import {
  CreateLeadResponseSchema,
  ErrorResponseSchema,
  GetJobStatusResponseSchema,
  GetLeadResponseSchema,
  type GetJobStatusResponse,
  type GetLeadResponse,
} from '@lead-flood/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { getWebEnv } from '../../../src/lib/env';

interface LeadFormState {
  firstName: string;
  lastName: string;
  email: string;
  source: string;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data.error;
  }

  return 'Request failed';
}

export default function DiscoveryLeadFormPage() {
  const env = getWebEnv();
  const apiBaseUrl = useMemo(() => env.NEXT_PUBLIC_API_BASE_URL, [env.NEXT_PUBLIC_API_BASE_URL]);

  const [form, setForm] = useState<LeadFormState>({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    source: 'manual',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lead, setLead] = useState<GetLeadResponse | null>(null);
  const [job, setJob] = useState<GetJobStatusResponse | null>(null);

  useEffect(() => {
    if (!leadId || !jobId) {
      return;
    }

    let cancelled = false;

    const loadState = async () => {
      try {
        const [leadResponse, jobResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/v1/leads/${leadId}`),
          fetch(`${apiBaseUrl}/v1/jobs/${jobId}`),
        ]);

        if (!leadResponse.ok) {
          throw new Error(await parseErrorMessage(leadResponse));
        }

        if (!jobResponse.ok) {
          throw new Error(await parseErrorMessage(jobResponse));
        }

        const leadBody = await leadResponse.json();
        const jobBody = await jobResponse.json();
        const parsedLead = GetLeadResponseSchema.parse(leadBody);
        const parsedJob = GetJobStatusResponseSchema.parse(jobBody);

        if (cancelled) {
          return;
        }

        setLead(parsedLead);
        setJob(parsedJob);

      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load lead status');
        }
      }
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, jobId, leadId]);

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/v1/leads`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const body = await response.json();
      const parsed = CreateLeadResponseSchema.parse(body);

      setLeadId(parsed.leadId);
      setJobId(parsed.jobId);
      setLead(null);
      setJob(null);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="split">
      <div className="card">
        <h2>Lead Intake</h2>
        <p className="muted">Create a lead and watch the API + worker pipeline process it.</p>

        <form onSubmit={submitLead} className="form-grid" style={{ marginTop: 12 }}>
          <label>
            First name
            <input
              required
              placeholder="Ada"
              value={form.firstName}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  firstName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Last name
            <input
              required
              placeholder="Lovelace"
              value={form.lastName}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  lastName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              placeholder="ada@example.com"
              value={form.email}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Source
            <input
              required
              placeholder="manual"
              value={form.source}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  source: event.target.value,
                }))
              }
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating lead...' : 'Create lead'}
          </button>
        </form>

        {error ? (
          <p style={{ color: '#b91c1c', marginTop: 10 }}>
            <strong>Error:</strong> {error}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Run Status</h2>
        <p className="muted">Live poll every 2 seconds until this lead finishes processing.</p>

        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="kpi">
            Lead ID
            <strong className="mono" style={{ fontSize: 12 }}>
              {leadId ?? '-'}
            </strong>
          </div>
          <div className="kpi">
            Job ID
            <strong className="mono" style={{ fontSize: 12 }}>
              {jobId ?? '-'}
            </strong>
          </div>
          <div className="kpi">
            Job Status
            <strong>{job?.status ?? '-'}</strong>
          </div>
          <div className="kpi">
            Lead Status
            <strong>{lead?.status ?? '-'}</strong>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Link href="/discovery">Open Leads Dashboard</Link>
          {leadId ? (
            <>
              {' '}
              · <Link href={`/discovery/leads/${leadId}`}>Open Lead Detail</Link>
            </>
          ) : null}
        </div>

        {lead?.enrichmentData ? (
          <details style={{ marginTop: 12 }}>
            <summary>Enrichment payload</summary>
            <pre className="json">{JSON.stringify(lead.enrichmentData, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}
