import { describe, expect, it, vi } from 'vitest';

import { LinkedInScrapeAdapter, LinkedInScrapeRateLimitError } from './linkedInScrape.adapter.js';

describe('LinkedInScrapeAdapter integration', () => {
  it('returns normalized leads from scrape endpoint', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          profiles: [
            {
              id: 'linkedin-1',
              firstName: 'Sara',
              lastName: 'Ali',
              email: 'sara@acme.com',
              title: 'Head of Growth',
              companyName: 'Acme',
              companyDomain: 'acme.com',
              country: 'AE',
            },
          ],
          nextCursor: 'cursor-2',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new LinkedInScrapeAdapter({
      enabled: true,
      scrapeEndpoint: 'https://scraper.test/linkedin',
      apiKey: 'scraper-key',
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      limit: 5,
      correlationId: 'corr-1',
    });

    expect(result.source).toBe('scrape_api');
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.provider).toBe('linkedin_scrape');
    expect(result.nextCursor).toBe('cursor-2');
  });

  it('returns stub when adapter is disabled', async () => {
    const adapter = new LinkedInScrapeAdapter({
      enabled: false,
      scrapeEndpoint: undefined,
      apiKey: undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.discoverLeads({
      limit: 5,
    });

    expect(result.source).toBe('stub');
    expect(result.leads).toHaveLength(0);
  });

  it('throws LinkedInScrapeRateLimitError on 429', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '15' },
      });
    }) as unknown as typeof fetch;

    const adapter = new LinkedInScrapeAdapter({
      enabled: true,
      scrapeEndpoint: 'https://scraper.test/linkedin',
      apiKey: 'scraper-key',
      fetchImpl,
    });

    await expect(
      adapter.discoverLeads({
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(LinkedInScrapeRateLimitError);
  });
});
