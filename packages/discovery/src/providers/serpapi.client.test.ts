import { describe, expect, it } from 'vitest';

import { SerpApiDiscoveryProvider } from './serpapi.client.js';

function createProvider(payload: unknown): SerpApiDiscoveryProvider {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });

  return new SerpApiDiscoveryProvider({
    apiKey: 'test-key',
    rps: 100,
    enableCache: true,
    fetchImpl,
  });
}

describe('SerpApiDiscoveryProvider local parsing', () => {
  it('extracts website and instagram from google_local links object', async () => {
    const provider = createProvider({
      local_results: [
        {
          title: 'Sao Paulo Beauty',
          links: {
            website: 'https://saopaulomicroblading.com/',
            directions: 'https://www.google.com/maps/dir//example',
          },
        },
        {
          title: 'Sand Salon',
          links: {
            website: 'https://www.instagram.com/sand__salon',
            directions: 'https://www.google.com/maps/dir//example',
          },
        },
      ],
    });

    const result = await provider.searchGoogleLocal({
      query: 'beauty salon cairo',
      countryCode: 'EG',
      language: 'ar',
      city: 'Cairo',
      page: 1,
    });

    expect(result.localBusinesses).toHaveLength(2);
    expect(result.localBusinesses[0]?.websiteUrl).toBe('https://saopaulomicroblading.com/');
    expect(result.localBusinesses[0]?.instagramHandle).toBeNull();
    expect(result.localBusinesses[1]?.websiteUrl).toBeNull();
    expect(result.localBusinesses[1]?.instagramHandle).toBe('sand__salon');
  });

  it('extracts from links array and ignores google maps urls as website', async () => {
    const provider = createProvider({
      local_results: [
        {
          title: 'Dehya Beauty',
          links: [
            { url: 'https://www.google.com/maps/dir//example' },
            { url: 'https://www.instagram.com/dehyasalon/' },
            { url: 'https://dehyabeauty.com/' },
          ],
        },
      ],
    });

    const result = await provider.searchGoogleLocal({
      query: 'beauty salon cairo',
      countryCode: 'EG',
      language: 'ar',
      city: 'Cairo',
      page: 1,
    });

    expect(result.localBusinesses).toHaveLength(1);
    expect(result.localBusinesses[0]?.websiteUrl).toBe('https://dehyabeauty.com/');
    expect(result.localBusinesses[0]?.instagramHandle).toBe('dehyasalon');
  });
});
