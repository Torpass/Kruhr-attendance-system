import { z } from 'zod';
import {
  cedulaSchema,
  localDateSchema,
  personNameSchema,
  pinSchema,
} from '../common/schemas';

export const createEmployeeSchema = z.object({
  name: personNameSchema,
  cedula: cedulaSchema,
  pin: pinSchema,
  hiredOn: localDateSchema.optional(),
});

export const updateEmployeeSchema = z
  .object({
    name: personNameSchema,
    pin: pinSchema,
    active: z.boolean(),
    hiredOn: localDateSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
