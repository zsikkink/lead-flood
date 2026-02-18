import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ApiClient, ApiError } from './api-client.js';

describe('ApiClient', () => {
  const baseUrl = 'http://localhost:5050';
  let getToken: () => string | null;
  let client: ApiClient;

  beforeEach(() => {
    getToken = vi.fn(() => 'test-token');
    client = new ApiClient(baseUrl, getToken);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends authorization header when token is present', async () => {
    const mockResponse = { items: [], page: 1, pageSize: 20, total: 0 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await client.listLeads({ page: 1, pageSize: 20 });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/leads'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('omits authorization header when no token', async () => {
    (getToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const mockResponse = { tokenType: 'Bearer', accessToken: 'x', refreshToken: 'y', expiresInSeconds: 3600, user: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await client.login({ email: 'a@b.com', password: 'pass' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/login'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          authorization: expect.any(String),
        }),
      }),
    );
  });

  it('throws ApiError with status and message on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found', requestId: 'req-1' }), { status: 404 }),
    );

    await expect(client.getLead('bad-id')).rejects.toThrow(ApiError);
  });

  it('throws specific message on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    await expect(client.listLeads({ page: 1, pageSize: 20 })).rejects.toThrow(
      'Session expired',
    );
  });

  it('builds query params correctly', async () => {
    const mockResponse = { items: [], page: 1, pageSize: 10, total: 0 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await client.listLeads({ page: 2, pageSize: 10, status: 'enriched' });

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('pageSize=10');
    expect(calledUrl).toContain('status=enriched');
  });
});
