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
    base: {
      service: options.service,
      env: options.env,
    },
  });
}
