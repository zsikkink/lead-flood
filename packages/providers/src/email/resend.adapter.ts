export interface ResendAdapterConfig {
  apiKey: string | undefined;
  fromEmail?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface ResendSendEmailRequest {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  idempotencyKey: string;
}

export interface ResendFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type ResendSendResult =
  | { status: 'success'; providerMessageId: string }
  | { status: 'retryable_error'; failure: ResendFailure }
  | { status: 'terminal_error'; failure: ResendFailure };

const DEFAULT_FROM_EMAIL = 'noreply@leadflood.io';
const DEFAULT_BASE_URL = 'https://api.resend.com';
const DEFAULT_TIMEOUT_MS = 15_000;

function classifyStatus(statusCode: number): 'retryable' | 'terminal' {
  if (statusCode === 429 || statusCode >= 500) {
    return 'retryable';
  }
  return 'terminal';
}

export class ResendAdapter {
  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ResendAdapterConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail ?? DEFAULT_FROM_EMAIL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async sendEmail(request: ResendSendEmailRequest): Promise<ResendSendResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'RESEND_API_KEY is not configured',
          raw: null,
        },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      const body: Record<string, unknown> = {
        from: this.fromEmail,
        to: [request.to],
        subject: request.subject,
        text: request.bodyText,
      };
      if (request.bodyHtml) {
        body.html = request.bodyHtml;
      }

      response = await this.fetchImpl(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'Resend request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: ResendFailure = {
        classification,
        statusCode: response.status,
        message: `Resend API returned status ${response.status}`,
        raw: parseJsonSafe(rawText),
      };
      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    try {
      const parsed = JSON.parse(rawText) as { id?: string };
      return {
        status: 'success',
        providerMessageId: parsed.id ?? 'unknown',
      };
    } catch {
      return {
        status: 'success',
        providerMessageId: 'unknown',
      };
    }
  }
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
