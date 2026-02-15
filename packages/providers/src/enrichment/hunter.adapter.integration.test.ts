import { describe, expect, it, vi } from 'vitest';

import { HunterAdapter } from './hunter.adapter.js';

describe('HunterAdapter integration', () => {
  it('returns normalized success result', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            email: 'sara@acme.com',
            first_name: 'Sara',
            last_name: 'Ali',
            organization: 'Acme',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new HunterAdapter({
      apiKey: 'hunter-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'sara@acme.com',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    expect(result.normalized.provider).toBe('hunter');
    expect(result.normalized.email).toBe('sara@acme.com');
  });

  it('returns terminal_error when API key is missing', async () => {
    const adapter = new HunterAdapter({
      apiKey: undefined,
      minRequestIntervalMs: 0,
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

    const adapter = new HunterAdapter({
      apiKey: 'hunter-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.enrichLead({
      email: 'retry@acme.com',
    });

    expect(result.status).toBe('retryable_error');
  });
});
