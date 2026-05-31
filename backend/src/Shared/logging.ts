/**
 * Logging configuration — Fastify's built-in Pino logger.
 * OTel export ready (Phase 8): swap pino-pretty for an OTel log exporter in production.
 */
export function loggerOptions() {
  const isDev = process.env['NODE_ENV'] !== 'production';
  if (isDev) {
    return {
      level: process.env['LOG_LEVEL'] || 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    };
  }
  return {
    level: process.env['LOG_LEVEL'] || 'info',
  };
}
