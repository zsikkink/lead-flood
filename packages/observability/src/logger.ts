import pino, { type Logger } from 'pino';

export interface CreateLoggerOptions {
  service: string;
  env: string;
  level?: string;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    name: options.service,
    level: options.level ?? 'info',
    redact: {
      paths: [
        'email', 'phone', 'password', 'apiKey', 'accessToken', 'refreshToken',
        '*.email', '*.phone', '*.password', '*.apiKey', '*.accessToken', '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
    base: {
      service: options.service,
      env: options.env,
    },
  });
}
