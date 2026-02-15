import { describe, expect, it, vi } from 'vitest';

import { ApolloDiscoveryAdapter, ApolloRateLimitError } from './apollo.adapter.js';

describe('ApolloDiscoveryAdapter integration', () => {
  it('normalizes leads and returns next cursor', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          people: [
            {
              id: 'apollo-person-1',
              first_name: 'Lina',
              last_name: 'Khan',
              email: 'lina@acme.com',
              title: 'Head of Sales',
              country: 'AE',
              organization: {
                name: 'Acme',
                primary_domain: 'acme.com',
                estimated_num_employees: 120,
              },
            },
            {
              id: 'apollo-person-2',
              first_name: 'Blocked',
              last_name: 'Domain',
              email: 'blocked@blocked.com',
              country: 'AE',
              organization: {
                name: 'Blocked Inc',
                primary_domain: 'blocked.com',
                estimated_num_employees: 50,
              },
            },
          ],
          pagination: {
            page: 1,
            next_page: 2,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as unknown as typeof fetch;

    const adapter = new ApolloDiscoveryAdapter({
      apiKey: 'apollo-test-key',
      baseUrl: 'https://apollo.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      icpProfileId: 'icp-1',
      limit: 25,
      cursor: '1',
      correlationId: 'corr-1',
      filters: {
        excludedDomains: ['blocked.com'],
      },
    });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.providerRecordId).toBe('apollo-person-1');
    expect(result.leads[0]?.email).toBe('lina@acme.com');
    expect(result.nextCursor).toBe('2');
  });

  it('throws ApolloRateLimitError on 429', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('rate limited', {
        status: 429,
        headers: {
          'retry-after': '11',
        },
      });
    }) as unknown as typeof fetch;

    const adapter = new ApolloDiscoveryAdapter({
      apiKey: 'apollo-test-key',
      baseUrl: 'https://apollo.test',
      minRequestIntervalMs: 0,
      fetchImpl,
    });

    await expect(
      adapter.discoverLeads({
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(ApolloRateLimitError);
  });
});
