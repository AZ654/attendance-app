import { z } from 'zod';

export const grantConsentSchema = z.object({
  acknowledged: z.literal(true, { errorMap: () => ({ message: '需要确认已阅读并同意告知内容' }) }),
});
