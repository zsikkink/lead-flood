import { describe, expect, it, vi } from 'vitest';

import {
  BraveSearchAdapter,
  BraveSearchRateLimitError,
  buildBraveSearchQuery,
} from './braveSearch.adapter.js';

describe('BraveSearchAdapter integration', () => {
  it('returns normalized discovery results', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Acme Retail',
                url: 'https://acme.example/contact',
              },
            ],
            next_offset: 20,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new BraveSearchAdapter({
      enabled: true,
      apiKey: 'brave-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
      filters: {
        industries: ['retail'],
        countries: ['uae'],
      },
    });

    expect(result.source).toBe('brave_search_api');
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.provider).toBe('brave_search');
    expect(result.leads[0]?.email).toBe('info@acme.example');
    expect(result.nextCursor).toBe('20');
  });

  it('returns stub result when disabled', async () => {
    const adapter = new BraveSearchAdapter({
      enabled: false,
      apiKey: undefined,
      minRequestIntervalMs: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
    });

    expect(result.source).toBe('stub');
    expect(result.leads).toHaveLength(0);
  });

  it('throws BraveSearchRateLimitError on 429', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '9' },
      });
    }) as unknown as typeof fetch;

    const adapter = new BraveSearchAdapter({
      enabled: true,
      apiKey: 'brave-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    await expect(
      adapter.discoverLeads({
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(BraveSearchRateLimitError);
  });

  it('builds deterministic query text from filters', () => {
    const query = buildBraveSearchQuery({
      filters: {
        industries: ['Retail'],
        countries: ['UAE'],
        requiredTechnologies: ['shopify'],
        includeTerms: ['whatsapp'],
        excludedDomains: ['example.com'],
      },
    });

    expect(query).toContain('retail');
    expect(query).toContain('uae');
    expect(query).toContain('shopify');
    expect(query).toContain('whatsapp');
    expect(query).toContain('-site:example.com');
  });
});
