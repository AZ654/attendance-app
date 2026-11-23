import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createRequire } from 'node:module';

// pino-http 以 CommonJS export= 导出，用 createRequire 在 ESM 下可靠引入
const require = createRequire(import.meta.url);
type PinoHttpFn = (opts?: Record<string, unknown>) => (req: Request, res: Response, next: () => void) => void;
const pinoHttp = require('pino-http') as PinoHttpFn;
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { consentRouter } from './modules/consent/consent.routes.js';
import { locationsRouter } from './modules/locations/locations.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { mailRelayRouter } from './modules/mail-relay/mail-relay.routes.js';
import { mailQueue } from './jobs/mailer.js';
import { initSchema } from './db/index.js';

initSchema();

export function createApp() {
  const app = express();

  // 请求 ID 贯穿日志
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req: Request) => (req as Request).requestId,
      customLogLevel: (_req: Request, res: Response, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req: Request) => req.url === '/health' || req.url === '/ready' },
    }),
  );

  // 安全头（PWA 需要 manifest 同源，helmet 默认策略足够）
  app.use(helmet());
  // CORS：显式来源，生产禁用通配符（已在 config 校验）
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // 服务端到服务端 / curl
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS 来源不被允许'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  // 限流：认证相关端点 stricter
  // 注意：GET /auth/wechat/url 是前端每次加载登录页都会调用的「开发模式探测」端点，
  // 无副作用且必须可靠，故豁免限流；否则探测被 429 会导致前端误判登录方式（显示成微信登录）。
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) =>
      (req.method === 'GET' && req.originalUrl.startsWith('/api/auth/wechat/url')) ||
      (req.method === 'GET' && req.originalUrl.startsWith('/api/auth/qr-status')),
    message: { error: { code: 'TOO_MANY_REQUESTS', message: '操作过于频繁，请稍后再试' } },
  });

  // 健康检查端点
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });
  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready', db: 'ok', mailJobs: mailQueue.stats() });
  });

  const api = express.Router();
  api.use('/auth', authLimiter, authRouter);
  api.use('/users', usersRouter);
  api.use('/consent', consentRouter);
  api.use('/locations', locationsRouter);
  api.use('/admin', adminRouter);
  api.use('/mail-relay', mailRelayRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
