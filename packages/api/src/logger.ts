/**
 * Shared pino logger instance. Uses pino-pretty with human-readable output
 * outside of production, and structured JSON in production.
 */
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.env !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
      : undefined,
});
