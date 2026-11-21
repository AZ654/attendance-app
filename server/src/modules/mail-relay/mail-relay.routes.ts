import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { validate } from '../../lib/validate.js';
import { logger } from '../../lib/logger.js';
import { mailQueue } from '../../jobs/mailer.js';

const claimSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const reportSchema = z
  .object({
    sentIds: z.array(z.string().uuid()).default([]),
    failures: z
      .array(
        z.object({
          id: z.string().uuid(),
          error: z.string().min(1).max(1000),
        }),
      )
      .default([]),
  })
  .refine((value) => value.sentIds.length + value.failures.length > 0, '没有可上报的发送结果');

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const requireRelayToken: RequestHandler = (req, _res, next) => {
  if (!config.mailRelayEnabled || !config.mailRelayToken) {
    throw new UnauthorizedError('邮件中继未启用');
  }
  const provided = req.header('x-relay-token') ?? '';
  if (!tokenMatches(provided, config.mailRelayToken)) {
    throw new UnauthorizedError('中继令牌无效');
  }
  next();
};

export const mailRelayRouter = Router();
mailRelayRouter.use(requireRelayToken);

/** GitHub Actions 领取待发邮件；领取后加锁，避免重复发送。 */
mailRelayRouter.get('/claim', validate(claimSchema, 'query'), (req, res) => {
  const jobs = mailQueue.claim(Number(req.query.limit ?? 10));
  res.json({ jobs });
});

/** GitHub Actions 回报发送结果，后端据此更新队列状态。 */
mailRelayRouter.post('/report', validate(reportSchema), (req, res) => {
  const result = mailQueue.report(req.body.sentIds, req.body.failures);
  logger.info({ ...result, reported: req.body.sentIds.length + req.body.failures.length }, '邮件中继结果已记录');
  res.json(result);
});
