import { describe, expect, it, vi } from 'vitest';

import { OpenAiAdapter } from './openai.adapter.js';

function makeOpenAiResponse(content: string) {
  return JSON.stringify({
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    model: 'gpt-4o-2024-08-06',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  });
}

const VALID_GENERATION_RESPONSE = {
  variant_a: {
    subject: 'Boost your fintech payments',
    bodyText: 'Hi Sara, I noticed Acme is growing fast...',
    bodyHtml: '<p>Hi Sara, I noticed Acme is growing fast...</p>',
    ctaText: 'Schedule a demo',
  },
  variant_b: {
    subject: 'Quick question about payments',
    bodyText: 'Hey Sara, just saw what Acme is up to...',
    bodyHtml: null,
    ctaText: null,
  },
};

const VALID_SCORING_RESPONSE = {
  score: 0.82,
  reasoning: ['Strong fintech alignment', 'UAE market presence'],
};

const GENERATION_CONTEXT = {
  leadName: 'Sara Ali',
  leadEmail: 'sara@acme.com',
  companyName: 'Acme Corp',
  industry: 'Fintech',
  country: 'UAE',
  featuresJson: { employees: 50, revenue: 1000000 },
  scoreBand: 'A',
  blendedScore: 0.85,
  icpDescription: 'UAE fintech company with 10-200 employees',
};

const SCORING_CONTEXT = {
  featuresJson: { employees: 50, revenue: 1000000 },
  icpDescription: 'UAE fintech company with 10-200 employees',
  deterministicScore: 0.75,
};

describe('OpenAiAdapter integration', () => {
  describe('generateMessageVariants', () => {
    it('returns parsed variant pair on success', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(
          makeOpenAiResponse(JSON.stringify(VALID_GENERATION_RESPONSE)),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error('Expected success');
      expect(result.data.model).toBe('gpt-4o');
      expect(result.data.variant_a.subject).toBe('Boost your fintech payments');
      expect(result.data.variant_b.bodyText).toContain('Sara');
    });

    it('strips markdown fences from response', async () => {
      const fencedContent = '```json\n' + JSON.stringify(VALID_GENERATION_RESPONSE) + '\n```';
      const fetchImpl = vi.fn(async () => {
        return new Response(
          makeOpenAiResponse(fencedContent),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error('Expected success');
      expect(result.data.variant_a.subject).toBe('Boost your fintech payments');
    });

    it('returns terminal_error when API key is missing', async () => {
      const adapter = new OpenAiAdapter({
        apiKey: undefined,
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });

      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('terminal_error');
      if (result.status !== 'terminal_error') throw new Error('Expected terminal_error');
      expect(result.failure.message).toContain('OPENAI_API_KEY');
    });

    it('classifies 429 as retryable', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('retryable_error');
    });

    it('classifies 500 as retryable', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('retryable_error');
    });

    it('classifies 401 as terminal', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'invalid_api_key' }), { status: 401 });
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('terminal_error');
    });

    it('returns terminal_error when response content is missing', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(
          JSON.stringify({ choices: [{ message: {} }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('terminal_error');
    });

    it('returns retryable_error on network failure', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.generateMessageVariants(GENERATION_CONTEXT);

      expect(result.status).toBe('retryable_error');
      if (result.status !== 'retryable_error') throw new Error('Expected retryable_error');
      expect(result.failure.message).toBe('ECONNREFUSED');
    });
  });

  describe('evaluateLeadScore', () => {
    it('returns parsed score result on success', async () => {
      const fetchImpl = vi.fn(async () => {
        return new Response(
          makeOpenAiResponse(JSON.stringify(VALID_SCORING_RESPONSE)),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const adapter = new OpenAiAdapter({ apiKey: 'sk-test', fetchImpl });
      const result = await adapter.evaluateLeadScore(SCORING_CONTEXT);

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error('Expected success');
      expect(result.data.score).toBe(0.82);
      expect(result.data.reasoning).toHaveLength(2);
    });

    it('returns terminal_error when API key is missing', async () => {
      const adapter = new OpenAiAdapter({
        apiKey: undefined,
        fetchImpl: vi.fn() as unknown as typeof fetch,
      });

      const result = await adapter.evaluateLeadScore(SCORING_CONTEXT);

      expect(result.status).toBe('terminal_error');
    });
  });

  describe('isConfigured', () => {
    it('returns true when API key is set', () => {
      const adapter = new OpenAiAdapter({ apiKey: 'sk-test' });
      expect(adapter.isConfigured).toBe(true);
    });

    it('returns false when API key is undefined', () => {
      const adapter = new OpenAiAdapter({ apiKey: undefined });
      expect(adapter.isConfigured).toBe(false);
    });
  });
});
