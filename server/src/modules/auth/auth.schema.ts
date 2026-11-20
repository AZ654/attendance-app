import { z } from 'zod';

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
