import { z } from 'zod';

// ---------- Public types ----------

export interface OpenAiAdapterConfig {
  apiKey: string | undefined;
  generationModel?: string | undefined;
  scoringModel?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface MessageGenerationContext {
  leadName: string;
  leadEmail: string;
  companyName: string | null;
  industry: string | null;
  country: string | null;
  featuresJson: Record<string, unknown>;
  scoreBand: string;
  blendedScore: number;
  icpDescription: string;
}

export interface MessageVariantContent {
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  ctaText: string | null;
}

export interface MessageVariantPair {
  model: string;
  variant_a: MessageVariantContent;
  variant_b: MessageVariantContent;
}

export interface LeadScoringContext {
  featuresJson: Record<string, unknown>;
  icpDescription: string;
  deterministicScore: number;
}

export interface AiScoreResult {
  score: number;
  reasoning: string[];
}

export interface OpenAiFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type OpenAiGenerationResult =
  | { status: 'success'; data: MessageVariantPair }
  | { status: 'retryable_error'; failure: OpenAiFailure }
  | { status: 'terminal_error'; failure: OpenAiFailure };

export type OpenAiScoringResult =
  | { status: 'success'; data: AiScoreResult }
  | { status: 'retryable_error'; failure: OpenAiFailure }
  | { status: 'terminal_error'; failure: OpenAiFailure };

// ---------- Zod response schemas for structured output ----------

const MessageVariantSchema = z.object({
  subject: z.string().nullable(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable(),
  ctaText: z.string().nullable(),
});

const GenerationResponseSchema = z.object({
  variant_a: MessageVariantSchema,
  variant_b: MessageVariantSchema,
});

const ScoringResponseSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.array(z.string()),
});

// ---------- Defaults ----------

const DEFAULT_GENERATION_MODEL = 'gpt-4o';
const DEFAULT_SCORING_MODEL = 'gpt-4o';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------- Helpers ----------

function classifyStatus(statusCode: number): 'retryable' | 'terminal' {
  if (statusCode === 429 || statusCode >= 500) {
    return 'retryable';
  }
  return 'terminal';
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// ---------- Adapter ----------

export class OpenAiAdapter {
  private readonly apiKey: string | undefined;
  private readonly generationModel: string;
  private readonly scoringModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.generationModel = config.generationModel ?? DEFAULT_GENERATION_MODEL;
    this.scoringModel = config.scoringModel ?? DEFAULT_SCORING_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateMessageVariants(
    context: MessageGenerationContext,
  ): Promise<OpenAiGenerationResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'OPENAI_API_KEY is not configured',
          raw: null,
        },
      };
    }

    const systemPrompt = [
      'You are an expert B2B sales copywriter for Zbooni, a UAE fintech company.',
      'Generate two message variants (variant_a and variant_b) for outreach.',
      'Each variant must have: subject (email subject line or null for WhatsApp), bodyText (plain text), bodyHtml (HTML version or null), ctaText (call-to-action text or null).',
      'Make messages personalized, professional, and concise.',
      'variant_a should be more formal/direct; variant_b should be more conversational/casual.',
    ].join(' ');

    const userPrompt = [
      `Lead: ${context.leadName} (${context.leadEmail})`,
      context.companyName ? `Company: ${context.companyName}` : null,
      context.industry ? `Industry: ${context.industry}` : null,
      context.country ? `Country: ${context.country}` : null,
      `Score band: ${context.scoreBand} (${context.blendedScore.toFixed(2)})`,
      `ICP description: ${context.icpDescription}`,
      `Features: ${JSON.stringify(context.featuresJson)}`,
    ]
      .filter(Boolean)
      .join('\n');

    return this.callChatCompletion<MessageVariantPair>(
      this.generationModel,
      systemPrompt,
      userPrompt,
      GenerationResponseSchema,
      (parsed) => ({
        model: this.generationModel,
        variant_a: parsed.variant_a,
        variant_b: parsed.variant_b,
      }),
    );
  }

  async evaluateLeadScore(
    context: LeadScoringContext,
  ): Promise<OpenAiScoringResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'OPENAI_API_KEY is not configured',
          raw: null,
        },
      };
    }

    const systemPrompt = [
      'You are an expert lead scoring analyst for Zbooni, a UAE fintech company.',
      'Evaluate the lead quality based on the feature vector and ICP criteria.',
      'Return a score between 0 and 1 (0 = poor fit, 1 = perfect fit) and a list of reasoning strings.',
      'Consider the deterministic score as a baseline and adjust based on qualitative factors.',
    ].join(' ');

    const userPrompt = [
      `Deterministic score: ${context.deterministicScore.toFixed(4)}`,
      `ICP description: ${context.icpDescription}`,
      `Features: ${JSON.stringify(context.featuresJson)}`,
    ].join('\n');

    return this.callChatCompletion<AiScoreResult>(
      this.scoringModel,
      systemPrompt,
      userPrompt,
      ScoringResponseSchema,
      (parsed) => ({
        score: parsed.score,
        reasoning: parsed.reasoning,
      }),
    );
  }

  private async callChatCompletion<T>(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType,
    transform: (parsed: z.infer<typeof schema>) => T,
  ): Promise<
    | { status: 'success'; data: T }
    | { status: 'retryable_error'; failure: OpenAiFailure }
    | { status: 'terminal_error'; failure: OpenAiFailure }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              strict: true,
              schema: zodToJsonSchema(schema),
            },
          },
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'OpenAI request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: OpenAiFailure = {
        classification,
        statusCode: response.status,
        message: `OpenAI API returned status ${response.status}`,
        raw: parseJsonSafe(rawText),
      };
      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    try {
      const responseJson = JSON.parse(rawText) as Record<string, unknown>;
      const choices = responseJson.choices as Array<{
        message?: { content?: string };
      }>;
      const content = choices?.[0]?.message?.content;

      if (!content) {
        return {
          status: 'terminal_error',
          failure: {
            classification: 'terminal',
            statusCode: response.status,
            message: 'OpenAI response missing content',
            raw: responseJson,
          },
        };
      }

      const cleaned = stripMarkdownFences(content);
      const parsedContent = JSON.parse(cleaned) as unknown;
      const validated = schema.parse(parsedContent);

      return { status: 'success', data: transform(validated) };
    } catch (error: unknown) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: response.status,
          message: error instanceof Error ? error.message : 'Failed to parse OpenAI response',
          raw: parseJsonSafe(rawText),
        },
      };
    }
  }
}

// ---------- JSON Schema helper (minimal zodToJsonSchema for structured output) ----------

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodNullable) && !(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element as z.ZodType),
    };
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap() as z.ZodType);
    return { ...inner, nullable: true };
  }

  return { type: 'string' };
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
