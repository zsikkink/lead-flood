import { describe, expect, it, vi } from 'vitest';

import { PublicWebLookupAdapter } from './publicWebLookup.adapter.js';

describe('PublicWebLookupAdapter integration', () => {
  it('returns normalized success result', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          {
            name: 'Acme',
            domain: 'acme.com',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new PublicWebLookupAdapter({
      enabled: true,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'sara@acme.com',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    expect(result.normalized.provider).toBe('other_free');
    expect(result.normalized.companyDomain).toBe('acme.com');
  });

  it('returns terminal_error when disabled', async () => {
    const adapter = new PublicWebLookupAdapter({
      enabled: false,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.enrichLead({
      email: 'sara@acme.com',
    });

    expect(result.status).toBe('terminal_error');
  });

  it('classifies 500 responses as retryable', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'temporary' }), { status: 500 });
    }) as unknown as typeof fetch;

    const adapter = new PublicWebLookupAdapter({
      enabled: true,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'retry@acme.com',
    });

    expect(result.status).toBe('retryable_error');
  });
});
