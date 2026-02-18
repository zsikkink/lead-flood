import { describe, expect, it, vi } from 'vitest';

import { HunterEnrichmentAdapter } from './hunterEnrichment.adapter.js';

describe('HunterEnrichmentAdapter integration', () => {
  it('returns normalized success result', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            email: 'hello@acme.com',
            organization: 'Acme',
            country: 'AE',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new HunterEnrichmentAdapter({
      enabled: true,
      apiKey: 'hunter-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'hello@acme.com',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    expect(result.normalized.domain).toBe('acme.com');
  });

  it('returns terminal_error when adapter is disabled', async () => {
    const adapter = new HunterEnrichmentAdapter({
      enabled: false,
      apiKey: 'hunter-key',
      minRequestIntervalMs: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.enrichLead({
      email: 'hello@acme.com',
    });

    expect(result.status).toBe('terminal_error');
  });
});
