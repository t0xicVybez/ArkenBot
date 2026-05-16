/**
 * Shared Pino logger instance used throughout the bot. In non-production environments
 * the output is piped through pino-pretty for human-readable colourised logs.
 */

import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  // pino-pretty is only active outside production to avoid the formatting
  // overhead and to keep log output machine-parseable in deployed environments.
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
