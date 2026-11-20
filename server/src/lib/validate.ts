import type { RequestHandler } from 'express';
import { ZodType, ZodError } from 'zod';
import { BadRequestError } from './errors.js';

type Source = 'body' | 'query' | 'params';

/** 在边界用 zod 校验，绝不信任客户端数据。校验通过后用解析结果覆盖原始值。 */
export function validate(schema: ZodType, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new BadRequestError('请求数据校验失败', details));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[source] = result.data;
    next();
  };
}

export function formatZodError(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
