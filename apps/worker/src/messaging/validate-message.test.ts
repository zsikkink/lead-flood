import { describe, expect, it } from 'vitest';

import { validateMessageVariant, buildStricterPromptSuffix } from './validate-message.js';

describe('validateMessageVariant', () => {
  const base = { subject: null, bodyHtml: null, ctaText: null };

  it('hard-rejects stub body "Message generation pending"', () => {
    const result = validateMessageVariant('WHATSAPP', { ...base, bodyText: 'Message generation pending' });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
    expect(result.reasons[0]).toMatch(/stub/i);
  });

  it('hard-rejects empty body', () => {
    const result = validateMessageVariant('EMAIL', { ...base, bodyText: '  ' });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
  });

  it('hard-rejects placeholder patterns', () => {
    const result = validateMessageVariant('WHATSAPP', {
      ...base,
      bodyText: 'Hi {firstName}, welcome to {{company}}. We would love to connect with you about our services.',
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
    expect(result.reasons).toContain('Contains unfilled placeholder patterns');
  });

  it('hard-rejects spam trigger words', () => {
    const result = validateMessageVariant('EMAIL', {
      ...base,
      bodyText: 'Act now to get this GUARANTEED offer before the limited time expires. This is a great opportunity for your business.',
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
    expect(result.reasons).toContain('Contains spam trigger words');
  });

  it('hard-rejects too-short body', () => {
    const result = validateMessageVariant('EMAIL', { ...base, bodyText: 'Hi there, check us out.' });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
    expect(result.reasons[0]).toMatch(/too short/i);
  });

  it('soft-truncates long WhatsApp messages', () => {
    const longBody = 'This is a sentence about Zbooni. '.repeat(20);
    const result = validateMessageVariant('WHATSAPP', { ...base, bodyText: longBody });
    expect(result.valid).toBe(true);
    expect(result.hardReject).toBe(false);
    expect(result.cleaned.bodyText.length).toBeLessThanOrEqual(300);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('soft-strips excess emojis for WhatsApp', () => {
    const body = 'Great news for your business! 🎉🚀💰🌟🎊 We have something special for you today.';
    const result = validateMessageVariant('WHATSAPP', { ...base, bodyText: body });
    expect(result.valid).toBe(true);
    const cleaned = result.cleaned.bodyText;
    // eslint-disable-next-line no-misleading-character-class
    const emojiMatches = cleaned.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu);
    expect((emojiMatches ?? []).length).toBeLessThanOrEqual(3);
  });

  it('passes a clean message through', () => {
    const body = 'Hi Sarah, I came across your business and thought Zbooni could help streamline your sales operations. Would you be open to a quick chat?';
    const result = validateMessageVariant('WHATSAPP', { ...base, bodyText: body });
    expect(result.valid).toBe(true);
    expect(result.hardReject).toBe(false);
    expect(result.cleaned.bodyText).toBe(body);
  });
});

describe('buildStricterPromptSuffix', () => {
  it('returns a string with character limit for WhatsApp', () => {
    const suffix = buildStricterPromptSuffix('WHATSAPP');
    expect(suffix).toContain('300');
    expect(suffix).toContain('placeholder');
  });

  it('returns a string with character limit for Email', () => {
    const suffix = buildStricterPromptSuffix('EMAIL');
    expect(suffix).toContain('500');
  });
});
