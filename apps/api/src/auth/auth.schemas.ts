import { z } from 'zod';
import { cedulaSchema, personNameSchema, pinSchema } from '../common/schemas';

export const staffLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

/**
 * El colaborador entra con cédula y PIN. Si trabaja en varias empresas, la API devuelve
 * las opciones y el cliente repite el login con `companyId`.
 */
export const employeeLoginSchema = z.object({
  cedula: cedulaSchema,
  pin: pinSchema,
  companyId: z.uuid().optional(),
});

/** Código de empresa: minúsculas, números y guiones. Sale del nombre si no se indica. */
export const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

/** Registro público: crea el grupo, su primera empresa y el admin. */
export const registerSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    companyCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones')
      .max(40)
      .optional(),
    name: personNameSchema,
    email: z.email().trim().toLowerCase(),
    password: z.string().min(10, 'Al menos 10 caracteres').max(200),
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
