import { z } from 'zod';
import { companyCodeSchema, slugify } from '../common/schemas';

const companyName = z.string().trim().min(2).max(120);
const rif = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[JGVEP]-?\d{8}-?\d$/, 'RIF inválido (ej. J-12345678-9)');

const withSlug = <T extends { name: string; code?: string }>({
  code,
  ...rest
}: T) => ({ ...rest, slug: code ?? slugify(rest.name) });

const hasSlug = { message: 'Indica un código de empresa', path: ['code'] };

/** El código es opcional: sale del nombre. */
export const createGroupSchema = z
  .object({ name: companyName, code: companyCodeSchema.optional() })
  .transform(withSlug)
  .refine((value) => value.slug.length > 0, hasSlug);

export const createCompanySchema = z
  .object({
    name: companyName,
    code: companyCodeSchema.optional(),
    rif: rif.optional(),
  })
  .transform(withSlug)
  .refine((value) => value.slug.length > 0, hasSlug);

export const updateCompanySchema = z
  .object({ name: companyName, rif: rif.nullable(), active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios');

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
