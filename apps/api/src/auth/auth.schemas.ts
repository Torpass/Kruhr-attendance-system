import { z } from 'zod';
import {
  cedulaSchema,
  companyCodeSchema,
  passwordSchema,
  personNameSchema,
  slugify,
} from '../common/schemas';

// Al entrar no se exige el formato de una contraseña nueva: las reglas pueden cambiar
// y las claves ya guardadas deben seguir sirviendo.
const currentPasswordSchema = z.string().min(1).max(200);

export const staffLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: currentPasswordSchema,
});

/**
 * El colaborador entra con cédula y contraseña. Si trabaja en varias empresas, la API
 * devuelve las opciones y el cliente repite el login con `companyId`.
 */
export const employeeLoginSchema = z.object({
  cedula: cedulaSchema,
  password: currentPasswordSchema,
  companyId: z.uuid().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

/** Registro público: crea el grupo, su primera empresa y el admin. */
export const registerSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    companyCode: companyCodeSchema.optional(),
    name: personNameSchema,
    email: z.email().trim().toLowerCase(),
    password: passwordSchema,
  })
  .transform(({ companyCode, ...rest }) => ({
    ...rest,
    companyCode: companyCode ?? slugify(rest.companyName),
  }))
  .refine((value) => value.companyCode.length > 0, {
    message: 'Indica un código de empresa',
    path: ['companyCode'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type EmployeeLoginInput = z.infer<typeof employeeLoginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
