import { z } from 'zod';

export const staffLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const employeeLoginSchema = z.object({
  company: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Código de empresa inválido'),
  // Acepta "V-12.345.678" y guarda solo los dígitos.
  cedula: z
    .string()
    .max(20)
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{5,10}$/, 'Cédula inválida')),
  pin: z.string().regex(/^\d{4,6}$/, 'El PIN tiene de 4 a 6 dígitos'),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type EmployeeLoginInput = z.infer<typeof employeeLoginSchema>;
