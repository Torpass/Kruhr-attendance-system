import { DEFAULT_POLICY, OVERTIME_MODES, validatePolicy } from '@marcaje/core';
import { z } from 'zod';
import { code, name } from '../payroll/payroll.schemas';

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora en formato HH:MM (ej. 08:00)');
const minutes = (max: number) => z.number().int().min(0).max(max);

/** Campos de la política (`WorkPolicy` en core). */
const policyFields = {
  overtimeMode: z.enum(OVERTIME_MODES),
  ordinaryMinutes: minutes(1440).min(1),
  days: z
    .array(z.object({ start: time, end: time }).nullable())
    .length(7, 'Van los 7 días, de lunes a domingo')
    .nullable(),
  breakMinutes: minutes(1440),
  breakAfterMinutes: minutes(1440),
  nightStart: time,
  nightEnd: time,
  weeklyOvertimeAlertMinutes: minutes(7 * 1440),
};

/** Lo que no venga toma el valor de la política por defecto (la del enunciado). */
export const createScheduleSchema = z
  .object({
    code,
    name,
    overtimeMode: policyFields.overtimeMode.default(
      DEFAULT_POLICY.overtimeMode,
    ),
    ordinaryMinutes: policyFields.ordinaryMinutes.default(
      DEFAULT_POLICY.ordinaryMinutes,
    ),
    days: policyFields.days.default(null),
    breakMinutes: policyFields.breakMinutes.default(
      DEFAULT_POLICY.breakMinutes,
    ),
    breakAfterMinutes: policyFields.breakAfterMinutes.default(
      DEFAULT_POLICY.breakAfterMinutes,
    ),
    nightStart: policyFields.nightStart.default(DEFAULT_POLICY.nightStart),
    nightEnd: policyFields.nightEnd.default(DEFAULT_POLICY.nightEnd),
    weeklyOvertimeAlertMinutes: policyFields.weeklyOvertimeAlertMinutes.default(
      DEFAULT_POLICY.weeklyOvertimeAlertMinutes,
    ),
  })
  .superRefine((policy, ctx) => {
    for (const message of validatePolicy(policy))
      ctx.addIssue({ code: 'custom', message, path: ['policy'] });
  });

/** Cambios parciales: la política completa se valida en el servicio, ya combinada. */
export const updateScheduleSchema = z
  .object({ name, active: z.boolean(), ...policyFields })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
