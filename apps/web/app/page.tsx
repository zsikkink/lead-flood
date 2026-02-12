'use client';

import {
  CreateLeadResponseSchema,
  ErrorResponseSchema,
  GetJobStatusResponseSchema,
  GetLeadResponseSchema,
  type GetJobStatusResponse,
  type GetLeadResponse,
} from '@lead-flood/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { getWebEnv } from '../src/lib/env';

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

export default function HomePage() {
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

        if (parsedJob.status === 'completed' || parsedJob.status === 'failed') {
          clearInterval(intervalId);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load lead status');
        }
      }
    };

    const intervalId = setInterval(() => {
      void loadState();
    }, 2000);
    void loadState();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
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
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '48rem' }}>
      <h1>Lead Flood</h1>
      <p>Walking skeleton flow: web to API to DB to worker and back to DB.</p>
      <p>
        API Base URL: <code>{apiBaseUrl}</code>
      </p>

      <form onSubmit={submitLead} style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        <input
          required
          placeholder="First name"
          value={form.firstName}
          onChange={(event) => setForm((previous) => ({ ...previous, firstName: event.target.value }))}
        />
        <input
          required
          placeholder="Last name"
          value={form.lastName}
          onChange={(event) => setForm((previous) => ({ ...previous, lastName: event.target.value }))}
        />
        <input
          required
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
        />
        <input
          required
          placeholder="Source"
          value={form.source}
          onChange={(event) => setForm((previous) => ({ ...previous, source: event.target.value }))}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating lead...' : 'Create lead'}
        </button>
      </form>

      {error ? (
        <p style={{ color: '#b91c1c', marginTop: '1rem' }}>
          Error: <strong>{error}</strong>
        </p>
      ) : null}

      {leadId && jobId ? (
        <section style={{ marginTop: '1.5rem' }}>
          <p>
            Lead ID: <code>{leadId}</code>
          </p>
          <p>
            Job ID: <code>{jobId}</code>
          </p>
          <p>
            Job status: <strong>{job?.status ?? 'loading...'}</strong>
          </p>
          <p>
            Lead status: <strong>{lead?.status ?? 'loading...'}</strong>
          </p>
          {lead?.enrichmentData ? (
            <pre style={{ marginTop: '1rem', background: '#f5f5f5', padding: '0.75rem' }}>
              {JSON.stringify(lead.enrichmentData, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
