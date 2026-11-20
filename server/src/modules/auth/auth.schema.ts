import { z } from 'zod';

/** 电脑端账号统一小写，前后空格不影响登录。 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-z0-9_-]+$/i, '账号仅支持字母、数字、下划线和连字符');
const passwordSchema = z.string().min(8).max(128);

export const passwordLoginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export const createAccountSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  nickname: z.string().trim().max(64).optional(),
  role: z.enum(['employee', 'admin']).optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const devLoginSchema = z.object({
  openid: z.string().min(1).max(128).optional(),
  nickname: z.string().max(64).optional(),
});

export const wechatCallbackSchema = z.object({
  code: z.string().min(1).max(256),
  state: z.string().max(256).optional(),
});

export const loginByCodeSchema = z.object({
  code: z.string().min(1).max(256),
  state: z.string().max(256).optional(),
});
