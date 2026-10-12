/**
 * The application logger (pino).
 *
 * In development it pretty-prints colourised lines; in production it emits plain
 * JSON that PM2 captures for log aggregation. Also exports `swallow`, a tidy way
 * to discard an expected, non-fatal error (e.g. a `.catch(swallow)` on a Discord
 * call that may harmlessly fail) while still leaving a debug trace.
 */
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
