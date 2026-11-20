import { z } from 'zod';

export const reportLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).nullable().optional(),
  source: z.enum(['gps', 'network', 'manual']),
  mode: z.enum(['active', 'auto']),
  address: z.string().max(300).nullable().optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
