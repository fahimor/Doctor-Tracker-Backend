import pino from 'pino';
import { env } from './env.js';

/**
 * Structured JSON logger. The `severity` field is what Google Cloud Logging
 * reads, so logs from Cloud Run show the right level in the console.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  messageKey: 'message',
  formatters: {
    level(label, number) {
      return { severity: label.toUpperCase(), level: number };
    },
  },
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, messageKey: 'message' } } }
    : {}),
});
