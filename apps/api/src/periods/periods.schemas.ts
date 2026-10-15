import { z } from 'zod';
import { dateRangeSchema } from '../attendance/attendance.schemas';
import { localDateSchema } from '../common/schemas';

/** Un período se pide por tipo (semana o quincena que contiene `date`) o por rango. */
export const periodQuerySchema = z.union([
  z.object({
    kind: z.enum(['week', 'first_half', 'second_half']),
    date: localDateSchema,
  }),
  dateRangeSchema,
]);

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
