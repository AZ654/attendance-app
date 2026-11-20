/** 类型化应用错误。客户端只会看到规范化结构，不暴露堆栈与内部细节。 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }
}

export class BadRequestError extends AppError {
  constructor(message = '请求参数无效', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = '请先登录') {
    super(401, 'UNAUTHORIZED', message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = '没有权限执行此操作') {
    super(403, 'FORBIDDEN', message);
  }
}
export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, 'NOT_FOUND', message);
  }
}
export class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(409, 'CONFLICT', message);
  }
}
export class TooManyRequestsError extends AppError {
  constructor(message = '操作过于频繁，请稍后再试') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}
export class ConsentRequiredError extends AppError {
  constructor(message = '需要先完成位置采集授权') {
    super(403, 'CONSENT_REQUIRED', message);
  }
}
export class ExternalServiceError extends AppError {
  constructor(message = '外部服务暂时不可用') {
    super(502, 'EXTERNAL_SERVICE_ERROR', message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
