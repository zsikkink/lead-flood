import { describe, expect, it, vi } from 'vitest';

import { PdlEnrichmentAdapter } from './pdl.adapter.js';

describe('PdlEnrichmentAdapter integration', () => {
  it('normalizes a successful enrichment response', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          full_name: 'Jane Doe',
          first_name: 'Jane',
          last_name: 'Doe',
          work_email: 'jane@acme.com',
          job_title: 'VP Marketing',
          linkedin_url: 'https://linkedin.com/in/jane',
          location_country: 'AE',
          experience: [
            {
              company: 'Acme',
              company_domain: 'acme.com',
              company_size: 200,
              industry: 'Retail',
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as unknown as typeof fetch;

    const adapter = new PdlEnrichmentAdapter({
      apiKey: 'pdl-test-key',
      baseUrl: 'https://pdl.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'jane@acme.com',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }

    expect(result.normalized.email).toBe('jane@acme.com');
    expect(result.normalized.domain).toBe('acme.com');
    expect(result.normalized.companyName).toBe('Acme');
    expect(result.normalized.employeeCount).toBe(200);
    expect(result.normalized.country).toBe('AE');
  });

  it('classifies 500 responses as retryable', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'temporary failure' }), {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const adapter = new PdlEnrichmentAdapter({
      apiKey: 'pdl-test-key',
      baseUrl: 'https://pdl.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'retry@acme.com',
    });

    expect(result.status).toBe('retryable_error');
  });

  it('classifies 404 responses as terminal', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: {
          'content-type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const adapter = new PdlEnrichmentAdapter({
      apiKey: 'pdl-test-key',
      baseUrl: 'https://pdl.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'missing@acme.com',
    });

    expect(result.status).toBe('terminal_error');
  });

  it('returns terminal_error when no lookup key is provided', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = new PdlEnrichmentAdapter({
      apiKey: 'pdl-test-key',
      baseUrl: 'https://pdl.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({});

    expect(result.status).toBe('terminal_error');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
