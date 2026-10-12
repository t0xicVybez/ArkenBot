

import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,

  transport:
    config.env !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export function swallow(err: unknown): null {
  logger.debug({ err }, 'suppressed non-fatal error');
  return null;
}
