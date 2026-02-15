import { describe, expect, it, vi } from 'vitest';

import { CompanySearchAdapter } from './companySearch.adapter.js';

describe('CompanySearchAdapter integration', () => {
  it('returns normalized company results', async () => {
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

    const adapter = new CompanySearchAdapter({
      enabled: true,
      fetchImpl,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
      query: 'retail',
    });

    expect(result.source).toBe('company_autocomplete');
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.provider).toBe('company_search_free');
    expect(result.leads[0]?.email).toBe('info@acme.com');
  });

  it('returns stub when disabled', async () => {
    const adapter = new CompanySearchAdapter({
      enabled: false,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.discoverLeads({
      limit: 10,
      query: 'retail',
    });

    expect(result.source).toBe('stub');
    expect(result.leads).toHaveLength(0);
  });
});
