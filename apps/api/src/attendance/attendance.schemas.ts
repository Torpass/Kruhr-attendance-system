import { z } from 'zod';
import { localDateSchema } from '../common/schemas';

const instant = z.iso
  .datetime({ offset: true, error: 'Fecha y hora ISO 8601 con zona' })
  .transform((value) => new Date(value));

const reason = z
  .string()
  .trim()
  .min(5, 'El motivo es obligatorio (al menos 5 caracteres)')
  .max(500);

export const correctShiftSchema = z
  .object({ clockIn: instant.optional(), clockOut: instant.optional(), reason })
  .refine((value) => value.clockIn || value.clockOut, 'No hay cambios');

export const createShiftSchema = z.object({
  employeeId: z.uuid(),
  clockIn: instant,
  clockOut: instant,
  reason,
});

/** Rango inclusivo de fechas locales, como mucho 62 días. */
export const dateRangeSchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine(({ from, to }) => from <= to, '`from` debe ser anterior a `to`')
  .refine(
    ({ from, to }) => Date.parse(to) - Date.parse(from) <= 61 * 86_400_000,
    'El rango no puede pasar de 62 días',
  );

export const shiftsQuerySchema = dateRangeSchema.and(
  z.object({ employeeId: z.uuid().optional() }),
);

export type CorrectShiftInput = z.infer<typeof correctShiftSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type ShiftsQuery = z.infer<typeof shiftsQuerySchema>;
