import {
  AMOUNT_TYPES,
  QUANTITY_SOURCES,
  RULE_CONDITIONS,
  validateRules,
} from '@marcaje/core';
import { z } from 'zod';
import { localDateSchema } from '../common/schemas';
import { periodQuerySchema } from '../periods/periods.schemas';

export const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9_]{0,29}$/,
    'Código en mayúsculas, números y _ (ej. HED)',
  );
export const name = z.string().trim().min(1).max(80);
const amount = z.number().finite().min(-1e11).max(1e11);

export const ruleSchema = z.object({
  code,
  name,
  sequence: z.number().int().min(0).max(9999),
  appearsOnPayslip: z.boolean().default(true),
  condition: z.enum(RULE_CONDITIONS).default('always'),
  quantitySource: z.enum(QUANTITY_SOURCES).default('one'),
  quantityCode: code.nullable().default(null),
  amountType: z.enum(AMOUNT_TYPES),
  amountFix: amount.nullable().default(null),
  baseCodes: z.array(code).max(30).nullable().default(null),
  amountCapParam: code.nullable().default(null),
  rate: z.number().finite().min(-1000).max(1000),
});

/** Las mismas reglas de consistencia que usa el motor al calcular. */
const rulesSchema = z
  .array(ruleSchema)
  .max(100)
  .superRefine((rules, ctx) => {
    for (const message of validateRules(rules))
      ctx.addIssue({ code: 'custom', message });
  });

const schedulePay = z.enum(['weekly', 'semi_monthly', 'monthly']);

export const createStructureSchema = z.object({
  code,
  name,
  schedulePay,
  rules: rulesSchema,
});

export const updateStructureSchema = z
  .object({ name, schedulePay, active: z.boolean(), rules: rulesSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export const parameterValueSchema = z.object({
  dateFrom: localDateSchema,
  value: amount,
});

export const createParameterSchema = z
  .object({ code, name })
  .and(parameterValueSchema);

export const inputTypeSchema = z.object({ code, name });

export const createContractSchema = z
  .object({
    structureId: z.uuid(),
    /** Horario con el que se calculan sus turnos; sin horario, la política por defecto. */
    scheduleId: z.uuid().nullable().default(null),
    wage: z.number().positive().max(1e11),
    dateStart: localDateSchema,
    dateEnd: localDateSchema.nullable().default(null),
  })
  .refine((c) => c.dateEnd === null || c.dateEnd >= c.dateStart, {
    message: 'El fin debe ser igual o posterior al inicio',
    path: ['dateEnd'],
  });

export const endContractSchema = z.object({ dateEnd: localDateSchema });

/** Nuevo horario desde una fecha: cierra el contrato el día anterior y abre uno igual. */
export const changeScheduleSchema = z.object({
  scheduleId: z.uuid().nullable(),
  dateFrom: localDateSchema,
});

export const createRunSchema = z
  .object({ structureId: z.uuid(), name: z.string().trim().max(80).optional() })
  .and(periodQuerySchema);

export const payslipInputsSchema = z.object({
  inputs: z.record(code, amount).refine((r) => Object.keys(r).length <= 30),
});

/** Acciones sobre un lote: calculado → validado → pagado, o anulado. */
export const runActionSchema = z.enum([
  'recompute',
  'validate',
  'pay',
  'cancel',
]);

export type RunAction = z.infer<typeof runActionSchema>;
export type RuleInput = z.infer<typeof ruleSchema>;
export type CreateStructureInput = z.infer<typeof createStructureSchema>;
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;
export type CreateParameterInput = z.infer<typeof createParameterSchema>;
export type ParameterValueInput = z.infer<typeof parameterValueSchema>;
export type InputTypeInput = z.infer<typeof inputTypeSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ChangeScheduleInput = z.infer<typeof changeScheduleSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
export type PayslipInputsInput = z.infer<typeof payslipInputsSchema>;
