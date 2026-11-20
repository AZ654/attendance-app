import pino from 'pino';
import { config } from '../config/env.js';

/** 结构化 JSON 日志。生产禁用人肉可读输出，始终为 JSON。 */
export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'accessToken',
      'refreshToken',
      'idCard',
      'phone',
      '*.password',
      '*.idCard',
      '*.phone',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'attendance-server', env: config.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
