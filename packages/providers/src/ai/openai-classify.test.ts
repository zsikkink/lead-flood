import { describe, expect, it, vi } from 'vitest';

import { OpenAiAdapter } from './openai.adapter.js';

function buildAdapter(responseBody: unknown, status = 200): OpenAiAdapter {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  } as Response);

  return new OpenAiAdapter({
    apiKey: 'test-key',
    fetchImpl: mockFetch as unknown as typeof fetch,
  });
}

describe('OpenAiAdapter.classifyReply', () => {
  it('classifies an interested reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'INTERESTED', confidence: 0.95 }) } }],
    });

    const result = await adapter.classifyReply('Yes, I would love to learn more about Zbooni!');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('INTERESTED');
    }
  });

  it('classifies an out-of-office reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'OUT_OF_OFFICE', confidence: 0.9 }) } }],
    });

    const result = await adapter.classifyReply('I am currently out of the office until March 1st.');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('OUT_OF_OFFICE');
    }
  });

  it('classifies an unsubscribe reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'UNSUBSCRIBE', confidence: 0.85 }) } }],
    });

    const result = await adapter.classifyReply('Please stop contacting me.');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('UNSUBSCRIBE');
    }
  });

  it('returns terminal_error when API key is missing', async () => {
    const adapter = new OpenAiAdapter({ apiKey: undefined });
    const result = await adapter.classifyReply('Hello');
    expect(result.status).toBe('terminal_error');
  });

  it('returns retryable_error on 429', async () => {
    const adapter = buildAdapter({ error: { message: 'rate limited' } }, 429);
    const result = await adapter.classifyReply('Hello');
    expect(result.status).toBe('retryable_error');
  });
});
