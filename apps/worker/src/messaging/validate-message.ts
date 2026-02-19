// apps/worker/src/messaging/validate-message.ts

export type MessageChannel = 'EMAIL' | 'WHATSAPP';

export interface ValidationResult {
  valid: boolean;
  hardReject: boolean;
  reasons: string[];
  cleaned: {
    subject: string | null;
    bodyText: string;
    bodyHtml: string | null;
    ctaText: string | null;
  };
}

const PLACEHOLDER_PATTERNS = [
  /\[.*?\]/g,        // [Name], [Company]
  /\{[^{].*?\}/g,    // {name}, {company}  (not {{)
  /\{\{.*?\}\}/g,    // {{name}}
  /\$\{.*?\}/g,      // ${name}
  /<[A-Z][A-Za-z]*>/g, // <Name>, <Company> (uppercase start to avoid HTML tags)
];

const SPAM_TRIGGER_WORDS = [
  'free', 'act now', 'limited time', 'exclusive offer', 'guaranteed',
  'winner', 'free money', 'urgent', 'no obligation', 'risk free',
  'click here', 'buy now', 'order now', 'don\'t miss', 'last chance',
];

const CHANNEL_LIMITS: Record<MessageChannel, { min: number; max: number; maxEmoji: number }> = {
  WHATSAPP: { min: 50, max: 300, maxEmoji: 3 },
  EMAIL: { min: 100, max: 500, maxEmoji: 1 },
};

// Unicode emoji regex (covers most common emojis)
// eslint-disable-next-line no-misleading-character-class
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

function countEmojis(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

function stripExcessEmojis(text: string, maxEmoji: number): string {
  let count = 0;
  return text.replace(EMOJI_REGEX, (match) => {
    count++;
    return count <= maxEmoji ? match : '';
  });
}

function truncateAtSentenceBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
  );
  if (lastSentenceEnd > maxLength * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }
  // Fall back to last space
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLength * 0.5
    ? truncated.slice(0, lastSpace).trim()
    : truncated.trim();
}

function hasPlaceholders(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function hasSpamWords(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_TRIGGER_WORDS.some((word) => lower.includes(word));
}

const STUB_BODY = 'Message generation pending';

export function validateMessageVariant(
  channel: MessageChannel,
  content: { subject: string | null; bodyText: string; bodyHtml: string | null; ctaText: string | null },
): ValidationResult {
  const reasons: string[] = [];
  let hardReject = false;
  const limits = CHANNEL_LIMITS[channel];

  const { bodyHtml, ctaText } = content;
  let { subject, bodyText } = content;

  // Hard reject: stub body from failed OpenAI
  if (bodyText === STUB_BODY || bodyText.trim() === '') {
    return {
      valid: false,
      hardReject: true,
      reasons: ['Body is stub/empty — OpenAI generation failed'],
      cleaned: content,
    };
  }

  // Hard reject: placeholders
  if (hasPlaceholders(bodyText) || (subject && hasPlaceholders(subject))) {
    hardReject = true;
    reasons.push('Contains unfilled placeholder patterns');
  }

  // Hard reject: spam trigger words
  if (hasSpamWords(bodyText) || (subject && hasSpamWords(subject))) {
    hardReject = true;
    reasons.push('Contains spam trigger words');
  }

  // Hard reject: too short
  if (bodyText.length < limits.min) {
    hardReject = true;
    reasons.push(`Body too short: ${bodyText.length} chars (min: ${limits.min})`);
  }

  if (hardReject) {
    return { valid: false, hardReject: true, reasons, cleaned: content };
  }

  // Soft: truncate if too long
  if (bodyText.length > limits.max) {
    reasons.push(`Truncated from ${bodyText.length} to within ${limits.max} chars`);
    bodyText = truncateAtSentenceBoundary(bodyText, limits.max);
  }

  // Soft: strip excess emojis
  const emojiCount = countEmojis(bodyText);
  if (emojiCount > limits.maxEmoji) {
    reasons.push(`Stripped emojis from ${emojiCount} to ${limits.maxEmoji}`);
    bodyText = stripExcessEmojis(bodyText, limits.maxEmoji);
  }

  // Clean subject too if email
  if (subject) {
    const subjectEmojis = countEmojis(subject);
    if (subjectEmojis > 1) {
      subject = stripExcessEmojis(subject, 1);
    }
    if (subject.length > 100) {
      subject = truncateAtSentenceBoundary(subject, 100);
    }
  }

  return {
    valid: true,
    hardReject: false,
    reasons,
    cleaned: { subject, bodyText, bodyHtml, ctaText },
  };
}

/** Builds a stricter prompt suffix for retry attempts. */
export function buildStricterPromptSuffix(channel: MessageChannel): string {
  const limits = CHANNEL_LIMITS[channel];
  return [
    'IMPORTANT CONSTRAINTS:',
    `- Stay within ${limits.max} characters for the body.`,
    '- Do NOT use any placeholder patterns like {firstName}, {{company}}, [NAME], etc.',
    '- Do NOT use spam words like FREE, ACT NOW, LIMITED TIME, GUARANTEED, etc.',
    `- Use at most ${limits.maxEmoji} emoji${limits.maxEmoji === 1 ? '' : 's'}.`,
    '- Write a professional, natural message.',
  ].join(' ');
}
