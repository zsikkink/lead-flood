export interface TrengoAdapterConfig {
  apiKey: string | undefined;
  baseUrl?: string | undefined;
  channelId?: string | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface TrengoTemplateMessageRequest {
  to: string;
  templateName: string;
  params: Record<string, string>;
}

export interface TrengoDirectMessageRequest {
  to: string;
  bodyText: string;
}

export interface TrengoFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type TrengoSendResult =
  | { status: 'success'; providerMessageId: string }
  | { status: 'retryable_error'; failure: TrengoFailure }
  | { status: 'terminal_error'; failure: TrengoFailure };

const DEFAULT_BASE_URL = 'https://app.trengo.com/api/v2';
const DEFAULT_TIMEOUT_MS = 15_000;

function classifyStatus(statusCode: number): 'retryable' | 'terminal' {
  if (statusCode === 429 || statusCode >= 500) {
    return 'retryable';
  }
  return 'terminal';
}

export class TrengoAdapter {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly channelId: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TrengoAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.channelId = config.channelId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey) && Boolean(this.channelId);
  }

  async sendTemplateMessage(
    request: TrengoTemplateMessageRequest,
  ): Promise<TrengoSendResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'TRENGO_API_KEY is not configured',
          raw: null,
        },
      };
    }

    if (!this.channelId) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'TRENGO_CHANNEL_ID is not configured',
          raw: null,
        },
      };
    }

    return this.post('/wa_sessions', {
      channel_id: this.channelId,
      to: request.to,
      template_name: request.templateName,
      params: request.params,
    });
  }

  async sendMessage(
    request: TrengoDirectMessageRequest,
  ): Promise<TrengoSendResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'TRENGO_API_KEY is not configured',
          raw: null,
        },
      };
    }

    if (!this.channelId) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'TRENGO_CHANNEL_ID is not configured',
          raw: null,
        },
      };
    }

    return this.post('/wa_sessions', {
      channel_id: this.channelId,
      to: request.to,
      body: request.bodyText,
    });
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<TrengoSendResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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
          message: error instanceof Error ? error.message : 'Trengo request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: TrengoFailure = {
        classification,
        statusCode: response.status,
        message: `Trengo API returned status ${response.status}`,
        raw: parseJsonSafe(rawText),
      };
      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    try {
      const parsed = JSON.parse(rawText) as { id?: number };
      return {
        status: 'success',
        providerMessageId: String(parsed.id ?? 'unknown'),
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
