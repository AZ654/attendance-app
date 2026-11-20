import { z } from 'zod';

export const savePhoneSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  consent: z.literal(true, { errorMap: () => ({ message: '需要确认知情同意' }) }),
});

export const saveRealnameSchema = z.object({
  realName: z.string().trim().min(2, '姓名至少 2 个字符').max(40, '姓名最多 40 个字符'),
  idCard: z.string().regex(/^[0-9]{17}[0-9Xx]$/, '身份证号格式不正确'),
  consent: z.literal(true, { errorMap: () => ({ message: '需要确认知情同意' }) }),
});
