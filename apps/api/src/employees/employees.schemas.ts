import { z } from 'zod';
import {
  cedulaSchema,
  localDateSchema,
  passwordSchema,
  personNameSchema,
} from '../common/schemas';

export const createEmployeeSchema = z.object({
  name: personNameSchema,
  cedula: cedulaSchema,
  password: passwordSchema,
  hiredOn: localDateSchema.optional(),
});

export const updateEmployeeSchema = z
  .object({
    name: personNameSchema,
    active: z.boolean(),
    hiredOn: localDateSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export const setEmployeePasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type SetEmployeePasswordInput = z.infer<
  typeof setEmployeePasswordSchema
>;
