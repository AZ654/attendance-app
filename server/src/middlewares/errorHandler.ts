import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../lib/errors.js';
import { formatZodError } from '../lib/validate.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/env.js';

/** 404 兜底 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `接口不存在: ${req.method} ${req.path}`));
};

/** 全局错误处理：客户端只看到规范化结构，绝不返回堆栈。 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '服务器内部错误';
  let details: unknown;

  if (isAppError(err)) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = '请求数据校验失败';
    details = formatZodError(err);
  } else if (typeof err?.status === 'number' && err.status === 400) {
    status = 400;
    code = 'BAD_REQUEST';
    message = '请求格式无效';
  }

  const logPayload = {
    err,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
  };
  if (status >= 500) logger.error(logPayload, '请求处理异常');
  else logger.warn(logPayload, '请求被拒绝');

  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(config.NODE_ENV === 'development' && status >= 500 ? { stack: err?.stack } : {}),
    },
    requestId: req.requestId,
  });
};
