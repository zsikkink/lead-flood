import { describe, expect, it, vi } from 'vitest';

import {
  buildGooglePlacesQuery,
  GooglePlacesAdapter,
  GooglePlacesRateLimitError,
} from './googlePlaces.adapter.js';

describe('GooglePlacesAdapter integration', () => {
  it('returns normalized discovery results', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          places: [
            {
              id: 'place-1',
              displayName: {
                text: 'Acme Bakery',
              },
              websiteUri: 'https://acmebakery.example',
              addressComponents: [
                {
                  shortText: 'AE',
                  types: ['country'],
                },
              ],
            },
          ],
          nextPageToken: 'token-2',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new GooglePlacesAdapter({
      enabled: true,
      apiKey: 'places-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
      filters: {
        industries: ['bakery'],
        countries: ['uae'],
      },
    });

    expect(result.source).toBe('google_places_api');
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.provider).toBe('google_places');
    expect(result.leads[0]?.email).toBe('info@acmebakery.example');
    expect(result.leads[0]?.country).toBe('AE');
    expect(result.nextCursor).toBe('token-2');
  });

  it('returns stub when disabled', async () => {
    const adapter = new GooglePlacesAdapter({
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

  it('throws GooglePlacesRateLimitError on 429', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '15' },
      });
    }) as unknown as typeof fetch;

    const adapter = new GooglePlacesAdapter({
      enabled: true,
      apiKey: 'places-key',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    await expect(
      adapter.discoverLeads({
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(GooglePlacesRateLimitError);
  });

  it('builds deterministic query text from filters', () => {
    const query = buildGooglePlacesQuery({
      filters: {
        industries: ['restaurant'],
        countries: ['uae'],
        includeTerms: ['delivery'],
      },
    });

    expect(query).toContain('restaurant');
    expect(query).toContain('uae');
    expect(query).toContain('delivery');
    expect(query).toContain('contact us');
  });
});
