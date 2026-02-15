import { describe, expect, it, vi } from 'vitest';

import { GoogleSearchAdapter, GoogleSearchRateLimitError } from './googleSearch.adapter.js';

describe('GoogleSearchAdapter integration', () => {
  it('returns normalized discovery results', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          items: [
            {
              cacheId: 'cache-1',
              title: 'Acme',
              link: 'https://acme.com/about',
            },
          ],
          queries: {
            nextPage: [{ startIndex: 11 }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new GoogleSearchAdapter({
      apiKey: 'google-key',
      searchEngineId: 'search-engine',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
      correlationId: 'corr-1',
      filters: {
        excludedDomains: [],
      },
    });

    expect(result.source).toBe('google_custom_search');
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.provider).toBe('google_search');
    expect(result.leads[0]?.email).toBe('info@acme.com');
    expect(result.nextCursor).toBe('11');
  });

  it('returns stub result when keys are not configured', async () => {
    const adapter = new GoogleSearchAdapter({
      apiKey: undefined,
      searchEngineId: undefined,
      minRequestIntervalMs: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
    });

    expect(result.source).toBe('stub');
    expect(result.leads).toHaveLength(0);
  });

  it('throws GoogleSearchRateLimitError on 429', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '12' },
      });
    }) as unknown as typeof fetch;

    const adapter = new GoogleSearchAdapter({
      apiKey: 'google-key',
      searchEngineId: 'search-engine',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    await expect(
      adapter.discoverLeads({
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(GoogleSearchRateLimitError);
  });
});
