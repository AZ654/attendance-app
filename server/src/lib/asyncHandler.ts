import type { RequestHandler } from 'express';

/** 包裹异步控制器，把 rejected promise 转发给全局错误处理中间件。 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
