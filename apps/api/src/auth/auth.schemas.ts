import { z } from 'zod';

export const staffLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

/** Cédula: acepta "V-12.345.678" y deja solo los dígitos. */
export const cedulaSchema = z
  .string()
  .max(20)
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{5,10}$/, 'Cédula inválida'));

/**
 * El colaborador entra con cédula y PIN. Si trabaja en varias empresas, la API devuelve
 * las opciones y el cliente repite el login con `companyId`.
 */
export const employeeLoginSchema = z.object({
  cedula: cedulaSchema,
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN tiene de 4 a 6 dígitos'),
  companyId: z.uuid().optional(),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type EmployeeLoginInput = z.infer<typeof employeeLoginSchema>;
