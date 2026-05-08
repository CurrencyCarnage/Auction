import { z } from 'zod';

export function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
    return null;
  }
  return parsed.data;
}

export const loginSchema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });
export const hoursSchema = z.object({ hours: z.coerce.number().int().min(1).max(72).default(8) });
export const lotSchema = z.object({
  id: z.string().trim().max(80).optional().or(z.literal('')),
  brand: z.string().trim().min(1).max(80).default('SHACMAN'),
  model: z.string().trim().min(1).max(140),
  type: z.string().trim().min(1).max(100).default('Heavy Truck'),
  location: z.string().trim().min(1).max(120).default('Tbilisi Yard'),
  year: z.coerce.number().int().min(1980).max(2100).default(new Date().getFullYear()),
  hours: z.string().trim().min(1).max(80).default('0 h'),
  increment: z.coerce.number().positive().max(1000000).default(1000),
  buyNow: z.coerce.number().min(0).max(100000000).default(0),
  current: z.coerce.number().min(0).max(100000000).default(0),
  endAt: z.string().optional(),
  endAtMs: z.coerce.number().optional(),
  imageKey: z.string().trim().max(120).optional(),
  buyRequested: z.boolean().optional(),
});
export const lotStatusSchema = z.object({ status: z.enum(['draft', 'scheduled', 'live', 'ended', 'pending_approval', 'approved', 'cancelled']) });
export const bidSchema = z.object({ lotId: z.string().trim().min(1).max(120), amount: z.coerce.number().positive().max(100000000) });
export const proxySchema = z.object({ lotId: z.string().trim().min(1).max(120), max: z.coerce.number().positive().max(100000000) });
export const lotIdSchema = z.object({ lotId: z.string().trim().min(1).max(120) });
