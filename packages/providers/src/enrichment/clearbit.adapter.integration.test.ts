import { describe, expect, it, vi } from 'vitest';

import { ClearbitAdapter } from './clearbit.adapter.js';

describe('ClearbitAdapter integration', () => {
  it('returns normalized success for person lookup', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          name: 'Sara Ali',
          email: 'sara@acme.com',
          title: 'VP Sales',
          company: {
            name: 'Acme',
            domain: 'acme.com',
          },
          geo: {
            country: 'AE',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new ClearbitAdapter({
      apiKey: 'clearbit-key',
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'sara@acme.com',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    expect(result.normalized.domain).toBe('acme.com');
    expect(result.normalized.companyName).toBe('Acme');
    expect(result.normalized.country).toBe('AE');
  });

  it('returns terminal_error when API key is missing', async () => {
    const adapter = new ClearbitAdapter({
      apiKey: undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.enrichLead({
      email: 'sara@acme.com',
    });

    expect(result.status).toBe('terminal_error');
  });

  it('classifies 429 responses as retryable', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
    }) as unknown as typeof fetch;

    const adapter = new ClearbitAdapter({
      apiKey: 'clearbit-key',
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'retry@acme.com',
    });

    expect(result.status).toBe('retryable_error');
  });
});
