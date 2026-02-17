import { describe, expect, it, vi } from 'vitest';

import { ResendAdapter } from './resend.adapter.js';

const SEND_REQUEST = {
  to: 'sara@acme.com',
  subject: 'Boost your payments',
  bodyText: 'Hi Sara, I noticed Acme...',
  bodyHtml: '<p>Hi Sara, I noticed Acme...</p>',
  idempotencyKey: 'idem-123',
};

describe('ResendAdapter integration', () => {
  it('returns success with provider message id', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ id: 'msg_abc123' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');
    expect(result.providerMessageId).toBe('msg_abc123');

    // Verify the request was made correctly
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((options as RequestInit).method).toBe('POST');

    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body.from).toBe('noreply@leadflood.io');
    expect(body.to).toEqual(['sara@acme.com']);
    expect(body.subject).toBe('Boost your payments');
    expect(body.html).toBe('<p>Hi Sara, I noticed Acme...</p>');
  });

  it('omits html field when bodyHtml is null', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ id: 'msg_abc456' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    await adapter.sendEmail({ ...SEND_REQUEST, bodyHtml: null });

    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.html).toBeUndefined();
  });

  it('returns terminal_error when API key is missing', async () => {
    const adapter = new ResendAdapter({
      apiKey: undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('terminal_error');
    if (result.status !== 'terminal_error') throw new Error('Expected terminal_error');
    expect(result.failure.message).toContain('RESEND_API_KEY');
  });

  it('classifies 429 as retryable', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('retryable_error');
  });

  it('classifies 500 as retryable', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('retryable_error');
  });

  it('classifies 400 as terminal', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'bad request' }), { status: 400 });
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('terminal_error');
  });

  it('returns retryable_error on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({ apiKey: 're_test', fetchImpl });
    const result = await adapter.sendEmail(SEND_REQUEST);

    expect(result.status).toBe('retryable_error');
    if (result.status !== 'retryable_error') throw new Error('Expected retryable_error');
    expect(result.failure.message).toBe('ECONNREFUSED');
  });

  it('uses custom fromEmail and baseUrl', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 'msg_custom' }), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = new ResendAdapter({
      apiKey: 're_test',
      fromEmail: 'sales@zbooni.com',
      baseUrl: 'https://custom.resend.dev',
      fetchImpl,
    });

    await adapter.sendEmail(SEND_REQUEST);

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://custom.resend.dev/emails');

    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.from).toBe('sales@zbooni.com');
  });

  describe('isConfigured', () => {
    it('returns true when API key is set', () => {
      const adapter = new ResendAdapter({ apiKey: 're_test' });
      expect(adapter.isConfigured).toBe(true);
    });

    it('returns false when API key is undefined', () => {
      const adapter = new ResendAdapter({ apiKey: undefined });
      expect(adapter.isConfigured).toBe(false);
    });
  });
});
